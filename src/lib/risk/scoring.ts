/*
 * SettleMate AI — Risk & Exposure Scoring (Risk Command Center)
 *
 * Pure, deterministic, integer-paise risk aggregation over a set of unresolved
 * reconciliation exceptions. Given the exceptions from one or more reconciliation
 * runs it computes:
 *   - unresolved count + total unresolved amount (paise),
 *   - a per-exception risk category (HIGH / MEDIUM / LOW) by variance band,
 *   - tolerance-stacking exposure ("death by 1,000 pauses": many individually
 *     immaterial variances that collectively cross a material line),
 *   - SLA-breach, duplicate-credit and cross-currency-spread risk counts,
 *   - a 0–100 batch risk score from four weighted factors
 *     (severity, amount, count, tolerance stacking).
 *
 * Design constraints:
 *   - ALL financial math is exact integer minor units (paise). No floating point
 *     touches a money value; the 0–100 score itself is computed with integer
 *     arithmetic (floored component contributions) so it is byte-stable.
 *   - No I/O, no Date, no randomness — same input always yields the same report,
 *     so it is trivially unit-testable and safe to call from any route.
 *   - Category bands intentionally reuse the thresholds already encoded in the
 *     reconciliation decision engine (see DECISION_CONFIG in
 *     src/lib/reconciliation/decision.ts): ₹10,000 materiality and ₹50,000
 *     aggregate-exposure lines, so this view never contradicts the core engine.
 *
 * This module is fully isolated: it imports only the currency formatter and adds
 * no coupling to — and makes no change to — the reconciliation core, the AI
 * validators, or the financial invariants.
 */

import { formatCurrency } from "@/lib/format";

/** Risk category for a single exception, by absolute variance band. */
export type RiskCategory = "HIGH" | "MEDIUM" | "LOW";

/** Overall batch risk band derived from the 0–100 score. */
export type RiskBand = "LOW" | "MODERATE" | "ELEVATED" | "CRITICAL";

/**
 * Tunable thresholds. Money values are exact paise. The HIGH / MEDIUM lines are
 * deliberately the same constants the core decision engine uses so the two views
 * agree to the paise.
 */
export const RISK_SCORING_CONFIG = {
  /** Variance strictly greater than this is HIGH risk (₹50,000). */
  HIGH_VARIANCE_PAISE: 5_000_000,
  /** Variance at or above this (and ≤ HIGH line) is MEDIUM risk (₹10,000). */
  MEDIUM_VARIANCE_PAISE: 1_000_000,
  /** A variance at or below this is "small" and counts toward stacking (₹1,000). */
  SMALL_VARIANCE_CAP_PAISE: 100_000,
  /** ≥ this many small variances trips a tolerance-stacking breach. */
  STACKING_COUNT_THRESHOLD: 25,
  /** Cumulative small-variance exposure at/above this trips a breach (₹10,000). */
  STACKING_CUMULATIVE_PAISE: 1_000_000,
  /** Amount-factor saturation: total unresolved ≥ this maxes the amount weight (₹100,000). */
  AMOUNT_SATURATION_PAISE: 10_000_000,
  /** Count-factor saturation: this many exceptions maxes the count weight. */
  COUNT_SATURATION: 30,
} as const;

/** Maximum contribution of each scoring factor; the four sum to 100. */
export const SCORE_WEIGHTS = {
  severity: 40,
  amount: 30,
  count: 15,
  stacking: 15,
} as const;

/**
 * A single unresolved exception, in the minimal shape the scorer needs. Callers
 * (API routes) map their own exception records — a stored V1ExceptionItem, a
 * live MatchResult, a Scenario Lab exception — into this. `variancePaise` is the
 * absolute amount at risk for the exception and MUST be a non-negative integer.
 */
export interface RiskExceptionInput {
  id: string;
  /** Matcher status or exception type, e.g. "AMOUNT_MISMATCH", "DUPLICATE_CREDIT". */
  type: string;
  paymentId: string;
  /** Absolute variance / amount-at-risk in exact integer paise (≥ 0). */
  variancePaise: number;
  /** Optional scenario category (REFUND_VARIANCE, SLA_BREACH, …) — the strongest classifier when present. */
  category?: string;
  /** Optional ISO-4217 code; anything other than INR flags cross-currency spread risk. */
  currency?: string;
  /** Optional context carried through for display only. */
  expectedNetPaise?: number;
  actualSettledPaise?: number | null;
  cardinalityType?: string;
  description?: string;
}

