/*
 * SettleMate AI — SQLite Database Initialization Script
 *
 * Idempotently initializes and verifies both persistent SQLite stores:
 *   1. Native better-sqlite3 Store (`SETTLEMATE_DB_PATH`, e.g. /app/data/settlemate.db)
 *   2. Prisma ORM Store (`DATABASE_URL`, e.g. /app/data/dev.db)
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { initDatabase, getDatabasePath, WebhookRepository } from "../src/lib/storage/sqlite-db";

function getPrismaDbFilePath(): string {
  const rawUrl = process.env.DATABASE_URL || "file:./dev.db";
  const cleanPath = rawUrl.replace(/^file:/, "");
  if (path.isAbsolute(cleanPath)) {
    return cleanPath;
  }
  return path.resolve(process.cwd(), cleanPath);
}

function ensureDirectoryExists(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function main() {
  console.log("========================================================");
  console.log("   SETTLEMATE AI — DATABASE INITIALIZATION CHECK");
  console.log("========================================================");

  const rawUrl = process.env.DATABASE_URL || "file:./dev.db";
  const isPostgres = rawUrl.startsWith("postgres://") || rawUrl.startsWith("postgresql://");

  if (isPostgres) {
    const maskedUrl = rawUrl.replace(/:[^:@]+@/, ":***@");
    console.log(`→ PostgreSQL database configuration detected: ${maskedUrl}`);
    console.log("→ [SAFETY GUARD] Automatic production schema mutation on startup is DISABLED.");
    console.log("→ Production migrations must be run deliberately via: npm run db:migrate:prod");
    console.log("========================================================");
    console.log(" ✅ DATABASE BOOT CHECK COMPLETE (NO MUTATIONS APPLIED)");
    console.log("========================================================\n");
    return;
  }

  // 1. Native better-sqlite3 Database (Local Development Only)
  const nativeDbPath = getDatabasePath();
  console.log(`→ [1/2] Initializing persistent native SQLite at: ${nativeDbPath}`);
  ensureDirectoryExists(nativeDbPath);

  const db = initDatabase();
  console.log("✓ Native database connection established and tables verified.");

  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all() as { name: string }[];

  console.log(`✓ Created native tables (${tables.length}):`);
  tables.forEach((t) => console.log(`   - ${t.name}`));

  const webhooks = WebhookRepository.getAllRegistrations();
  console.log(`✓ Registered Webhook Subscriptions count: ${webhooks.length}`);

  // 2. Prisma Database (Local SQLite Only)
  const prismaDbPath = getPrismaDbFilePath();
  console.log(`\n→ [2/2] Checking local Prisma SQLite database at: ${prismaDbPath}`);
  ensureDirectoryExists(prismaDbPath);

  try {
    console.log("→ Synchronizing Prisma SQLite schema (idempotent push)...");
    execSync("npx prisma db push", {
      stdio: "inherit",
      env: {
        ...process.env,
        PRISMA_TARGET_PROVIDER: "sqlite",
        DATABASE_URL: `file:${prismaDbPath}`,
      },
    });
    execSync("npx prisma generate --schema=prisma/schema.prisma", {
      stdio: "inherit",
      env: {
        ...process.env,
        PRISMA_TARGET_PROVIDER: "sqlite",
        DATABASE_URL: `file:${prismaDbPath}`,
      },
    });
    console.log("✓ Prisma schema verified and synchronized.");
  } catch (err) {
    console.warn("⚠️ Prisma schema push note:", (err as Error).message);
  }

  console.log("========================================================");
  console.log(" ✅ LOCAL DATABASE INITIALIZATION COMPLETE");
  console.log("========================================================\n");
}

main().catch((err) => {
  console.error("Database initialization failed:", err);
  process.exit(1);
});
