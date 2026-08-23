/*
 * Financial Invariants — a runtime control layer for reconciliation.
 *
 * Runs as a fail-closed gate before a batch is finalized to COMPLETED. It verifies,
 * deterministically and from the already-computed pipeline outputs (BatchData,
 * MatchResult[], ReconciliationMetrics, cardinality relationships), that the numbers
 * are internally consistent. Any violation produces a structured InvariantReport and
 * (via assertInvariantsPass / the engine gate) a ControlFailureError that blocks
 * finalization — a failed re-verification never reaches COMPLETED.
 *
 * Design intent: every check must hold on well-formed data (including the official
 * benchmark, which deliberately contains classified exceptions like amount mismatches,
 * orphan credits, and duplicate settlements). The checks therefore verify *engine
 * accounting* — that the model's own arithmetic and classification are internally
 * consistent and that no rupee is silently unaccounted — rather than assuming the raw
 * input ledgers always match (they legitimately diverge where an exception is flagged).
 *
 * This module is pure: it performs no DB or I/O and is independently testable.
 */

import { SETTLEMENT_CONFIG } from "@/lib/constants";
import type {
  BatchData,
  MatchResult,
  ReconciliationMetrics,
} from "./types";
import type { CardinalityMatch } from "./cardinality";

/** UPPER_SNAKE_CASE reason codes, one per invariant check. */
export const INVARIANT_REASON_CODES = [
  "INVARIANT_INPUT_COMPLETE",
  "INVARIANT_MONEY_CONSERVATION",
  "INVARIANT_DEBIT_CREDIT_BALANCE",
  "INVARIANT_CARDINALITY_CONSISTENCY",
  "INVARIANT_PARTITION_COMPLETE",
  "INVARIANT_LEDGER_CONSISTENCY",
] as const;

export type InvariantReasonCode = (typeof INVARIANT_REASON_CODES)[number];

export interface InvariantFailure {
  code: InvariantReasonCode;
  reason: string;
  expected: number | string | null;
  actual: number | string | null;
  tolerance: number | null;
}

export interface InvariantReport {
  passed: boolean;
  failures: InvariantFailure[];
  /** Record counts observed by the checks (payments, results, credits, links, ...). */
  checkedCounts: Record<string, number>;
  /** Paise totals observed by the checks (expectedNet, creditTotal, amountAtRisk, ...). */
  checkedAmounts: Record<string, number>;
}

export interface InvariantConfig {
  /** Base amount tolerance in paise (mirrors SETTLEMENT_CONFIG.AMOUNT_TOLERANCE_PAISE). */
  tolerancePaise: number;
}

const DEFAULT_CONFIG: InvariantConfig = {
  tolerancePaise: SETTLEMENT_CONFIG.AMOUNT_TOLERANCE_PAISE,
};

/** Thrown when the invariants gate fails; carries the full report for observability. */
export class ControlFailureError extends Error {
  readonly code = "CONTROL_FAILURE" as const;
  readonly report: InvariantReport;

  constructor(report: InvariantReport) {
    const codes = report.failures.map((f) => f.code).join(", ");
    super(`Financial invariant(s) failed: ${codes}`);
    this.name = "ControlFailureError";
    this.report = report;
  }
}

/**
 * Aggregate tolerance for a sum-level check: the fixed paise tolerance, scaled up by
 * 0.1% of the magnitude so large ledgers are not falsely rejected. Same spirit as the
 * matcher's amount tolerance.
 */
function aggTolerance(amount: number, config: InvariantConfig): number {
  return Math.max(
    config.tolerancePaise,
    Math.round(Math.abs(amount) * 0.001),
  );
}

function fail(
  failures: InvariantFailure[],
  code: InvariantReasonCode,
  reason: string,
  expected: number | string | null,
  actual: number | string | null,
  tolerance: number | null,
): void {
  failures.push({ code, reason, expected, actual, tolerance });
}