/** An exception enriched with its category, root cause and recommended action. */
export interface ClassifiedException {
  id: string;
  type: string;
  paymentId: string;
  variancePaise: number;
  varianceFormatted: string;
  riskLevel: RiskCategory;
  family: RiskFamily;
  rootCause: string;
  recommendedAction: string;
  /** Playbook slug for the optional per-exception resolution link. */
  playbookType: string;
  expectedNetPaise?: number;
  actualSettledPaise?: number | null;
  cardinalityType?: string;
  description?: string;
}

export interface RiskCategoryBucket {
  count: number;
  amountPaise: number;
  amountFormatted: string;
}

export interface RiskExposureReport {
  totals: {
    unresolvedCount: number;
    unresolvedAmountPaise: number;
    unresolvedAmountFormatted: string;
  };
  byCategory: Record<RiskCategory, RiskCategoryBucket>;
  toleranceStacking: {
    smallVarianceCount: number;
    smallVarianceCapPaise: number;
    exposurePaise: number;
    exposureFormatted: string;
    breached: boolean;
    reason: string;
  };
  slaBreaches: { count: number; amountAffectedPaise: number; amountAffectedFormatted: string };
  duplicateCreditRisks: { count: number; amountPaise: number; amountFormatted: string };
  crossCurrencyRisks: { count: number; amountPaise: number; amountFormatted: string };
  riskScore: number;
  riskBand: RiskBand;
  scoreBreakdown: { severity: number; amount: number; count: number; stacking: number };
  exceptions: ClassifiedException[];
}

/** Coarse family used for root-cause/action lookup and the SLA/dup/FX counters. */
export type RiskFamily =
  | "REFUND_VARIANCE"
  | "FEE_MISMATCH"
  | "CHARGEBACK_RISK"
  | "SLA_BREACH"
  | "DUPLICATE_CREDIT"
  | "CROSS_CURRENCY"
  | "MISSING_CREDIT"
  | "AMOUNT_VARIANCE"
  | "UNCLASSIFIED";

interface FamilyPlaybook {
  rootCause: string;
  recommendedAction: string;
  playbookType: string;
}

const FAMILY_PLAYBOOK: Record<RiskFamily, FamilyPlaybook> = {
  REFUND_VARIANCE: {
    rootCause: "Un-notified refund / voucher executed at the gateway reduced the settled amount.",
    recommendedAction: "Post a double-entry journal from REFUND_CLEARING_AC to SETTLEMENT_VARIANCE_AC.",
    playbookType: "refund-variance",
  },
  FEE_MISMATCH: {
    rootCause: "Processor billed a fee above the contracted rate tier.",
    recommendedAction: "Raise an automated clawback dispute with the gateway; hold in PROCESSOR_DISPUTE_CLEARING.",
    playbookType: "fee-dispute",
  },
  CHARGEBACK_RISK: {
    rootCause: "Chargeback / dispute exposure against a settled payment.",
    recommendedAction: "File representment defense or reserve funds in CHARGEBACK_ARBITRATION_SUSPENSE.",
    playbookType: "chargeback",
  },
  SLA_BREACH: {
    rootCause: "Settlement arrived outside the contractual T+1 SLA window.",
    recommendedAction: "Escalate to the provider and tag for SLA-breach penalty deduction.",
    playbookType: "sla-breach",
  },
  DUPLICATE_CREDIT: {
    rootCause: "Duplicate bank credit / double settlement posted for a single payment.",
    recommendedAction: "Hold the surplus in UNCLAIMED_BANK_CREDITS and notify treasury for clawback.",
    playbookType: "duplicate-credit",
  },
  CROSS_CURRENCY: {
    rootCause: "FX spread / cross-currency conversion variance on the settled amount.",
    recommendedAction: "Verify the applied FX rate and spread; adjust FX_CLEARING_AC.",
    playbookType: "cross-currency",
  },
  MISSING_CREDIT: {
    rootCause: "Expected bank credit is missing for a settled payment.",
    recommendedAction: "Trace the payout with the nodal bank; hold in SETTLEMENT_IN_TRANSIT.",
    playbookType: "missing-credit",
  },
  AMOUNT_VARIANCE: {
    rootCause: "Settled amount does not match the expected net for the payment.",
    recommendedAction: "Investigate the variance and route to controlled review before finalizing.",
    playbookType: "amount-variance",
  },
  UNCLASSIFIED: {
    rootCause: "Unclassified reconciliation exception.",
    recommendedAction: "Manual review by the finance controller (Maker/Checker).",
    playbookType: "manual-review",
  },
};

