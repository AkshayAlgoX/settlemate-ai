/*
 * SettleMate AI — Smart Alert Trigger & Webhook Dispatch Endpoint
 */

import { NextRequest, NextResponse } from "next/server";
import {
  applySecurityHeaders,
  handleCorsPreflight,
  rateLimitGuard,
  safeErrorResponse,
  sanitizeObject,
} from "@/lib/security/api-security";
import {
  generateDeterministicAlert,
  dispatchSmartAlert,
  DEFAULT_ALERT_CHANNELS,
} from "@/lib/alerts/alert-engine";
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

  const logs = v1Store.getWebhookLogs(20);
  const registered = v1Store.getWebhooks();

  return applySecurityHeaders(
    NextResponse.json({
      success: true,
      channels: DEFAULT_ALERT_CHANNELS,
      registeredWebhooks: registered,
      recentDeliveryLogs: logs,
      timestamp: new Date().toISOString(),
    })
  );
}

async function handlePost(req: NextRequest) {
  const rateLimit = rateLimitGuard(req);
  if (!rateLimit.allowed && rateLimit.response) {
    return rateLimit.response;
  }

  try {
    const rawBody = await req.json().catch(() => ({}));
    const body = sanitizeObject(rawBody) as {
      index?: number;
      highRiskOnly?: boolean;
      targetUrl?: string;
      customSeverity?: string;
      secret?: string;
    };

    const index = typeof body.index === "number" ? body.index : Math.floor(Math.random() * 10);
    const highRiskOnly = Boolean(body.highRiskOnly);
    const targetUrl = typeof body.targetUrl === "string" ? body.targetUrl : undefined;
    const secret = typeof body.secret === "string" ? body.secret : undefined;

    const alert = generateDeterministicAlert(index, highRiskOnly);
    const dispatched = await dispatchSmartAlert(alert, targetUrl, secret);

    return applySecurityHeaders(
      NextResponse.json({
        success: true,
        alert: dispatched,
        processedAt: new Date().toISOString(),
      })
    );
  } catch (err) {
    // safeErrorResponse masks 5xx detail. Returning `(err as Error).message`
    // handed the caller alert-engine internals and dispatch target details.
    return safeErrorResponse(err, 500, "ALERT_TRIGGER_ERROR");
  }
}

export const GET = instrument("alerts.get", handleGet);
export const POST = instrument("alerts.trigger", handlePost);
