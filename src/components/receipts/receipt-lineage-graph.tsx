"use client";

/*
 * SettleMate AI — Milestone 5: Receipt Pipeline Lineage Visualizer
 *
 * Renders the deterministic lineage of all artifacts that produced the terminal receipt:
 *   Input -> Evidence -> AI Claim -> Critic -> Mechanical -> Reinvestigate -> Solver -> Routing -> Correction -> Terminal Receipt
 */

import React from "react";
import type { TerminalDecisionReceipt } from "@/lib/receipts/types";

interface ReceiptLineageGraphProps {
  receipt: TerminalDecisionReceipt;
}

export const ReceiptLineageGraph: React.FC<ReceiptLineageGraphProps> = ({ receipt }) => {
  const nodes = [
    {
      id: "input",
      label: "Input Data",
      sub: `Tx: ${receipt.transactionId}`,
      detail: `${receipt.inputCommitment.currency} ${(receipt.inputCommitment.amountMinor / 100).toFixed(2)}`,
      hash: receipt.inputCommitment.inputHash,
      status: "PASS",
    },
    {
      id: "evidence",
      label: "Tamper-Evident Evidence",
      sub: `${receipt.evidenceCommitment.evidenceIds.length} evidence records`,
      detail: `Merkle: ${receipt.evidenceCommitment.merkleRoot.slice(0, 10)}...`,
      hash: receipt.evidenceCommitment.merkleRoot,
      status: "PASS",
    },
    ...(receipt.aiClaim
      ? [
          {
            id: "claim",
            label: "AI Claim",
            sub: `Claim: ${receipt.aiClaim.claimId}`,
            detail: `Confidence: ${(receipt.aiClaim.confidence * 100).toFixed(1)}%`,
            status: "PASS",
          },
        ]
      : []),
    ...(receipt.challenge
      ? [
          {
            id: "critic",
            label: "Adversarial Critic",
            sub: `Status: ${receipt.challenge.challengeStatus}`,
            detail: `3 Lenses Evaluated`,
            status: receipt.challenge.challengeStatus === "CHALLENGE_CONFIRMED" ? "WARN" : "PASS",
          },
        ]
      : []),
    ...(receipt.mechanicalVerification
      ? [
          {
            id: "mechanical",
            label: "Mechanical Verifier",
            sub: `Verdict: ${receipt.mechanicalVerification.verdict}`,
            detail: "Zero-LLM Ground Truth Evaluation",
            status: receipt.mechanicalVerification.verdict === "PASSED" ? "PASS" : "FAIL",
          },
        ]
      : []),
    ...(receipt.reinvestigationHistory && receipt.reinvestigationHistory.length > 0
      ? [
          {
            id: "reinvestigate",
            label: "Reinvestigation Loop",
            sub: `${receipt.reinvestigationHistory.length} passes completed`,
            detail: `Final Claim: ${receipt.reinvestigationHistory[receipt.reinvestigationHistory.length - 1].resultingClaimId}`,
            status: "PASS",
          },
        ]
      : []),
    ...(receipt.solverDecision
      ? [
          {
            id: "solver",
            label: "OR-Tools Solver",
            sub: `Status: ${receipt.solverDecision.solverStatus}`,
            detail: `${receipt.solverDecision.selectedInvoiceIds.length} invoices matched`,
            hash: receipt.solverDecision.candidateCommitment,
            status: "PASS",
          },
        ]
      : []),
    ...(receipt.routingDecision
      ? [
          {
            id: "routing",
            label: "Risk Routing",
            sub: `Decision: ${receipt.routingDecision.decision}`,
            detail: `Risk Score: ${receipt.routingDecision.routingRisk}`,
            status: "PASS",
          },
        ]
      : []),
    ...(receipt.correctionDecision
      ? [
          {
            id: "correction",
            label: "Minimal Correction",
            sub: `Status: ${receipt.correctionDecision.correctionStatus}`,
            detail: `Invariant Restored (${receipt.correctionDecision.journalLines.length} lines)`,
            hash: receipt.correctionDecision.invariantProofHash,
            status: "PASS",
          },
        ]
      : []),
    {
      id: "terminal",
      label: "Terminal Receipt",
      sub: receipt.finalDecision,
      detail: `SHA-256: ${receipt.proofHash.slice(0, 10)}...`,
      hash: receipt.proofHash,
      status: "PASS",
      isTerminal: true,
    },
  ];

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
        End-to-End Decision Pipeline Lineage
      </h4>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-stretch sm:justify-start">
        {nodes.map((node, index) => (
          <React.Fragment key={node.id}>
            <div
              className={`flex flex-col justify-between rounded-lg border p-3 min-w-[160px] max-w-[220px] transition-all ${
                node.isTerminal
                  ? "border-emerald-500/50 bg-emerald-500/10 dark:bg-emerald-950/20"
                  : node.status === "WARN"
                  ? "border-amber-500/50 bg-amber-500/5"
                  : "border-border/70 bg-background/80"
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">
                    {node.label}
                  </span>
                  <span
                    className={`h-2 w-2 rounded-full ${
                      node.status === "PASS"
                        ? "bg-emerald-500"
                        : node.status === "WARN"
                        ? "bg-amber-500"
                        : "bg-destructive"
                    }`}
                  />
                </div>
                <div className="mt-1 text-xs font-medium text-foreground">{node.sub}</div>
                <div className="text-[11px] text-muted-foreground">{node.detail}</div>
              </div>
              {node.hash && (
                <div className="mt-2 font-mono text-[10px] text-muted-foreground truncate" title={node.hash}>
                  #{node.hash.slice(0, 12)}...
                </div>
              )}
            </div>
            {index < nodes.length - 1 && (
              <div className="hidden items-center justify-center text-muted-foreground/60 sm:flex">
                →
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};
