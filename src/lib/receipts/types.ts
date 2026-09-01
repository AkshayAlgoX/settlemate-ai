/*
 * SettleMate AI — Milestone 5: Signed Replayable Decision Proof & Immutable Terminal Receipt
 *
 * Strict Zod Boundary Schemas and TypeScript Interfaces.
 *
 * Core Principle:
 *   The final receipt is a canonical, structured proof object containing machine-verifiable
 *   facts and references. It does NOT store private chain-of-thought or raw unconstrained model text.
 */

import { z } from "zod";

// =============================================================================
// 1. ENUMS & CORE VALUE SCHEMAS
// =============================================================================

export const FinalDecisionEnum = z.enum([
  "AUTO_RESOLVED",
  "HUMAN_APPROVED",
  "HUMAN_REJECTED",
  "BLOCKED",
  "FAILED",
  "CANCELLED",
]);
export type FinalDecision = z.infer<typeof FinalDecisionEnum>;

export const ChallengeStatusEnum = z.enum([
  "NO_OBJECTION",
  "CHALLENGED_DISMISSED",
  "CHALLENGED_SURVIVED",
  "CHALLENGE_CONFIRMED",
]);
export type ChallengeStatus = z.infer<typeof ChallengeStatusEnum>;

export const VerificationVerdictEnum = z.enum(["PASSED", "FAILED", "INCONCLUSIVE"]);
export type VerificationVerdict = z.infer<typeof VerificationVerdictEnum>;

export const ExposureBandEnum = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export type ExposureBand = z.infer<typeof ExposureBandEnum>;

export const RoutingDecisionEnum = z.enum([
  "AUTO_RESOLVE",
  "HUMAN_REVIEW",
  "REINVESTIGATE",
  "BLOCKED",
]);
export type RoutingDecision = z.infer<typeof RoutingDecisionEnum>;

// =============================================================================
// 2. SUB-STRUCTURE COMMITMENT SCHEMAS
// =============================================================================

export const InputCommitmentSchema = z.object({
  transactionId: z.string().min(1),
  batchId: z.string().optional(),
  currency: z.string().length(3),
  amountMinor: z.number().int().nonnegative(),
  inputHash: z.string().length(64),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});
export type InputCommitment = z.infer<typeof InputCommitmentSchema>;

export const EvidenceCommitmentSchema = z.object({
  evidenceIds: z.array(z.string()),
  evidenceHashes: z.record(z.string(), z.string()),
  merkleRoot: z.string().min(32),
  accessClassification: z.enum(["PUBLIC", "RESTRICTED", "CONFIDENTIAL"]).default("RESTRICTED"),
});
export type EvidenceCommitment = z.infer<typeof EvidenceCommitmentSchema>;

export const DeterministicMatchCommitmentSchema = z.object({
  matched: z.boolean(),
  ruleId: z.string().optional(),
  matchedSourceIds: z
    .object({
      paymentIds: z.array(z.string()).optional(),
      settlementIds: z.array(z.string()).optional(),
      bankTxnIds: z.array(z.string()).optional(),
      invoiceIds: z.array(z.string()).optional(),
    })
    .optional(),
  confidence: z.number().min(0).max(1).optional(),
});
export type DeterministicMatchCommitment = z.infer<typeof DeterministicMatchCommitmentSchema>;

export const InvariantProofCommitmentSchema = z.object({
  proofId: z.string().min(1),
  theoremName: z.string().min(1),
  status: z.enum(["PROOF_VALID", "COUNTEREXAMPLE_FOUND"]),
  proofHash: z.string().length(64),
  conservationPassed: z.boolean(),
  doubleEntryBalanced: z.boolean(),
  verifiedAt: z.string().datetime().optional(),
});
export type InvariantProofCommitment = z.infer<typeof InvariantProofCommitmentSchema>;

export const AiClaimCommitmentSchema = z.object({
  claimId: z.string().min(1),
  claimType: z.string().min(1),
  assertedValues: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  evidenceIds: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  uncertainties: z.array(z.string()).default([]),
});
export type AiClaimCommitment = z.infer<typeof AiClaimCommitmentSchema>;

export const ChallengeCommitmentSchema = z.object({
  criticId: z.string().min(1),
  challengeStatus: ChallengeStatusEnum,
  lensResults: z.record(z.string(), z.boolean()),
  objection: z.string().optional(),
  falsificationTest: z.string().optional(),
  evidenceIds: z.array(z.string()).default([]),
});
export type ChallengeCommitment = z.infer<typeof ChallengeCommitmentSchema>;

