/*
 * SettleMate AI — Aggregate Risk & Tolerance Stacking Tests (Day 6)
 */

import assert from "node:assert/strict";
import { AggregateRiskTracker } from "./aggregate-risk";

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log("  ✓ " + name);
  } catch (err) {
    console.error("  ✗ " + name + " — " + (err as Error).message);
    throw err;
  }
}

async function runTests() {
  console.log("\n=========================================================================");
  console.log(" SETTLEMATE AI — AGGREGATE RISK & TOLERANCE STACKING TESTS");
  console.log("=========================================================================\n");

  await test("1. Scenario A: 50 records inside tolerance (₹0.50 ea) -> SAFE_WITHIN_TOLERANCE", () => {
    const tracker = new AggregateRiskTracker({
      maxSingleRecordTolerancePaise: 100, // ₹1.00
      maxBatchCumulativeTolerancePaise: 50000, // ₹500.00
    });

    for (let i = 0; i < 50; i++) {
      const res = tracker.recordTransaction({
        recordId: `rec_${i}`,
        merchantId: "merch_demo",
        grossPaise: 100000, // ₹1,000.00
        settledPaise: 99950, // ₹999.50 (50 paise discrepancy)
      });
      assert.equal(res.individuallySafe, true);
    }

    const report = tracker.evaluateAggregateRisk();
    assert.equal(report.verdict, "SAFE_WITHIN_TOLERANCE");
    assert.equal(report.cumulativeToleranceConsumedPaise, 2500); // ₹25.00
    assert.equal(report.requiresMakerChecker, false);
  });

  await test("2. Scenario B & C: 1,000+ records stacking tolerance -> AGGREGATE_TOLERANCE_BREACH", () => {
    const tracker = new AggregateRiskTracker({
      maxSingleRecordTolerancePaise: 100, // ₹1.00
      maxBatchCumulativeTolerancePaise: 50000, // ₹500.00 (50,000 paise)
    });

    // Record 1,001 transactions each with 50 paise discrepancy (Total = 50,050 paise)
    for (let i = 0; i < 1001; i++) {
      tracker.recordTransaction({
        recordId: `rec_stack_${i}`,
        grossPaise: 100000,
        settledPaise: 99950,
      });
    }

    const report = tracker.evaluateAggregateRisk();
    assert.equal(report.verdict, "AGGREGATE_TOLERANCE_BREACH_REVIEW_REQUIRED");
    assert.equal(report.cumulativeToleranceConsumedPaise, 50050);
    assert.equal(report.requiresMakerChecker, true);
    assert.ok(report.breachedLimits.some((b) => b.includes("BATCH_CUMULATIVE_TOLERANCE_EXCEEDED")));
  });

  await test("3. Scenario D: Concentrated Merchant Exposure Limit Enforcement", () => {
    const tracker = new AggregateRiskTracker({
      maxSingleRecordTolerancePaise: 100,
      maxMerchantCumulativeTolerancePaise: 10000, // ₹100.00 (10,000 paise)
    });

    // 150 transactions from merchant M1 with 80 paise discrepancy each (Total = 12,000 paise)
    for (let i = 0; i < 150; i++) {
      tracker.recordTransaction({
        recordId: `rec_m_${i}`,
        merchantId: "merch_concentrated_1",
        grossPaise: 50000,
        settledPaise: 49920,
      });
    }

    const report = tracker.evaluateAggregateRisk();
    assert.equal(report.verdict, "AGGREGATE_TOLERANCE_BREACH_REVIEW_REQUIRED");
    assert.equal(report.merchantExposure["merch_concentrated_1"], 12000);
    assert.ok(report.breachedLimits.some((b) => b.includes("MERCHANT_EXPOSURE_EXCEEDED")));
  });

  await test("4. Tolerance Boundary Attack: Exact (Threshold - 1), Threshold, (Threshold + 1)", () => {
    const limit = 50000;

    // A. Exact Limit - 1 paise (49,999 paise) on ₹10,00,000 volume -> SAFE
    const trackerA = new AggregateRiskTracker({ maxBatchCumulativeTolerancePaise: limit, maxSingleRecordTolerancePaise: 60000 });
    trackerA.recordTransaction({ recordId: "a1", grossPaise: 100000000, settledPaise: 100000000 - 49999 });
    assert.equal(trackerA.evaluateAggregateRisk().requiresMakerChecker, false);

    // B. Exact Limit (50,000 paise) -> SAFE
    const trackerB = new AggregateRiskTracker({ maxBatchCumulativeTolerancePaise: limit, maxSingleRecordTolerancePaise: 60000 });
    trackerB.recordTransaction({ recordId: "b1", grossPaise: 100000000, settledPaise: 100000000 - 50000 });
    assert.equal(trackerB.evaluateAggregateRisk().requiresMakerChecker, false);

    // C. Exact Limit + 1 paise (50,001 paise) -> BREACH REVIEW REQUIRED
    const trackerC = new AggregateRiskTracker({ maxBatchCumulativeTolerancePaise: limit, maxSingleRecordTolerancePaise: 60000 });
    trackerC.recordTransaction({ recordId: "c1", grossPaise: 100000000, settledPaise: 100000000 - 50001 });
    assert.equal(trackerC.evaluateAggregateRisk().requiresMakerChecker, true);
    assert.equal(trackerC.evaluateAggregateRisk().verdict, "AGGREGATE_TOLERANCE_BREACH_REVIEW_REQUIRED");
  });

  console.log("\naggregate-risk: ALL 4 AGGREGATE TOLERANCE TESTS PASSED\n");
}

void runTests();
