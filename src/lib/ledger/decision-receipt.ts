/*
 * SettleMate AI — Canonical Decision Receipt Engine (Day 7)
 *
 * Implements an independently verifiable financial decision receipt:
 *   - Canonical key serialization (deterministic JSON)
 *   - End-to-end lineage binding: Input -> Policy -> Match -> Invariants -> AI Claims -> Ledger -> Merkle
 *   - Cryptographic tamper resistance via canonical SHA-256 receipt hash
 */

import { createHash } from "node:crypto";

export interface DecisionReceiptFinancials {
  grossPaise: number;
  feePaise: number;
  taxPaise: number;
  refundPaise: number;
  chargebackPaise: number;
  netPaise: number;
  variancePaise: number;
}

export interface DecisionReceiptInvariant {
  code: string;
  passed: boolean;
  message: string;
}

export interface DecisionReceiptClaimSummary {
  receiptId: string;
  totalClaimsCount: number;
  verifiedClaimsCount: number;
  disputedClaimsCount: number;
  unsupportedClaimsCount: number;
  abstain: boolean;
  canonicalHash: string;
}

export interface DecisionReceiptMakerChecker {
  approvedBy?: string;
  approvedAt?: string;
  actionTaken?: string;
  notes?: string;
}

export interface CanonicalDecisionReceipt {
  receiptVersion: "1.0.0";
  receiptId: string;
  runId: string;
  recordId: string;
  batchId: string;
  inputFingerprint: string;
  engineVersion: string;
  policyId: string;
  policyVersion: string;
  policyHash: string;
  cardinalityType: "1:1" | "1:N" | "N:1" | "N:M";
  matchedSourceIds: {
    paymentIds: string[];
    settlementIds: string[];
    bankTxnIds: string[];
  };
  financialAmounts: DecisionReceiptFinancials;
  invariantResults: DecisionReceiptInvariant[];
  riskDecision: string;
  aiClaimReceipt?: DecisionReceiptClaimSummary;
  makerChecker?: DecisionReceiptMakerChecker;
  ledgerEntryId: string;
  ledgerStateHash: string;
  merkleRoot: string;
  merkleProof?: string[];
  timestamp: string; // ISO 8601 string
}

/**
 * Deterministically sort object keys for bitwise canonical JSON serialization.
 */
export function canonicalizeJson(obj: unknown, seen: Set<unknown> = new Set()): string {
  if (obj === null || typeof obj !== "object") {
    if (typeof obj === "bigint") return (obj as bigint).toString();
    if (typeof obj === "number" && !Number.isFinite(obj)) return "null";
    return JSON.stringify(obj);
  }

  if (seen.has(obj)) {
    return '"[Circular]"';
  }
  seen.add(obj);

  if (Array.isArray(obj)) {
    const serialized = obj.map((item) => canonicalizeJson(item, seen)).join(",");
    seen.delete(obj);
    return "[" + serialized + "]";
  }

  const sortedKeys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs: string[] = [];
  for (const key of sortedKeys) {
    const val = (obj as Record<string, unknown>)[key];
    if (val !== undefined && typeof val !== "function" && typeof val !== "symbol") {
      pairs.push(JSON.stringify(key) + ":" + canonicalizeJson(val, seen));
    }
  }

  seen.delete(obj);
  return "{" + pairs.join(",") + "}";
}

/**
 * Computes the canonical SHA-256 receipt hash.
 */
export function computeReceiptHash(receipt: CanonicalDecisionReceipt): string {
  const canonicalPayload = canonicalizeJson(receipt);
  return createHash("sha256").update(canonicalPayload).digest("hex");
}

export interface SealedDecisionReceipt {
  receipt: CanonicalDecisionReceipt;
  canonicalReceiptHash: string;
  signatureScheme: "SHA256_CANONICAL_SEAL";
}

/**
 * Generates and seals a Canonical Decision Receipt.
 */
export function createDecisionReceipt(
  params: Omit<CanonicalDecisionReceipt, "receiptVersion">
): SealedDecisionReceipt {
  const receipt: CanonicalDecisionReceipt = {
    ...params,
    receiptVersion: "1.0.0",
  };

  const canonicalReceiptHash = computeReceiptHash(receipt);

  return {
    receipt,
    canonicalReceiptHash,
    signatureScheme: "SHA256_CANONICAL_SEAL",
  };
}
