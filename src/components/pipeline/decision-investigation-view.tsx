"use client";

/*
 * SettleMate AI — Unified Financial Decision Investigation View
 *
 * Implements Progressive Disclosure across the 11-stage decision pipeline:
 *   1. INPUT
 *   2. EVIDENCE
 *   3. DETERMINISTIC RECONCILIATION
 *   4. INVARIANTS (Z3)
 *   5. AI CLAIM
 *   6. ADVERSARIAL CRITIC (3 LENSES)
 *   7. MECHANICAL VERDICT
 *   8. REINVESTIGATION PASSES
 *   9. OR-TOOLS SOLVER
 *  10. RISK ROUTING
 *  11. MINIMAL CORRECTION & INVARIANT RESTORATION
 *  12. SIGNED TERMINAL RECEIPT
 */

import React, { useState } from "react";
import type { PipelineExecutionResult } from "@/lib/pipeline/financial-decision-pipeline";
import { TerminalReceiptCard } from "../receipts/terminal-receipt-card";
import { ReceiptLineageGraph } from "../receipts/receipt-lineage-graph";

export const DecisionInvestigationView: React.FC = () => {
  const [activeScenario, setActiveScenario] = useState<
    "CLEAN_FAST_PATH" | "ADVERSARIAL_REINVESTIGATION" | "HUMAN_CORRECTION" | "SPLIT_PAYMENT"
  >("CLEAN_FAST_PATH");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PipelineExecutionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runPipeline = async (scenario: typeof activeScenario) => {
    setActiveScenario(scenario);
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      let body: Record<string, unknown> = {};

      if (scenario === "CLEAN_FAST_PATH") {
        body = {
          transactionId: "tx_clean_fast_101",
          currency: "INR",
          amountMinor: 500000, // ₹5,000.00
          observedDebitMinor: 500000,
          observedCreditMinor: 500000,
          scenarioType: "CLEAN_FAST_PATH",
          description: "Clean matched transaction — bypasses AI",
        };
      } else if (scenario === "ADVERSARIAL_REINVESTIGATION") {
        body = {
          transactionId: "tx_adv_reinvestigate_202",
          currency: "INR",
          amountMinor: 120000, // ₹1,200.00
          observedDebitMinor: 120000,
          observedCreditMinor: 110000, // Discrepancy
          scenarioType: "ADVERSARIAL_REINVESTIGATION",
          discrepancyType: "SETTLEMENT_VARIANCE",
          description: "Ambiguous settlement variance challenged by adversarial critic and reinvestigated",
          evidenceItems: [
            {
              id: "ev_voucher_202",
              source: "BANK_FEED",
              content: "Bank feed settlement ₹1,100 vs ledger ₹1,200",
            },
          ],
        };
      } else if (scenario === "HUMAN_CORRECTION") {
        body = {
          transactionId: "tx_human_corr_303",
          currency: "INR",
          amountMinor: 8750000, // ₹87,500.00 (High exposure)
          observedDebitMinor: 8750000,
          observedCreditMinor: 7500000, // ₹12,500.00 variance
          scenarioType: "HUMAN_CORRECTION",
          discrepancyType: "SETTLEMENT_VARIANCE",
          humanApprovalAction: "APPROVE",
          humanReviewer: "lead_financial_controller",
          description: "High exposure variance requiring minimal correcting journal entry and invariant restoration proof",
        };
      } else if (scenario === "SPLIT_PAYMENT") {
        body = {
          transactionId: "tx_split_solve_404",
          currency: "INR",
          amountMinor: 10000000, // ₹100,000.00
          observedDebitMinor: 10000000,
          observedCreditMinor: 10000000,
          scenarioType: "SPLIT_PAYMENT",
          description: "Split payment matching 3 invoices: ₹30k + ₹25k + ₹45k = ₹100k",
          invoiceCandidates: [
            { invoiceId: "INV-101", amountMinor: 3000000, currency: "INR", status: "OPEN" },
            { invoiceId: "INV-102", amountMinor: 2500000, currency: "INR", status: "OPEN" },
            { invoiceId: "INV-103", amountMinor: 4500000, currency: "INR", status: "OPEN" },
            { invoiceId: "INV-104", amountMinor: 5000000, currency: "INR", status: "OPEN" },
          ],
        };
      }

      const res = await fetch("/api/pipeline/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || "Pipeline execution failed");
      }

      setResult(data.data);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Scenario Selection */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-foreground">
              Autonomous Financial Decision Pipeline
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              End-to-end verified reconciliation, Z3 invariant proofs, adversarial challenge, risk routing, and immutable receipts.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => runPipeline("CLEAN_FAST_PATH")}
              disabled={loading}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
                activeScenario === "CLEAN_FAST_PATH"
                  ? "bg-primary text-primary-foreground shadow"
                  : "border border-border bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              Demo A: Clean Fast Path
            </button>
            <button
              type="button"
              onClick={() => runPipeline("ADVERSARIAL_REINVESTIGATION")}
              disabled={loading}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
                activeScenario === "ADVERSARIAL_REINVESTIGATION"
                  ? "bg-primary text-primary-foreground shadow"
                  : "border border-border bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              Demo B: Reinvestigate
            </button>
            <button
              type="button"
              onClick={() => runPipeline("HUMAN_CORRECTION")}
              disabled={loading}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
                activeScenario === "HUMAN_CORRECTION"
                  ? "bg-primary text-primary-foreground shadow"
                  : "border border-border bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              Demo C: Human Correction
            </button>
            <button
              type="button"
              onClick={() => runPipeline("SPLIT_PAYMENT")}
              disabled={loading}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
                activeScenario === "SPLIT_PAYMENT"
                  ? "bg-primary text-primary-foreground shadow"
                  : "border border-border bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              Split Payment (OR-Tools)
            </button>
          </div>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="rounded-lg bg-destructive/10 p-4 text-xs font-medium text-destructive">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Results Section */}
      {result && (
        <div className="space-y-6">
          {/* Executive Pipeline Banner */}
          <div className="rounded-xl border border-border/80 bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-md px-2.5 py-0.5 text-xs font-bold ${
                    result.finalDecision === "AUTO_RESOLVED"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                      : result.finalDecision === "HUMAN_APPROVED"
                      ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30"
                      : result.finalDecision === "HUMAN_REJECTED"
                      ? "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30"
                      : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                  }`}
                >
                  {result.finalDecision.replace(/_/g, " ")}
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  Tx: {result.transactionId}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                Total Execution: <strong className="text-foreground">{result.timings.totalDurationMs}ms</strong>
              </div>
            </div>

            {/* Stage Metrics Grid */}
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg bg-muted/40 p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  AI Status
                </div>
                <div className="mt-1 text-xs font-semibold text-foreground">
                  {result.bypassedAi
                    ? "Deterministically Resolved (0 AI Invocations)"
                    : `${result.aiInvocationCount} AI Invocation(s)`}
                </div>
              </div>

              <div className="rounded-lg bg-muted/40 p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Reinvestigations
                </div>
                <div className="mt-1 text-xs font-semibold text-foreground">
                  {result.reinvestigationPasses > 0
                    ? `${result.reinvestigationPasses} Pass(es) Run`
                    : "0 Passes (Fast Path)"}
                </div>
              </div>

              <div className="rounded-lg bg-muted/40 p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Risk Score
                </div>
                <div className="mt-1 font-mono text-xs font-semibold text-foreground">
                  {result.routingRisk !== undefined ? result.routingRisk.toFixed(4) : "0.0000 (Deterministic)"}
                </div>
              </div>

              <div className="rounded-lg bg-muted/40 p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Receipt Status
                </div>
                <div className="mt-1 text-xs font-semibold">
                  {result.finalDecision === "BLOCKED" || result.finalDecision === "FAILED" || result.finalDecision === "HUMAN_REJECTED" ? (
                    <span className="text-amber-600 dark:text-amber-400">
                      RECEIPT SEALED ({result.finalDecision}) 🛡️
                    </span>
                  ) : result.verificationReport.verdict === "VALID" ? (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      RECEIPT VERIFIED ✅
                    </span>
                  ) : (
                    <span className="text-destructive">
                      VERIFY FAILED ❌
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Lineage Graph */}
          <ReceiptLineageGraph receipt={result.receipt} />

          {/* Full Signed Terminal Receipt */}
          <TerminalReceiptCard receipt={result.receipt} />
        </div>
      )}
    </div>
  );
};
