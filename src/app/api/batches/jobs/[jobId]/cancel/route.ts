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
