/*
 * SettleMate AI — Verification Hub Active & Latest Progress Endpoint
 */

import { NextRequest, NextResponse } from "next/server";
import { applySecurityHeaders, handleCorsPreflight, rateLimitGuard } from "@/lib/security/api-security";
import { UnifiedProgressRepository } from "@/lib/storage/unified-store";

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function GET(req: NextRequest) {
  const rateLimit = rateLimitGuard(req);
  if (!rateLimit.allowed && rateLimit.response) {
    return rateLimit.response;
  }

  const jobs = UnifiedProgressRepository.getAll();
  const activeJob = jobs.find((j) => j.status === "RUNNING" || j.status === "PENDING") || jobs[0] || null;

  if (!activeJob) {
    return applySecurityHeaders(
      NextResponse.json({
        success: true,
        job: null,
      })
    );
  }

  let resultsObj = {};
  let suitesArr: string[] = [];
  try {
    resultsObj = JSON.parse(activeJob.results);
  } catch {}
  try {
    suitesArr = JSON.parse(activeJob.requestedSuites);
  } catch {}

  return applySecurityHeaders(
    NextResponse.json({
      success: true,
      job: {
        jobId: activeJob.jobId,
        status: activeJob.status,
        requestedSuites: suitesArr,
        totalSuites: activeJob.totalSuites,
        completedSuites: activeJob.completedSuites,
        overallProgressPct: activeJob.overallProgressPct,
        startedAt: activeJob.startedAt,
        completedAt: activeJob.completedAt,
        totalDurationMs: activeJob.totalDurationMs,
        allPassed: activeJob.allPassed === 1,
        results: resultsObj,
      },
    })
  );
}
