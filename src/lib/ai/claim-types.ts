/*
 * SettleMate AI — Claim-Level AI Verification Types & Schemas (Day 2–3)
 *
 * Defines structured, individually verifiable claims emitted by the Investigator
 * and deterministically evaluated by the Non-LLM Claim Validator.
 */

export type ClaimType =
  | "AMOUNT"
  | "IDENTITY"
  | "TIMING"
  | "STATUS"
  | "RELATIONSHIP"
  | "POLICY"
  | "FINANCIAL_EXPLANATION"
  | "RECOMMENDATION";

export type ClaimValidationStatus =
  | "VERIFIED"
  | "DISPUTED"
  | "UNSUPPORTED"
  | "INSUFFICIENT_EVIDENCE";

export interface AssertedValue {
  key: string;
  value: number | string | boolean | null;
  expectedPaise?: number;
  observedPaise?: number;
}

export interface AIClaim {
  claimId: string; // e.g. "C1", "C2", "C17"
  type: ClaimType;
  statement: string;
  evidenceIds: string[];
  assertedValues: AssertedValue[];
  confidence: number; // 0–100
  uncertainties: string[];
}

export interface ClaimCheckDetail {
  checkName:
    | "EVIDENCE_EXISTS"
    | "EVIDENCE_AUTHORIZED"
    | "EVIDENCE_LINKED"
    | "FINANCIAL_RECORD_EXISTS"
    | "NUMERIC_ASSERTION_MATCH"
    | "ARITHMETIC_RECOMPUTED"
    | "TIMING_CHECKED"
    | "RELATIONSHIP_CHECKED"
    | "POLICY_CHECKED"
    | "INVARIANTS_CHECKED";
  passed: boolean;
  message: string;
  expected?: string | number | null;
  actual?: string | number | null;
}

export interface ClaimValidationResult {
  claimId: string;
  type: ClaimType;
  status: ClaimValidationStatus;
  statement: string;
  evidenceIds: string[];
  checks: ClaimCheckDetail[];
  disputeReasons: string[];
  receiptHash: string; // SHA-256 canonical receipt hash
}

export interface ClaimAuditReceipt {
  receiptId: string;
  councilRunId: string;
  exceptionId: string;
  totalClaimsCount: number;
  verifiedClaimsCount: number;
  disputedClaimsCount: number;
  unsupportedClaimsCount: number;
  insufficientEvidenceCount: number;
  abstain: boolean;
  claims: ClaimValidationResult[];
  canonicalHash: string;
  policyVersion: string;
  engineVersion: string;
  timestamp: Date;
}
