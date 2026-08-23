/*
 * Scalable cardinality — candidate bucketing / indexing (pure unit tests).
 *
 * Proves: amount buckets group by exact integer amount; date buckets are deterministic
 * and separate records that cannot be within the reconciliation window; UTR indexes
 * classify by identifier; structurally-equal inputs always produce equal indexes.
 * No DB, no I/O.
 */

import assert from "node:assert/strict";
import type { NormalizedBankTxn, NormalizedSettlement } from "../types";
import {
  SCALE_CONFIG,
  buildAmountIndexes,
  buildUtrIndexes,
  dateBucketKey,
} from "./buckets";

let passed = 0;
let failed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name} — ${(err as Error).message}`);
  }
}

const BASE = new Date("2025-01-01T00:00:00Z");

function settlement(id: string, amount: number, utr: string | null = null): NormalizedSettlement {
  return {
    dbId: `db_${id}`, settlementId: id, paymentId: `pay_${id}`, amount,
    fee: 0, tax: 0, utr, status: "settled", settledAt: BASE, createdAt: BASE,
  };
}

function bank(id: string, amount: number, utr: string | null = null): NormalizedBankTxn {
  return {
    dbId: `db_${id}`, txnId: id, utr, amount, type: "CREDIT",
    narration: "TEST", txnDate: BASE, matched: false,
  };
}

function serializeAmountIndex(ix: {
  settlementsByAmount: Map<number, NormalizedSettlement[]>;
  creditsByAmount: Map<number, NormalizedBankTxn[]>;
}): string {
  const s = [...ix.settlementsByAmount.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([k, v]) => `${k}:${v.map((x) => x.settlementId).sort().join(",")}`)
    .join("|");
  const c = [...ix.creditsByAmount.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([k, v]) => `${k}:${v.map((x) => x.txnId).sort().join(",")}`)
    .join("|");
  return `${s};;${c}`;
}

console.log("\nScale bucketing / indexing — pure tests");

check("amount indexes group settlements and credits by exact amount", () => {
  const ix = buildAmountIndexes(
    [settlement("s1", 10000), settlement("s2", 25000), settlement("s3", 10000)],
    [bank("c1", 10000), bank("c2", 35000)],
  );
  assert.deepEqual(
    (ix.settlementsByAmount.get(10000) ?? []).map((s) => s.settlementId).sort(),
    ["s1", "s3"],
  );
  assert.deepEqual((ix.settlementsByAmount.get(25000) ?? []).map((s) => s.settlementId), ["s2"]);
  assert.deepEqual((ix.creditsByAmount.get(10000) ?? []).map((c) => c.txnId), ["c1"]);
  assert.deepEqual((ix.creditsByAmount.get(35000) ?? []).map((c) => c.txnId), ["c2"]);
});

check("identical inputs produce identical amount indexes (determinism)", () => {
  const a = [settlement("s1", 10000), settlement("s2", 25000)];
  const b = [bank("c1", 10000), bank("c2", 35000)];
  assert.equal(
    serializeAmountIndex(buildAmountIndexes(a, b)),
    serializeAmountIndex(buildAmountIndexes(a, b)),
  );
  // Different array order → same bucket contents.
  assert.equal(
    serializeAmountIndex(buildAmountIndexes([a[1]!, a[0]!], [b[1]!, b[0]!])),
    serializeAmountIndex(buildAmountIndexes(a, b)),
  );
});

check("a changed amount lands in a different bucket", () => {
  const ix = buildAmountIndexes([settlement("s1", 10000)], []);
  const ix2 = buildAmountIndexes([settlement("s1", 10001)], []);
  assert.notEqual(
    serializeAmountIndex(ix),
    serializeAmountIndex(ix2),
  );
});

check("non-CREDIT transactions are excluded from credit amount buckets", () => {
  const debit = { ...bank("c1", 10000), type: "DEBIT" as string };
  const ix = buildAmountIndexes([], [debit]);
  assert.equal((ix.creditsByAmount.get(10000) ?? []).length, 0);
});

check("UTR indexes map a shared identifier to both sides", () => {
  const ix = buildUtrIndexes(
    [settlement("s1", 10000, "UTR_X")],
    [bank("c1", 10000, "UTR_X"), bank("c2", 10000)],
  );
  assert.equal(ix.settlementsByUtr.get("UTR_X")?.settlementId, "s1");
  assert.equal(ix.creditsByUtr.get("UTR_X")?.txnId, "c1");
  assert.equal(ix.creditsByUtr.has("UTR_X"), true);
  assert.equal(ix.settlementsByUtr.has("UTR_Y"), false);
});

check("dateBucketKey is deterministic and separates distinct windows", () => {
  const w = SCALE_CONFIG.partitionWindowMs;
  const a = 0; // window-aligned origin
  assert.equal(dateBucketKey(a, w), "0");
  assert.equal(dateBucketKey(a + w - 1, w), "0", "within same window");
  assert.notEqual(dateBucketKey(a + w, w), "0", "next window differs");
  assert.equal(dateBucketKey(a, w), dateBucketKey(a, w), "deterministic");
});

check("null / unknown dates are grouped into a stable unknown bucket", () => {
  assert.equal(dateBucketKey(null, SCALE_CONFIG.partitionWindowMs), "unknown");
  assert.equal(dateBucketKey(undefined, SCALE_CONFIG.partitionWindowMs), "unknown");
});

console.log(`\nbuckets: ${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
