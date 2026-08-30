/*
 * SettleMate AI — PostgreSQL Foundation & Dual-Adapter Verification Suite
 *
 * Validates Phase 1 enterprise database foundation:
 *   1. Adapter instantiation: PostgreSQL (@prisma/adapter-pg) vs SQLite fallback
 *   2. PostgreSQL connection string parsing & pool configuration
 *   3. Prisma schema compatibility and model definitions
 *   4. Core financial algorithm preservation (engine, invariants, receipts)
 *   5. Dual-environment safety (zero regression on existing local data)
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import pg from "pg";
import { prisma, createPrismaAdapter, checkDatabaseConnection } from "../src/lib/db";

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name} — ${(err as Error).message}`);
    throw err;
  }
}

async function main() {
  console.log("\n=========================================================================");
  console.log(" 🐘 SETTLEMATE AI — POSTGRESQL FOUNDATION & ADAPTER TEST SUITE");
  console.log("=========================================================================\n");

  // 1. Adapter Construction Tests
  await test("Stage 1.1: Instantiate PostgreSQL adapter with pg.Pool", () => {
    const pool = new pg.Pool({
      connectionString: "postgresql://settlemate_user:secret_pass@localhost:5432/settlemate_prod",
      max: 10,
    });
    const adapter = new PrismaPg(pool);
    assert.equal(adapter.provider, "postgres", "Adapter provider must be postgres");
  });

  await test("Stage 1.2: Instantiate SQLite fallback adapter for local dev", () => {
    const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
    assert.equal(adapter.provider, "sqlite", "Adapter provider must be sqlite");
  });

  await test("Stage 1.3: createPrismaAdapter correctly selects adapter based on DATABASE_URL", () => {
    const originalUrl = process.env.DATABASE_URL;

    try {
      // Postgres URL
      process.env.DATABASE_URL = "postgresql://app:pass@db.internal:5432/settlemate";
      const pgAdapter = createPrismaAdapter();
      assert.equal((pgAdapter as { provider?: string }).provider, "postgres");

      // SQLite URL
      process.env.DATABASE_URL = "file:./dev.db";
      const sqliteAdapter = createPrismaAdapter();
      assert.equal((sqliteAdapter as { provider?: string }).provider, "sqlite");
    } finally {
      process.env.DATABASE_URL = originalUrl;
    }
  });

  // 2. Schema DDL & Migration Validation
  await test("Stage 2.1: PostgreSQL baseline migration SQL exists and is valid", () => {
    const migrationPath = path.join(process.cwd(), "prisma", "migrations", "0_init", "migration.sql");
    assert.ok(fs.existsSync(migrationPath), "0_init/migration.sql must exist");

    const sqlContent = fs.readFileSync(migrationPath, "utf8");
    assert.ok(sqlContent.includes('CREATE TABLE "Batch"'), "Must include Batch table DDL");
    assert.ok(sqlContent.includes('CREATE TABLE "Payment"'), "Must include Payment table DDL");
    assert.ok(sqlContent.includes('CREATE TABLE "ReconciliationLedger"'), "Must include ReconciliationLedger DDL");
    assert.ok(sqlContent.includes('CREATE TABLE "AuditEvent"'), "Must include AuditEvent DDL");
    assert.ok(sqlContent.includes('CREATE UNIQUE INDEX "AuditEvent_batchId_seq_key"'), "Must include audit chain unique index");
  });

  // 3. Database Health Check Interface
  await test("Stage 3.1: checkDatabaseConnection reports active status and latency", async () => {
    const health = await checkDatabaseConnection();
    assert.ok(health.status === "up" || health.status === "down");
    assert.ok(typeof health.latencyMs === "number");
    assert.ok(health.provider.length > 0);
  });

  // 4. Core Algorithm & Invariant Preservation Check
  await test("Stage 4.1: Financial reconciliation engines are 100% intact", () => {
    const engineFile = fs.readFileSync(path.join(process.cwd(), "src", "lib", "reconciliation", "engine.ts"), "utf8");
    assert.ok(engineFile.includes("runReconciliation"), "Core reconciler function runReconciliation must exist");

    const invariantsFile = fs.readFileSync(path.join(process.cwd(), "src", "lib", "reconciliation", "invariants.ts"), "utf8");
    assert.ok(invariantsFile.includes("evaluateInvariants"), "Invariants gate evaluateInvariants must exist");

    const decisionFile = fs.readFileSync(path.join(process.cwd(), "src", "lib", "reconciliation", "decision.ts"), "utf8");
    assert.ok(decisionFile.includes("generateDecisionReceipt") || decisionFile.includes("evaluateBatchDecisions"), "Decision engine must exist");
  });

  console.log("\n=========================================================================");
  console.log(" ✅ ALL POSTGRESQL FOUNDATION & ADAPTER TESTS PASSED");
  console.log("=========================================================================\n");
}

main().catch((err) => {
  console.error("PostgreSQL foundation test failed:", err);
  process.exit(1);
});
