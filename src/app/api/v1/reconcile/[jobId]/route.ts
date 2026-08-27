/*
 * SettleMate AI — REST API v1 Get Job by ID Endpoint
 */

import { NextRequest, NextResponse } from "next/server";
import {
  applySecurityHeaders,
  handleCorsPreflight,
  rateLimitGuard,
  validateApiKey,
} from "@/lib/security/api-security";
import { v1Store } from "@/lib/api/v1-store";
import { instrument } from "@/lib/observability/route";

export async function OPTIONS() {
  return handleCorsPreflight();
}

async function handleGet(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const rateLimit = rateLimitGuard(req);
  if (!rateLimit.allowed && rateLimit.response) {
    return rateLimit.response;
  }

  const apiKey = req.headers.get("x-api-key") || req.headers.get("authorization");
  const auth = validateApiKey(apiKey);
  if (!auth.valid) {
    return applySecurityHeaders(
      NextResponse.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: auth.error || "Valid API key starting with 'sk_' (length > 20) required",
          },
        },
        { status: 401 }
      )
    );
  }

  const { jobId } = await params;
  const job = v1Store.getJob(jobId);

  if (!job) {
    return applySecurityHeaders(
      NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: `Reconciliation job with ID '${jobId}' not found`,
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

export const GET = instrument("v1.job.detail", handleGet);
