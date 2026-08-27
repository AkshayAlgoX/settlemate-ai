/*
 * SettleMate AI — Webhook Connectivity Test Endpoint
 */

import { NextRequest, NextResponse } from "next/server";
import {
  applySecurityHeaders,
  handleCorsPreflight,
  rateLimitGuard,
  sanitizeObject,
} from "@/lib/security/api-security";
import { v1Store, dispatchWebhook } from "@/lib/api/v1-store";
import { instrument } from "@/lib/observability/route";

export async function OPTIONS() {
  return handleCorsPreflight();
}

async function handleGet(req: NextRequest) {
  const rateLimit = rateLimitGuard(req);
  if (!rateLimit.allowed && rateLimit.response) {
    return rateLimit.response;
  }

  const registeredWebhooks = v1Store.getWebhooks();
  const recentLogs = v1Store.getWebhookLogs(10);

  return applySecurityHeaders(
    NextResponse.json({
      success: true,
      message: "SettleMate AI Webhook Test Service",
      endpoint: "/api/v1/webhooks/test",
      description: "POST to this endpoint with a 'url' to test connectivity and HMAC-SHA256 signature verification.",
      registeredWebhooksCount: registeredWebhooks.length,
      registeredWebhooks: registeredWebhooks.map((w) => ({
        id: w.id,
        url: w.url,
        status: w.status,
        events: w.events,
        registeredAt: w.registeredAt,
      })),
      recentDeliveryLogs: recentLogs,
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
      url?: string;
      webhookId?: string;
      event?: string;
      secret?: string;
      payload?: Record<string, unknown>;
    };

    let targetUrl = typeof body.url === "string" ? body.url.trim() : "";
    let targetSecret = typeof body.secret === "string" && body.secret.trim() ? body.secret.trim() : undefined;
    const webhookId = body.webhookId;

    if (!targetUrl && webhookId) {
      const sub = v1Store.getWebhook(webhookId);
      if (sub) {
        targetUrl = sub.url;
        targetSecret = targetSecret || sub.secret;
      }
    }

    if (!targetUrl) {
      // Default to first registered webhook if available
      const webhooks = v1Store.getWebhooks();
      if (webhooks.length > 0) {
        targetUrl = webhooks[0].url;
        targetSecret = targetSecret || webhooks[0].secret;
      } else {
        return applySecurityHeaders(
          NextResponse.json(
            {
              error: {
                code: "INVALID_REQUEST",
                message: "Missing 'url' or 'webhookId' in request body, and no registered webhooks exist",
              },
            },
            { status: 400 }
          )
        );
      }
    }

    const eventName = body.event || "webhook.test_ping";
    const testPayload = body.payload || {
      event: eventName,
      test: true,
      timestamp: new Date().toISOString(),
      source: "SettleMate AI Developer Test Console",
      sampleSummary: {
        totalRecords: 263,
        autoMatched: 103,
        exceptions: 160,
        matchRatePct: 98.1,
      },
      message: "Test ping from SettleMate AI. Verify HMAC-SHA256 signature via X-SettleMate-Signature header.",
    };

    const deliveryLog = await dispatchWebhook(
      targetUrl,
      eventName,
      testPayload,
      targetSecret || "whsec_settlemate_live_signing_key_001",
      webhookId
    );

    return applySecurityHeaders(
      NextResponse.json({
        success: deliveryLog.status === "DELIVERED" || deliveryLog.status === "SIMULATED",
        deliveryLog,
        message:
          deliveryLog.status === "DELIVERED"
            ? "Webhook delivered successfully to endpoint."
            : deliveryLog.status === "SIMULATED"
            ? "Webhook delivery simulated for test/internal domain."
            : `Webhook delivery failed after ${deliveryLog.attempts || 1} attempts (${deliveryLog.error || "Connection error"}).`,
      })
    );
  } catch (err) {
    return applySecurityHeaders(
      NextResponse.json(
        {
          error: {
            code: "TEST_FAILED",
            message: (err as Error).message || "Webhook test execution failed",
          },
        },
        { status: 500 }
      )
    );
  }
}

export const GET = instrument("v1.webhooks.test.get", handleGet);
export const POST = instrument("v1.webhooks.test.post", handlePost);
