/*
 * SettleMate AI — Structured Logging
 *
 * Dependency-free structured JSON logger designed for Next.js route handlers and
 * internal modules. Emits one JSON object per line (NDJSON) to stdout/stderr so
 * logs are machine-parseable by any aggregator (Loki, Datadog, CloudWatch, …).
 *
 * Why not pino? pino's high-throughput transports rely on worker threads and
 * `pino.transport()`, which behave unreliably inside Next.js server components /
 * serverless bundles (the worker file path is rewritten by the bundler). A small,
 * self-contained logger avoids that entire class of deploy-time failures while
 * still giving structured, level-filtered, redacted, request-scoped logs.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/** Keys whose values are redacted anywhere they appear in log fields. */
const SENSITIVE_KEY_PATTERN =
  /(secret|password|passwd|authorization|api[-_]?key|token|cookie|signature|whsec)/i;

function resolveThreshold(): number {
  const raw = (process.env.LOG_LEVEL || "").toLowerCase();
  if (raw && raw in LEVEL_WEIGHT) return LEVEL_WEIGHT[raw as LogLevel];
  // Default: quieter in tests, info elsewhere.
  if (process.env.NODE_ENV === "test") return LEVEL_WEIGHT.warn;
  return LEVEL_WEIGHT.info;
}

export type LogFields = Record<string, unknown>;

/** Redacts sensitive values recursively (bounded depth to avoid pathological input). */
function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(k)) {
      out[k] = "[REDACTED]";
    } else {
      out[k] = redact(v, depth + 1);
    }
  }
  return out;
}

/** Serializes an Error into a plain, non-leaky object (message + name + stack only in dev). */
function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    const base: Record<string, unknown> = { name: err.name, message: err.message };
    // Stack is retained in logs (server-side only) but never in prod HTTP responses.
    if (process.env.NODE_ENV !== "production") base.stack = err.stack;
    return base;
  }
  return { message: String(err) };
}

export class Logger {
  private readonly bindings: LogFields;

  constructor(bindings: LogFields = {}) {
    this.bindings = bindings;
  }

  /** Returns a new logger that includes the given fields on every line. */
  child(bindings: LogFields): Logger {
    return new Logger({ ...this.bindings, ...bindings });
  }

  private write(level: LogLevel, msg: string, fields?: LogFields): void {
    if (LEVEL_WEIGHT[level] < resolveThreshold()) return;

    const record: Record<string, unknown> = {
      level,
      time: new Date().toISOString(),
      msg,
      ...this.bindings,
    };

    if (fields) {
      for (const [k, v] of Object.entries(fields)) {
        record[k] = k === "err" || k === "error" ? serializeError(v) : v;
      }
    }

    const line = JSON.stringify(redact(record));
    // console.* is supported in every runtime (Node + Edge) and appends the
    // newline itself, so NDJSON stays one-object-per-line without direct
    // process.stdout/stderr access (which is Edge-incompatible).
    if (level === "error" || level === "warn") {
      console.error(line);
    } else {
      console.log(line);
    }
  }

  debug(msg: string, fields?: LogFields): void {
    this.write("debug", msg, fields);
  }
  info(msg: string, fields?: LogFields): void {
    this.write("info", msg, fields);
  }
  warn(msg: string, fields?: LogFields): void {
    this.write("warn", msg, fields);
  }
  error(msg: string, fields?: LogFields): void {
    this.write("error", msg, fields);
  }
}

/** Process-wide root logger. */
export const logger = new Logger({ service: "settlemate-ai" });

/**
 * Generates a short, URL-safe request correlation id. Uses crypto.randomUUID
 * when available and falls back to a timestamp-based id otherwise.
 */
export function newRequestId(): string {
  try {
    // Available in Node 19+/edge runtimes.
    return "req_" + globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  } catch {
    return "req_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
}
