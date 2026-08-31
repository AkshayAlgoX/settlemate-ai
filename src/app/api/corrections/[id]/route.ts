/*
 * SettleMate AI — Milestone 4: Single Correction Detail Endpoint
 *
 * GET /api/corrections/[id]
 * Returns proposed correction details, journal lines, and invariant restoration proof.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  CorrectionRepository,
  CorrectionTenantIsolationError,
} from "@/lib/corrections/repository";
import { applySecurityHeaders, handleCorsPreflight, rateLimitGuard } from "@/lib/security/api-security";

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rateLimit = rateLimitGuard(req);
  if (!rateLimit.allowed && rateLimit.response) {
    return rateLimit.response;
  }

  const session = getSession(req);
  if (!session) {
    return applySecurityHeaders(
      NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    );
  }

  const { id: correctionId } = await params;

  try {
    const record = await CorrectionRepository.getCorrection(correctionId, session.tenantId || "default_tenant");
    if (!record) {
      return applySecurityHeaders(
        NextResponse.json({ success: false, error: "NOT_FOUND", message: `Correction '${correctionId}' not found` }, { status: 404 })
      );
    }

    return applySecurityHeaders(
      NextResponse.json({
        success: true,
        record,
      })
    );
  } catch (err: unknown) {
    if (err instanceof CorrectionTenantIsolationError) {
      return applySecurityHeaders(
        NextResponse.json({ success: false, error: "FORBIDDEN", message: "Cross-tenant access blocked" }, { status: 403 })
      );
    }

    return applySecurityHeaders(
      NextResponse.json({ success: false, error: "INTERNAL_ERROR", message: (err as Error).message }, { status: 500 })
    );
  }
}