/** Union of every bank txn id referenced by any result (matched settlements + orphans). */
function attributedTxnIds(results: MatchResult[]): Set<string> {
  const ids = new Set<string>();
  for (const r of results) {
    for (const id of r.bankTxnIds) {
      ids.add(id);
    }
  }
  return ids;
}

function checkInputComplete(
  data: BatchData,
  results: MatchResult[],
  failures: InvariantFailure[],
  counts: Record<string, number>,
): void {
  const resultPaymentIds = new Set(results.map((r) => r.paymentId));
  let missing = 0;
  for (const p of data.payments) {
    if (!resultPaymentIds.has(p.paymentId)) {
      missing++;
    }
  }
  if (missing > 0) {
    fail(
      failures,
      "INVARIANT_INPUT_COMPLETE",
      `No reconciliation result produced for ${missing} payment(s); every payment must yield exactly one result.`,
      0,
      missing,
      0,
    );
  }
  counts["payments"] = data.payments.length;
  counts["results"] = results.length;
}

function checkMoneyConservation(
  data: BatchData,
  results: MatchResult[],
  failures: InvariantFailure[],
  config: InvariantConfig,
  counts: Record<string, number>,
  amounts: Record<string, number>,
): void {
  const captured = data.payments.filter((p) => p.status === "captured");
  const capturedAmount = captured.reduce((s, p) => s + p.amount, 0);
  const capturedFee = captured.reduce((s, p) => s + p.fee, 0);
  const capturedTax = captured.reduce((s, p) => s + p.tax, 0);
  const refundTotal = data.refunds.reduce((s, r) => s + r.amount, 0);
  const chargebackTotal = data.chargebacks.reduce((s, c) => s + c.amount, 0);

  // expectedNetAmount = payment.amount - fee - tax - refund - chargeback per result,
  // and every refund/chargeback is attached to its payment's result, so the sum over
  // all results must equal the gross captured value less fees/taxes/refunds/chargebacks.
  const expectedNetTotal = results.reduce((s, r) => s + r.expectedNetAmount, 0);
  const rhs = capturedAmount - capturedFee - capturedTax - refundTotal - chargebackTotal;
  const tolerance = aggTolerance(Math.max(Math.abs(expectedNetTotal), Math.abs(rhs)), config);

  if (Math.abs(expectedNetTotal - rhs) > tolerance) {
    fail(
      failures,
      "INVARIANT_MONEY_CONSERVATION",
      `Sum of expectedNetAmount (${expectedNetTotal}) does not reconcile to captured - fee - tax - refund - chargeback (${rhs}); money has leaked or been double-counted.`,
      rhs,
      expectedNetTotal,
      tolerance,
    );
  }

  counts["capturedPayments"] = captured.length;
  counts["refunds"] = data.refunds.length;
  counts["chargebacks"] = data.chargebacks.length;
  amounts["expectedNetTotal"] = expectedNetTotal;
  amounts["capturedAmount"] = capturedAmount;
  amounts["refundTotal"] = refundTotal;
  amounts["chargebackTotal"] = chargebackTotal;
}

