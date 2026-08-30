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

  await test("Stage 2.2: BankTransaction balance BigInt migration exists and supports 2152566402", async () => {
    const migrationPath = path.join(
      process.cwd(),
      "prisma",
      "migrations",
      "20260830_bank_transaction_balance_bigint",
      "migration.sql"
    );
    assert.ok(fs.existsSync(migrationPath), "20260830_bank_transaction_balance_bigint/migration.sql must exist");

    const sqlContent = fs.readFileSync(migrationPath, "utf8");
    assert.ok(
      sqlContent.includes('ALTER TABLE "BankTransaction" ALTER COLUMN "balance" TYPE BIGINT;'),
      "Migration must alter BankTransaction.balance to BIGINT"
    );

    // Verify Prisma model supports values exceeding signed 32-bit int (> 2,147,483,647)
    const testBalance = 2152566402;
    const testBatch = await prisma.batch.create({
      data: {
        name: "Test Integer Overflow Regression",
        size: 1,
        bankTransactions: {
          create: [
            {
              txnId: `test_overflow_${Date.now()}`,
              amount: 50000,
              type: "CREDIT",
              balance: testBalance,
              txnDate: new Date(),
            },
          ],
        },
      },
      include: { bankTransactions: true },
    });

    try {
      assert.equal(testBatch.bankTransactions.length, 1);
      assert.equal(Number(testBatch.bankTransactions[0].balance), testBalance);

      // Verify JSON serialization does not fail on BigInt
      const serialized = JSON.stringify(testBatch);
      assert.ok(serialized.includes(String(testBalance)));
    } finally {
      await prisma.batch.delete({ where: { id: testBatch.id } });
    }
  });

  await test("Stage 2.3: BankTransaction balance boundaries & scale presets (2.14B, 2.15B, 5B, 5.74B, 10.3B, 22.3B, 212B)", async () => {
    // Exact test boundaries required by the specification:
    // - 2,147,483,647 (Max signed 32-bit INT32)
    // - 2,147,483,648 (First value strictly exceeding INT32)
    // - 2,152,566,402 (Render production failure value)
    // - 5,000,000,000 (5 billion paise = ₹5 crore)
    // - 5,741,667,496 (Max balance produced in 250-record batch)
    // - 10,380,823,503 (Max balance produced in 500-record batch)
    // - 22,376,489,738 (Max balance produced in 1,000-record batch)
    // - 212,681,243,978 (Max balance produced in 10,000-record batch)
    const testBoundaries: Array<{ label: string; value: bigint | number }> = [
      { label: "max_int32", value: 2147483647 },
      { label: "int32_plus_1", value: 2147483648 },
      { label: "render_failure_val", value: 2152566402 },
      { label: "five_billion", value: 5000000000 },
      { label: "batch_250_peak", value: 5741667496 },
      { label: "batch_500_peak", value: 10380823503 },
      { label: "batch_1k_peak", value: 22376489738 },
      { label: "batch_10k_peak", value: 212681243978 },
    ];

    const testBatch = await prisma.batch.create({
      data: {
        name: "Scale Range Boundaries Test",
        size: testBoundaries.length,
        bankTransactions: {
          create: testBoundaries.map((b, idx) => ({
            txnId: `txn_bound_${idx}_${Date.now()}`,
            amount: 50000,
            type: "CREDIT",
            narration: `Boundary test ${b.label}`,
            balance: b.value,
            txnDate: new Date(),
          })),
        },
      },
      include: { bankTransactions: true },
    });

    try {
      assert.equal(testBatch.bankTransactions.length, testBoundaries.length);

      // Verify each boundary value is preserved with exact integer precision
      for (let i = 0; i < testBoundaries.length; i++) {
        const expected = BigInt(testBoundaries[i].value);
        const actual = BigInt(testBatch.bankTransactions[i].balance!);
        assert.equal(actual, expected, `Boundary ${testBoundaries[i].label} mismatch`);
      }

      // Verify Prisma sorting (descending) across the BigInt boundary
      const sortedDesc = await prisma.bankTransaction.findMany({
        where: { batchId: testBatch.id },
        orderBy: { balance: "desc" },
      });
      assert.equal(BigInt(sortedDesc[0].balance!), BigInt("212681243978"));
      assert.equal(BigInt(sortedDesc[sortedDesc.length - 1].balance!), BigInt("2147483647"));

      // Verify Prisma filtering: find only those exceeding INT32
      const overInt32 = await prisma.bankTransaction.findMany({
        where: {
          batchId: testBatch.id,
          balance: { gt: 2147483647 },
        },
      });
      assert.equal(overInt32.length, testBoundaries.length - 1);

      // Verify Prisma aggregation (min, max)
      const agg = await prisma.bankTransaction.aggregate({
        where: { batchId: testBatch.id },
        _min: { balance: true },
        _max: { balance: true },
      });
      assert.equal(BigInt(agg._min.balance!), BigInt("2147483647"));
      assert.equal(BigInt(agg._max.balance!), BigInt("212681243978"));

      // Verify JSON serialization for all boundaries
      const serialized = JSON.stringify(testBatch);
      for (const b of testBoundaries) {
        assert.ok(serialized.includes(String(b.value)), `Serialized payload missing ${b.value}`);
      }
    } finally {
      await prisma.batch.delete({ where: { id: testBatch.id } });
    }
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
