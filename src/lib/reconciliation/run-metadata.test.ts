/*
 * Run metadata / replay — pure unit tests.
 *
 * Proves: version capture (all 8 layers), deterministic input + outcome fingerprints (outcome
 * excludes timing), replay identity, changed-version detection, and deterministic reproduction
 * through the real pure pipeline. No DB, no I/O.
 */

import assert from "node:assert/strict";
import {
  buildInputFingerprint,
  buildOutcomeFingerprint,
  runIdentity,
  verifyReplay,
} from "./run-metadata";
import { PIPELINE_VERSIONS } from "./versions";
import { buildIndexes } from "./indexer";
import { matchAllRecords } from "./matcher";
import { evaluateResults } from "./evaluator";
import type { BatchData, MatchResult } from "./types";

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

console.log("\nRun metadata / replay — pure version + fingerprint tests");

const BASE = new Date("2025-01-01T00:00:00Z");

function sampleData(): BatchData {
  return {
    orders: [
      { dbId: "o1", orderId: "order_1", amount: 100000, status: "captured", createdAt: BASE },
    ],
    payments: [
      {
        dbId: "p1", paymentId: "pay_1", orderId: "order_1", amount: 100000,
        fee: 0, tax: 0, method: "upi", status: "captured", capturedAt: BASE, createdAt: BASE,
      },
    ],
    settlements: [
      {
        dbId: "s1", settlementId: "setl_1", paymentId: "pay_1", amount: 100000,
        fee: 0, tax: 0, utr: "UTR_1", status: "settled", settledAt: BASE, createdAt: BASE,
      },
    ],
    bankTransactions: [
      {
        dbId: "b1", txnId: "txn_1", utr: "UTR_1", amount: 100000, type: "CREDIT",
        narration: "RAZORPAY SETTLEMENT", txnDate: new Date("2025-01-01T02:00:00Z"), matched: false,
      },
    ],
    refunds: [],
    chargebacks: [],
    groundTruths: [{ paymentId: "pay_1", expectedLabel: "AUTO_MATCHED", scenario: "clean" }],
  };
}

// ── Version capture ──
check("PIPELINE_VERSIONS captures all 8 required layers", () => {
  const keys = Object.keys(PIPELINE_VERSIONS).sort();
  assert.deepEqual(keys, [
    "cardinality",
    "engine",
    "matcher",
    "model",
    "normalizer",
    "policy",
    "providerSchema",
    "ruleset",
  ]);
});

check("an identical version set is replayable", () => {
  const v = verifyReplay(PIPELINE_VERSIONS, PIPELINE_VERSIONS);
  assert.equal(v.replayable, true);
  assert.deepEqual(v.changedLayers, []);
});

// ── Input fingerprint ──
check("identical input → identical inputFingerprint", () => {
  assert.equal(buildInputFingerprint(sampleData()), buildInputFingerprint(sampleData()));
});

check("a changed input field → different inputFingerprint", () => {
  const changed = sampleData();
  changed.payments[0] = { ...changed.payments[0], amount: 200000 };
  assert.notEqual(buildInputFingerprint(sampleData()), buildInputFingerprint(changed));
});

check("inputFingerprint includes Dates and arrays deterministically", () => {
  const a = sampleData();
  const b = sampleData();
  assert.equal(buildInputFingerprint(a), buildInputFingerprint(b));
  assert.ok(buildInputFingerprint(a).length === 64, "sha256 hex is 64 chars");
});

// ── Outcome fingerprint ──
function runPipeline(data: BatchData): { results: MatchResult[]; metrics: ReturnType<typeof evaluateResults> } {
  const indexes = buildIndexes(data);
  const results = matchAllRecords(data, indexes);
  const metrics = evaluateResults(results, data, {}, 100);
  return { results, metrics };
}

check("identical run → identical outcomeFingerprint (deterministic reproduction)", () => {
  const r1 = runPipeline(sampleData());
  const r2 = runPipeline(sampleData());
  assert.equal(
    buildOutcomeFingerprint(r1.results, r1.metrics),
    buildOutcomeFingerprint(r2.results, r2.metrics),
  );
});

check("outcomeFingerprint excludes wall-clock timing", () => {
  const { results, metrics } = runPipeline(sampleData());
  const timed = {
    ...metrics,
    processingTimeMs: 99999,
    throughputRps: 1234.5,
    phaseTimings: { normalize: 9999, match: 8888, evaluate: 7777 },
  };
  assert.equal(buildOutcomeFingerprint(results, metrics), buildOutcomeFingerprint(results, timed));
});

check("a real outcome change → different outcomeFingerprint", () => {
  const { results, metrics } = runPipeline(sampleData());
  const altered = results.map((r, i) =>
    i === 0 ? { ...r, status: "AMOUNT_MISMATCH", mismatchAmount: 500 } : r,
  );
  assert.notEqual(
    buildOutcomeFingerprint(results, metrics),
    buildOutcomeFingerprint(altered, metrics),
  );
});

// ── Replay identity ──
check("same input fingerprint + same versions → same replay identity", () => {
  const fp = buildInputFingerprint(sampleData());
  assert.equal(runIdentity(fp, PIPELINE_VERSIONS), runIdentity(fp, PIPELINE_VERSIONS));
});

check("a changed version → different replay identity", () => {
  const fp = buildInputFingerprint(sampleData());
  const bumped = { ...PIPELINE_VERSIONS, matcher: "1.1" };
  assert.notEqual(runIdentity(fp, PIPELINE_VERSIONS), runIdentity(fp, bumped));
});

// ── Changed version detection ──
check("verifyReplay flags a changed matcher version", () => {
  const stored = { ...PIPELINE_VERSIONS, matcher: "0.9" };
  const v = verifyReplay(stored, PIPELINE_VERSIONS);
  assert.equal(v.replayable, false);
  assert.deepEqual(v.changedLayers, ["matcher"]);
});

check("verifyReplay flags multiple changed layers", () => {
  const stored = { ...PIPELINE_VERSIONS, matcher: "0.9", cardinality: "0.8", policy: "0.7" };
  const v = verifyReplay(stored, PIPELINE_VERSIONS);
  assert.equal(v.replayable, false);
  assert.deepEqual(v.changedLayers.sort(), ["cardinality", "matcher", "policy"]);
});

console.log(`\nrun-metadata: ${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
