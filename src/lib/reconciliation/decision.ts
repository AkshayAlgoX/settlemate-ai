/*
 * Decision Engine — centralizes the reconciliation outcomes and per-record risk.
 *
 * Every MatchResult is mapped to exactly one of three outcomes:
 *   AUTO_MATCHED    — a clean, high-confidence match; safe for straight-through.
 *   SUGGESTED_MATCH — an unconfirmed proposed match (NEEDS_MANUAL_REVIEW: the engine
 *                     found multiple candidates and says "human judgment required").
 *   EXCEPTION       — a classified problem (AMOUNT_MISMATCH, MISSING_BANK_CREDIT, ...)
 *                     that is resolved and routed to the review queue.
 *
 * Each Decision carries the confidence, a UPPER_SNAKE_CASE reasonCode, the match
 * strategy used, the evidence that supports it, a reference to any cardinality
 * relationship it participates in, and the risk level + the risk triggers that
 * drove it. Risk is advisory here — CRITICAL is only ever assigned by the Risk Gate
 * (never by confidence).
 *
 * This module is pure: no DB, no I/O, deterministic, and independently testable.
 */

import { PAYMENT_METHODS } from "@/lib/constants";
import type { BatchData, MatchResult } from "./types";
import type { CardinalityMatch } from "./cardinality";

export const DECISION_OUTCOMES = [
  "AUTO_MATCHED",
  "SUGGESTED_MATCH",
  "EXCEPTION",
] as const;
export type DecisionOutcome = (typeof DECISION_OUTCOMES)[number];

export const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const RISK_TRIGGERS = [
  "MATERIAL_AMOUNT",
  "LOW_CONFIDENCE",
  "FIRST_OCCURRENCE",
  "PROVIDER_RISK",
  "UNUSUAL_PATTERN",
  "POLICY_MODEL_VERSION",
  "AGGREGATE_EXPOSURE",
] as const;
export type RiskTrigger = (typeof RISK_TRIGGERS)[number];

export interface Decision {
  paymentId: string;
  outcome: DecisionOutcome;
  confidence: number;
  /** LOW | MEDIUM | HIGH — CRITICAL is assigned only by the Risk Gate, never here. */
  riskLevel: RiskLevel;
  reasonCode: string;
  matchStrategy: string;
  evidence: string[];
  relationshipRef: string | null;
  triggers: RiskTrigger[];
}

export interface DecisionReport {
  decisions: Decision[];
  aggregate: {
    total: number;
    autoMatched: number;
    suggestedMatches: number;
    exceptions: number;
    byOutcome: Record<DecisionOutcome, number>;
    byRisk: Record<RiskLevel, number>;
    lowRiskCount: number;
    mediumRiskCount: number;
    highRiskCount: number;
    amountAtRisk: number;
    aggregateExposurePaise: number;
    novelCount: number;
    maxRisk: RiskLevel;
  };
}

export const DECISION_CONFIG = {
  /** Paise above which an exception/suggestion is a material amount (₹10,000). */
  MATERIAL_AMOUNT_PAISE: 1_000_000,
  /** Confidence strictly below this flags low confidence. */
  LOW_CONFIDENCE_MAX: 40,
  /** Batch-level amount-at-risk that trips aggregate exposure (₹50,000). */
  AGGREGATE_EXPOSURE_PAISE: 5_000_000,
  /** Payment methods considered higher provider risk. */
  PROVIDER_RISK_METHODS: ["card", "netbanking"],
} as const;

/** Match strategies that reflect a legacy/fallback path, not a current model strategy. */
const LEGACY_MATCH_STRATEGIES = new Set([
  "NO_SETTLEMENT_YET",
  "OVERDUE_NO_SETTLEMENT",
  "NO_CAPTURE_DATE",
  "ORPHAN_DETECTION",
  "AMBIGUOUS_FUZZY",
  "NO_BANK_MATCH",
  "MULTIPLE_SETTLEMENTS",
]);

const RISK_ORDER: Record<RiskLevel, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

/** Reason code for an outcome + status. UPPER_SNAKE_CASE. */
function reasonCodeFor(status: string, outcome: DecisionOutcome): string {
  if (outcome === "AUTO_MATCHED") return "AUTO_MATCHED_CONFIRMED";
  if (outcome === "SUGGESTED_MATCH") return "SUGGESTED_MATCH_NEEDS_REVIEW";
  return `EXCEPTION_${status}`;
}

/** Match strategy, preferring the matcher's method, then the cardinality pass, else unresolved. */
function matchStrategyFor(result: MatchResult): string {
  const method = (result.matchMethod || "").trim();
  if (method !== "" && method !== "NONE") return method;
  if (result.cardinalityReason) {
    return `CARDINALITY_${result.cardinalityType.replace(":", "_TO_")}`;
  }
  return "UNRESOLVED";
}

