/*
 * SettleMate AI — Live Judge Red-Teaming Console API Endpoint
 *
 * Receives arbitrary or structured adversarial attack vectors from judges,
 * runs them through the multi-layer defense pipeline, and returns deterministic
 * defense telemetry and cryptographic audit hashes.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  applySecurityHeaders,
  handleCorsPreflight,
  rateLimitGuard,
  sanitizeObject,
} from "@/lib/security/api-security";
import { evaluateRedTeamAttack } from "@/lib/security/red-team";
import { instrument } from "@/lib/observability/route";

export async function OPTIONS() {
  return handleCorsPreflight();
}

async function handlePost(req: NextRequest) {
  const rateLimit = rateLimitGuard(req);
  if (!rateLimit.allowed && rateLimit.response) {
    return rateLimit.response;
  }

  try {
    const rawBody = await req.json().catch(() => ({}));
    const sanitizedBody = sanitizeObject(rawBody) as Record<string, unknown>;

    const input = {
      rawInput: typeof rawBody.rawInput === "string" ? rawBody.rawInput : (typeof rawBody === "string" ? rawBody : JSON.stringify(rawBody)),
      structuredPayload: sanitizedBody,
      attackType: typeof rawBody.attackType === "string" ? rawBody.attackType : undefined,
      targetUrl: typeof rawBody.targetUrl === "string" ? rawBody.targetUrl : (typeof rawBody.url === "string" ? rawBody.url : undefined),
      evidenceId: typeof rawBody.evidenceId === "string" ? rawBody.evidenceId : undefined,
      amountPaise: typeof rawBody.amountPaise === "number" ? rawBody.amountPaise : (typeof rawBody.amount === "number" ? rawBody.amount : undefined),
      currency: typeof rawBody.currency === "string" ? rawBody.currency : undefined,
    };

    const verdict = await evaluateRedTeamAttack(input);

    return applySecurityHeaders(
      NextResponse.json({
        success: true,
        ...verdict,
        processedAt: new Date().toISOString(),
      })
    );
  } catch (err) {
    return applySecurityHeaders(
      NextResponse.json(
        {
          success: false,
          error: (err as Error).message || "Red-team attack evaluation failed",
          processedAt: new Date().toISOString(),
        },
        { status: 500 }
      )
    );
  }
}

export const POST = instrument("red_team.attack", handlePost);
