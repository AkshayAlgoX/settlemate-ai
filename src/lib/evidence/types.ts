/*
 * SettleMate AI — Context Vault & Evidence Graph Domain Model
 */

import { createHash } from "node:crypto";

export type EvidenceSourceType =
  | "PAYMENT"
  | "SETTLEMENT"
  | "BANK_RECORD"
  | "REFUND"
  | "CHARGEBACK"
  | "INVOICE"
  | "DOCUMENT"
  | "EMAIL"
  | "WEBHOOK"
  | "ANALYST_NOTE";

export type AccessClassification =
  | "PUBLIC"
  | "CONFIDENTIAL"
  | "RESTRICTED"
  | "HIGHLY_RESTRICTED";

export type VerificationStatus = "VALID" | "TAMPER_DETECTED";

export interface LinkedFinancialRecords {
  orderIds?: string[];
  paymentIds?: string[];
  settlementIds?: string[];
  bankTxnIds?: string[];
  refundIds?: string[];
  chargebackIds?: string[];
  exceptionIds?: string[];
}

export interface EvidenceItem {
  evidenceId: string;
  batchId?: string;
  exceptionId?: string;
  sourceType: EvidenceSourceType;
  sourceReference: string;
  contentHash: string; // SHA-256 canonical hash
  hashAlgorithm?: "SHA-256";
  byteLength?: number;
  mimeType?: string;
  schemaVersion?: string;
  title: string;
  createdAt?: Date;
  observedAt?: Date;
  timestamp?: Date; // backwards compatibility alias
  accessClassification: AccessClassification;
  linkedRecords: LinkedFinancialRecords;
  provider?: string;
  structuredData?: Record<string, unknown>;
  rawText?: string;
  metadata?: Record<string, unknown>;
}

export interface ContradictionFinding {
  type:
    | "AMOUNT_MISMATCH"
    | "CURRENCY_MISMATCH"
    | "STATUS_MISMATCH"
    | "DATE_TIMING_MISMATCH"
    | "DUPLICATE_EVIDENCE"
    | "STALE_EVIDENCE"
    | "CONFLICTING_SOURCE_CLAIMS";
  evidenceAId: string;
  sourceA: string;
  claimA: string;
  valueA: string | number;
  evidenceBId: string;
  sourceB: string;
  claimB: string;
  valueB: string | number;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  description: string;
  recommendedReviewLevel: "CONTROLLED_REVIEW" | "MAKER_CHECKER_REQUIRED" | "ESCALATED_TO_CONTROLLER";
}

export type RelationType =
  | "SETTLES_PAYMENT"
  | "CREDITS_SETTLEMENT"
  | "REFUNDS_PAYMENT"
  | "CHARGEBACK_ON_PAYMENT"
  | "INVOICES_ORDER"
  | "EVIDENCE_FOR_RECORD"
  | "DISPUTES_TRANSACTION"
  | "NOTE_ON_EXCEPTION"
  | "AI_SUGGESTED_LINK";

export interface GraphNode {
  id: string;
  type:
    | "ORDER"
    | "PAYMENT"
    | "SETTLEMENT"
    | "BANK_TXN"
    | "REFUND"
    | "CHARGEBACK"
    | "INVOICE"
    | "CONTEXTUAL_EVIDENCE";
  label: string;
  classification: AccessClassification;
  metadata?: Record<string, unknown>;
}

export interface GraphEdge {
  source: string;
  target: string;
  relationType: RelationType;
  confidence: number; // 0 - 100
  reason: string;
  evidenceIds: string[];
  createdAt: Date;
  isTrusted: boolean; // false for unverified AI suggestions
}

export interface GroundedAiInvestigation {
  summary: string;
  reason: string;
  evidenceIds: string[];
  recommendedAction: string;
  confidence: number;
  uncertainties: string[];
  questionsRemaining: string[];
  conflictsFound: ContradictionFinding[];
  decisionOutcome: "AGREED_SUGGESTION" | "CONFLICTING_EVIDENCE" | "INSUFFICIENT_EVIDENCE" | "DISPUTED_HYPOTHESIS";
  authorityNotice: "AI_READ_ONLY_SUGGESTION_CANNOT_WRITE_LEDGER";
}

/**
 * Computes deterministic canonical SHA-256 hash over evidence payload.
 */
export function computeEvidenceHash(
  sourceType: EvidenceSourceType,
  sourceReference: string,
  rawText?: string,
  structuredData?: Record<string, unknown>
): { hash: string; byteLength: number } {
  const payload = JSON.stringify({
    sourceType,
    sourceReference,
    rawText: rawText || "",
    structuredData: structuredData || {},
  });

  const byteLength = Buffer.byteLength(payload, "utf8");
  const hash = createHash("sha256").update(payload).digest("hex");
  return { hash, byteLength };
}

/**
 * Generates deterministic evidenceId from source type and reference.
 */
export function generateDeterministicEvidenceId(
  sourceType: EvidenceSourceType,
  sourceReference: string
): string {
  const sanitizedRef = sourceReference.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
  const shortHash = createHash("sha256")
    .update(sourceType + ":" + sourceReference)
    .digest("hex")
    .slice(0, 8);
  return "ev_" + sourceType.toLowerCase() + "_" + sanitizedRef + "_" + shortHash;
}
