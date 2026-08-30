/*
 * SettleMate AI — Persistent SQLite Database & Repository Layer
 *
 * Provides synchronous, crash-safe persistent storage using better-sqlite3 for:
 *   - Reconciliation Jobs (\`reconciliation_jobs\`)
 *   - Canonical Decision Receipts (\`decision_receipts\`)
 *   - Webhook Registrations (\`webhook_registrations\`)
 *   - AI Claim & LLM Call Logs (\`ai_claim_logs\`)
 *   - Audit Ledger (\`audit_ledger\`)
 *   - Webhook Delivery Logs (\`webhook_delivery_logs\`)
 *   - Verification Hub Progress Jobs (\`verify_progress_jobs\`)
 */

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";
import { metrics } from "@/lib/observability/metrics";

export interface StoredReconciliationJob {
  jobId: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  createdAt: string;
  completedAt?: string;
  webhookUrl?: string;
  batchSize: number;
  summary?: string; // JSON
  exceptions?: string; // JSON
  receipt?: string; // JSON
  error?: string;
}

export interface StoredDecisionReceipt {
  receiptId: string;
  jobId?: string;
  rootHash: string;
  leafCount: number;
  algorithm: string;
  timestamp: string;
  fingerprint: string;
  signature: string;
  canonicalPayload?: string;
  createdAt: string;
}

export interface StoredWebhookRegistration {
  id: string;
  url: string;
  events: string; // JSON array
  secret: string;
  status: "ACTIVE" | "PAUSED";
  registeredAt: string;
  updatedAt: string;
}

export interface StoredAiClaimLog {
  id: string;
  timestamp: string;
  exceptionId: string;
  model: string;
  inputHash: string;
  prompt?: string;
  output?: string; // JSON
  latencyMs: number;
  status: "SUCCESS" | "FALLBACK" | "VALIDATION_FAILED" | "ERROR";
  createdAt: string;
}

export interface StoredAuditLedgerEntry {
  id: string;
  batchId?: string;
  entityType?: string;
  entityId?: string;
  actor: string;
  action: string;
  reason?: string;
  metadata?: string; // JSON
  createdAt: string;
}

export interface StoredWebhookDeliveryLog {
  id: string;
  webhookId?: string;
  url: string;
  event: string;
  payload: string; // JSON
  signature: string;
  timestamp: string;
  status: "DELIVERED" | "FAILED" | "SIMULATED";
  statusCode: number;
  attempts: number;
  lastAttemptAt?: string;
  error?: string;
}

export interface StoredVerifyProgressJob {
  jobId: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  requestedSuites: string; // JSON array
  totalSuites: number;
  completedSuites: number;
  overallProgressPct: number;
  startedAt: string;
  completedAt?: string;
  totalDurationMs?: number;
  allPassed?: number; // 0 or 1
  results: string; // JSON object
}

let dbInstance: DatabaseType | null = null;
let currentDbPath: string = "";

export function getDatabasePath(): string {
  if (process.env.SETTLEMATE_DB_PATH) {
    return process.env.SETTLEMATE_DB_PATH;
  }
  return path.join(process.cwd(), "data", "settlemate.db");
}

