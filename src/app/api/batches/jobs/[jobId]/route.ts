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
          heartbeatAt: durableJob.heartbeatAt,
          leaseExpiresAt: durableJob.leaseExpiresAt,
          cancelRequestedAt: durableJob.cancelRequestedAt,
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
  const existing = await getDurableJob(jobId, session.tenantId);

  if (!existing) {
    return applySecurityHeaders(
      NextResponse.json(
        { error: { code: "NOT_FOUND", message: `Job '${jobId}' not found` } },
        { status: 404 }
      )
    );
  }

  if (existing.status === "COMPLETED") {
    return applySecurityHeaders(
      NextResponse.json(
        {
          error: {
            code: "ALREADY_COMPLETED",
            message: "Job is already completed and cannot be cancelled",
          },
          jobId,
          status: "COMPLETED",
        },
        { status: 409 }
      )
    );
  }

  if (existing.status === "FAILED" || existing.status === "DEAD_LETTER") {
    return applySecurityHeaders(
      NextResponse.json(
        {
          error: {
            code: "TERMINAL_STATE",
            message: `Job is in terminal state '${existing.status}' and cannot be cancelled`,
          },
          jobId,
          status: existing.status,
        },
        { status: 409 }
      )
    );
  }

  if (existing.status === "CANCELLED") {
    return applySecurityHeaders(
      NextResponse.json({
        success: true,
        jobId,
        status: "CANCELLED",
        cancelled: true,
        cancelRequestedAt: existing.cancelRequestedAt,
        message: "Job is already cancelled.",
      })
    );
  }

  try {
    const cancelled = await requestJobCancellation(jobId, session.tenantId);
    const updated = await getDurableJob(jobId, session.tenantId);

    return applySecurityHeaders(
      NextResponse.json({
        success: true,
        jobId,
        status: updated?.status || (cancelled ? "CANCELLED" : existing.status),
        cancelled,
        cancelRequestedAt: updated?.cancelRequestedAt,
        progressCurrent: updated?.progressCurrent,
        progressTotal: updated?.progressTotal,
        message: updated?.status === "CANCELLED"
          ? "Job cancelled successfully."
          : "Cancellation requested. The job will halt cooperatively after the current slice.",
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
