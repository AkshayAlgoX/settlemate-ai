/*
 * SettleMate AI — Policy Canonical Hashing
 */

import { createHash } from "node:crypto";
import type { PolicyRules, ReconciliationPolicy } from "./types";

function sortObjectKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys);
  }
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
    sorted[key] = sortObjectKeys((obj as Record<string, unknown>)[key]);
  }
  return sorted;
}

export function computePolicyContentHash(rules: PolicyRules | Omit<ReconciliationPolicy, "contentHash" | "status" | "activatedAt" | "supersededAt">): string {
  const canonicalPayload = JSON.stringify(sortObjectKeys(rules));
  return createHash("sha256").update(canonicalPayload).digest("hex");
}