export function initDatabase(customPath?: string): DatabaseType {
  const dbPath = customPath || getDatabasePath();

  if (dbInstance && currentDbPath === dbPath) {
    return dbInstance;
  }

  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // Ignore error closing prior instance
    }
    dbInstance = null;
  }

  // Ensure directory exists
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  // Wait up to 5s for a lock before returning SQLITE_BUSY. In WAL mode this
  // makes concurrent readers/writers block-and-wait at the SQLite layer rather
  // than failing immediately; withBusyRetry() below adds a bounded JS-level
  // retry for the rare case the busy handler still gives up.
  db.pragma("busy_timeout = 5000");

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS reconciliation_jobs (
      job_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      webhook_url TEXT,
      batch_size INTEGER NOT NULL,
      summary TEXT,
      exceptions TEXT,
      receipt TEXT,
      error TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON reconciliation_jobs(created_at);

    CREATE TABLE IF NOT EXISTS decision_receipts (
      receipt_id TEXT PRIMARY KEY,
      job_id TEXT,
      root_hash TEXT NOT NULL,
      leaf_count INTEGER NOT NULL,
      algorithm TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      signature TEXT NOT NULL,
      canonical_payload TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_receipts_job_id ON decision_receipts(job_id);

    CREATE TABLE IF NOT EXISTS webhook_registrations (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      events TEXT NOT NULL,
      secret TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      registered_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_claim_logs (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      exception_id TEXT NOT NULL,
      model TEXT NOT NULL,
      input_hash TEXT NOT NULL,
      prompt TEXT,
      output TEXT,
      latency_ms INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ai_claim_logs_exception ON ai_claim_logs(exception_id);
    CREATE INDEX IF NOT EXISTS idx_ai_claim_logs_created ON ai_claim_logs(created_at);

    CREATE TABLE IF NOT EXISTS audit_ledger (
      id TEXT PRIMARY KEY,
      batch_id TEXT,
      entity_type TEXT,
      entity_id TEXT,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      reason TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_batch_id ON audit_ledger(batch_id);

    CREATE TABLE IF NOT EXISTS webhook_delivery_logs (
      id TEXT PRIMARY KEY,
      webhook_id TEXT,
      url TEXT NOT NULL,
      event TEXT NOT NULL,
      payload TEXT NOT NULL,
      signature TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      status TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 1,
      last_attempt_at TEXT,
      error TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_wh_delivery_created ON webhook_delivery_logs(timestamp);

    CREATE TABLE IF NOT EXISTS verify_progress_jobs (
      job_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      requested_suites TEXT NOT NULL,
      total_suites INTEGER NOT NULL,
      completed_suites INTEGER NOT NULL,
      overall_progress_pct INTEGER NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      total_duration_ms INTEGER,
      all_passed INTEGER,
      results TEXT NOT NULL
    );
  `);

  // Seed default demo webhook if table is empty
  const countStmt = db.prepare("SELECT COUNT(*) as count FROM webhook_registrations");
  const row = countStmt.get() as { count: number } | undefined;
  if (!row || row.count === 0) {
    const insertSeed = db.prepare(`
      INSERT OR IGNORE INTO webhook_registrations (id, url, events, secret, status, registered_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const now = new Date().toISOString();
    insertSeed.run(
      "wh_demo_erp_default",
      "https://erp.merchant-hub.internal/v1/settlemate-listener",
      JSON.stringify(["reconciliation.completed", "exception.detected", "batch.finalized"]),
      "whsec_demo_9876543210fedcba",
      "ACTIVE",
      now,
      now
    );
  }

  dbInstance = db;
  currentDbPath = dbPath;
  return db;
}

export function getDb(): DatabaseType {
  if (!dbInstance) {
    return initDatabase();
  }
  return dbInstance;
}

export function closeDatabase(): void {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // Ignore
    }
    dbInstance = null;
    currentDbPath = "";
  }
}

/**
 * Checkpoints the WAL into the main database file, then closes the connection.
 * Used on graceful shutdown (SIGTERM/SIGINT) so no committed transactions are
 * left stranded in the -wal sidecar if the process exits.
 */
export function gracefulCloseDatabase(): void {
  if (!dbInstance) return;
  try {
    dbInstance.pragma("wal_checkpoint(TRUNCATE)");
  } catch {
    // Best-effort checkpoint; close regardless.
  }
  closeDatabase();
}

// -----------------------------------------------------------------------------
// SQLITE_BUSY RETRY WRAPPER
// -----------------------------------------------------------------------------
// better-sqlite3 is synchronous, so the busy_timeout pragma already causes a
// blocked statement to sleep-and-retry inside the native call. This wrapper is
// a thin, bounded second line of defense: if a write still surfaces SQLITE_BUSY
// (or SQLITE_LOCKED), retry a few times with a short synchronous backoff. All
// writes in the repositories below route through it.

// Shared zero-value word used only as an Atomics.wait target for sleeping the
// current thread without a CPU spin. The value is never mutated, so the wait
// always elapses via timeout.
const SLEEP_WORD = new Int32Array(new SharedArrayBuffer(4));

function sleepSyncMs(ms: number): void {
  if (ms <= 0) return;
  try {
    Atomics.wait(SLEEP_WORD, 0, 0, ms);
  } catch {
    // Atomics.wait is disallowed on some runtimes' main thread; a failed sleep
    // simply means the retry happens immediately, which is still correct.
  }
}

/** True when an error is a transient SQLite lock/busy condition worth retrying. */
export function isBusyError(err: unknown): boolean {
  const code = (err as { code?: string } | null | undefined)?.code;
  return code === "SQLITE_BUSY" || code === "SQLITE_LOCKED" || code === "SQLITE_BUSY_SNAPSHOT";
}

/**
 * Runs a synchronous DB operation, retrying on transient SQLITE_BUSY/LOCKED up
 * to `maxRetries` times with a short capped backoff. Non-busy errors propagate
 * immediately. Each retry increments the settlemate_db_busy_retries_total metric.
 */
export function withBusyRetry<T>(op: string, fn: () => T, maxRetries = 4): T {
  let attempt = 0;
  for (;;) {
    try {
      return fn();
    } catch (err) {
      if (!isBusyError(err) || attempt >= maxRetries) throw err;
      attempt += 1;
      try {
        metrics.dbBusyRetries.inc({ op });
      } catch {
        // Metrics must never break a write path.
      }
      sleepSyncMs(Math.min(10 * attempt, 50));
    }
  }
}

/**
 * Runs `fn` inside a single SQLite transaction (BEGIN/COMMIT, or a SAVEPOINT
 * when already nested inside another transaction). Every write issued by `fn`
 * commits atomically — a crash or a thrown error leaves none of them applied
 * rather than a partial subset. The transaction is executed through
 * withBusyRetry so a transient SQLITE_BUSY retries the whole unit safely (the
 * failed attempt has already been rolled back). `fn` must be synchronous.
 */
export function transaction<T>(fn: () => T): T {
  const txn = getDb().transaction(fn);
  return withBusyRetry("transaction", () => txn());
}

// -----------------------------------------------------------------------------
// RECONCILIATION JOBS REPOSITORY
// -----------------------------------------------------------------------------
export const JobRepository = {
  save(job: StoredReconciliationJob): void {
    try {
      const db = getDb();
      const stmt = db.prepare(`
        INSERT INTO reconciliation_jobs (
          job_id, status, created_at, completed_at, webhook_url, batch_size, summary, exceptions, receipt, error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(job_id) DO UPDATE SET
          status = excluded.status,
          completed_at = excluded.completed_at,
          summary = excluded.summary,
          exceptions = excluded.exceptions,
          receipt = excluded.receipt,
          error = excluded.error
      `);
      withBusyRetry("job.save", () =>
        stmt.run(
          job.jobId,
          job.status,
          job.createdAt,
          job.completedAt || null,
          job.webhookUrl || null,
          job.batchSize,
          job.summary || null,
          job.exceptions || null,
          job.receipt || null,
          job.error || null
        )
      );
    } catch (err) {
      console.error("[JobRepository] Error saving job:", err);
    }
  },

  get(jobId: string): StoredReconciliationJob | null {
    try {
      const db = getDb();
      const stmt = db.prepare("SELECT * FROM reconciliation_jobs WHERE job_id = ?");
      const row = stmt.get(jobId) as Record<string, unknown> | undefined;
      if (!row) return null;
      return {
        jobId: row.job_id as string,
        status: row.status as StoredReconciliationJob["status"],
        createdAt: row.created_at as string,
        completedAt: (row.completed_at as string) || undefined,
        webhookUrl: (row.webhook_url as string) || undefined,
        batchSize: Number(row.batch_size),
        summary: (row.summary as string) || undefined,
        exceptions: (row.exceptions as string) || undefined,
        receipt: (row.receipt as string) || undefined,
        error: (row.error as string) || undefined,
      };
    } catch (err) {
      console.error("[JobRepository] Error fetching job:", err);
      return null;
    }
  },

  getAll(): StoredReconciliationJob[] {
    try {
      const db = getDb();
      const stmt = db.prepare("SELECT * FROM reconciliation_jobs ORDER BY created_at DESC");
      const rows = stmt.all() as Record<string, unknown>[];
      return rows.map((row) => ({
        jobId: row.job_id as string,
        status: row.status as StoredReconciliationJob["status"],
        createdAt: row.created_at as string,
        completedAt: (row.completed_at as string) || undefined,
        webhookUrl: (row.webhook_url as string) || undefined,
        batchSize: Number(row.batch_size),
        summary: (row.summary as string) || undefined,
        exceptions: (row.exceptions as string) || undefined,
        receipt: (row.receipt as string) || undefined,
        error: (row.error as string) || undefined,
      }));
    } catch (err) {
      console.error("[JobRepository] Error fetching all jobs:", err);
      return [];
    }
  },

  list(limit: number = 50): StoredReconciliationJob[] {
    try {
      const db = getDb();
      const stmt = db.prepare("SELECT * FROM reconciliation_jobs ORDER BY created_at DESC LIMIT ?");
      const rows = stmt.all(limit) as Record<string, unknown>[];
      return rows.map((row) => ({
        jobId: row.job_id as string,
        status: row.status as StoredReconciliationJob["status"],
        createdAt: row.created_at as string,
        completedAt: (row.completed_at as string) || undefined,
        webhookUrl: (row.webhook_url as string) || undefined,
        batchSize: Number(row.batch_size),
        summary: (row.summary as string) || undefined,
        exceptions: (row.exceptions as string) || undefined,
        receipt: (row.receipt as string) || undefined,
        error: (row.error as string) || undefined,
      }));
    } catch (err) {
      console.error("[JobRepository] Error listing jobs:", err);
      return [];
    }
  },

  updateStatus(jobId: string, status: StoredReconciliationJob["status"], error?: string): void {
    try {
      const db = getDb();
      const stmt = db.prepare(`
        UPDATE reconciliation_jobs
        SET status = ?, error = ?, completed_at = CASE WHEN ? IN ('COMPLETED', 'FAILED') THEN datetime('now') ELSE completed_at END
        WHERE job_id = ?
      `);
      withBusyRetry("job.updateStatus", () => stmt.run(status, error || null, status, jobId));
    } catch (err) {
      console.error("[JobRepository] Error updating job status:", err);
    }
  },

  delete(jobId: string): boolean {
    try {
      const db = getDb();
      const stmt = db.prepare("DELETE FROM reconciliation_jobs WHERE job_id = ?");
      const res = withBusyRetry("job.delete", () => stmt.run(jobId));
      return res.changes > 0;
    } catch (err) {
      console.error("[JobRepository] Error deleting job:", err);
      return false;
    }
  },
};

// -----------------------------------------------------------------------------
// DECISION RECEIPTS REPOSITORY
// -----------------------------------------------------------------------------
export const DecisionReceiptRepository = {
  save(receipt: StoredDecisionReceipt): void {
    try {
      const db = getDb();
      const stmt = db.prepare(`
        INSERT INTO decision_receipts (
          receipt_id, job_id, root_hash, leaf_count, algorithm, timestamp, fingerprint, signature, canonical_payload, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(receipt_id) DO UPDATE SET
          signature = excluded.signature,
          canonical_payload = excluded.canonical_payload
      `);
      withBusyRetry("receipt.save", () =>
        stmt.run(
          receipt.receiptId,
          receipt.jobId || null,
          receipt.rootHash,
          receipt.leafCount,
          receipt.algorithm,
          receipt.timestamp,
          receipt.fingerprint,
          receipt.signature,
          receipt.canonicalPayload || null,
          receipt.createdAt
        )
      );
    } catch (err) {
      console.error("[DecisionReceiptRepository] Error saving receipt:", err);
    }
  },

  get(receiptId: string): StoredDecisionReceipt | null {
    try {
      const db = getDb();
      const stmt = db.prepare("SELECT * FROM decision_receipts WHERE receipt_id = ?");
      const row = stmt.get(receiptId) as Record<string, unknown> | undefined;
      if (!row) return null;
      return {
        receiptId: row.receipt_id as string,
        jobId: (row.job_id as string) || undefined,
        rootHash: row.root_hash as string,
        leafCount: Number(row.leaf_count),
        algorithm: row.algorithm as string,
        timestamp: row.timestamp as string,
        fingerprint: row.fingerprint as string,
        signature: row.signature as string,
        canonicalPayload: (row.canonical_payload as string) || undefined,
        createdAt: row.created_at as string,
      };
    } catch (err) {
      console.error("[DecisionReceiptRepository] Error fetching receipt:", err);
      return null;
    }
  },

  getByJobId(jobId: string): StoredDecisionReceipt | null {
    try {
      const db = getDb();
      const stmt = db.prepare("SELECT * FROM decision_receipts WHERE job_id = ? ORDER BY created_at DESC LIMIT 1");
      const row = stmt.get(jobId) as Record<string, unknown> | undefined;
      if (!row) return null;
      return {
        receiptId: row.receipt_id as string,
        jobId: (row.job_id as string) || undefined,
        rootHash: row.root_hash as string,
        leafCount: Number(row.leaf_count),
        algorithm: row.algorithm as string,
        timestamp: row.timestamp as string,
        fingerprint: row.fingerprint as string,
        signature: row.signature as string,
        canonicalPayload: (row.canonical_payload as string) || undefined,
        createdAt: row.created_at as string,
      };
    } catch (err) {
      console.error("[DecisionReceiptRepository] Error fetching receipt by jobId:", err);
      return null;
    }
  },

  list(limit: number = 50): StoredDecisionReceipt[] {
    try {
      const db = getDb();
      const stmt = db.prepare("SELECT * FROM decision_receipts ORDER BY created_at DESC LIMIT ?");
      const rows = stmt.all(limit) as Record<string, unknown>[];
      return rows.map((row) => ({
        receiptId: row.receipt_id as string,
        jobId: (row.job_id as string) || undefined,
        rootHash: row.root_hash as string,
        leafCount: Number(row.leaf_count),
        algorithm: row.algorithm as string,
        timestamp: row.timestamp as string,
        fingerprint: row.fingerprint as string,
        signature: row.signature as string,
        canonicalPayload: (row.canonical_payload as string) || undefined,
        createdAt: row.created_at as string,
      }));
    } catch (err) {
      console.error("[DecisionReceiptRepository] Error listing receipts:", err);
      return [];
    }
  },
};

// -----------------------------------------------------------------------------
// WEBHOOK REGISTRATIONS & DELIVERY LOGS REPOSITORY
// -----------------------------------------------------------------------------
export const WebhookRepository = {
  saveRegistration(sub: StoredWebhookRegistration): void {
    try {
      const db = getDb();
      const stmt = db.prepare(`
        INSERT INTO webhook_registrations (
          id, url, events, secret, status, registered_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          url = excluded.url,
          events = excluded.events,
          secret = excluded.secret,
          status = excluded.status,
          updated_at = excluded.updated_at
      `);
      withBusyRetry("webhook.saveRegistration", () =>
        stmt.run(sub.id, sub.url, sub.events, sub.secret, sub.status, sub.registeredAt, sub.updatedAt)
      );
    } catch (err) {
      console.error("[WebhookRepository] Error saving registration:", err);
    }
  },

  getRegistration(id: string): StoredWebhookRegistration | null {
    try {
      const db = getDb();
      const stmt = db.prepare("SELECT * FROM webhook_registrations WHERE id = ?");
      const row = stmt.get(id) as Record<string, unknown> | undefined;
      if (!row) return null;
      return {
        id: row.id as string,
        url: row.url as string,
        events: row.events as string,
        secret: row.secret as string,
        status: row.status as StoredWebhookRegistration["status"],
        registeredAt: row.registered_at as string,
        updatedAt: row.updated_at as string,
      };
    } catch (err) {
      console.error("[WebhookRepository] Error fetching registration:", err);
      return null;
    }
  },

  getAllRegistrations(): StoredWebhookRegistration[] {
    try {
      const db = getDb();
      const stmt = db.prepare("SELECT * FROM webhook_registrations ORDER BY registered_at DESC");
      const rows = stmt.all() as Record<string, unknown>[];
      return rows.map((row) => ({
        id: row.id as string,
        url: row.url as string,
        events: row.events as string,
        secret: row.secret as string,
        status: row.status as StoredWebhookRegistration["status"],
        registeredAt: row.registered_at as string,
        updatedAt: row.updated_at as string,
      }));
    } catch (err) {
      console.error("[WebhookRepository] Error fetching all registrations:", err);
      return [];
    }
  },

  deleteRegistration(id: string): boolean {
    try {
      const db = getDb();
      const stmt = db.prepare("DELETE FROM webhook_registrations WHERE id = ?");
      const res = withBusyRetry("webhook.deleteRegistration", () => stmt.run(id));
      return res.changes > 0;
    } catch (err) {
      console.error("[WebhookRepository] Error deleting registration:", err);
      return false;
    }
  },

  saveDeliveryLog(log: StoredWebhookDeliveryLog): void {
    try {
      const db = getDb();
      const stmt = db.prepare(`
        INSERT INTO webhook_delivery_logs (
          id, webhook_id, url, event, payload, signature, timestamp, status, status_code, attempts, last_attempt_at, error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          status_code = excluded.status_code,
          attempts = excluded.attempts,
          last_attempt_at = excluded.last_attempt_at,
          error = excluded.error
      `);
      withBusyRetry("webhook.saveDeliveryLog", () =>
        stmt.run(
          log.id,
          log.webhookId || null,
          log.url,
          log.event,
          log.payload,
          log.signature,
          log.timestamp,
          log.status,
          log.statusCode,
          log.attempts,
          log.lastAttemptAt || null,
          log.error || null
        )
      );
    } catch (err) {
      console.error("[WebhookRepository] Error saving delivery log:", err);
    }
  },

  getDeliveryLogs(limit: number = 100): StoredWebhookDeliveryLog[] {
    try {
      const db = getDb();
      const stmt = db.prepare("SELECT * FROM webhook_delivery_logs ORDER BY timestamp DESC LIMIT ?");
      const rows = stmt.all(limit) as Record<string, unknown>[];
      return rows.map((row) => ({
        id: row.id as string,
        webhookId: (row.webhook_id as string) || undefined,
        url: row.url as string,
        event: row.event as string,
        payload: row.payload as string,
        signature: row.signature as string,
        timestamp: row.timestamp as string,
        status: row.status as StoredWebhookDeliveryLog["status"],
        statusCode: Number(row.status_code),
        attempts: Number(row.attempts),
        lastAttemptAt: (row.last_attempt_at as string) || undefined,
        error: (row.error as string) || undefined,
      }));
    } catch (err) {
      console.error("[WebhookRepository] Error fetching delivery logs:", err);
      return [];
    }
  },

  clearDeliveryLogs(): void {
    try {
      const db = getDb();
      withBusyRetry("webhook.clearDeliveryLogs", () =>
        db.prepare("DELETE FROM webhook_delivery_logs").run()
      );
    } catch (err) {
      console.error("[WebhookRepository] Error clearing logs:", err);
    }
  },
};

// -----------------------------------------------------------------------------
// AI CLAIM LOGS REPOSITORY
// -----------------------------------------------------------------------------
export const AiClaimLogRepository = {
  logAiCall(entry: StoredAiClaimLog): void {
    try {
      const db = getDb();
      const stmt = db.prepare(`
        INSERT INTO ai_claim_logs (
          id, timestamp, exception_id, model, input_hash, prompt, output, latency_ms, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      withBusyRetry("aiClaim.log", () =>
        stmt.run(
          entry.id,
          entry.timestamp,
          entry.exceptionId,
          entry.model,
          entry.inputHash,
          entry.prompt || null,
          entry.output || null,
          entry.latencyMs,
          entry.status,
          entry.createdAt
        )
      );
    } catch (err) {
      console.error("[AiClaimLogRepository] Error logging AI call:", err);
    }
  },

  getByExceptionId(exceptionId: string): StoredAiClaimLog[] {
    try {
      const db = getDb();
      const stmt = db.prepare("SELECT * FROM ai_claim_logs WHERE exception_id = ? ORDER BY created_at DESC");
      const rows = stmt.all(exceptionId) as Record<string, unknown>[];
      return rows.map((row) => ({
        id: row.id as string,
        timestamp: row.timestamp as string,
        exceptionId: row.exception_id as string,
        model: row.model as string,
        inputHash: row.input_hash as string,
        prompt: (row.prompt as string) || undefined,
        output: (row.output as string) || undefined,
        latencyMs: Number(row.latency_ms),
        status: row.status as StoredAiClaimLog["status"],
        createdAt: row.created_at as string,
      }));
    } catch (err) {
      console.error("[AiClaimLogRepository] Error fetching AI logs:", err);
      return [];
    }
  },

  getAll(limit: number = 100): StoredAiClaimLog[] {
    try {
      const db = getDb();
      const stmt = db.prepare("SELECT * FROM ai_claim_logs ORDER BY created_at DESC LIMIT ?");
      const rows = stmt.all(limit) as Record<string, unknown>[];
      return rows.map((row) => ({
        id: row.id as string,
        timestamp: row.timestamp as string,
        exceptionId: row.exception_id as string,
        model: row.model as string,
        inputHash: row.input_hash as string,
        prompt: (row.prompt as string) || undefined,
        output: (row.output as string) || undefined,
        latencyMs: Number(row.latency_ms),
        status: row.status as StoredAiClaimLog["status"],
        createdAt: row.created_at as string,
      }));
    } catch (err) {
      console.error("[AiClaimLogRepository] Error fetching all AI logs:", err);
      return [];
    }
  },
};

// -----------------------------------------------------------------------------
// AUDIT LEDGER REPOSITORY
// -----------------------------------------------------------------------------
export const AuditLedgerRepository = {
  log(entry: StoredAuditLedgerEntry): void {
    try {
      const db = getDb();
      const stmt = db.prepare(`
        INSERT INTO audit_ledger (
          id, batch_id, entity_type, entity_id, actor, action, reason, metadata, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      withBusyRetry("audit.log", () =>
        stmt.run(
          entry.id,
          entry.batchId || null,
          entry.entityType || null,
          entry.entityId || null,
          entry.actor,
          entry.action,
          entry.reason || null,
          entry.metadata || null,
          entry.createdAt
        )
      );
    } catch (err) {
      console.error("[AuditLedgerRepository] Error logging audit:", err);
    }
  },

  getByBatchId(batchId: string): StoredAuditLedgerEntry[] {
    try {
      const db = getDb();
      const stmt = db.prepare("SELECT * FROM audit_ledger WHERE batch_id = ? ORDER BY created_at DESC");
      const rows = stmt.all(batchId) as Record<string, unknown>[];
      return rows.map((row) => ({
        id: row.id as string,
        batchId: (row.batch_id as string) || undefined,
        entityType: (row.entity_type as string) || undefined,
        entityId: (row.entity_id as string) || undefined,
        actor: row.actor as string,
        action: row.action as string,
        reason: (row.reason as string) || undefined,
        metadata: (row.metadata as string) || undefined,
        createdAt: row.created_at as string,
      }));
    } catch (err) {
      console.error("[AuditLedgerRepository] Error fetching audit logs:", err);
      return [];
    }
  },
};

// -----------------------------------------------------------------------------
// VERIFY PROGRESS JOBS REPOSITORY
// -----------------------------------------------------------------------------
export const VerifyProgressRepository = {
  save(job: StoredVerifyProgressJob): void {
    try {
      const db = getDb();
      const stmt = db.prepare(`
        INSERT INTO verify_progress_jobs (
          job_id, status, requested_suites, total_suites, completed_suites, overall_progress_pct, started_at, completed_at, total_duration_ms, all_passed, results
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(job_id) DO UPDATE SET
          status = excluded.status,
          completed_suites = excluded.completed_suites,
          overall_progress_pct = excluded.overall_progress_pct,
          completed_at = excluded.completed_at,
          total_duration_ms = excluded.total_duration_ms,
          all_passed = excluded.all_passed,
          results = excluded.results
      `);
      withBusyRetry("verifyProgress.save", () =>
        stmt.run(
          job.jobId,
          job.status,
          job.requestedSuites,
          job.totalSuites,
          job.completedSuites,
          job.overallProgressPct,
          job.startedAt,
          job.completedAt || null,
          job.totalDurationMs !== undefined ? job.totalDurationMs : null,
          job.allPassed !== undefined ? job.allPassed : null,
          job.results
        )
      );
    } catch (err) {
      console.error("[VerifyProgressRepository] Error saving progress job:", err);
    }
  },

  get(jobId: string): StoredVerifyProgressJob | null {
    try {
      const db = getDb();
      const stmt = db.prepare("SELECT * FROM verify_progress_jobs WHERE job_id = ?");
      const row = stmt.get(jobId) as Record<string, unknown> | undefined;
      if (!row) return null;
      return {
        jobId: row.job_id as string,
        status: row.status as StoredVerifyProgressJob["status"],
        requestedSuites: row.requested_suites as string,
        totalSuites: Number(row.total_suites),
        completedSuites: Number(row.completed_suites),
        overallProgressPct: Number(row.overall_progress_pct),
        startedAt: row.started_at as string,
        completedAt: (row.completed_at as string) || undefined,
        totalDurationMs: row.total_duration_ms !== null ? Number(row.total_duration_ms) : undefined,
        allPassed: row.all_passed !== null ? Number(row.all_passed) : undefined,
        results: row.results as string,
      };
    } catch (err) {
      console.error("[VerifyProgressRepository] Error fetching progress job:", err);
      return null;
    }
  },
};
