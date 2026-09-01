/*
 * SettleMate AI — Cooperative Job Cancellation Endpoint
 *
 * POST /api/batches/jobs/[jobId]/cancel
 * Requests cooperative cancellation for an active durable job.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { requestJobCancellation, getDurableJob } from "@/lib/workers/durable-job-worker";
import { applySecurityHeaders, handleCorsPreflight, rateLimitGuard } from "@/lib/security/api-security";

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function POST(
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

  if (existing.status === "CANCEL_REQUESTED") {
    return applySecurityHeaders(
      NextResponse.json({
        success: true,
        jobId,
        status: "CANCEL_REQUESTED",
        cancelled: true,
        cancelRequestedAt: existing.cancelRequestedAt,
        message: "Cancellation already requested for this job.",
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
    console.error(`[JobCancel] Cancellation failed for '${jobId}':`, err);
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
