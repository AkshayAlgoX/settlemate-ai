/*
 * Scalable cardinality — deterministic, disjoint partitions (pure unit tests).
 *
 * Proves: identical inputs produce identical partitions in identical order; every record
 * lands in exactly one partition (disjointness); records in distinct date windows never
 * share a partition; unknown dates group together.
 * No DB, no I/O.
 */

import assert from "node:assert/strict";
import type { NormalizedBankTxn, NormalizedSettlement } from "../types";
import { partitionCandidates } from "./clusters";
import { SCALE_CONFIG } from "./buckets";

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
const W = SCALE_CONFIG.partitionWindowMs;

function settlement(id: string, amount: number, settledAt: Date | null = BASE): NormalizedSettlement {
  return {
    dbId: `db_${id}`, settlementId: id, paymentId: `pay_${id}`, amount,
    fee: 0, tax: 0, utr: null, status: "settled", settledAt, createdAt: BASE,
  };
}

function bank(id: string, amount: number, txnDate: Date = BASE): NormalizedBankTxn {
  return {
    dbId: `db_${id}`, txnId: id, utr: null, amount, type: "CREDIT",
    narration: "BULK", txnDate, matched: false,
  };
}

function ids(partition: { settlements: NormalizedSettlement[]; credits: NormalizedBankTxn[] }): string[] {
  return [
    ...partition.settlements.map((s) => s.settlementId),
    ...partition.credits.map((c) => c.txnId),
  ];
}

console.log("\nScale partitioning — pure tests");

check("identical inputs produce identical partitions in identical order", () => {
  const s = [settlement("s1", 10000), settlement("s2", 25000)];
  const c = [bank("c1", 35000)];
  const p1 = partitionCandidates(s, c, W);
  const p2 = partitionCandidates(s, c, W);
  assert.equal(p1.length, p2.length);
  assert.deepEqual(
    p1.map((p) => p.id),
    p2.map((p) => p.id),
  );
  assert.deepEqual(p1[0]?.settlements[0]?.settlementId, p2[0]?.settlements[0]?.settlementId);
  assert.ok(p1.length > 0);
});

check("records in the same date window share one partition", () => {
  const s = [settlement("s1", 10000), settlement("s2", 25000, new Date(BASE.getTime() + 1000))];
  const c = [bank("c1", 35000, new Date(BASE.getTime() + 2000))];
  const partitions = partitionCandidates(s, c, W);
  assert.equal(partitions.length, 1);
  assert.deepEqual(ids(partitions[0]!).sort(), ["c1", "s1", "s2"].sort());
});

check("records in distinct windows never share a partition (disjoint)", () => {
  const s1 = settlement("s1", 10000);
  const s2 = settlement("s2", 25000, new Date(BASE.getTime() + W * 2));
  const partitions = partitionCandidates([s1, s2], [], W);
  assert.equal(partitions.length, 2);
  const all = partitions.flatMap((p) => p.settlements.map((x) => x.settlementId));
  assert.deepEqual(all.sort(), ["s1", "s2"]);
  // No record appears twice.
  assert.equal(new Set(all).size, all.length);
});

check("every record lands in exactly one partition (disjointness over both sets)", () => {
  const s = [
    settlement("s1", 10000),
    settlement("s2", 25000, new Date(BASE.getTime() + W)),
  ];
  const c = [
    bank("c1", 35000),
    bank("c2", 50000, new Date(BASE.getTime() + W * 3)),
  ];
  const partitions = partitionCandidates(s, c, W);
  const seen = new Map<string, number>();
  for (const p of partitions) {
    for (const id of ids(p)) {
      seen.set(id, (seen.get(id) ?? 0) + 1);
    }
  }
  assert.deepEqual([...seen.values()], [1, 1, 1, 1]);
});

check("null / unknown settlement dates group together deterministically", () => {
  const s = [settlement("s1", 10000, null), settlement("s2", 20000, null)];
  const partitions = partitionCandidates(s, [], W);
  assert.equal(partitions.length, 1);
  assert.deepEqual(
    partitions[0]!.settlements.map((x) => x.settlementId).sort(),
    ["s1", "s2"],
  );
});

console.log(`\nclusters: ${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
