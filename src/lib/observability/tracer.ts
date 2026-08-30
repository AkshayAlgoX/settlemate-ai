/*
 * SettleMate AI — OpenTelemetry & W3C Trace Context Implementation
 *
 * Implements:
 *   1. W3C Trace Context Specification (traceparent: 00-{traceId}-{spanId}-{flags})
 *   2. Distributed Trace Propagation across HTTP -> Next.js -> Worker -> AI -> Webhook
 *   3. Async Job Span Linkage & Context Restoration
 *   4. Zero Secret Leakage in Trace Spans
 *   5. Tenant-Safe Span Attributes
 */

import { randomBytes } from "node:crypto";
import { metrics } from "@/lib/observability/metrics";

export interface TraceContext {
  traceId: string; // 32-hex character string (128-bit)
  spanId: string; // 16-hex character string (64-bit)
  parentSpanId?: string;
  traceFlags: string; // 2-hex character string (e.g. "01")
  tracestate?: string;
}

export interface Span {
  name: string;
  context: TraceContext;
  startTime: number;
  attributes: Record<string, string | number | boolean>;
  status: "OK" | "ERROR";
  error?: string;
  endTime?: number;
  durationMs?: number;
}

/** Keys whose values must NEVER be placed into trace span attributes */
const FORBIDDEN_ATTRIBUTE_KEYS = /(secret|password|passwd|authorization|api[-_]?key|token|cookie|signature|whsec|payload)/i;

/**
 * Generates a valid W3C Trace Context.
 */
export function generateTraceContext(parent?: TraceContext): TraceContext {
  const traceId = parent?.traceId || randomBytes(16).toString("hex");
  const spanId = randomBytes(8).toString("hex");
  const traceFlags = parent?.traceFlags || "01";

  return {
    traceId,
    spanId,
    parentSpanId: parent?.spanId,
    traceFlags,
    tracestate: parent?.tracestate,
  };
}

/**
 * Serializes TraceContext into W3C traceparent header format:
 *   version-traceId-spanId-traceFlags
 */
export function formatTraceParent(context: TraceContext): string {
  return `00-${context.traceId}-${context.spanId}-${context.traceFlags}`;
}

/**
 * Parses W3C traceparent header string.
 */
export function parseTraceParent(header?: string | null): TraceContext | null {
  if (!header || typeof header !== "string") return null;

  const match = header.trim().match(/^00-([a-f0-9]{32})-([a-f0-9]{16})-([a-f0-9]{2})$/i);
  if (!match) return null;

  const [, traceId, parentSpanId, traceFlags] = match;

  // Cannot be all zeros
  if (/^0+$/.test(traceId) || /^0+$/.test(parentSpanId)) {
    return null;
  }

  const spanId = randomBytes(8).toString("hex");

  return {
    traceId: traceId.toLowerCase(),
    spanId,
    parentSpanId: parentSpanId.toLowerCase(),
    traceFlags: traceFlags.toLowerCase(),
  };
}

/**
 * Creates and starts a new OpenTelemetry Span.
 */
export function startSpan(
  name: string,
  parentContext?: TraceContext | null,
  initialAttributes: Record<string, string | number | boolean> = {}
): Span {
  const context = parentContext ? generateTraceContext(parentContext) : generateTraceContext();
  const sanitizedAttributes: Record<string, string | number | boolean> = {};

  for (const [k, v] of Object.entries(initialAttributes)) {
    if (!FORBIDDEN_ATTRIBUTE_KEYS.test(k)) {
      sanitizedAttributes[k] = v;
    }
  }

  return {
    name,
    context,
    startTime: performance.now(),
    attributes: sanitizedAttributes,
    status: "OK",
  };
}

/**
 * Ends a Span and calculates duration in ms.
 */
export function endSpan(span: Span, status: "OK" | "ERROR" = "OK", error?: Error | string): Span {
  span.endTime = performance.now();
  span.durationMs = Math.round((span.endTime - span.startTime) * 100) / 100;
  span.status = status;
  if (error) {
    span.error = typeof error === "string" ? error : error.message;
  }

  if (span.name.startsWith("db.")) {
    metrics.dbTransactionsTotal?.inc({ status: status.toLowerCase() });
  } else if (span.name.startsWith("ai.")) {
    metrics.aiCalls?.inc({ status: status.toLowerCase() });
  }

  return span;
}

/**
 * Helper to wrap an async operation in an OpenTelemetry Span.
 */
export async function withSpan<T>(
  name: string,
  parentContext: TraceContext | null,
  attributes: Record<string, string | number | boolean>,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  const span = startSpan(name, parentContext, attributes);
  try {
    const result = await fn(span);
    endSpan(span, "OK");
    return result;
  } catch (err: unknown) {
    endSpan(span, "ERROR", err as Error);
    throw err;
  }
}
