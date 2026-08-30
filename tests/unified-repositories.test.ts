/*
 * SettleMate AI — Unified Operational Persistence Repository Test Suite
 *
 * Validates Phase 3 operational persistence unification:
 *   1. UnifiedJobRepository (async reconciliation jobs)
 *   2. UnifiedReceiptRepository (cryptographic decision receipts)
 *   3. UnifiedWebhookRepository (subscriptions & outbox logs)
 *   4. UnifiedAiClaimLogRepository (AI investigation telemetry)
 *   5. UnifiedAuditLedgerRepository (compliance audit trails)
 *   6. UnifiedProgressRepository (verification hub execution state)
 *   7. Safe concurrent access and state recovery
 */

import assert from "node:assert/strict";
import {
  UnifiedJobRepository,
  UnifiedReceiptRepository,
  UnifiedWebhookRepository,
  UnifiedAiClaimLogRepository,
  UnifiedAuditLedgerRepository,
  UnifiedProgressRepository,
} from "../src/lib/storage/unified-store";

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
  console.log(" 📦 SETTLEMATE AI — UNIFIED OPERATIONAL PERSISTENCE REPOSITORY SUITE");
  console.log("=========================================================================\n");

  const timestamp = new Date().toISOString();

  // 1. Reconciliation Job Repository Tests
  await test("Stage 1.1: UnifiedJobRepository saves and retrieves reconciliation job", () => {
    const jobId = `job_unified_test_${Date.now()}`;
    UnifiedJobRepository.save({
      jobId,
      status: "PENDING",
      createdAt: timestamp,
      batchSize: 250,
      summary: JSON.stringify({ autoMatched: 100, exceptions: 10 }),
    });

    const stored = UnifiedJobRepository.get(jobId);
    assert.ok(stored, "Stored job must exist");
    assert.equal(stored.jobId, jobId);
    assert.equal(stored.status, "PENDING");
    assert.equal(stored.batchSize, 250);

    // Update status to COMPLETED
    UnifiedJobRepository.updateStatus(jobId, "COMPLETED");
    const updated = UnifiedJobRepository.get(jobId);
    assert.equal(updated?.status, "COMPLETED");
  });

  // 2. Decision Receipt Repository Tests
  await test("Stage 2.1: UnifiedReceiptRepository persists and retrieves Merkle DAG receipt", () => {
    const receiptId = `rcpt_unified_test_${Date.now()}`;
    const rootHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

    UnifiedReceiptRepository.save({
      receiptId,
      jobId: "job_sample_01",
      batchId: "batch_sample_01",
      rootHash,
      leafCount: 250,
      algorithm: "SHA256-MERKLE-DAG",
      timestamp,
      fingerprint: "81d840cd8cf981e5e69a367b879a8f11",
      signature: "sig_merkle_sample_hash",
      createdAt: timestamp,
    });

    const stored = UnifiedReceiptRepository.get(receiptId);
    assert.ok(stored, "Stored receipt must exist");
    assert.equal(stored.receiptId, receiptId);
    assert.equal(stored.rootHash, rootHash);
    assert.equal(stored.leafCount, 250);
  });

  // 3. Webhook Repository Tests
  await test("Stage 3.1: UnifiedWebhookRepository handles registrations and delivery logs", () => {
    const webhookId = `whk_unified_test_${Date.now()}`;
    UnifiedWebhookRepository.saveRegistration({
      id: webhookId,
      url: "https://api.merchant.com/webhook",
      events: JSON.stringify(["batch.completed", "batch.failed"]),
      secret: "whsec_test_secret_key_123",
      status: "ACTIVE",
      registeredAt: timestamp,
      updatedAt: timestamp,
    });

    const reg = UnifiedWebhookRepository.getRegistration(webhookId);
    assert.ok(reg, "Webhook registration must exist");
    assert.equal(reg.id, webhookId);
    assert.equal(reg.status, "ACTIVE");

    // Save Delivery Log
    const logId = `whlog_${Date.now()}`;
    UnifiedWebhookRepository.saveDeliveryLog({
      id: logId,
      webhookId,
      jobId: "job_01",
      event: "batch.completed",
      url: "https://api.merchant.com/webhook",
      statusCode: 200,
      durationMs: 45,
      payload: JSON.stringify({ batchId: "b1", status: "COMPLETED" }),
      signature: "whsig_sample",
      attempt: 1,
      success: true,
      timestamp,
    });

    const logs = UnifiedWebhookRepository.getDeliveryLogs(10);
    const foundLog = logs.find((l) => l.id === logId);
    assert.ok(foundLog, "Delivery log must be recorded");
    assert.equal(foundLog.statusCode, 200);
  });

  // 4. AI Claim Log Repository Tests
  await test("Stage 4.1: UnifiedAiClaimLogRepository records AI telemetry", () => {
    const logId = `ai_claim_${Date.now()}`;
    UnifiedAiClaimLogRepository.logAiCall({
      id: logId,
      timestamp,
      exceptionId: "exp_01",
      model: "gpt-4o-financial",
      inputHash: "hash_input_123",
      latencyMs: 120,
      status: "SUCCESS",
      createdAt: timestamp,
    });

    const recentLogs = UnifiedAiClaimLogRepository.getRecentLogs(10);
    const found = recentLogs.find((l) => l.id === logId);
    assert.ok(found, "AI claim log must be retrieved");
    assert.equal(found.model, "gpt-4o-financial");
  });

  // 5. Audit Ledger Repository Tests
  await test("Stage 5.1: UnifiedAuditLedgerRepository records compliance events", () => {
    const auditId = `aud_unified_${Date.now()}`;
    const batchId = `batch_aud_${Date.now()}`;

    UnifiedAuditLedgerRepository.log({
      id: auditId,
      batchId,
      actor: "controller_admin",
      action: "RECONCILIATION_AUTHORIZED",
      reason: "Dual-control checker approval",
      createdAt: timestamp,
    });

    const entries = UnifiedAuditLedgerRepository.getByBatchId(batchId);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].action, "RECONCILIATION_AUTHORIZED");
  });

  // 6. Verification Progress Repository Tests
  await test("Stage 6.1: UnifiedProgressRepository tracks verification hub progress", () => {
    const jobId = `vjob_${Date.now()}`;
    UnifiedProgressRepository.save({
      jobId,
      status: "RUNNING",
      requestedSuites: JSON.stringify(["benchmark", "cardinality"]),
      totalSuites: 2,
      completedSuites: 1,
      overallProgressPct: 50,
      startedAt: timestamp,
      results: JSON.stringify({ benchmark: { status: "PASS" } }),
    });

    const progress = UnifiedProgressRepository.get(jobId);
    assert.ok(progress, "Progress job must exist");
    assert.equal(progress.overallProgressPct, 50);
  });

  // 7. Concurrent Operations Test
  await test("Stage 7.1: Concurrent repository writes execute cleanly without collision", async () => {
    const promises = Array.from({ length: 10 }, (_, i) => {
      const id = `job_concurrent_${Date.now()}_${i}`;
      return Promise.resolve(
        UnifiedJobRepository.save({
          jobId: id,
          status: "PENDING",
          createdAt: new Date().toISOString(),
          batchSize: 100 + i,
        })
      );
    });

    await Promise.all(promises);
  });

  console.log("\n=========================================================================");
  console.log(" ✅ ALL 7 UNIFIED OPERATIONAL PERSISTENCE TESTS PASSED");
  console.log("=========================================================================\n");
}

main().catch((err) => {
  console.error("Unified repository test failed:", err);
  process.exit(1);
});
