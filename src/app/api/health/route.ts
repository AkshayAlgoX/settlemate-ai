/*
 * SettleMate AI — Liveness/Readiness Health Check
 *
 * GET /api/health — verifies real database connectivity (not just process
 * liveness) by executing a trivial query against the SQLite store, and reports
 * per-dependency status. Returns HTTP 200 when all checks pass, 503 otherwise,
 * so an orchestrator (Kubernetes, ECS, a load balancer) can gate traffic.
 */

import { NextResponse } from "next/server";
import { getDb } from "@/lib/storage/sqlite-db";
import { applySecurityHeaders } from "@/lib/security/api-security";
import { logger } from "@/lib/observability/logger";

const serverStartTime = Date.now();

export const dynamic = "force-dynamic";

interface DependencyCheck {
  status: "up" | "down";
  latencyMs: number;
  error?: string;
}

export async function GET() {
  const checks: Record<string, DependencyCheck> = {};
  let healthy = true;

  // Database connectivity: a real round-trip, not a cached handle check.
  const dbStart = Date.now();
  try {
    const row = getDb().prepare("SELECT 1 AS ok").get() as { ok: number } | undefined;
    if (!row || row.ok !== 1) throw new Error("unexpected query result");
    checks.database = { status: "up", latencyMs: Date.now() - dbStart };
  } catch (err) {
    healthy = false;
    checks.database = {
      status: "down",
      latencyMs: Date.now() - dbStart,
      error: err instanceof Error ? err.message : "unknown error",
    };
    logger.error("health check failed: database unreachable", { err });
  }

  const body = {
    status: healthy ? "ok" : "unhealthy",
    uptime: Math.round((Date.now() - serverStartTime) / 1000),
    version: "v1.0.0",
    timestamp: new Date().toISOString(),
    checks,
  };

  return applySecurityHeaders(NextResponse.json(body, { status: healthy ? 200 : 503 }));
}
