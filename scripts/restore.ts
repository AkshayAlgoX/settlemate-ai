/*
 * SettleMate AI — Production Database Verified Restore Utility
 *
 * Restores both SQLite stores (`dev.db` and `settlemate.db`) from a validated
 * hot backup snapshot, verifying checksums and SQLite integrity before and after.
 */

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import { getDatabasePath } from "../src/lib/storage/sqlite-db";
import type { BackupManifest } from "./backup";

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

export async function restoreDatabaseFromBackup(backupDir: string): Promise<boolean> {
  console.log(`→ Initiating database restore from: ${backupDir}`);

  const manifestPath = path.join(backupDir, "backup-manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Invalid backup directory: missing backup-manifest.json in ${backupDir}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as BackupManifest;
  console.log(`✓ Loaded backup manifest (ID: ${manifest.backupId}, Created: ${manifest.timestamp})`);

  // Step 1: Pre-restore verification of backup archive
  console.log("→ [1/4] Verifying backup checksums and integrity...");
  for (const file of manifest.files) {
    if (!fs.existsSync(file.backupPath)) {
      throw new Error(`Backup file missing: ${file.backupPath}`);
    }

    const currentHash = sha256File(file.backupPath);
    if (currentHash !== file.sha256) {
      throw new Error(`Checksum mismatch for ${file.name}: expected ${file.sha256}, got ${currentHash}`);
    }

    const db = new Database(file.backupPath, { readonly: true });
    const integrityRow = db.pragma("integrity_check") as Array<{ integrity_check: string }>;
    db.close();

    if (integrityRow?.[0]?.integrity_check !== "ok") {
      throw new Error(`Integrity check failed on backup file: ${file.name}`);
    }
    console.log(`  ✓ ${file.name}: checksum and SQLite integrity verified.`);
  }

  // Step 2: Create pre-restore safety snapshot of live database
  console.log("→ [2/4] Creating pre-restore safety copy of live databases...");
  const safetyDir = path.join(process.cwd(), "data", "pre-restore-safety", `safety_${Date.now()}`);
  fs.mkdirSync(safetyDir, { recursive: true });

  const targetMapping: Record<string, string> = {
    "settlemate.db": getDatabasePath(),
    "dev.db": getPrismaDbFilePath(),
  };

  for (const [name, targetPath] of Object.entries(targetMapping)) {
    if (fs.existsSync(targetPath)) {
      fs.copyFileSync(targetPath, path.join(safetyDir, name));
    }
  }

  // Step 3: Perform atomic file restoration
  console.log("→ [3/4] Restoring database files...");
  for (const file of manifest.files) {
    const livePath = targetMapping[file.name] || file.sourcePath;
    const targetDir = path.dirname(livePath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Remove old WAL/SHM sidecars to prevent journal corruption on replacement
    const walPath = `${livePath}-wal`;
    const shmPath = `${livePath}-shm`;
    try {
      if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
    } catch {
      // Ignore if locked by another thread on Windows
    }
    try {
      if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
    } catch {
      // Ignore if locked by another thread on Windows
    }

    fs.copyFileSync(file.backupPath, livePath);
    console.log(`  ✓ Restored ${file.name} -> ${livePath}`);
  }

  // Step 4: Post-restore verification
  console.log("→ [4/4] Verifying restored live databases...");
  for (const [, livePath] of Object.entries(targetMapping)) {
    if (fs.existsSync(livePath)) {
      const db = new Database(livePath);
      db.pragma("journal_mode = WAL");
      const check = db.pragma("integrity_check") as Array<{ integrity_check: string }>;
      db.close();

      if (check?.[0]?.integrity_check !== "ok") {
        throw new Error(`Post-restore integrity check failed for ${livePath}`);
      }
    }
  }

  console.log("✓ All live databases successfully restored and integrity verified.");
  return true;
}

async function main() {
  const targetDir = process.argv[2];

  console.log("========================================================");
  console.log("   SETTLEMATE AI — SQLITE DATABASE RESTORE UTILITY");
  console.log("========================================================");

  let backupPath = targetDir;
  if (!backupPath) {
    // Look for latest backup in data/backups
    const backupsRoot = path.join(process.cwd(), "data", "backups");
    if (!fs.existsSync(backupsRoot)) {
      console.error("No backups directory found at:", backupsRoot);
      process.exit(1);
    }
    const entries = fs.readdirSync(backupsRoot).filter((e) => fs.statSync(path.join(backupsRoot, e)).isDirectory());
    if (entries.length === 0) {
      console.error("No backup snapshots found in:", backupsRoot);
      process.exit(1);
    }
    entries.sort().reverse();
    backupPath = path.join(backupsRoot, entries[0]);
    console.log(`→ Auto-selected latest backup: ${entries[0]}`);
  }

  await restoreDatabaseFromBackup(backupPath);

  console.log("========================================================");
  console.log(" ✅ DATABASE RESTORE COMPLETE");
  console.log("========================================================\n");
}

if (require.main === module || process.argv[1]?.includes("restore.ts")) {
  main().catch((err) => {
    console.error("Restore failed:", err);
    process.exit(1);
  });
}
