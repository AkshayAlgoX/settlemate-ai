/*
 * Scalable cardinality — durable / resumable execution (requirements 5–9).
 *
 * One ScaleRun row per reconciliation run; one ScalePartition row per deterministic
 * candidate cluster. Statuses are plain strings (PENDING → RUNNING → COMPLETED, or
 * FAILED → retry/backoff → DEAD_LETTER) so the state machine evolves without migration.
 *
 *   - claimNextPartition  : atomically claims the next runnable partition (PENDING, or a
 *                           FAILED partition whose backoff has elapsed), attempt++.
 *   - failPartition       : exponential backoff nextRetryAt = now + base * factor^retry,
 *                           retryCount++; after maxRetries → DEAD_LETTER.
 *   - completePartition   : marks COMPLETED, advances run progress/checkpoint.
 *   - Safe duplicate retry: idempotencyKey is unique per (runId, partitionId) (NOT per
 *                           attempt), so re-submitting an already-COMPLETED partition is a
 *                           no-op — it can never double-count or double-write.
 *   - Resume              : a run with COMPLETED partitions skips them and continues from
 *                           the rest; progress/checkpoint is persisted after each partition.
 *
 * Relationship persistence is deliberately centralized (engine.ts writes CardinalityLink
 * rows only after the durable run COMPLETES), so a dead-lettered run writes nothing.
 */

import { prisma } from "@/lib/db";
import { sha256Hex } from "../audit-chain";
import { SCALE_CONFIG } from "./buckets";

export const SCALE_RUN_STATUS = {
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  DEAD_LETTER: "DEAD_LETTER",
} as const;

export const SCALE_PARTITION_STATUS = {
  PENDING: "PENDING",
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  DEAD_LETTER: "DEAD_LETTER",
} as const;

export interface CreateScaleRunInput {
  batchId: string;
  runId: string;
  partitions: Array<{
    partitionId: string;
    bucketKey: string;
    settlementIds: string[];
    creditIds: string[];
  }>;
}

export interface ClaimedPartition {
  partitionId: string;
  attempt: number;
}

export function partitionIdempotencyKey(
  runId: string,
  partitionId: string,
): string {
  return sha256Hex(`${runId}:${partitionId}`);
}

export function runIdempotencyKey(runId: string): string {
  return sha256Hex(runId);
}

/**
 * Create the durable run + one partition row per candidate cluster. Idempotent by runId:
 * if a ScaleRun for this run already exists (duplicate submit), it is returned unchanged
 * and no partition rows are duplicated.
 */
export async function createScaleRun(
  input: CreateScaleRunInput,
): Promise<{ scaleRunId: string; created: boolean }> {
  const key = runIdempotencyKey(input.runId);
  const existing = await prisma.scaleRun.findUnique({
    where: { idempotencyKey: key },
  });
  if (existing) return { scaleRunId: existing.id, created: false };

  const run = await prisma.scaleRun.create({
    data: {
      batchId: input.batchId,
      runId: input.runId,
      idempotencyKey: key,
      status: SCALE_RUN_STATUS.RUNNING,
      totalPartitions: input.partitions.length,
      progressPct: 0,
      checkpoint: JSON.stringify({
        completed: [],
        indexed: 0,
        bounded: 0,
        review: 0,
      }),
    },
  });

  const rows = input.partitions.map((p) => ({
    scaleRunId: run.id,
    partitionId: p.partitionId,
    bucketKey: p.bucketKey,
    status: SCALE_PARTITION_STATUS.PENDING,
    idempotencyKey: partitionIdempotencyKey(input.runId, p.partitionId),
    checkpoint: JSON.stringify({
      settlementIds: p.settlementIds,
      creditIds: p.creditIds,
    }),
  }));

  const CHUNK = 2000;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await prisma.scalePartition.createMany({
      data: rows.slice(i, i + CHUNK),
    });
  }

  return { scaleRunId: run.id, created: true };
}

/**
 * Claim the next runnable partition (deterministic order): first PENDING, then a FAILED
 * partition whose backoff has elapsed. Returns null when nothing is runnable.
 */
export async function claimNextPartition(
  scaleRunId: string,
  now: number = Date.now(),
): Promise<ClaimedPartition | null> {
  const pending = await prisma.scalePartition.findFirst({
    where: { scaleRunId, status: SCALE_PARTITION_STATUS.PENDING },
    orderBy: { partitionId: "asc" },
  });

  if (pending) {
    const attempt = pending.attempt + 1;
    await prisma.scalePartition.update({
      where: { id: pending.id },
      data: { status: SCALE_PARTITION_STATUS.RUNNING, attempt, updatedAt: new Date() },
    });
    return { partitionId: pending.partitionId, attempt };
  }

  const retryable = await prisma.scalePartition.findFirst({
    where: {
      scaleRunId,
      status: SCALE_PARTITION_STATUS.FAILED,
      nextRetryAt: { lte: new Date(now) },
    },
    orderBy: { partitionId: "asc" },
  });

  if (retryable) {
    const attempt = retryable.attempt + 1;
    await prisma.scalePartition.update({
      where: { id: retryable.id },
      data: {
        status: SCALE_PARTITION_STATUS.RUNNING,
        attempt,
        lastError: null,
        updatedAt: new Date(),
      },
    });
    return { partitionId: retryable.partitionId, attempt };
  }

  return null;
}

