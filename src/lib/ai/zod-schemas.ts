/*
 * SettleMate AI — Strict Boundary Zod Schemas (Milestone 1)
 *
 * Enforces strict runtime validation at every boundary:
 *   - AI Claim AST
 *   - Investigator Output
 *   - Adversarial Critic 3-Lens Objections
 *   - Mechanical Verification Results
 *   - Z3 / SMT Invariant Proofs
 *   - Reinvestigation State Machine
 */

import { z } from "zod";

// =============================================================================
// 1. AI CLAIM AST SCHEMAS
// =============================================================================

export const ClaimTypeEnum = z.enum([
  "AMOUNT",
  "IDENTITY",
  "TIMING",
  "STATUS",
  "RELATIONSHIP",
  "POLICY",
  "FINANCIAL_EXPLANATION",
  "RECOMMENDATION",
]);
export type ClaimType = z.infer<typeof ClaimTypeEnum>;

export const AssertedValueSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.union([z.number(), z.string(), z.boolean()]).nullable(),
  expectedPaise: z.number().int().optional(),
  observedPaise: z.number().int().optional(),
  tolerancePaise: z.number().int().nonnegative().optional(),
});
export type AssertedValue = z.infer<typeof AssertedValueSchema>;

export const AIClaimSchema = z.object({
  claimId: z.string().min(1).max(50),
  type: ClaimTypeEnum,
  statement: z.string().min(1).max(1000),
  evidenceIds: z.array(z.string().min(1).max(100)).default([]),
  assertedValues: z.array(AssertedValueSchema).default([]),
  confidence: z.number().min(0).max(100),
  uncertainties: z.array(z.string().max(500)).default([]),
});
export type AIClaim = z.infer<typeof AIClaimSchema>;

export const InvestigatorOutputSchema = z.object({
  hypothesis: z.string().min(1).max(2000),
  reasoning: z.string().min(1).max(5000),
  evidenceIds: z.array(z.string().min(1).max(100)).default([]),
  supportingFacts: z.array(z.string().max(500)).default([]),
  uncertainties: z.array(z.string().max(500)).default([]),
  recommendedAction: z.string().min(1).max(500),
  confidence: z.number().min(0).max(100),
  claimedNetPaise: z.number().int().optional(),
  claims: z.array(AIClaimSchema).min(1),
  iteration: z.number().int().nonnegative().default(0),
});
export type InvestigatorOutput = z.infer<typeof InvestigatorOutputSchema>;

// =============================================================================
// 2. ADVERSARIAL CRITIC (3 LENSES) SCHEMAS
// =============================================================================

export const CriticLensEnum = z.enum([
  "MATHEMATICAL_CONSERVATION",
  "EVIDENCE_PROVENANCE",
  "TIMING_POLICY",
]);
export type CriticLens = z.infer<typeof CriticLensEnum>;

export const FalsificationTestSchema = z.object({
  type: z.enum(["ARITHMETIC_EQUALITY", "HASH_INTEGRITY", "TIMING_BOUND", "EVIDENCE_EXISTENCE", "SMT_PROOF"]),
  targetKey: z.string().min(1),
  operator: z.enum(["==", "!=", "<=", ">=", "<", ">", "EXISTS", "MATCHES_HASH"]),
  expectedValue: z.union([z.number(), z.string(), z.boolean()]),
  actualValue: z.union([z.number(), z.string(), z.boolean()]).optional(),
  tolerancePaise: z.number().int().nonnegative().default(0),
});
export type FalsificationTest = z.infer<typeof FalsificationTestSchema>;

export const CriticObjectionSchema = z.object({
  objectionId: z.string().min(1).max(50),
  lens: CriticLensEnum,
  code: z.enum([
    "AMOUNT_ARITHMETIC_ERROR",
    "UNACCOUNTED_REFUND",
    "UNACCOUNTED_CHARGEBACK",
    "TIMING_WINDOW_VIOLATION",
    "UNSUPPORTED_PAYMENT_METHOD",
    "INVENTED_EVIDENCE_ID",
    "TAMPERED_EVIDENCE",
    "CONFLICTING_CLAIMS",
    "INSUFFICIENT_CONTEXT",
    "POLICY_VIOLATION",
    "INVARIANT_BREACH",
    "SMT_REFUTATION",
  ]),
  targetClaimId: z.string().min(1).max(50).optional(),
  detail: z.string().min(1).max(2000),
  falsificationTest: FalsificationTestSchema,
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
});
export type CriticObjection = z.infer<typeof CriticObjectionSchema>;

