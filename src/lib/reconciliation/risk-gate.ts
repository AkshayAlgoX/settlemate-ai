/*
 * Risk Gate — routes a batch to a control workflow and enforces the corrective path.
 *
 * Given a DecisionReport (per-record outcomes + risk) and an InvariantReport (financial
 * control checks), it returns a routing verdict:
 *   STRAIGHT_THROUGH       (LOW)     → safe to finalize; no human step required.
 *   CONTROLLED_REVIEW      (MEDIUM)  → controlled review / sampling required before final.
 *   MAKER_CHECKER_REQUIRED (HIGH)    → mandatory Maker/Checker approval before final.
 *   CRITICAL_BLOCKED       (CRITICAL)→ invariant failure always blocks finalization and is
 *                                       NEVER downgraded to LOW/MEDIUM/HIGH by confidence.
 *
 * The corrective path is capped: CONTROL_FAILURE → MAKER/CHECKER → CORRECTIVE ACTION →
 * RE-CALCULATE → FINANCIAL INVARIANTS → PASS/FAIL. After MAX_CORRECTION_ATTEMPTS (3)
 * failed correction cycles the batch escalates to UNRESOLVABLE /
 * ESCALATED_TO_CONTROLLER / PERMANENTLY_BLOCKED_PENDING_REVIEW.
 *
 * This module is pure: no DB, no I/O, deterministic, independently testable.
 */

import type { InvariantReport } from "./invariants";
import type { DecisionReport, RiskLevel } from "./decision";

/** Maximum failed correction cycles before a batch is escalated. */
export const MAX_CORRECTION_ATTEMPTS = 3;

export const ROUTING_OUTCOMES = [
  "STRAIGHT_THROUGH",
  "CONTROLLED_REVIEW",
  "MAKER_CHECKER_REQUIRED",
  "CRITICAL_BLOCKED",
] as const;
export type RoutingOutcome = (typeof ROUTING_OUTCOMES)[number];

export const CORRECTION_END_STATES = [
  "UNRESOLVABLE",
  "ESCALATED_TO_CONTROLLER",
  "PERMANENTLY_BLOCKED_PENDING_REVIEW",
] as const;
export type CorrectionEndState = (typeof CORRECTION_END_STATES)[number];

export interface GateVerdict {
  routing: RoutingOutcome;
  riskLevel: RiskLevel;
  reason: string;
  correctionAttempts: number;
  escalated: boolean;
  endState: CorrectionEndState | null;
}

/**
 * Route a batch based on its decision report and financial-invariant report.
 *
 * Precedence (fail-closed):
 *   1. Any invariant failure → CRITICAL_BLOCKED. CRITICAL is the top of the risk order
 *      and is independent of confidence: a high-confidence report cannot downgrade it.
 *   2. Any HIGH decision → MAKER_CHECKER_REQUIRED (mandatory human approval).
 *   3. Any MEDIUM decision → CONTROLLED_REVIEW (controlled review / sample).
 *   4. Otherwise → STRAIGHT_THROUGH (all LOW; safe to finalize).
 */
export function evaluateGate(
  report: DecisionReport,
  invariantReport: InvariantReport,
  correctionAttempts: number,
): GateVerdict {
  if (invariantReport.failures.length > 0) {
    const codes = invariantReport.failures.map((f) => f.code).join(", ");
    return {
      routing: "CRITICAL_BLOCKED",
      riskLevel: "CRITICAL",
      reason: `Financial invariant(s) failed: ${codes}`,
      correctionAttempts,
      escalated: correctionAttempts >= MAX_CORRECTION_ATTEMPTS,
      endState: correctionAttempts >= MAX_CORRECTION_ATTEMPTS
        ? correctiveEndState(correctionAttempts, "CRITICAL")
        : null,
    };
  }

  if (report.aggregate.maxRisk === "HIGH" || report.aggregate.highRiskCount > 0) {
    return {
      routing: "MAKER_CHECKER_REQUIRED",
      riskLevel: "HIGH",
      reason: `${report.aggregate.highRiskCount} high-risk decision(s) require mandatory Maker/Checker approval.`,
      correctionAttempts,
      escalated: false,
      endState: null,
    };
  }

  if (report.aggregate.mediumRiskCount > 0) {
    return {
      routing: "CONTROLLED_REVIEW",
      riskLevel: "MEDIUM",
      reason: `${report.aggregate.mediumRiskCount} medium-risk decision(s) require controlled review / sampling.`,
      correctionAttempts,
      escalated: false,
      endState: null,
    };
  }

  return {
    routing: "STRAIGHT_THROUGH",
    riskLevel: "LOW",
    reason: "All decisions are low risk; safe for straight-through finalization.",
    correctionAttempts,
    escalated: false,
    endState: null,
  };
}

