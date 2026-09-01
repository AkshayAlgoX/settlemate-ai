/*
 * SettleMate AI — Milestone 5: Terminal Decision Receipts API Endpoint
 *
 * GET /api/receipts — List terminal decision receipts for authenticated tenant
 * POST /api/receipts — Create and seal an immutable terminal decision receipt
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { TerminalReceiptRepository } from "@/lib/receipts/repository";
import { createTerminalDecisionReceipt } from "@/lib/receipts/builder";
import { applySecurityHeaders, handleCorsPreflight, rateLimitGuard } from "@/lib/security/api-security";

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function GET(req: NextRequest) {
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

  const tenantId = session.tenantId || "default_tenant";
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") || "50", 10);

  const receipts = await TerminalReceiptRepository.listReceipts(tenantId, limit);

  return applySecurityHeaders(
    NextResponse.json({
      success: true,
      tenantId,
      receipts,
    })
  );
}

export async function POST(req: NextRequest) {
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

  try {
    const tenantId = session.tenantId || "default_tenant";
    const rawBody = await req.json();

    const receipt = await createTerminalDecisionReceipt({
      ...rawBody,
      tenantId,
    });

    return applySecurityHeaders(
      NextResponse.json({
        success: true,
        receipt,
      })
    );
  } catch (err: unknown) {
    return applySecurityHeaders(
      NextResponse.json(
        { success: false, error: "RECEIPT_CREATION_FAILED", message: (err as Error).message },
        { status: 400 }
      )
    );
  }
}
