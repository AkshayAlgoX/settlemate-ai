/*
 * Decision Engine — pure unit tests.
 *
 * Covers: outcome mapping, per-record risk + trigger taxonomy, aggregate counts,
 * cardinality relationship reference, and determinism. No DB, no I/O.
 */

import assert from "node:assert/strict";
import { evaluateBatchDecisions } from "./decision";
import type { MatchResult, BatchData } from "./types";
import type { CardinalityMatch } from "./cardinality";

let passed = 0;
let failed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name} — ${(err as Error).message}`);
  }
}

console.log("\nDecision Engine — pure logic tests");

function result(overrides: Partial<MatchResult>): MatchResult {
  return {
    paymentId: "pay_1",
    orderId: "order_1",
    settlementIds: ["setl_1"],
    bankTxnIds: ["txn_1"],
    refundIds: [],
    chargebackIds: [],
    orderAmount: 100000,
    paymentAmount: 100000,
    paymentFee: 0,
    paymentTax: 0,
    refundAmount: 0,
    chargebackAmount: 0,
    expectedNetAmount: 100000,
    actualSettledAmount: 100000,
    bankCreditedAmount: 100000,
    mismatchAmount: null,
    status: "AUTO_MATCHED",
    confidenceScore: 95,
    matchMethod: "EXACT_UTR",
    matchDetails: "",
    cardinalityType: "1:1",
    cardinalityReason: null,
    relationshipScore: null,
    ...overrides,
  };
}

function emptyData(): BatchData {
  return {
    orders: [],
    payments: [],
    settlements: [],
    bankTransactions: [],
    refunds: [],
    chargebacks: [],
    groundTruths: [],
  };
}

function dataWithPayment(paymentId: string, method: string): BatchData {
  return {
    ...emptyData(),
    payments: [
      {
        dbId: "db1",
        paymentId,
        orderId: "order_1",
        amount: 100000,
        fee: 0,
        tax: 0,
        method,
        status: "captured",
        capturedAt: new Date("2025-01-01T00:00:00Z"),
        createdAt: new Date("2025-01-01T00:00:00Z"),
      },
    ],
  };
}

// ── Outcome mapping ──
check("AUTO_MATCHED maps to outcome AUTO_MATCHED and LOW risk", () => {
  const report = evaluateBatchDecisions([result({})], emptyData(), []);
  const d = report.decisions[0];
  assert.equal(d.outcome, "AUTO_MATCHED");
  assert.equal(d.riskLevel, "LOW");
  assert.equal(d.reasonCode, "AUTO_MATCHED_CONFIRMED");
  assert.deepEqual(d.triggers, []);
});

check("NEEDS_MANUAL_REVIEW maps to SUGGESTED_MATCH", () => {
  const report = evaluateBatchDecisions(
    [result({ status: "NEEDS_MANUAL_REVIEW", confidenceScore: 40 })],
    emptyData(),
    [],
  );
  const d = report.decisions[0];
  assert.equal(d.outcome, "SUGGESTED_MATCH");
  assert.equal(d.reasonCode, "SUGGESTED_MATCH_NEEDS_REVIEW");
});

check("classified exception types map to EXCEPTION outcome", () => {
  for (const status of [
    "PENDING_SETTLEMENT",
    "MISSING_BANK_CREDIT",
    "AMOUNT_MISMATCH",
    "DUPLICATE_SETTLEMENT",
    "REFUND_MISMATCH",
    "CHARGEBACK_ADJUSTMENT",
    "DELAYED_BANK_CREDIT",
  ]) {
    const report = evaluateBatchDecisions(
      [result({ status, confidenceScore: 90 })],
      emptyData(),
      [],
    );
    const d = report.decisions[0];
    assert.equal(d.outcome, "EXCEPTION", status);
    assert.equal(d.reasonCode, `EXCEPTION_${status}`, status);
  }
});

// ── Risk levels ──
check("AUTO_MATCHED stays LOW even at a material amount", () => {
  const report = evaluateBatchDecisions(
    [result({ expectedNetAmount: 50_000_000 })],
    emptyData(),
    [],
  );
  const d = report.decisions[0];
  assert.equal(d.riskLevel, "LOW");
  assert.deepEqual(d.triggers, []);
});

check("SUGGESTED_MATCH with material amount is HIGH", () => {
  const report = evaluateBatchDecisions(
    [
      result({
        status: "NEEDS_MANUAL_REVIEW",
        expectedNetAmount: 2_000_000,
        confidenceScore: 90,
      }),
    ],
    emptyData(),
    [],
  );
  const d = report.decisions[0];
  assert.equal(d.riskLevel, "HIGH");
  assert.ok(d.triggers.includes("MATERIAL_AMOUNT"));
});

check("SUGGESTED_MATCH non-material, higher-confidence is MEDIUM", () => {
  const report = evaluateBatchDecisions(
    [result({ status: "NEEDS_MANUAL_REVIEW", expectedNetAmount: 100000, confidenceScore: 90 })],
    emptyData(),
    [],
  );
  const d = report.decisions[0];
  assert.equal(d.riskLevel, "MEDIUM");
});

check("EXCEPTION low-confidence + material is HIGH", () => {
  const report = evaluateBatchDecisions(
    [
      result({
        status: "AMOUNT_MISMATCH",
        expectedNetAmount: 2_000_000,
        confidenceScore: 20,
      }),
    ],
    emptyData(),
    [],
  );
  const d = report.decisions[0];
  assert.equal(d.riskLevel, "HIGH");
  assert.ok(d.triggers.includes("LOW_CONFIDENCE"));
  assert.ok(d.triggers.includes("MATERIAL_AMOUNT"));
});

check("EXCEPTION material-only is MEDIUM", () => {
  const report = evaluateBatchDecisions(
    [
      result({
        status: "AMOUNT_MISMATCH",
        expectedNetAmount: 2_000_000,
        confidenceScore: 90,
      }),
    ],
    emptyData(),
    [],
  );
  assert.equal(report.decisions[0].riskLevel, "MEDIUM");
});

check("EXCEPTION low-confidence-only is MEDIUM", () => {
  const report = evaluateBatchDecisions(
    [result({ status: "MISSING_BANK_CREDIT", expectedNetAmount: 100000, confidenceScore: 20 })],
    emptyData(),
    [],
  );
  assert.equal(report.decisions[0].riskLevel, "MEDIUM");
});

check("EXCEPTION with no materiality or low confidence is LOW", () => {
  const report = evaluateBatchDecisions(
    [result({ status: "PENDING_SETTLEMENT", expectedNetAmount: 100000, confidenceScore: 90 })],
    emptyData(),
    [],
  );
  assert.equal(report.decisions[0].riskLevel, "LOW");
});

// ── Trigger taxonomy ──
check("PROVIDER_RISK triggers for card method", () => {
  const report = evaluateBatchDecisions(
    [result({ status: "AMOUNT_MISMATCH", expectedNetAmount: 100000, confidenceScore: 90 })],
    dataWithPayment("pay_1", "card"),
    [],
  );
  const d = report.decisions[0];
  assert.ok(d.triggers.includes("PROVIDER_RISK"));
  assert.equal(d.riskLevel, "HIGH");
});

check("UNUSUAL_PATTERN triggers on a large mismatch", () => {
  const report = evaluateBatchDecisions(
    [
      result({
        status: "AMOUNT_MISMATCH",
        expectedNetAmount: 100000,
        confidenceScore: 90,
        mismatchAmount: 20000, // >5% of expected
      }),
    ],
    emptyData(),
    [],
  );
  const d = report.decisions[0];
  assert.ok(d.triggers.includes("UNUSUAL_PATTERN"));
  assert.equal(d.riskLevel, "HIGH");
});

check("POLICY_MODEL_VERSION triggers on a legacy match strategy", () => {
  const report = evaluateBatchDecisions(
    [result({ status: "MISSING_BANK_CREDIT", expectedNetAmount: 100000, confidenceScore: 90, matchMethod: "OVERDUE_NO_SETTLEMENT" })],
    emptyData(),
    [],
  );
  const d = report.decisions[0];
  assert.ok(d.triggers.includes("POLICY_MODEL_VERSION"));
});

check("FIRST_OCCURRENCE triggers on an orphan credit (novel, unverifiable)", () => {
  const report = evaluateBatchDecisions(
    [
      result({
        paymentId: "orphan_txn_9",
        status: "ORPHAN_BANK_CREDIT",
        expectedNetAmount: 0,
        bankCreditedAmount: 50000,
        confidenceScore: 25,
        matchMethod: "ORPHAN_DETECTION",
      }),
    ],
    emptyData(),
    [],
  );
  const d = report.decisions[0];
  assert.equal(d.outcome, "EXCEPTION");
  assert.ok(d.triggers.includes("FIRST_OCCURRENCE"));
  assert.ok(d.triggers.includes("LOW_CONFIDENCE"));
  assert.equal(d.riskLevel, "HIGH");
});

check("AGGREGATE_EXPOSURE flags the batch HIGH when amount-at-risk is material", () => {
  const a = result({
    paymentId: "pay_a",
    status: "AMOUNT_MISMATCH",
    expectedNetAmount: 3_000_000,
    confidenceScore: 90,
  });
  const b = result({
    paymentId: "pay_b",
    status: "AMOUNT_MISMATCH",
    expectedNetAmount: 3_000_000,
    confidenceScore: 90,
  });
  const report = evaluateBatchDecisions([a, b], emptyData(), []);
  // 6_000_000 ≥ AGGREGATE_EXPOSURE_PAISE (5_000_000).
  assert.equal(report.aggregate.maxRisk, "HIGH");
  for (const d of report.decisions) {
    assert.ok(d.triggers.includes("AGGREGATE_EXPOSURE"));
    assert.equal(d.riskLevel, "HIGH");
  }
  assert.equal(report.aggregate.highRiskCount, 2);
});

// ── Cardinality relationship reference ──
check("decision carries the cardinality relationship reference where available", () => {
  const relationships: CardinalityMatch[] = [
    {
      type: "N:1",
      settlementIds: ["setl_1", "setl_2"],
      bankTxnIds: ["txn_b1"],
      settlementAmount: 35000,
      bankAmount: 35000,
      differencePaise: 0,
      confidenceScore: 96,
      reasonCode: "EXACT_MANY_TO_ONE_AGGREGATION",
      details: "aggregated",
    },
  ];
  const report = evaluateBatchDecisions(
    [result({ bankTxnIds: ["txn_b1"], matchMethod: "NONE", cardinalityReason: "EXACT_MANY_TO_ONE_AGGREGATION", cardinalityType: "N:1", status: "AUTO_MATCHED" })],
    emptyData(),
    relationships,
  );
  const d = report.decisions[0];
  assert.equal(
    d.relationshipRef,
    "EXACT_MANY_TO_ONE_AGGREGATION@settlement:setl_1,setl_2|bank:txn_b1",
  );
});

// ── Aggregate counts ──
check("aggregate counts outcomes, risk buckets, and amount-at-risk", () => {
  const report = evaluateBatchDecisions(
    [
      result({ paymentId: "pay_a", status: "AUTO_MATCHED", confidenceScore: 95 }), // LOW
      result({ paymentId: "pay_b", status: "PENDING_SETTLEMENT", expectedNetAmount: 100000, confidenceScore: 90 }), // LOW
      result({ paymentId: "pay_c", status: "AMOUNT_MISMATCH", expectedNetAmount: 2_000_000, confidenceScore: 90 }), // MEDIUM (material)
      result({ paymentId: "pay_d", status: "NEEDS_MANUAL_REVIEW", expectedNetAmount: 100000, confidenceScore: 30 }), // HIGH (low-conf suggestion)
    ],
    emptyData(),
    [],
  );
  const a = report.aggregate;
  assert.equal(a.total, 4);
  assert.equal(a.autoMatched, 1);
  assert.equal(a.suggestedMatches, 1);
  assert.equal(a.exceptions, 2);
  assert.equal(a.byOutcome.EXCEPTION, 2);
  assert.equal(a.lowRiskCount, 2);
  assert.equal(a.mediumRiskCount, 1);
  assert.equal(a.highRiskCount, 1);
  assert.equal(a.maxRisk, "HIGH");
  assert.equal(a.amountAtRisk, 2_000_000 + 100000 + 100000); // pay_c + pay_d + pay_b
});

check("decisions carry matchStrategy and evidence", () => {
  const report = evaluateBatchDecisions(
    [
      result({
        status: "AMOUNT_MISMATCH",
        expectedNetAmount: 100000,
        confidenceScore: 90,
        matchMethod: "EXACT_UTR",
        matchDetails: "Expected ₹1000, settled ₹1100, delta ₹100",
        mismatchAmount: 10000,
      }),
    ],
    emptyData(),
    [],
  );
  const d = report.decisions[0];
  assert.equal(d.matchStrategy, "EXACT_UTR");
  assert.ok(d.evidence.some((e) => e.includes("delta")));
  assert.ok(d.evidence.some((e) => e.includes("Amount mismatch: 10000 paise")));
});

// ── Determinism ──
check("same input produces an identical report (deterministic)", () => {
  const input = [
    result({ paymentId: "pay_a", status: "AMOUNT_MISMATCH", expectedNetAmount: 2_000_000, confidenceScore: 20 }),
    result({ paymentId: "pay_b", status: "AUTO_MATCHED", confidenceScore: 95 }),
  ];
  const r1 = evaluateBatchDecisions(input, emptyData(), []);
  const r2 = evaluateBatchDecisions(input, emptyData(), []);
  assert.deepEqual(r1, r2);
});

console.log(`\ndecision: ${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
