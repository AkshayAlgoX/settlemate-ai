/*
 * SettleMate AI — Reconciliation Forensics Timeline Detail Endpoint
 */

import { NextRequest, NextResponse } from "next/server";
import {
  applySecurityHeaders,
  handleCorsPreflight,
  rateLimitGuard,
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
    return applySecurityHeaders(
      NextResponse.json(
        {
          success: false,
          error: (err as Error).message || "Failed to retrieve forensics timeline",
          timestamp: new Date().toISOString(),
        },
        { status: 500 }
      )
    );
  }
}

export const GET = instrument("forensics.timeline", handleGet);