export const MechanicalVerificationCommitmentSchema = z.object({
  verdict: VerificationVerdictEnum,
  predicateEvaluated: z.string().optional(),
  groundTruthMatch: z.boolean(),
  divergenceDetails: z.string().optional(),
});
export type MechanicalVerificationCommitment = z.infer<typeof MechanicalVerificationCommitmentSchema>;

export const ReinvestigationHistoryItemSchema = z.object({
  iteration: z.number().int().positive(),
  previousClaimId: z.string().min(1),
  criticResult: z.string().min(1),
  mechanicalVerdict: z.string().min(1),
  resultingClaimId: z.string().min(1),
  timestamp: z.string().datetime().optional(),
});
export type ReinvestigationHistoryItem = z.infer<typeof ReinvestigationHistoryItemSchema>;

export const SolverDecisionCommitmentSchema = z.object({
  solverPolicyVersion: z.string().min(1),
  candidateCommitment: z.string().min(16),
  candidateCount: z.number().int().nonnegative(),
  selectedInvoiceIds: z.array(z.string()),
  selectedTotalMinor: z.number().int().nonnegative(),
  paymentAmountMinor: z.number().int().nonnegative(),
  differenceMinor: z.number().int().nonnegative(),
  solverStatus: z.string().min(1),
  objectiveValue: z.number(),
  solverVerification: z.object({
    verified: z.boolean(),
    assertionCount: z.number().int().positive(),
  }),
});
export type SolverDecisionCommitment = z.infer<typeof SolverDecisionCommitmentSchema>;

export const RoutingDecisionCommitmentSchema = z.object({
  policyVersion: z.string().min(1),
  originalConfidence: z.number().min(0).max(1),
  adjustedConfidence: z.number().min(0).max(1),
  exposureAmountMinor: z.number().int().nonnegative(),
  currency: z.string().length(3),
  exposureBand: ExposureBandEnum,
  routingRisk: z.number().min(0).max(1),
  threshold: z.number().min(0).max(1),
  challengeStatus: ChallengeStatusEnum,
  verificationStatus: z.enum(["VERIFIED", "BLOCKED", "UNVERIFIED"]),
  decision: RoutingDecisionEnum,
});
export type RoutingDecisionCommitment = z.infer<typeof RoutingDecisionCommitmentSchema>;

export const JournalLineReceiptSchema = z.object({
  lineId: z.string().min(1),
  accountId: z.string().min(1),
  accountName: z.string().min(1),
  entryType: z.enum(["DEBIT", "CREDIT"]),
  amountMinor: z.number().int().positive(),
  currency: z.string().length(3),
  description: z.string().min(1),
});
export type JournalLineReceipt = z.infer<typeof JournalLineReceiptSchema>;

export const CorrectionDecisionCommitmentSchema = z.object({
  correctionId: z.string().min(1),
  correctionPolicyVersion: z.string().min(1),
  correctionType: z.string().min(1),
  journalLines: z.array(JournalLineReceiptSchema),
  beforeState: z.object({
    debitMinor: z.number().int().nonnegative(),
    creditMinor: z.number().int().nonnegative(),
    differenceMinor: z.number().int().nonnegative(),
    isBalanced: z.boolean(),
  }),
  afterState: z.object({
    debitMinor: z.number().int().nonnegative(),
    creditMinor: z.number().int().nonnegative(),
    differenceMinor: z.number().int().nonnegative(),
    isBalanced: z.boolean(),
  }),
  invariantProofHash: z.string().length(64),
  correctionStatus: z.enum(["PROPOSED", "AWAITING_REVIEW", "APPROVED", "REJECTED", "STALE", "FAILED"]),
  underlyingRecordVersion: z.number().int().positive(),
  reviewedBy: z.string().optional(),
  reviewedAt: z.string().datetime().optional(),
  rejectionReason: z.string().optional(),
});
export type CorrectionDecisionCommitment = z.infer<typeof CorrectionDecisionCommitmentSchema>;

export const PolicyVersionsSchema = z.object({
  reconciliationPolicyVersion: z.string().min(1),
  invariantPolicyVersion: z.string().min(1),
  criticPolicyVersion: z.string().min(1),
  routingPolicyVersion: z.string().min(1),
  solverPolicyVersion: z.string().min(1),
  correctionPolicyVersion: z.string().min(1),
  receiptVersion: z.string().min(1),
  canonicalizationVersion: z.string().min(1),
});
export type PolicyVersions = z.infer<typeof PolicyVersionsSchema>;

// =============================================================================
// 3. COMPLETE TERMINAL DECISION RECEIPT SCHEMA
// =============================================================================

