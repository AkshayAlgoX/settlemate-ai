/*
 * Scalable cardinality — N:M strategy selection (pure unit tests).
 *
 * Proves the three-way selection (requirement 10): an indexed whole-batch sum resolves
 * as an N:1 regardless of cluster size; a single UTR+amount pair resolves as a 1:1; a
 * tiny cluster falls back to the bounded combinatorial solver with identical semantics;
 * a large unresolvable cluster routes to REVIEW with no fabricated relationship and no
 * throw (no exponential explosion).
 * No DB, no I/O.
 */

import assert from "node:assert/strict";
import type { NormalizedBankTxn, NormalizedSettlement } from "../types";
import { resolvePartition, selectStrategy } from "./strategy";
import type { ScalePartition } from "./clusters";

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
const CONFIG = { tolerancePaise: 100, maxHours: 96, boundedClusterMaxItems: 12 };

function settlement(id: string, amount: number, utr: string | null = null): NormalizedSettlement {
  return {
    dbId: `db_${id}`, settlementId: id, paymentId: `pay_${id}`, amount,
    fee: 0, tax: 0, utr, status: "settled", settledAt: BASE, createdAt: BASE,
  };
}

function bank(id: string, amount: number, utr: string | null = null): NormalizedBankTxn {
  return {
    dbId: `db_${id}`, txnId: id, utr, amount, type: "CREDIT",
    narration: "BULK", txnDate: BASE, matched: false,
  };
}

function part(settlements: NormalizedSettlement[], credits: NormalizedBankTxn[]): ScalePartition {
  return { id: "p-0-0", bucketKey: "0", settlements, credits };
}

console.log("\nScale N:M strategy selection — pure tests");

check("whole-batch sum resolves as INDEXED N:1 regardless of cluster size", () => {
  const p = part(
    [
      settlement("s1", 10000), settlement("s2", 25000), settlement("s3", 15000),
      ...Array.from({ length: 20 }, (_, i) => settlement(`s_extra_${i}`, 1000)),
    ],
    [bank("c1", 57000)],
  );
  // sum = 10000 + 25000 + 15000 + 20*1000 = 70000 ≠ 57000 ... use a matching credit instead.
  const total = 10000 + 25000 + 15000 + 20 * 1000;
  const p2 = part(p.settlements, [bank("c1", total)]);
  assert.equal(selectStrategy(p2, CONFIG), "INDEXED");
  const rel = resolvePartition(p2, CONFIG);
  assert.equal(rel.length, 1);
  assert.equal(rel[0]!.type, "N:1");
  assert.equal(rel[0]!.differencePaise, 0);
  assert.equal(rel[0]!.confidenceScore, 96);
  assert.equal(rel[0]!.reasonCode, "EXACT_MANY_TO_ONE_AGGREGATION");
  assert.deepEqual(rel[0]!.bankTxnIds, ["c1"]);
});

check("single settlement + single credit with shared UTR resolves as INDEXED 1:1", () => {
  const p = part([settlement("s1", 10000, "UTR_A")], [bank("c1", 10000, "UTR_A")]);
  assert.equal(selectStrategy(p, CONFIG), "INDEXED");
  const rel = resolvePartition(p, CONFIG);
  assert.equal(rel.length, 1);
  assert.equal(rel[0]!.type, "1:1");
  assert.deepEqual(rel[0]!.settlementIds, ["s1"]);
  assert.deepEqual(rel[0]!.bankTxnIds, ["c1"]);
});

check("a tiny cluster whose sum does not match falls back to BOUNDED", () => {
  // sum = 50000, credit = 40000 → not INDEXED; 4 items ≤ 12 → BOUNDED.
  const p = part(
    [settlement("s1", 10000), settlement("s2", 25000), settlement("s3", 15000)],
    [bank("c1", 40000)],
  );
  assert.equal(selectStrategy(p, CONFIG), "BOUNDED");
  const rel = resolvePartition(p, CONFIG);
  assert.equal(rel.length, 1);
  assert.equal(rel[0]!.type, "N:1");
  assert.equal(rel[0]!.settlementAmount, 40000);
  assert.equal(rel[0]!.differencePaise, 0);
});

check("bounded fallback reuses the existing solver semantics (exact N:M)", () => {
  const p = part(
    [settlement("s1", 30000), settlement("s2", 20000)],
    [bank("c1", 25000), bank("c2", 25000)],
  );
  assert.equal(selectStrategy(p, CONFIG), "BOUNDED");
  const rel = resolvePartition(p, CONFIG);
  assert.equal(rel.length, 1);
  assert.equal(rel[0]!.type, "N:M");
  assert.equal(rel[0]!.settlementAmount, 50000);
  assert.equal(rel[0]!.differencePaise, 0);
});

check("a large unresolvable cluster routes to REVIEW (no fabricated link, no throw)", () => {
  const p = part(
    Array.from({ length: 15 }, (_, i) => settlement(`s${i}`, 10000 + i)),
    [bank("c1", 123456)],
  );
  assert.equal(selectStrategy(p, CONFIG), "AMBIGUOUS");
  const rel = resolvePartition(p, CONFIG);
  assert.deepEqual(rel, [], "no relationship may be fabricated for an ambiguous cluster");
});

check("an INDEXED partition is not routed to the combinatorial solver", () => {
  const total = 10000 + 25000;
  const p = part([settlement("s1", 10000), settlement("s2", 25000)], [bank("c1", total)]);
  assert.equal(selectStrategy(p, CONFIG), "INDEXED");
  // Even though it is tiny, INDEXED wins over BOUNDED.
  const rel = resolvePartition(p, CONFIG);
  assert.equal(rel[0]!.reasonCode, "EXACT_MANY_TO_ONE_AGGREGATION");
});

console.log(`\nstrategy: ${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