/**
 * Classify an exception into a family from its scenario category (strongest
 * signal) or, failing that, keyword-matching its type. Deterministic and
 * order-independent: the first matching rule wins in a fixed precedence.
 */
export function classifyFamily(input: Pick<RiskExceptionInput, "type" | "category" | "currency">): RiskFamily {
  const cat = (input.category || "").trim().toUpperCase();
  const type = (input.type || "").trim().toUpperCase();
  const hay = `${cat} ${type}`;

  // Cross-currency: an explicit non-INR currency is definitive.
  if (input.currency && input.currency.trim().toUpperCase() !== "INR") return "CROSS_CURRENCY";

  if (cat === "REFUND_VARIANCE" || hay.includes("REFUND")) return "REFUND_VARIANCE";
  if (cat === "FEE_MISMATCH" || hay.includes("FEE")) return "FEE_MISMATCH";
  if (cat === "CHARGEBACK_RISK" || hay.includes("CHARGEBACK")) return "CHARGEBACK_RISK";
  if (cat === "SLA_BREACH" || hay.includes("SLA") || hay.includes("DELAYED")) return "SLA_BREACH";
  if (cat === "DUPLICATE_CREDIT" || hay.includes("DUPLICATE") || hay.includes("DUP_")) return "DUPLICATE_CREDIT";
  if (hay.includes("CROSS_CURRENCY") || hay.includes("FX") || hay.includes("CURRENCY")) return "CROSS_CURRENCY";
  if (hay.includes("MISSING")) return "MISSING_CREDIT";
  if (hay.includes("MISMATCH") || hay.includes("AMOUNT") || hay.includes("VARIANCE")) return "AMOUNT_VARIANCE";
  return "UNCLASSIFIED";
}

/** Risk category from an absolute variance in paise. */
export function categorize(variancePaise: number): RiskCategory {
  const v = Math.abs(Math.trunc(variancePaise));
  if (v > RISK_SCORING_CONFIG.HIGH_VARIANCE_PAISE) return "HIGH";
  if (v >= RISK_SCORING_CONFIG.MEDIUM_VARIANCE_PAISE) return "MEDIUM";
  return "LOW";
}

/** Batch risk band from the 0–100 score. */
export function bandForScore(score: number): RiskBand {
  if (score >= 75) return "CRITICAL";
  if (score >= 50) return "ELEVATED";
  if (score >= 25) return "MODERATE";
  return "LOW";
}

function emptyBucket(): RiskCategoryBucket {
  return { count: 0, amountPaise: 0, amountFormatted: formatCurrency(0) };
}

/**
 * Compute the full risk & exposure report for a set of unresolved exceptions.
 * Pure and deterministic. Non-integer or negative variances are coerced with
 * Math.abs + Math.trunc so a caller can never introduce fractional paise.
 */
