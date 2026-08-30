/*
 * SettleMate AI — Production Database Hot Backup Utility
 *
 * Captures consistent, atomic point-in-time snapshots of both SQLite stores
 * (`dev.db` and `settlemate.db`) without locking readers or interrupting active
 * reconciliation workloads.
 */

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import { getDatabasePath } from "../src/lib/storage/sqlite-db";

export interface BackupManifest {
  timestamp: string;
  backupId: string;
  files: Array<{
    name: string;
    sourcePath: string;
    backupPath: string;
    sizeBytes: number;
    sha256: string;
    integrity: "PASSED" | "FAILED";
    tableCount: number;
  }>;
  totalDurationMs: number;
  status: "SUCCESS" | "FAILED";
}

function getPrismaDbFilePath(): string {
  const rawUrl = process.env.DATABASE_URL || "file:./dev.db";
  const cleanPath = rawUrl.replace(/^file:/, "");
  if (path.isAbsolute(cleanPath)) {
    return cleanPath;
  }
  return path.resolve(process.cwd(), cleanPath);
}

function sha256File(filePath: string): string {
  const data = fs.readFileSync(filePath);
  return createHash("sha256").update(data).digest("hex");
}

export async function createDatabaseBackup(customBackupDir?: string): Promise<BackupManifest> {
  const startTime = Date.now();
  const timestampStr = new Date().toISOString().replace(/[:.]/g, "-");
  const backupId = `backup_${timestampStr}`;

  const baseDir = customBackupDir || path.join(process.cwd(), "data", "backups", backupId);
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }

  const targets = [
    { name: "settlemate.db", path: getDatabasePath() },
    { name: "dev.db", path: getPrismaDbFilePath() },
  ];

  const backupFiles: BackupManifest["files"] = [];

  for (const target of targets) {
    if (!fs.existsSync(target.path)) {
      console.warn(`[Backup] Source file not found, skipping: ${target.path}`);
      continue;
    }

    const destPath = path.join(baseDir, target.name);
    console.log(`→ Creating hot snapshot of ${target.name}...`);

    // Open connection to source and execute hot backup
    const srcDb = new Database(target.path, { readonly: true });
    await srcDb.backup(destPath);
    srcDb.close();

    // Verify integrity of the backup copy
    const backupDb = new Database(destPath, { readonly: true });
    const integrityRow = backupDb.pragma("integrity_check") as Array<{ integrity_check: string }>;
    const isIntegrityOk = integrityRow?.[0]?.integrity_check === "ok";

    const tables = backupDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;
    backupDb.close();

    const stat = fs.statSync(destPath);
    const hash = sha256File(destPath);

    backupFiles.push({
      name: target.name,
      sourcePath: target.path,
      backupPath: destPath,
      sizeBytes: stat.size,
      sha256: hash,
      integrity: isIntegrityOk ? "PASSED" : "FAILED",
      tableCount: tables.length,
    });

    console.log(`✓ ${target.name}: ${stat.size} bytes, SHA256: ${hash.slice(0, 16)}..., Integrity: ${isIntegrityOk ? "OK" : "FAILED"}`);
  }

  const totalDurationMs = Date.now() - startTime;
  const allPassed = backupFiles.length > 0 && backupFiles.every((f) => f.integrity === "PASSED");

  const manifest: BackupManifest = {
    timestamp: new Date().toISOString(),
    backupId,
    files: backupFiles,
    totalDurationMs,
    status: allPassed ? "SUCCESS" : "FAILED",
  };

  const manifestPath = path.join(baseDir, "backup-manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  console.log(`✓ Backup manifest written to: ${manifestPath}`);

  return manifest;
}

async function main() {
  console.log("========================================================");
  console.log("   SETTLEMATE AI — SQLITE HOT BACKUP UTILITY");
  console.log("========================================================");

  const manifest = await createDatabaseBackup();

  console.log("========================================================");
  console.log(` ✅ BACKUP COMPLETE: ${manifest.status} (${manifest.totalDurationMs}ms)`);
  console.log(`    Backup ID: ${manifest.backupId}`);
  console.log(`    Files Backed Up: ${manifest.files.length}`);
  console.log("========================================================\n");

  if (manifest.status !== "SUCCESS") {
    process.exit(1);
  }
}

if (require.main === module || process.argv[1]?.includes("backup.ts")) {
  main().catch((err) => {
    console.error("Backup failed:", err);
    process.exit(1);
  });
}
