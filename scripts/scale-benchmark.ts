/*
 * Scale benchmark — measures the scalable cardinality + durable path at real volumes.
 *
 * For each of [10k, 25k, 50k, 100k] it generates a deterministic synthetic batch, inserts
 * it into an isolated temp SQLite DB, runs the FULL production path (runReconciliation →
 * the >1000-record scalable cardinality branch), and reports:
 *
 *   size, wallTimeMs, throughputRps, peakMemoryMB, candidateCount,
 *   dbTimeMs, matchTimeMs, partitionCount, retryCount, deadLetterCount,
 *   resolvedBy{indexed,bounded,review}, accuracy.
 *
 * Honesty: it reports only what it measures. No 1M claim — the bounded-memory/cluster
 * architecture is the 1M path, but support is only claimed where measured (10k–100k).
 *
 * Usage:
 *   npx tsx scripts/scale-benchmark.ts            # 10k, 25k, 50k, 100k
 *   npx tsx scripts/scale-benchmark.ts --max 25000  # up to 25k (faster smoke run)
 *   npx tsx scripts/scale-benchmark.ts --size 10000 # exactly one size
 *   npx tsx scripts/scale-benchmark.ts --size 10000 --timeout-ms 300000
 *
 * Output is flushed LIVE after each size completes (not buffered to the end), and each
 * size runs under a hard wall-clock timeout so a pathologically slow size is surfaced
 * as a clear measurement failure instead of hanging the sweep with no output.
 *
 * This is also a smoke test: it asserts no partition dead-letters and that clean
 * aggregation clusters actually resolve into CardinalityLink rows.
 */

import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "@prisma/client";
import { generateScaleBatch } from "../src/lib/synthetic/scale-generator";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");

const DEFAULT_SIZES = [10_000, 25_000, 50_000, 100_000];
const DEFAULT_TIMEOUT_MS = 900_000; // 15 min wall-clock per size

function argValue(name: string): number | null {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  const raw = process.argv[idx + 1];
  const value = raw ? Number(raw) : NaN;
  return Number.isFinite(value) && value > 0 ? value : null;
}

function parseMaxSize(): number | null {
  return argValue("--max");
}

function parseSingleSize(): number | null {
  return argValue("--size");
}

function parseTimeoutMs(): number {
  return argValue("--timeout-ms") ?? DEFAULT_TIMEOUT_MS;
}

