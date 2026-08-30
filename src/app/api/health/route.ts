/*
 * SettleMate AI — Liveness/Readiness Health Check
 *
 * GET /api/health — verifies real database connectivity (not just process
 * liveness) by executing a trivial query against the SQLite store, and reports
 * per-dependency status. Returns HTTP 200 when all checks pass, 503 otherwise,
 * so an orchestrator (Kubernetes, ECS, a load balancer) can gate traffic.
 */

import { NextResponse } from "next/server";
import { checkDatabaseConnection } from "@/lib/db";
import { applySecurityHeaders } from "@/lib/security/api-security";
import { logger } from "@/lib/observability/logger";

const serverStartTime = Date.now();

export const dynamic = "force-dynamic";

interface DependencyCheck {
  status: "up" | "down";
  latencyMs: number;
  provider?: string;
  error?: string;
  errorCode?: string;
}

export async function GET() {
  const checks: Record<string, DependencyCheck> = {};
  let healthy = true;

  // Database connectivity: a real round-trip against the active production store (PostgreSQL or SQLite)
  const dbHealth = await checkDatabaseConnection();
  if (dbHealth.status === "up") {
    checks.database = {
      status: "up",
      provider: dbHealth.provider,
      latencyMs: dbHealth.latencyMs,
    };
  } else {
    healthy = false;
    checks.database = {
      status: "down",
      provider: dbHealth.provider,
      latencyMs: dbHealth.latencyMs,
      error: "database unreachable; see server logs for detail",
    };
    logger.error("health check failed: database unreachable");
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
