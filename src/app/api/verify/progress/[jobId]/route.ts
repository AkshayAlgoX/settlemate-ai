/*
 * SettleMate AI — Verification Hub Progress Polling Endpoint
 */

import { NextRequest, NextResponse } from "next/server";
import { applySecurityHeaders, handleCorsPreflight, rateLimitGuard } from "@/lib/security/api-security";
import { verifyProgressStore } from "@/lib/verify/progress-store";

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

  const { jobId } = await params;
  const job = verifyProgressStore.getJob(jobId);

  if (!job) {
    return applySecurityHeaders(
      NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: `Verification job with ID '${jobId}' not found`,
          },
        },
        { status: 404 }
      )
    );
  }

  return applySecurityHeaders(
    NextResponse.json({
      success: true,
      job,
    })
  );
}
