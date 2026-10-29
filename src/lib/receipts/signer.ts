/*
 * SettleMate AI — Milestone 5: Receipt Signing & Key Rotation
 *
 * HMAC-SHA256 over the RFC 8785-style canonical receipt body, with a versioned
 * server-side key ring. One trust policy governs both signing and verification:
 *
 *   - Keys come only from the environment (RECEIPT_SIGNING_SECRET_V<n>).
 *     Callers cannot supply a key for signing or verification.
 *   - Production (NODE_ENV=production) fails closed on a missing active key, a
 *     key shorter than 32 bytes, a key reused across versions, a placeholder,
 *     or one of the publicly known secrets from this repository's history.
 *   - Outside production, an unset v1/v2 key is replaced by a random key that
 *     lives only for this process. Receipts signed with it verify, but are
 *     reported as untrusted development receipts.
 *   - Receipts whose signature matches a publicly known legacy secret are
 *     classified as LEGACY_PUBLIC_KEY: inspectable, never trusted.
 *
 * Key checks here are configuration guards, not a proof of randomness. No
 * test on a string can show that it was generated unpredictably; keys must be
 * produced by a CSPRNG (see docs/receipt-signing.md) and held in a secret
 * manager.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { type TerminalDecisionReceipt, TerminalDecisionReceiptSchema } from "./types";
import { canonicalizeReceiptForSigning, canonicalizeJson } from "./canonicalizer";

/**
 * Secrets that were committed to this repository as defaults and are therefore
 * public. They are never accepted as keys; they are kept only so that receipts
 * signed with them can be recognised and classified as untrusted.
 */
export const KNOWN_PUBLIC_LEGACY_KEYS: Readonly<Record<string, string>> = Object.freeze({
  v1: "settlemate_terminal_secret_v1_auth_2026",
  v2: "settlemate_terminal_secret_v2_rotated_2026",
});

const KNOWN_PUBLIC_VALUES = new Set(Object.values(KNOWN_PUBLIC_LEGACY_KEYS));

/** Versions that get an ephemeral development key when unset outside production. */
const DEVELOPMENT_VERSIONS = ["v1", "v2"] as const;

const DEFAULT_ACTIVE_VERSION = "v1";
const MIN_KEY_BYTES = 32;
const KEY_VERSION_PATTERN = /^v[1-9]\d{0,3}$/;
const ENV_KEY_PATTERN = /^RECEIPT_SIGNING_SECRET_V([1-9]\d{0,3})$/;
const PLACEHOLDER_PATTERN = /change[-_ ]?me|replace[-_ ]?(me|this)|placeholder|example|your[-_ ]?(secret|key)|<.*>/i;

export type KeyTrust = "GOVERNED" | "DEVELOPMENT_EPHEMERAL";

export type SignatureTrust =
  | "TRUSTED"
  | "UNTRUSTED_DEVELOPMENT_KEY"
  | "UNTRUSTED_LEGACY_PUBLIC_KEY"
  | "INVALID";

interface KeyEntry {
  secret: Buffer;
  trust: KeyTrust;
}

export interface ReceiptKeyRing {
  activeVersion: string;
  keys: ReadonlyMap<string, KeyEntry>;
  production: boolean;
}

export class ReceiptKeyConfigError extends Error {
  constructor(message: string) {
    super(`[SettleMate receipt keys] ${message}`);
    this.name = "ReceiptKeyConfigError";
  }
}

/**
 * Generate a 256-bit key from the OS CSPRNG, base64-encoded (44 characters).
 * Equivalent shell command: `openssl rand -base64 32`.
 */
export function generateSigningKey(): string {
  return randomBytes(32).toString("base64");
}

/**
 * Configuration guard for one key. Returns a reason when the key must not be
 * used; null when it passes. Passing does not mean the key is random.
 */
export function checkKeyMaterial(value: string): string | null {
  if (Buffer.byteLength(value, "utf8") < MIN_KEY_BYTES) {
    return `must be at least ${MIN_KEY_BYTES} bytes (generate one with \`openssl rand -base64 32\`)`;
  }
  if (KNOWN_PUBLIC_VALUES.has(value)) return "is a publicly known secret from the repository history";
  if (PLACEHOLDER_PATTERN.test(value)) return "looks like a placeholder value";
  return null;
}

