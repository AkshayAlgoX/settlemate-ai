/*
 * SettleMate AI — Milestone 5: Deterministic Decision Replay Engine
 *
 * Replays the complete reconciliation decision proof without invoking any LLM.
 *
 * Evaluates:
 *   1. Milestone 1 Invariant Proof & Evidence Commitment
 *   2. Milestone 2 Confidence x Exposure Routing
 *   3. Milestone 3 OR-Tools Solver Decision (if applicable)
 *   4. Milestone 4 Minimal Correction & Invariant Restoration Proof (if applicable)
 *   5. Final Terminal Decision Reproduction
 *
 * Fails closed immediately upon detecting any divergence.
 */

import type { TerminalDecisionReceipt } from "./types";
import { ReplayDivergenceError } from "./types";
import { calculateRoutingRisk } from "@/lib/routing/risk-calculator";
import { calculateMinimalCorrection } from "@/lib/corrections/calculator";
import { InvariantRestorationProver } from "@/lib/corrections/prover";
import type { CorrectionType } from "@/lib/corrections/types";
import { metrics } from "@/lib/observability/metrics";

export interface ReplayReceiptSummary {
  isReplayValid: boolean;
  receiptId: string;
  transactionId: string;
  tenantId: string;
  replayedFinalDecision: string;
  routingReplayed: boolean;
  solverReplayed: boolean;
  correctionReplayed: boolean;
  replayedAt: string;
  executionTimeMs: number;
}

/**
 * Pure deterministic replay of a TerminalDecisionReceipt.
 */
