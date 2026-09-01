/*
 * SettleMate AI — Live Verification Hub API Endpoint
 */

import { NextRequest, NextResponse } from "next/server";
import {
  applySecurityHeaders,
  handleCorsPreflight,
  rateLimitGuard,
  safeErrorResponse,
  sanitizeObject,
} from "@/lib/security/api-security";
import { verifyProgressStore } from "@/lib/verify/progress-store";
import {
  executeVerificationSuite,
  type SuiteResult,
} from "@/lib/verify/verification-runner";

export const maxDuration = 120; // 120s timeout per Next.js route

export type { SuiteResult };

export interface VerificationHubResponse {
  success: boolean;
  allPassed: boolean;
  timestamp: string;
  totalDurationMs: number;
  totalSuitesExecuted: number;
  results: Record<string, SuiteResult>;
  jobId?: string;
}

export async function OPTIONS() {
  return handleCorsPreflight();
}

export function runSingleSuite(suiteId: string): Promise<SuiteResult> {
  return executeVerificationSuite(suiteId);
}

async function runSuitesAsync(jobId: string, suites: string[]) {
  const overallStart = performance.now();
  let allPassed = true;

  for (const suiteId of suites) {
    verifyProgressStore.setSuiteRunning(jobId, suiteId);
    const result = await executeVerificationSuite(suiteId);
    if (result.status !== "PASS") {
      allPassed = false;
    }
    verifyProgressStore.setSuiteCompleted(jobId, suiteId, result);
  }

  const totalDurationMs = Math.round(performance.now() - overallStart);
  verifyProgressStore.completeJob(jobId, allPassed, totalDurationMs);
}

export async function POST(req: NextRequest) {
  const rateLimit = rateLimitGuard(req);
  if (!rateLimit.allowed && rateLimit.response) {
    return rateLimit.response;
  }

  const overallStart = performance.now();
  try {
    const rawBody = await req.json().catch(() => ({}));
    const body = sanitizeObject(rawBody) as { suites?: string[]; async?: boolean };

    const requestedSuites: string[] =
      Array.isArray(body.suites) && body.suites.length > 0
        ? body.suites
        : ["benchmark", "cardinality", "claim-validator", "cross-partition", "chaos", "receipt", "finance-ops"];

    const isAsync = Boolean(body.async);

    // Asynchronous Execution Mode
    if (isAsync) {
      const job = verifyProgressStore.createJob(requestedSuites);
      // Run background execution
      setTimeout(() => {
        runSuitesAsync(job.jobId, requestedSuites).catch(console.error);
      }, 10);

      return applySecurityHeaders(
        NextResponse.json(
          {
            success: true,
            jobId: job.jobId,
            status: "RUNNING",
            message: "Verification execution started asynchronously. Poll /api/verify/progress/:jobId for updates.",
            totalSuites: requestedSuites.length,
            startedAt: job.startedAt,
          },
          { status: 202 }
        )
      );
    }

    // Synchronous Execution Mode (default / backward compatible)
    const job = verifyProgressStore.createJob(requestedSuites);
    const results: Record<string, SuiteResult> = {};
    let allPassed = true;

    for (const suiteId of requestedSuites) {
      verifyProgressStore.setSuiteRunning(job.jobId, suiteId);
      const res = await executeVerificationSuite(suiteId);
      results[suiteId] = res;
      if (res.status !== "PASS") {
        allPassed = false;
      }
      verifyProgressStore.setSuiteCompleted(job.jobId, suiteId, res);
    }

    const totalDurationMs = Math.round(performance.now() - overallStart);
    verifyProgressStore.completeJob(job.jobId, allPassed, totalDurationMs);

    return applySecurityHeaders(
      NextResponse.json({
        success: true,
        allPassed,
        timestamp: new Date().toISOString(),
        totalDurationMs,
        totalSuitesExecuted: Object.keys(results).length,
        results,
        jobId: job.jobId,
      })
    );
  } catch (err) {
    // safeErrorResponse masks 5xx detail. This route shells out to npx, so the
    // raw message was execSync's own text: the full command line and cwd.
    return safeErrorResponse(err, 500, "VERIFY_RUN_ERROR");
  }
}
