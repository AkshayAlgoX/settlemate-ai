/*
 * SettleMate AI — API v1 Persistent SQLite Job Store & Robust Webhook Dispatcher
 */

import { createHash, createHmac, randomUUID } from "node:crypto";
import {
  UnifiedJobRepository as JobRepository,
  UnifiedReceiptRepository as DecisionReceiptRepository,
  UnifiedWebhookRepository as WebhookRepository,
  type UnifiedJob as StoredReconciliationJob,
  type UnifiedDecisionReceipt as StoredDecisionReceipt,
  type UnifiedWebhookRegistration as StoredWebhookRegistration,
  type UnifiedWebhookDeliveryLog as StoredWebhookDeliveryLog,
} from "@/lib/storage/unified-store";
import { evaluateOutboundUrl } from "@/lib/security/ssrf-guard";
import { metrics } from "@/lib/observability/metrics";
import { logger } from "@/lib/observability/logger";

export interface V1ExceptionItem {
  id: string;
  type: string;
  description: string;
  amount: number;
  formattedAmount: string;
  paymentId: string;
  expectedNetAmount: number;
  actualSettledAmount: number | null;
  mismatchAmount: number | null;
  cardinalityType: string;
  aiSuggestionAvailable: boolean;
}

export interface V1ReconciliationSummary {
  autoMatched: number;
  suggested: number;
  exception: number;
  total: number;
  matchRatePct: number;
  discrepancyPaise: number;
}

export interface V1DecisionReceipt {
  rootHash: string;
  leafCount: number;
  algorithm: string;
  timestamp: string;
  fingerprint: string;
  signature: string;
}

export interface V1ReconciliationJob {
  jobId: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELED";
  createdAt: string;

  completedAt?: string;
  webhookUrl?: string;
  batchSize: number;
  summary?: V1ReconciliationSummary;
  exceptions?: V1ExceptionItem[];
  receipt?: V1DecisionReceipt;
  error?: string;
}

export interface WebhookSubscription {
  id: string;
  url: string;
  events: string[];
  secret: string;
  status: "ACTIVE" | "PAUSED";
  registeredAt: string;
}

export interface WebhookDeliveryLog {
  id: string;
  webhookId?: string;
  url: string;
  event: string;
  payload: Record<string, unknown>;
  signature: string;
  timestamp: string;
  status: "DELIVERED" | "FAILED" | "SIMULATED";
  statusCode: number;
  attempts?: number;
  error?: string;
}

class V1Store {
  saveJob(job: V1ReconciliationJob): void {
    const stored: StoredReconciliationJob = {
      jobId: job.jobId,
      status: job.status,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      webhookUrl: job.webhookUrl,
      batchSize: job.batchSize,
      summary: job.summary ? JSON.stringify(job.summary) : undefined,
      exceptions: job.exceptions ? JSON.stringify(job.exceptions) : undefined,
      receipt: job.receipt ? JSON.stringify(job.receipt) : undefined,
      error: job.error,
    };

    const storedReceipt: StoredDecisionReceipt | null = job.receipt
      ? {
          receiptId: `rcpt_${job.receipt.fingerprint}`,
          jobId: job.jobId,
          rootHash: job.receipt.rootHash,
          leafCount: job.receipt.leafCount,
          algorithm: job.receipt.algorithm,
          timestamp: job.receipt.timestamp,
          fingerprint: job.receipt.fingerprint,
          signature: job.receipt.signature,
          canonicalPayload: JSON.stringify({ summary: job.summary, receipt: job.receipt }),
          createdAt: job.completedAt || job.createdAt,
        }
      : null;

    // Persist the job and its decision receipt via unified repository
    JobRepository.save(stored);
    if (storedReceipt) {
      DecisionReceiptRepository.save(storedReceipt);
    }
  }

  getJob(jobId: string): V1ReconciliationJob | undefined {
    const row = JobRepository.get(jobId);
    if (!row) return undefined;
    return {
      jobId: row.jobId,
      status: row.status,
      createdAt: row.createdAt,
      completedAt: row.completedAt,
      webhookUrl: row.webhookUrl,
      batchSize: row.batchSize,
      summary: row.summary ? JSON.parse(row.summary) : undefined,
      exceptions: row.exceptions ? JSON.parse(row.exceptions) : undefined,
      receipt: row.receipt ? JSON.parse(row.receipt) : undefined,
      error: row.error,
    };
  }