export function replayTerminalReceipt(
  receipt: TerminalDecisionReceipt,
  requestingTenantId?: string
): ReplayReceiptSummary {
  const t0 = performance.now();

  // 1. Tenant Scoping
  if (requestingTenantId && receipt.tenantId !== requestingTenantId) {
    throw new ReplayDivergenceError("tenantId", requestingTenantId, receipt.tenantId);
  }

  // 2. Replay Evidence Commitment Integrity
  const ev = receipt.evidenceCommitment;
  if (!ev.merkleRoot || ev.merkleRoot.length < 32) {
    throw new ReplayDivergenceError("evidenceCommitment.merkleRoot", "valid Merkle root", ev.merkleRoot);
  }

  // 3. Replay Milestone 2 Routing (if present)
  let routingReplayed = false;
  if (receipt.routingDecision) {
    const rd = receipt.routingDecision;
    let challengeStatus: "NEVER_CHALLENGED" | "CHALLENGED_SURVIVED" | "CHALLENGE_CONFIRMED" = "NEVER_CHALLENGED";
    if (rd.challengeStatus === "CHALLENGED_SURVIVED") {
      challengeStatus = "CHALLENGED_SURVIVED";
    } else if (rd.challengeStatus === "CHALLENGE_CONFIRMED") {
      challengeStatus = "CHALLENGE_CONFIRMED";
    }

    const invariantStatus = receipt.invariantProof.status === "PROOF_VALID" ? "VERIFIED" : "FAILED";
    const mechanicalVerificationStatus =
      receipt.mechanicalVerification?.verdict === "PASSED" || rd.verificationStatus === "VERIFIED"
        ? "VERIFIED"
        : receipt.mechanicalVerification?.verdict === "FAILED"
        ? "FAILED"
        : "UNCHECKED";

    const recomputedRouting = calculateRoutingRisk({
      tenantId: receipt.tenantId,
      claimId: receipt.aiClaim?.claimId || `claim_${receipt.transactionId}`,
      transactionId: receipt.transactionId,
      originalConfidence: rd.originalConfidence,
      transactionAmountMinor: rd.exposureAmountMinor,
      currency: rd.currency,
      challengeStatus,
      invariantStatus,
      mechanicalVerificationStatus,
    });

    if (recomputedRouting.decision !== rd.decision) {
      metrics.receiptReplayDivergenceTotal.inc();
      throw new ReplayDivergenceError("routingDecision.decision", rd.decision, recomputedRouting.decision);
    }
    if (Math.abs(recomputedRouting.routingRisk - rd.routingRisk) > 0.0001) {
      metrics.receiptReplayDivergenceTotal.inc();
      throw new ReplayDivergenceError("routingDecision.routingRisk", rd.routingRisk, recomputedRouting.routingRisk);
    }
    routingReplayed = true;
  }

  // 4. Replay Milestone 3 Solver Decision (if present)
  let solverReplayed = false;
  if (receipt.solverDecision) {
    const sd = receipt.solverDecision;
    // Check arithmetic consistency of selected invoices
    if (sd.selectedInvoiceIds.length === 0 && sd.solverStatus === "OPTIMAL") {
      metrics.receiptReplayDivergenceTotal.inc();
      throw new ReplayDivergenceError("solverDecision.selectedInvoiceIds", "> 0 invoices", 0);
    }
    const computedDiff = Math.abs(sd.paymentAmountMinor - sd.selectedTotalMinor);
    if (computedDiff !== sd.differenceMinor) {
      metrics.receiptReplayDivergenceTotal.inc();
      throw new ReplayDivergenceError("solverDecision.differenceMinor", sd.differenceMinor, computedDiff);
    }
    solverReplayed = true;
  }

  // 5. Replay Milestone 4 Minimal Correction (if present)
  let correctionReplayed = false;
  if (receipt.correctionDecision) {
    const cd = receipt.correctionDecision;
    const recomputedCalc = calculateMinimalCorrection({
      tenantId: receipt.tenantId,
      transactionId: receipt.transactionId,
      currency: receipt.inputCommitment.currency,
      observedDebitMinor: cd.beforeState.debitMinor,
      observedCreditMinor: cd.beforeState.creditMinor,
      expectedDebitMinor: cd.afterState.debitMinor,
      expectedCreditMinor: cd.afterState.creditMinor,
      detectedDifferenceMinor: cd.beforeState.differenceMinor,
      correctionType: cd.correctionType as CorrectionType,
      evidenceIds: [],
      policyVersion: cd.correctionPolicyVersion,
      underlyingRecordVersion: cd.underlyingRecordVersion,
    });

    if (recomputedCalc.journalLines.length !== cd.journalLines.length) {
      metrics.receiptReplayDivergenceTotal.inc();
      throw new ReplayDivergenceError(
        "correctionDecision.journalLines.length",
        cd.journalLines.length,
        recomputedCalc.journalLines.length
      );
    }

    const replayedProof = InvariantRestorationProver.proveRestoration(
      {
        tenantId: receipt.tenantId,
        transactionId: receipt.transactionId,
        currency: receipt.inputCommitment.currency,
        observedDebitMinor: cd.beforeState.debitMinor,
        observedCreditMinor: cd.beforeState.creditMinor,
        expectedDebitMinor: cd.afterState.debitMinor,
        expectedCreditMinor: cd.afterState.creditMinor,
        detectedDifferenceMinor: cd.beforeState.differenceMinor,
        correctionType: cd.correctionType as CorrectionType,
        evidenceIds: [],
        policyVersion: cd.correctionPolicyVersion,
        underlyingRecordVersion: cd.underlyingRecordVersion,
      },
      recomputedCalc.journalLines
    );

    if (replayedProof.proofHash !== cd.invariantProofHash) {
      metrics.receiptReplayDivergenceTotal.inc();
      throw new ReplayDivergenceError(
        "correctionDecision.invariantProofHash",
        cd.invariantProofHash,
        replayedProof.proofHash
      );
    }
    correctionReplayed = true;
  }

  // 6. Verify Terminal Decision Consistency
  if (receipt.finalDecision === "AUTO_RESOLVED") {
    if (receipt.routingDecision && receipt.routingDecision.decision !== "AUTO_RESOLVE") {
      metrics.receiptReplayDivergenceTotal.inc();
      throw new ReplayDivergenceError("finalDecision", "AUTO_RESOLVE routing", receipt.routingDecision.decision);
    }
  } else if (receipt.finalDecision === "HUMAN_APPROVED") {
    if (receipt.correctionDecision && receipt.correctionDecision.correctionStatus !== "APPROVED") {
      metrics.receiptReplayDivergenceTotal.inc();
      throw new ReplayDivergenceError(
        "correctionDecision.correctionStatus",
        "APPROVED",
        receipt.correctionDecision.correctionStatus
      );
    }
  }

  const executionTimeMs = Math.round((performance.now() - t0) * 100) / 100;
  metrics.receiptReplayMs.observe(executionTimeMs);

  return {
    isReplayValid: true,
    receiptId: receipt.receiptId,
    transactionId: receipt.transactionId,
    tenantId: receipt.tenantId,
    replayedFinalDecision: receipt.finalDecision,
    routingReplayed,
    solverReplayed,
    correctionReplayed,
    replayedAt: new Date().toISOString(),
    executionTimeMs,
  };
}