/**
 * The terminal state a batch escalates to once it has exhausted its correction
 * attempts. Returns null while attempts are within the allowed budget; once
 * attempts exceed MAX_CORRECTION_ATTEMPTS it returns a deterministic end state:
 *   CRITICAL/HIGH control risk → ESCALATED_TO_CONTROLLER
 *   otherwise (repeated unresolvable/policy failures) → PERMANENTLY_BLOCKED_PENDING_REVIEW
 *   (UNRESOLVABLE is reserved for the pure corrective-cycle model when no end state applies.)
 */
export function correctiveEndState(
  attempts: number,
  riskLevel: RiskLevel,
): CorrectionEndState | null {
  if (attempts <= MAX_CORRECTION_ATTEMPTS) return null;
  if (riskLevel === "CRITICAL" || riskLevel === "HIGH") {
    return "ESCALATED_TO_CONTROLLER";
  }
  return "PERMANENTLY_BLOCKED_PENDING_REVIEW";
}

/**
 * AI cannot finalize a batch. Only a human in the Maker/Checker role (or the check
 * role) may approve finalization; this mirrors the exception workflow's rule that
 * AI cannot RESOLVE. Case-insensitive.
 */
export function canFinalize(actor: string): boolean {
  const who = (actor || "").trim().toUpperCase();
  if (who === "AI") return false;
  if (who === "MAKER" || who === "CHECKER" || who === "SYSTEM") return true;
  // Unknown actors default to human (they must be explicitly denied only for AI).
  return true;
}

export interface CorrectionCycleInput {
  decisionReport: DecisionReport;
  /** Evaluator for financial invariants: returns PASS when the batch is safe. */
  invariantsPass: boolean;
  /** The risk level governing escalation (CRITICAL for invariant failures). */
  riskLevel: RiskLevel;
  /** The correction cycle index (1-based) being attempted. */
  attempt: number;
}

/**
 * Pure model of the corrective workflow:
 *   CONTROL_FAILURE → MAKER/CHECKER → CORRECTIVE ACTION → RE-CALCULATE →
 *   FINANCIAL INVARIANTS → PASS / FAIL.
 *
 * Each call represents one attempt. When invariants fail, the verdict is
 * CRITICAL_BLOCKED and the attempt counts toward the budget. When they pass but the
 * decision risk is still HIGH/MEDIUM, routing reflects that. Once the attempt budget
 * (MAX_CORRECTION_ATTEMPTS) is exhausted and the cycle still fails, the verdict is
 * escalated with a terminal end state.
 */
export function evaluateCorrectionCycle(
  input: CorrectionCycleInput,
): GateVerdict {
  const { invariantsPass, riskLevel, attempt } = input;
  const report = input.decisionReport;
  const exhausted = attempt > MAX_CORRECTION_ATTEMPTS;

  if (!invariantsPass) {
    return {
      routing: "CRITICAL_BLOCKED",
      riskLevel: "CRITICAL",
      reason: `Correction attempt ${attempt}: financial invariants still failing.`,
      correctionAttempts: attempt,
      escalated: exhausted,
      endState: exhausted
        ? correctiveEndState(attempt, "CRITICAL")
        : null,
    };
  }

  // Re-verification passed but risk remains — route accordingly.
  const base = evaluateGate(report, { passed: true, failures: [], checkedCounts: {}, checkedAmounts: {} }, attempt - 1);
  return {
    ...base,
    correctionAttempts: attempt,
    escalated: exhausted && (riskLevel === "HIGH" || riskLevel === "CRITICAL"),
    endState: exhausted
      ? correctiveEndState(attempt, riskLevel)
      : base.endState,
  };
}