/** Evidence lines supporting a decision, excluding empty fragments. */
function evidenceFor(result: MatchResult): string[] {
  const lines: string[] = [];
  if (result.matchDetails && result.matchDetails.trim() !== "") {
    lines.push(result.matchDetails.trim());
  }
  if (result.cardinalityReason && result.cardinalityReason.trim() !== "") {
    lines.push(`Cardinality: ${result.cardinalityReason.trim()}`);
  }
  if (result.mismatchAmount !== null && result.mismatchAmount !== 0) {
    lines.push(`Amount mismatch: ${result.mismatchAmount} paise`);
  }
  return lines;
}

/** True when the record is "novel" — no anchor in the batch to validate it against. */
function isNovel(result: MatchResult, method: string | undefined): boolean {
  if (result.paymentId.startsWith("orphan_")) return true;
  if (method !== undefined && !(PAYMENT_METHODS as readonly string[]).includes(method)) {
    return true;
  }
  return false;
}

/** Unusual pattern: a large mismatch or a material timing anomaly. */
function hasUnusualPattern(result: MatchResult): boolean {
  const net = Math.abs(result.expectedNetAmount);
  const mismatch = result.mismatchAmount;
  if (mismatch !== null && mismatch !== 0 && net > 0) {
    if (Math.abs(mismatch) > Math.max(1000, Math.round(net * 0.05))) return true;
  }
  if (
    (result.status === "DELAYED_BANK_CREDIT" ||
      result.status === "MISSING_BANK_CREDIT") &&
    Math.abs(result.expectedNetAmount) >= DECISION_CONFIG.MATERIAL_AMOUNT_PAISE
  ) {
    return true;
  }
  return false;
}

interface DecisionInput {
  result: MatchResult;
  method: string | undefined;
}

function evaluateDecision({ result, method }: DecisionInput): Decision {
  const status = result.status;
  const outcome: DecisionOutcome =
    status === "AUTO_MATCHED"
      ? "AUTO_MATCHED"
      : status === "NEEDS_MANUAL_REVIEW"
      ? "SUGGESTED_MATCH"
      : "EXCEPTION";

  const confidence = result.confidenceScore;
  const triggers: RiskTrigger[] = [];

  if (outcome === "AUTO_MATCHED") {
    return {
      paymentId: result.paymentId,
      outcome,
      confidence,
      riskLevel: "LOW",
      reasonCode: reasonCodeFor(status, outcome),
      matchStrategy: matchStrategyFor(result),
      evidence: evidenceFor(result),
      relationshipRef: null,
      triggers,
    };
  }

  const material =
    Math.abs(result.expectedNetAmount) >= DECISION_CONFIG.MATERIAL_AMOUNT_PAISE;
  const lowConfidence = confidence < DECISION_CONFIG.LOW_CONFIDENCE_MAX;

  if (material) triggers.push("MATERIAL_AMOUNT");
  if (lowConfidence) triggers.push("LOW_CONFIDENCE");
  if (isNovel(result, method)) triggers.push("FIRST_OCCURRENCE");
  if (
    method !== undefined &&
    (DECISION_CONFIG.PROVIDER_RISK_METHODS as readonly string[]).includes(method)
  ) {
    triggers.push("PROVIDER_RISK");
  }
  if (hasUnusualPattern(result)) triggers.push("UNUSUAL_PATTERN");
  if (LEGACY_MATCH_STRATEGIES.has(matchStrategyFor(result))) {
    triggers.push("POLICY_MODEL_VERSION");
  }

  let riskLevel: RiskLevel;
  if (outcome === "SUGGESTED_MATCH") {
    riskLevel = material || lowConfidence ? "HIGH" : "MEDIUM";
  } else {
    const highSignal =
      (lowConfidence && material) ||
      triggers.includes("UNUSUAL_PATTERN") ||
      triggers.includes("PROVIDER_RISK") ||
      triggers.includes("FIRST_OCCURRENCE");
    const mediumSignal = material || lowConfidence;
    riskLevel = highSignal ? "HIGH" : mediumSignal ? "MEDIUM" : "LOW";
  }

  return {
    paymentId: result.paymentId,
    outcome,
    confidence,
    riskLevel,
    reasonCode: reasonCodeFor(status, outcome),
    matchStrategy: matchStrategyFor(result),
    evidence: evidenceFor(result),
    relationshipRef: null,
    triggers,
  };
}

/**
 * Evaluate a batch of reconciliation results into a DecisionReport.
 *
 * Deterministic: the same results/data/relationships always produce the same report.
 * A second pass applies aggregate exposure: if the batch's amount-at-risk reaches the
 * AGGREGATE_EXPOSURE threshold, every exception/suggestion is additionally flagged
 * AGGREGATE_EXPOSURE and forced HIGH (batch-level concentration risk).
 */
