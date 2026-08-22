/*
 * Financial Invariants control-layer tests.
 *
 * Pure (no DB): builds in-memory BatchData / MatchResult / ReconciliationMetrics
 * fixtures and drives evaluateInvariants / assertInvariantsPass / controlDecision.
 *
 * Covers:
 *   - well-formed fixture → all six checks pass
 *   - one deliberately-broken fixture per check → that check fails with the right code
 *   - ControlFailureError thrown on failure (code CONTROL_FAILURE)
 *   - maker/checker corrective loop: broken → fails; corrected → passes; uncorrected
 *     re-verification still fails (a failed re-verification never reaches PASS)
 *   - regression coverage on N:1 / 1:N / N:M cardinality shapes
 */

import assert from "node:assert/strict";
import type {
  BatchData,
  MatchResult,
  ReconciliationMetrics,
} from "./types";
import {
  evaluateInvariants,
  assertInvariantsPass,
  controlDecision,
  ControlFailureError,
  type InvariantReasonCode,
} from "./invariants";

let passed = 0;
let failed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name} — ${(err as Error).message}`);
  }
}

const BASE_DATE = new Date("2025-08-01T00:00:00Z");

function baseResult(overrides: Partial<MatchResult> = {}): MatchResult {
  return {
    paymentId: "pay_1",
    orderId: "order_1",
    settlementIds: ["setl_1"],
    bankTxnIds: ["btxn_1"],
    refundIds: [],
    chargebackIds: [],
    orderAmount: 100000,
    paymentAmount: 100000,
    paymentFee: 2000,
    paymentTax: 360,
    refundAmount: 0,
    chargebackAmount: 0,
    expectedNetAmount: 97640,
    actualSettledAmount: 97640,
    bankCreditedAmount: 97640,
    mismatchAmount: null,
    status: "AUTO_MATCHED",
    confidenceScore: 96,
    matchMethod: "EXACT_UTR",
    matchDetails: "",
    cardinalityType: "1:1",
    cardinalityReason: null,
    relationshipScore: null,
    ...overrides,
  };
}

function baseData(overrides: Partial<BatchData> = {}): BatchData {
  return {
    orders: [
      {
        dbId: "o1",
        orderId: "order_1",
        amount: 100000,
        status: "paid",
        createdAt: BASE_DATE,
      },
    ],
    payments: [
      {
        dbId: "p1",
        paymentId: "pay_1",
        orderId: "order_1",
        amount: 100000,
        fee: 2000,
        tax: 360,
        method: "upi",
        status: "captured",
        capturedAt: BASE_DATE,
        createdAt: BASE_DATE,
      },
    ],
    settlements: [
      {
        dbId: "s1",
        settlementId: "setl_1",
        paymentId: "pay_1",
        amount: 97640,
        fee: 2000,
        tax: 360,
        utr: "UTR1",
        status: "processed",
        settledAt: BASE_DATE,
        createdAt: BASE_DATE,
      },
    ],
    bankTransactions: [
      {
        dbId: "b1",
        txnId: "btxn_1",
        utr: "UTR1",
        amount: 97640,
        type: "CREDIT",
        narration: "RAZORPAY SETTLEMENT setl_1",
        txnDate: BASE_DATE,
        matched: false,
      },
    ],
    refunds: [],
    chargebacks: [],
    groundTruths: [
      { paymentId: "pay_1", expectedLabel: "AUTO_MATCHED", scenario: "test" },
    ],
    ...overrides,
  };
}

function baseMetrics(overrides: Partial<ReconciliationMetrics> = {}): ReconciliationMetrics {
  return {
    totalRecords: 1,
    autoMatched: 1,
    exceptionsFound: 0,
    unresolvedCount: 0,
    accuracy: 100,
    precision: 100,
    recall: 100,
    throughputRps: 0,
    processingTimeMs: 0,
    confusionMatrix: {},
    perTypeMetrics: {},
    grossOrderAmount: 100000,
    capturedPayments: 100000,
    expectedSettlement: 97640,
    actualBankCredits: 97640,
    totalRefunds: 0,
    totalChargebacks: 0,
    amountAtRisk: 0,
    exceptionsByType: {},
    phaseTimings: {},
    ...overrides,
  };
}

/** Returns the set of failure reason codes in a report. */
function failureCodes(report: ReturnType<typeof evaluateInvariants>): Set<InvariantReasonCode> {
  return new Set(report.failures.map((f) => f.code));
}

async function main() {
  console.log("\nFinancial invariants — control-layer tests");

  await check("well-formed fixture passes all six checks", () => {
    const data = baseData();
    const results = [baseResult()];
    const metrics = baseMetrics();
    const report = evaluateInvariants(data, results, metrics, []);
    assert.equal(report.passed, true, JSON.stringify(report.failures));
    assert.equal(report.failures.length, 0);
    assert.equal(controlDecision(report), "PASSED");
  });

  await check("input completeness fails when a payment has no result", () => {
    const data = baseData({
      payments: [
        ...baseData().payments,
        {
          dbId: "p2",
          paymentId: "pay_2",
          orderId: "order_2",
          amount: 50000,
          fee: 0,
          tax: 0,
          method: "upi",
          status: "captured",
          capturedAt: BASE_DATE,
          createdAt: BASE_DATE,
        },
      ],
    });
    // Only pay_1 has a result; pay_2 is dropped.
    const report = evaluateInvariants(data, [baseResult()], baseMetrics(), []);
    assert.equal(report.passed, false);
    assert.ok(failureCodes(report).has("INVARIANT_INPUT_COMPLETE"));
  });

  await check("money conservation fails when expectedNet drifts from gross accounting", () => {
    // Engine arithmetic drift: the result's expectedNet no longer equals
    // payment - fee - tax - refund - chargeback.
    const results = [baseResult({ expectedNetAmount: 99999 })];
    const report = evaluateInvariants(baseData(), results, baseMetrics(), []);
    assert.equal(report.passed, false);
    assert.ok(failureCodes(report).has("INVARIANT_MONEY_CONSERVATION"));
  });

  await check("debit/credit balance fails on an unaccounted bank credit", () => {
    const data = baseData({
      bankTransactions: [
        ...baseData().bankTransactions,
        {
          dbId: "b2",
          txnId: "btxn_leak",
          utr: "UTR_LEAK",
          amount: 5000,
          type: "CREDIT",
          narration: "RAZORPAY SETTLEMENT mystery",
          txnDate: BASE_DATE,
          matched: false,
        },
      ],
    });
    // btxn_leak is not referenced by any result (matched or orphan) → unexplained inflow.
    const report = evaluateInvariants(data, [baseResult()], baseMetrics(), []);
    assert.equal(report.passed, false);
    assert.ok(failureCodes(report).has("INVARIANT_DEBIT_CREDIT_BALANCE"));
  });

  await check("debit/credit balance fails on an unexplained bank debit", () => {
    const data = baseData({
      bankTransactions: [
        ...baseData().bankTransactions,
        {
          dbId: "b3",
          txnId: "btxn_debit",
          utr: null,
          amount: 8000,
          type: "DEBIT",
          narration: "RAZORPAY CHARGEBACK cb_x",
          txnDate: BASE_DATE,
          matched: false,
        },
      ],
    });
    // 8000 debit with no corresponding chargeback record → unexplained outflow.
    const report = evaluateInvariants(data, [baseResult()], baseMetrics(), []);
    assert.equal(report.passed, false);
    assert.ok(failureCodes(report).has("INVARIANT_DEBIT_CREDIT_BALANCE"));
  });

  await check("cardinality consistency fails when a settlement is in two relationships", () => {
    const relationships = [
      {
        type: "N:1" as const,
        settlementIds: ["setl_1", "setl_2"],
        bankTxnIds: ["btxn_b1"],
        settlementAmount: 97640 + 20000,
        bankAmount: 117640,
        differencePaise: 0,
        confidenceScore: 96,
        reasonCode: "EXACT_MANY_TO_ONE_AGGREGATION",
        details: "test",
      },
      {
        type: "N:1" as const,
        settlementIds: ["setl_1", "setl_3"], // setl_1 double-counted
        bankTxnIds: ["btxn_b2"],
        settlementAmount: 97640 + 30000,
        bankAmount: 127640,
        differencePaise: 0,
        confidenceScore: 96,
        reasonCode: "EXACT_MANY_TO_ONE_AGGREGATION",
        details: "test",
      },
    ];
    const data = baseData({
      settlements: [
        ...baseData().settlements,
        { dbId: "s2", settlementId: "setl_2", paymentId: "pay_2", amount: 20000, fee: 0, tax: 0, utr: null, status: "processed", settledAt: BASE_DATE, createdAt: BASE_DATE },
        { dbId: "s3", settlementId: "setl_3", paymentId: "pay_3", amount: 30000, fee: 0, tax: 0, utr: null, status: "processed", settledAt: BASE_DATE, createdAt: BASE_DATE },
      ],
      bankTransactions: [
        ...baseData().bankTransactions,
        { dbId: "b4", txnId: "btxn_b1", utr: null, amount: 117640, type: "CREDIT", narration: "BULK SETTLEMENT", txnDate: BASE_DATE, matched: false },
        { dbId: "b5", txnId: "btxn_b2", utr: null, amount: 127640, type: "CREDIT", narration: "BULK SETTLEMENT", txnDate: BASE_DATE, matched: false },
      ],
    });
    const report = evaluateInvariants(
      data,
      [baseResult(), baseResult({ paymentId: "pay_2", settlementIds: ["setl_2"], expectedNetAmount: 20000 }), baseResult({ paymentId: "pay_3", settlementIds: ["setl_3"], expectedNetAmount: 30000 })],
      baseMetrics({ totalRecords: 3, autoMatched: 3, capturedPayments: 150000, grossOrderAmount: 150000, expectedSettlement: 147640 }),
      relationships,
    );
    assert.equal(report.passed, false);
    assert.ok(failureCodes(report).has("INVARIANT_CARDINALITY_CONSISTENCY"));
  });

  await check("partition completeness fails when a settlement is unaccounted", () => {
    const data = baseData({
      settlements: [
        ...baseData().settlements,
        { dbId: "s4", settlementId: "setl_ghost", paymentId: "pay_9", amount: 12345, fee: 0, tax: 0, utr: null, status: "processed", settledAt: BASE_DATE, createdAt: BASE_DATE },
      ],
    });
    // setl_ghost is not referenced by any result.
    const report = evaluateInvariants(data, [baseResult()], baseMetrics(), []);
    assert.equal(report.passed, false);
    assert.ok(failureCodes(report).has("INVARIANT_PARTITION_COMPLETE"));
  });

  await check("ledger consistency fails when a metric drifts from recomputation", () => {
    const metrics = baseMetrics({ expectedSettlement: 99999 });
    const report = evaluateInvariants(baseData(), [baseResult()], metrics, []);
    assert.equal(report.passed, false);
    assert.ok(failureCodes(report).has("INVARIANT_LEDGER_CONSISTENCY"));
  });

  await check("assertInvariantsPass throws ControlFailureError with code CONTROL_FAILURE", () => {
    const data = baseData({
      bankTransactions: [
        ...baseData().bankTransactions,
        { dbId: "b6", txnId: "btxn_leak2", utr: null, amount: 700, type: "CREDIT", narration: "mystery", txnDate: BASE_DATE, matched: false },
      ],
    });
    assert.throws(
      () => assertInvariantsPass(data, [baseResult()], baseMetrics(), []),
      (err: unknown) => {
        assert.ok(err instanceof ControlFailureError, `expected ControlFailureError, got ${String(err)}`);
        const cfe = err as ControlFailureError;
        assert.equal(cfe.code, "CONTROL_FAILURE");
        assert.equal(cfe.report.passed, false);
        assert.ok(cfe.report.failures.length > 0);
        return true;
      },
    );
  });

  await check("controlDecision returns CONTROL_FAILURE for a failing report", () => {
    const data = baseData({
      settlements: [
        ...baseData().settlements,
        { dbId: "s5", settlementId: "setl_ghost2", paymentId: "pay_8", amount: 1, fee: 0, tax: 0, utr: null, status: "processed", settledAt: BASE_DATE, createdAt: BASE_DATE },
      ],
    });
    const report = evaluateInvariants(data, [baseResult()], baseMetrics(), []);
    assert.equal(report.passed, false);
    assert.equal(controlDecision(report), "CONTROL_FAILURE");
  });

  await check(
    "maker/checker loop: broken fails → corrective fix passes → uncorrected re-verification still fails",
    () => {
      // The defect: an unaccounted bank credit (btxn_leak).
      const brokenData = baseData({
        bankTransactions: [
          ...baseData().bankTransactions,
          { dbId: "b7", txnId: "btxn_leak3", utr: null, amount: 5000, type: "CREDIT", narration: "mystery", txnDate: BASE_DATE, matched: false },
        ],
      });
      const results = [baseResult()];

      // First verification (pre-correction): must fail.
      const first = evaluateInvariants(brokenData, results, baseMetrics(), []);
      assert.equal(first.passed, false);
      assert.ok(failureCodes(first).has("INVARIANT_DEBIT_CREDIT_BALANCE"));

      // An UNcorrected re-verification must still fail — a failed re-verification
      // never reaches PASS.
      const recheck = evaluateInvariants(brokenData, results, baseMetrics(), []);
      assert.equal(recheck.passed, false);

      // Corrective action (maker/checker): remove the erroneous credit.
      const correctedData = baseData();
      const corrected = evaluateInvariants(correctedData, results, baseMetrics(), []);
      assert.equal(corrected.passed, true, JSON.stringify(corrected.failures));
      assert.equal(controlDecision(corrected), "PASSED");
    },
  );

  // ── Regression coverage: cardinality shapes (N:1 / 1:N / N:M) pass invariants ──
  await check("N:1 cardinality fixture passes all invariants", () => {
    // Settlements 30000 + 20000 aggregate into one bulk credit of 50000.
    const data = baseData({
      payments: [
        { dbId: "p2", paymentId: "pay_2", orderId: "order_2", amount: 30000, fee: 0, tax: 0, method: "upi", status: "captured", capturedAt: BASE_DATE, createdAt: BASE_DATE },
        { dbId: "p3", paymentId: "pay_3", orderId: "order_3", amount: 20000, fee: 0, tax: 0, method: "upi", status: "captured", capturedAt: BASE_DATE, createdAt: BASE_DATE },
      ],
      orders: [
        { dbId: "o2", orderId: "order_2", amount: 30000, status: "paid", createdAt: BASE_DATE },
        { dbId: "o3", orderId: "order_3", amount: 20000, status: "paid", createdAt: BASE_DATE },
      ],
      settlements: [
        { dbId: "s6", settlementId: "setl_2", paymentId: "pay_2", amount: 30000, fee: 0, tax: 0, utr: null, status: "processed", settledAt: BASE_DATE, createdAt: BASE_DATE },
        { dbId: "s7", settlementId: "setl_3", paymentId: "pay_3", amount: 20000, fee: 0, tax: 0, utr: null, status: "processed", settledAt: BASE_DATE, createdAt: BASE_DATE },
      ],
      bankTransactions: [
        { dbId: "b8", txnId: "btxn_bulk", utr: null, amount: 50000, type: "CREDIT", narration: "RAZORPAY BULK SETTLEMENT BATCH", txnDate: BASE_DATE, matched: false },
      ],
      groundTruths: [],
    });
    const results = [
      baseResult({
        paymentId: "pay_2",
        settlementIds: ["setl_2"],
        bankTxnIds: ["btxn_bulk"],
        expectedNetAmount: 30000,
        bankCreditedAmount: 50000,
        cardinalityType: "N:1",
        cardinalityReason: "EXACT_MANY_TO_ONE_AGGREGATION",
        relationshipScore: 96,
      }),
      baseResult({
        paymentId: "pay_3",
        settlementIds: ["setl_3"],
        bankTxnIds: ["btxn_bulk"],
        expectedNetAmount: 20000,
        bankCreditedAmount: 50000,
        cardinalityType: "N:1",
        cardinalityReason: "EXACT_MANY_TO_ONE_AGGREGATION",
        relationshipScore: 96,
      }),
    ];
    const relationships = [
      {
        type: "N:1" as const,
        settlementIds: ["setl_2", "setl_3"],
        bankTxnIds: ["btxn_bulk"],
        settlementAmount: 50000,
        bankAmount: 50000,
        differencePaise: 0,
        confidenceScore: 96,
        reasonCode: "EXACT_MANY_TO_ONE_AGGREGATION",
        details: "test",
      },
    ];
    const report = evaluateInvariants(
      data,
      results,
      baseMetrics({
        totalRecords: 2,
        autoMatched: 2,
        capturedPayments: 50000,
        grossOrderAmount: 50000,
        expectedSettlement: 50000,
        actualBankCredits: 50000,
      }),
      relationships,
    );
    assert.equal(report.passed, true, JSON.stringify(report.failures));
  });

  await check("1:N cardinality fixture passes all invariants", () => {
    // One settlement 50000 split across three ordinary credits summing to 50000.
    const data = baseData({
      payments: [
        { dbId: "p1", paymentId: "pay_1", orderId: "order_1", amount: 50000, fee: 0, tax: 0, method: "upi", status: "captured", capturedAt: BASE_DATE, createdAt: BASE_DATE },
      ],
      orders: [
        { dbId: "o1", orderId: "order_1", amount: 50000, status: "paid", createdAt: BASE_DATE },
      ],
      settlements: [
        { dbId: "s8", settlementId: "setl_1", paymentId: "pay_1", amount: 50000, fee: 0, tax: 0, utr: null, status: "processed", settledAt: BASE_DATE, createdAt: BASE_DATE },
      ],
      bankTransactions: [
        { dbId: "b9", txnId: "btxn_c1", utr: null, amount: 10000, type: "CREDIT", narration: "RAZORPAY SETTLEMENT", txnDate: BASE_DATE, matched: false },
        { dbId: "b10", txnId: "btxn_c2", utr: null, amount: 15000, type: "CREDIT", narration: "RAZORPAY SETTLEMENT", txnDate: BASE_DATE, matched: false },
        { dbId: "b11", txnId: "btxn_c3", utr: null, amount: 25000, type: "CREDIT", narration: "RAZORPAY SETTLEMENT", txnDate: BASE_DATE, matched: false },
      ],
      groundTruths: [],
    });
    const results = [
      baseResult({
        settlementIds: ["setl_1"],
        bankTxnIds: ["btxn_c1", "btxn_c2", "btxn_c3"],
        expectedNetAmount: 50000,
        bankCreditedAmount: 50000,
        cardinalityType: "1:N",
        cardinalityReason: "EXACT_ONE_TO_MANY_AGGREGATION",
        relationshipScore: 96,
      }),
    ];
    const relationships = [
      {
        type: "1:N" as const,
        settlementIds: ["setl_1"],
        bankTxnIds: ["btxn_c1", "btxn_c2", "btxn_c3"],
        settlementAmount: 50000,
        bankAmount: 50000,
        differencePaise: 0,
        confidenceScore: 96,
        reasonCode: "EXACT_ONE_TO_MANY_AGGREGATION",
        details: "test",
      },
    ];
    const report = evaluateInvariants(
      data,
      results,
      baseMetrics({
        grossOrderAmount: 50000,
        capturedPayments: 50000,
        expectedSettlement: 50000,
        actualBankCredits: 50000,
      }),
      relationships,
    );
    assert.equal(report.passed, true, JSON.stringify(report.failures));
  });

  await check("N:M cardinality fixture passes all invariants", () => {
    // Settlements 30000 + 20000 ↔ credits 18000 + 32000 (both sum 50000).
    const data = baseData({
      payments: [
        { dbId: "p2", paymentId: "pay_2", orderId: "order_2", amount: 30000, fee: 0, tax: 0, method: "upi", status: "captured", capturedAt: BASE_DATE, createdAt: BASE_DATE },
        { dbId: "p3", paymentId: "pay_3", orderId: "order_3", amount: 20000, fee: 0, tax: 0, method: "upi", status: "captured", capturedAt: BASE_DATE, createdAt: BASE_DATE },
      ],
      orders: [
        { dbId: "o2", orderId: "order_2", amount: 30000, status: "paid", createdAt: BASE_DATE },
        { dbId: "o3", orderId: "order_3", amount: 20000, status: "paid", createdAt: BASE_DATE },
      ],
      settlements: [
        { dbId: "s6", settlementId: "setl_2", paymentId: "pay_2", amount: 30000, fee: 0, tax: 0, utr: null, status: "processed", settledAt: BASE_DATE, createdAt: BASE_DATE },
        { dbId: "s7", settlementId: "setl_3", paymentId: "pay_3", amount: 20000, fee: 0, tax: 0, utr: null, status: "processed", settledAt: BASE_DATE, createdAt: BASE_DATE },
      ],
      bankTransactions: [
        { dbId: "b12", txnId: "btxn_nm1", utr: null, amount: 18000, type: "CREDIT", narration: "RAZORPAY BULK SETTLEMENT BATCH", txnDate: BASE_DATE, matched: false },
        { dbId: "b13", txnId: "btxn_nm2", utr: null, amount: 32000, type: "CREDIT", narration: "RAZORPAY BULK SETTLEMENT BATCH", txnDate: BASE_DATE, matched: false },
      ],
      groundTruths: [],
    });
    const results = [
      baseResult({
        paymentId: "pay_2",
        settlementIds: ["setl_2"],
        bankTxnIds: ["btxn_nm1", "btxn_nm2"],
        expectedNetAmount: 30000,
        bankCreditedAmount: 50000,
        cardinalityType: "N:M",
        cardinalityReason: "EXACT_MANY_TO_MANY_CORRELATION",
        relationshipScore: 94,
      }),
      baseResult({
        paymentId: "pay_3",
        settlementIds: ["setl_3"],
        bankTxnIds: ["btxn_nm1", "btxn_nm2"],
        expectedNetAmount: 20000,
        bankCreditedAmount: 50000,
        cardinalityType: "N:M",
        cardinalityReason: "EXACT_MANY_TO_MANY_CORRELATION",
        relationshipScore: 94,
      }),
    ];
    const relationships = [
      {
        type: "N:M" as const,
        settlementIds: ["setl_2", "setl_3"],
        bankTxnIds: ["btxn_nm1", "btxn_nm2"],
        settlementAmount: 50000,
        bankAmount: 50000,
        differencePaise: 0,
        confidenceScore: 94,
        reasonCode: "EXACT_MANY_TO_MANY_CORRELATION",
        details: "test",
      },
    ];
    const report = evaluateInvariants(
      data,
      results,
      baseMetrics({
        totalRecords: 2,
        autoMatched: 2,
        capturedPayments: 50000,
        grossOrderAmount: 50000,
        expectedSettlement: 50000,
        actualBankCredits: 50000,
      }),
      relationships,
    );
    assert.equal(report.passed, true, JSON.stringify(report.failures));
  });

  console.log(`\ninvariants: ${passed} passed, ${failed} failed`);
  process.exitCode = failed > 0 ? 1 : 0;
  console.log(`\ninvariants: final ${failed > 0 ? "FAILURE" : "ALL PASSED"}`);
}

void main();
