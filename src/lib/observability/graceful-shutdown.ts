/*
 * SettleMate AI — Graceful Shutdown (Node.js runtime only)
 *
 * Isolated in its own module so the Node-only POSIX APIs (`process.once`,
 * `process.exit`) are never part of the Edge Instrumentation bundle that Next.js
 * compiles from `instrumentation.ts`. `instrumentation.register()` imports this
 * dynamically, and only when `process.env.NEXT_RUNTIME === "nodejs"`.
 *
 * On SIGTERM/SIGINT we checkpoint the SQLite WAL and close the connection so an
 * orchestrator rolling the pod never leaves committed data stranded in the -wal
 * sidecar.
 */

import { logger } from "@/lib/observability/logger";
import { gracefulCloseDatabase } from "@/lib/storage/sqlite-db";

let installed = false;

/** Registers idempotent SIGTERM/SIGINT handlers that checkpoint + close the DB. */
export function installShutdownHandlers(): void {
  if (installed) return;
  installed = true;

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("graceful shutdown initiated", { signal });
    try {
      gracefulCloseDatabase();
      logger.info("database checkpointed and closed cleanly");
    } catch (err) {
      logger.error("error during graceful shutdown", { err });
    } finally {
      process.exit(0);
    }
  };

  // once() so a repeated signal during shutdown does not re-enter.
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}