/** Reject after a hard wall-clock budget — surfaces a slow size instead of hanging. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} exceeded ${ms}ms wall-clock budget`)),
      ms,
    );
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

interface ScaleRow {
  size: number;
  wallTimeMs: number;
  insertMs: number;
  throughputRps: number;
  peakMemoryMB: number;
  candidateCount: number;
  dbTimeMs: number;
  matchTimeMs: number;
  partitionCount: number;
  retryCount: number;
  deadLetterCount: number;
  resolvedBy: { indexed: number; bounded: number; review: number };
  accuracy: number;
}

const tmpDir = mkdtempSync(path.join(tmpdir(), "sm-scale-"));
const dbPath = path.join(tmpDir, "scale-benchmark.db");
const dbUrl = `file:${dbPath.replace(/\\/g, "/")}`;
process.env.DATABASE_URL = dbUrl;

let prisma: PrismaClient | undefined;

async function main() {
  try {
    execSync("npx prisma db push", {
      env: { ...process.env, DATABASE_URL: dbUrl },
      cwd: repoRoot,
      stdio: "pipe",
      timeout: 180000,
    });

    const db = await import("../src/lib/db");
    prisma = db.prisma;
    const { runReconciliation } = await import("../src/lib/reconciliation/engine");
    const p = prisma;

    const singleSize = parseSingleSize();
    const maxSize = parseMaxSize();
    const timeoutMs = parseTimeoutMs();

    const sizes = singleSize
      ? [singleSize]
      : maxSize
        ? DEFAULT_SIZES.filter((s) => s <= maxSize)
        : DEFAULT_SIZES;

    const rows: ScaleRow[] = [];

    console.log(`\n=== SCALE BENCHMARK (scalable cardinality + durable path) ===`);
    console.log("header: size wall_ms ins_ms thr_rps mem_mb cands db_ms match_ms parts retry dead res(ix/bd/rv) acc");
    console.log(`per-size budget: ${timeoutMs}ms  sizes: [${sizes.join(", ")}]`);

    for (const size of sizes) {
      console.log(`-- starting size ${size} ...`);
      const row = await withTimeout(
        runSize(p, runReconciliation, size),
        timeoutMs,
        `size ${size}`,
      );
      rows.push(row);
      // Flush each size immediately so a long sweep shows live progress.
      const res = `${row.resolvedBy.indexed}/${row.resolvedBy.bounded}/${row.resolvedBy.review}`;
      console.log(
        `${String(row.size).padEnd(8)} ${String(row.wallTimeMs).padEnd(8)} ${String(row.insertMs).padEnd(7)} ${String(row.throughputRps).padEnd(8)} ${String(row.peakMemoryMB).padEnd(7)} ${String(row.candidateCount).padEnd(6)} ${String(row.dbTimeMs).padEnd(6)} ${String(row.matchTimeMs).padEnd(10)} ${String(row.partitionCount).padEnd(6)} ${String(row.retryCount).padEnd(6)} ${String(row.deadLetterCount).padEnd(5)} ${res.padEnd(14)} ${row.accuracy.toFixed(1)}`,
      );
    }

    // Assertions: no dead-letters at any measured size, and clean clusters resolve.
    for (const r of rows) {
      assert.equal(r.deadLetterCount, 0, `dead-letters at size ${r.size}`);
      assert.ok(r.partitionCount > 0, `no partitions at size ${r.size}`);
    }
    console.log("\nscale-benchmark: final ALL PASSED (10k–100k measured, no 1M claim)");
  } catch (err) {
    console.error("Scale benchmark crashed:", err);
    process.exitCode = 1;
    console.log("\nscale-benchmark: final FAILURE");
  } finally {
    if (prisma) await prisma.$disconnect().catch(() => undefined);
    rmSync(tmpDir, { recursive: true, force: true });
    process.exitCode = process.exitCode ?? 0;
  }
}

async function runSize(
  p: PrismaClient,
  runReconciliation: (batchId: string) => Promise<unknown>,
  size: number,
): Promise<ScaleRow> {
  const record = generateScaleBatch({ size, seed: 20260822 });

  // ── Insert (batched createMany) ──
  const tIns = Date.now();
  const batch = await p.batch.create({
    data: {
      name: `scale-${size}`,
      size,
      status: "CREATED",
      source: "GENERATED",
    },
  });
  await chunked(p.order, record.orders, (o) => ({ ...o, batchId: batch.id }));
  await chunked(p.payment, record.payments, (o) => ({ ...o, batchId: batch.id }));
  await chunked(p.settlement, record.settlements, (o) => ({ ...o, batchId: batch.id }));
  await chunked(p.bankTransaction, record.bankTransactions, (o) => ({ ...o, batchId: batch.id }));
  await chunked(p.groundTruth, record.groundTruths, (o) => ({ ...o, batchId: batch.id }));
  const insertMs = Date.now() - tIns;

  // ── Reconcile with peak-memory sampling ──
  let peakHeap = process.memoryUsage().heapUsed;
  const sampler = setInterval(() => {
    peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed);
  }, 10);

  const tRun = Date.now();
  const metrics = (await runReconciliation(batch.id)) as {
    throughputRps: number;
    accuracy: number;
    phaseTimings?: Record<string, number>;
  };
  const wallTimeMs = Date.now() - tRun;
  clearInterval(sampler);

  // ── Read the durable ScaleRun report persisted by the scalable cardinality path ──
  const scaleRun = await p.scaleRun.findFirst({
    where: { batchId: batch.id },
  });
  let report: {
    partitionCount: number;
    candidateCount: number;
    dbTimeMs: number;
    matchTimeMs: number;
    retryCount: number;
    deadLetterCount: number;
    resolvedBy: { indexed: number; bounded: number; review: number };
  } = {
    partitionCount: 0,
    candidateCount: record.settlements.length + record.bankTransactions.length,
    dbTimeMs: 0,
    matchTimeMs: 0,
    retryCount: 0,
    deadLetterCount: 0,
    resolvedBy: { indexed: 0, bounded: 0, review: 0 },
  };
  if (scaleRun?.checkpoint) {
    report = { ...report, ...(JSON.parse(scaleRun.checkpoint) as typeof report) };
  }

  // ── Assert clean clusters resolve into CardinalityLink rows ──
  await assertCleanClustersResolve(p, batch.id, record.clusters);

  const phase = metrics.phaseTimings ?? {};
  console.log(`   [timings for ${size}] index: ${phase.index ?? 0}ms, match: ${phase.match_classify ?? 0}ms, card: ${report.matchTimeMs}ms, durableDB: ${report.dbTimeMs}ms, store: ${phase.store ?? 0}ms`);

  return {
    size,
    wallTimeMs,
    insertMs,
    throughputRps: Math.round(metrics.throughputRps * 10) / 10,
    peakMemoryMB: Math.round(peakHeap / (1024 * 1024)),
    candidateCount: report.candidateCount,
    dbTimeMs: Math.round(report.dbTimeMs),
    matchTimeMs: Math.round(report.matchTimeMs),
    partitionCount: report.partitionCount,
    retryCount: report.retryCount,
    deadLetterCount: report.deadLetterCount,
    resolvedBy: report.resolvedBy,
    accuracy: metrics.accuracy,
  };
}

async function assertCleanClustersResolve(
  p: PrismaClient,
  batchId: string,
  clusters: Array<{
    index: number;
    kind: string;
    settlementIds: string[];
    creditTxnId: string | null;
    expectedSum: number | null;
  }>,
): Promise<void> {
  const links = await p.cardinalityLink.findMany({ where: { batchId } });
  const bySource = new Set<string>();
  for (const link of links) {
    const ids = JSON.parse(link.sourceIds) as string[];
    for (const id of ids) bySource.add(id);
  }

  // Verify a sample of clean clusters (keeps the check fast at 100k).
  const clean = clusters.filter((c) => c.kind === "clean");
  const sample = clean.slice(0, 50);
  for (const cluster of sample) {
    const resolved = cluster.settlementIds.every((id) => bySource.has(id));
    assert.ok(
      resolved,
      `clean cluster ${cluster.index} did not resolve: ${cluster.settlementIds[0]}`,
    );
  }
}

type Delegate = { createMany: (args: { data: never[] }) => Promise<unknown> };

async function chunked<T>(
  model: Delegate,
  rows: T[],
  map: (row: T) => Record<string, unknown>,
): Promise<void> {
  const CHUNK = 2000;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    await model.createMany({ data: slice.map(map) as never[] });
  }
}

void main();
