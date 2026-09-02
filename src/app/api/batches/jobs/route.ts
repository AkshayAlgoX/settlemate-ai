/*
 * SettleMate AI — Tenant-Isolated Batch Generation Jobs List Endpoint
 *
 * GET /api/batches/jobs
 * Returns active and recent durable jobs for the authenticated tenant (read-only status).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
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

    const { activeJobs: durableActive, recentJobs: durableRecent } = await listDurableJobs(session.tenantId, 100);
    const unifiedAll = await UnifiedJobRepository.listAsync(session.tenantId, 100);

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
      if (
        (d.status === "PENDING" || d.status === "CLAIMED" || d.status === "RUNNING" || d.status === "RETRY_WAIT") &&
        !d.cancelRequestedAt
      ) {
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


    const recentMap = new Map<string, {
      jobId: string;
      tenantId: string;
      status: string;
      batchSize: number;
      progressCurrent: number;
      progressTotal: number;
      progressPct: number;
      cancelRequestedAt?: string;
      createdAt: string;
      result?: unknown;
      error?: string;
    }>();

    for (const d of durableRecent) {
      recentMap.set(d.id, {
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
      });
    }

    for (const u of unifiedAll) {
      if (!recentMap.has(u.jobId) && !activeMap.has(u.jobId)) {
        const batchSize = u.batchSize || 0;
        let resultObj: { batchId?: string; size?: number } | undefined;
        if (u.summary) {
          try {
            const parsed = JSON.parse(u.summary);
            if (parsed && typeof parsed === "object") {
              resultObj = {
                batchId: (parsed.batchId as string) || u.jobId.replace(/^job_gen_/, ""),
                size: (parsed.size as number) || batchSize,
              };
            }
          } catch {
            resultObj = { batchId: u.jobId.replace(/^job_gen_/, ""), size: batchSize };
          }
        } else {
          resultObj = { batchId: u.jobId.replace(/^job_gen_/, ""), size: batchSize };
        }

        recentMap.set(u.jobId, {
          jobId: u.jobId,
          tenantId: u.tenantId || session.tenantId || "tenant_default_sandbox",
          status: u.status,
          batchSize,
          progressCurrent: batchSize,
          progressTotal: batchSize,
          progressPct: u.progressPct ?? 100,
          createdAt: u.createdAt || new Date().toISOString(),
          result: resultObj,
          error: u.error,
        });
      }
    }

    // In addition to active/recent durable jobs and unified jobs, correlate with persisted batches
    try {
      const dbBatches = await prisma.batch.findMany({
        take: 50,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          size: true,
          status: true,
          totalRecords: true,
          createdAt: true,
        },
      });

      for (const b of dbBatches) {
        const genJobId = `job_gen_${b.id}`;
        const alreadyTracked =
          activeMap.has(genJobId) ||
          recentMap.has(genJobId) ||
          activeMap.has(b.id) ||
          recentMap.has(b.id) ||
          Array.from(recentMap.values()).some(
            (r) => (r.result as { batchId?: string } | undefined)?.batchId === b.id
          );

        if (!alreadyTracked) {
          const isCancelled = b.status === "CANCELLED";
          const isFailed = b.status === "FAILED";
          const batchSize = b.size || b.totalRecords || 250;
          const mappedItem = {
            jobId: genJobId,
            tenantId: session.tenantId || "tenant_default_sandbox",
            status: isCancelled ? "CANCELLED" : isFailed ? "FAILED" : "COMPLETED",
            batchSize,
            progressCurrent: batchSize,
            progressTotal: batchSize,
            progressPct: 100,
            createdAt: b.createdAt.toISOString(),
            result: { batchId: b.id, size: batchSize },
          };

          // Persisted batches are historical records and belong strictly in recentMap
          recentMap.set(genJobId, mappedItem);
        }
      }
    } catch (batchErr) {
      console.warn("[JobsAPI] Batch correlation warning:", batchErr);
    }

    // Strict invariant: Ensure no cancelled or terminal job ever leaks into activeJobs
    for (const [id, job] of activeMap.entries()) {
      if (
        job.status === "CANCELLED" ||
        job.status === "CANCEL_REQUESTED" ||
        job.status === "COMPLETED" ||
        job.status === "FAILED" ||
        job.status === "DEAD_LETTER"
      ) {
        activeMap.delete(id);
        if (!recentMap.has(id)) {
          recentMap.set(id, job);
        }
      }
    }

    // Also remove from activeMap anything confirmed cancelled or completed in recentMap
    for (const [id, recentJob] of recentMap.entries()) {
      if (
        recentJob.status === "CANCELLED" ||
        recentJob.status === "COMPLETED" ||
        recentJob.status === "FAILED"
      ) {
        activeMap.delete(id);
        if (recentJob.result && typeof recentJob.result === "object" && "batchId" in recentJob.result) {
          const bId = (recentJob.result as { batchId?: string }).batchId;
          if (bId) {
            activeMap.delete(`job_gen_${bId}`);
            activeMap.delete(bId);
          }
        }
      }
    }

    const recentJobs = Array.from(recentMap.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

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
