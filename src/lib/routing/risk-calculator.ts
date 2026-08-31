/*
 * SettleMate AI — Milestone 2: Deterministic Risk Routing Engine
 *
 * Implements Confidence × Exposure deterministic routing:
 *   - The LLM proposes claims, but NEVER decides routing safety.
 *   - Financial exposure materially scales the deterministic risk score.
 *   - High confidence + low exposure -> AUTO_RESOLVE
 *   - High confidence + high exposure -> HUMAN_REVIEW
 *   - Invariant / mechanical failure -> Fail-Closed BLOCKED
 *   - Confirmed challenge -> Re-enter REINVESTIGATE
 */

import { createHash } from "node:crypto";
import { convertToBaseMinor, BASE_CURRENCY } from "../currency/fx-rates";
import type {
  RoutingInput,
  ValidatedRoutingInput,
  RoutingDecisionRecord,
  ExposureBand,
  RoutingDecision,
  RoutingPolicyConfig,
} from "./types";
import { RoutingInputSchema, RoutingDecisionRecordSchema } from "./types";

export const DEFAULT_ROUTING_POLICY: RoutingPolicyConfig = {
  version: "confidence-exposure-v1",
  survivalBonus: 0.02, // 2% bounded boost for surviving adversarial challenge
  riskThreshold: 0.30, // Strict cutoff for automatic resolution
  confidenceWeight: 0.40, // 40% weight on model uncertainty
  exposureWeight: 0.60, // 60% weight on normalized financial blast radius
  exposureBands: {
    lowMaxPaise: 500000, // <= ₹5,000
    mediumMaxPaise: 5000000, // <= ₹50,000
    highMaxPaise: 50000000, // <= ₹5,00,000
  },
};

/**
 * Normalizes any sovereign currency minor units into base INR paise.
 */
export function normalizeExposureToBasePaise(
  amountMinor: number,
  currency: string
): number {
  if (amountMinor <= 0) return 0;
  const conv = convertToBaseMinor(amountMinor, currency, BASE_CURRENCY);
  return Math.round(conv.convertedMinor);
}

/**
 * Determines the exposure band from base INR paise.
 */
export function classifyExposureBand(
  exposurePaise: number,
  policy: RoutingPolicyConfig = DEFAULT_ROUTING_POLICY
): ExposureBand {
  if (exposurePaise <= policy.exposureBands.lowMaxPaise) {
    return "LOW";
  } else if (exposurePaise <= policy.exposureBands.mediumMaxPaise) {
    return "MEDIUM";
  } else if (exposurePaise <= policy.exposureBands.highMaxPaise) {
    return "HIGH";
  } else {
    return "CRITICAL";
  }
}

/**
 * Calculates a smooth, monotonic exposure factor in [0.05, 1.0] from base INR paise.
 *
 * Mathematical formula:
 *   E_min = 10,000 paise (₹100)
 *   E_max = 100,000,000 paise (₹10,00,000)
 *   factor = clamp(0.05 + 0.95 * (log10(max(E_min, E)) - log10(E_min)) / (log10(E_max) - log10(E_min)), 0.05, 1.0)
 */
export function calculateExposureFactor(exposurePaise: number): number {
  if (exposurePaise <= 0) return 0.05;

  const E_MIN = 10000; // ₹100
  const E_MAX = 100000000; // ₹10,00,000

  if (exposurePaise <= E_MIN) return 0.05;
  if (exposurePaise >= E_MAX) return 1.0;

  const logMin = Math.log10(E_MIN);
  const logMax = Math.log10(E_MAX);
  const logVal = Math.log10(exposurePaise);

  const factor = 0.05 + 0.95 * ((logVal - logMin) / (logMax - logMin));
  return Math.round(Math.min(1.0, Math.max(0.05, factor)) * 10000) / 10000;
}

/**
 * Deterministically adjusts model confidence based on adversarial challenge outcome.
 */
export function calculateAdjustedConfidence(
  originalConfidence: number,
  challengeStatus: ValidatedRoutingInput["challengeStatus"],
  policy: RoutingPolicyConfig = DEFAULT_ROUTING_POLICY
): { adjustedConfidence: number; survivalBonusApplied: number } {
  const boundedConf = Math.min(1.0, Math.max(0.0, originalConfidence));

  if (challengeStatus === "CHALLENGED_SURVIVED") {
    const adjusted = Math.min(1.0, boundedConf + policy.survivalBonus);
    return {
      adjustedConfidence: Math.round(adjusted * 10000) / 10000,
      survivalBonusApplied: policy.survivalBonus,
    };
  }

  return {
    adjustedConfidence: Math.round(boundedConf * 10000) / 10000,
    survivalBonusApplied: 0,
  };
}

