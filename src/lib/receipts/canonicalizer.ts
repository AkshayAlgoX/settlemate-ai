/*
 * SettleMate AI — Milestone 5: Deterministic Receipt Canonicalizer (RFC 8785 / JCS)
 *
 * Implements deterministic canonical JSON serialization for bitwise reproducible
 * cryptographic hashing and HMAC signatures.
 *
 * Guarantees:
 *   1. Lexicographical key sorting (UTF-16 code point order)
 *   2. Strict number formatting (integers, no locale-dependent formatting)
 *   3. Deterministic array preservation
 *   4. Omission of undefined / function / symbol properties
 *   5. Circular reference detection and protection
 */

import type { TerminalDecisionReceipt } from "./types";

/**
 * Pure deterministic JSON canonicalization function.
 */
export function canonicalizeJson(obj: unknown, seen: Set<unknown> = new Set()): string {
  if (obj === null || typeof obj !== "object") {
    if (typeof obj === "bigint") {
      return (obj as bigint).toString();
    }
    if (typeof obj === "number") {
      if (!Number.isFinite(obj)) return "null";
      // Format 0 and -0 consistently
      if (Object.is(obj, -0)) return "0";
      return obj.toString();
    }
    if (typeof obj === "string") {
      return JSON.stringify(obj);
    }
    if (typeof obj === "boolean") {
      return obj ? "true" : "false";
    }
    if (obj === undefined || typeof obj === "function" || typeof obj === "symbol") {
      return "undefined";
    }
    return JSON.stringify(obj);
  }

  if (seen.has(obj)) {
    throw new Error("Circular reference detected during canonicalization");
  }
  seen.add(obj);

  try {
    if (Array.isArray(obj)) {
      const items: string[] = [];
      for (const item of obj) {
        const serialized = canonicalizeJson(item, seen);
        items.push(serialized === "undefined" ? "null" : serialized);
      }
      return "[" + items.join(",") + "]";
    }

    const record = obj as Record<string, unknown>;
    const sortedKeys = Object.keys(record).sort();
    const pairs: string[] = [];

    for (const key of sortedKeys) {
      const val = record[key];
      if (val !== undefined && typeof val !== "function" && typeof val !== "symbol") {
        const serializedVal = canonicalizeJson(val, seen);
        if (serializedVal !== "undefined") {
          pairs.push(JSON.stringify(key) + ":" + serializedVal);
        }
      }
    }

    return "{" + pairs.join(",") + "}";
  } finally {
    seen.delete(obj);
  }
}

/**
 * Canonicalizes a receipt for proof hashing and signing.
 * Omits 'proofHash' and 'signature' so the hash and signature cover the canonical body.
 */
export function canonicalizeReceiptForSigning(
  receipt: Omit<TerminalDecisionReceipt, "proofHash" | "signature"> | TerminalDecisionReceipt
): string {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { proofHash, signature, ...signableBody } = receipt as TerminalDecisionReceipt;
  return canonicalizeJson(signableBody);
}

/**
 * Canonicalizes the complete sealed receipt including proofHash and signature.
 */
export function canonicalizeReceipt(receipt: TerminalDecisionReceipt): string {
  return canonicalizeJson(receipt);
}