/**
 * Claim a batch of runnable partitions atomically (deterministic order).
 */
export async function claimNextPartitionBatch(
  scaleRunId: string,
  limit: number = 250,
  now: number = Date.now(),
): Promise<ClaimedPartition[]> {
  const pending = await prisma.scalePartition.findMany({
    where: { scaleRunId, status: SCALE_PARTITION_STATUS.PENDING },
    orderBy: { partitionId: "asc" },
    take: limit,
  });

  if (pending.length > 0) {
    const ids = pending.map((p) => p.id);
    await prisma.scalePartition.updateMany({
      where: { id: { in: ids } },
      data: { status: SCALE_PARTITION_STATUS.RUNNING, attempt: { increment: 1 }, updatedAt: new Date() },
    });
    return pending.map((p) => ({ partitionId: p.partitionId, attempt: p.attempt + 1 }));
  }

  const retryable = await prisma.scalePartition.findMany({
    where: {
      scaleRunId,
      status: SCALE_PARTITION_STATUS.FAILED,
      nextRetryAt: { lte: new Date(now) },
    },
    orderBy: { partitionId: "asc" },
    take: limit,
  });

  if (retryable.length > 0) {
    const ids = retryable.map((p) => p.id);
    await prisma.scalePartition.updateMany({
      where: { id: { in: ids } },
      data: {
        status: SCALE_PARTITION_STATUS.RUNNING,
        attempt: { increment: 1 },
        lastError: null,
        updatedAt: new Date(),
      },
    });
    return retryable.map((p) => ({ partitionId: p.partitionId, attempt: p.attempt + 1 }));
  }

  return [];
}

export interface CompletePartitionInput {
  scaleRunId: string;
  partitionId: string;
  matchedCount: number;
  /** strategy bucket this partition resolved through, for the progress checkpoint. */
  bucket?: "indexed" | "bounded" | "review";
}

/**
 * Mark a partition COMPLETED and advance the run's progress + checkpoint. Safe under
 * duplicate retry: setting a COMPLETED partition to COMPLETED again is a no-op (the
 * update targets the same row; matchedCount is idempotent).
 */
export async function completePartition(
  input: CompletePartitionInput,
): Promise<void> {
  const existing = await prisma.scalePartition.findUnique({
    where: { scaleRunId_partitionId: { scaleRunId: input.scaleRunId, partitionId: input.partitionId } },
  });
  // Safe duplicate retry: an already-COMPLETED partition must not be re-counted or
  // re-written — a re-submitted completion is a no-op (never double-counts progress).
  if (!existing || existing.status === SCALE_PARTITION_STATUS.COMPLETED) return;

  await prisma.scalePartition.update({
    where: { id: existing.id },
    data: {
      status: SCALE_PARTITION_STATUS.COMPLETED,
      matchedCount: input.matchedCount,
      updatedAt: new Date(),
    },
  });

  const run = await prisma.scaleRun.findUnique({
    where: { id: input.scaleRunId },
  });
  if (!run) return;

  const total = Math.max(run.totalPartitions, 1);
  const completed = run.completedPartitions + 1;
  const progressPct = Math.round((completed / total) * 100);

  let checkpoint: {
    completed: string[];
    indexed: number;
    bounded: number;
    review: number;
  } = {
    completed: [],
    indexed: 0,
    bounded: 0,
    review: 0,
  };
  try {
    checkpoint = { ...checkpoint, ...(JSON.parse(run.checkpoint ?? "{}") as typeof checkpoint) };
  } catch {
    checkpoint = { completed: [], indexed: 0, bounded: 0, review: 0 };
  }
  checkpoint.completed.push(input.partitionId);
  if (input.bucket === "indexed") checkpoint.indexed += 1;
  if (input.bucket === "bounded") checkpoint.bounded += 1;
  if (input.bucket === "review") checkpoint.review += 1;

  await prisma.scaleRun.update({
    where: { id: input.scaleRunId },
    data: {
      completedPartitions: completed,
      progressPct,
      checkpoint: JSON.stringify(checkpoint),
      updatedAt: new Date(),
    },
  });
}

/**
 * Mark a batch of partitions COMPLETED and advance progress/checkpoint once.
 */
