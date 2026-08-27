/*
 * SettleMate AI — End-to-End Tests for Calibration & Playbooks Suite
 */

import { runLiveCalibrationTest, BENCHMARK_CALIBRATION_DATA } from "@/lib/calibration/calibration-utils";
import { getAllPlaybooks } from "@/lib/playbooks/generator";
import { GET as getCalibrationRoute } from "@/app/api/calibration/live/route";
import { GET as getPlaybooksRoute } from "@/app/api/playbooks/route";
import { NextRequest } from "next/server";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function runE2ETests() {
  console.log("\n========================================================");
  console.log("   SETTLEMATE AI — CALIBRATION & PLAYBOOKS E2E TESTS   ");
  console.log("========================================================\n");

  // Test 1: Calibration E2E - Benchmark Data Integrity
  console.log("1. Testing Calibration E2E benchmark data...");
  assert(BENCHMARK_CALIBRATION_DATA.length === 5, "Expected 5 benchmark buckets");
  const bucket0 = BENCHMARK_CALIBRATION_DATA[0]!;
  assert(bucket0.range === "0-20" && bucket0.total === 57 && bucket0.correct === 56, "Bucket 0-20 verified");
  const bucket80 = BENCHMARK_CALIBRATION_DATA[4]!;
  assert(bucket80.range === "81-100" && bucket80.total === 125 && bucket80.correct === 125, "Bucket 81-100 verified");
  console.log("   ✓ Benchmark dataset calibration curve integrity verified");

  // Test 2: Calibration E2E - Live Batch Simulation Execution
  console.log("\n2. Testing Calibration E2E Live Batch Simulation...");
  const liveResult = await runLiveCalibrationTest({ seed: 20260825, sampleSize: 50 });
  assert(liveResult.totalRecords === 50, `Expected 50 records, got ${liveResult.totalRecords}`);
  assert(liveResult.points.length === 50, "Points array must have 50 items");
  assert(liveResult.overallAccuracy > 0, "Overall accuracy must be > 0");
  assert(liveResult.buckets.length === 5, "Buckets array must have 5 buckets");
  assert(liveResult.brierScore >= 0 && liveResult.brierScore <= 1, "Brier score must be in [0, 1]");

  // Verify scatter point structure
  for (const pt of liveResult.points) {
    assert(pt.id.length > 0, "Point id must be present");
    assert(pt.predictedConfidence >= 0 && pt.predictedConfidence <= 100, "Confidence must be 0-100");
    assert(typeof pt.isCorrect === "boolean", "isCorrect must be boolean");
    assert(typeof pt.jitteredY === "number", "jitteredY must be number");
  }
  console.log(`   ✓ Live simulation E2E verified (Accuracy: ${liveResult.overallAccuracy}%, ECE: ${liveResult.expectedCalibrationError}%, Brier: ${liveResult.brierScore})`);

  // Test 3: API Endpoint E2E - /api/calibration/live
  console.log("\n3. Testing API endpoint /api/calibration/live...");
  const reqCalib = new NextRequest("http://localhost:3000/api/calibration/live?seed=20260825&sampleSize=50");
  const resCalib = await getCalibrationRoute(reqCalib);
  assert(resCalib.status === 200, `Expected status 200, got ${resCalib.status}`);
  const calibJson = await resCalib.json();
  assert(calibJson.success === true, "Expected success: true");
  assert(calibJson.benchmark.length === 5, "API must return 5 benchmark buckets");
  assert(calibJson.liveTest.totalRecords === 50, "API live test must return 50 records");
  console.log("   ✓ /api/calibration/live HTTP 200 OK verified");

  // Test 4: Playbooks E2E - Dynamic Resolution Workflows
  console.log("\n4. Testing Playbooks E2E generation...");
  const playbooks = getAllPlaybooks();
  assert(playbooks.length === 5, `Expected 5 playbooks, got ${playbooks.length}`);

  const partialRefund = playbooks.find((p) => p.id === "partial-refund");
  assert(partialRefund !== undefined, "Partial refund playbook must exist");
  assert(partialRefund!.recommendedJournal.debitAccount === "REFUND_CLEARING_AC", "Debit account must be REFUND_CLEARING_AC");
  assert(partialRefund!.recommendedJournal.creditAccount === "SETTLEMENT_VARIANCE_AC", "Credit account must be SETTLEMENT_VARIANCE_AC");

  const feeDisc = playbooks.find((p) => p.id === "fee-discrepancy");
  assert(feeDisc !== undefined, "Fee discrepancy playbook must exist");
  assert(feeDisc!.recommendedJournal.debitAccount === "PROCESSOR_DISPUTE_CLEARING", "Debit account must be PROCESSOR_DISPUTE_CLEARING");

  const cbPlaybook = playbooks.find((p) => p.id === "chargeback");
  assert(cbPlaybook !== undefined, "Chargeback playbook must exist");
  assert(cbPlaybook!.recommendedJournal.debitAccount === "CHARGEBACK_ARBITRATION_SUSPENSE", "Debit account must be CHARGEBACK_ARBITRATION_SUSPENSE");
  console.log("   ✓ All 5 playbooks generated with exact double-entry accounts");

  // Test 5: API Endpoint E2E - /api/playbooks
  console.log("\n5. Testing API endpoint /api/playbooks...");
  const reqPlaybooks = new NextRequest("http://localhost:3000/api/playbooks");
  const resPlaybooks = await getPlaybooksRoute(reqPlaybooks);
  assert(resPlaybooks.status === 200, `Expected status 200, got ${resPlaybooks.status}`);
  const playbooksJson = await resPlaybooks.json();
  assert(playbooksJson.success === true, "Expected success: true");
  assert(playbooksJson.playbooks.length === 5, "Expected 5 playbooks in response");

  // Test specific playbook by query param
  const reqSingle = new NextRequest("http://localhost:3000/api/playbooks?id=partial-refund");
  const resSingle = await getPlaybooksRoute(reqSingle);
  const singleJson = await resSingle.json();
  assert(singleJson.success === true && singleJson.playbook.id === "partial-refund", "Single playbook query verified");
  console.log("   ✓ /api/playbooks HTTP 200 OK verified");

  console.log("\n========================================================");
  console.log("   ALL E2E WORKFLOW TESTS PASSED (5/5)                 ");
  console.log("========================================================\n");
}

runE2ETests().catch((err) => {
  console.error("E2E test failure:", err);
  process.exit(1);
});
