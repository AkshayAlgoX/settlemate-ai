/*
 * SettleMate AI — Milestone 4: Minimal Correcting Journal Entry & Invariant Restoration Proof
 *
 * Types and Boundary Schemas
 * Pure integer minor units (paise/cents). No floating point.
 */

import { z } from "zod";

export const CorrectionTypeEnum = z.enum([
  "MISSING_DEBIT",
  "MISSING_CREDIT",
  "DUPLICATE_POSTING_REVERSAL",
  "FEE_ADJUSTMENT",
  "SETTLEMENT_VARIANCE",
  "UNSUPPORTED_CORRECTION",
]);
export type CorrectionType = z.infer<typeof CorrectionTypeEnum>;

export const CorrectionStatusEnum = z.enum([
  "PROPOSED",
  "AWAITING_REVIEW",
  "APPROVED",
  "REJECTED",
  "STALE",
  "FAILED",
]);
export type CorrectionStatus = z.infer<typeof CorrectionStatusEnum>;

export const JournalEntryTypeEnum = z.enum(["DEBIT", "CREDIT"]);
export type JournalEntryType = z.infer<typeof JournalEntryTypeEnum>;

export const JournalLineSchema = z.object({
  lineId: z.string().min(1),
  accountId: z.string().min(1),
  accountName: z.string().min(1),
  entryType: JournalEntryTypeEnum,
  amountMinor: z.number().int().positive(),
  currency: z.string().length(3).default("INR"),
  description: z.string().min(1),
});
export type JournalLine = z.infer<typeof JournalLineSchema>;

export const CorrectionInputSchema = z.object({
  tenantId: z.string().min(1),
  transactionId: z.string().min(1),
  currency: z.string().length(3).default("INR"),
  sourceBalances: z
    .object({
      debitAccount: z.string().optional(),
      creditAccount: z.string().optional(),
    })
    .optional(),
  observedDebitMinor: z.number().int().min(0),
  observedCreditMinor: z.number().int().min(0),
  expectedDebitMinor: z.number().int().min(0),
  expectedCreditMinor: z.number().int().min(0),
  detectedDifferenceMinor: z.number().int().min(0),
  correctionType: CorrectionTypeEnum,
  evidenceIds: z.array(z.string()).default([]),
  invariantProofId: z.string().optional(),
  policyVersion: z.string().default("correction-policy-v1"),
  underlyingRecordVersion: z.number().int().min(1).default(1),
});
export type CorrectionInput = z.infer<typeof CorrectionInputSchema>;

export const InvariantRestorationProofSchema = z.object({
  proofId: z.string().min(1),
  invariantName: z.string().min(1),
  beforeState: z.object({
    debitMinor: z.number().int().min(0),
    creditMinor: z.number().int().min(0),
    differenceMinor: z.number().int().min(0),
    isBalanced: z.boolean(),
  }),
  correctionState: z.object({
    debitLinesTotalMinor: z.number().int().min(0),
    creditLinesTotalMinor: z.number().int().min(0),
    netCorrectionMinor: z.number().int().min(0),
  }),
  afterState: z.object({
    debitMinor: z.number().int().min(0),
    creditMinor: z.number().int().min(0),
    differenceMinor: z.number().int().min(0),
    isBalanced: z.boolean(),
  }),
  proofResult: z.enum(["VERIFIED", "FAILED"]),
  smtScript: z.string().optional(),
  counterexample: z.string().optional(),
  proofHash: z.string().min(1),
  verifiedAt: z.string(),
});
export type InvariantRestorationProof = z.infer<typeof InvariantRestorationProofSchema>;

export const ProposedCorrectionRecordSchema = z.object({
  correctionId: z.string().min(1),
  tenantId: z.string().min(1),
  transactionId: z.string().min(1),
  status: CorrectionStatusEnum,
  correctionType: CorrectionTypeEnum,
  currency: z.string().length(3).default("INR"),
  journalLines: z.array(JournalLineSchema),
  totalDebitCorrectionMinor: z.number().int().min(0),
  totalCreditCorrectionMinor: z.number().int().min(0),
  detectedDifferenceMinor: z.number().int().min(0),
  invariantProof: InvariantRestorationProofSchema,
  minimalExplanation: z.string().min(1),
  underlyingRecordVersion: z.number().int().min(1).default(1),
  reviewedBy: z.string().optional(),
  reviewedAt: z.string().optional(),
  rejectionReason: z.string().optional(),
  policyVersion: z.string().default("correction-policy-v1"),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ProposedCorrectionRecord = z.infer<typeof ProposedCorrectionRecordSchema>;

export interface MinimalCorrectionCalculationResult {
  applicable: boolean;
  status: CorrectionStatus;
  correctionType: CorrectionType;
  journalLines: JournalLine[];
  totalDebitCorrectionMinor: number;
  totalCreditCorrectionMinor: number;
  detectedDifferenceMinor: number;
  minimalExplanation: string;
  reason?: string;
}