function checkDebitCreditBalance(
  data: BatchData,
  results: MatchResult[],
  failures: InvariantFailure[],
  config: InvariantConfig,
  counts: Record<string, number>,
  amounts: Record<string, number>,
): void {
  const attributed = attributedTxnIds(results);
  const settlementUtrs = new Set<string>();
  let hasNullSettlementUtr = false;
  for (const s of data.settlements) {
    if (s.utr) settlementUtrs.add(s.utr);
    else hasNullSettlementUtr = true;
  }

  let creditTotal = 0;
  let debitTotal = 0;
  let unexplainedCredit = 0;
  for (const b of data.bankTransactions) {
    if (b.type === "CREDIT") {
      creditTotal += b.amount;
      // Attribution rule, mirroring the matcher's `isMatchedToSettlement`: a credit is
      // accounted for if it is referenced by a result (a matched settlement or an
      // orphan classification), OR if some settlement shares its UTR. UTR association
      // proves the credit belongs to a settlement — any timing/amount gap is surfaced
      // as that settlement's exception (DELAYED_BANK_CREDIT, NEEDS_MANUAL_REVIEW,
      // AMOUNT_MISMATCH, ...) for human review, not silently lost. Only a credit that
      // is attached to nothing AND shares no UTR with any settlement is money the
      // engine lost track of entirely (the matcher would have orphaned it).
      const sharesUtrWithSettlement =
        b.utr === null ? hasNullSettlementUtr : settlementUtrs.has(b.utr);
      if (!attributed.has(b.txnId) && !sharesUtrWithSettlement) {
        unexplainedCredit += b.amount;
      }
    } else if (b.type === "DEBIT") {
      debitTotal += b.amount;
    }
  }

  // Outflows (DEBIT) must be explained by chargebacks pulled back from the settlement
  // account. Refunds are a separate ledger and are not bank DEBITs here.
  const chargebackTotal = data.chargebacks.reduce((s, c) => s + c.amount, 0);
  const unexplainedDebit = Math.abs(debitTotal - chargebackTotal);
  const creditTolerance = aggTolerance(creditTotal, config);
  const debitTolerance = aggTolerance(debitTotal, config);

  if (unexplainedCredit > creditTolerance) {
    fail(
      failures,
      "INVARIANT_DEBIT_CREDIT_BALANCE",
      `${unexplainedCredit} paise of bank credits are not attributed to any settlement or orphan result.`,
      0,
      unexplainedCredit,
      creditTolerance,
    );
  }
  if (unexplainedDebit > debitTolerance) {
    fail(
      failures,
      "INVARIANT_DEBIT_CREDIT_BALANCE",
      `Bank debits (${debitTotal}) do not reconcile to chargebacks (${chargebackTotal}); unexplained outflow of ${unexplainedDebit} paise.`,
      chargebackTotal,
      debitTotal,
      debitTolerance,
    );
  }

  counts["bankCredits"] = data.bankTransactions.filter((b) => b.type === "CREDIT").length;
  counts["bankDebits"] = data.bankTransactions.filter((b) => b.type === "DEBIT").length;
  amounts["creditTotal"] = creditTotal;
  amounts["debitTotal"] = debitTotal;
  amounts["unexplainedCredit"] = unexplainedCredit;
  amounts["unexplainedDebit"] = unexplainedDebit;
}

function checkCardinalityConsistency(
  data: BatchData,
  relationships: CardinalityMatch[],
  failures: InvariantFailure[],
  config: InvariantConfig,
  counts: Record<string, number>,
): void {
  counts["relationships"] = relationships.length;
  if (relationships.length === 0) {
    return;
  }

  const settlementById = new Map(data.settlements.map((s) => [s.settlementId, s]));
  const bankById = new Map(data.bankTransactions.map((b) => [b.txnId, b]));
  const usedSettlementIds = new Set<string>();
  const usedBankTxnIds = new Set<string>();

  for (const rel of relationships) {
    let sourceSum = 0;
    for (const sid of rel.settlementIds) {
      if (usedSettlementIds.has(sid)) {
        fail(
          failures,
          "INVARIANT_CARDINALITY_CONSISTENCY",
          `Settlement ${sid} participates in more than one cardinality relationship (double-count).`,
          null,
          sid,
          0,
        );
      }
      usedSettlementIds.add(sid);
      const s = settlementById.get(sid);
      sourceSum += s ? s.amount : 0;
    }

    let targetSum = 0;
    for (const tid of rel.bankTxnIds) {
      if (usedBankTxnIds.has(tid)) {
        fail(
          failures,
          "INVARIANT_CARDINALITY_CONSISTENCY",
          `Bank txn ${tid} participates in more than one cardinality relationship (double-count).`,
          null,
          tid,
          0,
        );
      }
      usedBankTxnIds.add(tid);
      const b = bankById.get(tid);
      targetSum += b ? b.amount : 0;
    }

    const tolerance = aggTolerance(Math.max(sourceSum, targetSum, rel.bankAmount), config);
    if (Math.abs(sourceSum - targetSum) > tolerance) {
      fail(
        failures,
        "INVARIANT_CARDINALITY_CONSISTENCY",
        `Relationship ${rel.reasonCode} source sum (${sourceSum}) does not equal target sum (${targetSum}).`,
        targetSum,
        sourceSum,
        tolerance,
      );
    }
  }
}

