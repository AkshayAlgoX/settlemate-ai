/*
 * SettleMate AI — Distributed Durable Worker Orchestration Test Suite
 *
 * Validates Phase 4 distributed worker orchestration:
 *   1. Atomic claiming via SKIP LOCKED (no duplicate worker ownership)
 *   2. Concurrency stress test (50 workers competing for jobs)
 *   3. Strict state machine transitions and invalid transition rejection
 *   4. Heartbeat lease extension and expired-lease reclamation
 *   5. Worker crash simulation and recovery
 *   6. Idempotent job creation and anti-double-mutation protection
 *   7. Bounded exponential backoff retry state machine
 *   8. Dead Letter Queue (DLQ) and controlled admin replay
 *   9. Invariant failure fail-closed isolation
 *   10. Multi-tenant worker execution safety
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
  detectAndReclaimStalledJobs,
  processItemsBoundedConcurrency,
  requestJobCancellation,
  cancelJob,
  createJobItems,
  classifyFailure,
  stepJobChunk,
  getDurableJob,
  listDurableJobs,
  _clearLocalQueue,
  type DurableJobRecord,
} from "../src/lib/workers/durable-job-worker";



async function test(name: string, fn: () => void | Promise<void>) {
  _clearLocalQueue();
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
  console.log(" ⚙️ SETTLEMATE AI — DISTRIBUTED DURABLE WORKER ORCHESTRATION SUITE");
  console.log("=========================================================================\n");

  const TENANT_A = "tenant_alpha_enterprise_001";
  const TENANT_B = "tenant_beta_enterprise_002";

  // 1. Idempotency & Creation Test
  await test("TEST 1: enqueueJob creates idempotent async job and prevents duplicates", async () => {
    const key = `idem_key_${Date.now()}`;
    const job1 = await enqueueJob({
      tenantId: TENANT_A,
      idempotencyKey: key,
      jobType: "RECONCILIATION_BATCH",
      payload: { batchId: "b1", records: 250 },
    });

    const job2 = await enqueueJob({
      tenantId: TENANT_A,
      idempotencyKey: key,
      jobType: "RECONCILIATION_BATCH",
      payload: { batchId: "b1", records: 250 },
    });

    assert.equal(job1.id, job2.id, "Idempotent keys must resolve to the identical job ID");
    assert.equal(job1.status, "PENDING");
  });

  // 2. State Machine Transitions Test
  await test("TEST 2: State machine enforces valid transitions and rejects illegal mutations", () => {
    assert.doesNotThrow(() => assertValidTransition("PENDING", "RUNNING"));
    assert.doesNotThrow(() => assertValidTransition("RUNNING", "COMPLETED"));
    assert.doesNotThrow(() => assertValidTransition("RUNNING", "FAILED"));
    assert.doesNotThrow(() => assertValidTransition("RUNNING", "DEAD_LETTER"));
    assert.doesNotThrow(() => assertValidTransition("DEAD_LETTER", "PENDING"));

    // Illegal transitions must throw
    assert.throws(() => assertValidTransition("COMPLETED", "RUNNING"));
    assert.throws(() => assertValidTransition("COMPLETED", "FAILED"));
    assert.throws(() => assertValidTransition("PENDING", "COMPLETED"));
  });

  // 3. Atomic Claiming & Lease Test
  await test("TEST 3: claimNextJob atomically assigns job to worker with active lease", async () => {
    const key = `claim_key_${Date.now()}`;
    await enqueueJob({
      tenantId: TENANT_A,
      idempotencyKey: key,
      jobType: "RECONCILIATION_BATCH",
      payload: { batchId: "b_claim_test" },
    });

    const workerId = "worker_alpha_01";
    const claimed = await claimNextJob(workerId, 30000);
    assert.ok(claimed, "Claimed job must exist");
    assert.equal(claimed.status, "RUNNING");
    assert.equal(claimed.workerId, workerId);
    assert.equal(claimed.attempt, 1);
    assert.ok(claimed.leaseExpiresAt, "Lease timestamp must be set");
  });

  // 4. Concurrency Stress Test: 50 Workers Competing
  await test("TEST 4: 50 concurrent workers claim 50 jobs with zero collision", async () => {
    const jobCount = 50;
    const workerCount = 50;

    // Enqueue 50 jobs
    for (let i = 0; i < jobCount; i++) {
      await enqueueJob({
        tenantId: TENANT_A,
        idempotencyKey: `concurrent_job_${Date.now()}_${i}`,
        jobType: "RECONCILIATION_BATCH",
        payload: { index: i },
      });
    }

    // 50 workers compete to claim
    const claimPromises = Array.from({ length: workerCount }, (_, i) =>
      claimNextJob(`worker_compete_${i}`, 30000)
    );

    const claimedResults = await Promise.all(claimPromises);
    const successfullyClaimed = claimedResults.filter((j): j is DurableJobRecord => j !== null);

    // Verify all claimed jobs are unique
    const claimedIds = new Set(successfullyClaimed.map((j) => j.id));
    assert.equal(
      claimedIds.size,
      successfullyClaimed.length,
      "No two workers may own the same job (Zero Collision)"
    );
  });

  // 5. Heartbeat Lease Extension Test
  await test("TEST 5: renewLease extends lease for current worker only", async () => {
    const key = `renew_key_${Date.now()}`;
    const job = await enqueueJob({
      tenantId: TENANT_A,
      idempotencyKey: key,
      jobType: "RECONCILIATION_BATCH",
      payload: { batchId: "b_renew" },
    });

    const workerId = "worker_renew_01";
    const claimed = await claimNextJob(workerId, 10000);
    assert.ok(claimed);

    // Current worker renews
    const renewed = await renewLease(claimed.id, workerId, 20000);
    assert.equal(renewed, true, "Worker must be able to renew its own lease");

    // Impostor worker fails to renew
    const impostorRenew = await renewLease(claimed.id, "worker_impostor_99", 20000);
    assert.equal(impostorRenew, false, "Impostor worker must not be able to renew lease");
  });

  // 6. Worker Crash Simulation & Expired Lease Reclamation
  await test("TEST 6: Expired lease of crashed worker is safely reclaimed by healthy worker", async () => {
    const key = `crash_key_${Date.now()}`;
    await enqueueJob({
      tenantId: TENANT_A,
      idempotencyKey: key,
      jobType: "RECONCILIATION_BATCH",
      payload: { batchId: "b_crash" },
    });

    // Worker 1 claims with very short lease (1ms) and simulates crash (no renewal)
    const crashedWorker = "worker_crashed_01";
    const claimedByWorker1 = await claimNextJob(crashedWorker, 1);
    assert.ok(claimedByWorker1);
    assert.equal(claimedByWorker1.workerId, crashedWorker);

    // Wait 10ms for lease to expire
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Worker 2 reclaims the job
    const healthyWorker = "worker_healthy_02";
    const reclaimedByWorker2 = await claimNextJob(healthyWorker, 30000);
    assert.ok(reclaimedByWorker2, "Expired job must be reclaimed by healthy worker");
    assert.equal(reclaimedByWorker2.id, claimedByWorker1.id);
    assert.equal(reclaimedByWorker2.workerId, healthyWorker);
    assert.equal(reclaimedByWorker2.attempt, 2, "Attempt count must increment on reclaim");
  });

  // 7. Bounded Exponential Backoff Test
  await test("TEST 7: calculateBackoffMs returns bounded exponential delay", () => {
    assert.equal(calculateBackoffMs(1), 5000); // 5s
    assert.equal(calculateBackoffMs(2), 25000); // 25s
    assert.equal(calculateBackoffMs(3), 125000); // 125s
    assert.equal(calculateBackoffMs(4), 300000); // capped at 300s (5m)
  });

  // 8. Failure Retry & Dead Letter Queue (DLQ) Transition
  await test("TEST 8: Exhausted retries transition job to DEAD_LETTER status", async () => {
    const key = `dlq_key_${Date.now()}`;
    await enqueueJob({
      tenantId: TENANT_A,
      idempotencyKey: key,
      jobType: "RECONCILIATION_BATCH",
      payload: { batchId: "b_dlq" },
      maxRetries: 2,
    });

    // Attempt 1: Fail transiently
    const job1 = await claimNextJob("worker_retry", 30000);
    assert.ok(job1);
    const status1 = await failJob(job1.id, "worker_retry", "Network timeout", "TRANSIENT", 0);
    assert.equal(status1, "PENDING", "First failure must remain PENDING for retry");


    // Attempt 2: Fail again (maxRetries reached)
    const job2 = await claimNextJob("worker_retry", 30000);
    assert.ok(job2);
    const status2 = await failJob(job2.id, "worker_retry", "Network timeout again", "TRANSIENT");
    assert.equal(status2, "DEAD_LETTER", "Exhausted retries must transition to DEAD_LETTER");
  });

  // 9. Invariant Failure Immediate DLQ
  await test("TEST 9: Invariant violation immediately transitions job to DEAD_LETTER without retry", async () => {
    const key = `inv_fail_key_${Date.now()}`;
    await enqueueJob({
      tenantId: TENANT_A,
      idempotencyKey: key,
      jobType: "RECONCILIATION_BATCH",
      payload: { batchId: "b_inv" },
      maxRetries: 5,
    });

    const job = await claimNextJob("worker_inv", 30000);
    assert.ok(job);

    const status = await failJob(
      job.id,
      "worker_inv",
      "ControlFailureError: Invariant 1 (conservation of money) violated",
      "INVARIANT_FAILURE"
    );
    assert.equal(status, "DEAD_LETTER", "Invariant violation must immediately move to DLQ");
  });

  // 10. Admin DLQ Replay Test
  await test("TEST 10: replayJob allows controlled administrative replay of dead-lettered job", async () => {
    const key = `replay_test_key_${Date.now()}`;
    const initialJob = await enqueueJob({
      tenantId: TENANT_A,
      idempotencyKey: key,
      jobType: "RECONCILIATION_BATCH",
      payload: { batchId: "b_replay" },
      maxRetries: 1,
    });

    const claimed = await claimNextJob("w1", 30000);
    assert.ok(claimed);
    await failJob(claimed.id, "w1", "Fatal error", "PERMANENT");

    // Replay by authorized tenant
    const replayed = await replayJob(initialJob.id, TENANT_A);
    assert.equal(replayed, true, "Admin replay must succeed");

    // Job can now be reclaimed fresh
    const reclaimed = await claimNextJob("w2", 30000);
    assert.ok(reclaimed);
    assert.equal(reclaimed.attempt, 1, "Replayed job attempt must reset");

    // Complete job cleanly
    await completeJob(reclaimed.id, "w2", { reconciled: true, matchedCount: 100 });
  });

  // 11. Stalled Job Detection & Auto-Reclaim
  await test("TEST 11: detectAndReclaimStalledJobs re-enqueues stalled jobs with retries remaining", async () => {
    const key = `stalled_key_${Date.now()}`;
    const job = await enqueueJob({
      tenantId: TENANT_A,
      idempotencyKey: key,
      jobType: "RECONCILIATION_BATCH",
      payload: { batchId: "b_stalled" },
      maxRetries: 3,
    });

    const claimed = await claimNextJob("crashed_worker_1", 1); // 1ms lease
    assert.ok(claimed);
    await new Promise((r) => setTimeout(r, 10)); // expire lease

    const { stalledCount } = await detectAndReclaimStalledJobs(1, 0);
    assert.ok(stalledCount >= 1, "Must detect at least 1 stalled job");


    // The reclaimed job can be claimed again by another worker
    const reclaimed = await claimNextJob("healthy_worker_2", 30000);
    assert.ok(reclaimed, "Stalled job must be reclaimable");
    assert.equal(reclaimed.id, job.id);
  });

  // 12. Bounded Concurrency Item Execution
  await test("TEST 12: processItemsBoundedConcurrency executes items in bounded concurrency batches", async () => {
    const job = await enqueueJob({
      tenantId: TENANT_A,
      idempotencyKey: `bounded_test_${Date.now()}`,
      jobType: "ITEM_BATCH",
      payload: {},
      progressTotal: 30,
    });

    const items = Array.from({ length: 30 }, (_, i) => ({ id: `rec_${i}`, val: i }));
    let peakInFlight = 0;
    let currentInFlight = 0;

    const { results, cancelled } = await processItemsBoundedConcurrency(
      job.id,
      "worker_bounded_1",
      items,
      async (item) => {
        currentInFlight++;
        if (currentInFlight > peakInFlight) peakInFlight = currentInFlight;
        await new Promise((r) => setTimeout(r, 5));
        currentInFlight--;
        return item.val * 2;
      },
      { concurrency: 12 }
    );

    assert.equal(cancelled, false, "Job should not be cancelled");
    assert.equal(results.length, 30, "All 30 items must be processed");
    assert.ok(peakInFlight <= 12, `Peak in-flight concurrency (${peakInFlight}) must not exceed limit 12`);
    assert.ok(peakInFlight >= 2, `Concurrency (${peakInFlight}) must achieve parallelism`);
  });

  // 13. Cooperative Cancellation
  await test("TEST 13: Cooperative cancellation stops work between safe batches without corrupting active work", async () => {
    const job = await enqueueJob({
      tenantId: TENANT_A,
      idempotencyKey: `cancel_test_${Date.now()}`,
      jobType: "CANCELLATION_TEST",
      payload: {},
      progressTotal: 100,
    });

    const items = Array.from({ length: 100 }, (_, i) => ({ id: `rec_${i}` }));

    // Request cancellation halfway through
    setTimeout(async () => {
      await requestJobCancellation(job.id, TENANT_A);
    }, 20);

    const { cancelled } = await processItemsBoundedConcurrency(
      job.id,
      "worker_cancel_1",
      items,
      async () => {
        await new Promise((r) => setTimeout(r, 10));
        return true;
      },
      { concurrency: 5 }
    );

    assert.equal(cancelled, true, "Worker must gracefully detect cancellation request");
    await cancelJob(job.id, "worker_cancel_1", "Cancelled safely during item loop");
  });

  // 14. Item-Level Idempotency & Duplicate Prevention
  await test("TEST 14: createJobItems prevents duplicate item insertions for same idempotency key", async () => {
    const key = `item_idemp_${Date.now()}`;
    const job = await enqueueJob({
      tenantId: TENANT_A,
      idempotencyKey: key,
      jobType: "ITEM_IDEMP_TEST",
      payload: {},
    });

    const items = [{ idempotencyKey: "item_001" }, { idempotencyKey: "item_002" }, { idempotencyKey: "item_003" }];
    const firstInsertCount = await createJobItems(job.id, TENANT_A, items);
    assert.equal(firstInsertCount, 3, "Initial insert must create 3 items");

    // Repeat insert of same items
    const secondInsertCount = await createJobItems(job.id, TENANT_A, items);
    assert.equal(secondInsertCount, 0, "Duplicate item insert must be idempotent (0 created)");
  });

  // 15. Multi-Tenant Worker Isolation
  await test("TEST 15: Tenant B cannot cancel or replay Tenant A's jobs", async () => {
    const jobA = await enqueueJob({
      tenantId: TENANT_A,
      idempotencyKey: `tenant_iso_job_${Date.now()}`,
      jobType: "ISOLATION_TEST",
      payload: {},
    });

    // Tenant B attempts to cancel Tenant A's job
    const cancelByB = await requestJobCancellation(jobA.id, TENANT_B);
    assert.equal(cancelByB, false, "Tenant B cannot request cancellation of Tenant A's job");

    // Tenant B attempts to replay Tenant A's job
    const replayByB = await replayJob(jobA.id, TENANT_B);
    assert.equal(replayByB, false, "Tenant B cannot replay Tenant A's job");
  });

  // 16. Error Classification & Differentiated Retries
  await test("TEST 16: Failure classifier distinguishes retryable transient vs non-retryable fatal errors", () => {
    const timeoutFailure = classifyFailure(new Error("Database connection timeout exceeded"));
    assert.equal(timeoutFailure.retryable, true, "Timeout error must be classified as retryable");
    assert.equal(timeoutFailure.classification, "TIMEOUT");

    const rateLimitFailure = classifyFailure(new Error("HTTP 429: Rate limit quota exceeded"));
    assert.equal(rateLimitFailure.retryable, true, "429 rate limit must be classified as retryable");
    assert.equal(rateLimitFailure.classification, "RATE_LIMIT");

    const invariantFailure = classifyFailure(new Error("ControlFailureError: Invariant 1 violated"));
    assert.equal(invariantFailure.retryable, false, "Invariant failure must NOT be retryable");
    assert.equal(invariantFailure.classification, "INVARIANT_FAILURE");

    const validationFailure = classifyFailure(new Error("Validation error: Invalid input data format"));
    assert.equal(validationFailure.retryable, false, "Validation failure must NOT be retryable");
    assert.equal(validationFailure.classification, "VALIDATION_FAILURE");
  });

  // 17. Bounded Step Execution ($0 Free Web Service Stepper)
  await test("TEST 17: stepJobChunk executes one bounded slice and checkpoints progress", async () => {
    const job = await enqueueJob({
      tenantId: TENANT_A,
      idempotencyKey: `step_exec_job_${Date.now()}`,
      jobType: "BATCH_GENERATION",
      payload: { size: 250 },
      progressTotal: 250,
    });

    // Step 1: Execute 100 items
    const step1 = await stepJobChunk(job.id, "stepper_1", { chunkSize: 100 });
    assert.equal(step1.jobId, job.id);
    assert.equal(step1.progressCurrent, 100);
    assert.equal(step1.isComplete, false);
    assert.equal(step1.status, "RUNNING");

    // Read-only status query must not advance progress
    const statusQuery = await getDurableJob(job.id, TENANT_A);
    assert.equal(statusQuery?.progressCurrent, 100);
    assert.equal(statusQuery?.status, "RUNNING");

    // Step 2: Execute next 100 items
    const step2 = await stepJobChunk(job.id, "stepper_1", { chunkSize: 100 });
    assert.equal(step2.progressCurrent, 200);
    assert.equal(step2.isComplete, false);

    // Step 3: Execute final 50 items
    const step3 = await stepJobChunk(job.id, "stepper_1", { chunkSize: 100 });
    assert.equal(step3.progressCurrent, 250);
    assert.equal(step3.isComplete, true);
    assert.equal(step3.status, "COMPLETED");
  });

  // 18. Fair Scheduling & Multi-Job Interleaving
  await test("TEST 18: 250-record job can complete while 10,000-record job is in progress", async () => {
    const jobLarge = await enqueueJob({
      tenantId: TENANT_A,
      idempotencyKey: `large_10k_job_${Date.now()}`,
      jobType: "BATCH_GENERATION",
      payload: { size: 10000 },
      progressTotal: 10000,
    });

    const jobSmall = await enqueueJob({
      tenantId: TENANT_A,
      idempotencyKey: `small_250_job_${Date.now()}`,
      jobType: "BATCH_GENERATION",
      payload: { size: 250 },
      progressTotal: 250,
    });

    // Step large job once (100 / 10,000)
    const stepLarge1 = await stepJobChunk(jobLarge.id, "stepper_fair", { chunkSize: 100 });
    assert.equal(stepLarge1.progressCurrent, 100);
    assert.equal(stepLarge1.isComplete, false);

    // Step small job to completion in 3 interleaved steps
    await stepJobChunk(jobSmall.id, "stepper_fair", { chunkSize: 100 });
    await stepJobChunk(jobLarge.id, "stepper_fair", { chunkSize: 100 }); // Large at 200
    await stepJobChunk(jobSmall.id, "stepper_fair", { chunkSize: 100 });
    const stepSmallFinal = await stepJobChunk(jobSmall.id, "stepper_fair", { chunkSize: 100 });

    assert.equal(stepSmallFinal.isComplete, true);
    assert.equal(stepSmallFinal.status, "COMPLETED");

    // Verify large job is still preserved at checkpoint (200 / 10,000)
    const largeStatus = await getDurableJob(jobLarge.id, TENANT_A);
    assert.equal(largeStatus?.progressCurrent, 200);
    assert.equal(largeStatus?.status, "RUNNING");
  });

  // 19. Cooperative Step Cancellation
  await test("TEST 19: Cancellation request cleanly halts future steps and marks job CANCELLED", async () => {
    const job = await enqueueJob({
      tenantId: TENANT_A,
      idempotencyKey: `cancel_step_job_${Date.now()}`,
      jobType: "BATCH_GENERATION",
      payload: { size: 1000 },
      progressTotal: 1000,
    });

    // Step 1: Advance to 100
    await stepJobChunk(job.id, "stepper_canceller", { chunkSize: 100 });

    // Request cancellation
    const cancelOk = await requestJobCancellation(job.id, TENANT_A);
    assert.equal(cancelOk, true, "Cancellation request must succeed");

    // Next step must detect cancellation and halt immediately
    const cancelStep = await stepJobChunk(job.id, "stepper_canceller", { chunkSize: 100 });
    assert.equal(cancelStep.isCancelled, true);
    assert.equal(cancelStep.status, "CANCELLED");
    assert.equal(cancelStep.progressCurrent, 100, "Progress must not advance after cancellation");
  });

  // 20. Stalled / Spin-Down Recovery Resumption
  await test("TEST 20: Free Render spin-down preserves checkpoint and resumes on wake-up", async () => {
    const job = await enqueueJob({
      tenantId: TENANT_A,
      idempotencyKey: `spindown_job_${Date.now()}`,
      jobType: "BATCH_GENERATION",
      payload: { size: 1000 },
      progressTotal: 1000,
    });

    // Step to 400
    await stepJobChunk(job.id, "stepper_old", { chunkSize: 200 });
    await stepJobChunk(job.id, "stepper_old", { chunkSize: 200 });

    // Simulate Render spin-down: lease expires while sleeping
    await new Promise((r) => setTimeout(r, 10));
    const { stalledCount } = await detectAndReclaimStalledJobs(1, 0);
    assert.ok(stalledCount >= 1, "Stalled detector must reclaim job with expired lease");

    // Next worker wakes up and resumes stepping from 400
    const resumeStep = await stepJobChunk(job.id, "stepper_new", { chunkSize: 200 });
    assert.equal(resumeStep.progressCurrent, 600, "Must resume from checkpoint 400 + 200 = 600");
    assert.equal(resumeStep.status, "RUNNING");
  });


  console.log("\n=========================================================================");
  console.log(" ✅ ALL 20 DISTRIBUTED DURABLE WORKER ORCHESTRATION TESTS PASSED");
  console.log("=========================================================================\n");
}

main().catch((err) => {
  console.error("Distributed worker orchestration test failed:", err);
  process.exit(1);
});