export function evaluateBatchDecisions(
  results: MatchResult[],
  data: BatchData,
  relationships: CardinalityMatch[],
): DecisionReport {
  const paymentByPaymentId = new Map<string, BatchData["payments"][number]>();
  for (const payment of data.payments) {
    paymentByPaymentId.set(payment.paymentId, payment);
  }

  // Map cardinality relationships by the settlement/bank ids they reference so a
  // record's relationshipRef can be attached.
  const relationshipByTxnId = new Map<string, CardinalityMatch>();
  const relationshipBySettlementId = new Map<string, CardinalityMatch>();
  for (const rel of relationships) {
    for (const tid of rel.bankTxnIds) relationshipByTxnId.set(tid, rel);
    for (const sid of rel.settlementIds) relationshipBySettlementId.set(sid, rel);
  }

  function relationshipRefFor(result: MatchResult): string | null {
    let rel: CardinalityMatch | undefined;
    for (const tid of result.bankTxnIds) {
      rel = relationshipByTxnId.get(tid);
      if (rel) break;
    }
    if (!rel) {
      for (const sid of result.settlementIds) {
        rel = relationshipBySettlementId.get(sid);
        if (rel) break;
      }
    }
    if (!rel) return null;
    return `${rel.reasonCode}@settlement:${rel.settlementIds.join(",")}|bank:${rel.bankTxnIds.join(",")}`;
  }

  // First pass: per-record risk (no aggregate exposure yet).
  const decisions = results.map((result) => {
    const decision = evaluateDecision({
      result,
      method: paymentByPaymentId.get(result.paymentId)?.method,
    });
    decision.relationshipRef = relationshipRefFor(result);
    return decision;
  });

  const aggregate = {
    total: decisions.length,
    autoMatched: 0,
    suggestedMatches: 0,
    exceptions: 0,
    byOutcome: { AUTO_MATCHED: 0, SUGGESTED_MATCH: 0, EXCEPTION: 0 } as Record<
      DecisionOutcome,
      number
    >,
    byRisk: { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 } as Record<RiskLevel, number>,
    lowRiskCount: 0,
    mediumRiskCount: 0,
    highRiskCount: 0,
    amountAtRisk: 0,
    aggregateExposurePaise: 0,
    novelCount: 0,
    maxRisk: "LOW" as RiskLevel,
  };

  for (const d of decisions) {
    aggregate.byOutcome[d.outcome]++;
    aggregate.byRisk[d.riskLevel]++;
    if (d.outcome === "AUTO_MATCHED") aggregate.autoMatched++;
    else if (d.outcome === "SUGGESTED_MATCH") aggregate.suggestedMatches++;
    else aggregate.exceptions++;

    if (d.riskLevel === "LOW") aggregate.lowRiskCount++;
    else if (d.riskLevel === "MEDIUM") aggregate.mediumRiskCount++;
    else aggregate.highRiskCount++;

    if (d.triggers.includes("FIRST_OCCURRENCE")) aggregate.novelCount++;
  }

  // Amount-at-risk for exceptions/suggestions only (mirrors the evaluator).
  for (let i = 0; i < decisions.length; i++) {
    const d = decisions[i];
    if (d.outcome === "AUTO_MATCHED") continue;
    const result = results[i];
    aggregate.amountAtRisk += result
      ? Math.abs(result.expectedNetAmount || result.bankCreditedAmount || 0)
      : 0;
  }
  aggregate.aggregateExposurePaise = aggregate.amountAtRisk;

  // Second pass: aggregate exposure override.
  if (aggregate.amountAtRisk >= DECISION_CONFIG.AGGREGATE_EXPOSURE_PAISE) {
    for (const d of decisions) {
      if (d.outcome === "AUTO_MATCHED") continue;
      if (!d.triggers.includes("AGGREGATE_EXPOSURE")) d.triggers.push("AGGREGATE_EXPOSURE");
      d.riskLevel = "HIGH";
    }
    // Re-tally counts after the override.
    aggregate.byRisk = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
    aggregate.lowRiskCount = 0;
    aggregate.mediumRiskCount = 0;
    aggregate.highRiskCount = 0;
    for (const d of decisions) {
      aggregate.byRisk[d.riskLevel]++;
      if (d.riskLevel === "LOW") aggregate.lowRiskCount++;
      else if (d.riskLevel === "MEDIUM") aggregate.mediumRiskCount++;
      else aggregate.highRiskCount++;
    }
  }

  let maxRisk: RiskLevel = "LOW";
  for (const d of decisions) {
    if (RISK_ORDER[d.riskLevel] > RISK_ORDER[maxRisk]) maxRisk = d.riskLevel;
  }
  aggregate.maxRisk = maxRisk;

  return { decisions, aggregate };
}
