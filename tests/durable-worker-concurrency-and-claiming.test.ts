/*
 * SettleMate AI — Durable Worker Concurrency, Safe Claiming & Resiliency Suite
 *
 * Validates Phases 1 through 6:
 *   - Phase 1: Durable Job Model (additive columns, job_items unique idempotency)
 *   - Phase 2: Safe Claiming via SKIP LOCKED & bounded leases
 *   - Phase 3: Bounded Item Concurrency (10–15 items in-flight with backpressure)
 *   - Phase 4: Cooperative Cancellation (cancel_requested_at checked between units)
 *   - Phase 5: Per-Item Retry Classification & Backoff
 *   - Phase 6: Stalled Detection & Auto-Reclaim
 */

import assert from "node:assert/strict";
import {
  enqueueJob,
  claimNextJob,
  renewLease,
  completeJob,
  failJob,
  replayJob,
  assertValidTransition,
  calculateBackoffMs,
  classifyFailure,
  detectAndReclaimStalledJobs,
  createJobItems,
  processItemsBoundedConcurrency,
  requestJobCancellation,
  cancelJob,
  checkCancellationRequested,
  updateJobProgress,
  _clearLocalQueue,
  type DurableJobRecord,
} from "../src/lib/workers/durable-job-worker";

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  _clearLocalQueue();
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name} — ${(err as Error).message}`);
    throw err;
  }
}

async function main() {
  console.log("=========================================================================");
  console.log(" 🧪 SETTLEMATE AI — DURABLE WORKER CONCURRENCY & CLAIMING TEST SUITE");
  console.log("=========================================================================\n");

  const TENANT_1 = "tenant_enterprise_test_01";
  const TENANT_2 = "tenant_enterprise_test_02";

  // Phase 1: Durable Job Model & Job Items
  await test("Phase 1: Enqueue creates job with progress counters and item idempotency", async () => {
    const job = await enqueueJob({
      tenantId: TENANT_1,
      idempotencyKey: `phase1_job_${Date.now()}`,
      jobType: "RECONCILIATION_RUN",
      payload: { batchId: "b_p1" },
      maxRetries: 3,
      progressTotal: 100,
    });

    assert.equal(job.status, "PENDING");
    assert.equal(job.progressCurrent, 0);
    assert.equal(job.progressTotal, 100);

    const items = [
      { idempotencyKey: "item_a" },
      { idempotencyKey: "item_b" },
      { idempotencyKey: "item_c" },
    ];
    const created1 = await createJobItems(job.id, TENANT_1, items);
    assert.equal(created1, 3);

    // Duplicate create is idempotent
    const created2 = await createJobItems(job.id, TENANT_1, items);
    assert.equal(created2, 0);
  });

  // Phase 2: Safe Claiming via SKIP LOCKED
  await test("Phase 2: Concurrent claiming guarantees single-owner exclusivity", async () => {
    for (let i = 0; i < 20; i++) {
      await enqueueJob({
        tenantId: TENANT_1,
        idempotencyKey: `p2_job_${i}_${Date.now()}`,
        jobType: "RECONCILIATION_RUN",
        payload: { idx: i },
      });
    }

    // 20 workers attempt to claim simultaneously
    const claimPromises = Array.from({ length: 20 }, (_, idx) =>
      claimNextJob(`worker_p2_${idx}`, 30000)
    );
    const claimed = (await Promise.all(claimPromises)).filter((j): j is DurableJobRecord => j !== null);

    const claimedIds = new Set(claimed.map((j) => j.id));
    assert.equal(claimedIds.size, claimed.length, "All claimed jobs must be mutually exclusive");
  });

  // Phase 2: Heartbeat Extension
  await test("Phase 2: Heartbeat renews lease expiration for active worker", async () => {
    const job = await enqueueJob({
      tenantId: TENANT_1,
      idempotencyKey: `p2_heartbeat_${Date.now()}`,
      jobType: "RECON",
      payload: {},
    });

    const claimed = await claimNextJob("worker_hb", 10000);
    assert.ok(claimed);

    const renewed = await renewLease(claimed.id, "worker_hb", 25000);
    assert.equal(renewed, true);

    const impostorRenew = await renewLease(claimed.id, "worker_other", 25000);
    assert.equal(impostorRenew, false);
  });

  // Phase 3: Bounded Item Concurrency
  await test("Phase 3: Bounded concurrency caps in-flight items and updates progress", async () => {
    const totalItems = 50;
    const concurrencyLimit = 12;
    const job = await enqueueJob({
      tenantId: TENANT_1,
      idempotencyKey: `p3_bounded_${Date.now()}`,
      jobType: "BOUNDED_CONCURRENCY",
      payload: {},
      progressTotal: totalItems,
    });

    const items = Array.from({ length: totalItems }, (_, i) => ({ id: `item_${i}`, idx: i }));
    let inFlight = 0;
    let maxInFlight = 0;
    let progressCalls = 0;

    const { results, cancelled } = await processItemsBoundedConcurrency(
      job.id,
      "worker_bounded_p3",
      items,
      async (item) => {
        inFlight++;
        if (inFlight > maxInFlight) maxInFlight = inFlight;
        await new Promise((r) => setTimeout(r, 4));
        inFlight--;
        return item.idx * 10;
      },
      {
        concurrency: concurrencyLimit,
        onProgress: async () => {
          progressCalls++;
        },
      }
    );

    assert.equal(cancelled, false);
    assert.equal(results.length, totalItems);
    assert.ok(maxInFlight <= concurrencyLimit, `In-flight (${maxInFlight}) must be <= limit (${concurrencyLimit})`);
    assert.ok(maxInFlight >= 2, `In-flight (${maxInFlight}) must achieve parallel throughput`);
    assert.ok(progressCalls >= 2, "Progress hook must be invoked during execution");
  });

  // Phase 4: Cooperative Cancellation
  await test("Phase 4: Cooperative cancellation cleanly aborts execution between safe units", async () => {
    const job = await enqueueJob({
      tenantId: TENANT_1,
      idempotencyKey: `p4_cancel_${Date.now()}`,
      jobType: "CANCEL_RUN",
      payload: {},
      progressTotal: 100,
    });

    const items = Array.from({ length: 100 }, (_, i) => ({ id: `i_${i}` }));

    // Request cancellation shortly after start
    setTimeout(async () => {
      await requestJobCancellation(job.id, TENANT_1);
    }, 15);

    let completedItems = 0;
    const { cancelled } = await processItemsBoundedConcurrency(
      job.id,
      "worker_cancel_p4",
      items,
      async () => {
        await new Promise((r) => setTimeout(r, 10));
        completedItems++;
        return true;
      },
      { concurrency: 4 }
    );

    assert.equal(cancelled, true, "Worker loop must exit gracefully on cancellation request");
    assert.ok(completedItems < 100, "Unprocessed items must not run after cancellation");
    await cancelJob(job.id, "worker_cancel_p4", "Job cancelled by operator");
  });

  // Phase 5: Per-Item Retry Classification & Backoff
  await test("Phase 5: Failure classifier identifies retryable vs fatal invariant violations", () => {
    const timeoutErr = classifyFailure(new Error("ETIMEDOUT: Connection to database timed out"));
    assert.equal(timeoutErr.retryable, true);
    assert.equal(timeoutErr.classification, "TIMEOUT");

    const rateLimitErr = classifyFailure(new Error("429 Too Many Requests: Gemini rate limit exceeded"));
    assert.equal(rateLimitErr.retryable, true);
    assert.equal(rateLimitErr.classification, "RATE_LIMIT");

    const invErr = classifyFailure(new Error("ControlFailureError: Invariant conservation failed"));
    assert.equal(invErr.retryable, false);
    assert.equal(invErr.classification, "INVARIANT_FAILURE");

    const backoff1 = calculateBackoffMs(1, 2, 2, 60, false);
    const backoff2 = calculateBackoffMs(2, 2, 2, 60, false);
    assert.ok(backoff2 > backoff1, "Backoff must increase exponentially");
  });

  // Phase 6: Stalled Detection & Auto-Reclaim
  await test("Phase 6: Stalled detector reclaims abandoned jobs and marks exhausted ones DEAD_LETTER", async () => {
    // 1. Recoverable stalled job (attempts < maxRetries)
    const jobRecoverable = await enqueueJob({
      tenantId: TENANT_1,
      idempotencyKey: `p6_recov_${Date.now()}`,
      jobType: "RECON",
      payload: {},
      maxRetries: 3,
    });
    const claimedRecov = await claimNextJob("worker_died_1", 1); // 1ms lease
    assert.ok(claimedRecov);

    // 2. Exhausted stalled job (attempt >= maxRetries)
    const jobExhausted = await enqueueJob({
      tenantId: TENANT_1,
      idempotencyKey: `p6_exhaust_${Date.now()}`,
      jobType: "RECON",
      payload: {},
      maxRetries: 1,
    });
    const claimedExhaust = await claimNextJob("worker_died_2", 1); // 1ms lease
    assert.ok(claimedExhaust);

    // Wait 10ms for leases to expire
    await new Promise((r) => setTimeout(r, 10));

    const { stalledCount, dlqCount } = await detectAndReclaimStalledJobs(1, 0);
    assert.ok(stalledCount >= 1, "Must reclaim recoverable job");
    assert.ok(dlqCount >= 1, "Must move exhausted job to DLQ");

    // Recovered job can now be picked up by a new worker
    const reclaimed = await claimNextJob("healthy_worker_new", 30000);
    assert.ok(reclaimed);
    assert.equal(reclaimed.id, jobRecoverable.id);
  });

  console.log("\n=========================================================================");
  console.log(` ✅ ALL ${passed} DURABLE WORKER CONCURRENCY & CLAIMING TESTS PASSED`);
  console.log("=========================================================================\n");
}

main().catch((err) => {
  console.error("Durable worker tests failed:", err);
  process.exit(1);
});
