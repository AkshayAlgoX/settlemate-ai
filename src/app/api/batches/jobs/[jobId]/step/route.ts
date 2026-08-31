/*
 * SettleMate AI — Bounded Job Step Execution Endpoint ($0 Free Render Architecture)
 *
 * POST /api/batches/jobs/[jobId]/step
 * Executes a single bounded slice of work (< 1.5s) and checkpoints progress.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { stepJobChunk, getDurableJob } from "@/lib/workers/durable-job-worker";
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

  // 1. Rejection of cancelled or cancelling jobs
  if (
    existing.status === "CANCEL_REQUESTED" ||
    existing.status === "CANCELLED" ||
    Boolean(existing.cancelRequestedAt)
  ) {
    const { cancelJob } = await import("@/lib/workers/durable-job-worker");
    await cancelJob(jobId, undefined, "Cancellation requested by user");
    const updated = await getDurableJob(jobId, session.tenantId);

    return applySecurityHeaders(
      NextResponse.json(
        {
          error: {
            code: "JOB_CANCELLED",
            message: "Cannot step a cancelled or cancelling job",
          },
          job: updated ? {
            jobId: updated.id,
            tenantId: updated.tenantId,
            jobType: updated.jobType,
            status: updated.status,
            progressCurrent: updated.progressCurrent,
            progressTotal: updated.progressTotal,
            progressPct: updated.progressTotal > 0 ? Math.round((updated.progressCurrent / updated.progressTotal) * 100) : 0,
            completedSliceCount: 0,
            isComplete: false,
            isCancelled: true,
            error: updated.error,
          } : undefined,
        },
        { status: 409 }
      )
    );
  }

  // 2. Rejection of completed or terminal jobs
  if (
    existing.status === "COMPLETED" ||
    existing.status === "FAILED" ||
    existing.status === "DEAD_LETTER" ||
    existing.status === "STALLED"
  ) {
    return applySecurityHeaders(
      NextResponse.json(
        {
          error: {
            code: "JOB_TERMINAL",
            message: `Cannot step a job in status '${existing.status}'`,
          },
          job: {
            jobId: existing.id,
            tenantId: existing.tenantId,
            jobType: existing.jobType,
            status: existing.status,
            progressCurrent: existing.progressCurrent,
            progressTotal: existing.progressTotal,
            progressPct: existing.progressTotal > 0 ? Math.round((existing.progressCurrent / existing.progressTotal) * 100) : (existing.status === "COMPLETED" ? 100 : 0),
            completedSliceCount: 0,
            isComplete: existing.status === "COMPLETED",
            isCancelled: false,
            result: existing.result,
            error: existing.error,
          },
        },
        { status: 409 }
      )
    );
  }

  let body: { chunkSize?: number } = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }

  try {
    const workerId = `web_stepper_${session.sub || session.tenantId || "user"}`;
    const stepResult = await stepJobChunk(jobId, workerId, {
      chunkSize: body.chunkSize ?? 100,
    });

    if (stepResult.isCancelled || stepResult.status === "CANCELLED") {
      return applySecurityHeaders(
        NextResponse.json(
          {
            error: {
              code: "JOB_CANCELLED",
              message: "Job execution halted due to cancellation",
            },
            job: {
              jobId: stepResult.jobId,
              tenantId: stepResult.tenantId,
              jobType: stepResult.jobType,
              status: stepResult.status,
              progressCurrent: stepResult.progressCurrent,
              progressTotal: stepResult.progressTotal,
              progressPct: stepResult.progressPct,
              completedSliceCount: stepResult.completedSliceCount,
              isComplete: false,
              isCancelled: true,
              result: stepResult.result,
              error: stepResult.error,
              durationMs: stepResult.durationMs,
            },
          },
          { status: 409 }
        )
      );
    }

    return applySecurityHeaders(
      NextResponse.json({
        success: true,
        job: {
          jobId: stepResult.jobId,
          tenantId: stepResult.tenantId,
          jobType: stepResult.jobType,
          status: stepResult.status,
          progressCurrent: stepResult.progressCurrent,
          progressTotal: stepResult.progressTotal,
          progressPct: stepResult.progressPct,
          completedSliceCount: stepResult.completedSliceCount,
          isComplete: stepResult.isComplete,
          isCancelled: stepResult.isCancelled,
          result: stepResult.result,
          error: stepResult.error,
          durationMs: stepResult.durationMs,
        },
      })
    );
  } catch (err: unknown) {
    console.error(`[JobStep] Execution failed for '${jobId}':`, err);
    return applySecurityHeaders(
      NextResponse.json(
        {
          error: {
            code: "STEP_EXECUTION_FAILED",
            message: err instanceof Error ? err.message : String(err),
          },
        },
        { status: 500 }
      )
    );
  }
}
