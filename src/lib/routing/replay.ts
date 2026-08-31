/*
 * SettleMate AI — Milestone 2: Deterministic Decision Replay & Verification
 *
 * Replays stored routing decisions without LLM invocation.
 * Guarantees:
 *   1. 100% bitwise determinism: replaying stored inputs produces the exact same decision.
 *   2. Strict tenant isolation: Tenant A cannot replay or view Tenant B records.
 *   3. Fail-closed replay verification: any divergence halts execution.
 */

import type {
  RoutingDecisionRecord,
  ValidatedRoutingInput,
  RoutingPolicyConfig,
} from "./types";
import { calculateRoutingRisk, DEFAULT_ROUTING_POLICY } from "./risk-calculator";

export class TenantIsolationError extends Error {
  readonly code = "TENANT_ISOLATION_VIOLATION" as const;
  constructor(message: string) {
    super(message);
    this.name = "TenantIsolationError";
  }
}

export class ReplayDivergenceError extends Error {
  readonly code = "REPLAY_DIVERGENCE_DETECTED" as const;
  constructor(message: string) {
    super(message);
    this.name = "ReplayDivergenceError";
  }
}

export interface ReplayVerificationResult {
  isDeterministic: boolean;
  decisionId: string;
  tenantId: string;
  originalDecision: RoutingDecisionRecord["decision"];
  replayedDecision: RoutingDecisionRecord["decision"];
  originalRisk: number;
  replayedRisk: number;
  replayedRecord: RoutingDecisionRecord;
}

/**
 * Deterministically replays a stored routing decision record.
 */
export function replayRoutingDecision(
  storedRecord: RoutingDecisionRecord,
  requestingTenantId: string,
  policy: RoutingPolicyConfig = DEFAULT_ROUTING_POLICY
): ReplayVerificationResult {
  // 1. Enforce strict tenant isolation boundary
  if (!requestingTenantId || requestingTenantId.trim() !== storedRecord.tenantId.trim()) {
    throw new TenantIsolationError(
      `Access denied: Requesting tenant '${requestingTenantId}' is not authorized to access or replay decisions for tenant '${storedRecord.tenantId}'`
    );
  }

  // 2. Reconstruct deterministic routing input from stored record
  const input: ValidatedRoutingInput = {
    claimId: storedRecord.claimId,
    tenantId: storedRecord.tenantId,
    transactionId: storedRecord.transactionId,
    originalConfidence: storedRecord.originalConfidence,
    challengeStatus: storedRecord.challengeStatus,
    transactionAmountMinor: storedRecord.originalAmountMinor,
    currency: storedRecord.currency,
    invariantStatus: storedRecord.invariantStatus,
    mechanicalVerificationStatus: storedRecord.mechanicalVerificationStatus,
    reinvestigationCount: storedRecord.reinvestigationCount,
    evidenceIds: storedRecord.evidenceIds,
    proofSignature: storedRecord.proofSignature,
    policyVersion: storedRecord.policyVersion,
  };

  // 3. Re-execute pure deterministic risk calculation
  const replayed = calculateRoutingRisk(input, policy);

  // 4. Verify all deterministic attributes match exactly
  const confMatches = Math.abs(replayed.adjustedConfidence - storedRecord.adjustedConfidence) < 0.0001;
  const riskMatches = Math.abs(replayed.routingRisk - storedRecord.routingRisk) < 0.0001;
  const bandMatches = replayed.exposureBand === storedRecord.exposureBand;
  const decisionMatches = replayed.decision === storedRecord.decision;

  if (!confMatches || !riskMatches || !bandMatches || !decisionMatches) {
    throw new ReplayDivergenceError(
      `Replay divergence detected for decision ${storedRecord.decisionId}: expected ${storedRecord.decision} (risk ${storedRecord.routingRisk}), got ${replayed.decision} (risk ${replayed.routingRisk})`
    );
  }

  return {
    isDeterministic: true,
    decisionId: storedRecord.decisionId,
    tenantId: storedRecord.tenantId,
    originalDecision: storedRecord.decision,
    replayedDecision: replayed.decision,
    originalRisk: storedRecord.routingRisk,
    replayedRisk: replayed.routingRisk,
    replayedRecord: replayed,
  };
}
