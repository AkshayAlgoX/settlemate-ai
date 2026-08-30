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

import { prisma } from "@/lib/db";
import { getRequiredTenantId } from "@/lib/tenant/tenant-context";
import * as nativeSqlite from "./sqlite-db";

interface PrismaDynamicClient {
  asyncJob?: {
    upsert: (args: Record<string, unknown>) => Promise<unknown>;
    updateMany: (args: Record<string, unknown>) => Promise<unknown>;
  };
  decisionReceipt?: {
    upsert: (args: Record<string, unknown>) => Promise<unknown>;
  };
  webhookSubscription?: {
    upsert: (args: Record<string, unknown>) => Promise<unknown>;
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
  };
}

const dynamicPrisma = prisma as unknown as PrismaDynamicClient;

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
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  createdAt: string;
  completedAt?: string;
  webhookUrl?: string;
  batchSize: number;
  summary?: string;
  exceptions?: string;
  receipt?: string;
  error?: string;
}

export const UnifiedJobRepository = {
  save(job: UnifiedJob): void {
    if (isPostgres()) {
      const tenantId = job.tenantId || getRequiredTenantId();
      dynamicPrisma.asyncJob
        ?.upsert({
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
            jobType: "RECONCILIATION_BATCH",
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
        })
        .catch((err: unknown) => console.error("[PostgresJobRepo] Save error:", err));
      return;
    }

    // Local SQLite fallback
    nativeSqlite.JobRepository.save({
      jobId: job.jobId,
      status: job.status,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      webhookUrl: job.webhookUrl,
      batchSize: job.batchSize,
      summary: job.summary,
      exceptions: job.exceptions,
      receipt: job.receipt,
      error: job.error,
    });
  },

  get(jobId: string): UnifiedJob | null {
    const local = nativeSqlite.JobRepository.get(jobId);
    if (local) {
      return {
        jobId: local.jobId,
        status: local.status,
        createdAt: local.createdAt,
        completedAt: local.completedAt,
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

  list(limit: number = 50): UnifiedJob[] {
    return nativeSqlite.JobRepository.list(limit).map((j) => ({
      jobId: j.jobId,
      status: j.status,
      createdAt: j.createdAt,
      completedAt: j.completedAt,
      webhookUrl: j.webhookUrl,
      batchSize: j.batchSize,
      summary: j.summary,
      exceptions: j.exceptions,
      receipt: j.receipt,
      error: j.error,
    }));
  },

  getAll(): UnifiedJob[] {
    return nativeSqlite.JobRepository.getAll().map((j) => ({
      jobId: j.jobId,
      status: j.status,
      createdAt: j.createdAt,
      completedAt: j.completedAt,
      webhookUrl: j.webhookUrl,
      batchSize: j.batchSize,
      summary: j.summary,
      exceptions: j.exceptions,
      receipt: j.receipt,
      error: j.error,
    }));
  },

  updateStatus(jobId: string, status: UnifiedJob["status"], error?: string): void {
    if (isPostgres()) {
      const tenantId = getRequiredTenantId();
      dynamicPrisma.asyncJob
        ?.updateMany({
          where: { id: jobId, tenantId },
          data: {
            status,
            error: error || null,
            completedAt: status === "COMPLETED" || status === "FAILED" ? new Date() : undefined,
          },
        })
        .catch((err: unknown) => console.error("[PostgresJobRepo] Update status error:", err));
    }
    nativeSqlite.JobRepository.updateStatus(jobId, status, error);
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
      dynamicPrisma.decisionReceipt
        ?.upsert({
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
        })
        .catch((err: unknown) => console.error("[PostgresReceiptRepo] Save error:", err));
      return;
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
      dynamicPrisma.webhookSubscription
        ?.upsert({
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
        })
        .catch((err: unknown) => console.error("[PostgresWebhookRepo] Save reg error:", err));
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
      dynamicPrisma.webhookOutbox
        ?.create({
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
        })
        .catch((err: unknown) => console.error("[PostgresWebhookRepo] Save log error:", err));
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
      dynamicPrisma.aiClaimLog
        ?.create({
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
        })
        .catch((err: unknown) => console.error("[PostgresAiLogRepo] Save error:", err));
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
      dynamicPrisma.auditLog
        ?.create({
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
        })
        .catch((err: unknown) => console.error("[PostgresAuditRepo] Save error:", err));
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
      dynamicPrisma.domainEvent
        ?.create({
          data: {
            id: stored.id,
            tenantId,
            eventType: stored.eventType,
            entityId: stored.entityId,
            seq: stored.seq,
            traceId: stored.traceId,
            payload: stored.payload,
            createdAt: new Date(createdAt),
          },
        })
        .catch((err: unknown) => console.error("[PostgresDomainEventRepo] Save error:", err));
    }

    localDomainEvents.push(stored);
    if (localDomainEvents.length > 5000) {
      localDomainEvents.shift();
    }
    return stored;
  },

  listSince(tenantId: string, afterSeq: number, limit: number = 100): UnifiedDomainEvent[] {
    return localDomainEvents
      .filter((e) => (e.tenantId === tenantId || tenantId === "tenant_default_sandbox") && (e.seq ?? 0) > afterSeq)
      .slice(0, limit);
  },

  getByEntityId(tenantId: string, entityId: string): UnifiedDomainEvent[] {
    return localDomainEvents.filter(
      (e) => (e.tenantId === tenantId || tenantId === "tenant_default_sandbox") && e.entityId === entityId
    );
  },

  _clearForTests(): void {
    localDomainEvents.length = 0;
    localSequenceCounter = 0;
  },
};
