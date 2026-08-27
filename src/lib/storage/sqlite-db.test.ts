/*
 * SettleMate AI — SQLite Persistence & Crash-Recovery Unit Tests
 *
 * Verifies that jobs, decision receipts, webhooks, AI claim logs, audit entries,
 * and progress tracking persist reliably across simulated process restarts (close & reopen).
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  initDatabase,
  closeDatabase,
  JobRepository,
  DecisionReceiptRepository,
  WebhookRepository,
  AiClaimLogRepository,
  AuditLedgerRepository,
  VerifyProgressRepository,
  type StoredReconciliationJob,
  type StoredDecisionReceipt,
  type StoredWebhookRegistration,
  type StoredAiClaimLog,
  type StoredAuditLedgerEntry,
  type StoredVerifyProgressJob,
} from "./sqlite-db";

const TEST_DB_PATH = path.join(process.cwd(), "data", "test-persistence.db");

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log("  ✓ " + name);
  } catch (err) {
    console.error("  ✗ " + name + " — " + (err as Error).message);
    throw err;
  }
}

async function runTests() {
  console.log("\n=========================================================================");
  console.log(" SETTLEMATE AI — SQLITE PERSISTENCE ACROSS RESTARTS TESTS");
  console.log("=========================================================================\n");

  // Clean up any old test database
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }

  // 1. Initialize fresh test DB
  initDatabase(TEST_DB_PATH);

  await test("1. Write reconciliation job and verify persistence across DB restart", () => {
    const job: StoredReconciliationJob = {
      jobId: "job_test_restart_001",
      status: "COMPLETED",
      createdAt: "2026-08-26T10:00:00.000Z",
      completedAt: "2026-08-26T10:00:01.200Z",
      webhookUrl: "https://erp.merchant.com/webhook",
      batchSize: 263,
      summary: JSON.stringify({ autoMatched: 103, suggested: 0, exception: 160, total: 263, matchRatePct: 98.1 }),
      exceptions: JSON.stringify([{ id: "EXP_1", type: "AMOUNT_MISMATCH", amount: 1550 }]),
      receipt: JSON.stringify({ rootHash: "0x1234abcd", leafCount: 263, fingerprint: "fp_test_001" }),
    };

    JobRepository.save(job);

    // Verify written immediately
    const fetchedBefore = JobRepository.get("job_test_restart_001");
    assert.ok(fetchedBefore);
    assert.equal(fetchedBefore.jobId, "job_test_restart_001");
    assert.equal(fetchedBefore.status, "COMPLETED");

    // Close database completely
    closeDatabase();

    // Reopen database at same path (simulating application restart)
    initDatabase(TEST_DB_PATH);

    const fetchedAfter = JobRepository.get("job_test_restart_001");
    assert.ok(fetchedAfter, "Job must exist after reopening database");
    assert.equal(fetchedAfter.jobId, "job_test_restart_001");
    assert.equal(fetchedAfter.status, "COMPLETED");
    assert.equal(fetchedAfter.batchSize, 263);
    assert.deepEqual(JSON.parse(fetchedAfter.summary!), {
      autoMatched: 103,
      suggested: 0,
      exception: 160,
      total: 263,
      matchRatePct: 98.1,
    });
  });

  await test("2. Write Decision Receipt and verify retrieval by receiptId and jobId across restart", () => {
    const receipt: StoredDecisionReceipt = {
      receiptId: "rcpt_merkle_dag_9988",
      jobId: "job_test_restart_001",
      rootHash: "81d840cd8cf981e5e69a367b879a8f11e9e51d60136a6d38e430877f08cab02b",
      leafCount: 263,
      algorithm: "SHA256-MERKLE-DAG",
      timestamp: "2026-08-26T10:00:01.200Z",
      fingerprint: "81d840cd8cf981e5e69a367b879a8f11",
      signature: "sig_merkle_sealed_proof_9988",
      canonicalPayload: JSON.stringify({ batchId: "job_test_restart_001", status: "SEALED" }),
      createdAt: "2026-08-26T10:00:01.200Z",
    };

    DecisionReceiptRepository.save(receipt);

    closeDatabase();
    initDatabase(TEST_DB_PATH);

    const fetchedById = DecisionReceiptRepository.get("rcpt_merkle_dag_9988");
    assert.ok(fetchedById);
    assert.equal(fetchedById.rootHash, "81d840cd8cf981e5e69a367b879a8f11e9e51d60136a6d38e430877f08cab02b");
    assert.equal(fetchedById.leafCount, 263);

    const fetchedByJob = DecisionReceiptRepository.getByJobId("job_test_restart_001");
    assert.ok(fetchedByJob);
    assert.equal(fetchedByJob.receiptId, "rcpt_merkle_dag_9988");
  });

  await test("3. Webhook registrations and delivery logs persist across restart", () => {
    const webhook: StoredWebhookRegistration = {
      id: "wh_custom_erp_test",
      url: "https://finance-hub.corp/settlemate/webhook",
      events: JSON.stringify(["reconciliation.completed"]),
      secret: "whsec_super_secret_test_key",
      status: "ACTIVE",
      registeredAt: "2026-08-26T09:00:00.000Z",
      updatedAt: "2026-08-26T09:00:00.000Z",
    };

    WebhookRepository.saveRegistration(webhook);

    WebhookRepository.saveDeliveryLog({
      id: "log_deliv_001",
      webhookId: "wh_custom_erp_test",
      url: "https://finance-hub.corp/settlemate/webhook",
      event: "reconciliation.completed",
      payload: JSON.stringify({ jobId: "job_123", status: "SUCCESS" }),
      signature: "t=1756202400,v1=abcdef123456",
      timestamp: "2026-08-26T09:05:00.000Z",
      status: "DELIVERED",
      statusCode: 200,
      attempts: 1,
    });

    closeDatabase();
    initDatabase(TEST_DB_PATH);

    const fetchedWebhook = WebhookRepository.getRegistration("wh_custom_erp_test");
    assert.ok(fetchedWebhook);
    assert.equal(fetchedWebhook.url, "https://finance-hub.corp/settlemate/webhook");
    assert.equal(fetchedWebhook.secret, "whsec_super_secret_test_key");

    const logs = WebhookRepository.getDeliveryLogs(10);
    const foundLog = logs.find((l) => l.id === "log_deliv_001");
    assert.ok(foundLog);
    assert.equal(foundLog.statusCode, 200);
    assert.equal(foundLog.status, "DELIVERED");
  });

  await test("4. AI claim logs and Audit Ledger entries persist across restart", () => {
    const aiLog: StoredAiClaimLog = {
      id: "ai_log_test_001",
      timestamp: "2026-08-26T10:15:00.000Z",
      exceptionId: "EXP_AMOUNT_MISMATCH_99",
      model: "gpt-4o-mini",
      inputHash: "hash_input_test_prompt_001",
      prompt: "Investigate exception EXP_AMOUNT_MISMATCH_99",
      output: JSON.stringify({ hypothesis: "Refund explains discrepancy", claimsCount: 2 }),
      latencyMs: 342,
      status: "SUCCESS",
      createdAt: "2026-08-26T10:15:00.342Z",
    };

    AiClaimLogRepository.logAiCall(aiLog);

    const auditEntry: StoredAuditLedgerEntry = {
      id: "aud_entry_001",
      batchId: "batch_2026_prod",
      entityType: "EXCEPTION",
      entityId: "EXP_AMOUNT_MISMATCH_99",
      actor: "agent_investigator",
      action: "CLAIM_FORMULATION",
      reason: "Formulated 2 claims against vault context",
      metadata: JSON.stringify({ model: "gpt-4o-mini", latencyMs: 342 }),
      createdAt: "2026-08-26T10:15:01.000Z",
    };

    AuditLedgerRepository.log(auditEntry);

    closeDatabase();
    initDatabase(TEST_DB_PATH);

    const aiLogs = AiClaimLogRepository.getByExceptionId("EXP_AMOUNT_MISMATCH_99");
    assert.equal(aiLogs.length, 1);
    assert.equal(aiLogs[0].model, "gpt-4o-mini");
    assert.equal(aiLogs[0].latencyMs, 342);

    const auditLogs = AuditLedgerRepository.getByBatchId("batch_2026_prod");
    assert.equal(auditLogs.length, 1);
    assert.equal(auditLogs[0].actor, "agent_investigator");
  });

  await test("5. Verification Hub Progress Jobs persist across restart", () => {
    const progressJob: StoredVerifyProgressJob = {
      jobId: "verify_job_persisted_77",
      status: "RUNNING",
      requestedSuites: JSON.stringify(["benchmark", "cardinality"]),
      totalSuites: 2,
      completedSuites: 1,
      overallProgressPct: 50,
      startedAt: "2026-08-26T10:20:00.000Z",
      results: JSON.stringify({
        benchmark: { suiteId: "benchmark", name: "Official Benchmark", command: "npm run evaluate", status: "PASS", progressPct: 100 },
        cardinality: { suiteId: "cardinality", name: "Cardinality Solver", command: "npx tsx scripts/evaluate-cardinality.ts", status: "PENDING", progressPct: 0 },
      }),
    };

    VerifyProgressRepository.save(progressJob);

    closeDatabase();
    initDatabase(TEST_DB_PATH);

    const fetchedJob = VerifyProgressRepository.get("verify_job_persisted_77");
    assert.ok(fetchedJob);
    assert.equal(fetchedJob.status, "RUNNING");
    assert.equal(fetchedJob.overallProgressPct, 50);
    assert.equal(fetchedJob.completedSuites, 1);
  });

  // Clean up
  closeDatabase();
  if (fs.existsSync(TEST_DB_PATH)) {
    try {
      fs.unlinkSync(TEST_DB_PATH);
    } catch {
      // Ignore
    }
  }

  console.log("\nsqlite-persistence: ALL 5 PERSISTENCE & CRASH-RECOVERY TESTS PASSED\n");
}

runTests().catch((err) => {
  console.error("Test failure:", err);
  process.exit(1);
});
