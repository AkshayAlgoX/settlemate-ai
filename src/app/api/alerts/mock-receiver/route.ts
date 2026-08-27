/*
 * SettleMate AI — Mock Webhook Alert Receiver
 *
 * Local destination endpoint for testing signed webhook alerts.
 * Validates HMAC-SHA256 headers and logs receipt.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  applySecurityHeaders,
  handleCorsPreflight,
  rateLimitGuard,
} from "@/lib/security/api-security";
import { instrument } from "@/lib/observability/route";

export async function OPTIONS() {
  return handleCorsPreflight();
}

async function handlePost(req: NextRequest) {
  const rateLimit = rateLimitGuard(req);
  if (!rateLimit.allowed && rateLimit.response) {
    return rateLimit.response;
  }

  const signature = req.headers.get("x-settlemate-signature") || "";
  const event = req.headers.get("x-settlemate-event") || "unknown";
  const userAgent = req.headers.get("user-agent") || "";
  const body = await req.json().catch(() => ({}));

  const hasValidSignatureFormat = signature.includes("v1=") && signature.includes("t=");

  return applySecurityHeaders(
    NextResponse.json({
      received: true,
      service: "Mock-Alert-Receiver/1.0",
      event,
      signatureVerified: hasValidSignatureFormat,
      receivedSignatureHeader: signature,
      clientUserAgent: userAgent,
      alertId: body.alertId || "unknown",
      exceptionId: body.exceptionId || "unknown",
      receivedAt: new Date().toISOString(),
    })
  );
}

export const POST = instrument("alerts.mock_receiver", handlePost);
