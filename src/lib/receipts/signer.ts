/*
 * SettleMate AI — Milestone 5: Cryptographic Signing & Key Rotation Engine
 *
 * Implements:
 *   - Deterministic SHA-256 Proof Hashing
 *   - HMAC-SHA256 Signing with Server-Side Key Management
 *   - Multi-Version Key Rotation (v1, v2, etc.)
 *   - Constant-time signature verification (timingSafeEqual)
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { type TerminalDecisionReceipt, TerminalDecisionReceiptSchema } from "./types";
import { canonicalizeReceiptForSigning, canonicalizeJson } from "./canonicalizer";

// Internal server-side signing keys mapped by key version
const SERVER_KEY_STORE: Record<string, string> = {
  v1: process.env.RECEIPT_SIGNING_SECRET_V1 || "settlemate_terminal_secret_v1_auth_2026",
  v2: process.env.RECEIPT_SIGNING_SECRET_V2 || "settlemate_terminal_secret_v2_rotated_2026",
};

export const CURRENT_SIGNING_KEY_VERSION = "v1";

/**
 * Retrieves the signing key for a specific key version.
 */
export function getSigningKeyForVersion(keyVersion: string): string | null {
  return SERVER_KEY_STORE[keyVersion] || null;
}

/**
 * Computes the deterministic SHA-256 proof hash over the canonical receipt bytes.
 */
export function computeProofHash(
  receipt: Omit<TerminalDecisionReceipt, "proofHash" | "signature"> | TerminalDecisionReceipt
): string {
  const canonicalBytes = canonicalizeReceiptForSigning(receipt);
  return createHash("sha256").update(canonicalBytes, "utf8").digest("hex");
}

/**
 * Signs a receipt and produces the final sealed TerminalDecisionReceipt.
 */
export function signReceipt(
  unsignedReceipt: Omit<TerminalDecisionReceipt, "proofHash" | "signature">,
  keyVersion: string = CURRENT_SIGNING_KEY_VERSION,
  customSecret?: string
): TerminalDecisionReceipt {
  const secret = customSecret || getSigningKeyForVersion(keyVersion);
  if (!secret) {
    throw new Error(`Cannot sign receipt: Unknown signing key version '${keyVersion}'`);
  }

  // Pre-populate required envelope fields
  const candidate = {
    ...unsignedReceipt,
    signingKeyVersion: keyVersion,
    canonicalizationVersion: "RFC8785-v1" as const,
    signatureAlgorithm: "HMAC-SHA256" as const,
    proofHash: "0".repeat(64),
    signature: "0".repeat(64),
  };

  const parsed = TerminalDecisionReceiptSchema.parse(candidate);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { proofHash: _p, signature: _s, ...signableBody } = parsed;

  // 1. Canonicalize receipt body (excluding proofHash & signature)
  const canonicalString = canonicalizeJson(signableBody);

  // 2. Compute Proof Hash (SHA-256)
  const proofHash = createHash("sha256").update(canonicalString, "utf8").digest("hex");

  // 3. Compute Cryptographic Signature (HMAC-SHA256)
  const signature = createHmac("sha256", secret).update(canonicalString, "utf8").digest("hex");

  return {
    ...signableBody,
    proofHash,
    signature,
  };
}

/**
 * Verifies the HMAC-SHA256 signature of a TerminalDecisionReceipt using constant-time comparison.
 */
export function verifyReceiptSignature(
  receipt: TerminalDecisionReceipt,
  customSecret?: string
): { isValid: boolean; error?: string; recomputedHash: string; recomputedSignature: string } {
  const keyVersion = receipt.signingKeyVersion || "v1";
  const secret = customSecret || getSigningKeyForVersion(keyVersion);

  if (!secret) {
    return {
      isValid: false,
      error: `UNKNOWN_KEY_VERSION: Signing key version '${keyVersion}' is not recognized`,
      recomputedHash: "",
      recomputedSignature: "",
    };
  }

  // Parse if possible to normalize defaults
  const parsed = TerminalDecisionReceiptSchema.safeParse(receipt);
  const target = parsed.success ? parsed.data : receipt;

  // 1. Recompute canonical string
  const canonicalString = canonicalizeReceiptForSigning(target);

  // 2. Recompute Proof Hash
  const recomputedHash = createHash("sha256").update(canonicalString, "utf8").digest("hex");
  const hashMatches = recomputedHash === receipt.proofHash;

  // 3. Recompute Signature
  const recomputedSignature = createHmac("sha256", secret).update(canonicalString, "utf8").digest("hex");

  // Constant-time signature comparison
  let sigMatches = false;
  try {
    const expectedBuf = Buffer.from(receipt.signature, "hex");
    const actualBuf = Buffer.from(recomputedSignature, "hex");
    sigMatches = expectedBuf.length === actualBuf.length && timingSafeEqual(expectedBuf, actualBuf);
  } catch {
    sigMatches = false;
  }

  if (!hashMatches) {
    return {
      isValid: false,
      error: "HASH_MISMATCH: Stored proofHash does not match canonical SHA-256",
      recomputedHash,
      recomputedSignature,
    };
  }

  if (!sigMatches) {
    return {
      isValid: false,
      error: "SIGNATURE_MISMATCH: HMAC-SHA256 signature verification failed",
      recomputedHash,
      recomputedSignature,
    };
  }

  return {
    isValid: true,
    recomputedHash,
    recomputedSignature,
  };
}
