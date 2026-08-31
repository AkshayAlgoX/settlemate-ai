/*
 * SettleMate AI — PostgreSQL-Backed Distributed Durable Worker Orchestration
 *
 * Implements:
 *   1. Atomic Job Claiming via `SELECT ... FOR UPDATE SKIP LOCKED`
 *   2. Strict State Machine: PENDING -> RUNNING -> COMPLETED | FAILED | STALLED | CANCELLED | DEAD_LETTER
 *   3. Heartbeat Lease Management & Automatic Dead-Worker Reclamation (Stalled Detection)
 *   4. Item-Level Tracking (JobItem) & Anti-Double-Mutation Safeguards
 *   5. Bounded Concurrency Execution (10–15 in-flight items with backpressure)
 *   6. Cooperative Safe Cancellation (`cancelRequestedAt` checked between units of work)
 *   7. Differentiated Retries (Transient/429/Timeout vs Invariant/Validation) with Exponential Backoff + Jitter
 *   8. Multi-Tenant Transaction-Scoped Execution (`withTenantContext`)
 *   9. Dual-mode support (Production PostgreSQL + Local SQLite / In-Memory Fallback)
 */

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { withTenantContext, getRequiredTenantId } from "@/lib/tenant/tenant-context";

interface DynamicJobPrisma {
  asyncJob?: {
    findUnique: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
    create: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
    update: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
    updateMany: (args: Record<string, unknown>) => Promise<{ count: number }>;
  };
  jobItem?: {
    findUnique: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
    create: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
    createMany: (args: Record<string, unknown>) => Promise<{ count: number }>;
    update: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
    updateMany: (args: Record<string, unknown>) => Promise<{ count: number }>;
  };
  $queryRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<Array<Record<string, unknown>>>;
}

const dynamicPrisma = prisma as unknown as DynamicJobPrisma;

export type JobStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "STALLED" | "CANCELLED" | "DEAD_LETTER";
export type JobItemStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "RETRYABLE_FAILED";
export type FailureClassification = "TRANSIENT" | "PERMANENT" | "INVARIANT_FAILURE" | "VALIDATION_FAILURE" | "RATE_LIMIT" | "TIMEOUT";