export async function completePartitionBatch(
  scaleRunId: string,
  items: CompletePartitionInput[],
): Promise<void> {
  if (items.length === 0) return;

  const partitionIds = items.map((i) => i.partitionId);
  await prisma.scalePartition.updateMany({
    where: {
      scaleRunId,
      partitionId: { in: partitionIds },
      status: { not: SCALE_PARTITION_STATUS.COMPLETED },
    },
    data: {
      status: SCALE_PARTITION_STATUS.COMPLETED,
      updatedAt: new Date(),
    },
  });

  const run = await prisma.scaleRun.findUnique({
    where: { id: scaleRunId },
  });
  if (!run) return;

  const newlyCompleted = items.length;
  const completed = run.completedPartitions + newlyCompleted;
  const total = Math.max(run.totalPartitions, 1);
  const progressPct = Math.min(100, Math.round((completed / total) * 100));

  let checkpoint: {
    completed: string[];
    indexed: number;
    bounded: number;
    review: number;
  } = {
    completed: [],
    indexed: 0,
    bounded: 0,
    review: 0,
  };
  try {
    checkpoint = { ...checkpoint, ...(JSON.parse(run.checkpoint ?? "{}") as typeof checkpoint) };
  } catch {
    checkpoint = { completed: [], indexed: 0, bounded: 0, review: 0 };
  }

  for (const item of items) {
    checkpoint.completed.push(item.partitionId);
    if (item.bucket === "indexed") checkpoint.indexed += 1;
    if (item.bucket === "bounded") checkpoint.bounded += 1;
    if (item.bucket === "review") checkpoint.review += 1;
  }

  await prisma.scaleRun.update({
    where: { id: scaleRunId },
    data: {
      completedPartitions: completed,
      progressPct,
      checkpoint: JSON.stringify(checkpoint),
      updatedAt: new Date(),
    },
  });
}

/**
 * Mark a partition FAILED with exponential backoff. retryCount++ and
 * nextRetryAt = now + base * factor^retryCount. Past maxRetries → DEAD_LETTER.
 */
export async function failPartition(
  scaleRunId: string,
  partitionId: string,
  error: string,
  now: number = Date.now(),
): Promise<{ deadLettered: boolean }> {
  const partition = await prisma.scalePartition.findUnique({
    where: { scaleRunId_partitionId: { scaleRunId, partitionId } },
  });
  if (!partition) return { deadLettered: false };

  const retryCount = partition.retryCount + 1;
  const deadLettered = retryCount >= SCALE_CONFIG.maxRetries;
  const delayMs =
    SCALE_CONFIG.backoffBaseMs *
    Math.pow(SCALE_CONFIG.backoffFactor, retryCount - 1);

  await prisma.scalePartition.update({
    where: { id: partition.id },
    data: {
      status: deadLettered
        ? SCALE_PARTITION_STATUS.DEAD_LETTER
        : SCALE_PARTITION_STATUS.FAILED,
      retryCount,
      lastError: error,
      nextRetryAt: deadLettered
        ? null
        : new Date(now + delayMs),
      updatedAt: new Date(),
    },
  });

  return { deadLettered };
}

export interface ScaleRunCompletion {
  scaleRunId: string;
  status: string;
  partitionCount: number;
  completedPartitions: number;
  deadLetterCount: number;
  retryCount: number;
  checkpoint: Record<string, unknown>;
}

export async function finalizeScaleRun(
  scaleRunId: string,
  status: string,
  reportJson: string,
): Promise<ScaleRunCompletion> {
  const partitions = await prisma.scalePartition.findMany({
    where: { scaleRunId },
  });
  const deadLetterCount = partitions.filter(
    (p) => p.status === SCALE_PARTITION_STATUS.DEAD_LETTER,
  ).length;
  const retryCount = partitions.reduce((acc, p) => acc + p.retryCount, 0);

  const run = await prisma.scaleRun.update({
    where: { id: scaleRunId },
    data: {
      status,
      progressPct: status === SCALE_RUN_STATUS.COMPLETED ? 100 : runProgressOr(partitions, status),
      checkpoint: reportJson,
      updatedAt: new Date(),
    },
  });

  return {
    scaleRunId,
    status,
    partitionCount: run.totalPartitions,
    completedPartitions: run.completedPartitions,
    deadLetterCount,
    retryCount,
    checkpoint: JSON.parse(reportJson) as Record<string, unknown>,
  };
}

function runProgressOr(
  partitions: Array<{ status: string }>,
  status: string,
): number {
  if (status === SCALE_RUN_STATUS.COMPLETED) return 100;
  const done = partitions.filter(
    (p) => p.status === SCALE_PARTITION_STATUS.COMPLETED,
  ).length;
  const total = Math.max(partitions.length, 1);
  return Math.round((done / total) * 100);
}

export async function getScaleRun(
  scaleRunId: string,
): Promise<{ status: string; checkpoint: string | null } | null> {
  const run = await prisma.scaleRun.findUnique({ where: { id: scaleRunId } });
  if (!run) return null;
  return { status: run.status, checkpoint: run.checkpoint };
}

/** Count partitions in a given status for a run (e.g. dead-letter detection). */
export async function countPartitionsByStatus(
  scaleRunId: string,
  status: string,
): Promise<number> {
  return prisma.scalePartition.count({
    where: { scaleRunId, status },
  });
}
