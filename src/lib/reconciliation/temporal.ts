/*
 * SettleMate AI — Temporal Settlement Lifecycle Classifier (M8 Hardening)
 *
 * Accurately models T+0 to T+3 settlement windows:
 *   - NOT_YET_SETTLED: Payment within T+0 / active processing window
 *   - PENDING_SETTLEMENT: Payment captured within policy window (e.g. T+1 / T+2), settlement not yet expected to arrive
 *   - DELAYED_SETTLEMENT: Payment exceeds policy settlement window (window + 1), routes to honest exception handling
 *   - TRUE_FINANCIAL_EXCEPTION: Amount discrepancy, fee divergence, or missing credit post-window
 */

export type TemporalLifecycleState = 
  | "NOT_YET_SETTLED"
  | "PENDING_SETTLEMENT"
  | "DELAYED_SETTLEMENT"
  | "TRUE_FINANCIAL_EXCEPTION";

export interface TemporalEvaluationParams {
  paymentCapturedAt: Date;
  evaluationTime: Date;
  settlementObserved: boolean;
  bankCreditObserved: boolean;
  policyToleranceWindowHours: number; // e.g. 48 hours for T+2
}

export function classifyTemporalState(params: TemporalEvaluationParams): {
  state: TemporalLifecycleState;
  elapsedHours: number;
  isWithinPolicyWindow: boolean;
  requiresExceptionHandling: boolean;
} {
  const diffMs = Math.max(0, params.evaluationTime.getTime() - params.paymentCapturedAt.getTime());
  const elapsedHours = diffMs / (1000 * 60 * 60);
  const isWithinPolicyWindow = elapsedHours <= params.policyToleranceWindowHours;

  if (params.settlementObserved && params.bankCreditObserved) {
    return {
      state: "NOT_YET_SETTLED", // Fully matched downstream
      elapsedHours,
      isWithinPolicyWindow,
      requiresExceptionHandling: false,
    };
  }

  if (isWithinPolicyWindow) {
    return {
      state: elapsedHours < 12 ? "NOT_YET_SETTLED" : "PENDING_SETTLEMENT",
      elapsedHours,
      isWithinPolicyWindow: true,
      requiresExceptionHandling: false,
    };
  }

  // Elapsed time strictly exceeds configured tolerance window
  return {
    state: "DELAYED_SETTLEMENT",
    elapsedHours,
    isWithinPolicyWindow: false,
    requiresExceptionHandling: true,
  };
}