export function computeRiskExposure(exceptions: RiskExceptionInput[]): RiskExposureReport {
  const classified: ClassifiedException[] = [];
  const byCategory: Record<RiskCategory, RiskCategoryBucket> = {
    HIGH: emptyBucket(),
    MEDIUM: emptyBucket(),
    LOW: emptyBucket(),
  };

  let unresolvedAmountPaise = 0;
  let highCount = 0;
  let mediumCount = 0;

  let smallVarianceCount = 0;
  let stackingExposurePaise = 0;

  let slaCount = 0;
  let slaAmountPaise = 0;
  let dupCount = 0;
  let dupAmountPaise = 0;
  let fxCount = 0;
  let fxAmountPaise = 0;

  for (const ex of exceptions) {
    const variancePaise = Math.abs(Math.trunc(ex.variancePaise || 0));
    const riskLevel = categorize(variancePaise);
    const family = classifyFamily(ex);
    const playbook = FAMILY_PLAYBOOK[family];

    unresolvedAmountPaise += variancePaise;
    byCategory[riskLevel].count += 1;
    byCategory[riskLevel].amountPaise += variancePaise;

    if (riskLevel === "HIGH") highCount += 1;
    else if (riskLevel === "MEDIUM") mediumCount += 1;

    // Tolerance stacking: individually-small (but non-zero) variances that
    // collectively can become material.
    if (variancePaise > 0 && variancePaise <= RISK_SCORING_CONFIG.SMALL_VARIANCE_CAP_PAISE) {
      smallVarianceCount += 1;
      stackingExposurePaise += variancePaise;
    }

    if (family === "SLA_BREACH") {
      slaCount += 1;
      slaAmountPaise += variancePaise;
    } else if (family === "DUPLICATE_CREDIT") {
      dupCount += 1;
      dupAmountPaise += variancePaise;
    } else if (family === "CROSS_CURRENCY") {
      fxCount += 1;
      fxAmountPaise += variancePaise;
    }

    classified.push({
      id: ex.id,
      type: ex.type,
      paymentId: ex.paymentId,
      variancePaise,
      varianceFormatted: formatCurrency(variancePaise),
      riskLevel,
      family,
      rootCause: playbook.rootCause,
      recommendedAction: playbook.recommendedAction,
      playbookType: playbook.playbookType,
      expectedNetPaise: ex.expectedNetPaise,
      actualSettledPaise: ex.actualSettledPaise,
      cardinalityType: ex.cardinalityType,
      description: ex.description,
    });
  }

  for (const cat of ["HIGH", "MEDIUM", "LOW"] as const) {
    byCategory[cat].amountFormatted = formatCurrency(byCategory[cat].amountPaise);
  }

  const total = exceptions.length;

  const stackingBreached =
    smallVarianceCount >= RISK_SCORING_CONFIG.STACKING_COUNT_THRESHOLD ||
    stackingExposurePaise >= RISK_SCORING_CONFIG.STACKING_CUMULATIVE_PAISE;

  const stackingReason = stackingBreached
    ? `Tolerance stacking breach: ${smallVarianceCount} small variance(s) (≤ ${formatCurrency(
        RISK_SCORING_CONFIG.SMALL_VARIANCE_CAP_PAISE
      )} each) accumulate ${formatCurrency(stackingExposurePaise)} of exposure.`
    : `Within tolerance: ${smallVarianceCount} small variance(s) totalling ${formatCurrency(
        stackingExposurePaise
      )}, below the stacking limits.`;

  // ---- 0–100 risk score, integer arithmetic only ----
  // severity: weighted count of high/medium-risk exceptions (HIGH=8, MEDIUM=3),
  // capped at its weight. Absolute (not a proportion) so adding a risky exception
  // can never lower the score — a risk index must be monotonic under new findings.
  const severity = Math.min(SCORE_WEIGHTS.severity, highCount * 8 + mediumCount * 3);
  // amount: total unresolved exposure vs the saturation ceiling.
  const amount = Math.min(
    SCORE_WEIGHTS.amount,
    Math.floor((unresolvedAmountPaise * SCORE_WEIGHTS.amount) / RISK_SCORING_CONFIG.AMOUNT_SATURATION_PAISE)
  );
  // count: number of unresolved exceptions vs the saturation ceiling.
  const count = Math.min(
    SCORE_WEIGHTS.count,
    Math.floor((total * SCORE_WEIGHTS.count) / RISK_SCORING_CONFIG.COUNT_SATURATION)
  );
  // stacking: a breach maxes the weight; otherwise scale by accumulated exposure.
  const stacking = stackingBreached
    ? SCORE_WEIGHTS.stacking
    : Math.min(
        SCORE_WEIGHTS.stacking,
        Math.floor(
          (stackingExposurePaise * SCORE_WEIGHTS.stacking) / RISK_SCORING_CONFIG.STACKING_CUMULATIVE_PAISE
        )
      );

  const riskScore = Math.min(100, severity + amount + count + stacking);

  return {
    totals: {
      unresolvedCount: total,
      unresolvedAmountPaise,
      unresolvedAmountFormatted: formatCurrency(unresolvedAmountPaise),
    },
    byCategory,
    toleranceStacking: {
      smallVarianceCount,
      smallVarianceCapPaise: RISK_SCORING_CONFIG.SMALL_VARIANCE_CAP_PAISE,
      exposurePaise: stackingExposurePaise,
      exposureFormatted: formatCurrency(stackingExposurePaise),
      breached: stackingBreached,
      reason: stackingReason,
    },
    slaBreaches: {
      count: slaCount,
      amountAffectedPaise: slaAmountPaise,
      amountAffectedFormatted: formatCurrency(slaAmountPaise),
    },
    duplicateCreditRisks: {
      count: dupCount,
      amountPaise: dupAmountPaise,
      amountFormatted: formatCurrency(dupAmountPaise),
    },
    crossCurrencyRisks: {
      count: fxCount,
      amountPaise: fxAmountPaise,
      amountFormatted: formatCurrency(fxAmountPaise),
    },
    riskScore,
    riskBand: bandForScore(riskScore),
    scoreBreakdown: { severity, amount, count, stacking },
    exceptions: classified,
  };
}
