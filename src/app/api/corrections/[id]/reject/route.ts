/*
 * SettleMate AI — Milestone 4: Human Correction Rejection Endpoint
 *
 * POST /api/corrections/[id]/reject
 * Idempotently records human rejection of a proposed correction with reason.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  CorrectionRepository,
  CorrectionNotFoundError,
  CorrectionTenantIsolationError,
  InvalidStateTransitionError,
} from "@/lib/corrections/repository";
import { applySecurityHeaders, handleCorsPreflight, rateLimitGuard } from "@/lib/security/api-security";

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function POST(
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

  let reason = "Manual human rejection";
  try {
    const text = await req.text();
    if (text) {
      const parsed = JSON.parse(text);
      if (parsed.reason) reason = String(parsed.reason);
    }
  } catch {}

  try {
    const result = await CorrectionRepository.rejectCorrection({
      correctionId,
      tenantId: session.tenantId || "default_tenant",
      reviewerId: session.sub || session.name || "reviewer_admin",
      reason,
    });

    return applySecurityHeaders(
      NextResponse.json({
        success: true,
        status: result.record.status,
        correctionId: result.record.correctionId,
        idempotent: Boolean(result.idempotent),
        record: result.record,
      })
    );
  } catch (err: unknown) {
    if (err instanceof CorrectionNotFoundError) {
      return applySecurityHeaders(
        NextResponse.json({ success: false, error: "NOT_FOUND", message: err.message }, { status: 404 })
      );
    }
    if (err instanceof CorrectionTenantIsolationError) {
      return applySecurityHeaders(
        NextResponse.json({ success: false, error: "FORBIDDEN", message: "Cross-tenant access blocked" }, { status: 403 })
      );
    }
    if (err instanceof InvalidStateTransitionError) {
      return applySecurityHeaders(
        NextResponse.json({ success: false, error: "INVALID_STATE", message: err.message }, { status: 400 })
      );
    }

    return applySecurityHeaders(
      NextResponse.json(
        { success: false, error: "INTERNAL_ERROR", message: (err as Error).message },
        { status: 500 }
      )
    );
  }
}
