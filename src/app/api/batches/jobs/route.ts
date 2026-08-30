/*
 * SettleMate AI — Tenant-Isolated Batch Generation Jobs List Endpoint
 *
 * GET /api/batches/jobs
 * Returns active and recent durable jobs for the authenticated tenant.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { UnifiedJobRepository } from "@/lib/storage/unified-store";
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
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );
  }

  try {
    const allJobs = await UnifiedJobRepository.listAsync(session.tenantId, 20);
    const activeJobs = allJobs.filter((j) => j.status === "PENDING" || j.status === "PROCESSING");
    const recentJobs = allJobs.slice(0, 10);

    return applySecurityHeaders(
      NextResponse.json({
        success: true,
        tenantId: session.tenantId,
        activeJobs,
        recentJobs,
      })
    );
  } catch (err: unknown) {
    console.error("[JobsAPI] Error listing jobs:", err);
    return applySecurityHeaders(
      NextResponse.json(
        { error: "Failed to list jobs" },
        { status: 500 }
      )
    );
  }
}
