/*
 * SettleMate AI — Safe & Deliberate PostgreSQL Migration Script
 *
 * Executes deliberate, idempotent, non-destructive migrations against
 * live PostgreSQL (Neon / RDS) without dropping tables or resetting data.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." npm run db:migrate:prod
 */

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

function maskDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.password = "***";
    return parsed.toString();
  } catch {
    return url.replace(/:[^:@]+@/, ":***@");
  }
}

async function executeSqlFile(pool: pg.Pool, filePath: string, label: string) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Migration file not found: ${filePath}`);
  }

  console.log(`\n→ Executing migration: ${label} (${path.basename(filePath)})...`);
  const sql = fs.readFileSync(filePath, "utf8");

  // Neon / Postgres execution: split statements or execute entire block
  const client = await pool.connect();
  try {
    // If the file contains DO $$ blocks (like 20260829_tenant_rls), execute as transaction block
    await client.query(sql);
    console.log(`✓ Successfully applied: ${label}`);
  } catch (err: unknown) {
    const pgError = err as { code?: string; message: string };
    // Postgres error code 42P07: relation already exists; 42710: duplicate object
    if (pgError.code === "42P07" || pgError.code === "42710") {
      console.log(`ℹ Notice: Tables/objects already exist in database (${pgError.message}). Schema preserved.`);
    } else {
      console.error(`✗ Error applying ${label}:`, pgError.message);
      throw err;
    }
  } finally {
    client.release();
  }
}

async function main() {
  console.log("=========================================================================");
  console.log(" 🐘 SETTLEMATE AI — DELIBERATE POSTGRESQL MIGRATION RUNNER");
  console.log("=========================================================================");

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl || (!databaseUrl.startsWith("postgres://") && !databaseUrl.startsWith("postgresql://"))) {
    console.error("✗ ERROR: DATABASE_URL environment variable must start with postgresql:// or postgres://");
    console.error("  Example: DATABASE_URL=\"postgresql://user:pass@ep-xyz.neon.tech/settlemate?sslmode=require\" npm run db:migrate:prod\n");
    process.exit(1);
  }

  console.log(`→ Target Database: ${maskDatabaseUrl(databaseUrl)}`);

  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });

  try {
    // 1. Test connectivity
    console.log("→ Testing PostgreSQL connectivity...");
    const pingResult = await pool.query("SELECT version(), current_database(), current_user;");
    const dbInfo = pingResult.rows[0];
    console.log(`✓ Connected to database: ${dbInfo.current_database} (User: ${dbInfo.current_user})`);
    console.log(`  Engine: ${dbInfo.version.split(" on ")[0]}`);

    // 2. Apply Migration 1: 0_init baseline schema
    const initPath = path.join(process.cwd(), "prisma", "migrations", "0_init", "migration.sql");
    await executeSqlFile(pool, initPath, "Baseline Schema (0_init)");

    // 3. Apply Migration 2: Multi-Tenant RLS & Isolation
    const rlsPath = path.join(process.cwd(), "prisma", "migrations", "20260829_tenant_rls", "migration.sql");
    await executeSqlFile(pool, rlsPath, "Tenant RLS & Operational Stores (20260829_tenant_rls)");

    // 4. Verify Tables & Row-Level Security Status
    console.log("\n→ Verifying database table inventory & Row-Level Security (RLS)...");
    const tableQuery = await pool.query(`
      SELECT
        c.relname as table_name,
        c.relrowsecurity as rls_enabled,
        c.relforcerowsecurity as rls_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY c.relname;
    `);

    console.log(`✓ Verified ${tableQuery.rows.length} production tables in public schema:`);
    let rlsCount = 0;
    for (const row of tableQuery.rows) {
      const rlsStatus = row.rls_enabled ? " [RLS ACTIVE]" : "";
      if (row.rls_enabled) rlsCount++;
      console.log(`   - ${row.table_name.padEnd(25)}${rlsStatus}`);
    }

    // 5. Verify Default Sandbox Tenant
    const tenantCheck = await pool.query(`SELECT id, name, status FROM "Tenant" WHERE id = 'tenant_default_sandbox' LIMIT 1;`);
    if (tenantCheck.rows.length > 0) {
      console.log(`✓ Default Sandbox Tenant verified: ${tenantCheck.rows[0].name} (${tenantCheck.rows[0].status})`);
    } else {
      console.warn("⚠️ Warning: Default Sandbox Tenant not found.");
    }

    console.log("\n=========================================================================");
    console.log(` ✅ POSTGRESQL MIGRATION COMPLETE: ${tableQuery.rows.length} tables verified, ${rlsCount} tables under RLS.`);
    console.log("    Existing data preserved. No destructive resets performed.");
    console.log("=========================================================================\n");
  } catch (err) {
    console.error("\n✗ PostgreSQL Migration Failed:", (err as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Migration runner uncaught error:", err);
  process.exit(1);
});