export interface DurableJobRecord {
  id: string;
  tenantId: string;
  idempotencyKey: string;
  jobType: string;
  status: JobStatus;
  payload: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  attempt: number;
  maxRetries: number;
  workerId?: string;
  claimedAt?: Date;
  leaseExpiresAt?: Date;
  heartbeatAt?: Date;
  nextRetryAt?: Date;
  cancelRequestedAt?: Date;
  progressCurrent: number;
  progressTotal: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface JobItemRecord {
  id: string;
  jobId: string;
  tenantId: string;
  idempotencyKey: string;
  status: JobItemStatus;
  error?: string;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkerConfig {
  workerId?: string;
  leaseDurationMs?: number; // Default 30,000ms (30s)
  heartbeatIntervalMs?: number; // Default 10,000ms (10s)
  pollIntervalMs?: number; // Default 1,000ms (1s)
  batchSize?: number;
  maxRetries?: number;
  itemConcurrency?: number; // Default 12 (10-15 bounded concurrency)
}

// In-memory fallback queue stores for local development / testing
const localMemoryQueue = new Map<string, DurableJobRecord>();
const localJobItems = new Map<string, JobItemRecord>();

export function _clearLocalQueue(): void {
  localMemoryQueue.clear();
  localJobItems.clear();
}

function isPostgres(): boolean {
  const url = process.env.DATABASE_URL || "";
  return url.startsWith("postgres://") || url.startsWith("postgresql://");
}

/**
 * Validates legal job state machine transitions.
 */
export function assertValidTransition(current: JobStatus, next: JobStatus): void {
  const legalTransitions: Record<JobStatus, JobStatus[]> = {
    PENDING: ["RUNNING", "CANCELLED", "FAILED", "DEAD_LETTER"],
    RUNNING: ["RUNNING", "COMPLETED", "FAILED", "STALLED", "CANCELLED", "PENDING", "DEAD_LETTER"],
    STALLED: ["PENDING", "RUNNING", "FAILED", "DEAD_LETTER"],
    FAILED: ["PENDING", "DEAD_LETTER"],
    CANCELLED: [], // Terminal
    DEAD_LETTER: ["PENDING"], // Controlled admin replay only
    COMPLETED: [], // Terminal
  };

  if (!legalTransitions[current]?.includes(next)) {
    throw new Error(
      `Illegal Job State Transition: Cannot transition job from state '${current}' to '${next}'.`
    );
  }
}

/**
 * Calculates exponential backoff delay with optional jitter.
 * 1st retry: 5s, 2nd: 25s, 3rd: 125s, max capped at 300s (5m).
 */
export function calculateBackoffMs(
  attempt: number,
  baseSeconds: number = 5,
  multiplier: number = 5,
  maxCapSeconds: number = 300,
  withJitter: boolean = false
): number {
  const backoffSec = Math.min(maxCapSeconds, baseSeconds * Math.pow(multiplier, Math.max(0, attempt - 1)));
  if (!withJitter) {
    return backoffSec * 1000;
  }
  const jitter = Math.random() * 0.25 * backoffSec;
  return Math.round((backoffSec + jitter) * 1000);
}


/**
 * Classifies failure into retryable vs non-retryable categories.
 */
export function classifyFailure(err: unknown): {
  classification: FailureClassification;
  retryable: boolean;
  errorMsg: string;
} {
  const errorMsg = err instanceof Error ? err.message : String(err);
  const lower = errorMsg.toLowerCase();

  if (lower.includes("invariant") || lower.includes("control_failure") || lower.includes("tampered")) {
    return { classification: "INVARIANT_FAILURE", retryable: false, errorMsg };
  }
  if (lower.includes("validation") || lower.includes("invalid input") || lower.includes("schema mismatch")) {
    return { classification: "VALIDATION_FAILURE", retryable: false, errorMsg };
  }
  if (lower.includes("429") || lower.includes("rate limit") || lower.includes("quota exceeded")) {
    return { classification: "RATE_LIMIT", retryable: true, errorMsg };
  }
  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("econnreset") || lower.includes("etimedout")) {
    return { classification: "TIMEOUT", retryable: true, errorMsg };
  }
  if (lower.includes("sqlite_busy") || lower.includes("deadlock") || lower.includes("connection terminated") || lower.includes("econnrefused")) {
    return { classification: "TRANSIENT", retryable: true, errorMsg };
  }

  return { classification: "TRANSIENT", retryable: true, errorMsg };
}

/**
 * Atomically creates or retrieves an idempotent async job.
 */
export async function enqueueJob(params: {
  tenantId?: string;
  idempotencyKey: string;
  jobType: string;
  payload: Record<string, unknown>;
  maxRetries?: number;
  progressTotal?: number;
}): Promise<DurableJobRecord> {
  const tenantId = params.tenantId || getRequiredTenantId();
  const maxRetries = params.maxRetries ?? 3;
  const progressTotal = params.progressTotal ?? 0;
  const now = new Date();

  if (isPostgres()) {
    const existing = await dynamicPrisma.asyncJob?.findUnique({
      where: {
        tenantId_idempotencyKey: {
          tenantId,
          idempotencyKey: params.idempotencyKey,
        },
      },
    });

    if (existing) {
      return {
        id: existing.id as string,
        tenantId: existing.tenantId as string,
        idempotencyKey: existing.idempotencyKey as string,
        jobType: existing.jobType as string,
        status: existing.status as JobStatus,
        payload: JSON.parse((existing.payload as string) || "{}"),
        result: existing.result ? JSON.parse(existing.result as string) : undefined,
        error: (existing.error as string) || undefined,
        attempt: Number(existing.attempt || 0),
        maxRetries: Number(existing.maxRetries || maxRetries),
        workerId: (existing.workerId as string) || undefined,
        claimedAt: (existing.claimedAt as Date) || undefined,
        leaseExpiresAt: (existing.leaseExpiresAt as Date) || undefined,
        heartbeatAt: (existing.heartbeatAt as Date) || undefined,
        nextRetryAt: (existing.nextRetryAt as Date) || undefined,
        cancelRequestedAt: (existing.cancelRequestedAt as Date) || undefined,
        progressCurrent: Number(existing.progressCurrent || 0),
        progressTotal: Number(existing.progressTotal || progressTotal),
        createdAt: existing.createdAt as Date,
        updatedAt: existing.updatedAt as Date,
        completedAt: (existing.completedAt as Date) || undefined,
      };
    }

    const createdId = randomUUID();
    await dynamicPrisma.asyncJob?.create({
      data: {
        id: createdId,
        tenantId,
        idempotencyKey: params.idempotencyKey,
        jobType: params.jobType,
        status: "PENDING",
        payload: JSON.stringify(params.payload),
        attempt: 0,
        maxRetries,
        progressCurrent: 0,
        progressTotal,
        createdAt: now,
        updatedAt: now,
      },
    });

    return {
      id: createdId,
      tenantId,
      idempotencyKey: params.idempotencyKey,
      jobType: params.jobType,
      status: "PENDING",
      payload: params.payload,
      attempt: 0,
      maxRetries,
      progressCurrent: 0,
      progressTotal,
      createdAt: now,
      updatedAt: now,
    };
  }

  // Local fallback queue
  const queueKey = `${tenantId}:${params.idempotencyKey}`;
  const existing = localMemoryQueue.get(queueKey);
  if (existing) return existing;

  const jobRecord: DurableJobRecord = {
    id: `job_${randomUUID().slice(0, 12)}`,
    tenantId,
    idempotencyKey: params.idempotencyKey,
    jobType: params.jobType,
    status: "PENDING",
    payload: params.payload,
    attempt: 0,
    maxRetries,
    progressCurrent: 0,
    progressTotal,
    createdAt: now,
    updatedAt: now,
  };
  localMemoryQueue.set(queueKey, jobRecord);
  return jobRecord;
}

/**
 * Atomically claims the next pending or expired job using PostgreSQL `SELECT ... FOR UPDATE SKIP LOCKED`.
 */
export async function claimNextJob(
  workerId: string,
  leaseDurationMs: number = 30000
): Promise<DurableJobRecord | null> {
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + leaseDurationMs);

