/*
 * Scalable cardinality — durable / resumable execution (DB tests, isolated temp SQLite).
 *
 * Proves requirements 5–9 against real rows:
 *   - createScaleRun + partitions; duplicate submit is idempotent (no-op, no dup rows);
 *   - claimNextPartition transitions PENDING → RUNNING with attempt++;
 *   - failPartition applies exponential backoff (nextRetryAt grows);
 *   - a partition is not claimed again until its backoff elapses;
 *   - exceeding maxRetries → DEAD_LETTER;
 *   - safe duplicate retry: re-completing an already-COMPLETED partition is a no-op
 *     (idempotencyKey unique; matchedCount not double-counted);
 *   - resume: claimNextPartition skips COMPLETED partitions;
 *   - progressPct / checkpoint advance after each completion.
 *
 * The prisma client and engine are imported dynamically (after DATABASE_URL is set) because
 * @/lib/db reads the env at module-evaluation time. Teardown removes the temp DB.
 */

import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "@prisma/client";
import { SCALE_CONFIG } from "./buckets";

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

const tmpDir = mkdtempSync(path.join(tmpdir(), "sm-scale-durable-"));
const dbPath = path.join(tmpDir, "durable.db");
const dbUrl = `file:${dbPath.replace(/\\/g, "/")}`;
process.env.DATABASE_URL = dbUrl;

