/*
 * SettleMate AI — Server Instrumentation
 *
 * Next.js loads this file once per server instance and calls `register()` before
 * the server accepts traffic (see node_modules/next/dist/docs/01-app/03-api-reference/
 * 03-file-conventions/instrumentation.md).
 *
 * We use it for two production concerns:
 *   1. Graceful shutdown — on SIGTERM/SIGINT we checkpoint the SQLite WAL and
 *      close the connection so an orchestrator rolling the pod never leaves
 *      committed data stranded in the -wal sidecar.
 *   2. Centralized error logging — `onRequestError` records every unhandled
 *      server-side error as a structured log line + metric, covering all routes
 *      without per-handler wiring.
 *
 * Everything is gated to the Node.js runtime; the Edge runtime has neither the
 * SQLite handle nor POSIX signals.
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { logger } = await import("@/lib/observability/logger");
  // Node-only POSIX signal + exit handling lives in a separate module so those
  // APIs never enter the Edge Instrumentation bundle Next compiles from here.
  const { installShutdownHandlers } = await import("@/lib/observability/graceful-shutdown");

  installShutdownHandlers();

  logger.info("instrumentation registered", { runtime: process.env.NEXT_RUNTIME });
}

/**
 * Called by Next.js when a server-side error is captured. Typed structurally to
 * avoid coupling to a specific `next` type export.
 */
export async function onRequestError(
  err: unknown,
  request: { path: string; method: string; headers: Record<string, string | string[]> },
  context: { routePath?: string; routeType?: string; [key: string]: unknown }
): Promise<void> {
  const { logger } = await import("@/lib/observability/logger");
  const { metrics, statusClass } = await import("@/lib/observability/metrics");

  try {
    metrics.httpRequests.inc({
      route: context.routePath || request.path,
      method: request.method,
      status: statusClass(500),
    });
  } catch {
    /* metrics must never mask the original error */
  }

  logger.error("unhandled server error", {
    err,
    path: request.path,
    method: request.method,
    routePath: context.routePath,
    routeType: context.routeType,
  });
}