export const TerminalDecisionReceiptSchema = z.object({
  receiptId: z.string().startsWith("rcpt_"),
  tenantId: z.string().min(1),
  transactionId: z.string().min(1),
  batchId: z.string().min(1),
  createdAt: z.string().datetime(),
  receiptVersion: z.literal("1.0.0"),

  inputCommitment: InputCommitmentSchema,
  evidenceCommitment: EvidenceCommitmentSchema,

  deterministicMatch: DeterministicMatchCommitmentSchema,
  invariantProof: InvariantProofCommitmentSchema,
  aiClaim: AiClaimCommitmentSchema.optional(),
  challenge: ChallengeCommitmentSchema.optional(),
  mechanicalVerification: MechanicalVerificationCommitmentSchema.optional(),
  reinvestigationHistory: z.array(ReinvestigationHistoryItemSchema).default([]),
  solverDecision: SolverDecisionCommitmentSchema.optional(),
  routingDecision: RoutingDecisionCommitmentSchema.optional(),
  correctionDecision: CorrectionDecisionCommitmentSchema.optional(),

  finalDecision: FinalDecisionEnum,
  policyVersions: PolicyVersionsSchema,

  signingKeyVersion: z.string().min(1).default("v1"),
  canonicalizationVersion: z.literal("RFC8785-v1"),
  signatureAlgorithm: z.literal("HMAC-SHA256"),
  proofHash: z.string().length(64),
  signature: z.string().length(64),
});
export type TerminalDecisionReceipt = z.infer<typeof TerminalDecisionReceiptSchema>;

// =============================================================================
// 4. VERIFICATION AND REPLAY TYPES & ERRORS
// =============================================================================

export type VerificationFailureReason =
  | "HASH_MISMATCH"
  | "SIGNATURE_MISMATCH"
  | "SCHEMA_INVALID"
  | "COMMITMENT_MISMATCH"
  | "REPLAY_DIVERGENCE"
  | "POLICY_MISMATCH"
  | "TENANT_MISMATCH"
  | "KEY_VERSION_UNKNOWN";

export interface ReceiptVerificationStep {
  step:
    | "SCHEMA_VALIDATION"
    | "CANONICAL_HASH_CHECK"
    | "HMAC_SIGNATURE_CHECK"
    | "COMMITMENTS_INTEGRITY"
    | "ROUTING_REPLAY"
    | "CORRECTION_REPLAY"
    | "SOLVER_REPLAY"
    | "FINAL_DECISION_CHECK";
  status: "PASS" | "FAIL" | "SKIPPED";
  detail: string;
}

export interface TerminalReceiptVerificationReport {
  verdict: "VALID" | "INVALID";
  receiptId: string;
  transactionId: string;
  tenantId: string;
  finalDecision: FinalDecision;
  steps: ReceiptVerificationStep[];
  failureReason?: VerificationFailureReason;
  errorMessage?: string;
  canonicalProofHash: string;
  recomputedProofHash: string;
  verifiedAt: string;
  latencyMs: number;
}

// Error Classes
export class ReceiptNotFoundError extends Error {
  constructor(receiptId: string) {
    super(`Terminal decision receipt '${receiptId}' not found`);
    this.name = "ReceiptNotFoundError";
  }
}

export class ReceiptTenantIsolationError extends Error {
  constructor(tenantId: string, receiptId: string) {
    super(`Access denied: Tenant '${tenantId}' cannot access receipt '${receiptId}'`);
    this.name = "ReceiptTenantIsolationError";
  }
}

export class ReceiptImmutableError extends Error {
  constructor(receiptId: string) {
    super(`Receipt '${receiptId}' is finalized and immutable; modifications are forbidden`);
    this.name = "ReceiptImmutableError";
  }
}

export class ReplayDivergenceError extends Error {
  public readonly field: string;
  public readonly expected: unknown;
  public readonly actual: unknown;

  constructor(field: string, expected: unknown, actual: unknown) {
    super(
      `Replay divergence detected on '${field}': expected=${JSON.stringify(expected)}, actual=${JSON.stringify(actual)}`
    );
    this.name = "ReplayDivergenceError";
    this.field = field;
    this.expected = expected;
    this.actual = actual;
  }
}

export class ReceiptSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReceiptSignatureError";
  }
}

export class ReceiptHashMismatchError extends Error {
  constructor(expectedHash: string, actualHash: string) {
    super(`Proof hash mismatch: expected='${expectedHash}', actual='${actualHash}'`);
    this.name = "ReceiptHashMismatchError";
  }
}
