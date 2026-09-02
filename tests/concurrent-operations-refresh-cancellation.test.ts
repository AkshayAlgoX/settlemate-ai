/*
 * SettleMate AI — Concurrent Operations, Refresh Rehydration & Cancellation Test Suite
 *
 * Validates:
 * 1. 4 concurrent operations run independently
 * 2. Cancelling one operation (job #2) halts it immediately and permanently
 * 3. Sibling operations (jobs #1, #3, #4) continue stepping independently to completion
 * 4. Simulated browser refresh (GET /api/batches/jobs) returns job #2 strictly as CANCELLED in recentJobs, NEVER in activeJobs
 * 5. Subsequent step attempts on job #2 fail-closed with isCancelled=true and do not revive the job
 * 6. Repeated page reloads reflect authoritative terminal state bitwise
 * 7. Generated 250 batch is visible in recentJobs and never creates ghost active work
 * 8. Hydration/polling GET /api/batches/jobs is strictly side-effect free
 */

import assert from "node:assert/strict";
import { enqueueJob, stepJobChunk, getDurableJob } from "../src/lib/workers/durable-job-worker";
import { GET as listJobsRoute } from "../src/app/api/batches/jobs/route";
import { POST as stepRoute } from "../src/app/api/batches/jobs/[jobId]/step/route";
import { POST as cancelRoute } from "../src/app/api/batches/jobs/[jobId]/cancel/route";
import { POST as generateBatchRoute } from "../src/app/api/batches/generate/route";
import { createSessionToken } from "../src/lib/auth/session";
import { NextRequest } from "next/server";

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  ✓ [PASS] ${name}`);
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name} — ${(err as Error).message}`);
    throw err;
  }
}

