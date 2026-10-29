/*
 * SettleMate AI — Milestone 5: Terminal Receipt Verification Endpoint
 *
 * POST /api/receipts/[id]/verify
 * Performs full independent verification of a sealed receipt and deterministic replay.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { TerminalReceiptRepository } from "@/lib/receipts/repository";
import { verifyTerminalReceipt } from "@/lib/receipts/verifier";
import { ReceiptTenantIsolationError } from "@/lib/receipts/types";
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

  const { id: receiptId } = await params;
  const tenantId = session.tenantId || "default_tenant";

  let body: { tamperedFields?: Record<string, unknown> } = {};
  try {
    const text = await req.text();
    if (text) {
      body = JSON.parse(text);
    }
  } catch {}

  try {
    const receipt = await TerminalReceiptRepository.getReceipt(receiptId, tenantId);
    if (!receipt) {
      return applySecurityHeaders(
        NextResponse.json(
          { success: false, error: "NOT_FOUND", message: `Receipt '${receiptId}' not found` },
          { status: 404 }
        )
      );
    }

    // Demo tampering simulation: verifies a modified in-memory copy without
    // touching stored state. Disabled in production so this endpoint only ever
    // reports on the stored receipt, and flagged as simulated otherwise.
    const simulated = Boolean(body.tamperedFields) && process.env.NODE_ENV !== "production";
    if (body.tamperedFields && !simulated) {
      return applySecurityHeaders(
        NextResponse.json(
          { success: false, error: "TAMPER_SIMULATION_DISABLED", message: "tamperedFields is not accepted in production" },
          { status: 400 }
        )
      );
    }
    const targetReceipt = simulated ? { ...receipt, ...body.tamperedFields } : receipt;

    const report = verifyTerminalReceipt(targetReceipt, undefined, tenantId);

    return applySecurityHeaders(
      NextResponse.json({
        success: true,
        simulated,
        report,
      })
    );
  } catch (err: unknown) {
    if (err instanceof ReceiptTenantIsolationError) {
      return applySecurityHeaders(
        NextResponse.json(
          { success: false, error: "FORBIDDEN", message: "Cross-tenant access blocked" },
          { status: 403 }
        )
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
