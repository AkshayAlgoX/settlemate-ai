/*
 * SettleMate AI — Verification Hub Async Progress & Stepped Execution Tests
 */

import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST as verifyPost } from "../run/route";
import { GET as progressGet, POST as progressPost } from "./[jobId]/route";

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log("  ✓ " + name);
  } catch (err) {
    console.error("  ✗ " + name + " — " + (err as Error).message);
    throw err;
  }
}

async function main() {
  console.log("\n=========================================================================");
  console.log(" 🛡️  SETTLEMATE AI — VERIFICATION ASYNC PROGRESS & STEPPED TESTS");
  console.log("=========================================================================\n");

  // 1. Nonexistent Job returns 404
  await test("GET /api/verify/progress/[jobId] returns 404 for invalid jobId", async () => {
    const req = new NextRequest("http://localhost:3000/api/verify/progress/verify_nonexistent_9999");
    const res = await progressGet(req, {
      params: Promise.resolve({ jobId: "verify_nonexistent_9999" }),
    });
    assert.equal(res.status, 404);
  });

  // 2. Async Job Creation Contract
  await test("POST /api/verify/run with async:true returns 202 and starts at 0% progress", async () => {
    const postReq = new NextRequest("http://localhost:3000/api/verify/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suites: ["benchmark", "receipt"], async: true }),
    });

    const postRes = await verifyPost(postReq);
    assert.equal(postRes.status, 202);

    const postJson = await postRes.json();
    assert.equal(postJson.success, true);
    assert.ok(postJson.jobId.startsWith("verify_"));
    assert.equal(postJson.status, "RUNNING");
    assert.equal(postJson.totalSuites, 2);

    const getReq = new NextRequest(`http://localhost:3000/api/verify/progress/${postJson.jobId}`);
    const getRes = await progressGet(getReq, {
      params: Promise.resolve({ jobId: postJson.jobId }),
    });
    const getJson = await getRes.json();
    assert.equal(getJson.job.overallProgressPct, 0);
    assert.equal(getJson.job.completedSuites, 0);
    assert.equal(getJson.job.results.benchmark.status, "PENDING");
    assert.equal(getJson.job.results.receipt.status, "PENDING");
  });

  // 3. Stepped Execution Across All 7 Suites with Live Real-Time Progress Updates
  await test("POST /api/verify/progress/[jobId] advances real progress strictly (14% -> 29% -> ... -> 100%)", async () => {
    const all7Suites = [
      "benchmark",
      "cardinality",
      "claim-validator",
      "cross-partition",
      "chaos",
      "receipt",
      "finance-ops",
    ];

    const createReq = new NextRequest("http://localhost:3000/api/verify/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suites: all7Suites, async: true }),
    });

    const createRes = await verifyPost(createReq);
    const createJson = await createRes.json();
    const jobId = createJson.jobId;

    const progressObservations: number[] = [];
    const completedCounts: number[] = [];

    // Step through each suite one by one
    for (let step = 1; step <= all7Suites.length; step++) {
      const stepReq = new NextRequest(`http://localhost:3000/api/verify/progress/${jobId}`, {
        method: "POST",
      });
      const stepRes = await progressPost(stepReq, {
        params: Promise.resolve({ jobId }),
      });
      assert.equal(stepRes.status, 200);

      const stepJson = await stepRes.json();
      assert.equal(stepJson.success, true);
      assert.equal(stepJson.job.jobId, jobId);

      const job = stepJson.job;
      progressObservations.push(job.overallProgressPct);
      completedCounts.push(job.completedSuites);

      const targetSuiteId = all7Suites[step - 1];
      assert.equal(job.results[targetSuiteId].status, "PASS", `Suite ${targetSuiteId} should PASS`);
      assert.ok(job.results[targetSuiteId].durationMs >= 0);
      assert.ok(job.results[targetSuiteId].rawOutputSnippet.length > 0);

      const expectedPct = Math.round((step / all7Suites.length) * 100);
      assert.equal(job.overallProgressPct, expectedPct, `Step ${step} should be ${expectedPct}%`);
      assert.equal(job.completedSuites, step, `Step ${step} should have ${step} completed suites`);
    }

    // Verify strictly monotonic progress sequence
    assert.deepEqual(progressObservations, [14, 29, 43, 57, 71, 86, 100]);
    assert.deepEqual(completedCounts, [1, 2, 3, 4, 5, 6, 7]);

    // Verify terminal completion state
    const finalReq = new NextRequest(`http://localhost:3000/api/verify/progress/${jobId}`);
    const finalRes = await progressGet(finalReq, {
      params: Promise.resolve({ jobId }),
    });
    const finalJson = await finalRes.json();
    assert.equal(finalJson.job.status, "COMPLETED");
    assert.equal(finalJson.job.allPassed, true);
    assert.equal(finalJson.job.overallProgressPct, 100);
    assert.equal(finalJson.job.completedSuites, 7);
    assert.ok(finalJson.job.totalDurationMs > 0);
  });

  // 4. Idempotency after completion
  await test("POST /api/verify/progress/[jobId] on completed job returns COMPLETED idempotently", async () => {
    const createReq = new NextRequest("http://localhost:3000/api/verify/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suites: ["receipt"], async: true }),
    });
    const createRes = await verifyPost(createReq);
    const { jobId } = await createRes.json();

    // Step 1: Execute single suite to completion
    const stepReq = new NextRequest(`http://localhost:3000/api/verify/progress/${jobId}`, {
      method: "POST",
    });
    const stepRes = await progressPost(stepReq, {
      params: Promise.resolve({ jobId }),
    });
    const stepJson = await stepRes.json();
    assert.equal(stepJson.job.status, "COMPLETED");

    // Step 2: Extra step call should return completed job cleanly without errors
    const extraReq = new NextRequest(`http://localhost:3000/api/verify/progress/${jobId}`, {
      method: "POST",
    });
    const extraRes = await progressPost(extraReq, {
      params: Promise.resolve({ jobId }),
    });
    const extraJson = await extraRes.json();
    assert.equal(extraJson.job.status, "COMPLETED");
    assert.equal(extraJson.job.overallProgressPct, 100);
  });

  console.log("\n=========================================================================");
  console.log(" ✅ ALL 4 VERIFICATION ASYNC PROGRESS & STEPPED TESTS PASSED");
  console.log("=========================================================================\n");
}

void main();