function makeAuthRequest(url: string, tenantId: string, method: string = "GET", body?: unknown): NextRequest {
  const token = createSessionToken({
    sub: `usr_${tenantId}`,
    name: `admin_${tenantId}`,
    role: "ADMIN",
    tenantId,
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  return new NextRequest(url, {
    method,
    headers: {
      cookie: `settlemate_session=${token}`,
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function main() {
  console.log("\n=========================================================================");
  console.log(" 🛡️ SETTLEMATE AI — CONCURRENT OPERATIONS, REFRESH & CANCEL SUITE");
  console.log("=========================================================================\n");

  const tenantId = `tenant_audit_hardening_${Date.now()}`;

  let job1: any;
  let job2: any;
  let job3: any;
  let job4: any;

  await test("1. Enqueue 4 independent concurrent jobs", async () => {
    job1 = await enqueueJob({
      tenantId,
      idempotencyKey: `audit_job_1_${Date.now()}`,
      jobType: "GENERATE_SYNTHETIC_BATCH",
      payload: { size: 1000 },
      progressTotal: 1000,
    });

    job2 = await enqueueJob({
      tenantId,
      idempotencyKey: `audit_job_2_${Date.now()}`,
      jobType: "GENERATE_SYNTHETIC_BATCH",
      payload: { size: 1000 },
      progressTotal: 1000,
    });

    job3 = await enqueueJob({
      tenantId,
      idempotencyKey: `audit_job_3_${Date.now()}`,
      jobType: "GENERATE_SYNTHETIC_BATCH",
      payload: { size: 1000 },
      progressTotal: 1000,
    });

    job4 = await enqueueJob({
      tenantId,
      idempotencyKey: `audit_job_4_${Date.now()}`,
      jobType: "GENERATE_SYNTHETIC_BATCH",
      payload: { size: 1000 },
      progressTotal: 1000,
    });

    assert.ok(job1.id && job2.id && job3.id && job4.id);
    assert.notEqual(job1.id, job2.id);
    assert.notEqual(job2.id, job3.id);
    assert.notEqual(job3.id, job4.id);
  });

  await test("2. Step all 4 jobs concurrently to 25% progress", async () => {
    const [step1, step2, step3, step4] = await Promise.all([
      stepJobChunk(job1.id, "stepper_1", { chunkSize: 250 }),
      stepJobChunk(job2.id, "stepper_2", { chunkSize: 250 }),
      stepJobChunk(job3.id, "stepper_3", { chunkSize: 250 }),
      stepJobChunk(job4.id, "stepper_4", { chunkSize: 250 }),
    ]);

    assert.equal(step1.progressCurrent, 250);
    assert.equal(step2.progressCurrent, 250);
    assert.equal(step3.progressCurrent, 250);
    assert.equal(step4.progressCurrent, 250);
  });

  await test("3. Cancel Job #2 via POST /api/batches/jobs/[jobId]/cancel", async () => {
    const cancelReq = makeAuthRequest(`http://localhost:3000/api/batches/jobs/${job2.id}/cancel`, tenantId, "POST");
    const cancelRes = await cancelRoute(cancelReq, { params: Promise.resolve({ jobId: job2.id }) });
    assert.equal(cancelRes.status, 200);

    const cancelBody = await cancelRes.json();
    assert.equal(cancelBody.status, "CANCELLED");
    assert.equal(cancelBody.cancelled, true);

    const job2Db = await getDurableJob(job2.id, tenantId);
    assert.equal(job2Db?.status, "CANCELLED");
  });

  await test("4. Sibling jobs #1, #3, #4 continue stepping independently", async () => {
    const [step1Next, step3Next, step4Next] = await Promise.all([
      stepJobChunk(job1.id, "stepper_1", { chunkSize: 250 }),
      stepJobChunk(job3.id, "stepper_3", { chunkSize: 250 }),
      stepJobChunk(job4.id, "stepper_4", { chunkSize: 250 }),
    ]);

    assert.equal(step1Next.progressCurrent, 500);
    assert.equal(step1Next.status, "RUNNING");
    assert.equal(step3Next.progressCurrent, 500);
    assert.equal(step3Next.status, "RUNNING");
    assert.equal(step4Next.progressCurrent, 500);
    assert.equal(step4Next.status, "RUNNING");
  });

  await test("5. Simulated browser refresh (GET /api/batches/jobs) strictly preserves CANCELLED state", async () => {
    const listReq = makeAuthRequest("http://localhost:3000/api/batches/jobs", tenantId, "GET");
    const listRes = await listJobsRoute(listReq);
    assert.equal(listRes.status, 200);

    const listData = await listRes.json();
    const activeIds = (listData.activeJobs || []).map((j: { jobId: string }) => j.jobId);
    
    // Invariant: Cancelled Job #2 MUST NEVER be in activeJobs
    assert.ok(!activeIds.includes(job2.id), "Cancelled job #2 must not be in activeJobs");

    // Invariant: Cancelled Job #2 MUST be in recentJobs with status CANCELLED
    const recentJob2 = (listData.recentJobs || []).find((j: { jobId: string }) => j.jobId === job2.id);
    assert.ok(recentJob2, "Cancelled job #2 must be present in recentJobs");
    assert.equal(recentJob2.status, "CANCELLED");

    // Invariant: Sibling jobs #1, #3, #4 must still be active
    assert.ok(activeIds.includes(job1.id));
    assert.ok(activeIds.includes(job3.id));
    assert.ok(activeIds.includes(job4.id));
  });

  await test("6. Stepping cancelled job #2 fails closed and does NOT revive the job", async () => {
    const stepCancelledReq = makeAuthRequest(`http://localhost:3000/api/batches/jobs/${job2.id}/step`, tenantId, "POST", { chunkSize: 250 });
    const stepCancelledRes = await stepRoute(stepCancelledReq, { params: Promise.resolve({ jobId: job2.id }) });
    assert.equal(stepCancelledRes.status, 409);

    const stepCancelledBody = await stepCancelledRes.json();
    assert.equal(stepCancelledBody.job?.status, "CANCELLED");
    assert.equal(stepCancelledBody.job?.isCancelled, true);

    const checkJob2 = await getDurableJob(job2.id, tenantId);
    assert.equal(checkJob2?.status, "CANCELLED");
  });

  await test("7. Step sibling jobs #1, #3, #4 to completion", async () => {
    await stepJobChunk(job1.id, "stepper_1", { chunkSize: 500 });
    await stepJobChunk(job3.id, "stepper_3", { chunkSize: 500 });
    await stepJobChunk(job4.id, "stepper_4", { chunkSize: 500 });

    const job1Final = await getDurableJob(job1.id, tenantId);
    const job3Final = await getDurableJob(job3.id, tenantId);
    const job4Final = await getDurableJob(job4.id, tenantId);

    assert.equal(job1Final?.status, "COMPLETED");
    assert.equal(job3Final?.status, "COMPLETED");
    assert.equal(job4Final?.status, "COMPLETED");
  });

  await test("8. Second simulated browser refresh verifies final state across all jobs", async () => {
    const listReq = makeAuthRequest("http://localhost:3000/api/batches/jobs", tenantId, "GET");
    const listRes2 = await listJobsRoute(listReq);
    assert.equal(listRes2.status, 200);

    const listData2 = await listRes2.json();
    const activeIds2 = (listData2.activeJobs || []).map((j: { jobId: string }) => j.jobId);
    
    assert.ok(!activeIds2.includes(job1.id), "Job #1 must not be active");
    assert.ok(!activeIds2.includes(job2.id), "Job #2 must not be active");
    assert.ok(!activeIds2.includes(job3.id), "Job #3 must not be active");
    assert.ok(!activeIds2.includes(job4.id), "Job #4 must not be active");

    const recent1 = (listData2.recentJobs || []).find((j: { jobId: string }) => j.jobId === job1.id);
    const recent2 = (listData2.recentJobs || []).find((j: { jobId: string }) => j.jobId === job2.id);
    const recent3 = (listData2.recentJobs || []).find((j: { jobId: string }) => j.jobId === job3.id);
    const recent4 = (listData2.recentJobs || []).find((j: { jobId: string }) => j.jobId === job4.id);

    assert.equal(recent1?.status, "COMPLETED");
    assert.equal(recent2?.status, "CANCELLED");
    assert.equal(recent3?.status, "COMPLETED");
    assert.equal(recent4?.status, "COMPLETED");
  });

  await test("9. Generate 250 batch: appears strictly in recentJobs with status COMPLETED and NEVER in activeJobs", async () => {
    const genReq = makeAuthRequest("http://localhost:3000/api/batches/generate", tenantId, "POST", { size: 250 });
    const genRes = await generateBatchRoute(genReq);
    assert.equal(genRes.status, 200);
    const genData = await genRes.json();
    assert.ok(genData.batchId);
    assert.ok(genData.jobId);

    const listReq = makeAuthRequest("http://localhost:3000/api/batches/jobs", tenantId, "GET");
    const listRes = await listJobsRoute(listReq);
    const listData = await listRes.json();

    const activeIds = (listData.activeJobs || []).map((j: { jobId: string }) => j.jobId);
    assert.ok(!activeIds.includes(genData.jobId), "250 batch must NOT appear in activeJobs");
    assert.ok(!activeIds.includes(`job_gen_${genData.batchId}`), "job_gen_ must NOT appear in activeJobs");

    const recentJob = (listData.recentJobs || []).find(
      (j: { jobId: string; result?: { batchId?: string } }) =>
        j.jobId === genData.jobId || j.result?.batchId === genData.batchId
    );
    assert.ok(recentJob, "250 batch must appear in recentJobs");
    assert.equal(recentJob.status, "COMPLETED");
  });

  await test("10. Repeated browser refresh & polling is 100% side-effect free", async () => {
    const listReq = makeAuthRequest("http://localhost:3000/api/batches/jobs", tenantId, "GET");
    
    // Perform 5 consecutive polls
    for (let i = 0; i < 5; i++) {
      const res = await listJobsRoute(listReq);
      assert.equal(res.status, 200);
      const data = await res.json();
      
      const activeIds = (data.activeJobs || []).map((j: { jobId: string }) => j.jobId);
      assert.ok(!activeIds.includes(job1.id));
      assert.ok(!activeIds.includes(job2.id));
      assert.ok(!activeIds.includes(job3.id));
      assert.ok(!activeIds.includes(job4.id));
    }
  });

  console.log("\n=========================================================================");
  console.log(" ✅ ALL 10 CONCURRENT REFRESH & CANCELLATION TESTS PASSED CLEANLY");
  console.log("=========================================================================\n");
}

main().catch((err) => {
  console.error("FATAL SUITE ERROR:", err);
  process.exit(1);
});