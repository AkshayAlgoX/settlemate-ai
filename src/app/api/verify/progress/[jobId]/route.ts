/*
 * SettleMate AI — Verification Hub Progress Polling & Step Execution Endpoint
 *
 * GET /api/verify/progress/[jobId] — Read-only status query
 * POST /api/verify/progress/[jobId] — Bounded step execution (executes 1 test suite)
 */

import { NextRequest, NextResponse } from "next/server";
import { applySecurityHeaders, handleCorsPreflight, rateLimitGuard } from "@/lib/security/api-security";
import { verifyProgressStore } from "@/lib/verify/progress-store";
import { runSingleSuite } from "@/app/api/verify/run/route";

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const rateLimit = rateLimitGuard(req);
  if (!rateLimit.allowed && rateLimit.response) {
    return rateLimit.response;
  }

  const { jobId } = await params;
  const job = verifyProgressStore.getJob(jobId);

  if (!job) {
    return applySecurityHeaders(
      NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: `Verification job with ID '${jobId}' not found`,
          },
        },
        { status: 404 }
      )
    );
  }

  return applySecurityHeaders(
    NextResponse.json({
      success: true,
      job,
    })
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const rateLimit = rateLimitGuard(req);
  if (!rateLimit.allowed && rateLimit.response) {
    return rateLimit.response;
  }

  const { jobId } = await params;
  const job = verifyProgressStore.getJob(jobId);

  if (!job) {
    return applySecurityHeaders(
      NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: `Verification job with ID '${jobId}' not found`,
          },
        },
        { status: 404 }
      )
    );
  }

  if (job.status === "COMPLETED" || job.status === "FAILED") {
    return applySecurityHeaders(
      NextResponse.json({
        success: true,
        job,
      })
    );
  }

  const ALL_SUITES = [
    "benchmark",
    "cardinality",
    "claim-validator",
    "cross-partition",
    "chaos",
    "receipt",
    "finance-ops",
  ];

  const executedCount = Object.values(job.results || {}).filter(
    (r) => r.status === "PASS" || r.status === "FAIL"
  ).length;

  if (executedCount < ALL_SUITES.length) {
    const suiteId = ALL_SUITES[executedCount];
    verifyProgressStore.setSuiteRunning(jobId, suiteId);

    try {
      const suiteResult = runSingleSuite(suiteId);
      verifyProgressStore.setSuiteCompleted(jobId, suiteId, {
        status: suiteResult.status,
        durationMs: suiteResult.durationMs,
        metrics: suiteResult.metrics,
        rawOutputSnippet: suiteResult.rawOutputSnippet,
      });

      const newJob = verifyProgressStore.getJob(jobId);
      const newExecutedCount = Object.values(newJob?.results || {}).filter(
        (r) => r.status === "PASS" || r.status === "FAIL"
      ).length;

      if (newExecutedCount >= ALL_SUITES.length) {
        const allPassed = Object.values(newJob?.results || {}).every((r) => r.status === "PASS");
        const totalDurationMs = Object.values(newJob?.results || {}).reduce(
          (sum, r) => sum + (r.durationMs || 0),
          0
        );
        verifyProgressStore.completeJob(jobId, allPassed, totalDurationMs);
      }
    } catch (err: unknown) {
      verifyProgressStore.setSuiteCompleted(jobId, suiteId, {
        status: "FAIL",
        durationMs: 0,
        metrics: { error: err instanceof Error ? err.message : String(err) },
        rawOutputSnippet: String(err),
      });
      verifyProgressStore.completeJob(jobId, false, 0);
    }
  }

  const updatedJob = verifyProgressStore.getJob(jobId) || job;
  return applySecurityHeaders(
    NextResponse.json({
      success: true,
      job: updatedJob,
    })
  );

}