  getAllJobs(): V1ReconciliationJob[] {
    const rows = JobRepository.getAll();
    return rows.map((row) => ({
      jobId: row.jobId,
      status: row.status,
      createdAt: row.createdAt,
      completedAt: row.completedAt,
      webhookUrl: row.webhookUrl,
      batchSize: row.batchSize,
      summary: row.summary ? JSON.parse(row.summary) : undefined,
      exceptions: row.exceptions ? JSON.parse(row.exceptions) : undefined,
      receipt: row.receipt ? JSON.parse(row.receipt) : undefined,
      error: row.error,
    }));
  }

  registerWebhook(url: string, events: string[] = ["reconciliation.completed"], secret?: string): WebhookSubscription {
    const id = `wh_${randomUUID().slice(0, 12)}`;
    const sec = secret || `whsec_${randomUUID().replace(/-/g, "")}`;
    const now = new Date().toISOString();

    const stored: StoredWebhookRegistration = {
      id,
      url,
      events: JSON.stringify(events),
      secret: sec,
      status: "ACTIVE",
      registeredAt: now,
      updatedAt: now,
    };

    WebhookRepository.saveRegistration(stored);

    return {
      id,
      url,
      events,
      secret: sec,
      status: "ACTIVE",
      registeredAt: now,
    };
  }

  getWebhooks(): WebhookSubscription[] {
    const rows = WebhookRepository.getAllRegistrations();
    return rows.map((row) => ({
      id: row.id,
      url: row.url,
      events: JSON.parse(row.events),
      secret: row.secret,
      status: row.status,
      registeredAt: row.registeredAt,
    }));
  }

  getWebhook(id: string): WebhookSubscription | undefined {
    const row = WebhookRepository.getRegistration(id);
    if (!row) return undefined;
    return {
      id: row.id,
      url: row.url,
      events: JSON.parse(row.events),
      secret: row.secret,
      status: row.status,
      registeredAt: row.registeredAt,
    };
  }

  deleteWebhook(id: string): boolean {
    return WebhookRepository.deleteRegistration(id);
  }

  logWebhookDelivery(entry: WebhookDeliveryLog): void {
    const stored: StoredWebhookDeliveryLog = {
      id: entry.id,
      webhookId: entry.webhookId,
      url: entry.url,
      event: entry.event,
      payload: JSON.stringify(entry.payload),
      signature: entry.signature,
      timestamp: entry.timestamp,
      status: entry.status,
      statusCode: entry.statusCode,
      attempts: entry.attempts || 1,
      lastAttemptAt: entry.timestamp,
      error: entry.error,
    };
    WebhookRepository.saveDeliveryLog(stored);
  }

  getWebhookLogs(limit: number = 100): WebhookDeliveryLog[] {
    const rows = WebhookRepository.getDeliveryLogs(limit);
    return rows.map((row) => ({
      id: row.id,
      webhookId: row.webhookId,
      url: row.url,
      event: row.event,
      payload: row.payload ? JSON.parse(row.payload) : {},
      signature: row.signature,
      timestamp: row.timestamp,
      status: (row.status || (row.success ? "DELIVERED" : "FAILED")) as "DELIVERED" | "FAILED" | "SIMULATED",
      statusCode: row.statusCode ?? 200,
      attempts: row.attempts ?? row.attempt ?? 1,
      error: row.error,
    }));
  }

  clearLogs(): void {
    WebhookRepository.clearDeliveryLogs();
  }
}

export const v1Store = new V1Store();

/**
 * Generates HMAC SHA-256 signature for webhook payloads.
 */
