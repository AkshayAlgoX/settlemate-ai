/*
 * SettleMate AI — Health Check Endpoint
 */

import { NextRequest, NextResponse } from "next/server";
import { applySecurityHeaders, handleCorsPreflight, rateLimitGuard } from "@/lib/security/api-security";
import { instrument } from "@/lib/observability/route";

const serverStartTime = Date.now();

export async function OPTIONS() {
  return handleCorsPreflight();
}

async function handleGet(req: NextRequest) {
  const rateLimit = rateLimitGuard(req);
  if (!rateLimit.allowed && rateLimit.response) {
    return rateLimit.response;
  }

  const uptimeSeconds = Math.round((Date.now() - serverStartTime) / 1000);

  return applySecurityHeaders(
    NextResponse.json({
      status: "ok",
      uptime: uptimeSeconds,
      version: "v1.0.0",
      timestamp: new Date().toISOString(),
      engine: "deterministic-settlemate-v1",
      security: {
        rateLimiter: "enforced",
        rateLimitMaxPerMin: 100,
        cors: "enabled",
        auditSignatures: "sha256-merkle-dag",
      },
    })
  );
}

export const GET = instrument("v1.health", handleGet);
