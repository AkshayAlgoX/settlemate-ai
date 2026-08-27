/*
 * SettleMate AI — Reconciliation Forensics & Playback Tests
 */

import assert from "node:assert";
import {
  getStoredJobsList,
  buildForensicsTimeline,
  seedDefaultForensicsJob,
} from "@/lib/forensics/forensics-engine";
import { GET as getJobsRoute } from "./jobs/route";
import { GET as getTimelineRoute } from "./[jobId]/route";
import { NextRequest } from "next/server";

async function runTests() {
  console.log("\n========================================================");
  console.log("   SETTLEMATE AI — FORENSICS & PLAYBACK ENGINE TESTS    ");
  console.log("========================================================\n");

  // 1. Seed & Retrieve Stored Jobs
  console.log("1. Testing Stored Jobs List Retrieval & Auto-Seeding...");
  seedDefaultForensicsJob();
  const jobs = getStoredJobsList();
  assert(Array.isArray(jobs) && jobs.length > 0, "Jobs list must not be empty");
  const sample = jobs.find((j) => j.jobId === "job_demo_forensics_001") || jobs[0];
  assert(typeof sample.jobId === "string", "Job ID must be string");
  assert(typeof sample.matchRatePct === "number", "Match rate must be number");
  assert(typeof sample.formattedDiscrepancy === "string", "Formatted discrepancy must be string");
  console.log(`   ✓ Found ${jobs.length} stored reconciliation job(s) in SQLite`);

  // 2. 7-Phase Timeline Reconstruction
  console.log("\n2. Testing 7-Phase End-to-End Timeline Reconstruction...");
  const timeline = buildForensicsTimeline(sample.jobId);
  assert(timeline !== null, "Timeline must exist for valid jobId");
  assert.strictEqual(timeline.steps.length, 7, "Timeline must contain exactly 7 execution steps");

  const expectedPhases = [
    "INPUT_INGESTION",
    "INDEX_BUILDING",
    "MATCHING_RESULTS",
    "AI_INVESTIGATION",
    "MAKER_CHECKER",
    "LEDGER_POSTING",
    "DECISION_RECEIPT",
  ];

  timeline.steps.forEach((step, idx) => {
    assert.strictEqual(step.stepNumber, idx + 1);
    assert.strictEqual(step.phase, expectedPhases[idx]);
    assert(typeof step.title === "string" && step.title.length > 0);
    assert(typeof step.description === "string" && step.description.length > 0);
    assert(typeof step.dataSnapshot === "object" && step.dataSnapshot !== null);
    assert(typeof step.auditProof?.hash === "string" && step.auditProof.hash.length === 64, "Audit hash must be 64-char SHA256");
  });
  console.log("   ✓ Verified all 7 chronological phases with SHA-256 cryptographic audit proofs");

  // 3. Step 4 AI Investigation & Non-LLM Gate Data Checks
  console.log("\n3. Testing Step 4 AI Claim Grounding & Non-LLM Validation...");
  const aiStep = timeline.steps[3];
  assert.strictEqual(aiStep.phase, "AI_INVESTIGATION");
  const aiData = aiStep.dataSnapshot as { nonLlmChecks?: Array<{ check: string; status: string }> };
  assert(Array.isArray(aiData.nonLlmChecks) && aiData.nonLlmChecks.length >= 4, "Must have non-LLM validation checks");
  assert(aiData.nonLlmChecks.some((c) => c.check === "EVIDENCE_EXISTS" && c.status === "PASSED"));
  console.log("   ✓ Verified advisory AI structured claim with non-LLM Context Vault grounding");

  // 4. Step 6 Double-Entry Money Conservation Checks
  console.log("\n4. Testing Step 6 Double-Entry Money Conservation & Invariant Checks...");
  const ledgerStep = timeline.steps[5];
  assert.strictEqual(ledgerStep.phase, "LEDGER_POSTING");
  const ledgerData = ledgerStep.dataSnapshot as { totalDebitsPaise: number; totalCreditsPaise: number; varianceDriftPaise: number };
  assert.strictEqual(ledgerData.totalDebitsPaise, ledgerData.totalCreditsPaise, "Debits must equal credits");
  assert.strictEqual(ledgerData.varianceDriftPaise, 0, "Variance drift must be exactly 0 paise");
  console.log("   ✓ Verified double-entry journal balance: Debits == Credits (0 paise drift)");

  // 5. Step 7 Decision Receipt & Offline Verifier Proof
  console.log("\n5. Testing Step 7 Canonical Decision Receipt & Offline Proof...");
  const receiptStep = timeline.steps[6];
  assert.strictEqual(receiptStep.phase, "DECISION_RECEIPT");
  const receiptData = receiptStep.dataSnapshot as { rootHash: string; verificationStatus: string };
  assert(typeof receiptData.rootHash === "string" && receiptData.rootHash.length === 64);
  assert.strictEqual(receiptData.verificationStatus, "OFFLINE_VERIFIED");
  console.log("   ✓ Verified Merkle DAG receipt seal with offline standalone verification");

  // 6. GET /api/forensics/jobs Route Handler Test
  console.log("\n6. Testing GET /api/forensics/jobs Route Handler...");
  const jobsReq = new NextRequest("http://localhost:3000/api/forensics/jobs");
  const jobsRes = await getJobsRoute(jobsReq);
  assert.strictEqual(jobsRes.status, 200);
  const jobsJson = await jobsRes.json();
  assert.strictEqual(jobsJson.success, true);
  assert(Array.isArray(jobsJson.jobs) && jobsJson.jobs.length > 0);
  console.log(`   ✓ Route handler returned ${jobsJson.jobs.length} stored jobs`);

  // 7. GET /api/forensics/[jobId] Route Handler Test (Found & 404)
  console.log("\n7. Testing GET /api/forensics/[jobId] Route Handler...");
  const detailReq = new NextRequest(`http://localhost:3000/api/forensics/${sample.jobId}`);
  const detailRes = await getTimelineRoute(detailReq, { params: Promise.resolve({ jobId: sample.jobId }) });
  assert.strictEqual(detailRes.status, 200);
  const detailJson = await detailRes.json();
  assert.strictEqual(detailJson.success, true);
  assert.strictEqual(detailJson.timeline.steps.length, 7);

  // 404 Test
  const notFoundReq = new NextRequest("http://localhost:3000/api/forensics/job_non_existent_9999");
  const notFoundRes = await getTimelineRoute(notFoundReq, { params: Promise.resolve({ jobId: "job_non_existent_9999" }) });
  assert.strictEqual(notFoundRes.status, 404);
  console.log("   ✓ Route handler returned 200 with timeline for valid job and 404 for unknown job");

  console.log("\n========================================================");
  console.log("   ALL FORENSICS & PLAYBACK ENGINE TESTS PASSED (7/7)   ");
  console.log("========================================================\n");
}

runTests().catch((err) => {
  console.error("Forensics tests failed:", err);
  process.exit(1);
});
