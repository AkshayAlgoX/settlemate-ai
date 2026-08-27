/*
 * SettleMate AI — Unit Tests for Confidence Calibration & Explainability
 */

import {
  BENCHMARK_CALIBRATION_DATA,
  computeExpectedCalibrationError,
  computeBrierScore,
  aggregateCalibrationBuckets,
  runLiveCalibrationTest,
} from "./calibration-utils";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function runCalibrationUnitTests() {
  console.log("\n========================================================");
  console.log("   SETTLEMATE AI — CONFIDENCE CALIBRATION UNIT TESTS");
  console.log("========================================================\n");

  // Test 1: Benchmark calibration bucket data structure and values
  console.log("1. Testing official benchmark calibration buckets...");
  assert(BENCHMARK_CALIBRATION_DATA.length === 5, "Expected 5 calibration buckets");
  
  const totalItems = BENCHMARK_CALIBRATION_DATA.reduce((sum, b) => sum + b.total, 0);
  const totalCorrect = BENCHMARK_CALIBRATION_DATA.reduce((sum, b) => sum + b.correct, 0);
  assert(totalItems === 250, `Expected total benchmark items to be 250, got ${totalItems}`);
  assert(totalCorrect === 245, `Expected total correct items to be 245, got ${totalCorrect}`);

  const bucket81 = BENCHMARK_CALIBRATION_DATA.find((b) => b.range === "81-100");
  assert(bucket81 !== undefined, "Bucket 81-100 must exist");
  assert(bucket81!.accuracy === 100.0, "Bucket 81-100 accuracy must be 100%");
  assert(bucket81!.total === 125, "Bucket 81-100 total must be 125");

  const bucket0 = BENCHMARK_CALIBRATION_DATA.find((b) => b.range === "0-20");
  assert(bucket0 !== undefined, "Bucket 0-20 must exist");
  assert(bucket0!.correct === 56 && bucket0!.total === 57, "Bucket 0-20 must have 56/57");
  console.log("   ✓ Official benchmark calibration structure verified (245/250 correct = 98.0% / 98.1%)");

  // Test 2: Expected Calibration Error (ECE) calculation
  console.log("\n2. Testing Expected Calibration Error (ECE) calculation...");
  const ece = computeExpectedCalibrationError(BENCHMARK_CALIBRATION_DATA);
  assert(typeof ece === "number" && !isNaN(ece), "ECE must be a valid number");
  assert(ece >= 0 && ece <= 100, `ECE must be between 0 and 100, got ${ece}`);
  
  // Test zero ECE for perfectly calibrated synthetic buckets
  const perfectBuckets = [
    { range: "0-20", minConf: 0, maxConf: 20, total: 10, correct: 1, accuracy: 10, expectedConfidence: 10, calibrationGap: 0, operationalRouting: "" },
    { range: "81-100", minConf: 81, maxConf: 100, total: 10, correct: 9, accuracy: 90, expectedConfidence: 90, calibrationGap: 0, operationalRouting: "" },
  ];
  const zeroEce = computeExpectedCalibrationError(perfectBuckets);
  assert(zeroEce === 0, `Perfect calibration must produce 0 ECE, got ${zeroEce}`);
  console.log(`   ✓ ECE calculation verified (Benchmark ECE: ${ece}%, Perfect ECE: ${zeroEce}%)`);

  // Test 3: Brier Score calculation
  console.log("\n3. Testing Brier Score calculation...");
  const perfectPredictions = [
    { predictedConfidence: 100, isCorrect: true },
    { predictedConfidence: 0, isCorrect: false },
  ];
  const brierZero = computeBrierScore(perfectPredictions);
  assert(brierZero === 0, `Perfect predictions must yield Brier score 0, got ${brierZero}`);

  const worstPredictions = [
    { predictedConfidence: 100, isCorrect: false },
    { predictedConfidence: 0, isCorrect: true },
  ];
  const brierOne = computeBrierScore(worstPredictions);
  assert(brierOne === 1.0, `Worst predictions must yield Brier score 1.0, got ${brierOne}`);
  console.log("   ✓ Brier score calculation edge cases verified (0.0000 to 1.0000)");

  // Test 4: aggregateCalibrationBuckets aggregation
  console.log("\n4. Testing aggregateCalibrationBuckets data transformation...");
  const sampleItems = [
    { predictedConfidence: 95, isCorrect: true },
    { predictedConfidence: 85, isCorrect: true },
    { predictedConfidence: 55, isCorrect: true },
    { predictedConfidence: 50, isCorrect: false },
    { predictedConfidence: 15, isCorrect: false },
  ];
  const aggregated = aggregateCalibrationBuckets(sampleItems);
  assert(aggregated.length === 5, "Must produce 5 buckets");
  
  const agg81 = aggregated.find((b) => b.range === "81-100")!;
  assert(agg81.total === 2 && agg81.correct === 2 && agg81.accuracy === 100, "Bucket 81-100 aggregated correctly");

  const agg41 = aggregated.find((b) => b.range === "41-60")!;
  assert(agg41.total === 2 && agg41.correct === 1 && agg41.accuracy === 50, "Bucket 41-60 aggregated correctly");
  console.log("   ✓ Prediction aggregation into standardized buckets verified");

  // Test 5: Deterministic Live Calibration Test Runner
  console.log("\n5. Testing Live Calibration Test Runner determinism & reproducibility...");
  const seed = 20260825;
  const run1 = await runLiveCalibrationTest({ seed, sampleSize: 50 });
  const run2 = await runLiveCalibrationTest({ seed, sampleSize: 50 });

  assert(run1.totalRecords === 50, `Expected 50 records, got ${run1.totalRecords}`);
  assert(run1.points.length === 50, `Expected 50 points, got ${run1.points.length}`);
  assert(run1.overallAccuracy === run2.overallAccuracy, "Run 1 and Run 2 accuracy must be identical");
  assert(run1.expectedCalibrationError === run2.expectedCalibrationError, "Run 1 and Run 2 ECE must be identical");
  assert(run1.brierScore === run2.brierScore, "Run 1 and Run 2 Brier Score must be identical");

  for (let i = 0; i < run1.points.length; i++) {
    const p1 = run1.points[i]!;
    const p2 = run2.points[i]!;
    assert(p1.id === p2.id, `Point ${i} id must match`);
    assert(p1.predictedConfidence === p2.predictedConfidence, `Point ${i} confidence must match`);
    assert(p1.isCorrect === p2.isCorrect, `Point ${i} correctness must match`);
  }
  console.log(`   ✓ Deterministic Live Calibration verified (Accuracy: ${run1.overallAccuracy}%, Brier: ${run1.brierScore})`);

  console.log("\n========================================================");
  console.log("   ALL CALIBRATION UNIT TESTS PASSED (5/5)             ");
  console.log("========================================================\n");
}

runCalibrationUnitTests().catch((err) => {
  console.error("Calibration test failure:", err);
  process.exit(1);
});
