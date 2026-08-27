/*
 * SettleMate AI — Webhook Delivery Logs Endpoint
 */

import { NextRequest, NextResponse } from "next/server";
import { applySecurityHeaders, handleCorsPreflight, rateLimitGuard } from "@/lib/security/api-security";
import { v1Store } from "@/lib/api/v1-store";
import { instrument } from "@/lib/observability/route";

export async function OPTIONS() {
  return handleCorsPreflight();
}

async function handleGet(req: NextRequest) {
  const rateLimit = rateLimitGuard(req);
  if (!rateLimit.allowed && rateLimit.response) {
    return rateLimit.response;
  }

  const logs = v1Store.getWebhookLogs();
  return applySecurityHeaders(
    NextResponse.json({
      success: true,
      count: logs.length,
      logs,
    })
  );
}

async function handleDelete(req: NextRequest) {
  const rateLimit = rateLimitGuard(req);
  if (!rateLimit.allowed && rateLimit.response) {
    return rateLimit.response;
  }

  v1Store.clearLogs();
  return applySecurityHeaders(
    NextResponse.json({
      success: true,
      message: "Webhook delivery logs cleared",
    })
  );
}

export const GET = instrument("v1.webhooks.logs.get", handleGet);
export const DELETE = instrument("v1.webhooks.logs.delete", handleDelete);