/**
 * Build the key ring from an environment. Throws ReceiptKeyConfigError for
 * any configured key that fails the guards (in every environment), and, in
 * production, when the active version has no configured key.
 */
export function loadReceiptKeyRing(env: NodeJS.ProcessEnv = process.env): ReceiptKeyRing {
  const production = env.NODE_ENV === "production";
  const keys = new Map<string, KeyEntry>();
  const seen = new Map<string, string>();

  for (const [name, raw] of Object.entries(env)) {
    const match = ENV_KEY_PATTERN.exec(name);
    if (!match || raw === undefined || raw === "") continue;
    const version = `v${match[1]}`;
    const problem = checkKeyMaterial(raw);
    if (problem) throw new ReceiptKeyConfigError(`${name} ${problem}`);
    const reusedBy = seen.get(raw);
    if (reusedBy) throw new ReceiptKeyConfigError(`${name} reuses the key of ${reusedBy}; each version needs its own key`);
    seen.set(raw, name);
    keys.set(version, { secret: Buffer.from(raw, "utf8"), trust: "GOVERNED" });
  }

  const activeVersion = env.RECEIPT_SIGNING_ACTIVE_VERSION || DEFAULT_ACTIVE_VERSION;
  if (!KEY_VERSION_PATTERN.test(activeVersion)) {
    throw new ReceiptKeyConfigError(`RECEIPT_SIGNING_ACTIVE_VERSION '${activeVersion}' is not of the form v<n>`);
  }

  if (production) {
    if (!keys.has(activeVersion)) {
      throw new ReceiptKeyConfigError(
        `RECEIPT_SIGNING_SECRET_${activeVersion.toUpperCase()} must be set in production (active version ${activeVersion})`
      );
    }
  } else {
    for (const version of DEVELOPMENT_VERSIONS) {
      if (!keys.has(version)) keys.set(version, { secret: randomBytes(32), trust: "DEVELOPMENT_EPHEMERAL" });
    }
    if (!keys.has(activeVersion)) {
      throw new ReceiptKeyConfigError(`active version ${activeVersion} has no RECEIPT_SIGNING_SECRET_${activeVersion.toUpperCase()}`);
    }
  }

  return { activeVersion, keys, production };
}

let cachedRing: ReceiptKeyRing | null = null;

/** The process-wide key ring, loaded from process.env on first use. */
export function getReceiptKeyRing(): ReceiptKeyRing {
  cachedRing ??= loadReceiptKeyRing();
  return cachedRing;
}

/** Test hook: drop the cached ring so the next call re-reads process.env. */
export function resetReceiptKeyRingForTests(): void {
  cachedRing = null;
}

