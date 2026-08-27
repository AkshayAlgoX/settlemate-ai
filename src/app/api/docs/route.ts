/*
 * SettleMate AI — OpenAPI Spec Documentation Endpoint
 */

import { NextResponse } from "next/server";
import { OPENAPI_SPEC } from "@/lib/api/openapi-spec";
import { applySecurityHeaders, handleCorsPreflight } from "@/lib/security/api-security";

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function GET() {
  return applySecurityHeaders(
    NextResponse.json(OPENAPI_SPEC, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
      },
    })
  );
}
