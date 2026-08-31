/*
 * SettleMate AI — Unified Operational Persistence Repository Layer
 *
 * Provides a single, authoritative persistence interface for:
 *   1. Reconciliation & Async Jobs (UnifiedJobRepository)
 *   2. Merkle DAG Decision Receipts (UnifiedReceiptRepository)
 *   3. Webhook Subscriptions & Delivery Logs (UnifiedWebhookRepository)
 *   4. AI Claim Investigation Logs (UnifiedAiClaimLogRepository)
 *   5. Audit & Compliance Ledger (UnifiedAuditLedgerRepository)
 *   6. Verification Hub Progress (UnifiedProgressRepository)
 *
 * In Production (PostgreSQL):
 *   Executes transactional, tenant-isolated operations via Prisma PostgreSQL client.
 * In Local Development (SQLite):
 *   Seamlessly falls back to local SQLite tables when DATABASE_URL is 'file:'.
 */

import { getRequiredTenantId, withTenantContext } from "@/lib/tenant/tenant-context";
import * as nativeSqlite from "./sqlite-db";

interface PrismaDynamicClient {
  asyncJob?: {
    upsert: (args: Record<string, unknown>) => Promise<unknown>;
    updateMany: (args: Record<string, unknown>) => Promise<unknown>;
    findFirst?: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
    findMany?: (args: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
  };
  decisionReceipt?: {
    upsert: (args: Record<string, unknown>) => Promise<unknown>;
    findFirst?: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
  };
  webhookSubscription?: {
    upsert: (args: Record<string, unknown>) => Promise<unknown>;
    findFirst?: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
  };
  webhookOutbox?: {
    create: (args: Record<string, unknown>) => Promise<unknown>;
  };
  aiClaimLog?: {
    create: (args: Record<string, unknown>) => Promise<unknown>;
  };
  auditLog?: {
    create: (args: Record<string, unknown>) => Promise<unknown>;
  };
  domainEvent?: {
    create: (args: Record<string, unknown>) => Promise<unknown>;
    findMany?: (args: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
  };
}

function isPostgres(): boolean {
  const url = process.env.DATABASE_URL || "";
  return url.startsWith("postgres://") || url.startsWith("postgresql://");
}

// -----------------------------------------------------------------------------
// 1. RECONCILIATION & ASYNC JOB REPOSITORY
// -----------------------------------------------------------------------------
export interface UnifiedJob {
  jobId: string;
  tenantId?: string;
  type?: string;
  jobType?: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELED";
  createdAt: string;
  startedAt?: string;
  updatedAt?: string;
  completedAt?: string;
  progressPct?: number;
  retryCount?: number;
  retryable?: boolean;
  errorCode?: string;
  webhookUrl?: string;
  batchSize: number;
  summary?: string;
  exceptions?: string;
  receipt?: string;
  error?: string;
}

// In-memory tenant mapping for local fallback / development
const localTenantJobMap = new Map<string, string>();

export const UnifiedJobRepository = {
  save(job: UnifiedJob): void {
    if (job.tenantId) {
      localTenantJobMap.set(job.jobId, job.tenantId);
    }
    if (isPostgres()) {
      const tenantId = job.tenantId || getRequiredTenantId();
      withTenantContext(tenantId, async (tx) => {
        await (tx as unknown as PrismaDynamicClient).asyncJob?.upsert({
          where: {
            tenantId_idempotencyKey: {
              tenantId,
              idempotencyKey: job.jobId,
            },
          },
          update: {
            status: job.status,
            result: JSON.stringify({
              summary: job.summary,
              exceptions: job.exceptions,
              receipt: job.receipt,
              webhookUrl: job.webhookUrl,
            }),
            error: job.error,
            completedAt: job.completedAt ? new Date(job.completedAt) : undefined,
          },
          create: {
            id: job.jobId,
            tenantId,
            idempotencyKey: job.jobId,
            jobType: job.type || job.jobType || "RECONCILIATION_BATCH",
            status: job.status,
            payload: JSON.stringify({ batchSize: job.batchSize, webhookUrl: job.webhookUrl }),
            result: JSON.stringify({
              summary: job.summary,
              exceptions: job.exceptions,
              receipt: job.receipt,
            }),
            error: job.error,
            createdAt: new Date(job.createdAt),
            completedAt: job.completedAt ? new Date(job.completedAt) : undefined,
          },
        });
      }).catch((err: unknown) => console.error("[PostgresJobRepo] Save error:", err));
    }

    // Local SQLite cache & fallback
    nativeSqlite.JobRepository.save({
      jobId: job.jobId,
      tenantId: job.tenantId,
      jobType: job.type || job.jobType,
      status: job.status,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      updatedAt: job.updatedAt,
      completedAt: job.completedAt,
      progressPct: job.progressPct,
      retryCount: job.retryCount,
      retryable: job.retryable ? 1 : 0,
      errorCode: job.errorCode,
      webhookUrl: job.webhookUrl,
      batchSize: job.batchSize,
      summary: job.summary,
      exceptions: job.exceptions,
      receipt: job.receipt,
      error: job.error,
    });
  },

  async saveAsync(job: UnifiedJob): Promise<void> {
    if (job.tenantId) {
      localTenantJobMap.set(job.jobId, job.tenantId);
    }
    if (isPostgres()) {
      const tenantId = job.tenantId || getRequiredTenantId();
      try {
        await withTenantContext(tenantId, async (tx) => {
          await (tx as unknown as PrismaDynamicClient).asyncJob?.upsert({
            where: {
              tenantId_idempotencyKey: {
                tenantId,
                idempotencyKey: job.jobId,
              },
            },
            update: {
              status: job.status,
              result: JSON.stringify({
                summary: job.summary,
                exceptions: job.exceptions,
                receipt: job.receipt,
                webhookUrl: job.webhookUrl,
              }),
              error: job.error,
              completedAt: job.completedAt ? new Date(job.completedAt) : undefined,
            },
            create: {
              id: job.jobId,
              tenantId,
              idempotencyKey: job.jobId,
              jobType: job.type || job.jobType || "RECONCILIATION_BATCH",
              status: job.status,
              payload: JSON.stringify({ batchSize: job.batchSize, webhookUrl: job.webhookUrl }),
              result: JSON.stringify({
                summary: job.summary,
                exceptions: job.exceptions,
                receipt: job.receipt,
              }),
              error: job.error,
              createdAt: new Date(job.createdAt),
              completedAt: job.completedAt ? new Date(job.completedAt) : undefined,
            },
          });
        });
      } catch (err: unknown) {
        console.error("[PostgresJobRepo] saveAsync error:", err);
      }
    }

    nativeSqlite.JobRepository.save({
      jobId: job.jobId,
      tenantId: job.tenantId,
      jobType: job.type || job.jobType,
      status: job.status,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      updatedAt: job.updatedAt,
      completedAt: job.completedAt,
      progressPct: job.progressPct,
      retryCount: job.retryCount,
      retryable: job.retryable ? 1 : 0,
      errorCode: job.errorCode,
      webhookUrl: job.webhookUrl,
      batchSize: job.batchSize,
      summary: job.summary,
      exceptions: job.exceptions,
      receipt: job.receipt,
      error: job.error,
    });
  },

  async getAsync(jobId: string, tenantId?: string): Promise<UnifiedJob | null> {
    if (isPostgres()) {
      const activeTenant = tenantId || getRequiredTenantId();
      try {
        const found = await withTenantContext(activeTenant, async (tx) => {
          const client = tx as unknown as PrismaDynamicClient;
          return client.asyncJob?.findFirst
            ? client.asyncJob.findFirst({
                where: { id: jobId, tenantId: activeTenant },
              })
            : null;
        });
        if (found) {
          let summary: string | undefined;
          let exceptions: string | undefined;
          let receipt: string | undefined;
          let webhookUrl: string | undefined;
          const resultStr = typeof found.result === "string" ? found.result : undefined;
          if (resultStr) {
            try {
              const parsed = JSON.parse(resultStr);
              summary = parsed.summary;
              exceptions = parsed.exceptions;
              receipt = parsed.receipt;
              webhookUrl = parsed.webhookUrl;
            } catch {}
          }
          const payloadStr = typeof found.payload === "string" ? found.payload : undefined;
          if (payloadStr && !webhookUrl) {
            try {
              const p = JSON.parse(payloadStr);
              webhookUrl = p.webhookUrl;
            } catch {}
          }
          let batchSize = 0;
          if (payloadStr) {
            try {
              batchSize = Number(JSON.parse(payloadStr).batchSize || 0);
            } catch {}
          }
          return {
            jobId: String(found.id),
            tenantId: found.tenantId ? String(found.tenantId) : undefined,
            type: found.jobType ? String(found.jobType) : undefined,
            jobType: found.jobType ? String(found.jobType) : undefined,
            status: found.status as UnifiedJob["status"],
            createdAt: found.createdAt ? new Date(found.createdAt as string | Date).toISOString() : new Date().toISOString(),
            completedAt: found.completedAt ? new Date(found.completedAt as string | Date).toISOString() : undefined,
            webhookUrl,
            batchSize,
            summary,
            exceptions,
            receipt,
            error: found.error ? String(found.error) : undefined,
          };
        }
      } catch (err) {
        console.error("[PostgresJobRepo] getAsync error:", err);
      }
    }
    const local = nativeSqlite.JobRepository.get(jobId, tenantId);
    if (!local) return null;
    return {
      jobId: local.jobId,
      tenantId: local.tenantId || localTenantJobMap.get(local.jobId),
      type: local.jobType,
      jobType: local.jobType,
      status: local.status,
      createdAt: local.createdAt,
      startedAt: local.startedAt,
      updatedAt: local.updatedAt,
      completedAt: local.completedAt,
      progressPct: local.progressPct,
      retryCount: local.retryCount,
      retryable: Boolean(local.retryable),
      errorCode: local.errorCode,
      webhookUrl: local.webhookUrl,
      batchSize: local.batchSize,
      summary: local.summary,
      exceptions: local.exceptions,
      receipt: local.receipt,
      error: local.error,
    };
  },

  get(jobId: string, tenantId?: string): UnifiedJob | null {
    const local = nativeSqlite.JobRepository.get(jobId, tenantId);
    if (local) {
      return {
        jobId: local.jobId,
        tenantId: local.tenantId || localTenantJobMap.get(local.jobId),
        type: local.jobType,
        jobType: local.jobType,
        status: local.status,
        createdAt: local.createdAt,
        startedAt: local.startedAt,
        updatedAt: local.updatedAt,
        completedAt: local.completedAt,
        progressPct: local.progressPct,
        retryCount: local.retryCount,
        retryable: Boolean(local.retryable),
        errorCode: local.errorCode,
        webhookUrl: local.webhookUrl,
        batchSize: local.batchSize,
        summary: local.summary,
        exceptions: local.exceptions,
        receipt: local.receipt,
        error: local.error,
      };
    }
    return null;
  },

  list(limit: number = 50, tenantId?: string): UnifiedJob[] {
    const items = nativeSqlite.JobRepository.list(limit, tenantId).map((j) => ({
      jobId: j.jobId,
      tenantId: j.tenantId || localTenantJobMap.get(j.jobId),
      type: j.jobType,
      jobType: j.jobType,
      status: j.status,
      createdAt: j.createdAt,
      startedAt: j.startedAt,
      updatedAt: j.updatedAt,
      completedAt: j.completedAt,
      progressPct: j.progressPct,
      retryCount: j.retryCount,
      retryable: Boolean(j.retryable),
      errorCode: j.errorCode,
      webhookUrl: j.webhookUrl,
      batchSize: j.batchSize,
      summary: j.summary,
      exceptions: j.exceptions,
      receipt: j.receipt,
      error: j.error,
    }));
    return items;
  },

  getAll(tenantId?: string): UnifiedJob[] {
    return nativeSqlite.JobRepository.getAll(tenantId).map((j) => ({
      jobId: j.jobId,
      tenantId: j.tenantId || localTenantJobMap.get(j.jobId),
      type: j.jobType,
      jobType: j.jobType,
      status: j.status,
      createdAt: j.createdAt,
      startedAt: j.startedAt,
      updatedAt: j.updatedAt,
      completedAt: j.completedAt,
      progressPct: j.progressPct,
      retryCount: j.retryCount,
      retryable: Boolean(j.retryable),
      errorCode: j.errorCode,
      webhookUrl: j.webhookUrl,
      batchSize: j.batchSize,
      summary: j.summary,
      exceptions: j.exceptions,
      receipt: j.receipt,
      error: j.error,
    }));
  },

  async listAsync(tenantId?: string, limit: number = 20): Promise<UnifiedJob[]> {
    if (isPostgres()) {
      const activeTenant = tenantId || getRequiredTenantId();
      try {
        const found = await withTenantContext(activeTenant, async (tx) => {
          const client = tx as unknown as PrismaDynamicClient;
          return client.asyncJob?.findMany
            ? client.asyncJob.findMany({
                where: { tenantId: activeTenant },
                orderBy: { createdAt: "desc" },
                take: limit,
              })
            : [];
        });
        if (Array.isArray(found) && found.length > 0) {
          return found.map((item) => {
            let summary: string | undefined;
            let exceptions: string | undefined;
            let receipt: string | undefined;
            let webhookUrl: string | undefined;
            const resultStr = typeof item.result === "string" ? item.result : undefined;
            if (resultStr) {
              try {
                const parsed = JSON.parse(resultStr);
                summary = parsed.summary;
                exceptions = parsed.exceptions;
                receipt = parsed.receipt;
                webhookUrl = parsed.webhookUrl;
              } catch {}
            }
            const payloadStr = typeof item.payload === "string" ? item.payload : undefined;
            let batchSize = 0;
            if (payloadStr) {
              try {
                const p = JSON.parse(payloadStr);
                if (!webhookUrl) webhookUrl = p.webhookUrl;
                batchSize = Number(p.batchSize || 0);
              } catch {}
            }
            return {
              jobId: String(item.id),
              tenantId: item.tenantId ? String(item.tenantId) : undefined,
              type: item.jobType ? String(item.jobType) : undefined,
              jobType: item.jobType ? String(item.jobType) : undefined,
              status: item.status as UnifiedJob["status"],
              createdAt: item.createdAt ? new Date(item.createdAt as string | Date).toISOString() : new Date().toISOString(),
              completedAt: item.completedAt ? new Date(item.completedAt as string | Date).toISOString() : undefined,
              webhookUrl,
              batchSize,
              summary,
              exceptions,
              receipt,
              error: item.error ? String(item.error) : undefined,
            };
          });
        }
      } catch (err) {
        console.error("[PostgresJobRepo] listAsync error:", err);
      }
    }
    return this.list(limit, tenantId);
  },

  async getActiveJobsAsync(tenantId?: string): Promise<UnifiedJob[]> {
    if (isPostgres()) {
      const activeTenant = tenantId || getRequiredTenantId();
      try {
        const found = await withTenantContext(activeTenant, async (tx) => {
          const client = tx as unknown as PrismaDynamicClient;
          return client.asyncJob?.findMany
            ? client.asyncJob.findMany({
                where: {
                  tenantId: activeTenant,
                  status: { in: ["PENDING", "PROCESSING"] },
                },
                orderBy: { createdAt: "desc" },
                take: 10,
              })
            : [];
        });
        if (Array.isArray(found) && found.length > 0) {
          return found.map((item) => {
            const payloadStr = typeof item.payload === "string" ? item.payload : undefined;
            let batchSize = 0;
            if (payloadStr) {
              try {
                batchSize = Number(JSON.parse(payloadStr).batchSize || 0);
              } catch {}
            }
            return {
              jobId: String(item.id),
              tenantId: item.tenantId ? String(item.tenantId) : undefined,
              type: item.jobType ? String(item.jobType) : undefined,
              jobType: item.jobType ? String(item.jobType) : undefined,
              status: item.status as UnifiedJob["status"],
              createdAt: item.createdAt ? new Date(item.createdAt as string | Date).toISOString() : new Date().toISOString(),
              completedAt: item.completedAt ? new Date(item.completedAt as string | Date).toISOString() : undefined,
              batchSize,
              error: item.error ? String(item.error) : undefined,
            };
          });
        }
      } catch (err) {
        console.error("[PostgresJobRepo] getActiveJobsAsync error:", err);
      }
    }
    return nativeSqlite.JobRepository.getActiveJobs(tenantId).map((j) => ({
      jobId: j.jobId,
      tenantId: j.tenantId || localTenantJobMap.get(j.jobId),
      type: j.jobType,
      jobType: j.jobType,
      status: j.status,
      createdAt: j.createdAt,
      startedAt: j.startedAt,
      updatedAt: j.updatedAt,
      completedAt: j.completedAt,
      progressPct: j.progressPct,
      retryCount: j.retryCount,
      retryable: Boolean(j.retryable),
      errorCode: j.errorCode,
      webhookUrl: j.webhookUrl,
      batchSize: j.batchSize,
      summary: j.summary,
      exceptions: j.exceptions,
      receipt: j.receipt,
      error: j.error,
    }));
  },

  updateStatus(
    jobId: string,
    status: UnifiedJob["status"],
    error?: string,
    errorCode?: string,
    progressPct?: number
  ): void {
    if (isPostgres()) {
      const tenantId = getRequiredTenantId();
      withTenantContext(tenantId, async (tx) => {
        await (tx as unknown as PrismaDynamicClient).asyncJob?.updateMany({
          where: { id: jobId, tenantId },
          data: {
            status,
            error: error || null,
            completedAt: status === "COMPLETED" || status === "FAILED" || status === "CANCELED" ? new Date() : undefined,
          },
        });
      }).catch((err: unknown) => console.error("[PostgresJobRepo] Update status error:", err));
    }
    nativeSqlite.JobRepository.updateStatus(jobId, status, error, errorCode, progressPct);
  },

  delete(jobId: string): boolean {
    return nativeSqlite.JobRepository.delete(jobId);
  },
};


// -----------------------------------------------------------------------------
// 2. DECISION RECEIPT REPOSITORY
// -----------------------------------------------------------------------------
export interface UnifiedDecisionReceipt {
  receiptId: string;
  tenantId?: string;
  jobId?: string;
  batchId?: string;
  rootHash: string;
  leafCount: number;
  algorithm: string;
  timestamp: string;
  fingerprint: string;
  signature: string;
  canonicalPayload?: string;
  createdAt: string;
}

export const UnifiedReceiptRepository = {
  save(receipt: UnifiedDecisionReceipt): void {
    if (isPostgres()) {
      const tenantId = receipt.tenantId || getRequiredTenantId();
      withTenantContext(tenantId, async (tx) => {
        await (tx as unknown as PrismaDynamicClient).decisionReceipt?.upsert({
          where: { receiptId: receipt.receiptId },
          update: {
            rootHash: receipt.rootHash,
            leafCount: receipt.leafCount,
            fingerprint: receipt.fingerprint,
            signature: receipt.signature,
          },
          create: {
            receiptId: receipt.receiptId,
            tenantId,
            jobId: receipt.jobId,
            batchId: receipt.batchId,
            rootHash: receipt.rootHash,
            leafCount: receipt.leafCount,
            algorithm: receipt.algorithm,
            timestamp: new Date(receipt.timestamp),
            fingerprint: receipt.fingerprint,
            signature: receipt.signature,
            canonicalPayload: receipt.canonicalPayload,
            createdAt: new Date(receipt.createdAt),
          },
        });
      }).catch((err: unknown) => console.error("[PostgresReceiptRepo] Save error:", err));
    }

    nativeSqlite.DecisionReceiptRepository.save({
      receiptId: receipt.receiptId,
      jobId: receipt.jobId,
      rootHash: receipt.rootHash,
      leafCount: receipt.leafCount,
      algorithm: receipt.algorithm,
      timestamp: receipt.timestamp,
      fingerprint: receipt.fingerprint,
      signature: receipt.signature,
      canonicalPayload: receipt.canonicalPayload,
      createdAt: receipt.createdAt,
    });
  },

  async getAsync(receiptId: string, tenantId?: string): Promise<UnifiedDecisionReceipt | null> {
    if (isPostgres()) {
      const activeTenant = tenantId || getRequiredTenantId();
      try {
        const found = await withTenantContext(activeTenant, async (tx) => {
          const client = tx as unknown as PrismaDynamicClient;
          return client.decisionReceipt?.findFirst
            ? client.decisionReceipt.findFirst({
                where: { receiptId, tenantId: activeTenant },
              })
            : null;
        });
        if (found) {
          return {
            receiptId: String(found.receiptId),
            tenantId: found.tenantId ? String(found.tenantId) : undefined,
            jobId: found.jobId ? String(found.jobId) : undefined,
            batchId: found.batchId ? String(found.batchId) : undefined,
            rootHash: String(found.rootHash),
            leafCount: Number(found.leafCount),
            algorithm: String(found.algorithm),
            timestamp: found.timestamp ? new Date(found.timestamp as string | Date).toISOString() : new Date().toISOString(),
            fingerprint: String(found.fingerprint),
            signature: String(found.signature),
            canonicalPayload: found.canonicalPayload ? String(found.canonicalPayload) : undefined,
            createdAt: found.createdAt ? new Date(found.createdAt as string | Date).toISOString() : new Date().toISOString(),
          };
        }
      } catch (err) {
        console.error("[PostgresReceiptRepo] getAsync error:", err);
      }
    }
    return this.get(receiptId);
  },

  async getByJobIdAsync(jobId: string, tenantId?: string): Promise<UnifiedDecisionReceipt | null> {
    if (isPostgres()) {
      const activeTenant = tenantId || getRequiredTenantId();
      try {
        const found = await withTenantContext(activeTenant, async (tx) => {
          const client = tx as unknown as PrismaDynamicClient;
          return client.decisionReceipt?.findFirst
            ? client.decisionReceipt.findFirst({
                where: { jobId, tenantId: activeTenant },
              })
            : null;
        });
        if (found) {
          return {
            receiptId: String(found.receiptId),
            tenantId: found.tenantId ? String(found.tenantId) : undefined,
            jobId: found.jobId ? String(found.jobId) : undefined,
            batchId: found.batchId ? String(found.batchId) : undefined,
            rootHash: String(found.rootHash),
            leafCount: Number(found.leafCount),
            algorithm: String(found.algorithm),
            timestamp: found.timestamp ? new Date(found.timestamp as string | Date).toISOString() : new Date().toISOString(),
            fingerprint: String(found.fingerprint),
            signature: String(found.signature),
            canonicalPayload: found.canonicalPayload ? String(found.canonicalPayload) : undefined,
            createdAt: found.createdAt ? new Date(found.createdAt as string | Date).toISOString() : new Date().toISOString(),
          };
        }
      } catch (err) {
        console.error("[PostgresReceiptRepo] getByJobIdAsync error:", err);
      }
    }
    return this.getByJobId(jobId);
  },

  get(receiptId: string): UnifiedDecisionReceipt | null {
    const local = nativeSqlite.DecisionReceiptRepository.get(receiptId);
    if (local) {
      return {
        receiptId: local.receiptId,
        jobId: local.jobId,
        rootHash: local.rootHash,
        leafCount: local.leafCount,
        algorithm: local.algorithm,
        timestamp: local.timestamp,
        fingerprint: local.fingerprint,
        signature: local.signature,
        canonicalPayload: local.canonicalPayload,
        createdAt: local.createdAt,
      };
    }
    return null;
  },

  getByJobId(jobId: string): UnifiedDecisionReceipt | null {
    const local = nativeSqlite.DecisionReceiptRepository.getByJobId(jobId);
    if (local) {
      return {
        receiptId: local.receiptId,
        jobId: local.jobId,
        rootHash: local.rootHash,
        leafCount: local.leafCount,
        algorithm: local.algorithm,
        timestamp: local.timestamp,
        fingerprint: local.fingerprint,
        signature: local.signature,
        canonicalPayload: local.canonicalPayload,
        createdAt: local.createdAt,
      };
    }
    return null;
  },

  list(limit: number = 50): UnifiedDecisionReceipt[] {
    return nativeSqlite.DecisionReceiptRepository.list(limit).map((r) => ({
      receiptId: r.receiptId,
      jobId: r.jobId,
      rootHash: r.rootHash,
      leafCount: r.leafCount,
      algorithm: r.algorithm,
      timestamp: r.timestamp,
      fingerprint: r.fingerprint,
      signature: r.signature,
      canonicalPayload: r.canonicalPayload,
      createdAt: r.createdAt,
    }));
  },
};

// -----------------------------------------------------------------------------
// 3. WEBHOOK REPOSITORY
// -----------------------------------------------------------------------------
export interface UnifiedWebhookRegistration {
  id: string;
  tenantId?: string;
  url: string;
  events: string; // JSON array
  secret: string;
  status: "ACTIVE" | "PAUSED";
  registeredAt: string;
  updatedAt: string;
}

export interface UnifiedWebhookDeliveryLog {
  id: string;
  tenantId?: string;
  webhookId?: string;
  jobId?: string;
  event: string;
  url: string;
  statusCode?: number;
  durationMs?: number;
  payload: string;
  signature: string;
  attempt?: number;
  attempts?: number;
  status?: "DELIVERED" | "FAILED" | "SIMULATED";
  success?: boolean;
  lastAttemptAt?: string;
  error?: string;
  timestamp: string;
}

export const UnifiedWebhookRepository = {
  saveRegistration(reg: UnifiedWebhookRegistration): void {
    if (isPostgres()) {
      const tenantId = reg.tenantId || getRequiredTenantId();
      withTenantContext(tenantId, async (tx) => {
        await (tx as unknown as PrismaDynamicClient).webhookSubscription?.upsert({
          where: { id: reg.id },
          update: {
            url: reg.url,
            events: reg.events,
            status: reg.status,
            updatedAt: new Date(reg.updatedAt),
          },
          create: {
            id: reg.id,
            tenantId,
            url: reg.url,
            events: reg.events,
            secretEncrypted: reg.secret,
            status: reg.status,
            registeredAt: new Date(reg.registeredAt),
            updatedAt: new Date(reg.updatedAt),
          },
        });
      }).catch((err: unknown) => console.error("[PostgresWebhookRepo] Save reg error:", err));
    }
    nativeSqlite.WebhookRepository.saveRegistration(reg);
  },

  getRegistration(id: string): UnifiedWebhookRegistration | null {
    return nativeSqlite.WebhookRepository.getRegistration(id);
  },

  getAllRegistrations(): UnifiedWebhookRegistration[] {
    return nativeSqlite.WebhookRepository.getAllRegistrations();
  },

  deleteRegistration(id: string): boolean {
    return nativeSqlite.WebhookRepository.deleteRegistration(id);
  },

  saveDeliveryLog(log: UnifiedWebhookDeliveryLog): void {
    if (isPostgres()) {
      const tenantId = log.tenantId || getRequiredTenantId();
      withTenantContext(tenantId, async (tx) => {
        await (tx as unknown as PrismaDynamicClient).webhookOutbox?.create({
          data: {
            id: log.id,
            tenantId,
            subscriptionId: log.webhookId,
            event: log.event,
            payload: log.payload,
            signature: log.signature,
            status: log.status || (log.success ? "DELIVERED" : "FAILED"),
            attempts: log.attempts || log.attempt || 1,
            lastStatusCode: log.statusCode || 200,
            lastError: log.error,
            createdAt: new Date(log.timestamp),
            deliveredAt: log.status === "DELIVERED" || log.success ? new Date(log.timestamp) : undefined,
          },
        });
      }).catch((err: unknown) => console.error("[PostgresWebhookRepo] Save log error:", err));
    }
    nativeSqlite.WebhookRepository.saveDeliveryLog({
      id: log.id,
      webhookId: log.webhookId,
      url: log.url,
      event: log.event,
      payload: log.payload,
      signature: log.signature,
      timestamp: log.timestamp,
      status: log.status || (log.success ? "DELIVERED" : "FAILED"),
      statusCode: log.statusCode || 200,
      attempts: log.attempts || log.attempt || 1,
      lastAttemptAt: log.timestamp,
      error: log.error,
    });
  },

  getDeliveryLogs(limit: number = 100): UnifiedWebhookDeliveryLog[] {
    return nativeSqlite.WebhookRepository.getDeliveryLogs(limit).map((l) => ({
      id: l.id,
      webhookId: l.webhookId,
      jobId: undefined,
      event: l.event,
      url: l.url,
      statusCode: l.statusCode,
      payload: l.payload,
      signature: l.signature,
      attempt: l.attempts,
      attempts: l.attempts,
      status: l.status,
      success: l.status === "DELIVERED",
      error: l.error,
      timestamp: l.timestamp,
    }));
  },

  clearDeliveryLogs(): void {
    nativeSqlite.WebhookRepository.clearDeliveryLogs();
  },
};

// -----------------------------------------------------------------------------
// 4. AI CLAIM LOG REPOSITORY
// -----------------------------------------------------------------------------
export interface UnifiedAiClaimLog {
  id: string;
  tenantId?: string;
  timestamp: string;
  exceptionId: string;
  model: string;
  inputHash: string;
  prompt?: string;
  promptSnippet?: string;
  output?: string;
  outputPayload?: string;
  latencyMs: number;
  status: "SUCCESS" | "FALLBACK" | "VALIDATION_FAILED" | "ERROR";
  createdAt: string;
}

export const UnifiedAiClaimLogRepository = {
  logAiCall(log: UnifiedAiClaimLog): void {
    if (isPostgres()) {
      const tenantId = log.tenantId || getRequiredTenantId();
      withTenantContext(tenantId, async (tx) => {
        await (tx as unknown as PrismaDynamicClient).aiClaimLog?.create({
          data: {
            id: log.id,
            tenantId,
            exceptionId: log.exceptionId,
            timestamp: new Date(log.timestamp),
            model: log.model,
            inputHash: log.inputHash,
            promptSnippet: log.promptSnippet || log.prompt,
            outputPayload: log.outputPayload || log.output,
            latencyMs: log.latencyMs,
            status: log.status,
            createdAt: new Date(log.createdAt),
          },
        });
      }).catch((err: unknown) => console.error("[PostgresAiLogRepo] Save error:", err));
    }
    nativeSqlite.AiClaimLogRepository.logAiCall({
      id: log.id,
      timestamp: log.timestamp,
      exceptionId: log.exceptionId,
      model: log.model,
      inputHash: log.inputHash,
      prompt: log.prompt || log.promptSnippet,
      output: log.output || log.outputPayload,
      latencyMs: log.latencyMs,
      status: log.status,
      createdAt: log.createdAt,
    });
  },

  getByExceptionId(exceptionId: string): UnifiedAiClaimLog[] {
    return nativeSqlite.AiClaimLogRepository.getByExceptionId(exceptionId).map((l) => ({
      id: l.id,
      timestamp: l.timestamp,
      exceptionId: l.exceptionId,
      model: l.model,
      inputHash: l.inputHash,
      prompt: l.prompt,
      promptSnippet: l.prompt,
      output: l.output,
      outputPayload: l.output,
      latencyMs: l.latencyMs,
      status: l.status,
      createdAt: l.createdAt,
    }));
  },

  getAll(limit: number = 100): UnifiedAiClaimLog[] {
    return nativeSqlite.AiClaimLogRepository.getAll(limit).map((l) => ({
      id: l.id,
      timestamp: l.timestamp,
      exceptionId: l.exceptionId,
      model: l.model,
      inputHash: l.inputHash,
      prompt: l.prompt,
      promptSnippet: l.prompt,
      output: l.output,
      outputPayload: l.output,
      latencyMs: l.latencyMs,
      status: l.status,
      createdAt: l.createdAt,
    }));
  },

  getRecentLogs(limit: number = 50): UnifiedAiClaimLog[] {
    return this.getAll(limit);
  },
};

// -----------------------------------------------------------------------------
// 5. AUDIT LEDGER REPOSITORY
// -----------------------------------------------------------------------------
export interface UnifiedAuditEntry {
  id: string;
  tenantId?: string;
  batchId?: string;
  entityType?: string;
  entityId?: string;
  actor: string;
  action: string;
  reason?: string;
  metadata?: string;
  createdAt: string;
}

export const UnifiedAuditLedgerRepository = {
  log(entry: UnifiedAuditEntry): void {
    if (isPostgres()) {
      const tenantId = entry.tenantId || getRequiredTenantId();
      withTenantContext(tenantId, async (tx) => {
        await (tx as unknown as PrismaDynamicClient).auditLog?.create({
          data: {
            id: entry.id,
            tenantId,
            batchId: entry.batchId || null,
            actor: entry.actor,
            action: entry.action,
            entityType: entry.entityType,
            entityId: entry.entityId,
            reason: entry.reason,
            metadata: entry.metadata,
            timestamp: new Date(entry.createdAt),
          },
        });
      }).catch((err: unknown) => console.error("[PostgresAuditRepo] Save error:", err));
    }
    nativeSqlite.AuditLedgerRepository.log({
      id: entry.id,
      batchId: entry.batchId,
      entityType: entry.entityType,
      entityId: entry.entityId,
      actor: entry.actor,
      action: entry.action,
      reason: entry.reason,
      metadata: entry.metadata,
      createdAt: entry.createdAt,
    });
  },

  getByBatchId(batchId: string): UnifiedAuditEntry[] {
    return nativeSqlite.AuditLedgerRepository.getByBatchId(batchId).map((e) => ({
      id: e.id,
      batchId: e.batchId,
      entityType: e.entityType,
      entityId: e.entityId,
      actor: e.actor,
      action: e.action,
      reason: e.reason,
      metadata: e.metadata,
      createdAt: e.createdAt,
    }));
  },
};

// -----------------------------------------------------------------------------
// 6. VERIFICATION HUB PROGRESS REPOSITORY
// -----------------------------------------------------------------------------
export interface UnifiedVerifyProgressJob {
  jobId: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  requestedSuites: string; // JSON array
  totalSuites: number;
  completedSuites: number;
  overallProgressPct: number;
  startedAt: string;
  completedAt?: string;
  totalDurationMs?: number;
  allPassed?: number;
  results: string; // JSON object
}

export const UnifiedProgressRepository = {
  save(job: UnifiedVerifyProgressJob): void {
    nativeSqlite.VerifyProgressRepository.save(job);
  },

  get(jobId: string): UnifiedVerifyProgressJob | null {
    return nativeSqlite.VerifyProgressRepository.get(jobId);
  },

  getAll(): UnifiedVerifyProgressJob[] {
    return nativeSqlite.VerifyProgressRepository.getAll();
  },
};


// -----------------------------------------------------------------------------
// 7. DURABLE DOMAIN EVENT REPOSITORY
// -----------------------------------------------------------------------------
export interface UnifiedDomainEvent {
  id: string;
  tenantId?: string;
  eventType: string;
  entityId: string;
  seq?: number;
  traceId?: string;
  payload: string; // JSON string
  createdAt?: string;
}

// In-memory fallback sequence counter & store for local dev
let localSequenceCounter = 0;
const localDomainEvents: UnifiedDomainEvent[] = [];

export const UnifiedDomainEventRepository = {
  save(event: UnifiedDomainEvent): UnifiedDomainEvent {
    const tenantId = event.tenantId || getRequiredTenantId();
    localSequenceCounter += 1;
    const seq = event.seq ?? localSequenceCounter;
    const createdAt = event.createdAt || new Date().toISOString();

    const stored: UnifiedDomainEvent = {
      id: event.id,
      tenantId,
      eventType: event.eventType,
      entityId: event.entityId,
      seq,
      traceId: event.traceId,
      payload: event.payload,
      createdAt,
    };

    if (isPostgres()) {
      withTenantContext(tenantId, async (tx) => {
        await (tx as unknown as PrismaDynamicClient).domainEvent?.create({
          data: {
            id: stored.id,
            tenantId,
            eventType: stored.eventType,
            entityId: stored.entityId,
            traceId: stored.traceId,
            payload: stored.payload,
            createdAt: new Date(createdAt),
          },
        });
      }).catch((err: unknown) => console.error("[PostgresDomainEventRepo] Save error:", err));
    }

    localDomainEvents.push(stored);
    if (localDomainEvents.length > 5000) {
      localDomainEvents.shift();
    }
    return stored;
  },

  listSince(tenantId: string, afterSeq: number, limit: number = 100): UnifiedDomainEvent[] {
    return localDomainEvents
      .filter((e) => e.tenantId === tenantId && (e.seq ?? 0) > afterSeq)
      .slice(0, limit);
  },

  getByEntityId(tenantId: string, entityId: string): UnifiedDomainEvent[] {
    return localDomainEvents.filter(
      (e) => e.tenantId === tenantId && e.entityId === entityId
    );
  },

  _clearForTests(): void {
    localDomainEvents.length = 0;
    localSequenceCounter = 0;
  },
};
