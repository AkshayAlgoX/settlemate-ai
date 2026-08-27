/*
 * SettleMate AI — Route Handler Instrumentation
 *
 * `instrument(route, handler)` wraps an App Router route handler to add, without
 * changing its behavior:
 *   - a per-request correlation id (returned as the `x-request-id` header)
 *   - a structured completion/error log line (method, route, status, latency)
 *   - Prometheus request-count and latency metrics
 *   - a safe, non-leaky 500 response if the handler throws (via safeErrorResponse)
 *
 * The wrapper is fully generic over the handler's argument tuple, so the wrapped
 * export keeps the exact signature Next.js expects for GET/POST/etc. (including
 * the dynamic-route `context` argument).
 */

import { logger, newRequestId } from "@/lib/observability/logger";
import { metrics, statusClass } from "@/lib/observability/metrics";
import { applySecurityHeaders, safeErrorResponse } from "@/lib/security/api-security";

type RouteHandler<A extends unknown[]> = (...args: A) => Response | Promise<Response>;

function methodOf(args: unknown[]): string {
  const first = args[0];
  if (first && typeof first === "object" && "method" in first) {
    const m = (first as { method?: unknown }).method;
    if (typeof m === "string") return m;
  }
  return "UNKNOWN";
}

function setRequestId(res: Response, requestId: string): void {
  try {
    res.headers.set("x-request-id", requestId);
  } catch {
    // Some Response instances have immutable headers; the id still appears in logs.
  }
}

export function instrument<A extends unknown[]>(
  route: string,
  handler: RouteHandler<A>
): (...args: A) => Promise<Response> {
  return async (...args: A): Promise<Response> => {
    const method = methodOf(args);
    const requestId = newRequestId();
    const log = logger.child({ requestId, route, method });
    const start = Date.now();

    try {
      const res = await handler(...args);
      const durationMs = Date.now() - start;
      const status = typeof res?.status === "number" ? res.status : 200;
      try {
        metrics.httpRequests.inc({ route, method, status: statusClass(status) });
        metrics.httpRequestDurationMs.observe(durationMs, { route });
        if (status === 429) metrics.rateLimitRejections.inc({ route });
      } catch {
        /* metrics must never break a response */
      }
      log.info("request completed", { status, durationMs });
      setRequestId(res, requestId);
      return res;
    } catch (err) {
      const durationMs = Date.now() - start;
      try {
        metrics.httpRequests.inc({ route, method, status: statusClass(500) });
        metrics.httpRequestDurationMs.observe(durationMs, { route });
      } catch {
        /* ignore */
      }
      log.error("request failed", { err, durationMs });
      const res = applySecurityHeaders(safeErrorResponse(err, 500));
      setRequestId(res, requestId);
      return res;
    }
  };
}
