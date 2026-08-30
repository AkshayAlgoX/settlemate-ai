/*
 * SettleMate AI — Batch Generation Job Status & Polling Endpoint
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
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
        status: job.status,
        batchSize: job.batchSize,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
        result: resultData,
        error: job.error,
      },
    })
  );
}