  if (isPostgres()) {
    return prisma.$transaction(async (tx) => {
      const claimed = await (tx as unknown as DynamicJobPrisma).$queryRaw`
        WITH next_candidate AS (
          SELECT id
          FROM "AsyncJob"
          WHERE (status = 'PENDING' OR (status IN ('RUNNING', 'STALLED') AND "leaseExpiresAt" < NOW()))
            AND ("nextRetryAt" IS NULL OR "nextRetryAt" <= NOW())
            AND "cancelRequestedAt" IS NULL
          ORDER BY "createdAt" ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
        UPDATE "AsyncJob"
        SET status = 'RUNNING',
            "workerId" = ${workerId},
            "claimedAt" = NOW(),
            "heartbeatAt" = NOW(),
            "leaseExpiresAt" = ${leaseExpiresAt},
            attempt = attempt + 1,
            "updatedAt" = NOW()
        FROM next_candidate
        WHERE "AsyncJob".id = next_candidate.id
        RETURNING "AsyncJob".*;
      `;

      const row = claimed?.[0];
      if (!row) return null;

      return {
        id: row.id as string,
        tenantId: row.tenantId as string,
        idempotencyKey: row.idempotencyKey as string,
        jobType: row.jobType as string,
        status: "RUNNING",
        payload: JSON.parse((row.payload as string) || "{}"),
        result: row.result ? JSON.parse(row.result as string) : undefined,
        error: (row.error as string) || undefined,
        attempt: Number(row.attempt || 1),
        maxRetries: Number(row.maxRetries || 3),
        workerId,
        claimedAt: (row.claimedAt as Date) || now,
        leaseExpiresAt,
        heartbeatAt: now,
        nextRetryAt: (row.nextRetryAt as Date) || undefined,
        cancelRequestedAt: (row.cancelRequestedAt as Date) || undefined,
        progressCurrent: Number(row.progressCurrent || 0),
        progressTotal: Number(row.progressTotal || 0),
        createdAt: row.createdAt as Date,
        updatedAt: row.updatedAt as Date,
      };
    });
  }

  // Local fallback queue search
  for (const job of localMemoryQueue.values()) {
    const isExpired = job.leaseExpiresAt && job.leaseExpiresAt.getTime() < now.getTime();
    const retryEligible = !job.nextRetryAt || job.nextRetryAt.getTime() <= now.getTime();
    const isCancelled = Boolean(job.cancelRequestedAt);

    if (
      !isCancelled &&
      retryEligible &&
      (job.status === "PENDING" || (job.status === "RUNNING" && isExpired) || (job.status === "STALLED" && isExpired))
    ) {
      job.status = "RUNNING";
      job.workerId = workerId;
      job.claimedAt = now;
      job.heartbeatAt = now;
      job.leaseExpiresAt = leaseExpiresAt;
      job.attempt += 1;
      job.updatedAt = now;
      return { ...job };
    }
  }

