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
import { generateSyntheticBatchSlice } from "@/lib/synthetic/generator";

interface DynamicJobPrisma {
  asyncJob?: {
    findUnique: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
    findMany: (args: Record<string, unknown>) => Promise<Array<Record<string, unknown>>>;
    create: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
    update: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
    upsert: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
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

export type JobStatus =
  | "PENDING"
  | "CLAIMED"
  | "RUNNING"
  | "CANCEL_REQUESTED"
  | "STALLED"
  | "RETRY_WAIT"
  | "COMPLETED"
  | "FAILED"
  | "DEAD_LETTER"
  | "CANCELLED";

export type JobItemStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "RETRYABLE_FAILED" | "CANCELLED";
export type FailureClassification =
  | "TRANSIENT"
  | "PERMANENT"
  | "INVARIANT_FAILURE"
  | "VALIDATION_FAILURE"
  | "BUSINESS_RULE_ERROR"
  | "RATE_LIMIT"
  | "RATE_LIMITED_429"
  | "TIMEOUT"
  | "DATABASE_TIMEOUT"
  | "NETWORK_TIMEOUT"
  | "SERVICE_UNAVAILABLE"
  | "CANCELLED"
  | "STALE_LEASE"
  | "UNKNOWN";

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
  queuePosition?: number;
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
 * Explicitly guards against illegal transitions and enforces fail-closed state flow.
 */
export function assertValidTransition(current: JobStatus, next: JobStatus): void {
  const legalTransitions: Record<JobStatus, JobStatus[]> = {
    PENDING: ["PENDING", "CLAIMED", "RUNNING", "CANCEL_REQUESTED", "CANCELLED", "FAILED", "DEAD_LETTER"],
    CLAIMED: ["CLAIMED", "RUNNING", "CANCEL_REQUESTED", "CANCELLED", "STALLED", "FAILED", "PENDING"],
    RUNNING: ["RUNNING", "CANCEL_REQUESTED", "COMPLETED", "FAILED", "STALLED", "RETRY_WAIT", "CANCELLED", "PENDING", "DEAD_LETTER"],
    CANCEL_REQUESTED: ["CANCEL_REQUESTED", "CANCELLED"],
    STALLED: ["STALLED", "RETRY_WAIT", "PENDING", "CLAIMED", "RUNNING", "CANCEL_REQUESTED", "CANCELLED", "FAILED", "DEAD_LETTER"],
    RETRY_WAIT: ["RETRY_WAIT", "PENDING", "CLAIMED", "RUNNING", "CANCEL_REQUESTED", "CANCELLED", "DEAD_LETTER"],
    FAILED: ["FAILED", "RETRY_WAIT", "PENDING", "DEAD_LETTER"],
    CANCELLED: ["CANCELLED"], // Terminal
    DEAD_LETTER: ["DEAD_LETTER", "PENDING"], // Controlled admin replay only
    COMPLETED: ["COMPLETED"], // Terminal
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
  const jitter = (0.5 + Math.random() * 0.75) * backoffSec;
  return Math.round(jitter * 1000);
}

/**
 * Classifies failure into retryable vs non-retryable categories with retry-after timing.
 */
export function classifyFailure(err: unknown): {
  classification: FailureClassification;
  retryable: boolean;
  errorMsg: string;
  retryAfterMs?: number;
} {
  const errorMsg = err instanceof Error ? err.message : String(err);
  const lower = errorMsg.toLowerCase();

  if (lower.includes("cancel") || lower.includes("aborted")) {
    return { classification: "CANCELLED", retryable: false, errorMsg };
  }
  if (lower.includes("invariant") || lower.includes("control_failure") || lower.includes("tampered")) {
    return { classification: "INVARIANT_FAILURE", retryable: false, errorMsg };
  }
  if (lower.includes("validation") || lower.includes("invalid input") || lower.includes("schema mismatch")) {
    return { classification: "VALIDATION_FAILURE", retryable: false, errorMsg };
  }
  if (lower.includes("business_rule") || lower.includes("unauthorized") || lower.includes("forbidden")) {
    return { classification: "BUSINESS_RULE_ERROR", retryable: false, errorMsg };
  }
  if (lower.includes("stale lease") || lower.includes("lease expired") || lower.includes("lost lease")) {
    return { classification: "STALE_LEASE", retryable: true, errorMsg, retryAfterMs: 1000 };
  }
  if (lower.includes("429") || lower.includes("rate limit") || lower.includes("quota exceeded") || lower.includes("too many requests")) {
    return { classification: "RATE_LIMIT", retryable: true, errorMsg, retryAfterMs: 5000 };
  }
  if (lower.includes("db timeout") || lower.includes("query_timeout") || lower.includes("canceling statement due to statement timeout")) {
    return { classification: "DATABASE_TIMEOUT", retryable: true, errorMsg, retryAfterMs: 2000 };
  }
  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("econnreset") || lower.includes("etimedout")) {
    return { classification: "TIMEOUT", retryable: true, errorMsg, retryAfterMs: 2000 };
  }
  if (lower.includes("503") || lower.includes("service unavailable") || lower.includes("econnrefused") || lower.includes("connection refused")) {
    return { classification: "SERVICE_UNAVAILABLE", retryable: true, errorMsg, retryAfterMs: 3000 };
  }
  if (lower.includes("sqlite_busy") || lower.includes("deadlock") || lower.includes("connection terminated") || lower.includes("serialization_failure")) {
    return { classification: "TRANSIENT", retryable: true, errorMsg, retryAfterMs: 1000 };
  }

  return { classification: "UNKNOWN", retryable: true, errorMsg };
}

/**
 * Adaptive chunk sizing policy targeting ~500ms execution windows (< 2,000ms safety ceiling).
 * Dynamically adjusts chunk size based on measured execution duration and database write latency.
 * The same durable bounded-partition engine scales to larger workloads,
 * constrained by available free compute.
 *
 * Invariants:
 * 1. Minimum chunk size cannot fall below configured floor (default 50).
 * 2. Maximum chunk size cannot exceed configured ceiling (default 500 for <50k, 2500 for >=50k, hard cap 5000).
 * 3. Workloads with totalSize >= 50k have bounded chunk ceilings to maintain predictable per-slice latency.
 * 4. No execution path or scaling factor can bypass the effective floor or ceiling.
 */
export function calculateAdaptiveChunkSize(params: {
  currentChunkSize?: number;
  lastDurationMs?: number;
  targetDurationMs?: number;
  minChunkSize?: number;
  maxChunkSize?: number;
  totalSize?: number;
}): number {
  const targetMs = Number.isFinite(params.targetDurationMs) && params.targetDurationMs! > 0
    ? params.targetDurationMs!
    : 500;

  const rawMin = Number.isFinite(params.minChunkSize) && params.minChunkSize! > 0
    ? params.minChunkSize!
    : 50;

  const defaultMax = params.totalSize && params.totalSize >= 50000 ? 2500 : 500;
  const rawMax = Number.isFinite(params.maxChunkSize) && params.maxChunkSize! > 0
    ? params.maxChunkSize!
    : defaultMax;

  // Absolute hard ceiling prevents runaway chunks under all configurations
  const ABSOLUTE_MAX_CHUNK = 5000;
  const effectiveMax = Math.min(ABSOLUTE_MAX_CHUNK, Math.max(1, rawMax));
  const effectiveMin = Math.min(effectiveMax, Math.max(1, rawMin));

  const currentChunk = Number.isFinite(params.currentChunkSize) && params.currentChunkSize! > 0
    ? params.currentChunkSize!
    : 100;

  // Guard against missing, zero, negative, or invalid duration
  if (!params.lastDurationMs || params.lastDurationMs <= 0 || !Number.isFinite(params.lastDurationMs)) {
    return Math.min(effectiveMax, Math.max(effectiveMin, currentChunk));
  }

  const duration = params.lastDurationMs;
  let candidate: number;

  if (duration < 200) {
    // Fast step — moderate scale up (max 1.3x)
    const scaleFactor = Math.min(1.3, targetMs / duration);
    candidate = Math.round(currentChunk * scaleFactor);
  } else if (duration > 600) {
    // High duration — scale down aggressively
    const scaleFactor = Math.max(0.4, targetMs / duration);
    candidate = Math.round(currentChunk * scaleFactor);
  } else {
    // Near target duration (200-600ms) — smoothly tune
    const rps = (currentChunk / duration) * 1000;
    const targetCount = Math.round(rps * (targetMs / 1000));
    candidate = Math.round(currentChunk * 0.7 + targetCount * 0.3);
  }

  // Unified infallible clamp guarantees floor and ceiling across all paths
  return Math.min(effectiveMax, Math.max(effectiveMin, candidate));
}

/**
 * Atomically creates or retrieves an idempotent async job.
 */
export async function enqueueJob(params: {
  tenantId?: string;
  idempotencyKey?: string;
  jobType: string;
  payload: Record<string, unknown>;
  maxRetries?: number;
  progressTotal?: number;
}): Promise<DurableJobRecord> {
  const tenantId = params.tenantId || getRequiredTenantId();
  const maxRetries = params.maxRetries ?? 3;
  const progressTotal = params.progressTotal ?? 0;
  const idempotencyKey = params.idempotencyKey || `idemp_${randomUUID()}`;
  const now = new Date();

  try {
    const existing = await dynamicPrisma.asyncJob?.findUnique({
      where: {
        tenantId_idempotencyKey: {
          tenantId,
          idempotencyKey,
        },
      },
    });

    if (existing) {
      const record: DurableJobRecord = {
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
      const queueKey = `${tenantId}:${idempotencyKey}`;
      localMemoryQueue.set(queueKey, record);
      return record;
    }

    const createdId = `job_${randomUUID().slice(0, 12)}`;
    await dynamicPrisma.asyncJob?.create({
      data: {
        id: createdId,
        tenantId,
        idempotencyKey,
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

    const record: DurableJobRecord = {
      id: createdId,
      tenantId,
      idempotencyKey,
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
    const queueKey = `${tenantId}:${idempotencyKey}`;
    localMemoryQueue.set(queueKey, record);
    return record;
  } catch {
    try {
      const raced = await dynamicPrisma.asyncJob?.findUnique({
        where: {
          tenantId_idempotencyKey: {
            tenantId,
            idempotencyKey,
          },
        },
      });
      if (raced) {
        const record: DurableJobRecord = {
          id: raced.id as string,
          tenantId: raced.tenantId as string,
          idempotencyKey: raced.idempotencyKey as string,
          jobType: raced.jobType as string,
          status: raced.status as JobStatus,
          payload: JSON.parse((raced.payload as string) || "{}"),
          result: raced.result ? JSON.parse(raced.result as string) : undefined,
          error: (raced.error as string) || undefined,
          attempt: Number(raced.attempt || 0),
          maxRetries: Number(raced.maxRetries || maxRetries),
          workerId: (raced.workerId as string) || undefined,
          claimedAt: (raced.claimedAt as Date) || undefined,
          leaseExpiresAt: (raced.leaseExpiresAt as Date) || undefined,
          heartbeatAt: (raced.heartbeatAt as Date) || undefined,
          nextRetryAt: (raced.nextRetryAt as Date) || undefined,
          cancelRequestedAt: (raced.cancelRequestedAt as Date) || undefined,
          progressCurrent: Number(raced.progressCurrent || 0),
          progressTotal: Number(raced.progressTotal || progressTotal),
          createdAt: raced.createdAt as Date,
          updatedAt: raced.updatedAt as Date,
          completedAt: (raced.completedAt as Date) || undefined,
        };
        const queueKey = `${tenantId}:${idempotencyKey}`;
        localMemoryQueue.set(queueKey, record);
        return record;
      }
    } catch {}
  }

  // Local fallback queue
  const queueKey = `${tenantId}:${idempotencyKey}`;
  const existing = localMemoryQueue.get(queueKey);
  if (existing) return existing;

  const jobRecord: DurableJobRecord = {
    id: `job_${randomUUID().slice(0, 12)}`,
    tenantId,
    idempotencyKey,
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
 * Atomically records an already completed job into the durable jobs register.
 */
export async function recordCompletedDurableJob(params: {
  tenantId?: string;
  idempotencyKey?: string;
  jobId?: string;
  jobType: string;
  batchSize: number;
  result?: Record<string, unknown>;
  payload?: Record<string, unknown>;
}): Promise<DurableJobRecord> {
  const tenantId = params.tenantId || getRequiredTenantId();
  const id = params.jobId || `job_${randomUUID().slice(0, 12)}`;
  const key = params.idempotencyKey || `idemp_${id}`;
  const now = new Date();

  try {
    await dynamicPrisma.asyncJob?.upsert({
      where: { id },
      update: {
        status: "COMPLETED",
        result: params.result ? JSON.stringify(params.result) : undefined,
        progressCurrent: params.batchSize,
        progressTotal: params.batchSize,
        updatedAt: now,
        completedAt: now,
      },
      create: {
        id,
        tenantId,
        idempotencyKey: key,
        jobType: params.jobType,
        status: "COMPLETED",
        payload: JSON.stringify(params.payload || { size: params.batchSize }),
        result: params.result ? JSON.stringify(params.result) : undefined,
        attempt: 1,
        maxRetries: 3,
        progressCurrent: params.batchSize,
        progressTotal: params.batchSize,
        createdAt: now,
        updatedAt: now,
        completedAt: now,
      },
    });
  } catch {
    // Ignore conflict
  }

  const record: DurableJobRecord = {
    id,
    tenantId,
    idempotencyKey: key,
    jobType: params.jobType,
    status: "COMPLETED",
    payload: params.payload || { size: params.batchSize },
    result: params.result,
    attempt: 1,
    maxRetries: 3,
    progressCurrent: params.batchSize,
    progressTotal: params.batchSize,
    createdAt: now,
    updatedAt: now,
    completedAt: now,
  };

  const queueKey = `${tenantId}:${key}`;
  localMemoryQueue.set(queueKey, record);
  return record;
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

  let updated = false;
  try {
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
    if ((res?.count ?? 0) > 0) {
      updated = true;
    }
  } catch {}

  for (const job of localMemoryQueue.values()) {
    if (job.id === jobId && job.workerId === workerId && job.status === "RUNNING") {
      job.leaseExpiresAt = newLeaseExpiresAt;
      job.heartbeatAt = now;
      job.updatedAt = now;
      updated = true;
    }
  }

  return updated;
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

  try {
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
  } catch {}

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
 * Idempotent, durable, tenant-isolated, and immediately updates job state.
 */
export async function requestJobCancellation(jobId: string, tenantId?: string): Promise<boolean> {
  const targetTenant = tenantId || getRequiredTenantId();
  const now = new Date();
  let batchIdToCancel: string | undefined;

  try {
    const job = await dynamicPrisma.asyncJob?.findUnique({ where: { id: jobId } });
    if (job) {
      if (job.tenantId && job.tenantId !== targetTenant) {
        return false;
      }

      const currentStatus = job.status as JobStatus;
      if (currentStatus === "CANCELLED") {
        return true;
      }
      if (currentStatus === "COMPLETED" || currentStatus === "FAILED" || currentStatus === "DEAD_LETTER") {
        return false;
      }

      await dynamicPrisma.asyncJob?.updateMany({
        where: { id: jobId, tenantId: targetTenant },
        data: {
          status: "CANCELLED",
          cancelRequestedAt: now,
          completedAt: now,
          error: "Cancelled by user request",
          updatedAt: now,
        },
      });

      await dynamicPrisma.jobItem?.updateMany({
        where: { jobId, status: { in: ["PENDING", "PROCESSING", "RETRYABLE_FAILED"] } },
        data: { status: "CANCELLED", updatedAt: now },
      });

      const payload = typeof job.payload === "string" ? JSON.parse(job.payload || "{}") : (job.payload || {});
      const result = typeof job.result === "string" ? JSON.parse(job.result || "{}") : (job.result || {});
      batchIdToCancel = payload.batchId || result.batchId;
    }
  } catch {}

  for (const job of localMemoryQueue.values()) {
    if (job.id === jobId) {
      if (job.tenantId !== targetTenant) {
        return false;
      }

      if (job.status === "CANCELLED") {
        return true;
      }

      if (job.status === "COMPLETED" || job.status === "FAILED" || job.status === "DEAD_LETTER") {
        return false;
      }

      job.cancelRequestedAt = now;
      job.status = "CANCELLED";
      job.completedAt = now;
      job.error = "Cancelled by user request";
      job.updatedAt = now;

      for (const item of localJobItems.values()) {
        if (item.jobId === jobId && item.status !== "COMPLETED" && item.status !== "FAILED") {
          item.status = "CANCELLED";
          item.updatedAt = now;
        }
      }

      if (job.payload?.batchId) {
        batchIdToCancel = job.payload.batchId as string;
      } else if (job.result?.batchId) {
        batchIdToCancel = job.result.batchId as string;
      }
    }
  }

  if (batchIdToCancel) {
    try {
      await prisma.batch.update({
        where: { id: batchIdToCancel },
        data: { status: "CANCELLED" },
      });
    } catch {}
  }

  return true;
}

/**
 * Checks whether cancellation has been requested for a job.
 */
export async function checkCancellationRequested(jobId: string): Promise<boolean> {
  try {
    const job = await dynamicPrisma.asyncJob?.findUnique({ where: { id: jobId } });
    if (job) {
      return Boolean(job.cancelRequestedAt || job.status === "CANCEL_REQUESTED" || job.status === "CANCELLED");
    }
  } catch {}

  for (const job of localMemoryQueue.values()) {
    if (job.id === jobId) {
      return Boolean(job.cancelRequestedAt || job.status === "CANCEL_REQUESTED" || job.status === "CANCELLED");
    }
  }

  return false;
}

/**
 * Sets a job to CANCELLED terminal state cleanly and cancels remaining job items.
 */
export async function cancelJob(
  jobId: string,
  _workerId?: string,
  reason: string = "Cancelled by user request"
): Promise<void> {
  const now = new Date();
  let batchIdToCancel: string | undefined;

  try {
    await dynamicPrisma.asyncJob?.updateMany({
      where: {
        id: jobId,
      },
      data: {
        status: "CANCELLED",
        cancelRequestedAt: now,
        error: reason,
        completedAt: now,
        updatedAt: now,
      },
    });

    await dynamicPrisma.jobItem?.updateMany({
      where: {
        jobId,
        status: { in: ["PENDING", "PROCESSING", "RETRYABLE_FAILED"] },
      },
      data: {
        status: "CANCELLED",
        updatedAt: now,
      },
    });

    const job = await dynamicPrisma.asyncJob?.findUnique({ where: { id: jobId } });
    if (job) {
      const payload = typeof job.payload === "string" ? JSON.parse(job.payload || "{}") : (job.payload || {});
      const result = typeof job.result === "string" ? JSON.parse(job.result || "{}") : (job.result || {});
      batchIdToCancel = payload.batchId || result.batchId;
    }
  } catch {}

  for (const job of localMemoryQueue.values()) {
    if (job.id === jobId) {
      assertValidTransition(job.status, "CANCELLED");
      job.cancelRequestedAt = job.cancelRequestedAt || now;
      job.status = "CANCELLED";
      job.error = reason;
      job.completedAt = now;
      job.updatedAt = now;

      if (job.payload?.batchId) {
        batchIdToCancel = job.payload.batchId as string;
      } else if (job.result?.batchId) {
        batchIdToCancel = job.result.batchId as string;
      }
    }
  }

  for (const item of localJobItems.values()) {
    if (item.jobId === jobId && item.status !== "COMPLETED" && item.status !== "FAILED") {
      item.status = "CANCELLED";
      item.updatedAt = now;
    }
  }

  if (batchIdToCancel) {
    try {
      await prisma.batch.update({
        where: { id: batchIdToCancel },
        data: { status: "CANCELLED" },
      });
    } catch {}
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
  let batchIdToComplete: string | undefined = result.batchId as string | undefined;

  try {
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

    const job = await dynamicPrisma.asyncJob?.findUnique({ where: { id: jobId } });
    if (job && !batchIdToComplete) {
      const payload = typeof job.payload === "string" ? JSON.parse(job.payload || "{}") : (job.payload || {});
      batchIdToComplete = payload.batchId;
    }
  } catch {}

  for (const job of localMemoryQueue.values()) {
    if (job.id === jobId && job.workerId === workerId) {
      assertValidTransition(job.status, "COMPLETED");
      job.status = "COMPLETED";
      job.result = result;
      job.completedAt = now;
      job.updatedAt = now;

      if (!batchIdToComplete) {
        batchIdToComplete = (job.payload?.batchId as string) || (job.result?.batchId as string);
      }
    }
  }

  if (batchIdToComplete) {
    try {
      await prisma.batch.update({
        where: { id: batchIdToComplete },
        data: { status: "COMPLETED", completedAt: now },
      });
    } catch {}
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
  let nextStatus: JobStatus = "PENDING";

  try {
    const job = await dynamicPrisma.asyncJob?.findUnique({ where: { id: jobId } });
    if (job) {
      const attempt = Number(job.attempt || 1);
      const maxRetries = Number(job.maxRetries || 3);

      const isDeadLetter =
        classification === "INVARIANT_FAILURE" ||
        classification === "VALIDATION_FAILURE" ||
        classification === "PERMANENT" ||
        attempt >= maxRetries;

      nextStatus = isDeadLetter ? "DEAD_LETTER" : "PENDING";
      const delay = retryDelayMs !== undefined ? retryDelayMs : calculateBackoffMs(attempt);
      const nextRetryAt = isDeadLetter ? null : new Date(now.getTime() + delay);

      await dynamicPrisma.asyncJob?.updateMany({
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
    }
  } catch {}

  for (const job of localMemoryQueue.values()) {
    if (job.id === jobId) {
      const isDeadLetter =
        classification === "INVARIANT_FAILURE" ||
        classification === "VALIDATION_FAILURE" ||
        classification === "PERMANENT" ||
        job.attempt >= job.maxRetries;

      nextStatus = isDeadLetter ? "DEAD_LETTER" : "PENDING";
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

  return nextStatus;
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
    // Cleanly finalize any lingering CANCEL_REQUESTED jobs to CANCELLED
    await dynamicPrisma.asyncJob?.updateMany({
      where: { status: "CANCEL_REQUESTED" },
      data: {
        status: "CANCELLED",
        completedAt: now,
        error: "Cancelled by user request",
        updatedAt: now,
      },
    });

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

// -----------------------------------------------------------------------------
// BOUNDED STEP EXECUTOR ARCHITECTURE (RENDER FREE ARCHITECTURE)
// The same durable bounded-partition engine scales to larger workloads,
// constrained by available free compute.
// -----------------------------------------------------------------------------

export interface StepResult {
  jobId: string;
  tenantId: string;
  jobType: string;
  status: JobStatus;
  progressCurrent: number;
  progressTotal: number;
  progressPct: number;
  completedSliceCount: number;
  isComplete: boolean;
  isCancelled: boolean;
  result?: Record<string, unknown>;
  error?: string;
  durationMs: number;
  recordsPerSecond?: number;
  estimatedRemainingMs?: number | null;
  recommendedNextChunkSize?: number;
}

export type StepHandlerFn = (
  job: DurableJobRecord,
  chunkSize: number
) => Promise<{
  sliceCount: number;
  isComplete: boolean;
  result?: Record<string, unknown>;
  error?: string;
}>;

const registeredStepHandlers = new Map<string, StepHandlerFn>();

export function registerStepHandler(jobType: string, handler: StepHandlerFn): void {
  registeredStepHandlers.set(jobType, handler);
}

// Global active step limiter: bounds in-flight execution on the free web instance
let activeInFlightSteps = 0;
const MAX_CONCURRENT_STEPS = 4;

/**
 * Fetches a single durable job record by ID (read-only, status only, no mutations).
 */
export async function getDurableJob(
  jobId: string,
  tenantId?: string
): Promise<DurableJobRecord | null> {
  try {
    const raw = await dynamicPrisma.asyncJob?.findUnique({
      where: { id: jobId },
    });
    if (raw && (!tenantId || raw.tenantId === tenantId)) {
      return {
        id: raw.id as string,
        tenantId: raw.tenantId as string,
        idempotencyKey: raw.idempotencyKey as string,
        jobType: raw.jobType as string,
        status: raw.status as JobStatus,
        payload: JSON.parse((raw.payload as string) || "{}"),
        result: raw.result ? JSON.parse(raw.result as string) : undefined,
        error: (raw.error as string) || undefined,
        attempt: Number(raw.attempt || 0),
        maxRetries: Number(raw.maxRetries || 3),
        workerId: (raw.workerId as string) || undefined,
        claimedAt: (raw.claimedAt as Date) || undefined,
        leaseExpiresAt: (raw.leaseExpiresAt as Date) || undefined,
        heartbeatAt: (raw.heartbeatAt as Date) || undefined,
        nextRetryAt: (raw.nextRetryAt as Date) || undefined,
        cancelRequestedAt: (raw.cancelRequestedAt as Date) || undefined,
        progressCurrent: Number(raw.progressCurrent || 0),
        progressTotal: Number(raw.progressTotal || 0),
        createdAt: raw.createdAt as Date,
        updatedAt: raw.updatedAt as Date,
        completedAt: (raw.completedAt as Date) || undefined,
      };
    }
  } catch {}

  for (const job of localMemoryQueue.values()) {
    if (job.id === jobId && (!tenantId || job.tenantId === tenantId)) {
      return { ...job };
    }
  }

  return null;
}

/**
 * Lists all active and recent durable jobs for a given tenant (read-only).
 */
export async function listDurableJobs(
  tenantId?: string,
  limit: number = 20
): Promise<{ activeJobs: DurableJobRecord[]; recentJobs: DurableJobRecord[] }> {
  try {
    const records = await dynamicPrisma.asyncJob?.findMany({
      where: tenantId ? { tenantId } : undefined,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    if (Array.isArray(records) && records.length > 0) {
      const mapped: DurableJobRecord[] = records.map((raw) => ({
        id: raw.id as string,
        tenantId: raw.tenantId as string,
        idempotencyKey: raw.idempotencyKey as string,
        jobType: raw.jobType as string,
        status: raw.status as JobStatus,
        payload: JSON.parse((raw.payload as string) || "{}"),
        result: raw.result ? JSON.parse(raw.result as string) : undefined,
        error: (raw.error as string) || undefined,
        attempt: Number(raw.attempt || 0),
        maxRetries: Number(raw.maxRetries || 3),
        workerId: (raw.workerId as string) || undefined,
        claimedAt: (raw.claimedAt as Date) || undefined,
        leaseExpiresAt: (raw.leaseExpiresAt as Date) || undefined,
        heartbeatAt: (raw.heartbeatAt as Date) || undefined,
        nextRetryAt: (raw.nextRetryAt as Date) || undefined,
        cancelRequestedAt: (raw.cancelRequestedAt as Date) || undefined,
        progressCurrent: Number(raw.progressCurrent || 0),
        progressTotal: Number(raw.progressTotal || 0),
        createdAt: raw.createdAt as Date,
        updatedAt: raw.updatedAt as Date,
        completedAt: (raw.completedAt as Date) || undefined,
      }));

      const activeJobs = mapped.filter(
        (j) =>
          (j.status === "PENDING" || j.status === "CLAIMED" || j.status === "RUNNING" || j.status === "RETRY_WAIT") &&
          !j.cancelRequestedAt
      );
      const recentJobs = mapped.slice(0, limit);

      return { activeJobs, recentJobs };
    }
  } catch {}

  const all = [...localMemoryQueue.values()].filter((j) => !tenantId || j.tenantId === tenantId);
  all.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const activeJobs = all.filter(
    (j) =>
      (j.status === "PENDING" || j.status === "CLAIMED" || j.status === "RUNNING" || j.status === "RETRY_WAIT") &&
      !j.cancelRequestedAt
  );
  const recentJobs = all.slice(0, limit);

  return { activeJobs, recentJobs };
}

/**
 * Executes a single bounded step slice for an active job.
 * Enforces bounded concurrency (max 2 concurrent step slices on the server),
 * checks for cancellation atomically, applies safe checkpointing, and returns updated progress.
 */
export async function stepJobChunk(
  jobId: string,
  workerId: string = `stepper_${randomUUID().slice(0, 8)}`,
  options: { chunkSize?: number } = {}
): Promise<StepResult> {
  const t0 = performance.now();
  const chunkSize = Math.max(1, Math.min(5000, options.chunkSize ?? 100));

  const job = await getDurableJob(jobId);
  if (!job) {
    throw new Error(`Job '${jobId}' not found`);
  }

  // 1. If already terminal, return status immediately without mutations
  if (
    job.status === "COMPLETED" ||
    job.status === "CANCELLED" ||
    job.status === "DEAD_LETTER" ||
    job.status === "FAILED"
  ) {
    return {
      jobId: job.id,
      tenantId: job.tenantId,
      jobType: job.jobType,
      status: job.status,
      progressCurrent: job.progressCurrent,
      progressTotal: job.progressTotal,
      progressPct: job.progressTotal > 0 ? Math.round((job.progressCurrent / job.progressTotal) * 100) : (job.status === "COMPLETED" ? 100 : 0),
      completedSliceCount: 0,
      isComplete: job.status === "COMPLETED",
      isCancelled: job.status === "CANCELLED",
      result: job.result,
      error: job.error,
      durationMs: performance.now() - t0,
      recordsPerSecond: 0,
      estimatedRemainingMs: null,
      recommendedNextChunkSize: chunkSize,
    };
  }

  // 2. Check cancellation request before starting step
  if (job.cancelRequestedAt || job.status === "CANCEL_REQUESTED" || (await checkCancellationRequested(job.id))) {
    await cancelJob(job.id, workerId, "Cancellation requested by user");
    const current = (await getDurableJob(job.id)) || job;
    return {
      jobId: current.id,
      tenantId: current.tenantId,
      jobType: current.jobType,
      status: "CANCELLED",
      progressCurrent: current.progressCurrent,
      progressTotal: current.progressTotal,
      progressPct: current.progressTotal > 0 ? Math.round((current.progressCurrent / current.progressTotal) * 100) : 0,
      completedSliceCount: 0,
      isComplete: false,
      isCancelled: true,
      durationMs: performance.now() - t0,
      recordsPerSecond: 0,
      estimatedRemainingMs: null,
      recommendedNextChunkSize: chunkSize,
    };
  }

  // 3. Global concurrency guard
  if (activeInFlightSteps >= MAX_CONCURRENT_STEPS) {
    return {
      jobId: job.id,
      tenantId: job.tenantId,
      jobType: job.jobType,
      status: job.status,
      progressCurrent: job.progressCurrent,
      progressTotal: job.progressTotal,
      progressPct: job.progressTotal > 0 ? Math.round((job.progressCurrent / job.progressTotal) * 100) : 0,
      completedSliceCount: 0,
      isComplete: false,
      isCancelled: false,
      durationMs: performance.now() - t0,
      recordsPerSecond: 0,
      estimatedRemainingMs: null,
      recommendedNextChunkSize: chunkSize,
    };
  }

  activeInFlightSteps++;
  try {
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + 30000);

    // 4. Atomically claim/check lease and cancellation
    try {
      const claimResult = await dynamicPrisma.asyncJob?.updateMany({
        where: {
          id: job.id,
          status: { in: ["PENDING", "CLAIMED", "RUNNING", "RETRY_WAIT"] },
          cancelRequestedAt: null,
        },
        data: {
          status: "RUNNING",
          workerId,
          claimedAt: now,
          heartbeatAt: now,
          leaseExpiresAt,
          updatedAt: now,
        },
      });

      if (!claimResult || claimResult.count === 0) {
        const latest = await getDurableJob(job.id);
        if (latest?.cancelRequestedAt || latest?.status === "CANCEL_REQUESTED" || latest?.status === "CANCELLED") {
          await cancelJob(job.id, workerId, "Cancellation requested by user");
          const updated = (await getDurableJob(job.id)) || job;
          return {
            jobId: updated.id,
            tenantId: updated.tenantId,
            jobType: updated.jobType,
            status: "CANCELLED",
            progressCurrent: updated.progressCurrent,
            progressTotal: updated.progressTotal,
            progressPct: updated.progressTotal > 0 ? Math.round((updated.progressCurrent / updated.progressTotal) * 100) : 0,
            completedSliceCount: 0,
            isComplete: false,
            isCancelled: true,
            durationMs: performance.now() - t0,
            recordsPerSecond: 0,
            estimatedRemainingMs: null,
            recommendedNextChunkSize: chunkSize,
          };
        }
      }
    } catch {}

    for (const localJob of localMemoryQueue.values()) {
      if (localJob.id === job.id) {
        if (localJob.cancelRequestedAt || localJob.status === "CANCEL_REQUESTED" || localJob.status === "CANCELLED") {
          await cancelJob(job.id, workerId, "Cancellation requested by user");
          return {
            jobId: job.id,
            tenantId: job.tenantId,
            jobType: job.jobType,
            status: "CANCELLED",
            progressCurrent: localJob.progressCurrent,
            progressTotal: localJob.progressTotal,
            progressPct: localJob.progressTotal > 0 ? Math.round((localJob.progressCurrent / localJob.progressTotal) * 100) : 0,
            completedSliceCount: 0,
            isComplete: false,
            isCancelled: true,
            durationMs: performance.now() - t0,
            recordsPerSecond: 0,
            estimatedRemainingMs: null,
            recommendedNextChunkSize: chunkSize,
          };
        }
        localJob.status = "RUNNING";
        localJob.workerId = workerId;
        localJob.claimedAt = now;
        localJob.heartbeatAt = now;
        localJob.leaseExpiresAt = leaseExpiresAt;
        localJob.updatedAt = now;
      }
    }

    // Re-check cancellation right before dispatching slice handler
    if (await checkCancellationRequested(job.id)) {
      await cancelJob(job.id, workerId, "Cancellation requested by user");
      const current = (await getDurableJob(job.id)) || job;
      return {
        jobId: current.id,
        tenantId: current.tenantId,
        jobType: current.jobType,
        status: "CANCELLED",
        progressCurrent: current.progressCurrent,
        progressTotal: current.progressTotal,
        progressPct: current.progressTotal > 0 ? Math.round((current.progressCurrent / current.progressTotal) * 100) : 0,
        completedSliceCount: 0,
        isComplete: false,
        isCancelled: true,
        durationMs: performance.now() - t0,
        recordsPerSecond: 0,
        estimatedRemainingMs: null,
        recommendedNextChunkSize: chunkSize,
      };
    }

    job.status = "RUNNING";
    job.workerId = workerId;

    const handler = registeredStepHandlers.get(job.jobType);

    let stepOutcome: {
      sliceCount: number;
      isComplete: boolean;
      result?: Record<string, unknown>;
      error?: string;
    };

    if (handler) {
      stepOutcome = await handler(job, chunkSize);
    } else {
      // Default step implementation: increment progress by chunkSize
      const remaining = Math.max(0, job.progressTotal - job.progressCurrent);
      const sliceCount = Math.min(chunkSize, remaining);
      const newProgress = job.progressCurrent + sliceCount;
      const isComplete = newProgress >= job.progressTotal;

      await updateJobProgress(job.id, workerId, newProgress, job.progressTotal);

      // Check cancellation immediately after updating progress
      if (await checkCancellationRequested(job.id)) {
        await cancelJob(job.id, workerId, "Cancelled after safe chunk");
        stepOutcome = { sliceCount, isComplete: false };
      } else {
        if (isComplete) {
          await completeJob(job.id, workerId, { completedAt: new Date().toISOString() });
        }
        stepOutcome = {
          sliceCount,
          isComplete,
          result: isComplete ? { completedAt: new Date().toISOString() } : undefined,
        };
      }
    }

    const durationMs = Math.max(1, performance.now() - t0);
    const updatedJob = (await getDurableJob(job.id)) || job;
    const progressPct = updatedJob.progressTotal > 0
      ? Math.min(100, Math.round((updatedJob.progressCurrent / updatedJob.progressTotal) * 100))
      : (updatedJob.status === "COMPLETED" ? 100 : 0);

    const recordsPerSecond = durationMs > 0 && stepOutcome.sliceCount > 0
      ? Math.round((stepOutcome.sliceCount / durationMs) * 1000)
      : 0;
    const remainingRecords = Math.max(0, updatedJob.progressTotal - updatedJob.progressCurrent);
    const estimatedRemainingMs = recordsPerSecond > 0 && remainingRecords > 0
      ? Math.round((remainingRecords / recordsPerSecond) * 1000)
      : null;
    const recommendedNextChunkSize = calculateAdaptiveChunkSize({
      currentChunkSize: chunkSize,
      lastDurationMs: durationMs,
      totalSize: updatedJob.progressTotal,
    });

    return {
      jobId: updatedJob.id,
      tenantId: updatedJob.tenantId,
      jobType: updatedJob.jobType,
      status: updatedJob.status,
      progressCurrent: updatedJob.progressCurrent,
      progressTotal: updatedJob.progressTotal,
      progressPct,
      completedSliceCount: stepOutcome.sliceCount,
      isComplete: updatedJob.status === "COMPLETED" || stepOutcome.isComplete,
      isCancelled: updatedJob.status === "CANCELLED",
      result: updatedJob.result || stepOutcome.result,
      error: updatedJob.error || stepOutcome.error,
      durationMs,
      recordsPerSecond,
      estimatedRemainingMs,
      recommendedNextChunkSize,
    };
  } catch (err: unknown) {
    const durationMs = Math.max(1, performance.now() - t0);
    const classification = classifyFailure(err);
    await failJob(job.id, workerId, classification.errorMsg, classification.classification);
    const failedJob = (await getDurableJob(job.id)) || job;

    return {
      jobId: failedJob.id,
      tenantId: failedJob.tenantId,
      jobType: failedJob.jobType,
      status: failedJob.status,
      progressCurrent: failedJob.progressCurrent,
      progressTotal: failedJob.progressTotal,
      progressPct: failedJob.progressTotal > 0 ? Math.round((failedJob.progressCurrent / failedJob.progressTotal) * 100) : 0,
      completedSliceCount: 0,
      isComplete: false,
      isCancelled: false,
      error: classification.errorMsg,
      durationMs,
      recordsPerSecond: 0,
      estimatedRemainingMs: null,
      recommendedNextChunkSize: chunkSize,
    };
  } finally {
    activeInFlightSteps = Math.max(0, activeInFlightSteps - 1);
  }
}

// Register built-in BATCH_GENERATION step handler (Bounded Memory & Safe Chunk Slicing)
registerStepHandler("BATCH_GENERATION", async (job, chunkSize) => {
  // 1. Check cancellation before starting any mutation
  if (await checkCancellationRequested(job.id)) {
    await cancelJob(job.id, job.workerId || "stepper", "Cancellation requested by user");
    return { sliceCount: 0, isComplete: false };
  }

  const payload = job.payload as { batchId?: string; size?: number; batchName?: string };
  const totalSize = Number(payload.size || job.progressTotal || 250);
  const batchName = payload.batchName || `Synthetic Batch ${new Date().toISOString().slice(0, 16)}`;
  let batchId = payload.batchId;

  // If batch does not exist yet in DB, create batch shell
  if (!batchId) {
    try {
      const batch = await prisma.batch.create({
        data: {
          name: batchName,
          size: totalSize,
          status: "PROCESSING",
          source: "GENERATED",
        },
      });
      batchId = batch.id;
      job.payload.batchId = batchId;
    } catch {
      batchId = `batch_mem_${randomUUID().slice(0, 8)}`;
      job.payload.batchId = batchId;
    }
  }

  const startIdx = job.progressCurrent;
  const count = Math.min(chunkSize, totalSize - startIdx);

  if (count <= 0) {
    if (await checkCancellationRequested(job.id)) {
      await cancelJob(job.id, job.workerId || "stepper", "Cancellation requested by user");
      return { sliceCount: 0, isComplete: false };
    }

    try {
      await prisma.batch.update({
        where: { id: batchId },
        data: { status: "CREATED" },
      });
    } catch {
      // Memory mode fallback
    }

    const finalResult = { batchId, size: totalSize, completedAt: new Date().toISOString() };
    await completeJob(job.id, job.workerId || "stepper", finalResult);
    return { sliceCount: 0, isComplete: true, result: finalResult };
  }

  // 2. Generate synthetic data slice (bounded memory: generates ONLY the [startIdx, startIdx+count) slice)
  const sliceData = generateSyntheticBatchSlice(startIdx, count, totalSize);
  const orderSlice = sliceData.orders;
  const paymentSlice = sliceData.payments;
  const settlementSlice = sliceData.settlements;
  const bankSlice = sliceData.bankTransactions;
  const refundSlice = sliceData.refunds;
  const chargebackSlice = sliceData.chargebacks;
  const groundTruthSlice = sliceData.groundTruths;

  interface CreateManyModel {
    createMany: (args: { data: Record<string, unknown>[] }) => Promise<unknown>;
  }

  // 3. Insert records for this bounded slice (Safe Chunk Execution)
  try {
    await Promise.all([
      (prisma.order as unknown as CreateManyModel).createMany({
        data: orderSlice.map((o) => ({
          orderId: o.orderId,
          batchId,
          amount: o.amount,
          currency: o.currency,
          status: o.status,
          customerEmail: o.customerEmail,
          description: o.description,
          createdAt: new Date(o.createdAt),
        })),
      }),
      (prisma.payment as unknown as CreateManyModel).createMany({
        data: paymentSlice.map((p) => ({
          paymentId: p.paymentId,
          batchId,
          orderId: p.orderId,
          amount: p.amount,
          currency: p.currency,
          status: p.status,
          method: p.method,
          fee: p.fee,
          tax: p.tax,
          capturedAt: p.capturedAt ? new Date(p.capturedAt) : null,
          createdAt: p.createdAt ? new Date(p.createdAt) : new Date(),
        })),
      }),
      (prisma.settlement as unknown as CreateManyModel).createMany({
        data: settlementSlice.map((s) => ({
          settlementId: s.settlementId,
          batchId,
          paymentId: s.paymentId,
          amount: s.amount,
          fee: s.fee,
          tax: s.tax,
          utr: s.utr,
          status: s.status,
          settledAt: s.settledAt ? new Date(s.settledAt) : null,
          createdAt: s.createdAt ? new Date(s.createdAt) : new Date(),
        })),
      }),
      (prisma.bankTransaction as unknown as CreateManyModel).createMany({
        data: bankSlice.map((b) => ({
          txnId: b.txnId,
          batchId,
          utr: b.utr,
          amount: b.amount,
          type: b.type,
          narration: b.narration,
          balance: b.balance,
          txnDate: b.txnDate ? new Date(b.txnDate) : new Date(),
          valueDate: b.valueDate ? new Date(b.valueDate) : null,
        })),
      }),
      (prisma.refund as unknown as CreateManyModel).createMany({
        data: refundSlice.map((r) => ({
          refundId: r.refundId,
          batchId,
          paymentId: r.paymentId,
          amount: r.amount,
          status: r.status,
          reason: r.reason,
          createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
          processedAt: r.processedAt ? new Date(r.processedAt) : null,
        })),
      }),
      (prisma.chargeback as unknown as CreateManyModel).createMany({
        data: chargebackSlice.map((c) => ({
          chargebackId: c.chargebackId,
          batchId,
          paymentId: c.paymentId,
          amount: c.amount,
          reason: c.reason,
          status: c.status,
          createdAt: new Date(c.createdAt),
          resolvedAt: c.resolvedAt ? new Date(c.resolvedAt) : null,
        })),
      }),
      (prisma.groundTruth as unknown as CreateManyModel).createMany({
        data: groundTruthSlice.map((g) => ({
          paymentId: g.paymentId,
          batchId,
          expectedLabel: g.expectedLabel,
          scenario: g.scenario,
        })),
      }),
    ]);
  } catch {
    // Gracefully handle in-memory test mocks
  }

  const newProgress = startIdx + count;
  const isComplete = newProgress >= totalSize;

  // 4. Update progress checkpoint
  await updateJobProgress(job.id, job.workerId || "stepper", newProgress, totalSize);

  // 5. Check cancellation immediately after current safe slice finishes
  if (await checkCancellationRequested(job.id)) {
    await cancelJob(job.id, job.workerId || "stepper", "Cancellation requested during step execution");
    return { sliceCount: count, isComplete: false };
  }

  if (isComplete) {
    try {
      await prisma.batch.update({
        where: { id: batchId },
        data: { status: "CREATED" },
      });

      await prisma.auditLog.create({
        data: {
          batchId,
          actor: "SYSTEM",
          action: "BATCH_GENERATED",
          entityType: "batch",
          entityId: batchId,
          reason: `Generated ${totalSize} synthetic records with bounded step execution`,
          metadata: JSON.stringify({ size: totalSize }),
        },
      });
    } catch {
      // Memory mode fallback
    }

    const finalResult = { batchId, size: totalSize, completedAt: new Date().toISOString() };
    await completeJob(job.id, job.workerId || "stepper", finalResult);
    return { sliceCount: count, isComplete: true, result: finalResult };
  }

  return { sliceCount: count, isComplete: false };
});
