/*
 * SettleMate AI — Milestone 5: Cryptographic Signing & Key Rotation Engine
 *
 * Implements:
 *   - Deterministic SHA-256 Proof Hashing
 *   - HMAC-SHA256 Signing with Server-Side Key Management & Governance
 *   - Cryptographic Entropy & Format Validation (rejects predictable keys)
 *   - Production Fail-Closed Key Policy (prohibits known public fallback keys)
 *   - Multi-Version Key Rotation (v1, v2, etc.)
 *   - Constant-time signature verification (timingSafeEqual)
 *   - Transparent Legacy Fallback Key Classification
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { type TerminalDecisionReceipt, TerminalDecisionReceiptSchema } from "./types";
import { canonicalizeReceiptForSigning, canonicalizeJson } from "./canonicalizer";

/**
 * Publicly known development/testing fallback secrets.
 * Any key matching these values is strictly rejected in production environments.
 */
export const KNOWN_INSECURE_FALLBACK_KEYS = new Set<string>([
  "settlemate_terminal_secret_v1_auth_2026",
  "settlemate_terminal_secret_v2_rotated_2026",
]);

export const CURRENT_SIGNING_KEY_VERSION = "v1";

/**
 * Generates a cryptographically strong 256-bit random signing key (64 hex characters).
 */
