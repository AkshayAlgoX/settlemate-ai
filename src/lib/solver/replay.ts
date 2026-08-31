/*
 * SettleMate AI — Milestone 3: Deterministic Invoice Matching Replay & Verification
 *
 * Deterministically replays combinatorial invoice matching requests to verify
 * that optimization solutions are 100% reproducible without calling an LLM.
 */

import type { InvoiceMatchRequest, InvoiceMatchInput, InvoiceMatchResponse } from "./types";
import { cpSatInvoiceMatchingEngine } from "./cpsat-engine";
import { solverResultVerifier } from "./verifier";

export class SolverTenantIsolationError extends Error {
  readonly code = "SOLVER_TENANT_ISOLATION_VIOLATION" as const;
  constructor(message: string) {
    super(message);
    this.name = "SolverTenantIsolationError";
  }
}

export class SolverReplayDivergenceError extends Error {
  readonly code = "SOLVER_REPLAY_DIVERGENCE_DETECTED" as const;
  constructor(message: string) {
    super(message);
    this.name = "SolverReplayDivergenceError";
  }
}

export interface SolverReplayVerificationResult {
  isDeterministic: boolean;
  solveId: string;
  tenantId: string;
  originalStatus: InvoiceMatchResponse["status"];
  replayedStatus: InvoiceMatchResponse["status"];
  replayedResponse: InvoiceMatchResponse;
}

/**
 * Deterministically replays an invoice matching solve operation.
 */
export function replayInvoiceMatch(
  request: InvoiceMatchInput | InvoiceMatchRequest,
  storedResponse: InvoiceMatchResponse,
  requestingTenantId: string
): SolverReplayVerificationResult {
  // 1. Enforce strict tenant isolation boundary
  if (!requestingTenantId || requestingTenantId.trim() !== request.tenantId.trim()) {
    throw new SolverTenantIsolationError(
      `Access denied: Requesting tenant '${requestingTenantId}' cannot replay solver results for tenant '${request.tenantId}'`
    );
  }

  // 2. Re-solve deterministically
  const replayed = cpSatInvoiceMatchingEngine.solve(request);

  // 3. Verify determinism
  const verification = solverResultVerifier.verify(request, replayed);
  if (!verification.passed) {
    throw new SolverReplayDivergenceError(
      `Replayed solver result failed independent verification: ${verification.failureReasons.join(", ")}`
    );
  }

  const statusMatches = replayed.status === storedResponse.status;
  const totalMatches = replayed.selectedTotalMinor === storedResponse.selectedTotalMinor;
  const diffMatches = replayed.differenceMinor === storedResponse.differenceMinor;

  const sortedOriginal = [...storedResponse.selectedInvoiceIds].sort().join(",");
  const sortedReplayed = [...replayed.selectedInvoiceIds].sort().join(",");
  const idsMatch = sortedOriginal === sortedReplayed;

  if (!statusMatches || !totalMatches || !diffMatches || !idsMatch) {
    throw new SolverReplayDivergenceError(
      `Solver replay divergence: expected ${storedResponse.status} with [${sortedOriginal}], got ${replayed.status} with [${sortedReplayed}]`
    );
  }

  return {
    isDeterministic: true,
    solveId: storedResponse.solveId,
    tenantId: request.tenantId,
    originalStatus: storedResponse.status,
    replayedStatus: replayed.status,
    replayedResponse: replayed,
  };
}
