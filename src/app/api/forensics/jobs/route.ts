/*
 * SettleMate AI — Stored Reconciliation Jobs List for Forensics Playback
 */

import { NextRequest, NextResponse } from "next/server";
import {
  applySecurityHeaders,
  handleCorsPreflight,
  rateLimitGuard,
  safeErrorResponse,
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
    // safeErrorResponse masks 5xx detail; the raw message exposed SQLite paths
    // and query text on a storage failure.
    return safeErrorResponse(err, 500, "FORENSICS_JOBS_ERROR");
  }
}

export const GET = instrument("forensics.jobs", handleGet);
