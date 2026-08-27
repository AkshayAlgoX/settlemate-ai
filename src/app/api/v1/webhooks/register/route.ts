/*
 * SettleMate AI — Webhook Registration Endpoint
 */

import { NextRequest, NextResponse } from "next/server";
import {
  applySecurityHeaders,
  handleCorsPreflight,
  rateLimitGuard,
  validateApiKey,
  sanitizeObject,
} from "@/lib/security/api-security";
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
  const apiKey = req.headers.get("x-api-key") || req.headers.get("authorization");
  const auth = validateApiKey(apiKey);
  if (!auth.valid) {
    return applySecurityHeaders(
      NextResponse.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: auth.error || "Valid API key starting with 'sk_' (length > 20) required",
          },
        },
        { status: 401 }
      )
    );
  }

  try {
    const rawBody = await req.json().catch(() => ({}));
    const body = sanitizeObject(rawBody);

    const url = typeof body.url === "string" ? body.url.trim() : "";
    if (!url) {
      return applySecurityHeaders(
        NextResponse.json(
          {
            error: {
              code: "INVALID_REQUEST",
              message: "Field 'url' is required and must be a valid webhook endpoint URL",
            },
          },
          { status: 400 }
        )
      );
    }

    try {
      new URL(url);
    } catch {
      return applySecurityHeaders(
        NextResponse.json(
          {
            error: {
              code: "INVALID_URL",
              message: "Provided 'url' is not a valid absolute URL (must start with http:// or https://)",
            },
          },
          { status: 400 }
        )
      );
    }

    const events = Array.isArray(body.events) && body.events.length > 0
      ? (body.events as string[]).map((e) => String(e))
      : ["reconciliation.completed", "exception.detected"];

    const secret = typeof body.secret === "string" && body.secret.trim() ? body.secret.trim() : undefined;

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
    return applySecurityHeaders(
      NextResponse.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: (err as Error).message || "Failed to register webhook",
          },
        },
        { status: 500 }
      )
    );
  }
}

async function handleGet(req: NextRequest) {
  const rateLimit = rateLimitGuard(req);
  if (!rateLimit.allowed && rateLimit.response) {
    return rateLimit.response;
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
