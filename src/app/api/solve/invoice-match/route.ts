/*
 * SettleMate AI — Milestone 3: OR-Tools Invoice Matching API Endpoint
 *
 * POST /api/solve/invoice-match
 *
 * Implements isolated, deterministic CP-SAT invoice matching for split and partial payments.
 */

import { NextRequest, NextResponse } from "next/server";
import { InvoiceMatchRequestSchema } from "@/lib/solver/types";
import { cpSatInvoiceMatchingEngine } from "@/lib/solver/cpsat-engine";
import { solverResultVerifier } from "@/lib/solver/verifier";
import { metrics } from "@/lib/observability/metrics";

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const parseResult = InvoiceMatchRequestSchema.safeParse(json);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: "Invalid invoice match request schema",
          details: parseResult.error.issues,
        },
        { status: 400 }
      );
    }

    const request = parseResult.data;

    // Telemetry: increment requests counter
    try {
      metrics.invoiceSolverRequestsTotal.inc();
    } catch {
      // Telemetry should never crash execution
    }

    // 1. Execute CP-SAT Optimization
    const response = cpSatInvoiceMatchingEngine.solve(request);

    // 2. Independently verify the solver output deterministically
    const verification = solverResultVerifier.verify(request, response);

    if (!verification.passed) {
      try {
        metrics.invoiceSolverInvalidResultTotal.inc();
      } catch {}

      return NextResponse.json(
        {
          ...response,
          status: "INVALID_SOLVER_RESULT",
          isVerifiedDeterministically: false,
          verificationReason: `Verification failed: ${verification.failureReasons.join(", ")}`,
        },
        { status: 422 }
      );
    }

    // 3. Telemetry: record match outcome
    try {
      switch (response.status) {
        case "EXACT_MATCH":
          metrics.invoiceSolverExactMatchesTotal.inc();
          break;
        case "SPLIT_MATCH":
        case "SPLIT_MATCH_WITH_TOLERANCE":
          metrics.invoiceSolverSplitMatchesTotal.inc();
          break;
        case "PARTIAL_PAYMENT":
          metrics.invoiceSolverPartialTotal.inc();
          break;
        case "NO_FEASIBLE_MATCH":
          metrics.invoiceSolverNoMatchTotal.inc();
          break;
        case "SOLVER_TIMEOUT":
          metrics.invoiceSolverTimeoutTotal.inc();
          break;
      }
    } catch {}

    return NextResponse.json(response, { status: 200 });
  } catch (err: unknown) {
    const errorMsg = (err as Error).message || "Internal solver error";
    return NextResponse.json(
      {
        error: errorMsg,
        status: "BLOCKED",
      },
      { status: 500 }
    );
  }
}
