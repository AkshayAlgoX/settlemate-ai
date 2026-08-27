/*
 * SettleMate AI — Verification Hub Async Progress Tests
 */

import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST as verifyPost } from "../run/route";
import { GET as progressGet } from "./[jobId]/route";

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
  console.log(" 🛡️  SETTLEMATE AI — VERIFICATION ASYNC PROGRESS TESTS");
  console.log("=========================================================================\n");

  // 1. Nonexistent Job returns 404
  await test("GET /api/verify/progress/[jobId] returns 404 for invalid jobId", async () => {
    const req = new NextRequest("http://localhost:3000/api/verify/progress/verify_nonexistent_9999");
    const res = await progressGet(req, {
      params: Promise.resolve({ jobId: "verify_nonexistent_9999" }),
    });
    assert.equal(res.status, 404);
  });

  // 2. Async Execution and Polling
  await test("POST /api/verify/run with async:true returns 202 and tracks progress to completion", async () => {
    const postReq = new NextRequest("http://localhost:3000/api/verify/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suites: ["receipt"], async: true }),
    });

    const postRes = await verifyPost(postReq);
    assert.equal(postRes.status, 202);

    const postJson = await postRes.json();
    assert.equal(postJson.success, true);
    assert.ok(postJson.jobId.startsWith("verify_"));
    assert.equal(postJson.status, "RUNNING");

    const jobId = postJson.jobId;

    // Poll until completed (timeout at 15s)
    let completed = false;
    const start = Date.now();
    while (Date.now() - start < 15000) {
      const getReq = new NextRequest(`http://localhost:3000/api/verify/progress/${jobId}`);
      const getRes = await progressGet(getReq, {
        params: Promise.resolve({ jobId }),
      });
      assert.equal(getRes.status, 200);

      const getJson = await getRes.json();
      assert.equal(getJson.success, true);
      assert.equal(getJson.job.jobId, jobId);

      if (getJson.job.status === "COMPLETED") {
        completed = true;
        assert.equal(getJson.job.allPassed, true);
        assert.equal(getJson.job.overallProgressPct, 100);
        assert.ok(getJson.job.results.receipt);
        assert.equal(getJson.job.results.receipt.status, "PASS");
        break;
      }

      await new Promise((r) => setTimeout(r, 500));
    }

    assert.equal(completed, true, "Async verification job should complete within timeout");
  });

  console.log("\nverify-progress: ALL 2 TESTS PASSED\n");
}

void main();
