/*
 * SettleMate AI — Production Persistence, WAL & Cold Restart Integration Test Suite
 *
 * Validates that all domain state, decision receipts, webhook registrations, and
 * double-entry ledgers survive a complete process termination and cold restart
 * when mounted on persistent storage.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash, randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import {
  initDatabase,
  closeDatabase,
  JobRepository,
  DecisionReceiptRepository,
  WebhookRepository,
  AiClaimLogRepository,
  AuditLedgerRepository,
  type StoredReconciliationJob,
  type StoredDecisionReceipt,
} from "../src/lib/storage/sqlite-db";
import { createDatabaseBackup } from "../scripts/backup";
import { restoreDatabaseFromBackup } from "../scripts/restore";

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
  console.log(" 🧪 SETTLEMATE AI — PRODUCTION PERSISTENCE & COLD RESTART TESTS");
  console.log("=========================================================================\n");

  const testDir = path.join(os.tmpdir(), `settlemate-persist-test-${Date.now()}`);
  fs.mkdirSync(testDir, { recursive: true });

  const testDbPath = path.join(testDir, "settlemate.db");
  const originalDbPathEnv = process.env.SETTLEMATE_DB_PATH;
  process.env.SETTLEMATE_DB_PATH = testDbPath;

  try {
    // 1. Initial Creation on Fresh Directory
    const testJobId = `job_persist_test_${Date.now()}`;
    const testReceiptId = `rcpt_persist_test_${Date.now()}`;
    const testWebhookId = `wh_persist_test_${Date.now()}`;
    const sampleHash = createHash("sha256").update("test_financial_batch_data_2026").digest("hex");

    await test("Stage 1: Initialize database and write state to disk", async () => {
      const db = initDatabase(testDbPath);
      assert.ok(db, "Database handle acquired");

      // Verify WAL mode is active
      const journalMode = db.pragma("journal_mode") as Array<{ journal_mode: string }>;
      assert.equal(journalMode[0]?.journal_mode, "wal", "Database must be in WAL mode");

      // Save a reconciliation job
      const job: StoredReconciliationJob = {
        jobId: testJobId,
        status: "COMPLETED",
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        batchSize: 250,
        summary: JSON.stringify({ autoMatched: 103, exception: 147, total: 250 }),
        receipt: JSON.stringify({ rootHash: sampleHash, algorithm: "SHA256-MERKLE-DAG" }),
      };
      JobRepository.save(job);

      // Save a Decision Receipt
      const receipt: StoredDecisionReceipt = {
        receiptId: testReceiptId,
        jobId: testJobId,
        rootHash: sampleHash,
        leafCount: 250,
        algorithm: "SHA256-MERKLE-DAG",
        timestamp: new Date().toISOString(),
        fingerprint: sampleHash.slice(0, 32),
        signature: `${sampleHash}:sig`,
        createdAt: new Date().toISOString(),
      };
      DecisionReceiptRepository.save(receipt);

      // Save a Webhook registration
      WebhookRepository.saveRegistration({
        id: testWebhookId,
        url: "https://erp.merchant.com/settlemate-hook",
        events: JSON.stringify(["reconciliation.completed"]),
        secret: "whsec_persistent_test_key",
        status: "ACTIVE",
        registeredAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Save Audit and AI Claim logs
      AuditLedgerRepository.log({
        id: `aud_${Date.now()}`,
        batchId: testJobId,
        actor: "controller_admin",
        action: "BATCH_FINALIZED",
        reason: "Test batch finalized with Merkle proof",
        createdAt: new Date().toISOString(),
      });

      AiClaimLogRepository.logAiCall({
        id: `ai_${Date.now()}`,
        timestamp: new Date().toISOString(),
        exceptionId: "EXP_TEST_01",
        model: "offline-fallback",
        inputHash: sampleHash,
        latencyMs: 4,
        status: "SUCCESS",
        createdAt: new Date().toISOString(),
      });

      // Confirm saved in active session
      assert.ok(JobRepository.get(testJobId), "Job should be queryable in active session");
      assert.ok(DecisionReceiptRepository.get(testReceiptId), "Receipt should be queryable in active session");
    });

    // 2. Simulate Process Termination and Cold Restart
    await test("Stage 2: Checkpoint WAL, close handles, simulate cold restart", async () => {
      // Checkpoint WAL and close connection handle
      const db = initDatabase(testDbPath);
      db.pragma("wal_checkpoint(TRUNCATE)");
      closeDatabase();

      // Ensure database file physically exists on disk
      assert.ok(fs.existsSync(testDbPath), "Physical .db file must exist on disk");
      const stat = fs.statSync(testDbPath);
      assert.ok(stat.size > 0, "Database file must have non-zero size");

      // Re-initialize from the persistent file (cold start)
      initDatabase(testDbPath);

      // Verify all records survived cold restart
      const restoredJob = JobRepository.get(testJobId);
      assert.ok(restoredJob, "Job must survive cold restart");
      assert.equal(restoredJob?.status, "COMPLETED");
      assert.equal(restoredJob?.batchSize, 250);

      const restoredReceipt = DecisionReceiptRepository.get(testReceiptId);
      assert.ok(restoredReceipt, "Decision Receipt must survive cold restart");
      assert.equal(restoredReceipt?.rootHash, sampleHash);

      const restoredWebhook = WebhookRepository.getRegistration(testWebhookId);
      assert.ok(restoredWebhook, "Webhook subscription must survive cold restart");
      assert.equal(restoredWebhook?.url, "https://erp.merchant.com/settlemate-hook");

      const audits = AuditLedgerRepository.getByBatchId(testJobId);
      assert.ok(audits.length >= 1, "Audit ledger entries must survive cold restart");
    });

    // 3. Hot Backup & Restore Test
    await test("Stage 3: Hot backup and verified restoration cycle", async () => {
      const backupDir = path.join(testDir, "backup_cycle");
      const manifest = await createDatabaseBackup(backupDir);
      assert.equal(manifest.status, "SUCCESS", "Backup must report SUCCESS");
      assert.ok(manifest.files.length >= 1, "Backup must include database files");

      // Modify the live database to simulate drift
      JobRepository.save({
        jobId: "job_drift_marker",
        status: "FAILED",
        createdAt: new Date().toISOString(),
        batchSize: 1,
      });
      assert.ok(JobRepository.get("job_drift_marker"), "Drift marker should exist in live DB");

      // Restore from backup
      closeDatabase();
      const restoredOk = await restoreDatabaseFromBackup(backupDir);
      assert.ok(restoredOk, "Restore must return true");

      // Re-open and verify original state restored and drift marker gone
      initDatabase(testDbPath);
      assert.ok(JobRepository.get(testJobId), "Original job must exist after restore");
      assert.equal(JobRepository.get("job_drift_marker"), null, "Drift marker must be removed after restore");
    });

  } finally {
    closeDatabase();
    process.env.SETTLEMATE_DB_PATH = originalDbPathEnv;
    // Clean up temporary test directory
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup
    }
  }

  console.log("\n=========================================================================");
  console.log(" ✅ ALL PRODUCTION PERSISTENCE & RESTORE TESTS PASSED");
  console.log("=========================================================================\n");
}

main().catch((err) => {
  console.error("Persistence test failed:", err);
  process.exit(1);
});