let prisma: PrismaClient | undefined;

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
    const durable = await import("./durable");
    const p = prisma;

    const batch = await p.batch.create({
      data: { name: "durable", size: 4, status: "CREATED", source: "GENERATED" },
    });

    const partitions = [
      { partitionId: "p-0-0", bucketKey: "0", settlementIds: ["s1"], creditIds: ["c1"] },
      { partitionId: "p-1-0", bucketKey: "1", settlementIds: ["s2", "s3"], creditIds: ["c2"] },
      { partitionId: "p-2-0", bucketKey: "2", settlementIds: ["s4"], creditIds: [] },
    ];

    console.log("\nScale durable / resumable execution — DB tests");

    let scaleRunId = "";

    await check("createScaleRun creates a run + one partition row per cluster", async () => {
      const created = await durable.createScaleRun({
        batchId: batch.id,
        runId: "run-1",
        partitions,
      });
      scaleRunId = created.scaleRunId;
      assert.equal(created.created, true);
      const run = await p.scaleRun.findUnique({ where: { id: scaleRunId } });
      assert.equal(run?.status, "RUNNING");
      assert.equal(run?.totalPartitions, 3);
      const rows = await p.scalePartition.findMany({ where: { scaleRunId } });
      assert.equal(rows.length, 3);
      for (const row of rows) assert.equal(row.status, "PENDING");
    });

    await check("duplicate submit with the same runId is a no-op (idempotency)", async () => {
      const dup = await durable.createScaleRun({ batchId: batch.id, runId: "run-1", partitions });
      assert.equal(dup.scaleRunId, scaleRunId);
      assert.equal(dup.created, false);
      const rows = await p.scalePartition.count({ where: { scaleRunId } });
      assert.equal(rows, 3, "no duplicate partition rows");
    });

    await check("claimNextPartition transitions PENDING → RUNNING with attempt++", async () => {
      const claimed = await durable.claimNextPartition(scaleRunId);
      assert.ok(claimed);
      assert.equal(claimed.partitionId, "p-0-0");
      assert.equal(claimed.attempt, 1);
      const row = await p.scalePartition.findUnique({
        where: { scaleRunId_partitionId: { scaleRunId, partitionId: "p-0-0" } },
      });
      assert.equal(row?.status, "RUNNING");
      assert.equal(row?.attempt, 1);
    });

    await check("completePartition advances progressPct and checkpoint", async () => {
      await durable.completePartition({
        scaleRunId,
        partitionId: "p-0-0",
        matchedCount: 2,
        bucket: "indexed",
      });
      const run = await p.scaleRun.findUnique({ where: { id: scaleRunId } });
      assert.equal(run?.completedPartitions, 1);
      assert.equal(run?.progressPct, Math.round((1 / 3) * 100));
      const cp = JSON.parse(run?.checkpoint ?? "{}") as { completed: string[]; indexed: number };
      assert.deepEqual(cp.completed, ["p-0-0"]);
      assert.equal(cp.indexed, 1);
    });

    await check("safe duplicate retry: re-completing a COMPLETED partition is a no-op", async () => {
      await durable.completePartition({
        scaleRunId,
        partitionId: "p-0-0",
        matchedCount: 2,
        bucket: "indexed",
      });
      const run = await p.scaleRun.findUnique({ where: { id: scaleRunId } });
      assert.equal(run?.completedPartitions, 1, "not double-counted");
      const cp = JSON.parse(run?.checkpoint ?? "{}") as { completed: string[]; indexed: number };
      assert.equal(cp.completed.filter((x) => x === "p-0-0").length, 1);
      assert.equal(cp.indexed, 1, "bucket not double-incremented");
      const rows = await p.scalePartition.count({ where: { scaleRunId, partitionId: "p-0-0" } });
      assert.equal(rows, 1, "no duplicate partition row");
    });

    await check("claimNextPartition skips COMPLETED partitions (resume)", async () => {
      const next = await durable.claimNextPartition(scaleRunId);
      assert.equal(next?.partitionId, "p-1-0", "skips p-0-0");
    });

    await check("failPartition applies exponential backoff and grows nextRetryAt", async () => {
      const now = 1_000_000;
      const first = await durable.failPartition(scaleRunId, "p-1-0", "boom", now);
      assert.equal(first.deadLettered, false);
      const row = await p.scalePartition.findUnique({
        where: { scaleRunId_partitionId: { scaleRunId, partitionId: "p-1-0" } },
      });
      assert.equal(row?.retryCount, 1);
      const expectedDelay = SCALE_CONFIG.backoffBaseMs * Math.pow(SCALE_CONFIG.backoffFactor, 0);
      assert.equal(row?.nextRetryAt?.getTime(), now + expectedDelay);

      await durable.failPartition(scaleRunId, "p-1-0", "boom", now + 1);
      const row2 = await p.scalePartition.findUnique({
        where: { scaleRunId_partitionId: { scaleRunId, partitionId: "p-1-0" } },
      });
      assert.equal(row2?.retryCount, 2);
      const expectedDelay2 = SCALE_CONFIG.backoffBaseMs * Math.pow(SCALE_CONFIG.backoffFactor, 1);
      assert.equal(row2?.nextRetryAt?.getTime(), now + 1 + expectedDelay2);
    });

    await check("a partition is not claimed again until its backoff elapses", async () => {
      const early = await durable.claimNextPartition(scaleRunId, 1_000_000);
      assert.notEqual(early?.partitionId, "p-1-0", "backoff not yet elapsed");
      const late = await durable.claimNextPartition(
        scaleRunId,
        1_000_000 + SCALE_CONFIG.backoffBaseMs * Math.pow(SCALE_CONFIG.backoffFactor, 1) + 10,
      );
      assert.equal(late?.partitionId, "p-1-0", "claimed after backoff elapsed");
    });

    await check("exceeding maxRetries dead-letters the partition", async () => {
      const otherRun = await durable.createScaleRun({
        batchId: batch.id,
        runId: "run-dead",
        partitions: [{ partitionId: "p-x", bucketKey: "9", settlementIds: [], creditIds: [] }],
      });
      let deadLettered = false;
      for (let i = 0; i < SCALE_CONFIG.maxRetries; i++) {
        const r = await durable.failPartition(otherRun.scaleRunId, "p-x", "fatal", 2_000_000 + i);
        deadLettered = r.deadLettered;
      }
      assert.equal(deadLettered, true);
      const row = await p.scalePartition.findUnique({
        where: { scaleRunId_partitionId: { scaleRunId: otherRun.scaleRunId, partitionId: "p-x" } },
      });
      assert.equal(row?.status, "DEAD_LETTER");
      assert.equal(row?.nextRetryAt, null);
    });

    console.log(`\nscale-durable: ${passed} passed, ${failed} failed`);
  } catch (err) {
    failed++;
    console.error("Scale durable test harness crashed:", err);
  } finally {
    if (prisma) await prisma.$disconnect().catch(() => undefined);
    rmSync(tmpDir, { recursive: true, force: true });
    process.exitCode = failed > 0 ? 1 : 0;
    console.log(`\nscale-durable: final ${failed > 0 ? "FAILURE" : "ALL PASSED"}`);
  }
}

void main();