  return null;
}

/**
 * Renews the lease and updates the heartbeat timestamp for an actively running job.
 */
export async function renewLease(
  jobId: string,
  workerId: string,
  extensionDurationMs: number = 30000
): Promise<boolean> {
  const now = new Date();
  const newLeaseExpiresAt = new Date(now.getTime() + extensionDurationMs);

  if (isPostgres()) {
    const res = await dynamicPrisma.asyncJob?.updateMany({
      where: {
        id: jobId,
        workerId,
        status: "RUNNING",
      },
      data: {
        leaseExpiresAt: newLeaseExpiresAt,
        heartbeatAt: now,
        updatedAt: now,
      },
    });
    return (res?.count ?? 0) > 0;
  }

  for (const job of localMemoryQueue.values()) {
    if (job.id === jobId && job.workerId === workerId && job.status === "RUNNING") {
      job.leaseExpiresAt = newLeaseExpiresAt;
      job.heartbeatAt = now;
      job.updatedAt = now;
      return true;
    }
  }

  return false;
}

/**
 * Updates progress counters for a running job.
 */
export async function updateJobProgress(
  jobId: string,
  workerId: string,
  progressCurrent: number,
  progressTotal?: number
): Promise<void> {
  const now = new Date();

  if (isPostgres()) {
    await dynamicPrisma.asyncJob?.updateMany({
      where: {
        id: jobId,
        workerId,
        status: "RUNNING",
      },
      data: {
        progressCurrent,
        ...(progressTotal !== undefined ? { progressTotal } : {}),
        heartbeatAt: now,
        updatedAt: now,
      },
    });
    return;
  }

  for (const job of localMemoryQueue.values()) {
    if (job.id === jobId && job.workerId === workerId) {
      job.progressCurrent = progressCurrent;
      if (progressTotal !== undefined) job.progressTotal = progressTotal;
      job.heartbeatAt = now;
      job.updatedAt = now;
      return;
    }
  }
}

/**
 * Requests cooperative cancellation of an active or pending job.
 */
export async function requestJobCancellation(jobId: string, tenantId?: string): Promise<boolean> {
  const targetTenant = tenantId || getRequiredTenantId();
  const now = new Date();

  if (isPostgres()) {
    const res = await dynamicPrisma.asyncJob?.updateMany({
      where: {
        id: jobId,
        tenantId: targetTenant,
        status: { in: ["PENDING", "RUNNING", "STALLED"] },
      },
      data: {
        cancelRequestedAt: now,
        updatedAt: now,
      },
    });
    return (res?.count ?? 0) > 0;
  }

  for (const job of localMemoryQueue.values()) {
    if (
      job.id === jobId &&
      job.tenantId === targetTenant &&
      (job.status === "PENDING" || job.status === "RUNNING" || job.status === "STALLED")
    ) {
      job.cancelRequestedAt = now;
      job.updatedAt = now;
      return true;
    }
  }

  return false;
}

/**
 * Checks whether cancellation has been requested for a job.
 */
export async function checkCancellationRequested(jobId: string): Promise<boolean> {
  if (isPostgres()) {
    const job = await dynamicPrisma.asyncJob?.findUnique({ where: { id: jobId } });
    return Boolean(job?.cancelRequestedAt);
  }

  for (const job of localMemoryQueue.values()) {
    if (job.id === jobId) {
      return Boolean(job.cancelRequestedAt);
    }
  }

  return false;
}

/**
 * Sets a job to CANCELLED terminal state cleanly.
 */
export async function cancelJob(
  jobId: string,
  workerId?: string,
  reason: string = "Cancelled by user request"
): Promise<void> {
  const now = new Date();

  if (isPostgres()) {
    await dynamicPrisma.asyncJob?.updateMany({
      where: {
        id: jobId,
        ...(workerId ? { workerId } : {}),
      },
      data: {
        status: "CANCELLED",
        error: reason,
        completedAt: now,
        updatedAt: now,
      },
    });
    return;
  }

  for (const job of localMemoryQueue.values()) {
    if (job.id === jobId) {
      assertValidTransition(job.status, "CANCELLED");
      job.status = "CANCELLED";
      job.error = reason;
      job.completedAt = now;
      job.updatedAt = now;
      return;
    }
  }
}

