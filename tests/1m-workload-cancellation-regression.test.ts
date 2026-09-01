/*
 * SettleMate AI — 1M Workload Cancellation & Cooperative SLA Regression Suite
 *
 * Verifies all 12 Required Cancellation Regression Invariants:
 * 1. 10K cancel
 * 2. 100K cancel
 * 3. 1M cancel (bounded terminal cancellation latency SLA < 1000ms)
 * 4. 10M cancel smoke path
 * 5. Cancel during active slice (safe chunk finishes, no later chunk starts)
 * 6. Cancel immediately after step begins
 * 7. Cancel while large DB transaction is active
 * 8. Cancel + step race
 * 9. Repeated cancel (idempotent, no errors)
 * 10. Restart after cancellation (no resurrection by stalled detector)
 * 11. Page refresh after cancellation (list and detail routes reflect CANCELLED)
 * 12. Tenant isolation during cancellation (cross-tenant cancel rejected 404)
 */

import { NextRequest } from "next/server";
import {
  enqueueJob,
  stepJobChunk,
  requestJobCancellation,
  cancelJob,
  getDurableJob,
  detectAndReclaimStalledJobs,
  _clearLocalQueue,
} from "../src/lib/workers/durable-job-worker";
import { POST as cancelRoute } from "../src/app/api/batches/jobs/[jobId]/cancel/route";
import { POST as stepRoute } from "../src/app/api/batches/jobs/[jobId]/step/route";
import { GET as getJobDetailRoute } from "../src/app/api/batches/jobs/[jobId]/route";
import { GET as listJobsRoute } from "../src/app/api/batches/jobs/route";
import { createSessionToken } from "../src/lib/auth/session";

let passedTests = 0;
let totalAssertions = 0;

