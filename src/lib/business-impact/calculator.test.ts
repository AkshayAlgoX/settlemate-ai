/*
 * SettleMate AI — Business Impact Calculator Unit Tests
 */

import assert from "node:assert/strict";
import { calculateBusinessImpact } from "./calculator";

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
  console.log(" 💼 SETTLEMATE AI — BUSINESS IMPACT & ROI CALCULATOR TESTS");
  console.log("=========================================================================\n");

  // 1. Official Benchmark Rates Integrity
  await test("Impact 1: Benchmark automated resolution rate is exactly 91.3%", () => {
    const res = calculateBusinessImpact({
      monthlyTransactionVolume: 100000,
      baselineExceptionRatePct: 5.0,
      manualReviewTimeMinutes: 15,
      analystHourlyCost: 50,
    });

    assert.equal(res.exactAutoMatchRatePct, 39.2);
    assert.equal(res.automatedResolutionRatePct, 91.3);
    assert.equal(res.manualReviewRatePct, 8.7);
    assert.equal(res.deterministicAiBypassPct, 96.4);
    assert.equal(res.falseFinancialWrites, 0);
  });

  // 2. High-Volume Enterprise Calculation
  await test("Impact 2: 500k monthly volume with 5% exceptions saves ~3,800+ hours", () => {
    const res = calculateBusinessImpact({
      monthlyTransactionVolume: 500000,
      baselineExceptionRatePct: 5.0,
      manualReviewTimeMinutes: 10,
      analystHourlyCost: 45,
    });

    // 500k * 5% = 25,000 exceptions * 91.3% = 22,825 resolved
    // 22,825 * (10/60) = 3804.2 hours saved
    assert.ok(res.monthlyHoursSaved > 3700 && res.monthlyHoursSaved < 3900);
    assert.ok(res.annualCostSavings > 2000000); // > $2M/yr
    assert.ok(res.fteRepurposed >= 23); // > 23 full-time analysts repurposed
  });

  // 3. Boundary & Zero Values Handling
  await test("Impact 3: Zero volume returns zero savings without NaN or error", () => {
    const res = calculateBusinessImpact({
      monthlyTransactionVolume: 0,
      baselineExceptionRatePct: 5.0,
      manualReviewTimeMinutes: 15,
      analystHourlyCost: 50,
    });

    assert.equal(res.monthlyHoursSaved, 0);
    assert.equal(res.annualCostSavings, 0);
    assert.equal(res.fteRepurposed, 0);
  });

  console.log("\n=========================================================================");
  console.log(" ✅ ALL BUSINESS IMPACT CALCULATOR TESTS PASSED");
  console.log("=========================================================================\n");
}

void main();
