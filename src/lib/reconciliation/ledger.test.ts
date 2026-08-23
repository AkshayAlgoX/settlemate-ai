/*
 * Reconciliation Ledger — pure unit tests for buildLedgerEntries.
 *
 * Proves the financial breakdown (net = gross − fee − tax − refund − chargeback), the decision
 * trace, the source-record reference, approval state, currency, and determinism. No DB.
 */

import assert from "node:assert/strict";
import { buildLedgerEntries, LEDGER_CURRENCY } from "./ledger";
import type { MatchResult } from "./types";
import type { Decision, DecisionOutcome, DecisionReport } from "./decision";

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

console.log("\nReconciliation Ledger — pure financial-state tests");

function result(overrides: Partial<MatchResult>): MatchResult {
  return {
    paymentId: "pay_1",
    orderId: "order_1",
    settlementIds: ["setl_1"],
    bankTxnIds: ["txn_1"],
    refundIds: ["ref_1"],
    chargebackIds: ["cb_1"],
    orderAmount: 100000,
    paymentAmount: 100000,
    paymentFee: 1000,
    paymentTax: 500,
    refundAmount: 2000,
    chargebackAmount: 3000,
    expectedNetAmount: 93500, // 100000 - 1000 - 500 - 2000 - 3000
    actualSettledAmount: 93500,
    bankCreditedAmount: 93500,
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

function decisionReportFor(results: MatchResult[], status: string): DecisionReport {
  // Build a minimal but well-formed report matching the decisions the engine would produce.
  const outcome: DecisionOutcome =
    status === "AUTO_MATCHED"
      ? "AUTO_MATCHED"
      : status === "NEEDS_MANUAL_REVIEW"
      ? "SUGGESTED_MATCH"
      : "EXCEPTION";
  const decisions: Decision[] = results.map((r) => ({
    paymentId: r.paymentId,
    outcome,
    confidence: r.confidenceScore,
    riskLevel: status === "AUTO_MATCHED" ? ("LOW" as const) : ("MEDIUM" as const),
    reasonCode:
      outcome === "AUTO_MATCHED"
        ? "AUTO_MATCHED_CONFIRMED"
        : outcome === "SUGGESTED_MATCH"
        ? "SUGGESTED_MATCH_NEEDS_REVIEW"
        : `EXCEPTION_${r.status}`,
    matchStrategy: r.matchMethod || "UNRESOLVED",
    evidence: [],
    relationshipRef: null,
    triggers: [],
  }));
  return {
    decisions,
    aggregate: {
      total: decisions.length,
      autoMatched: outcome === "AUTO_MATCHED" ? decisions.length : 0,
      suggestedMatches: outcome === "SUGGESTED_MATCH" ? decisions.length : 0,
      exceptions: outcome === "EXCEPTION" ? decisions.length : 0,
      byOutcome: { AUTO_MATCHED: 0, SUGGESTED_MATCH: 0, EXCEPTION: 0 },
      byRisk: { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 },
      lowRiskCount: 0,
      mediumRiskCount: 0,
      highRiskCount: 0,
      amountAtRisk: 0,
      aggregateExposurePaise: 0,
      novelCount: 0,
      maxRisk: "LOW",
    },
  };
}

check("net = gross − fee − tax − refund − chargeback (=== expectedNet)", () => {
  const r = result({});
  const entry = buildLedgerEntries({
    results: [r],
    decisionReport: decisionReportFor([r], "AUTO_MATCHED"),
    approvalState: "APPROVED",
  })[0];
  assert.equal(entry.grossPaise, 100000);
  assert.equal(entry.feePaise, 1000);
  assert.equal(entry.taxPaise, 500);
  assert.equal(entry.refundPaise, 2000);
  assert.equal(entry.chargebackPaise, 3000);
  assert.equal(entry.netPaise, 93500);
  assert.equal(entry.netPaise, entry.expectedNetPaise);
});

check("entry traces the decision (outcome, risk, reasonCode, matchStrategy)", () => {
  const r = result({ status: "AMOUNT_MISMATCH", matchMethod: "FUZZY_UTR" });
  const entry = buildLedgerEntries({
    results: [r],
    decisionReport: decisionReportFor([r], "AMOUNT_MISMATCH"),
    approvalState: "PENDING_REVIEW",
  })[0];
  assert.equal(entry.outcome, "EXCEPTION");
  assert.equal(entry.riskLevel, "MEDIUM");
  assert.equal(entry.reasonCode, "EXCEPTION_AMOUNT_MISMATCH");
  assert.equal(entry.matchStrategy, "FUZZY_UTR");
});

check("entry references its source records (settlements, bank txns, refunds, chargebacks)", () => {
  const r = result({});
  const entry = buildLedgerEntries({
    results: [r],
    decisionReport: decisionReportFor([r], "AUTO_MATCHED"),
    approvalState: "APPROVED",
  })[0];
  const refs = JSON.parse(entry.sourceRecordIds) as Record<string, string[]>;
  assert.deepEqual(refs.settlements, ["setl_1"]);
  assert.deepEqual(refs.bankTxns, ["txn_1"]);
  assert.deepEqual(refs.refunds, ["ref_1"]);
  assert.deepEqual(refs.chargebacks, ["cb_1"]);
});

check("approval state and currency are recorded", () => {
  const r = result({});
  const entry = buildLedgerEntries({
    results: [r],
    decisionReport: decisionReportFor([r], "AUTO_MATCHED"),
    approvalState: "PENDING_APPROVAL",
    runId: "run-7",
  })[0];
  assert.equal(entry.approvalState, "PENDING_APPROVAL");
  assert.equal(entry.currency, LEDGER_CURRENCY);
  assert.equal(entry.currency, "INR");
  assert.equal(entry.runId, "run-7");
});

check("one entry per result, deterministic", () => {
  const a = result({ paymentId: "pay_a" });
  const b = result({ paymentId: "pay_b", status: "MISSING_BANK_CREDIT" });
  const reportA = decisionReportFor([a], "AUTO_MATCHED");
  const reportB = decisionReportFor([b], "MISSING_BANK_CREDIT");
  const entries1 = buildLedgerEntries({
    results: [a, b],
    decisionReport: { decisions: [...reportA.decisions, ...reportB.decisions], aggregate: reportA.aggregate },
    approvalState: "APPROVED",
  });
  const entries2 = buildLedgerEntries({
    results: [a, b],
    decisionReport: { decisions: [...reportA.decisions, ...reportB.decisions], aggregate: reportA.aggregate },
    approvalState: "APPROVED",
  });
  assert.equal(entries1.length, 2);
  assert.deepEqual(entries1, entries2);
  assert.equal(entries1[0].paymentId, "pay_a");
  assert.equal(entries1[1].paymentId, "pay_b");
});

console.log(`\nledger: ${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