export function generateSecureSigningKey(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Computes the Shannon entropy of a string (in bits per character).
 * Shannon Entropy: H(X) = -SUM( p(x) * log2(p(x)) )
 */
export function calculateShannonEntropy(str: string): number {
  if (!str || str.length === 0) return 0;
  const freq: Record<string, number> = {};
  for (const ch of str) {
    freq[ch] = (freq[ch] || 0) + 1;
  }
  let entropy = 0;
  const len = str.length;
  for (const count of Object.values(freq)) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/**
 * Validates cryptographic entropy and format of a candidate signing key.
 * Enforces:
 * 1. Minimum 32 characters in length.
 * 2. Minimum Shannon entropy of 3.0 bits per character (rejects repeated patterns like "aaaa...").
 * 3. No single character may exceed 35% of the total key length.
 * 4. Must not match known-insecure development fallback strings.
 */
export function validateKeyEntropy(
  key: string,
  keyName = "Signing key"
): { isValid: boolean; reason?: string } {
  if (!key || typeof key !== "string") {
    return { isValid: false, reason: `${keyName} is missing or not a string` };
  }

  if (key.length < 32) {
    return {
      isValid: false,
      reason: `${keyName} length is ${key.length} characters; minimum required is 32 characters (256 bits)`,
    };
  }

  if (KNOWN_INSECURE_FALLBACK_KEYS.has(key)) {
    return {
      isValid: false,
      reason: `${keyName} matches a known-public development fallback secret`,
    };
  }

  const entropy = calculateShannonEntropy(key);
  if (entropy < 3.0) {
    return {
      isValid: false,
      reason: `${keyName} has insufficient Shannon entropy (${entropy.toFixed(2)} bits/char; minimum required is 3.00 bits/char)`,
    };
  }

  // Check character repetition (e.g. repeated sequence)
  const freq: Record<string, number> = {};
  for (const ch of key) {
    freq[ch] = (freq[ch] || 0) + 1;
    if (freq[ch] / key.length > 0.35) {
      return {
        isValid: false,
        reason: `${keyName} has excessive repetition of character '${ch}' (${((freq[ch] / key.length) * 100).toFixed(1)}% of string)`,
      };
    }
  }

  return { isValid: true };
}

/**
 * Retrieves the raw configured key and its provenance for a specific key version.
 */
export function getKeyEntry(keyVersion: string): { key: string | null; isFallback: boolean } {
  const isProd = process.env.NODE_ENV === "production";

  if (keyVersion === "v1") {
    const envVal = process.env.RECEIPT_SIGNING_SECRET_V1;
    if (envVal) {
      return { key: envVal, isFallback: false };
    }
    if (isProd) {
      return { key: null, isFallback: false };
    }
    return { key: "settlemate_terminal_secret_v1_auth_2026", isFallback: true };
  }

  if (keyVersion === "v2") {
    const envVal = process.env.RECEIPT_SIGNING_SECRET_V2;
    if (envVal) {
      return { key: envVal, isFallback: false };
    }
    if (isProd) {
      return { key: null, isFallback: false };
    }
    return { key: "settlemate_terminal_secret_v2_rotated_2026", isFallback: true };
  }

  return { key: null, isFallback: false };
}

/**
 * Retrieves the signing key for a specific key version.
 * In production mode, fails closed if the key is missing or uses a known development fallback.
 */
export function getSigningKeyForVersion(keyVersion: string): string | null {
  const { key, isFallback } = getKeyEntry(keyVersion);
  if (!key) return null;

  if (process.env.NODE_ENV === "production") {
    if (isFallback) return null;
    const validation = validateKeyEntropy(key, `RECEIPT_SIGNING_SECRET_${keyVersion.toUpperCase()}`);
    if (!validation.isValid) {
      throw new Error(`[SettleMate Security] ${validation.reason}`);
    }
  }

  return key;
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

export interface VerificationOptions {
  customSecret?: string;
  allowLegacyFallback?: boolean;
}

/**
 * Signs a receipt and produces the final sealed TerminalDecisionReceipt.
 * 
 * In production (NODE_ENV === "production"):
 * - customSecret is prohibited to prevent arbitrary signing key bypass.
 * - Missing or fallback keys throw immediately (fail closed).
 */
export function signReceipt(
  unsignedReceipt: Omit<TerminalDecisionReceipt, "proofHash" | "signature">,
  keyVersion: string = CURRENT_SIGNING_KEY_VERSION,
  customSecret?: string
): TerminalDecisionReceipt {
  const isProd = process.env.NODE_ENV === "production";

  // Validate customSecret boundary in production
  if (customSecret && isProd) {
    throw new Error(
      "[SettleMate Security] customSecret is strictly prohibited for signing in production mode. Use governed environment keys."
    );
  }

  let secret: string | null = null;

  if (customSecret) {
    const val = validateKeyEntropy(customSecret, "customSecret");
    if (!val.isValid && isProd) {
      throw new Error(`[SettleMate Security] Cannot sign receipt: ${val.reason}`);
    }
    secret = customSecret;
  } else {
    secret = getSigningKeyForVersion(keyVersion);
  }

  if (!secret) {
    throw new Error(
      `Cannot sign receipt: Signing key for version '${keyVersion}' is unavailable or not configured in ${isProd ? "production" : "current"} environment`
    );
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
 * 
 * Supports both function signatures:
 *   verifyReceiptSignature(receipt, customSecret)
 *   verifyReceiptSignature(receipt, options)
 */
export function verifyReceiptSignature(
  receipt: TerminalDecisionReceipt,
  secretOrOptions?: string | VerificationOptions
): {
  isValid: boolean;
  error?: string;
  recomputedHash: string;
  recomputedSignature: string;
  keyVersion: string;
  isLegacyFallbackKey?: boolean;
} {
  const isProd = process.env.NODE_ENV === "production";

  // Normalize options
  let customSecret: string | undefined;
  let allowLegacyFallback = !isProd; // default: allow in dev/test, disallow in production

  if (typeof secretOrOptions === "string") {
    customSecret = secretOrOptions;
  } else if (secretOrOptions && typeof secretOrOptions === "object") {
    customSecret = secretOrOptions.customSecret;
    if (typeof secretOrOptions.allowLegacyFallback === "boolean") {
      allowLegacyFallback = secretOrOptions.allowLegacyFallback;
    }
  }

  const keyVersion = receipt.signingKeyVersion || "v1";
  let secret: string | null = null;
  let isLegacyFallback = false;

  if (customSecret) {
    if (isProd) {
      const val = validateKeyEntropy(customSecret, "customSecret");
      if (!val.isValid) {
        return {
          isValid: false,
          error: `CUSTOM_SECRET_INSECURE: ${val.reason}`,
          recomputedHash: "",
          recomputedSignature: "",
          keyVersion,
        };
      }
    }
    secret = customSecret;
  } else {
    const entry = getKeyEntry(keyVersion);
    secret = entry.key;
    isLegacyFallback = entry.isFallback;
  }

  if (!secret) {
    return {
      isValid: false,
      error: `KEY_UNAVAILABLE: Signing key version '${keyVersion}' is not configured or unavailable`,
      recomputedHash: "",
      recomputedSignature: "",
      keyVersion,
    };
  }

  // Reject legacy fallback keys if not explicitly permitted
  if (isLegacyFallback && !allowLegacyFallback) {
    return {
      isValid: false,
      error: `LEGACY_FALLBACK_KEY_UNTRUSTED: Receipt references key version '${keyVersion}' which resolves to a known development constant; untrusted in production`,
      recomputedHash: "",
      recomputedSignature: "",
      keyVersion,
      isLegacyFallbackKey: true,
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
      keyVersion,
      isLegacyFallbackKey: isLegacyFallback,
    };
  }

  if (!sigMatches) {
    return {
      isValid: false,
      error: "SIGNATURE_MISMATCH: HMAC-SHA256 signature verification failed",
      recomputedHash,
      recomputedSignature,
      keyVersion,
      isLegacyFallbackKey: isLegacyFallback,
    };
  }

  return {
    isValid: true,
    recomputedHash,
    recomputedSignature,
    keyVersion,
    isLegacyFallbackKey: isLegacyFallback,
  };
}
