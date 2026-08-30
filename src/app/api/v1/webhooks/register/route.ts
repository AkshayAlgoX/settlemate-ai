/*
 * SettleMate AI — Webhook Registration Endpoint
 */

import { NextRequest, NextResponse } from "next/server";
import {
  apiKeyGuard,
  applySecurityHeaders,
  handleCorsPreflight,
  rateLimitGuard,
  safeErrorResponse,
  sanitizeObject,
} from "@/lib/security/api-security";
import { WebhookRegisterSchema, parseRequest } from "@/lib/api/v1-schemas";
import { v1Store } from "@/lib/api/v1-store";
import { instrument } from "@/lib/observability/route";

export async function OPTIONS() {
  return handleCorsPreflight();
}

async function handlePost(req: NextRequest) {
  const rateLimit = rateLimitGuard(req);
  if (!rateLimit.allowed && rateLimit.response) {
    return rateLimit.response;
  }

  // 1. API Key Validation
  const auth = apiKeyGuard(req);
  if (!auth.allowed && auth.response) {
    return auth.response;
  }

  try {
    const rawBody = await req.json().catch(() => ({}));
    const body = sanitizeObject(rawBody);

    const parsed = parseRequest(WebhookRegisterSchema, body);
    if (!parsed.ok) {
      return applySecurityHeaders(
        NextResponse.json(
          { error: { code: parsed.code, message: parsed.message, details: parsed.details } },
          { status: 400 }
        )
      );
    }

    const { url, secret } = parsed.data;
    const events =
      parsed.data.events && parsed.data.events.length > 0
        ? parsed.data.events
        : ["reconciliation.completed", "exception.detected"];

    const subscription = v1Store.registerWebhook(url, events, secret);

    return applySecurityHeaders(
      NextResponse.json(
        {
          success: true,
          webhook: subscription,
          message: "Webhook registered successfully. All dispatched events will include X-SettleMate-Signature (HMAC-SHA256).",
        },
        { status: 201 }
      )
    );
  } catch (err) {
    // safeErrorResponse masks 5xx detail; the previous version returned
    // `(err as Error).message` straight to the caller.
    return safeErrorResponse(err, 500, "INTERNAL_ERROR");
  }
}

async function handleGet(req: NextRequest) {
  const rateLimit = rateLimitGuard(req);
  if (!rateLimit.allowed && rateLimit.response) {
    return rateLimit.response;
  }

  // The registration list exposes tenant webhook URLs; it requires the same key
  // as registration itself.
  const auth = apiKeyGuard(req);
  if (!auth.allowed && auth.response) {
    return auth.response;
  }

  const webhooks = v1Store.getWebhooks();
  return applySecurityHeaders(
    NextResponse.json({
      success: true,
      count: webhooks.length,
      webhooks,
    })
  );
}

export const POST = instrument("v1.webhooks.register", handlePost);
export const GET = instrument("v1.webhooks.list", handleGet);