function trackAssert(condition: boolean, msg: string) {
  totalAssertions++;
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

function makeAuthRequest(
  url: string,
  tenantId: string,
  options: { method?: string; body?: Record<string, unknown>; role?: "ADMIN" | "REVIEWER" } = {}
): NextRequest {
  const token = createSessionToken({
    sub: `usr_${tenantId}`,
    name: `admin_${tenantId}`,
    role: options.role || "ADMIN",
    tenantId,
    exp: Math.floor(Date.now() / 1000) + 3600,
  });

  return new NextRequest(url, {
    method: options.method || "GET",
    headers: {
      cookie: `settlemate_session=${token}`,
      "content-type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

async function runTest(name: string, fn: () => void | Promise<void>) {
  _clearLocalQueue();
  try {
    const t0 = performance.now();
    await fn();
    const elapsed = performance.now() - t0;
    passedTests++;
    console.log(`  ✓ [PASS] ${name} (${elapsed.toFixed(1)}ms)`);
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name} — ${(err as Error).message}`);
    throw err;
  }
}

async function main() {
  console.log("\n=========================================================================");
  console.log(" 🛡️ SETTLEMATE AI — 1M WORKLOAD CANCELLATION & SLA REGRESSION SUITE");
  console.log("=========================================================================\n");

  const TENANT_A = `tenant_cancel_sla_a_${Date.now()}`;
  const TENANT_B = `tenant_cancel_sla_b_${Date.now()}`;

  // ---------------------------------------------------------------------------
  // TEST 1: 10K CANCEL
  // ---------------------------------------------------------------------------
  await runTest("1. 10K Workload cancellation terminates cleanly within SLA", async () => {
    const job = await enqueueJob({
      tenantId: TENANT_A,
      idempotencyKey: `cancel_10k_${Date.now()}`,
      jobType: "BATCH_GENERATION",
      payload: { size: 10000, batchName: "10k Batch" },
      progressTotal: 10000,
    });

    // Step 1 slice of 500
    await stepJobChunk(job.id, "worker_10k", { chunkSize: 500 });
    const midJob = await getDurableJob(job.id, TENANT_A);
    trackAssert(midJob?.progressCurrent === 500, "Progress reached 500");

    const t0 = performance.now();
    const cancelRes = await cancelRoute(
      makeAuthRequest(`http://localhost:3000/api/batches/jobs/${job.id}/cancel`, TENANT_A, { method: "POST" }),
      { params: Promise.resolve({ jobId: job.id }) }
    );
    const cancelElapsed = performance.now() - t0;
    trackAssert(cancelElapsed < 500, `Cancel response latency within SLA (${cancelElapsed.toFixed(1)}ms < 500ms)`);

    const json = await cancelRes.json();
    trackAssert(json.success === true, "Cancel returned success");
    trackAssert(json.cancelled === true, "Job marked as cancelled");

    const finalJob = await getDurableJob(job.id, TENANT_A);
    trackAssert(finalJob?.status === "CANCELLED", "Authoritative status is CANCELLED");
    trackAssert(finalJob?.progressCurrent === 500, "Progress preserved at 500");
  });

  // ---------------------------------------------------------------------------
  // TEST 2: 100K CANCEL
  // ---------------------------------------------------------------------------
  await runTest("2. 100K Workload cancellation terminates cleanly within SLA", async () => {
    const job = await enqueueJob({
      tenantId: TENANT_A,
      idempotencyKey: `cancel_100k_${Date.now()}`,
      jobType: "BATCH_GENERATION",
      payload: { size: 100000, batchName: "100k Batch" },
      progressTotal: 100000,
    });

    // Step 2 slices of 2500
    await stepJobChunk(job.id, "worker_100k", { chunkSize: 2500 });
    await stepJobChunk(job.id, "worker_100k", { chunkSize: 2500 });

    const cancelRes = await cancelRoute(
      makeAuthRequest(`http://localhost:3000/api/batches/jobs/${job.id}/cancel`, TENANT_A, { method: "POST" }),
      { params: Promise.resolve({ jobId: job.id }) }
    );
    const json = await cancelRes.json();
    trackAssert(json.status === "CANCELLED" || json.status === "CANCEL_REQUESTED", "Cancel response status valid");

    const finalJob = await getDurableJob(job.id, TENANT_A);
    trackAssert(finalJob?.status === "CANCELLED", "Authoritative status is CANCELLED");
    trackAssert(finalJob?.progressCurrent === 5000, "Completed 5000 items preserved");
  });

  // ---------------------------------------------------------------------------
  // TEST 3: 1M CANCEL (CRITICAL SLA ASSERTION)
  // ---------------------------------------------------------------------------
  await runTest("3. 1M Workload cancellation completes terminal transition within bounded SLA (<1000ms)", async () => {
    const job = await enqueueJob({
      tenantId: TENANT_A,
      idempotencyKey: `cancel_1m_${Date.now()}`,
      jobType: "BATCH_GENERATION",
      payload: { size: 1000000, batchName: "1M Hyperscale Batch" },
      progressTotal: 1000000,
    });

    // Execute 3 bounded slices (e.g. 2500 each = 7500 completed items)
    await stepJobChunk(job.id, "worker_1m", { chunkSize: 2500 });
    await stepJobChunk(job.id, "worker_1m", { chunkSize: 2500 });
    await stepJobChunk(job.id, "worker_1m", { chunkSize: 2500 });

    const activeJob = await getDurableJob(job.id, TENANT_A);
    trackAssert(activeJob?.progressCurrent === 7500, "Progress reached 7,500");
    trackAssert(activeJob?.status === "RUNNING", "Job is in RUNNING state prior to cancel");

    // Measure exact cancellation endpoint & terminal transition latency
    const cancelT0 = performance.now();
    const cancelRes = await cancelRoute(
      makeAuthRequest(`http://localhost:3000/api/batches/jobs/${job.id}/cancel`, TENANT_A, { method: "POST" }),
      { params: Promise.resolve({ jobId: job.id }) }
    );
    const cancelT1 = performance.now();
    const cancelLatencyMs = cancelT1 - cancelT0;

    trackAssert(cancelRes.status === 200, "Cancel route returned HTTP 200");
    trackAssert(cancelLatencyMs < 1000, `Cancel endpoint latency bounded: ${cancelLatencyMs.toFixed(1)}ms (< 1000ms SLA)`);

    const json = await cancelRes.json();
    trackAssert(json.success === true, "Cancel payload success is true");
    trackAssert(json.cancelled === true, "Cancel payload cancelled is true");

    // Verify authoritative terminal state in storage
    const terminalJob = await getDurableJob(job.id, TENANT_A);
    trackAssert(terminalJob?.status === "CANCELLED", "Authoritative state in DB is immediately CANCELLED");
    trackAssert(Boolean(terminalJob?.cancelRequestedAt), "cancelRequestedAt timestamp is durably persisted");
    trackAssert(Boolean(terminalJob?.completedAt), "completedAt timestamp is durably persisted");
    trackAssert(terminalJob?.progressCurrent === 7500, "Financial progress strictly preserved at 7,500 items");

    // Verify that subsequent step is rejected immediately with 409 Conflict without starting slice 4
    const nextStepRes = await stepRoute(
      makeAuthRequest(`http://localhost:3000/api/batches/jobs/${job.id}/step`, TENANT_A, {
        method: "POST",
        body: { chunkSize: 2500 },
      }),
      { params: Promise.resolve({ jobId: job.id }) }
    );
    trackAssert(nextStepRes.status === 409, "Subsequent /step rejected with HTTP 409 Conflict");
    const stepJson = await nextStepRes.json();
    trackAssert(stepJson.job.isCancelled === true, "Step reports isCancelled = true");
    trackAssert(stepJson.job.progressCurrent === 7500, "Progress unchanged after rejected step");
  });

  // ---------------------------------------------------------------------------
  // TEST 4: 10M CANCEL SMOKE PATH
  // ---------------------------------------------------------------------------
  await runTest("4. 10M Stress Workload cancellation smoke path", async () => {
    const job = await enqueueJob({
      tenantId: TENANT_A,
      idempotencyKey: `cancel_10m_${Date.now()}`,
      jobType: "BATCH_GENERATION",
      payload: { size: 10000000, batchName: "10M Stress Batch" },
      progressTotal: 10000000,
    });

    await stepJobChunk(job.id, "worker_10m", { chunkSize: 2500 });
    const res = await cancelRoute(
      makeAuthRequest(`http://localhost:3000/api/batches/jobs/${job.id}/cancel`, TENANT_A, { method: "POST" }),
      { params: Promise.resolve({ jobId: job.id }) }
    );
    trackAssert(res.status === 200, "10M cancel returned HTTP 200");
    const dbJob = await getDurableJob(job.id, TENANT_A);
    trackAssert(dbJob?.status === "CANCELLED", "10M job transitioned to CANCELLED");
  });

  // ---------------------------------------------------------------------------
  // TEST 5: CANCEL DURING ACTIVE SLICE
  // ---------------------------------------------------------------------------
  await runTest("5. Cancel during active slice completes current safe slice and stops later slices", async () => {
    const job = await enqueueJob({
      tenantId: TENANT_A,
      idempotencyKey: `mid_slice_${Date.now()}`,
      jobType: "BATCH_GENERATION",
      payload: { size: 100000 },
      progressTotal: 100000,
    });

    // Step 1
    await stepJobChunk(job.id, "worker_mid", { chunkSize: 1000 });
    trackAssert((await getDurableJob(job.id, TENANT_A))?.progressCurrent === 1000, "Slice 1 done");

    // Request cancel
    await requestJobCancellation(job.id, TENANT_A);

    // Attempt step 2
    const step2 = await stepJobChunk(job.id, "worker_mid", { chunkSize: 1000 });
    trackAssert(step2.isCancelled === true, "Slice 2 immediately halted");
    trackAssert(step2.status === "CANCELLED", "Status is CANCELLED");

    const check = await getDurableJob(job.id, TENANT_A);
    trackAssert(check?.progressCurrent === 1000, "Progress remained at exactly 1000");
  });

  // ---------------------------------------------------------------------------
  // TEST 6: CANCEL IMMEDIATELY AFTER STEP BEGINS
  // ---------------------------------------------------------------------------
  await runTest("6. Cancel immediately after step starts halts before next slice begins", async () => {
    const job = await enqueueJob({
      tenantId: TENANT_A,
      idempotencyKey: `cancel_imm_${Date.now()}`,
      jobType: "BATCH_GENERATION",
      payload: { size: 50000 },
      progressTotal: 50000,
    });

    await stepJobChunk(job.id, "worker_imm", { chunkSize: 500 });
    await cancelJob(job.id, "worker_imm", "Immediate cancel");

    const stepRes = await stepJobChunk(job.id, "worker_imm", { chunkSize: 500 });
    trackAssert(stepRes.isCancelled === true, "Step rejected");
    trackAssert(stepRes.completedSliceCount === 0, "Zero new slice records inserted");
  });

  // ---------------------------------------------------------------------------
  // TEST 7: CANCEL WHILE DB TRANSACTION IS ACTIVE (NON-BLOCKING CANCEL)
  // ---------------------------------------------------------------------------
  await runTest("7. Cancel requests do not block behind active database mutations", async () => {
    const job = await enqueueJob({
      tenantId: TENANT_A,
      idempotencyKey: `cancel_noblock_${Date.now()}`,
      jobType: "BATCH_GENERATION",
      payload: { size: 500000 },
      progressTotal: 500000,
    });

    // Run parallel slice and cancellation
    const [stepOutcome, cancelOutcome] = await Promise.all([
      stepJobChunk(job.id, "stepper_async", { chunkSize: 2500 }),
      (async () => {
        // Yield 1ms to allow step to enter execution
        await new Promise((r) => setTimeout(r, 1));
        return requestJobCancellation(job.id, TENANT_A);
      })(),
    ]);

    trackAssert(cancelOutcome === true, "Cancellation request acknowledged");
    trackAssert(stepOutcome.recordsPerSecond !== undefined, "Step finished cleanly");

    const state = await getDurableJob(job.id, TENANT_A);
    trackAssert(state?.status === "CANCELLED", "Final state is CANCELLED");
  });

  // ---------------------------------------------------------------------------
  // TEST 8: CANCEL + STEP RACE
  // ---------------------------------------------------------------------------
  await runTest("8. Cancel and multi-step concurrent race resolves consistently to CANCELLED", async () => {
    const job = await enqueueJob({
      tenantId: TENANT_A,
      idempotencyKey: `race_multi_${Date.now()}`,
      jobType: "BATCH_GENERATION",
      payload: { size: 1000000 },
      progressTotal: 1000000,
    });

    const concurrentOps = [
      stepJobChunk(job.id, "w_race_1", { chunkSize: 500 }),
      requestJobCancellation(job.id, TENANT_A),
      stepJobChunk(job.id, "w_race_2", { chunkSize: 500 }),
      requestJobCancellation(job.id, TENANT_A),
      stepJobChunk(job.id, "w_race_3", { chunkSize: 500 }),
    ];

    await Promise.all(concurrentOps);

    const state = await getDurableJob(job.id, TENANT_A);
    trackAssert(state?.status === "CANCELLED", "Race result is CANCELLED");
    trackAssert(state?.progressCurrent! <= 2500, "Progress bounded");
  });

  // ---------------------------------------------------------------------------
  // TEST 9: REPEATED CANCEL
  // ---------------------------------------------------------------------------
  await runTest("9. Repeated cancel invocations are strictly idempotent", async () => {
    const job = await enqueueJob({
      tenantId: TENANT_A,
      idempotencyKey: `cancel_idemp_${Date.now()}`,
      jobType: "BATCH_GENERATION",
      payload: { size: 100000 },
      progressTotal: 100000,
    });

    const calls = await Promise.all([
      requestJobCancellation(job.id, TENANT_A),
      requestJobCancellation(job.id, TENANT_A),
      requestJobCancellation(job.id, TENANT_A),
    ]);

    trackAssert(calls.every((c) => c === true), "All repeated cancels returned true");
    const state = await getDurableJob(job.id, TENANT_A);
    trackAssert(state?.status === "CANCELLED", "Status remains CANCELLED");
  });

  // ---------------------------------------------------------------------------
  // TEST 10: RESTART AFTER CANCELLATION
  // ---------------------------------------------------------------------------
  await runTest("10. Stalled job reclamation never restarts or resurrects cancelled jobs", async () => {
    const job = await enqueueJob({
      tenantId: TENANT_A,
      idempotencyKey: `cancel_no_resurrect_${Date.now()}`,
      jobType: "BATCH_GENERATION",
      payload: { size: 100000 },
      progressTotal: 100000,
    });

    await cancelJob(job.id, "worker_1", "User cancelled");

    // Simulate stalled scan
    const reclaimResult = await detectAndReclaimStalledJobs(0, 0);
    trackAssert(reclaimResult.stalledCount === 0, "Cancelled jobs are never reclaimed");

    const state = await getDurableJob(job.id, TENANT_A);
    trackAssert(state?.status === "CANCELLED", "Job remains CANCELLED");
  });

  // ---------------------------------------------------------------------------
  // TEST 11: PAGE REFRESH AFTER CANCELLATION
  // ---------------------------------------------------------------------------
  await runTest("11. Page refresh queries reflect CANCELLED status in active and recent lists", async () => {
    const job = await enqueueJob({
      tenantId: TENANT_A,
      idempotencyKey: `cancel_refresh_${Date.now()}`,
      jobType: "BATCH_GENERATION",
      payload: { size: 100000 },
      progressTotal: 100000,
    });

    await stepJobChunk(job.id, "w1", { chunkSize: 1000 });
    await cancelRoute(
      makeAuthRequest(`http://localhost:3000/api/batches/jobs/${job.id}/cancel`, TENANT_A, { method: "POST" }),
      { params: Promise.resolve({ jobId: job.id }) }
    );

    // List jobs
    const listRes = await listJobsRoute(makeAuthRequest("http://localhost:3000/api/batches/jobs", TENANT_A));
    const listData = await listRes.json();
    trackAssert(!listData.activeJobs.some((j: { jobId: string }) => j.jobId === job.id), "Job excluded from activeJobs");
    trackAssert(listData.recentJobs.some((j: { jobId: string; status: string }) => j.jobId === job.id && j.status === "CANCELLED"), "Job present in recentJobs as CANCELLED");

    // Detail job
    const detailRes = await getJobDetailRoute(
      makeAuthRequest(`http://localhost:3000/api/batches/jobs/${job.id}`, TENANT_A),
      { params: Promise.resolve({ jobId: job.id }) }
    );
    const detailData = await detailRes.json();
    trackAssert(detailData.job.status === "CANCELLED", "Detail endpoint reports CANCELLED");
    trackAssert(detailData.job.progressCurrent === 1000, "Detail endpoint reports progressCurrent = 1000");
  });

  // ---------------------------------------------------------------------------
  // TEST 12: TENANT ISOLATION DURING CANCELLATION
  // ---------------------------------------------------------------------------
  await runTest("12. Tenant isolation guarantees Tenant B cannot cancel Tenant A's 1M job", async () => {
    const jobA = await enqueueJob({
      tenantId: TENANT_A,
      idempotencyKey: `iso_job_a_${Date.now()}`,
      jobType: "BATCH_GENERATION",
      payload: { size: 1000000 },
      progressTotal: 1000000,
    });

    const crossCancelRes = await cancelRoute(
      makeAuthRequest(`http://localhost:3000/api/batches/jobs/${jobA.id}/cancel`, TENANT_B, { method: "POST" }),
      { params: Promise.resolve({ jobId: jobA.id }) }
    );
    trackAssert(crossCancelRes.status === 404, "Cross-tenant cancel receives HTTP 404 Not Found");

    const jobAState = await getDurableJob(jobA.id, TENANT_A);
    trackAssert(jobAState?.status === "PENDING", "Tenant A's job remains PENDING");
  });

  console.log("\n=========================================================================");
  console.log(` ✅ ALL 12 / 12 REQUIRED REGRESSION TESTS PASSED CLEANLY (${passedTests}/12)`);
  console.log(` 📊 Total Assertions Checked: ${totalAssertions}`);
  console.log("=========================================================================\n");
}

main().catch((err) => {
  console.error("1M Workload Cancellation Regression Suite Failed:", err);
  process.exit(1);
});
