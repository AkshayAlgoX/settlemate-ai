/*
 * SettleMate AI — Risk & Exposure Scoring unit tests.
 *
 * Zero-dependency tsx test: verifies risk-category thresholds, family
 * classification, tolerance-stacking detection (count and cumulative), the
 * integer 0–100 score, and that no financial value is ever fractional.
 */

import { strictEqual, ok } from "node:assert";
import {
  computeRiskExposure,
  categorize,
  classifyFamily,
  bandForScore,
  RISK_SCORING_CONFIG,
  type RiskExceptionInput,
} from "./scoring";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`   ✓ ${name}`);
}

function ex(partial: Partial<RiskExceptionInput> & { id: string; variancePaise: number }): RiskExceptionInput {
  return {
    type: partial.type ?? "AMOUNT_MISMATCH",
    paymentId: partial.paymentId ?? partial.id,
    ...partial,
  };
}

function runTests() {
  console.log("\n=========================================================================");
  console.log(" 🧪 SETTLEMATE AI — RISK & EXPOSURE SCORING TESTS");
  console.log("=========================================================================\n");

  // 1. Risk category thresholds (exact paise boundaries).
  test("categorize: < ₹10,000 is LOW", () => {
    strictEqual(categorize(0), "LOW");
    strictEqual(categorize(100_000), "LOW"); // ₹1,000
    strictEqual(categorize(999_999), "LOW"); // ₹9,999.99
  });
  test("categorize: ₹10,000 boundary is MEDIUM", () => {
    strictEqual(categorize(RISK_SCORING_CONFIG.MEDIUM_VARIANCE_PAISE), "MEDIUM"); // exactly ₹10,000
    strictEqual(categorize(1_000_001), "MEDIUM");
  });
  test("categorize: ₹50,000 boundary is MEDIUM, above is HIGH", () => {
    strictEqual(categorize(RISK_SCORING_CONFIG.HIGH_VARIANCE_PAISE), "MEDIUM"); // exactly ₹50,000 stays MEDIUM
    strictEqual(categorize(5_000_001), "HIGH"); // one paise over ₹50,000
    strictEqual(categorize(9_999_999), "HIGH");
  });

  // 2. Family classification.
  test("classifyFamily: scenario category wins", () => {
    strictEqual(classifyFamily({ type: "AMOUNT_MISMATCH", category: "SLA_BREACH" }), "SLA_BREACH");
    strictEqual(classifyFamily({ type: "AMOUNT_MISMATCH", category: "DUPLICATE_CREDIT" }), "DUPLICATE_CREDIT");
    strictEqual(classifyFamily({ type: "AMOUNT_MISMATCH", category: "CHARGEBACK_RISK" }), "CHARGEBACK_RISK");
  });
  test("classifyFamily: non-INR currency is cross-currency", () => {
    strictEqual(classifyFamily({ type: "AMOUNT_MISMATCH", currency: "USD" }), "CROSS_CURRENCY");
    strictEqual(classifyFamily({ type: "AMOUNT_MISMATCH", currency: "INR" }), "AMOUNT_VARIANCE");
  });
  test("classifyFamily: keyword fallback on type", () => {
    strictEqual(classifyFamily({ type: "DELAYED_BANK_CREDIT" }), "SLA_BREACH");
    strictEqual(classifyFamily({ type: "MISSING_BANK_CREDIT" }), "MISSING_CREDIT");
    strictEqual(classifyFamily({ type: "SOMETHING_WEIRD" }), "UNCLASSIFIED");
  });

  // 3. Aggregate totals + per-category buckets.
  test("computeRiskExposure: totals and category buckets", () => {
    const report = computeRiskExposure([
      ex({ id: "A", variancePaise: 6_000_000 }), // HIGH
      ex({ id: "B", variancePaise: 2_000_000 }), // MEDIUM
      ex({ id: "C", variancePaise: 500_000 }), // LOW
    ]);
    strictEqual(report.totals.unresolvedCount, 3);
    strictEqual(report.totals.unresolvedAmountPaise, 8_500_000);
    strictEqual(report.byCategory.HIGH.count, 1);
    strictEqual(report.byCategory.HIGH.amountPaise, 6_000_000);
    strictEqual(report.byCategory.MEDIUM.count, 1);
    strictEqual(report.byCategory.LOW.count, 1);
    // every classified exception carries a root cause + recommended action.
    ok(report.exceptions.every((e) => e.rootCause.length > 0 && e.recommendedAction.length > 0));
    ok(report.exceptions.every((e) => e.playbookType.length > 0));
  });

  // 4. SLA / duplicate / cross-currency counters.
  test("computeRiskExposure: SLA / duplicate / FX counters", () => {
    const report = computeRiskExposure([
      ex({ id: "S1", variancePaise: 800_000, category: "SLA_BREACH" }),
      ex({ id: "D1", variancePaise: 500_000, category: "DUPLICATE_CREDIT" }),
      ex({ id: "D2", variancePaise: 500_000, category: "DUPLICATE_CREDIT" }),
      ex({ id: "F1", variancePaise: 300_000, currency: "USD" }),
    ]);
    strictEqual(report.slaBreaches.count, 1);
    strictEqual(report.slaBreaches.amountAffectedPaise, 800_000);
    strictEqual(report.duplicateCreditRisks.count, 2);
    strictEqual(report.duplicateCreditRisks.amountPaise, 1_000_000);
    strictEqual(report.crossCurrencyRisks.count, 1);
    strictEqual(report.crossCurrencyRisks.amountPaise, 300_000);
  });

  // 5. Tolerance stacking — count-triggered breach (25 tiny variances).
  test("tolerance stacking: breach by count (≥25 small variances)", () => {
    const many: RiskExceptionInput[] = [];
    for (let i = 0; i < 25; i += 1) many.push(ex({ id: `T${i}`, variancePaise: 1 })); // 1 paise each
    const report = computeRiskExposure(many);
    strictEqual(report.toleranceStacking.smallVarianceCount, 25);
    strictEqual(report.toleranceStacking.exposurePaise, 25); // cumulative far below the ₹10,000 line
    ok(report.toleranceStacking.breached, "25 small variances must trip the count threshold");
  });

  // 6. Tolerance stacking — cumulative-triggered breach (few, but sum ≥ ₹10,000).
  test("tolerance stacking: breach by cumulative exposure", () => {
    const items: RiskExceptionInput[] = [];
    for (let i = 0; i < 10; i += 1) items.push(ex({ id: `C${i}`, variancePaise: 100_000 })); // ₹1,000 each, 10 total
    const report = computeRiskExposure(items);
    strictEqual(report.toleranceStacking.smallVarianceCount, 10); // below count threshold
    strictEqual(report.toleranceStacking.exposurePaise, 1_000_000); // exactly the ₹10,000 line
    ok(report.toleranceStacking.breached, "cumulative ≥ ₹10,000 must trip the breach");
  });

  test("tolerance stacking: no breach below both limits", () => {
    const items: RiskExceptionInput[] = [];
    for (let i = 0; i < 5; i += 1) items.push(ex({ id: `N${i}`, variancePaise: 100_000 })); // 5 × ₹1,000 = ₹5,000
    const report = computeRiskExposure(items);
    ok(!report.toleranceStacking.breached);
    strictEqual(report.toleranceStacking.exposurePaise, 500_000);
  });

  // 7. Large variances are NOT counted as small (not stacking).
  test("tolerance stacking: material variances are excluded", () => {
    const report = computeRiskExposure([ex({ id: "M", variancePaise: 6_000_000 })]);
    strictEqual(report.toleranceStacking.smallVarianceCount, 0);
    strictEqual(report.toleranceStacking.exposurePaise, 0);
    ok(!report.toleranceStacking.breached);
  });

  // 8. Score: bounds, determinism, integer, band mapping.
  test("risk score: empty batch is 0 / LOW", () => {
    const report = computeRiskExposure([]);
    strictEqual(report.riskScore, 0);
    strictEqual(report.riskBand, "LOW");
  });
  test("risk score: bounded 0–100 and integer", () => {
    const big: RiskExceptionInput[] = [];
    for (let i = 0; i < 40; i += 1) big.push(ex({ id: `H${i}`, variancePaise: 9_000_000 })); // 40 HIGH
    const report = computeRiskExposure(big);
    ok(report.riskScore >= 0 && report.riskScore <= 100);
    ok(Number.isInteger(report.riskScore));
    // severity 40 + amount 30 + count 15 + stacking 0 = 85. Stacking is an
    // independent dimension (small variances only), so a pure material-HIGH
    // batch caps at 85 — it never borrows the stacking weight.
    strictEqual(report.riskScore, 85, "40 material HIGH exceptions score 85 (no stacking component)");
    strictEqual(report.riskBand, "CRITICAL");
    strictEqual(report.scoreBreakdown.stacking, 0);
  });
  test("risk score: stacking adds an independent dimension", () => {
    // Same material-HIGH batch, now also carrying ≥25 small variances that trip
    // the stacking breach → the score climbs past the 85 pure-severity ceiling.
    const mixed: RiskExceptionInput[] = [];
    for (let i = 0; i < 40; i += 1) mixed.push(ex({ id: `H${i}`, variancePaise: 9_000_000 }));
    for (let i = 0; i < 25; i += 1) mixed.push(ex({ id: `S${i}`, variancePaise: 1 }));
    const report = computeRiskExposure(mixed);
    ok(report.toleranceStacking.breached);
    strictEqual(report.scoreBreakdown.stacking, 15);
    ok(report.riskScore > 85, `stacking should push the score above 85 (got ${report.riskScore})`);
    ok(report.riskScore <= 100);
  });
  test("risk score: monotonic — adding an exception never lowers the score", () => {
    const base = [ex({ id: "H1", variancePaise: 9_000_000 })];
    const baseScore = computeRiskExposure(base).riskScore;
    // Add a low-risk exception; the score must not drop.
    const withLow = computeRiskExposure([...base, ex({ id: "L1", variancePaise: 5_000 })]).riskScore;
    ok(withLow >= baseScore, `adding a LOW exception must not lower the score (${withLow} < ${baseScore})`);
    // Add a high-risk exception; the score must not drop.
    const withHigh = computeRiskExposure([...base, ex({ id: "H2", variancePaise: 9_000_000 })]).riskScore;
    ok(withHigh >= baseScore, `adding a HIGH exception must not lower the score (${withHigh} < ${baseScore})`);
  });
  test("risk score: determinism (same input → same output)", () => {
    const input = [ex({ id: "A", variancePaise: 6_000_000 }), ex({ id: "B", variancePaise: 500_000 })];
    strictEqual(computeRiskExposure(input).riskScore, computeRiskExposure(input).riskScore);
  });
  test("risk score: one HIGH scores ≥ one LOW", () => {
    const high = computeRiskExposure([ex({ id: "H", variancePaise: 6_000_000 })]).riskScore;
    const low = computeRiskExposure([ex({ id: "L", variancePaise: 5_000 })]).riskScore;
    ok(high >= low, `HIGH(${high}) should be ≥ LOW(${low})`);
  });
  test("bandForScore: thresholds", () => {
    strictEqual(bandForScore(0), "LOW");
    strictEqual(bandForScore(24), "LOW");
    strictEqual(bandForScore(25), "MODERATE");
    strictEqual(bandForScore(49), "MODERATE");
    strictEqual(bandForScore(50), "ELEVATED");
    strictEqual(bandForScore(74), "ELEVATED");
    strictEqual(bandForScore(75), "CRITICAL");
    strictEqual(bandForScore(100), "CRITICAL");
  });

  // 9. No fractional paise ever escapes, even from a bad caller.
  test("integer safety: fractional variance is truncated", () => {
    const report = computeRiskExposure([ex({ id: "X", variancePaise: 12_345.9 })]);
    strictEqual(report.exceptions[0].variancePaise, 12_345);
    ok(Number.isInteger(report.totals.unresolvedAmountPaise));
    strictEqual(report.totals.unresolvedAmountPaise, 12_345);
  });
  test("integer safety: negative variance coerced to absolute", () => {
    const report = computeRiskExposure([ex({ id: "Y", variancePaise: -6_000_000 })]);
    strictEqual(report.byCategory.HIGH.count, 1);
    strictEqual(report.totals.unresolvedAmountPaise, 6_000_000);
  });

  console.log("\n=========================================================================");
  console.log(`  ✅ ALL ${passed} RISK & EXPOSURE SCORING TESTS PASSED`);
  console.log("=========================================================================\n");
}

if (process.argv[1] && process.argv[1].includes("scoring.test.ts")) {
  try {
    runTests();
  } catch (err) {
    console.error("\n   ✗ Risk scoring test failure:", err);
    process.exit(1);
  }
}
