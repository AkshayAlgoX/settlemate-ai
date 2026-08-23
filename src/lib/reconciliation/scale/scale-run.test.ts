/*
 * Scalable cardinality — orchestrator equivalence + report (DB tests, isolated temp SQLite).
 *
 * Proves that runScalableCardinality produces the SAME CardinalityMatch[] as the existing
 * small-path applyCardinalityMatching for identical clean N:1 inputs (so switching a batch
 * over the threshold to the scalable engine is semantics-preserving), that its ScaleReport
 * carries the measured shape, and that re-invoking it is deterministic (idempotent resume —
 * same runId → same partitions, no duplicate relationships).
 */

import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "@prisma/client";
import type {
  BatchData,
  MatchResult,
  NormalizedBankTxn,
  NormalizedSettlement,
} from "../types";
import type { CardinalityMatch } from "../cardinality";

let passed = 0;
let failed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name} — ${(err as Error).message}`);
  }
}

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..", "..");

const tmpDir = mkdtempSync(path.join(tmpdir(), "sm-scale-run-"));
const dbPath = path.join(tmpDir, "scale-run.db");
const dbUrl = `file:${dbPath.replace(/\\/g, "/")}`;
process.env.DATABASE_URL = dbUrl;

let prisma: PrismaClient | undefined;

const BASE = new Date("2025-01-01T00:00:00Z");

function makeSettlement(id: string, amount: number): NormalizedSettlement {
  return {
    dbId: `db_${id}`, settlementId: id, paymentId: `pay_${id}`, amount,
    fee: 0, tax: 0, utr: null, status: "settled", settledAt: BASE, createdAt: BASE,
  };
}

function makeBank(id: string, amount: number): NormalizedBankTxn {
  return {
    dbId: `db_${id}`, txnId: id, utr: null, amount, type: "CREDIT",
    narration: "RAZORPAY BULK SETTLEMENT BATCH", txnDate: BASE, matched: false,
  };
}

function makeResult(settlementId: string, amount: number): MatchResult {
  return {
    paymentId: `pay_${settlementId}`, orderId: `order_${settlementId}`,
    settlementIds: [], bankTxnIds: [], refundIds: [], chargebackIds: [],
    orderAmount: amount, paymentAmount: amount, paymentFee: 0, paymentTax: 0,
    refundAmount: 0, chargebackAmount: 0,
    expectedNetAmount: amount, actualSettledAmount: null, bankCreditedAmount: null,
    mismatchAmount: null, status: "UNMATCHED", confidenceScore: 0,
    matchMethod: "", matchDetails: "",
    cardinalityType: "1:1", cardinalityReason: null, relationshipScore: null,
  };
}

function makeBatchData(
  settlements: NormalizedSettlement[],
  bankTransactions: NormalizedBankTxn[],
): BatchData {
  const payments = settlements.map((s) => ({
    dbId: s.dbId, paymentId: s.paymentId, orderId: `order_${s.settlementId}`,
    amount: s.amount, fee: 0, tax: 0, method: "upi", status: "captured",
    capturedAt: BASE, createdAt: BASE,
  }));
  const orders = payments.map((p) => ({
    dbId: p.dbId, orderId: p.orderId, amount: p.amount, status: "captured",
    createdAt: BASE,
  }));
  return {
    orders,
    payments,
    settlements,
    bankTransactions,
    refunds: [],
    chargebacks: [],
    groundTruths: [],
  };
}

function relKey(rel: CardinalityMatch): string {
  return JSON.stringify({
    settlementIds: [...rel.settlementIds].sort(),
    bankTxnIds: [...rel.bankTxnIds].sort(),
    bankAmount: rel.bankAmount,
    type: rel.type,
    reasonCode: rel.reasonCode,
    differencePaise: rel.differencePaise,
    confidenceScore: rel.confidenceScore,
  });
}

async function main() {
  try {
    execSync("npx prisma db push", {
      env: { ...process.env, DATABASE_URL: dbUrl },
      cwd: repoRoot,
      stdio: "pipe",
      timeout: 120000,
    });

    const db = await import("../../../lib/db");
    prisma = db.prisma;
    const { applyCardinalityMatching } = await import("../apply-cardinality");
    const { runScalableCardinality } = await import("./scale-run");
    const p = prisma;

    console.log("\nScale-run orchestrator — equivalence + report (DB tests)");

    const batch = await p.batch.create({
      data: { name: "scale-run-equiv", size: 3, status: "CREATED", source: "GENERATED" },
    });

    // Clean N:1: three settlements sum exactly to one bulk credit.
    const s1 = makeSettlement("setl_1", 10_000);
    const s2 = makeSettlement("setl_2", 25_000);
    const s3 = makeSettlement("setl_3", 15_000);
    const settlements = [s1, s2, s3];
    const credit = makeBank("txn_bulk", 50_000);
    const bankTransactions = [credit];
    const data = makeBatchData(settlements, bankTransactions);

    const results: MatchResult[] = settlements.map((s) => makeResult(s.settlementId, s.amount));

    let smallRelationships: CardinalityMatch[] = [];
    let scaleRelationships: CardinalityMatch[] = [];
    let scaleReport: Awaited<ReturnType<typeof runScalableCardinality>>["report"];

    await check("small path and scalable path resolve the same clean N:1", async () => {
      // Small path: no batchId/runId and 3 records (< scalableMinRecords) → existing passes.
      const small = await applyCardinalityMatching(results, data);
      smallRelationships = small.relationships;
      assert.equal(smallRelationships.length, 1, "small path resolves one N:1");
      assert.equal(smallRelationships[0]!.type, "N:1");

      // Scalable path: same settlements + credits through the partition-aware engine.
      const scale = await runScalableCardinality({
        batchId: batch.id,
        runId: "equiv-run",
        settlements,
        credits: bankTransactions,
      });
      scaleRelationships = scale.relationships;
      scaleReport = scale.report;

      assert.equal(scaleRelationships.length, 1, "scalable path resolves one relationship");
      assert.equal(relKey(scaleRelationships[0]!), relKey(smallRelationships[0]!),
        "scalable CardinalityMatch is byte-equivalent to the small path");
    });

    await check("report carries partition/candidate/resolvedBy/retry metrics", async () => {
      assert.equal(scaleReport.partitionCount, 1);
      assert.equal(scaleReport.candidateCount, 4); // 3 settlements + 1 credit
      assert.equal(scaleReport.maxClusterSize, 4);
      assert.equal(scaleReport.resolvedBy.indexed, 1);
      assert.equal(scaleReport.deadLetterCount, 0);
      // matchedCount = distinct records consumed: 3 settlements + 1 credit = 4.
      assert.equal(scaleReport.totalMatched, 4);
      assert.ok(scaleReport.dbTimeMs >= 0);
      assert.ok(scaleReport.matchTimeMs >= 0);
      assert.ok(scaleReport.throughputRps >= 0);
    });

    await check("re-invoking with the same runId resumes (no duplicate work)", async () => {
      const again = await runScalableCardinality({
        batchId: batch.id,
        runId: "equiv-run",
        settlements,
        credits: bankTransactions,
      });
      // All partitions already COMPLETED → the durable layer skips them; nothing is
      // re-computed or re-emitted (safe duplicate retry), and no partitions are re-counted.
      assert.equal(again.report.partitionCount, scaleReport.partitionCount);
      assert.equal(again.relationships.length, 0, "completed run emits no new relationships");
      assert.equal(again.report.deadLetterCount, 0);
      assert.equal(again.report.resolvedBy.indexed, 0, "no partition re-executed");
    });

    await check("a fresh runId on the same input is deterministic (same relationship)", async () => {
      const fresh = await runScalableCardinality({
        batchId: batch.id,
        runId: "equiv-run-fresh",
        settlements,
        credits: bankTransactions,
      });
      assert.equal(fresh.relationships.length, 1);
      assert.equal(relKey(fresh.relationships[0]!), relKey(scaleRelationships[0]!));
      assert.equal(fresh.report.deadLetterCount, 0);
    });

    console.log(`\nscale-run: ${passed} passed, ${failed} failed`);
  } catch (err) {
    failed++;
    console.error("Scale-run test harness crashed:", err);
  } finally {
    if (prisma) await prisma.$disconnect().catch(() => undefined);
    rmSync(tmpDir, { recursive: true, force: true });
    process.exitCode = failed > 0 ? 1 : 0;
    console.log(`\nscale-run: final ${failed > 0 ? "FAILURE" : "ALL PASSED"}`);
  }
}

void main();
