/*
 * SettleMate AI — Stored Reconciliation Jobs List for Forensics Playback
 */

import { NextRequest, NextResponse } from "next/server";
import {
  applySecurityHeaders,
  handleCorsPreflight,
  rateLimitGuard,
} from "@/lib/security/api-security";
import { getStoredJobsList } from "@/lib/forensics/forensics-engine";
import { instrument } from "@/lib/observability/route";

export async function OPTIONS() {
  return handleCorsPreflight();
}

async function handleGet(req: NextRequest) {
  const rateLimit = rateLimitGuard(req);
  if (!rateLimit.allowed && rateLimit.response) {
    return rateLimit.response;
  }

  try {
    const jobs = getStoredJobsList();

    return applySecurityHeaders(
      NextResponse.json({
        success: true,
        count: jobs.length,
        jobs,
        timestamp: new Date().toISOString(),
      })
    );
  } catch (err) {
    return applySecurityHeaders(
      NextResponse.json(
        {
          success: false,
          error: (err as Error).message || "Failed to fetch stored jobs",
          timestamp: new Date().toISOString(),
        },
        { status: 500 }
      )
    );
  }
}

export const GET = instrument("forensics.jobs", handleGet);