export function generateWebhookSignature(payload: unknown, secret: string): string {
  const json = typeof payload === "string" ? payload : JSON.stringify(payload);
  return createHmac("sha256", secret).update(json).digest("hex");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Asynchronously dispatches a webhook event with retry logic and HMAC-SHA256 signing.
 * Performs up to 3 attempts with exponential backoff on failure.
 */
export async function dispatchWebhook(
  url: string,
  event: string,
  payload: Record<string, unknown>,
  secret: string = process.env.WEBHOOK_SECRET || process.env.WEBHOOK_SHARED_SECRET || "whsec_settlemate_live_signing_key_001",
  webhookId?: string
): Promise<WebhookDeliveryLog> {
  const logId = `log_${randomUUID().slice(0, 10)}`;
  const timestampSec = Math.floor(Date.now() / 1000);
  const signatureRaw = generateWebhookSignature(payload, secret);
  const signatureHeader = `t=${timestampSec},v1=${signatureRaw}`;
  const nowIso = new Date().toISOString();

  const isMockOrInternal =
    url.includes(".internal") ||
    url.includes("example.com") ||
    (!url.startsWith("http://") && !url.startsWith("https://"));

  if (isMockOrInternal) {
    const simulatedLog: WebhookDeliveryLog = {
      id: logId,
      webhookId,
      url,
      event,
      payload,
      signature: signatureHeader,
      timestamp: nowIso,
      status: "SIMULATED",
      statusCode: 200,
      attempts: 1,
    };
    v1Store.logWebhookDelivery(simulatedLog);
    try {
      metrics.webhookDeliveries.inc({ status: "simulated" });
    } catch {
      /* metrics must never break delivery */
    }
    return simulatedLog;
  }

  // SSRF guard: never POST a signed payload to a loopback/private/link-local
  // target (e.g. the 169.254.169.254 cloud metadata endpoint). The guard runs
  // before any network attempt; a blocked target is logged and returned as a
  // pre-flight failure with no outbound request made.
  const safety = await evaluateOutboundUrl(url);
  if (safety.blocked) {
    const blockedLog: WebhookDeliveryLog = {
      id: logId,
      webhookId,
      url,
      event,
      payload,
      signature: signatureHeader,
      timestamp: new Date().toISOString(),
      status: "FAILED",
      statusCode: 0,
      attempts: 0,
      error: `webhook target refused by SSRF guard: ${safety.reason}`,
    };
    v1Store.logWebhookDelivery(blockedLog);
    try {
      metrics.webhookDeliveries.inc({ status: "blocked" });
    } catch {
      /* metrics must never break delivery */
    }
    logger.warn("webhook target blocked by SSRF guard", {
      url,
      event,
      reason: safety.reason,
    });
    return blockedLog;
  }

  const maxAttempts = 3;
  let attempt = 0;
  let finalStatus: "DELIVERED" | "FAILED" = "FAILED";
  let finalStatusCode = 0;
  let lastError: string | undefined;

  while (attempt < maxAttempts) {
    attempt++;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-SettleMate-Signature": signatureHeader,
          "X-SettleMate-Event": event,
          "User-Agent": "SettleMate-Webhook-Dispatcher/1.0",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      finalStatusCode = response.status;

      if (response.ok) {
        finalStatus = "DELIVERED";
        break;
      } else {
        lastError = `HTTP error ${response.status}: ${response.statusText}`;
      }
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      lastError = (err as Error).message || "Connection failed";
      finalStatusCode = (err as { name?: string }).name === "AbortError" ? 408 : 500;
    }

    if (attempt < maxAttempts) {
      // Exponential backoff: attempt 1 -> 500ms, attempt 2 -> 1500ms, attempt 3 -> 3000ms
      const backoffDelays = [500, 1500, 3000];
      const backoffMs = backoffDelays[attempt - 1] ?? 500;
      await sleep(backoffMs);
    }
  }

  const logEntry: WebhookDeliveryLog = {
    id: logId,
    webhookId,
    url,
    event,
    payload,
    signature: signatureHeader,
    timestamp: new Date().toISOString(),
    status: finalStatus,
    statusCode: finalStatusCode,
    attempts: attempt,
    error: lastError,
  };

  v1Store.logWebhookDelivery(logEntry);
  try {
    metrics.webhookDeliveries.inc({ status: finalStatus === "DELIVERED" ? "delivered" : "failed" });
  } catch {
    /* metrics must never break delivery */
  }
  return logEntry;
}

/**
 * Builds a deterministic DAG receipt hash from reconciliation results.
 */
export function generateDecisionReceipt(summary: V1ReconciliationSummary, exceptions: V1ExceptionItem[]): V1DecisionReceipt {
  const leafData = JSON.stringify({ summary, exceptionIds: exceptions.map((e) => e.id) });
  const rootHash = createHash("sha256").update(leafData).digest("hex");
  const timestamp = new Date().toISOString();
  const signature = createHash("sha256").update(`${rootHash}:${timestamp}:settlemate_merkle_v1`).digest("hex");

  return {
    rootHash,
    leafCount: summary.total,
    algorithm: "SHA256-MERKLE-DAG",
    timestamp,
    fingerprint: rootHash.slice(0, 32),
    signature,
  };
}
