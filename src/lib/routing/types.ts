/*
 * SettleMate AI — Milestone 2: Confidence × Exposure Routing Types & Schemas
 *
 * Strict Zod schemas and TypeScript domain model for deterministic risk routing.
 */

import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "../currency/fx-rates";

export const ChallengeStatusEnum = z.enum([
  "NEVER_CHALLENGED",
  "CHALLENGED_SURVIVED",
  "CHALLENGE_CONFIRMED",
]);
export type ChallengeStatus = z.infer<typeof ChallengeStatusEnum>;

export const VerificationStatusEnum = z.enum([
  "VERIFIED",
  "FAILED",
  "UNCHECKED",
]);
export type VerificationStatus = z.infer<typeof VerificationStatusEnum>;

export const ExposureBandEnum = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export type ExposureBand = z.infer<typeof ExposureBandEnum>;

export const RoutingDecisionEnum = z.enum([
  "AUTO_RESOLVE",
  "HUMAN_REVIEW",
  "BLOCKED",
  "REINVESTIGATE",
]);
export type RoutingDecision = z.infer<typeof RoutingDecisionEnum>;

export const CurrencyCodeEnum = z.string().refine(
  (c) => SUPPORTED_CURRENCIES.includes(c.toUpperCase().trim()),
  { message: "Unsupported currency code" }
);

/**
 * Strict validated routing input schema.
 * Rejects negative amounts, out-of-bounds confidences, unsupported currencies, or malformed IDs.
 */
export const RoutingInputSchema = z.object({
  claimId: z.string().min(1).max(100),
  tenantId: z.string().min(1).max(100),
  transactionId: z.string().min(1).max(100),
  originalConfidence: z.number().min(0.0).max(1.0),
  challengeStatus: ChallengeStatusEnum,
  transactionAmountMinor: z.number().int().nonnegative(),
  currency: CurrencyCodeEnum,
  invariantStatus: VerificationStatusEnum,
  mechanicalVerificationStatus: VerificationStatusEnum,
  reinvestigationCount: z.number().int().nonnegative().default(0),
  evidenceIds: z.array(z.string().min(1)).default([]),
  proofSignature: z.string().min(1).optional(),
  policyVersion: z.string().min(1).default("confidence-exposure-v1"),
});
export type RoutingInput = z.input<typeof RoutingInputSchema>;
export type ValidatedRoutingInput = z.infer<typeof RoutingInputSchema>;

/**
 * Immutable routing decision record schema.
 * Contains all parameters necessary to deterministically replay the decision without LLM invocation.
 */
export const RoutingDecisionRecordSchema = z.object({
  decisionId: z.string().min(1),
  tenantId: z.string().min(1),
  claimId: z.string().min(1),
  transactionId: z.string().min(1),
  policyVersion: z.string().min(1),
  originalConfidence: z.number().min(0.0).max(1.0),
  adjustedConfidence: z.number().min(0.0).max(1.0),
  survivalBonusApplied: z.number().min(0.0).max(0.1),
  originalAmountMinor: z.number().int().nonnegative(),
  currency: z.string().min(1),
  normalizedExposurePaise: z.number().int().nonnegative(),
  exposureBand: ExposureBandEnum,
  exposureFactor: z.number().min(0.0).max(1.0),
  routingRisk: z.number().min(0.0).max(1.0),
  threshold: z.number().min(0.0).max(1.0),
  challengeStatus: ChallengeStatusEnum,
  invariantStatus: VerificationStatusEnum,
  mechanicalVerificationStatus: VerificationStatusEnum,
  reinvestigationCount: z.number().int().nonnegative(),
  evidenceIds: z.array(z.string()),
  proofSignature: z.string().optional(),
  decision: RoutingDecisionEnum,
  decisionReason: z.string().min(1),
  createdAt: z.string().datetime(),
  recordHash: z.string().length(64),
});
export type RoutingDecisionRecord = z.infer<typeof RoutingDecisionRecordSchema>;

export interface RoutingPolicyConfig {
  version: string;
  survivalBonus: number; // e.g. 0.02
  riskThreshold: number; // e.g. 0.30
  confidenceWeight: number; // e.g. 0.40
  exposureWeight: number; // e.g. 0.60
  exposureBands: {
    lowMaxPaise: number; // 500,000 (₹5,000)
    mediumMaxPaise: number; // 5,000,000 (₹50,000)
    highMaxPaise: number; // 50,000,000 (₹5,00,000)
  };
}