function checkPartitionComplete(
  data: BatchData,
  results: MatchResult[],
  failures: InvariantFailure[],
  counts: Record<string, number>,
): void {
  const attributed = attributedTxnIds(results);
  const resultSettlementIds = new Set<string>();
  for (const r of results) {
    for (const id of r.settlementIds) {
      resultSettlementIds.add(id);
    }
  }

  let unaccountedSettlements = 0;
  for (const s of data.settlements) {
    if (!resultSettlementIds.has(s.settlementId)) {
      unaccountedSettlements++;
    }
  }
  if (unaccountedSettlements > 0) {
    fail(
      failures,
      "INVARIANT_PARTITION_COMPLETE",
      `${unaccountedSettlements} settlement(s) are not referenced by any reconciliation result.`,
      0,
      unaccountedSettlements,
      0,
    );
  }

  let unaccountedCredits = 0;
  const settlementUtrs = new Set<string>();
  let hasNullSettlementUtr = false;
  for (const s of data.settlements) {
    if (s.utr) settlementUtrs.add(s.utr);
    else hasNullSettlementUtr = true;
  }

  for (const b of data.bankTransactions) {
    // Same attribution rule as the debit/credit balance: a credit unattached to any
    // result is a partition violation only when no settlement shares its UTR (i.e. it
    // is not surfaced via a settlement's exception).
    const sharesUtrWithSettlement =
      b.utr === null ? hasNullSettlementUtr : settlementUtrs.has(b.utr);
    if (b.type === "CREDIT" && !attributed.has(b.txnId) && !sharesUtrWithSettlement) {
      unaccountedCredits++;
    }
  }
  if (unaccountedCredits > 0) {
    fail(
      failures,
      "INVARIANT_PARTITION_COMPLETE",
      `${unaccountedCredits} bank credit(s) are attached to no result and share no settlement UTR.`,
      0,
      unaccountedCredits,
      0,
    );
  }

  counts["settlements"] = data.settlements.length;
  counts["resultSettlements"] = resultSettlementIds.size;
  counts["unaccountedSettlements"] = unaccountedSettlements;
  counts["unaccountedCredits"] = unaccountedCredits;
}

