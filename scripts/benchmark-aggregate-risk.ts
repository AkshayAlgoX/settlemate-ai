/*
 * SettleMate AI — Aggregate Tolerance Stacking & Exposure Benchmark (Day 6)
 */

import { AggregateRiskTracker } from "../src/lib/reconciliation/aggregate-risk";

function runBenchmark() {
  console.log("\n=========================================================================");
  console.log(" SETTLEMATE AI — AGGREGATE TOLERANCE STACKING & EXPOSURE BENCHMARK (DAY 6)");
  console.log("=========================================================================\n");

  const policy = {
    maxSingleRecordTolerancePaise: 100, // ₹1.00
    maxBatchCumulativeTolerancePaise: 50000, // ₹500.00
    maxMerchantCumulativeTolerancePaise: 10000, // ₹100.00
    maxProviderCumulativeTolerancePaise: 25000, // ₹250.00
    maxAggregateDriftRatio: 0.005, // 0.5%
  };

  const scenarios = [
    { count: 50, driftPaise: 50, name: "Scenario A (50 records, 50p drift ea)" },
    { count: 1000, driftPaise: 50, name: "Scenario B (1,000 records, 50p drift ea)" },
    { count: 10000, driftPaise: 50, name: "Scenario C (10,000 records, 50p drift ea)" },
  ];

  console.log("Scenario                           | Records | Cumul. Drift | Verdict                  | Maker/Checker | Time (ms)");
  console.log("-----------------------------------+---------+--------------+--------------------------+---------------+----------");

  for (const s of scenarios) {
    const tracker = new AggregateRiskTracker(policy);
    const start = performance.now();

    for (let i = 0; i < s.count; i++) {
      tracker.recordTransaction({
        recordId: `rec_${i}`,
        merchantId: `merch_${i % 10}`,
        provider: "RAZORPAY",
        grossPaise: 100000,
        settledPaise: 100000 - s.driftPaise,
      });
    }

    const report = tracker.evaluateAggregateRisk();
    const dur = performance.now() - start;

    const nameStr = s.name.padEnd(34);
    const recStr = String(s.count).padStart(7);
    const driftStr = (`₹${(report.cumulativeToleranceConsumedPaise / 100).toFixed(2)}`).padStart(12);
    const verdStr = report.verdict.padEnd(24);
    const mcStr = (report.requiresMakerChecker ? "REQUIRED" : "BYPASSED").padEnd(13);
    const timeStr = (dur.toFixed(2) + " ms").padStart(9);

    console.log(`${nameStr} | ${recStr} | ${driftStr} | ${verdStr} | ${mcStr} | ${timeStr}`);
  }
  console.log("");
}

runBenchmark();
