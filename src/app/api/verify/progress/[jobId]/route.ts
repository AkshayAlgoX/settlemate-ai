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

  const targetSuites =
    job.requestedSuites && job.requestedSuites.length > 0
      ? job.requestedSuites
      : ALL_SUITES;

  const pendingSuiteId = targetSuites.find(
    (s) => !job.results[s] || (job.results[s].status !== "PASS" && job.results[s].status !== "FAIL")
  );

  if (pendingSuiteId) {
    verifyProgressStore.setSuiteRunning(jobId, pendingSuiteId);

    try {
      const suiteResult = await runSingleSuite(pendingSuiteId);
      verifyProgressStore.setSuiteCompleted(jobId, pendingSuiteId, {
        status: suiteResult.status,
        durationMs: suiteResult.durationMs,
        metrics: suiteResult.metrics,
        rawOutputSnippet: suiteResult.rawOutputSnippet,
      });
    } catch (err: unknown) {
      verifyProgressStore.setSuiteCompleted(jobId, pendingSuiteId, {
        status: "FAIL",
        durationMs: 0,
        metrics: { error: err instanceof Error ? err.message : String(err) },
        rawOutputSnippet: String(err),
      });
    }

    const newJob = verifyProgressStore.getJob(jobId);
    const unexecuted = targetSuites.filter(
      (s) => !newJob?.results[s] || (newJob.results[s].status !== "PASS" && newJob.results[s].status !== "FAIL")
    );

    if (unexecuted.length === 0 && newJob) {
      const allPassed = targetSuites.every((s) => newJob.results[s]?.status === "PASS");
      const totalDurationMs = targetSuites.reduce(
        (sum, s) => sum + (newJob.results[s]?.durationMs || 0),
        0
      );
      verifyProgressStore.completeJob(jobId, allPassed, totalDurationMs);
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
