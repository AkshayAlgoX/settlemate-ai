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
