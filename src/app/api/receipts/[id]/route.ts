/*
 * SettleMate AI — Milestone 5: Single Terminal Receipt Detail Endpoint
 *
 * GET /api/receipts/[id]
 * Read-only retrieval of a sealed decision receipt strictly scoped to authenticated tenant.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { TerminalReceiptRepository } from "@/lib/receipts/repository";
import { ReceiptTenantIsolationError } from "@/lib/receipts/types";
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

  const { id: receiptId } = await params;
  const tenantId = session.tenantId || "default_tenant";

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

    return applySecurityHeaders(
      NextResponse.json({
        success: true,
        receipt,
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
