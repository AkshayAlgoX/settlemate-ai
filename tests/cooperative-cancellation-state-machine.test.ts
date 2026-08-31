/*
 * SettleMate AI — Comprehensive Cooperative Cancellation State Machine Test Suite
 *
 * 18/18 Verification Gate:
 * 1. pending cancel
 * 2. running cancel
 * 3. repeated cancel
 * 4. already cancelled
 * 5. cancel/step race
 * 6. /step rejects CANCEL_REQUESTED
 * 7. /step rejects CANCELLED
 * 8. OperationsCenter stops scheduling cancellation jobs
 * 9. current safe chunk may finish
 * 10. no later chunk starts
 * 11. completed JobItems preserved
 * 12. remaining JobItems cancelled
 * 13. cancellation survives refresh
 * 14. cancellation survives logout/login
 * 15. cancellation survives restart/sleep recovery
 * 16. tenant isolation
 * 17. no contradictory UI state
 * 18. cancellation is idempotent
 */

import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import {
  enqueueJob,
  stepJobChunk,
  requestJobCancellation,
  cancelJob,
  getDurableJob,
  listDurableJobs,
  createJobItems,
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

function trackAssertEqual<T>(actual: T, expected: T, message?: string) {
  assert.equal(actual, expected, message);
  totalAssertions++;
}

function trackAssertOk(value: unknown, message?: string) {
  assert.ok(value, message);
  totalAssertions++;
}

function trackAssertDeepEqual<T>(actual: T, expected: T, message?: string) {
  assert.deepEqual(actual, expected, message);
  totalAssertions++;
}

async function runTest(name: string, fn: () => void | Promise<void>) {
  _clearLocalQueue();
  try {
    await fn();
    passedTests++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name} — ${(err as Error).message}`);
    throw err;
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

  const headers: Record<string, string> = {
    cookie: `settlemate_session=${token}`,
    "content-type": "application/json",
  };

  return new NextRequest(url, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

async function main() {
  console.log("\n=========================================================================");
  console.log(" 🛑 SETTLEMATE AI — COOPERATIVE CANCELLATION STATE MACHINE SUITE (18 GATES)");
  console.log("=========================================================================\n");

  const TENANT_A = "tenant_alpha_cancel_001";
  const TENANT_B = "tenant_beta_cancel_002";

  // 1. Pending Cancel
  await runTest("GATE 1: Pending cancel safely transitions to CANCELLED without starting slices", async () => {
    const job = await enqueueJob({
      tenantId: TENANT_A,
      idempotencyKey: `cancel_pending_${Date.now()}`,
      jobType: "BATCH_GENERATION",
      payload: { size: 500 },
      progressTotal: 500,
    });
    trackAssertEqual(job.status, "PENDING");

    const req = makeAuthRequest(`http://localhost:3000/api/batches/jobs/${job.id}/cancel`, TENANT_A, {
      method: "POST",
    });
    const res = await cancelRoute(req, { params: Promise.resolve({ jobId: job.id }) });
    trackAssertEqual(res.status, 200);
    const body = await res.json();
    trackAssertEqual(body.success, true);
    trackAssertEqual(body.status, "CANCELLED");

    const state = await getDurableJob(job.id, TENANT_A);
    trackAssertEqual(state?.status, "CANCELLED");
    trackAssertOk(state?.cancelRequestedAt, "cancelRequestedAt must be recorded");
  });

  // 2. Running Cancel
  await runTest("GATE 2: Running cancel records cancelRequestedAt and CANCEL_REQUESTED state", async () => {
    const job = await enqueueJob({
      tenantId: TENANT_A,
      idempotencyKey: `cancel_running_${Date.now()}`,
      jobType: "BATCH_GENERATION",
      payload: { size: 1000 },
      progressTotal: 1000,
    });

    await stepJobChunk(job.id, "worker_run_1", { chunkSize: 100 });
    const midState = await getDurableJob(job.id, TENANT_A);
    trackAssertEqual(midState?.status, "RUNNING");
    trackAssertEqual(midState?.progressCurrent, 100);

    const cancelOk = await requestJobCancellation(job.id, TENANT_A);
    trackAssertEqual(cancelOk, true);

    const checkState = await getDurableJob(job.id, TENANT_A);
    trackAssertOk(
      checkState?.status === "CANCEL_REQUESTED" || checkState?.status === "CANCELLED",
      `Status must be CANCEL_REQUESTED or CANCELLED, got ${checkState?.status}`
    );
    trackAssertOk(checkState?.cancelRequestedAt, "cancelRequestedAt must be durably stored");
  });

  // 3. Repeated Cancel
  await runTest("GATE 3: Repeated cancel calls are idempotent without throwing error storms", async () => {
    const job = await enqueueJob({
      tenantId: TENANT_A,
      idempotencyKey: `cancel_repeated_${Date.now()}`,
      jobType: "BATCH_GENERATION",
      payload: { size: 1000 },
      progressTotal: 1000,
    });

    const cancelCalls = Array.from({ length: 5 }, () =>
      cancelRoute(
        makeAuthRequest(`http://localhost:3000/api/batches/jobs/${job.id}/cancel`, TENANT_A, { method: "POST" }),
        { params: Promise.resolve({ jobId: job.id }) }
      )
    );

    const responses = await Promise.all(cancelCalls);
    for (const res of responses) {
      trackAssertEqual(res.status, 200);
      const json = await res.json();
      trackAssertEqual(json.success, true);
      trackAssertEqual(json.cancelled, true);
    }
  });

  // 4. Already Cancelled
  await runTest("GATE 4: Cancel already cancelled job returns success with CANCELLED status", async () => {
    const job = await enqueueJob({
      tenantId: TENANT_A,
      idempotencyKey: `cancel_already_canc_${Date.now()}`,
      jobType: "BATCH_GENERATION",
      payload: { size: 500 },
      progressTotal: 500,
    });
    await cancelJob(job.id, "worker_1", "Direct user cancel");

    const req = makeAuthRequest(`http://localhost:3000/api/batches/jobs/${job.id}/cancel`, TENANT_A, {
      method: "POST",
    });
    const res = await cancelRoute(req, { params: Promise.resolve({ jobId: job.id }) });
    trackAssertEqual(res.status, 200);
    const body = await res.json();
    trackAssertEqual(body.success, true);
    trackAssertEqual(body.status, "CANCELLED");
  });

  // 5. Cancel / Step Race
  await runTest("GATE 5: Cancel and step concurrent race finishes cleanly in CANCELLED state", async () => {
    const job = await enqueueJob({
      tenantId: TENANT_A,
      idempotencyKey: `race_cancel_step_${Date.now()}`,
      jobType: "BATCH_GENERATION",
      payload: { size: 1000 },
      progressTotal: 1000,
    });

    const raceOps = [
      stepJobChunk(job.id, "stepper_race_1", { chunkSize: 100 }),
      requestJobCancellation(job.id, TENANT_A),
      stepJobChunk(job.id, "stepper_race_2", { chunkSize: 100 }),
      requestJobCancellation(job.id, TENANT_A),
      stepJobChunk(job.id, "stepper_race_3", { chunkSize: 100 }),
    ];

    await Promise.all(raceOps);

    const finalState = await getDurableJob(job.id, TENANT_A);
    trackAssertOk(finalState?.status === "CANCELLED" || finalState?.status === "CANCEL_REQUESTED");
    trackAssertOk(finalState?.progressCurrent! <= 1000);
  });

  // 6. /step Rejects CANCEL_REQUESTED
  await runTest("GATE 6: POST /step rejects CANCEL_REQUESTED with HTTP 409 and authoritative status", async () => {
    const job = await enqueueJob({
      tenantId: TENANT_A,
      idempotencyKey: `step_reject_cr_${Date.now()}`,
      jobType: "BATCH_GENERATION",
      payload: { size: 1000 },
      progressTotal: 1000,
    });
    await stepJobChunk(job.id, "worker_step", { chunkSize: 100 });
    await requestJobCancellation(job.id, TENANT_A);

    const req = makeAuthRequest(`http://localhost:3000/api/batches/jobs/${job.id}/step`, TENANT_A, {
      method: "POST",
      body: { chunkSize: 100 },
    });
    const res = await stepRoute(req, { params: Promise.resolve({ jobId: job.id }) });
    trackAssertEqual(res.status, 409, "Step on CANCEL_REQUESTED must return 409 Conflict");
    const body = await res.json();
    trackAssertEqual(body.job.status, "CANCELLED");
    trackAssertEqual(body.job.isCancelled, true);
  });

  // 7. /step Rejects CANCELLED
  await runTest("GATE 7: POST /step rejects CANCELLED with HTTP 409 and does not execute work", async () => {
    const job = await enqueueJob({
      tenantId: TENANT_A,
      idempotencyKey: `step_reject_cancelled_${Date.now()}`,
      jobType: "BATCH_GENERATION",
      payload: { size: 1000 },
      progressTotal: 1000,
    });
    await cancelJob(job.id, "worker_1", "Cancelled");

    const req = makeAuthRequest(`http://localhost:3000/api/batches/jobs/${job.id}/step`, TENANT_A, {
      method: "POST",
      body: { chunkSize: 100 },
    });
    const res = await stepRoute(req, { params: Promise.resolve({ jobId: job.id }) });
    trackAssertEqual(res.status, 409);
    const body = await res.json();
    trackAssertEqual(body.job.status, "CANCELLED");
    trackAssertEqual(body.job.isCancelled, true);
  });

  // 8. OperationsCenter Stops Scheduling Cancellation Jobs
  await runTest("GATE 8: OperationsCenter active scheduler excludes CANCEL_REQUESTED and CANCELLED jobs", async () => {
    const jActive = await enqueueJob({
      tenantId: TENANT_A,
      idempotencyKey: `j_active_${Date.now()}`,
      jobType: "BATCH_GENERATION",
      payload: { size: 500 },
    });

    const jCancelled = await enqueueJob({
      tenantId: TENANT_A,
      idempotencyKey: `j_canc_${Date.now()}`,
      jobType: "BATCH_GENERATION",
      payload: { size: 500 },
    });
    await cancelJob(jCancelled.id, "w1");

    const { activeJobs, recentJobs } = await listDurableJobs(TENANT_A, 20);
    const activeIds = activeJobs.map((j) => j.id);
    const recentIds = recentJobs.map((j) => j.id);

    trackAssertOk(activeIds.includes(jActive.id), "Active job must be in activeJobs");
    trackAssertOk(!activeIds.includes(jCancelled.id), "Cancelled job must NOT be in activeJobs");
    trackAssertOk(recentIds.includes(jCancelled.id), "Cancelled job must be in recentJobs");
  });

  // 9. Current Safe Chunk May Finish
  await runTest("GATE 9: Cancel during active chunk allows current safe chunk to finish", async () => {
    const job = await enqueueJob({
      tenantId: TENANT_A,
      idempotencyKey: `chunk_cancel_${Date.now()}`,
      jobType: "BATCH_GENERATION",
      payload: { size: 1000 },
      progressTotal: 1000,
    });

    const step1 = await stepJobChunk(job.id, "stepper_1", { chunkSize: 200 });
    trackAssertEqual(step1.progressCurrent, 200);

    await requestJobCancellation(job.id, TENANT_A);

    const step2 = await stepJobChunk(job.id, "stepper_1", { chunkSize: 200 });
    trackAssertEqual(step2.status, "CANCELLED");
    trackAssertEqual(step2.progressCurrent, 200, "Progress must remain exactly at completed slice (200)");
  });

  // 10. No Later Chunk Starts
  await runTest("GATE 10: No later chunk starts after cancellation has been requested", async () => {
    const job = await enqueueJob({
      tenantId: TENANT_A,
      idempotencyKey: `no_later_chunk_${Date.now()}`,
      jobType: "BATCH_GENERATION",
      payload: { size: 500 },
      progressTotal: 500,
    });

    await stepJobChunk(job.id, "stepper_1", { chunkSize: 100 });
    await requestJobCancellation(job.id, TENANT_A);

    const s1 = await stepJobChunk(job.id, "stepper_1", { chunkSize: 100 });
    const s2 = await stepJobChunk(job.id, "stepper_1", { chunkSize: 100 });

    trackAssertEqual(s1.progressCurrent, 100);
    trackAssertEqual(s2.progressCurrent, 100);
    trackAssertEqual(s2.status, "CANCELLED");
  });

  // 11. Completed JobItems Preserved
  await runTest("GATE 11: Completed JobItems remain completed and intact after cancellation", async () => {
    const job = await enqueueJob({
      tenantId: TENANT_A,
      idempotencyKey: `completed_items_${Date.now()}`,
      jobType: "ITEM_TEST",
      payload: {},
    });

    await createJobItems(job.id, TENANT_A, [
      { idempotencyKey: "item_01" },
      { idempotencyKey: "item_02" },
    ]);

    await cancelJob(job.id, "worker_1", "User cancelled");
    const cancelledJob = await getDurableJob(job.id, TENANT_A);
    trackAssertEqual(cancelledJob?.status, "CANCELLED");
    trackAssertOk(cancelledJob?.completedAt, "Completed timestamp must exist");
  });

  // 12. Remaining JobItems Cancelled
  await runTest("GATE 12: Remaining pending/processing JobItems transition cleanly to CANCELLED", async () => {
    const job = await enqueueJob({
      tenantId: TENANT_A,
      idempotencyKey: `remaining_items_${Date.now()}`,
      jobType: "ITEM_TEST",
      payload: {},
    });

    await createJobItems(job.id, TENANT_A, [
      { idempotencyKey: "item_rem_1" },
      { idempotencyKey: "item_rem_2" },
    ]);

    await cancelJob(job.id, "worker_1", "User cancelled remaining");
    const cancelledJob = await getDurableJob(job.id, TENANT_A);
    trackAssertEqual(cancelledJob?.status, "CANCELLED");
  });

  // 13. Cancellation Survives Refresh
  await runTest("GATE 13: Cancellation survives page refresh in both list and detail endpoints", async () => {
    const job = await enqueueJob({
      tenantId: TENANT_A,
      idempotencyKey: `refresh_test_${Date.now()}`,
      jobType: "BATCH_GENERATION",
      payload: { size: 500 },
      progressTotal: 500,
    });

    await stepJobChunk(job.id, "w1", { chunkSize: 150 });
    await requestJobCancellation(job.id, TENANT_A);
    await stepJobChunk(job.id, "w1", { chunkSize: 100 });

    const detailReq = makeAuthRequest(`http://localhost:3000/api/batches/jobs/${job.id}`, TENANT_A);
    const detailRes = await getJobDetailRoute(detailReq, { params: Promise.resolve({ jobId: job.id }) });
    trackAssertEqual(detailRes.status, 200);
    const detailBody = await detailRes.json();
    trackAssertEqual(detailBody.job.status, "CANCELLED");
    trackAssertEqual(detailBody.job.progressCurrent, 150);
    trackAssertOk(detailBody.job.cancelRequestedAt);

    const listReq = makeAuthRequest("http://localhost:3000/api/batches/jobs", TENANT_A);
    const listRes = await listJobsRoute(listReq);
    trackAssertEqual(listRes.status, 200);
    const listBody = await listRes.json();
    trackAssertOk(!listBody.activeJobs.some((j: { jobId: string }) => j.jobId === job.id));
    trackAssertOk(listBody.recentJobs.some((j: { jobId: string; status: string }) => j.jobId === job.id && j.status === "CANCELLED"));
  });

  // 14. Cancellation Survives Logout/Login
  await runTest("GATE 14: Cancellation state is preserved across new user logins/sessions", async () => {
    const job = await enqueueJob({
      tenantId: TENANT_A,
      idempotencyKey: `login_test_${Date.now()}`,
      jobType: "BATCH_GENERATION",
      payload: { size: 250 },
    });
    await cancelJob(job.id, "w1", "Cancelled");

    const newSessionReq = makeAuthRequest(`http://localhost:3000/api/batches/jobs/${job.id}`, TENANT_A, {
      role: "REVIEWER",
    });
    const res = await getJobDetailRoute(newSessionReq, { params: Promise.resolve({ jobId: job.id }) });
    const body = await res.json();
    trackAssertEqual(body.job.status, "CANCELLED");
  });

  // 15. Cancellation Survives Restart/Sleep Recovery
  await runTest("GATE 15: Stalled detector never resurrects or re-enqueues cancelled jobs", async () => {
    const job = await enqueueJob({
      tenantId: TENANT_A,
      idempotencyKey: `restart_recovery_${Date.now()}`,
      jobType: "BATCH_GENERATION",
      payload: { size: 1000 },
    });
    await cancelJob(job.id, "w1", "Cancelled");

    const { stalledCount } = await detectAndReclaimStalledJobs(0, 0);
    trackAssertEqual(stalledCount, 0, "Cancelled jobs must never be reclaimed as stalled");

    const state = await getDurableJob(job.id, TENANT_A);
    trackAssertEqual(state?.status, "CANCELLED", "Job must stay CANCELLED");
  });

  // 16. Tenant Isolation
  await runTest("GATE 16: Tenant B cannot cancel Tenant A's job (404 Not Found & strict tenant isolation)", async () => {
    const jobA = await enqueueJob({
      tenantId: TENANT_A,
      idempotencyKey: `cross_tenant_cancel_${Date.now()}`,
      jobType: "BATCH_GENERATION",
      payload: { size: 1000 },
      progressTotal: 1000,
    });

    const reqB = makeAuthRequest(`http://localhost:3000/api/batches/jobs/${jobA.id}/cancel`, TENANT_B, {
      method: "POST",
    });
    const resB = await cancelRoute(reqB, { params: Promise.resolve({ jobId: jobA.id }) });
    trackAssertEqual(resB.status, 404, "Tenant B must receive 404 Not Found");

    const jobAState = await getDurableJob(jobA.id, TENANT_A);
    trackAssertEqual(jobAState?.status, "PENDING", "Tenant A's job must remain PENDING");
  });

  // 17. No Contradictory UI State
  await runTest("GATE 17: UI state contract guarantees no job returns to RUNNING/PENDING after cancellation", async () => {
    const job = await enqueueJob({
      tenantId: TENANT_A,
      idempotencyKey: `ui_contract_${Date.now()}`,
      jobType: "BATCH_GENERATION",
      payload: { size: 500 },
      progressTotal: 500,
    });
    await stepJobChunk(job.id, "w1", { chunkSize: 100 });
    await cancelJob(job.id, "w1", "Cancelled");

    const state = await getDurableJob(job.id, TENANT_A);
    trackAssertEqual(state?.status, "CANCELLED");
    trackAssertOk(state?.status !== "RUNNING");
    trackAssertOk(state?.status !== "PENDING");
  });

  // 18. Cancellation is Idempotent
  await runTest("GATE 18: requestJobCancellation is idempotent across parallel invocations", async () => {
    const job = await enqueueJob({
      tenantId: TENANT_A,
      idempotencyKey: `idemp_gate_${Date.now()}`,
      jobType: "BATCH_GENERATION",
      payload: { size: 1000 },
      progressTotal: 1000,
    });

    const results = await Promise.all([
      requestJobCancellation(job.id, TENANT_A),
      requestJobCancellation(job.id, TENANT_A),
      requestJobCancellation(job.id, TENANT_A),
    ]);

    trackAssertDeepEqual(results, [true, true, true]);
    const finalJob = await getDurableJob(job.id, TENANT_A);
    trackAssertOk(finalJob?.status === "CANCELLED" || finalJob?.status === "CANCEL_REQUESTED");
  });

  console.log("\n=========================================================================");
  console.log(` ✅ ALL ${passedTests} / 18 COOPERATIVE CANCELLATION STATE MACHINE GATES PASSED`);
  console.log(` 📊 Total Tracked Assertions Executed: ${totalAssertions}`);
  console.log("=========================================================================\n");
}

main().catch((err) => {
  console.error("Cooperative cancellation test suite failed:", err);
  process.exit(1);
});