/**
 * Pure deterministic risk routing function.
 *
 * Deterministic formula:
 *   unconfidence = 1.0 - adjustedConfidence
 *   routingRisk = round(confidenceWeight * unconfidence + exposureWeight * exposureFactor, 4)
 *
 * Fail-closed criteria:
 *   - invariantStatus !== "VERIFIED" -> BLOCKED
 *   - mechanicalVerificationStatus !== "VERIFIED" -> BLOCKED
 *   - challengeStatus === "CHALLENGE_CONFIRMED" -> REINVESTIGATE
 *   - routingRisk < threshold -> AUTO_RESOLVE
 *   - routingRisk >= threshold -> HUMAN_REVIEW
 */
export function calculateRoutingRisk(
  rawInput: RoutingInput,
  policy: RoutingPolicyConfig = DEFAULT_ROUTING_POLICY
): RoutingDecisionRecord {
  // 1. Strict input boundary validation
  const input = RoutingInputSchema.parse(rawInput);
  const decisionId = `dec_${createHash("sha256")
    .update(`${input.tenantId}:${input.claimId}:${input.transactionId}:${policy.version}`)
    .digest("hex")
    .slice(0, 12)}`;
  const createdAt = new Date().toISOString();

  // 2. Adjust confidence
  const { adjustedConfidence, survivalBonusApplied } = calculateAdjustedConfidence(
    input.originalConfidence,
    input.challengeStatus,
    policy
  );

  // 3. Normalize exposure to base INR paise
  const normalizedExposurePaise = normalizeExposureToBasePaise(
    input.transactionAmountMinor,
    input.currency
  );
  const exposureBand = classifyExposureBand(normalizedExposurePaise, policy);
  const exposureFactor = calculateExposureFactor(normalizedExposurePaise);

  // 4. Compute deterministic risk
  const unconfidence = 1.0 - adjustedConfidence;
  const rawRisk = policy.confidenceWeight * unconfidence + policy.exposureWeight * exposureFactor;
  const routingRisk = Math.round(Math.min(1.0, Math.max(0.0, rawRisk)) * 10000) / 10000;
  const threshold = policy.riskThreshold;

  // 5. Apply Fail-Closed Safety Evaluation
  let decision: RoutingDecision = "HUMAN_REVIEW";
  let decisionReason = "";

  if (input.challengeStatus === "CHALLENGE_CONFIRMED") {
    decision = "REINVESTIGATE";
    decisionReason = "Confirmed adversarial objection requires reinvestigation loop before any routing decision.";
  } else if (input.invariantStatus !== "VERIFIED") {
    decision = "BLOCKED";
    decisionReason = `Financial invariant status is ${input.invariantStatus}. Strict fail-closed conservation barrier prevents resolution.`;
  } else if (input.mechanicalVerificationStatus !== "VERIFIED") {
    decision = "BLOCKED";
    decisionReason = `Mechanical verification status is ${input.mechanicalVerificationStatus}. Ground-truth proof is required.`;
  } else if (routingRisk < threshold) {
    decision = "AUTO_RESOLVE";
    decisionReason = `Deterministic routing risk (${routingRisk.toFixed(4)}) is below policy threshold (${threshold.toFixed(2)}) with verified invariants, authentic evidence, and survived adversarial challenge.`;
  } else {
    decision = "HUMAN_REVIEW";
    decisionReason = `Deterministic routing risk (${routingRisk.toFixed(4)}) meets or exceeds policy threshold (${threshold.toFixed(2)}) due to financial exposure (${exposureBand} band: ₹${(normalizedExposurePaise / 100).toLocaleString()}).`;
  }

  // 6. Cryptographic record hash for tamper-evidence
  const recordHash = createHash("sha256")
    .update(
      JSON.stringify({
        decisionId,
        tenantId: input.tenantId,
        claimId: input.claimId,
        transactionId: input.transactionId,
        policyVersion: policy.version,
        originalConfidence: input.originalConfidence,
        adjustedConfidence,
        originalAmountMinor: input.transactionAmountMinor,
        currency: input.currency,
        normalizedExposurePaise,
        exposureBand,
        routingRisk,
        threshold,
        decision,
      })
    )
    .digest("hex");

  const record: RoutingDecisionRecord = {
    decisionId,
    tenantId: input.tenantId,
    claimId: input.claimId,
    transactionId: input.transactionId,
    policyVersion: policy.version,
    originalConfidence: input.originalConfidence,
    adjustedConfidence,
    survivalBonusApplied,
    originalAmountMinor: input.transactionAmountMinor,
    currency: input.currency,
    normalizedExposurePaise,
    exposureBand,
    exposureFactor,
    routingRisk,
    threshold,
    challengeStatus: input.challengeStatus,
    invariantStatus: input.invariantStatus,
    mechanicalVerificationStatus: input.mechanicalVerificationStatus,
    reinvestigationCount: input.reinvestigationCount,
    evidenceIds: input.evidenceIds,
    proofSignature: input.proofSignature,
    decision,
    decisionReason,
    createdAt,
    recordHash,
  };

  return RoutingDecisionRecordSchema.parse(record);
}