export const CriticEvaluationSchema = z.object({
  criticRunId: z.string().min(1),
  verdict: z.enum(["VERIFIED", "DISPUTED", "INSUFFICIENT_EVIDENCE", "CONFLICTING_EVIDENCE", "CONTROL_FAILURE"]),
  lensesEvaluated: z.array(CriticLensEnum),
  objections: z.array(CriticObjectionSchema).default([]),
  verifiedEvidenceIds: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(100),
  reasoning: z.string().min(1).max(2000),
  requiresReinvestigation: z.boolean(),
});
export type CriticEvaluation = z.infer<typeof CriticEvaluationSchema>;

// =============================================================================
// 3. MECHANICAL VERIFICATION SCHEMAS
// =============================================================================

export const MechanicalVerificationItemSchema = z.object({
  objectionId: z.string().min(1),
  lens: CriticLensEnum,
  status: z.enum(["OBJECTION_CONFIRMED", "OBJECTION_DISMISSED"]),
  falsificationPassed: z.boolean(),
  mechanicalEvidence: z.string().min(1).max(2000),
  expectedValue: z.union([z.number(), z.string(), z.boolean()]),
  actualObservedValue: z.union([z.number(), z.string(), z.boolean()]),
  delta: z.number().optional(),
});
export type MechanicalVerificationItem = z.infer<typeof MechanicalVerificationItemSchema>;

export const MechanicalVerificationResultSchema = z.object({
  verificationId: z.string().min(1),
  evaluatedAt: z.coerce.date(),
  totalObjections: z.number().int().nonnegative(),
  confirmedObjectionsCount: z.number().int().nonnegative(),
  dismissedObjectionsCount: z.number().int().nonnegative(),
  verifications: z.array(MechanicalVerificationItemSchema),
  allObjectionsDismissed: z.boolean(),
  canonicalHash: z.string().length(64),
});
export type MechanicalVerificationResult = z.infer<typeof MechanicalVerificationResultSchema>;

// =============================================================================
// 4. Z3 / SMT INVARIANT PROOF SCHEMAS
// =============================================================================

export const Z3ProofResultSchema = z.object({
  proofId: z.string().min(1),
  status: z.enum(["SAT", "UNSAT", "PROOF_VALID", "COUNTEREXAMPLE_FOUND", "SMT_ERROR"]),
  theoremName: z.string().min(1),
  smtLibScript: z.string().min(1),
  modelAssignments: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).default({}),
  counterexample: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).optional(),
  conservationPassed: z.boolean(),
  doubleEntryBalanced: z.boolean(),
  creditBoundSatisfied: z.boolean(),
  proofSignature: z.string().length(64),
  executionTimeMs: z.number().nonnegative(),
});
export type Z3ProofResult = z.infer<typeof Z3ProofResultSchema>;

// =============================================================================
// 5. REINVESTIGATION STATE MACHINE SCHEMAS
// =============================================================================

export const ReinvestigationStateSchema = z.object({
  loopId: z.string().min(1),
  exceptionId: z.string().min(1),
  iteration: z.number().int().min(0).max(5),
  maxIterations: z.number().int().min(1).max(5).default(3),
  status: z.enum(["INITIALIZING", "INVESTIGATING", "CRITIQUING", "MECHANICALLY_VERIFYING", "REINVESTIGATING", "CONVERGED_VERIFIED", "ESCALATED_HUMAN_REVIEW", "CONTROL_FAILURE"]),
  history: z.array(
    z.object({
      iteration: z.number().int(),
      investigatorHypothesis: z.string(),
      criticVerdict: z.string(),
      confirmedObjections: z.array(z.string()),
      mechanicalHash: z.string(),
    })
  ).default([]),
  finalVerdict: z.enum(["VERIFIED", "DISPUTED", "INSUFFICIENT_EVIDENCE", "CONFLICTING_EVIDENCE", "CONTROL_FAILURE"]).optional(),
  proofReceiptHash: z.string().optional(),
});
export type ReinvestigationState = z.infer<typeof ReinvestigationStateSchema>;