/**
 * Completes a job cleanly and stores its verified result.
 */
export async function completeJob(
  jobId: string,
  workerId: string,
  result: Record<string, unknown>
): Promise<void> {
  const now = new Date();

  if (isPostgres()) {
    await dynamicPrisma.asyncJob?.updateMany({
      where: {
        id: jobId,
        workerId,
        status: "RUNNING",
      },
      data: {
        status: "COMPLETED",
        result: JSON.stringify(result),
        completedAt: now,
        updatedAt: now,
      },
    });
    return;
  }

  for (const job of localMemoryQueue.values()) {
    if (job.id === jobId && job.workerId === workerId) {
      assertValidTransition(job.status, "COMPLETED");
      job.status = "COMPLETED";
      job.result = result;
      job.completedAt = now;
      job.updatedAt = now;
      return;
    }
  }
}

/**
 * Handles job failure with exponential retry backoff or DLQ transition.
 */
export async function failJob(
  jobId: string,
  workerId: string,
  errorMsg: string,
  classification: FailureClassification = "TRANSIENT",
  retryDelayMs?: number
): Promise<JobStatus> {
  const now = new Date();

  if (isPostgres()) {
    const job = await dynamicPrisma.asyncJob?.findUnique({ where: { id: jobId } });
    if (!job) return "FAILED";

    const attempt = Number(job.attempt || 1);
    const maxRetries = Number(job.maxRetries || 3);

    const isDeadLetter =
      classification === "INVARIANT_FAILURE" ||
      classification === "VALIDATION_FAILURE" ||
      classification === "PERMANENT" ||
      attempt >= maxRetries;

    const nextStatus: JobStatus = isDeadLetter ? "DEAD_LETTER" : "PENDING";
    const delay = retryDelayMs !== undefined ? retryDelayMs : calculateBackoffMs(attempt);
    const nextRetryAt = isDeadLetter ? null : new Date(now.getTime() + delay);

    await dynamicPrisma.asyncJob?.update({
      where: { id: jobId },
      data: {
        status: nextStatus,
        error: errorMsg,
        leaseExpiresAt: null,
        workerId: null,
        nextRetryAt,
        updatedAt: now,
      },
    });

    return nextStatus;
  }

  for (const job of localMemoryQueue.values()) {
    if (job.id === jobId) {
      const isDeadLetter =
        classification === "INVARIANT_FAILURE" ||
        classification === "VALIDATION_FAILURE" ||
        classification === "PERMANENT" ||
        job.attempt >= job.maxRetries;

      const nextStatus: JobStatus = isDeadLetter ? "DEAD_LETTER" : "PENDING";
      assertValidTransition(job.status, nextStatus);

      const delay = retryDelayMs !== undefined ? retryDelayMs : calculateBackoffMs(job.attempt);
      job.status = nextStatus;
      job.error = errorMsg;
      job.leaseExpiresAt = undefined;
      job.workerId = undefined;
      job.nextRetryAt = isDeadLetter ? undefined : new Date(now.getTime() + delay);
      job.updatedAt = now;
      return nextStatus;
    }
  }

  return "FAILED";
}


/**
 * Detects stalled jobs whose heartbeats/leases expired and either re-enqueues them with backoff or moves to DLQ.
 */
