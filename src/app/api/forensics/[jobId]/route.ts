/*
 * SettleMate AI — Reconciliation Forensics Timeline Detail Endpoint
 */

import { NextRequest, NextResponse } from "next/server";
import {
  applySecurityHeaders,
  handleCorsPreflight,
  rateLimitGuard,
  safeErrorResponse,
} from "@/lib/security/api-security";
import { buildForensicsTimeline } from "@/lib/forensics/forensics-engine";
import { instrument } from "@/lib/observability/route";

export async function OPTIONS() {
  return handleCorsPreflight();
}

async function handleGet(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const rateLimit = rateLimitGuard(req);
  if (!rateLimit.allowed && rateLimit.response) {
    return rateLimit.response;
  }

  try {
    const { jobId } = await params;
    const timeline = buildForensicsTimeline(jobId);

    if (!timeline) {
      return applySecurityHeaders(
        NextResponse.json(
          {
            success: false,
            error: `Reconciliation job '${jobId}' not found in persistent store`,
            timestamp: new Date().toISOString(),
          },
          { status: 404 }
        )
      );
    }

    return applySecurityHeaders(
      NextResponse.json({
        success: true,
        jobId: timeline.jobId,
        timeline,
        timestamp: new Date().toISOString(),
      })
    );
  } catch (err) {
    // safeErrorResponse masks 5xx detail; the raw message exposed SQLite paths
    // and timeline-builder internals on failure.
    return safeErrorResponse(err, 500, "FORENSICS_TIMELINE_ERROR");
  }
}

export const GET = instrument("forensics.timeline", handleGet);
