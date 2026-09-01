/*
 * SettleMate AI — Verification Runner Production Safety & In-Process Execution Test Suite
 *
 * Verifies that all 7 Verification Hub suites execute in-process without shelling out
 * to npm/npx/tsx, preventing container OS permission errors in production.
 */

import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST as verifyPost, runSingleSuite } from "@/app/api/verify/run/route";
import { GET as progressGet, POST as progressStepPost } from "@/app/api/verify/progress/[jobId]/route";
import { executeVerificationSuite } from "@/lib/verify/verification-runner";

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  ✓ [PASS] ${name}`);
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name} — ${(err as Error).message}`);
    throw err;
  }
}

async function runSafetyRegressionTests() {
  console.log("\n=========================================================================");
  console.log(" 🛡️ SETTLEMATE AI — VERIFICATION RUNNER IN-PROCESS PRODUCTION SAFETY SUITE");
  console.log("=========================================================================\n");

  // 1. Benchmark in-process execution
  await test("1. Official 250-Record Benchmark executes in-process with 98.1% accuracy", async () => {
    const res = await executeVerificationSuite("benchmark");
    assert.equal(res.status, "PASS");
    assert.equal(res.suiteId, "benchmark");
    assert.equal(res.metrics.accuracy, "98.1%");
    assert.ok(typeof res.metrics.adversarialScore === "string");
    assert.ok(res.rawOutputSnippet.includes("EVALUATION PASSED"));
    assert.ok(!res.rawOutputSnippet.includes("npm error"));
  });

  // 2. Cardinality suite in-process execution
  await test("2. Cardinality Solver Topologies executes in-process with 8/8 passed", async () => {
    const res = await executeVerificationSuite("cardinality");
    assert.equal(res.status, "PASS");
    assert.equal(res.suiteId, "cardinality");
    assert.equal(res.metrics.topologiesPassed, "8/8");
    assert.equal(res.metrics.successScore, "100%");
    assert.equal(res.metrics.combinatorialSafety, "VERIFIED");
    assert.ok(res.rawOutputSnippet.includes("CARDINALITY EVALUATION PASSED"));
  });

  // 3. Claim Validator in-process execution
  await test("3. AI Claim Falsification executes in-process with 100% dispute rate", async () => {
    const res = await executeVerificationSuite("claim-validator");
    assert.equal(res.status, "PASS");
    assert.equal(res.suiteId, "claim-validator");
    assert.equal(res.metrics.fabricatedClaimsDisputed, "10/10 (100%)");
    assert.equal(res.metrics.directLedgerMutations, "0 writes");
    assert.ok(typeof res.metrics.throughput === "string");
  });

  // 4. Cross-Partition Scale in-process execution
  await test("4. Cross-Partition Scale executes in-process with 100k pairs and 0 leaks", async () => {
    const res = await executeVerificationSuite("cross-partition");
    assert.equal(res.status, "PASS");
    assert.equal(res.suiteId, "cross-partition");
    assert.equal(res.metrics.boundaryPairs, "100,000");
    assert.equal(res.metrics.duplicateClaimsPrevented, "0 leaks");
    assert.ok(typeof res.metrics.throughput === "string");
  });

  // 5. Chaos recovery in-process execution
  await test("5. 100k Streaming Chaos executes in-process with 100% crash recovery", async () => {
    const res = await executeVerificationSuite("chaos");
    assert.equal(res.status, "PASS");
    assert.equal(res.suiteId, "chaos");
    assert.equal(res.metrics.streamingRecords, "100,000");
    assert.equal(res.metrics.crashesRecovered, "10,000 (100%)");
    assert.equal(res.metrics.deadLetterQueue, "0 dropped");
  });

  // 6. Decision Receipt in-process execution
  await test("6. Decision Receipt Standalone Verifier executes in-process with VERIFIED", async () => {
    const res = await executeVerificationSuite("receipt");
    assert.equal(res.status, "PASS");
    assert.equal(res.suiteId, "receipt");
    assert.equal(res.metrics.offlineVerdict, "VERIFIED");
    assert.equal(res.metrics.cryptographicDAGLayers, "8 / 8 Checked");
  });

  // 7. Finance-Ops loop in-process execution
  await test("7. Track 04 AI Finance-Ops Loop executes in-process with 96.4% AI bypass", async () => {
    const res = await executeVerificationSuite("finance-ops");
    assert.equal(res.status, "PASS");
    assert.equal(res.suiteId, "finance-ops");
    assert.equal(res.metrics.batchRecords, "55");
    assert.equal(res.metrics.fastPathAIBypass, "96.4%");
    assert.equal(res.metrics.falseFinancialWrites, "0 writes");
  });

  // 8. Honest reporting for unknown suite
  await test("8. Unknown suite fails honestly without masking", async () => {
    const res = await executeVerificationSuite("nonexistent_suite_123");
    assert.equal(res.status, "FAIL");
    assert.ok(res.rawOutputSnippet.includes("Unknown verification suite"));
  });

  // 9. Synchronous Verification Hub API Route execution
  await test("9. POST /api/verify/run synchronously executes all 7 suites and returns allPassed=true", async () => {
    const req = new NextRequest("http://localhost:3000/api/verify/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ async: false }),
    });

    const res = await verifyPost(req);
    assert.equal(res.status, 200);

    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.allPassed, true);
    assert.equal(json.totalSuitesExecuted, 7);
    assert.ok(json.results.benchmark);
    assert.equal(json.results.benchmark.status, "PASS");
    assert.ok(json.results.cardinality);
    assert.equal(json.results.cardinality.status, "PASS");
    assert.ok(json.results["claim-validator"]);
    assert.equal(json.results["claim-validator"].status, "PASS");
    assert.ok(json.results["cross-partition"]);
    assert.equal(json.results["cross-partition"].status, "PASS");
    assert.ok(json.results.chaos);
    assert.equal(json.results.chaos.status, "PASS");
    assert.ok(json.results.receipt);
    assert.equal(json.results.receipt.status, "PASS");
    assert.ok(json.results["finance-ops"]);
    assert.equal(json.results["finance-ops"].status, "PASS");
  });

  // 10. Bounded Stepper Progress Route execution
  await test("10. POST /api/verify/progress/[jobId] executes bounded step in-process", async () => {
    const createReq = new NextRequest("http://localhost:3000/api/verify/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suites: ["cardinality"], async: true }),
    });
    const createRes = await verifyPost(createReq);
    const { jobId } = await createRes.json();

    const stepReq = new NextRequest(`http://localhost:3000/api/verify/progress/${jobId}`, {
      method: "POST",
    });
    const stepRes = await progressStepPost(stepReq, { params: Promise.resolve({ jobId }) });
    assert.equal(stepRes.status, 200);

    const stepJson = await stepRes.json();
    assert.equal(stepJson.success, true);
    assert.equal(stepJson.job.status, "COMPLETED");
    assert.equal(stepJson.job.allPassed, true);
    assert.equal(stepJson.job.results.cardinality.status, "PASS");
  });

  console.log("\n=========================================================================");
  console.log(" ✅ ALL 10 VERIFICATION RUNNER IN-PROCESS SAFETY TESTS PASSED (10/10)");
  console.log("=========================================================================\n");
}

runSafetyRegressionTests().catch((err) => {
  console.error("Safety regression suite failed:", err);
  process.exit(1);
});
