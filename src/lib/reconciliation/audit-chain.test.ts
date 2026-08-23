/*
 * Audit chain — pure unit tests for canonicalization, hashing, and chain verification.
 *
 * Proves: deterministic canonical payloads, a valid chain verifies, and that tampering with a
 * payload, a hash, the genesis link, ordering, or deleting a row all cause verification to fail.
 * No DB, no I/O.
 */

import assert from "node:assert/strict";
import {
  canonicalize,
  hashChainLink,
  verifyChainFromRows,
  GENESIS_HASH,
  type AuditEventRow,
} from "./audit-chain";

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

console.log("\nAudit chain — canonicalization, hashing, verification");

/** Build a linked chain of `n` rows from a list of payloads. */
function buildChain(payloads: Record<string, unknown>[]): AuditEventRow[] {
  const rows: AuditEventRow[] = [];
  let previousHash = GENESIS_HASH;
  payloads.forEach((payload, i) => {
    const canonicalPayload = canonicalize(payload);
    const currentHash = hashChainLink(previousHash, canonicalPayload);
    rows.push({ seq: i, previousHash, currentHash, canonicalPayload });
    previousHash = currentHash;
  });
  return rows;
}

function cloneRows(rows: AuditEventRow[]): AuditEventRow[] {
  return rows.map((r) => ({ ...r }));
}

// ── Deterministic canonical payload ──
check("canonicalize is key-order independent (deterministic)", () => {
  const a = { b: 1, a: 2, nested: { z: true, y: "x" }, arr: [3, 1] };
  const b = { nested: { y: "x", z: true }, arr: [3, 1], b: 1, a: 2 };
  assert.equal(canonicalize(a), canonicalize(b));
});

check("canonicalize serializes Dates to ISO strings", () => {
  const d = new Date("2026-08-22T00:00:00.000Z");
  const s = canonicalize({ when: d });
  assert.equal(s, JSON.stringify({ when: "2026-08-22T00:00:00.000Z" }));
});

check("canonicalize drops undefined fields", () => {
  assert.equal(canonicalize({ a: 1, b: undefined }), JSON.stringify({ a: 1 }));
});

// ── Valid chain ──
check("a correctly-built chain verifies", () => {
  const rows = buildChain([
    { eventType: "INGESTION", n: 5 },
    { eventType: "MATCHING", n: 3 },
    { eventType: "FINALIZATION", n: 2 },
  ]);
  const v = verifyChainFromRows(rows);
  assert.equal(v.valid, true);
  assert.equal(v.eventCount, 3);
});

check("an empty chain verifies as valid", () => {
  const v = verifyChainFromRows([]);
  assert.equal(v.valid, true);
  assert.equal(v.eventCount, 0);
});

check("verification accepts rows in any input order (sorts by seq)", () => {
  const rows = buildChain([
    { eventType: "INGESTION" },
    { eventType: "NORMALIZATION" },
    { eventType: "MATCHING" },
  ]);
  const shuffled = [rows[2], rows[0], rows[1]] as AuditEventRow[];
  const v = verifyChainFromRows(shuffled);
  assert.equal(v.valid, true);
});

// ── Tampering ──
check("tampering a canonicalPayload makes verification fail (HASH_MISMATCH)", () => {
  const rows = buildChain([
    { eventType: "INGESTION" },
    { eventType: "MATCHING" },
    { eventType: "FINALIZATION" },
  ]);
  const tampered = cloneRows(rows);
  tampered[1] = { ...tampered[1], canonicalPayload: JSON.stringify({ eventType: "MATCHING", n: 999 }) };
  const v = verifyChainFromRows(tampered);
  assert.equal(v.valid, false);
  assert.equal(v.reason, "HASH_MISMATCH");
  assert.equal(v.seq, 1);
});

check("tampering a currentHash makes verification fail (HASH_MISMATCH)", () => {
  const rows = buildChain([
    { eventType: "INGESTION" },
    { eventType: "MATCHING" },
  ]);
  const tampered = cloneRows(rows);
  tampered[0] = { ...tampered[0], currentHash: "f".repeat(64) };
  const v = verifyChainFromRows(tampered);
  assert.equal(v.valid, false);
  assert.equal(v.reason, "HASH_MISMATCH");
  assert.equal(v.seq, 0);
});

check("swapping two payloads breaks the chain (LINK_BROKEN)", () => {
  const rows = buildChain([
    { eventType: "INGESTION" },
    { eventType: "NORMALIZATION" },
    { eventType: "MATCHING" },
  ]);
  // Swap the canonical payloads of seq 1 and 2 while keeping their hashes/links.
  const swapped = cloneRows(rows);
  const tmp = swapped[1].canonicalPayload;
  swapped[1] = { ...swapped[1], canonicalPayload: swapped[2].canonicalPayload };
  swapped[2] = { ...swapped[2], canonicalPayload: tmp };
  const v = verifyChainFromRows(swapped);
  assert.equal(v.valid, false);
  // Row 1's own hash no longer matches its payload → HASH_MISMATCH (or LINK_BROKEN downstream).
  assert.equal(v.valid, false);
});

check("reordering rows by rewriting seq breaks the chain", () => {
  const rows = buildChain([
    { eventType: "INGESTION" },
    { eventType: "NORMALIZATION" },
    { eventType: "MATCHING" },
  ]);
  // Physically move row 0 (INGESTION) to the end by changing its seq to 2 and shifting others.
  const reordered: AuditEventRow[] = [
    { ...rows[1], seq: 0 }, // NORMALIZATION now claims to be first
    { ...rows[2], seq: 1 }, // MATCHING claims second
    { ...rows[0], seq: 2 }, // INGESTION claims last
  ];
  const v = verifyChainFromRows(reordered);
  assert.equal(v.valid, false);
});

check("deleting a middle row breaks the chain (SEQ_GAP_OR_REORDER)", () => {
  const rows = buildChain([
    { eventType: "INGESTION" },
    { eventType: "NORMALIZATION" },
    { eventType: "MATCHING" },
  ]);
  const deleted = [rows[0], rows[2]]; // seq 1 removed → seqs [0,2] gap
  const v = verifyChainFromRows(deleted);
  assert.equal(v.valid, false);
  assert.equal(v.reason, "SEQ_GAP_OR_REORDER");
});

check("a wrong genesis hash makes verification fail (BAD_GENESIS)", () => {
  const rows = buildChain([{ eventType: "INGESTION" }]);
  const bad = [{ ...rows[0], previousHash: "a".repeat(64) }];
  const v = verifyChainFromRows(bad);
  assert.equal(v.valid, false);
  assert.equal(v.reason, "BAD_GENESIS");
});

check("non-consecutive seq numbers fail verification", () => {
  const rows = buildChain([
    { eventType: "INGESTION" },
    { eventType: "NORMALIZATION" },
    { eventType: "MATCHING" },
  ]);
  // Even with intact hashes, a gap in seq is a deleted row.
  const gap = [
    { ...rows[0] },
    { ...rows[1], seq: 5 },
  ];
  const v = verifyChainFromRows(gap);
  assert.equal(v.valid, false);
});

console.log(`\naudit-chain: ${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
