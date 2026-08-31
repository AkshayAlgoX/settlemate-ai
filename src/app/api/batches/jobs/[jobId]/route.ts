/*
 * SettleMate AI — Batch Generation Job Status & Polling Endpoint
 *
 * GET /api/batches/jobs/[jobId] — Read-only status query (zero execution side effects)
 * DELETE /api/batches/jobs/[jobId] — Cooperative job cancellation
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDurableJob, requestJobCancellation } from "@/lib/workers/durable-job-worker";
import { UnifiedJobRepository } from "@/lib/storage/unified-store";
import { applySecurityHeaders, handleCorsPreflight, rateLimitGuard } from "@/lib/security/api-security";

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
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

  const { jobId } = await params;

  // 1. Check durable worker job store
  const durableJob = await getDurableJob(jobId, session.tenantId);
  if (durableJob) {
    const progressPct = durableJob.progressTotal > 0
      ? Math.min(100, Math.round((durableJob.progressCurrent / durableJob.progressTotal) * 100))
      : (durableJob.status === "COMPLETED" ? 100 : 0);

    return applySecurityHeaders(
      NextResponse.json({
        success: true,
        job: {
          jobId: durableJob.id,
          tenantId: durableJob.tenantId,
          type: durableJob.jobType,
          status: durableJob.status,
          batchSize: durableJob.progressTotal || (durableJob.payload?.size as number) || 0,
          progressCurrent: durableJob.progressCurrent,
          progressTotal: durableJob.progressTotal,
          progressPct,
          retryCount: durableJob.attempt,
          retryable: durableJob.status === "FAILED" || durableJob.status === "STALLED",
          createdAt: durableJob.createdAt,
          claimedAt: durableJob.claimedAt,
          updatedAt: durableJob.updatedAt,
          completedAt: durableJob.completedAt,
          result: durableJob.result,
          error: durableJob.error,
        },
      })
    );
  }

  // 2. Fallback to unified repository store
  const job = await UnifiedJobRepository.getAsync(jobId, session.tenantId);
  if (!job) {
    return applySecurityHeaders(
      NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: `Batch generation job '${jobId}' not found`,
          },
        },
        { status: 404 }
      )
    );
  }

  let resultData = null;
  if (job.summary) {
    try {
      resultData = JSON.parse(job.summary);
    } catch {
      resultData = job.summary;
    }
  }

  return applySecurityHeaders(
    NextResponse.json({
      success: true,
      job: {
        jobId: job.jobId,
        tenantId: job.tenantId,
        type: job.type || job.jobType || "BATCH_GENERATION",
        status: job.status,
        batchSize: job.batchSize,
        progressPct: job.progressPct ?? (job.status === "COMPLETED" ? 100 : 0),
        retryCount: job.retryCount ?? 0,
        retryable: job.retryable ?? (job.status === "FAILED"),
        errorCode: job.errorCode,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        updatedAt: job.updatedAt,
        completedAt: job.completedAt,
        result: resultData,
        error: job.error,
      },
    })
  );
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
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

  const { jobId } = await params;
  try {
    const cancelled = await requestJobCancellation(jobId, session.tenantId);
    return applySecurityHeaders(
      NextResponse.json({
        success: true,
        jobId,
        cancelled,
        message: cancelled
          ? "Cancellation requested. The job will halt cooperatively after the current slice."
          : "Job cannot be cancelled (already completed or terminal).",
      })
    );
  } catch (err: unknown) {
    return applySecurityHeaders(
      NextResponse.json(
        {
          error: {
            code: "CANCEL_FAILED",
            message: err instanceof Error ? err.message : String(err),
          },
        },
        { status: 500 }
      )
    );
  }
}
