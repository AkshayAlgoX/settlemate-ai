/*
 * SettleMate AI — Milestone 4: Deterministic Correction Replay Engine
 *
 * Reproduces the exact journal entry proposal, totals, and invariant restoration proof
 * without invoking any LLM. Fails closed if any divergence or cross-tenant access is attempted.
 */

import type { ProposedCorrectionRecord, InvariantRestorationProof } from "./types";
import { calculateMinimalCorrection } from "./calculator";
import { InvariantRestorationProver } from "./prover";
import { CorrectionTenantIsolationError } from "./repository";

export class CorrectionReplayDivergenceError extends Error {
  constructor(field: string, originalVal: unknown, replayedVal: unknown) {
    super(
      `Correction replay divergence on '${field}': original='${JSON.stringify(originalVal)}', replayed='${JSON.stringify(replayedVal)}'`
    );
    this.name = "CorrectionReplayDivergenceError";
  }
}

export interface ReplayCorrectionResult {
  isReplayValid: boolean;
  correctionId: string;
  originalProofHash: string;
  replayedProofHash: string;
  replayedJournalLinesCount: number;
  replayedProof: InvariantRestorationProof;
}

export function replayCorrectionProof(
  record: ProposedCorrectionRecord,
  requestingTenantId: string
): ReplayCorrectionResult {
  // 1. Strict Tenant Isolation
  if (record.tenantId !== requestingTenantId) {
    throw new CorrectionTenantIsolationError(requestingTenantId, record.correctionId);
  }

  // 2. Re-run Pure Deterministic Calculation
  const recomputed = calculateMinimalCorrection({
    tenantId: record.tenantId,
    transactionId: record.transactionId,
    currency: record.currency,
    observedDebitMinor: record.invariantProof.beforeState.debitMinor,
    observedCreditMinor: record.invariantProof.beforeState.creditMinor,
    expectedDebitMinor: record.invariantProof.afterState.debitMinor,
    expectedCreditMinor: record.invariantProof.afterState.creditMinor,
    detectedDifferenceMinor: record.detectedDifferenceMinor,
    correctionType: record.correctionType,
    evidenceIds: [],
    policyVersion: record.policyVersion || "correction-policy-v1",
    underlyingRecordVersion: record.underlyingRecordVersion,
  });

  // 3. Re-run Invariant Restoration Proof
  const replayedProof = InvariantRestorationProver.proveRestoration(
    {
      tenantId: record.tenantId,
      transactionId: record.transactionId,
      currency: record.currency,
      observedDebitMinor: record.invariantProof.beforeState.debitMinor,
      observedCreditMinor: record.invariantProof.beforeState.creditMinor,
      expectedDebitMinor: record.invariantProof.afterState.debitMinor,
      expectedCreditMinor: record.invariantProof.afterState.creditMinor,
      detectedDifferenceMinor: record.detectedDifferenceMinor,
      correctionType: record.correctionType,
      evidenceIds: [],
      policyVersion: record.policyVersion || "correction-policy-v1",
      underlyingRecordVersion: record.underlyingRecordVersion,
    },
    recomputed.journalLines
  );

  // 4. Assert Bitwise Parity with Stored Record
  if (recomputed.journalLines.length !== record.journalLines.length) {
    throw new CorrectionReplayDivergenceError(
      "journalLines.length",
      record.journalLines.length,
      recomputed.journalLines.length
    );
  }

  if (recomputed.totalDebitCorrectionMinor !== record.totalDebitCorrectionMinor) {
    throw new CorrectionReplayDivergenceError(
      "totalDebitCorrectionMinor",
      record.totalDebitCorrectionMinor,
      recomputed.totalDebitCorrectionMinor
    );
  }

  if (recomputed.totalCreditCorrectionMinor !== record.totalCreditCorrectionMinor) {
    throw new CorrectionReplayDivergenceError(
      "totalCreditCorrectionMinor",
      record.totalCreditCorrectionMinor,
      recomputed.totalCreditCorrectionMinor
    );
  }

  if (replayedProof.proofResult !== record.invariantProof.proofResult) {
    throw new CorrectionReplayDivergenceError(
      "proofResult",
      record.invariantProof.proofResult,
      replayedProof.proofResult
    );
  }

  if (replayedProof.proofHash !== record.invariantProof.proofHash) {
    throw new CorrectionReplayDivergenceError(
      "proofHash",
      record.invariantProof.proofHash,
      replayedProof.proofHash
    );
  }

  return {
    isReplayValid: true,
    correctionId: record.correctionId,
    originalProofHash: record.invariantProof.proofHash,
    replayedProofHash: replayedProof.proofHash,
    replayedJournalLinesCount: recomputed.journalLines.length,
    replayedProof,
  };
}