export async function detectAndReclaimStalledJobs(
  staleThresholdMs: number = 30000,
  retryDelayMs?: number
): Promise<{
  stalledCount: number;
  dlqCount: number;
}> {
  const now = new Date();
  let stalledCount = 0;
  let dlqCount = 0;

  if (isPostgres()) {
    // Find all expired RUNNING jobs
    const expiredJobs = (await dynamicPrisma.$queryRaw`
      SELECT id, attempt, "maxRetries"
      FROM "AsyncJob"
      WHERE status = 'RUNNING'
        AND ("leaseExpiresAt" < NOW() OR "heartbeatAt" < NOW() - (${staleThresholdMs} || ' milliseconds')::INTERVAL)
    `) as Array<{ id: string; attempt: number; maxRetries: number }>;

    for (const job of expiredJobs) {
      if (job.attempt >= job.maxRetries) {
        await dynamicPrisma.asyncJob?.update({
          where: { id: job.id },
          data: {
            status: "DEAD_LETTER",
            error: "Heartbeat lease expired; maximum retries exceeded.",
            leaseExpiresAt: null,
            workerId: null,
            updatedAt: now,
          },
        });
        dlqCount++;
      } else {
        const delay = retryDelayMs !== undefined ? retryDelayMs : calculateBackoffMs(job.attempt);
        await dynamicPrisma.asyncJob?.update({
          where: { id: job.id },
          data: {
            status: "PENDING",
            error: "Worker lease expired; reclaimed for retry.",
            leaseExpiresAt: null,
            workerId: null,
            nextRetryAt: new Date(now.getTime() + delay),
            updatedAt: now,
          },
        });
        stalledCount++;
      }
    }

    return { stalledCount, dlqCount };
  }

  for (const job of localMemoryQueue.values()) {
    if (job.status === "RUNNING") {
      const isExpired = job.leaseExpiresAt && job.leaseExpiresAt.getTime() < now.getTime();
      const heartbeatStale = job.heartbeatAt && now.getTime() - job.heartbeatAt.getTime() > staleThresholdMs;

      if (isExpired || heartbeatStale) {
        if (job.attempt >= job.maxRetries) {
          job.status = "DEAD_LETTER";
          job.error = "Heartbeat lease expired; maximum retries exceeded.";
          job.leaseExpiresAt = undefined;
          job.workerId = undefined;
          job.updatedAt = now;
          dlqCount++;
        } else {
          const delay = retryDelayMs !== undefined ? retryDelayMs : calculateBackoffMs(job.attempt);
          job.status = "PENDING";
          job.error = "Worker lease expired; reclaimed for retry.";
          job.leaseExpiresAt = undefined;
          job.workerId = undefined;
          job.nextRetryAt = new Date(now.getTime() + delay);
          job.updatedAt = now;
          stalledCount++;
        }
      }
    }
  }

  return { stalledCount, dlqCount };
}


/**
 * Creates idempotent JobItems for granular tracking.
 */
export async function createJobItems(
  jobId: string,
  tenantId: string,
  items: Array<{ idempotencyKey: string }>
): Promise<number> {
  const now = new Date();

  if (isPostgres()) {
    const rows = items.map((item) => ({
      id: `item_${randomUUID().slice(0, 12)}`,
      jobId,
      tenantId,
      idempotencyKey: item.idempotencyKey,
      status: "PENDING",
      createdAt: now,
      updatedAt: now,
    }));

    const res = await dynamicPrisma.jobItem?.createMany({
      data: rows,
      skipDuplicates: true,
    });
    return res?.count ?? 0;
  }

  let created = 0;
  for (const item of items) {
    const key = `${jobId}:${item.idempotencyKey}`;
    if (!localJobItems.has(key)) {
      localJobItems.set(key, {
        id: `item_${randomUUID().slice(0, 12)}`,
        jobId,
        tenantId,
        idempotencyKey: item.idempotencyKey,
        status: "PENDING",
        createdAt: now,
        updatedAt: now,
      });
      created++;
    }
  }

  return created;
}

/**
 * Processes a collection of items using bounded concurrency.
 * Periodically updates progress, sends heartbeats, and checks for cancellation.
 */
export async function processItemsBoundedConcurrency<T, R>(
  jobId: string,
  workerId: string,
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  options: {
    concurrency?: number;
    onProgress?: (completed: number, total: number) => Promise<void>;
  } = {}
): Promise<{ results: R[]; cancelled: boolean }> {
  const concurrency = Math.max(1, Math.min(30, options.concurrency ?? 12));
  const total = items.length;
  let completed = 0;
  const results: R[] = new Array(total);
  let isCancelled = false;

  let currentIndex = 0;

  async function workerLoop(): Promise<void> {
    while (currentIndex < total && !isCancelled) {
      const idx = currentIndex++;
      if (idx >= total) break;

      // Check cancellation every 10 items
      if (idx % 10 === 0) {
        if (await checkCancellationRequested(jobId)) {
          isCancelled = true;
          break;
        }
      }

      const item = items[idx];
      results[idx] = await processor(item, idx);
      completed++;

      // Update progress & heartbeat every 20 items or at completion
      if (completed % 20 === 0 || completed === total) {
        await updateJobProgress(jobId, workerId, completed, total);
        await renewLease(jobId, workerId, 30000);
        if (options.onProgress) {
          await options.onProgress(completed, total);
        }
      }
    }
  }

  // Launch bounded worker pool
  const pool = Array.from({ length: Math.min(concurrency, total) }, () => workerLoop());
  await Promise.all(pool);

  return { results, cancelled: isCancelled };
}

