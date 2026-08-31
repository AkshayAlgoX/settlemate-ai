/*
 * SettleMate AI — Tenant-Isolated Batch Generation Jobs List Endpoint
 *
 * GET /api/batches/jobs
 * Returns active and recent durable jobs for the authenticated tenant (read-only status).
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { listDurableJobs, detectAndReclaimStalledJobs } from "@/lib/workers/durable-job-worker";
import { UnifiedJobRepository } from "@/lib/storage/unified-store";
import { applySecurityHeaders, handleCorsPreflight, rateLimitGuard } from "@/lib/security/api-security";

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function GET(req: NextRequest) {
  const rateLimit = rateLimitGuard(req);
  if (!rateLimit.allowed && rateLimit.response) {
    return rateLimit.response;
  }

  const session = getSession(req);
  if (!session) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );
  }

  try {
    // Run opportunistic stalled job reclamation during list check
    await detectAndReclaimStalledJobs(30000, 3).catch(() => {});

    const { activeJobs: durableActive, recentJobs: durableRecent } = await listDurableJobs(session.tenantId, 20);
    const unifiedAll = await UnifiedJobRepository.listAsync(session.tenantId, 20);

    const activeMap = new Map<string, {
      jobId: string;
      tenantId: string;
      status: string;
      batchSize: number;
      progressCurrent: number;
      progressTotal: number;
      progressPct: number;
      createdAt: string;
    }>();

    // Add durable active jobs
    for (const d of durableActive) {
      if ((d.status === "PENDING" || d.status === "RUNNING") && !d.cancelRequestedAt) {
        const pct = d.progressTotal > 0 ? Math.min(100, Math.round((d.progressCurrent / d.progressTotal) * 100)) : 0;
        activeMap.set(d.id, {
          jobId: d.id,
          tenantId: d.tenantId,
          status: d.status,
          batchSize: d.progressTotal || (d.payload?.size as number) || 0,
          progressCurrent: d.progressCurrent,
          progressTotal: d.progressTotal,
          progressPct: pct,
          createdAt: d.createdAt.toISOString(),
        });
      }
    }

    // Add unified active jobs
    for (const u of unifiedAll) {
      if ((u.status === "PENDING" || u.status === "PROCESSING") && !activeMap.has(u.jobId)) {
        activeMap.set(u.jobId, {
          jobId: u.jobId,
          tenantId: u.tenantId || session.tenantId || "tenant_default_sandbox",
          status: u.status,
          batchSize: u.batchSize || 0,
          progressCurrent: 0,
          progressTotal: u.batchSize || 0,
          progressPct: u.progressPct || 0,
          createdAt: u.createdAt || new Date().toISOString(),
        });
      }
    }


    const recentJobs = durableRecent.map((d) => ({
      jobId: d.id,
      tenantId: d.tenantId,
      status: d.status,
      batchSize: d.progressTotal || (d.payload?.size as number) || 0,
      progressCurrent: d.progressCurrent,
      progressTotal: d.progressTotal,
      progressPct: d.progressTotal > 0 ? Math.round((d.progressCurrent / d.progressTotal) * 100) : (d.status === "COMPLETED" ? 100 : 0),
      cancelRequestedAt: d.cancelRequestedAt ? d.cancelRequestedAt.toISOString() : undefined,
      createdAt: d.createdAt.toISOString(),
      result: d.result,
      error: d.error,
    }));

    return applySecurityHeaders(
      NextResponse.json({
        success: true,
        tenantId: session.tenantId,
        activeJobs: Array.from(activeMap.values()),
        recentJobs,
      })
    );
  } catch (err: unknown) {
    console.error("[JobsAPI] Error listing jobs:", err);
    return applySecurityHeaders(
      NextResponse.json(
        { error: "Failed to list jobs" },
        { status: 500 }
      )
    );
  }
}
