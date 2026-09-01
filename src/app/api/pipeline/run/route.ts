/*
 * SettleMate AI — Canonical Financial Decision Pipeline Run API Endpoint
 *
 * POST /api/pipeline/run
 * Executes the complete 5-milestone pipeline with strict tenant authentication and structured errors.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { CanonicalFinancialPipelineOrchestrator } from "@/lib/pipeline/financial-decision-pipeline";
import { applySecurityHeaders, handleCorsPreflight, rateLimitGuard } from "@/lib/security/api-security";

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function POST(req: NextRequest) {
  const rateLimit = rateLimitGuard(req);
  if (!rateLimit.allowed && rateLimit.response) {
    return rateLimit.response;
  }

  const session = getSession(req);
  if (!session) {
    return applySecurityHeaders(
      NextResponse.json({ success: false, error: "UNAUTHORIZED", message: "Authentication required" }, { status: 401 })
    );
  }

  try {
    const tenantId = session.tenantId || "default_tenant";
    const body = await req.json();

    if (!body.transactionId || typeof body.amountMinor !== "number") {
      return applySecurityHeaders(
        NextResponse.json(
          {
            success: false,
            error: "VALIDATION_FAILED",
            message: "Missing required fields: transactionId, amountMinor",
          },
          { status: 422 }
        )
      );
    }

    const result = await CanonicalFinancialPipelineOrchestrator.execute({
      ...body,
      tenantId,
    });

    return applySecurityHeaders(
      NextResponse.json({
        success: true,
        data: result,
      })
    );
  } catch (err: unknown) {
    const message = (err as Error).message || "Pipeline execution failed";
    return applySecurityHeaders(
      NextResponse.json(
        {
          success: false,
          error: "PIPELINE_EXECUTION_ERROR",
          message,
        },
        { status: 500 }
      )
    );
  }
}