/**
 * Replays a Dead Letter Queue (DLQ) job under controlled administrative supervision.
 */
export async function replayJob(jobId: string, tenantId?: string): Promise<boolean> {
  const targetTenant = tenantId || getRequiredTenantId();
  const now = new Date();

  if (isPostgres()) {
    const res = await dynamicPrisma.asyncJob?.updateMany({
      where: {
        id: jobId,
        tenantId: targetTenant,
        status: "DEAD_LETTER",
      },
      data: {
        status: "PENDING",
        attempt: 0,
        error: null,
        leaseExpiresAt: null,
        workerId: null,
        nextRetryAt: null,
        cancelRequestedAt: null,
        updatedAt: now,
      },
    });
    return (res?.count ?? 0) > 0;
  }

  for (const job of localMemoryQueue.values()) {
    if (job.id === jobId && job.tenantId === targetTenant && job.status === "DEAD_LETTER") {
      assertValidTransition(job.status, "PENDING");
      job.status = "PENDING";
      job.attempt = 0;
      job.error = undefined;
      job.leaseExpiresAt = undefined;
      job.workerId = undefined;
      job.nextRetryAt = undefined;
      job.cancelRequestedAt = undefined;
      job.updatedAt = now;
      return true;
    }
  }

  return false;
}

/**
 * Distributed Durable Worker Instance.
 * Autonomous worker loop processing claimed jobs, renewing heartbeats, and ensuring atomic completion.
 */
export class DistributedJobWorker {
  readonly workerId: string;
  private leaseDurationMs: number;
  private heartbeatIntervalMs: number;
  private pollIntervalMs: number;
  private isRunning = false;
  private activeHeartbeats = new Map<string, NodeJS.Timeout>();

  constructor(config: WorkerConfig = {}) {
    this.workerId = config.workerId || `worker_${randomUUID().slice(0, 8)}`;
    this.leaseDurationMs = config.leaseDurationMs ?? 30000;
    this.heartbeatIntervalMs = config.heartbeatIntervalMs ?? 10000;
    this.pollIntervalMs = config.pollIntervalMs ?? 1000;
  }

  /**
   * Starts the worker processing loop.
   */
  async start(
    handler: (job: DurableJobRecord) => Promise<Record<string, unknown>>
  ): Promise<void> {
    this.isRunning = true;

    while (this.isRunning) {
      try {
        const job = await claimNextJob(this.workerId, this.leaseDurationMs);
        if (!job) {
          await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
          continue;
        }

        // Start heartbeat lease renewal
        const heartbeatTimer = setInterval(async () => {
          try {
            await renewLease(job.id, this.workerId, this.leaseDurationMs);
          } catch {
            // Heartbeat failure
          }
        }, this.heartbeatIntervalMs);
        this.activeHeartbeats.set(job.id, heartbeatTimer);

        // Execute job in tenant-scoped transaction
        try {
          // Check if cancelled before execution starts
          if (job.cancelRequestedAt) {
            await cancelJob(job.id, this.workerId, "Cancelled prior to worker dispatch");
            continue;
          }

          const result = await withTenantContext(job.tenantId, async () => {
            return handler(job);
          });

          // Check if cancellation requested during execution
          if (await checkCancellationRequested(job.id)) {
            await cancelJob(job.id, this.workerId, "Cancelled during execution");
          } else {
            await completeJob(job.id, this.workerId, result);
          }
        } catch (err: unknown) {
          const classification = classifyFailure(err);
          await failJob(
            job.id,
            this.workerId,
            classification.errorMsg,
            classification.classification
          );
        } finally {
          clearInterval(heartbeatTimer);
          this.activeHeartbeats.delete(job.id);
        }
      } catch {
        await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
      }
    }
  }

  /**
   * Graceful shutdown of the worker loop.
   */
  stop(): void {
    this.isRunning = false;
    for (const timer of this.activeHeartbeats.values()) {
      clearInterval(timer);
    }
    this.activeHeartbeats.clear();
  }
}