export function getActiveSigningKeyVersion(): string {
  return getReceiptKeyRing().activeVersion;
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

function hmacHex(secret: Buffer | string, canonical: string): string {
  return createHmac("sha256", secret).update(canonical, "utf8").digest("hex");
}

function hexEqual(a: string, b: string): boolean {
  if (!/^[0-9a-f]+$/i.test(a) || !/^[0-9a-f]+$/i.test(b) || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

/**
 * Signs a receipt with a key from the server key ring. In production only the
 * active version may sign, so a retired key cannot produce new receipts.
 */
export function signReceipt(
  unsignedReceipt: Omit<TerminalDecisionReceipt, "proofHash" | "signature">,
  keyVersion?: string
): TerminalDecisionReceipt {
  const ring = getReceiptKeyRing();
  const version = keyVersion ?? ring.activeVersion;
  const entry = ring.keys.get(version);
  if (!entry) {
    throw new ReceiptKeyConfigError(`Cannot sign receipt: unknown signing key version '${version}'`);
  }
  if (ring.production && version !== ring.activeVersion) {
    throw new ReceiptKeyConfigError(
      `Cannot sign receipt with '${version}': only the active version '${ring.activeVersion}' may sign in production`
    );
  }

  const candidate = {
    ...unsignedReceipt,
    signingKeyVersion: version,
    canonicalizationVersion: "RFC8785-v1" as const,
    signatureAlgorithm: "HMAC-SHA256" as const,
    proofHash: "0".repeat(64),
    signature: "0".repeat(64),
  };

  const parsed = TerminalDecisionReceiptSchema.parse(candidate);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { proofHash: _p, signature: _s, ...signableBody } = parsed;

  const canonicalString = canonicalizeJson(signableBody);
  const proofHash = createHash("sha256").update(canonicalString, "utf8").digest("hex");
  const signature = hmacHex(entry.secret, canonicalString);

  return { ...signableBody, proofHash, signature };
}

export interface SignatureVerification {
  /** Hash and HMAC both match a key in the ring. */
  isValid: boolean;
  /** What the result may be relied on for. Only TRUSTED is financial proof. */
  trust: SignatureTrust;
  keyVersion: string;
  error?: string;
  recomputedHash: string;
  recomputedSignature: string;
}

/**
 * Verifies a receipt's proof hash and HMAC signature against the server key
 * ring, using constant-time comparison.
 */
export function verifyReceiptSignature(receipt: TerminalDecisionReceipt, customSecret?: undefined): SignatureVerification {
  if (customSecret !== undefined) {
    throw new ReceiptKeyConfigError("verifyReceiptSignature no longer accepts a caller-supplied secret");
  }
  const ring = getReceiptKeyRing();

  const parsed = TerminalDecisionReceiptSchema.safeParse(receipt);
  const target = parsed.success ? parsed.data : receipt;
  const keyVersion = typeof target.signingKeyVersion === "string" ? target.signingKeyVersion : "";

  const canonicalString = canonicalizeReceiptForSigning(target);
  const recomputedHash = createHash("sha256").update(canonicalString, "utf8").digest("hex");

  const entry = KEY_VERSION_PATTERN.test(keyVersion) ? ring.keys.get(keyVersion) : undefined;
  const recomputedSignature = entry ? hmacHex(entry.secret, canonicalString) : "";

  if (recomputedHash !== receipt.proofHash) {
    return {
      isValid: false,
      trust: "INVALID",
      keyVersion,
      error: "HASH_MISMATCH: Stored proofHash does not match canonical SHA-256",
      recomputedHash,
      recomputedSignature,
    };
  }

  if (entry && hexEqual(receipt.signature, recomputedSignature)) {
    return {
      isValid: true,
      trust: entry.trust === "GOVERNED" ? "TRUSTED" : "UNTRUSTED_DEVELOPMENT_KEY",
      keyVersion,
      recomputedHash,
      recomputedSignature,
    };
  }

  // Not signed by the ring. If a public legacy secret reproduces the signature,
  // say so explicitly so historical receipts can be inspected without being trusted.
  // Own-property lookup: signingKeyVersion comes from the receipt, so values
  // such as "__proto__" or "constructor" must not resolve to prototype members.
  const legacy = Object.hasOwn(KNOWN_PUBLIC_LEGACY_KEYS, keyVersion) ? KNOWN_PUBLIC_LEGACY_KEYS[keyVersion] : undefined;
  if (legacy && hexEqual(receipt.signature, hmacHex(legacy, canonicalString))) {
    return {
      isValid: false,
      trust: "UNTRUSTED_LEGACY_PUBLIC_KEY",
      keyVersion,
      error: `LEGACY_PUBLIC_KEY: signed with the publicly known ${keyVersion} default secret; not trusted`,
      recomputedHash,
      recomputedSignature,
    };
  }

  if (!entry) {
    return {
      isValid: false,
      trust: "INVALID",
      keyVersion,
      error: `UNKNOWN_KEY_VERSION: Signing key version '${keyVersion}' is not configured`,
      recomputedHash,
      recomputedSignature: "",
    };
  }

  return {
    isValid: false,
    trust: "INVALID",
    keyVersion,
    error: "SIGNATURE_MISMATCH: HMAC-SHA256 signature verification failed",
    recomputedHash,
    recomputedSignature,
  };
}