function checkLedgerConsistency(
  data: BatchData,
  results: MatchResult[],
  metrics: ReconciliationMetrics,
  failures: InvariantFailure[],
  counts: Record<string, number>,
  amounts: Record<string, number>,
): void {
  const exceptions = results.filter((r) => r.status !== "AUTO_MATCHED");
  const recomputed: Record<string, number> = {
    totalRecords: results.length,
    autoMatched: results.filter((r) => r.status === "AUTO_MATCHED").length,
    exceptionsFound: exceptions.length,
    unresolvedCount: results.filter((r) => r.status === "NEEDS_MANUAL_REVIEW").length,
    grossOrderAmount: data.orders.reduce((s, o) => s + o.amount, 0),
    capturedPayments: data.payments
      .filter((p) => p.status === "captured")
      .reduce((s, p) => s + p.amount, 0),
    expectedSettlement: results.reduce((s, r) => s + r.expectedNetAmount, 0),
    actualBankCredits: data.bankTransactions
      .filter((b) => b.type === "CREDIT")
      .reduce((s, b) => s + b.amount, 0),
    totalRefunds: data.refunds.reduce((s, r) => s + r.amount, 0),
    totalChargebacks: data.chargebacks.reduce((s, c) => s + c.amount, 0),
    // Mirrors the evaluator exactly, including the `||` fallback semantics.
    amountAtRisk: exceptions.reduce(
      (s, e) => s + Math.abs(e.expectedNetAmount || e.bankCreditedAmount || 0),
      0,
    ),
  };

  const fields: Array<{ name: string; metric: number }> = [
    { name: "totalRecords", metric: metrics.totalRecords },
    { name: "autoMatched", metric: metrics.autoMatched },
    { name: "exceptionsFound", metric: metrics.exceptionsFound },
    { name: "unresolvedCount", metric: metrics.unresolvedCount },
    { name: "grossOrderAmount", metric: metrics.grossOrderAmount },
    { name: "capturedPayments", metric: metrics.capturedPayments },
    { name: "expectedSettlement", metric: metrics.expectedSettlement },
    { name: "actualBankCredits", metric: metrics.actualBankCredits },
    { name: "totalRefunds", metric: metrics.totalRefunds },
    { name: "totalChargebacks", metric: metrics.totalChargebacks },
    { name: "amountAtRisk", metric: metrics.amountAtRisk },
  ];

  for (const field of fields) {
    const recomputedValue = recomputed[field.name];
    if (field.metric !== recomputedValue) {
      fail(
        failures,
        "INVARIANT_LEDGER_CONSISTENCY",
        `Metric ${field.name} drifted: metrics=${field.metric}, recomputed=${recomputedValue}.`,
        recomputedValue,
        field.metric,
        0,
      );
    }
    if (
      field.name === "totalRecords" ||
      field.name === "autoMatched" ||
      field.name === "exceptionsFound" ||
      field.name === "unresolvedCount"
    ) {
      counts[field.name] = recomputedValue;
    } else {
      amounts[field.name] = recomputedValue;
    }
  }
}

/**
 * Evaluate all six financial invariants. Pure and deterministic.
 */
export function evaluateInvariants(
  data: BatchData,
  results: MatchResult[],
  metrics: ReconciliationMetrics,
  relationships: CardinalityMatch[],
  config: InvariantConfig = DEFAULT_CONFIG,
): InvariantReport {
  const failures: InvariantFailure[] = [];
  const counts: Record<string, number> = {};
  const amounts: Record<string, number> = {};

  checkInputComplete(data, results, failures, counts);
  checkMoneyConservation(data, results, failures, config, counts, amounts);
  checkDebitCreditBalance(data, results, failures, config, counts, amounts);
  checkCardinalityConsistency(data, relationships, failures, config, counts);
  checkPartitionComplete(data, results, failures, counts);
  checkLedgerConsistency(data, results, metrics, failures, counts, amounts);

  return {
    passed: failures.length === 0,
    failures,
    checkedCounts: counts,
    checkedAmounts: amounts,
  };
}

/**
 * Pure decision signal for the control workflow: PASS → proceed to risk gate;
 * CONTROL_FAILURE → maker/checker corrective action.
 */
export function controlDecision(report: InvariantReport): "PASSED" | "CONTROL_FAILURE" {
  return report.passed ? "PASSED" : "CONTROL_FAILURE";
}

/**
 * Fail-closed gate: throws {@link ControlFailureError} when any invariant fails.
 * The engine calls this (or handles evaluateInvariants) before finalizing a batch, so
 * a failed verification — including a failed re-verification after correction — never
 * reaches COMPLETED.
 */
export function assertInvariantsPass(
  data: BatchData,
  results: MatchResult[],
  metrics: ReconciliationMetrics,
  relationships: CardinalityMatch[],
  config: InvariantConfig = DEFAULT_CONFIG,
): InvariantReport {
  const report = evaluateInvariants(data, results, metrics, relationships, config);
  if (!report.passed) {
    throw new ControlFailureError(report);
  }
  return report;
}
