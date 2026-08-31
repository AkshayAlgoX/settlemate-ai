/*
 * SettleMate AI — Milestone 4: Human Correction Approval Endpoint
 *
 * POST /api/corrections/[id]/approve
 * Atomically approves and posts a minimal correcting journal entry after invariant verification.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  CorrectionRepository,
  CorrectionNotFoundError,
  CorrectionTenantIsolationError,
  StaleCorrectionError,
  ConcurrentApprovalConflictError,
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

  let body: { expectedVersion?: number; currentUnderlyingVersion?: number } = {};
  try {
    const text = await req.text();
    if (text) {
      body = JSON.parse(text);
    }
  } catch {}

  try {
    const result = await CorrectionRepository.approveCorrection({
      correctionId,
      tenantId: session.tenantId || "default_tenant",
      reviewerId: session.sub || session.name || "reviewer_admin",
      expectedVersion: body.expectedVersion,
      currentUnderlyingVersion: body.currentUnderlyingVersion,
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
    if (err instanceof StaleCorrectionError) {
      return applySecurityHeaders(
        NextResponse.json(
          {
            success: false,
            error: "STALE_CORRECTION",
            message: err.message,
            reason: "Underlying financial record version has changed. Recalculation required.",
          },
          { status: 409 }
        )
      );
    }
    if (err instanceof ConcurrentApprovalConflictError) {
      return applySecurityHeaders(
        NextResponse.json(
          {
            success: false,
            error: "CONCURRENT_APPROVAL_CONFLICT",
            message: "Another reviewer or process is currently approving this correction.",
          },
          { status: 409 }
        )
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
