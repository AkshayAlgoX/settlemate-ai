/*
 * SettleMate AI — Policy-as-Code & Governance Types
 */

export type PolicyStatus = "DRAFT" | "SHADOW" | "APPROVED" | "ACTIVE" | "SUPERSEDED";

export interface ConfidenceThresholds {
  autoMatchMin: number; // e.g. 90
  suggestedMatchMin: number; // e.g. 70
}

export interface RiskThresholds {
  highRiskScoreMin: number; // e.g. 70
  mediumRiskScoreMin: number; // e.g. 40
}

export interface ProviderRule {
  maxDelayedDays: number;
  allowedMethods: string[];
  feeTolerancePaise?: number;
}

export interface CardinalityConstraints {
  allowManyToOne: boolean;
  allowOneToMany: boolean;
  allowManyToMany: boolean;
  maxGroupSize: number;
}

export interface PolicyRules {
  amountTolerancePaise: number; // e.g. 100 paise (₹1)
  toleranceWindowHours: number; // e.g. 72 hours
  materialityThresholdPaise: number; // e.g. 500,000 paise (₹5,000)
  confidenceThresholds: ConfidenceThresholds;
  riskThresholds: RiskThresholds;
  makerCheckerThresholdPaise: number; // e.g. 1,000,000 paise (₹10,000)
  exceptionEscalationThresholdPaise: number; // e.g. 5,000,000 paise (₹50,000)
  retryAttemptLimit: number;
  providerRules: Record<string, ProviderRule>;
  cardinalityConstraints: CardinalityConstraints;
}

export interface ReconciliationPolicy {
  policyId: string;
  version: string; // e.g. "1.0.0"
  status: PolicyStatus;
  createdBy: string;
  approvedBy?: string;
  createdAt: Date;
  activatedAt?: Date;
  supersededAt?: Date;
  providerScope: string[]; // ["*"] or specific gateways
  currencyScope: string[]; // ["INR", "USD"]
  effectiveFrom?: Date;
  effectiveTo?: Date;
  rules: PolicyRules;
  parentVersion?: string;
  contentHash: string; // SHA-256 canonical hash
  description?: string;
}

export interface PolicyEvaluationContext {
  orderId?: string;
  paymentId?: string;
  settlementId?: string;
  bankTxnId?: string;
  amountPaise: number;
  discrepancyPaise?: number;
  timeDeltaHours?: number;
  provider?: string;
  paymentMethod?: string;
  hasRefund?: boolean;
  hasChargeback?: boolean;
}

export interface PolicyEvaluationResult {
  policyId: string;
  policyVersion: string;
  policyHash: string;
  matchedRules: string[];
  confidenceScore: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  decision: "AUTO_MATCH" | "SUGGESTED_MATCH" | "EXCEPTION";
  requiresMakerChecker: boolean;
  requiresEscalation: boolean;
  reasons: string[];
}

export interface RecordDiff {
  recordId: string;
  oldDecision: string;
  newDecision: string;
  oldConfidence: number;
  newConfidence: number;
  oldRisk: string;
  newRisk: string;
  oldMatchedRules: string[];
  newMatchedRules: string[];
  amountPaise: number;
  discrepancyPaise: number;
  timeDeltaHours: number;
  invariantResult: "PASSED" | "VIOLATION";
}

export type PolicySafetyScore = "SAFE" | "CAUTION" | "BLOCKED";

export interface ShadowReplayReport {
  baselinePolicyVersion: string;
  candidatePolicyVersion: string;
  candidatePolicyHash: string;
  recordsEvaluated: number;
  durationMs: number;
  throughputRecsPerSec: number;
  autoMatchDeltaPct: number;
  exceptionDeltaPct: number;
  precisionDeltaPct: number;
  recallDeltaPct: number;
  amountAtRiskDeltaPaise: number;
  invariantViolations: number;
  criticalExceptionsDelta: number;
  safetyScore: PolicySafetyScore;
  canPromote: boolean;
  promotionBlockers: string[];
  newlyMatchedCount: number;
  newlyUnmatchedCount: number;
  newlyRiskyCount: number;
  newlyEscalatedCount: number;
  sampleRecordDiffs: RecordDiff[];
  evaluatedAt: Date;
}
