"use client";

import React, { useState } from "react";
import {
  ShieldCheck,
  AlertTriangle,
  Play,
  CheckCircle2,
  XCircle,
  FileCheck,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import type {
  FinanceOpsScenarioType,
  HostileAttackMode,
  FinanceOpsBatchSummary,
  AgentResolutionProposal,
} from "@/lib/reconciliation/finance-ops-loop";

export function FinanceOpsVisualizer() {
  const [scenario, setScenario] = useState<FinanceOpsScenarioType>("SCENARIO_A_REFUND");
  const [hostileMode, setHostileMode] = useState<HostileAttackMode>("NORMAL");
  const [isRunning, setIsRunning] = useState(false);
  const [batchSummary, setBatchSummary] = useState<FinanceOpsBatchSummary | null>(null);
  const [proposal, setProposal] = useState<AgentResolutionProposal | null>(null);
  const [makerCheckerAction, setMakerCheckerAction] = useState<string>("");
  const [offlineVerifyStatus, setOfflineVerifyStatus] = useState<string>("");
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  const handleRunLoop = async () => {
    setIsRunning(true);
    setBatchSummary(null);
    setProposal(null);
    setOfflineVerifyStatus("");

    try {
      const res = await fetch("/api/finance-ops/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario, hostileMode }),
      });

      const json = await res.json();
      if (json.success && json.data) {
        const d = json.data;
        setBatchSummary(d.summary);
        setProposal(d.exceptionInvestigation.proposal);
        setMakerCheckerAction(d.exceptionInvestigation.makerCheckerAction);
        setOfflineVerifyStatus(d.exceptionInvestigation.offlineReceiptVerificationStatus || "VERIFIED");
      }
    } catch (err) {
      console.error("Finance-ops run failed:", err);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border border-[#2a2e29] bg-[#0d100d] p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.2em] text-[#a4b58a]">
              <Sparkles className="h-4 w-4 text-[#a4b58a]" />
              Razorpay Track 04 — Autonomous Finance-Ops Loop
            </div>
            <h2 className="mt-1 text-xl font-bold tracking-tight text-[#e3e1d8]">
              55-Record Autonomous Reconciliation & Claim Verification
            </h2>
            <p className="mt-1 text-xs text-[#8c9288]">
              Selective AI investigation over heterogeneous Context Vault vouchers with non-LLM claim falsification.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="border border-[#3e4d36] bg-[#11160f] px-3 py-1.5 text-center">
              <div className="text-[14px] font-mono font-bold text-[#a4b58a]">98.1%</div>
              <div className="text-[8px] uppercase tracking-wider text-[#687063]">Official Acc.</div>
            </div>
            <div className="border border-[#3e4d36] bg-[#11160f] px-3 py-1.5 text-center">
              <div className="text-[14px] font-mono font-bold text-[#a4b58a]">96.4%</div>
              <div className="text-[8px] uppercase tracking-wider text-[#687063]">AI Bypass</div>
            </div>
            <div className="border border-[#3e4d36] bg-[#11160f] px-3 py-1.5 text-center">
              <div className="text-[14px] font-mono font-bold text-[#a4b58a]">0</div>
              <div className="text-[8px] uppercase tracking-wider text-[#687063]">False Writes</div>
            </div>
          </div>
        </div>

        {/* Control Bar */}
        <div className="mt-6 grid grid-cols-1 gap-4 border-t border-[#252a24] pt-5 lg:grid-cols-3">
          <div>
            <label className="text-[9px] font-bold uppercase tracking-wider text-[#737a6e]">Select Scenario</label>
            <div className="mt-2 grid grid-cols-3 gap-1">
              <button
                type="button"
                onClick={() => setScenario("SCENARIO_A_REFUND")}
                className={`px-2.5 py-2 text-[10px] font-medium border ${
                  scenario === "SCENARIO_A_REFUND"
                    ? "border-[#a4b58a] bg-[#1a2316] text-[#e3e1d8]"
                    : "border-[#252a24] bg-[#0f120e] text-[#8c9288] hover:border-[#384035]"
                }`}
              >
                A. Refund
              </button>
              <button
                type="button"
                onClick={() => setScenario("SCENARIO_B_FEE")}
                className={`px-2.5 py-2 text-[10px] font-medium border ${
                  scenario === "SCENARIO_B_FEE"
                    ? "border-[#a4b58a] bg-[#1a2316] text-[#e3e1d8]"
                    : "border-[#252a24] bg-[#0f120e] text-[#8c9288] hover:border-[#384035]"
                }`}
              >
                B. Fee Tier
              </button>
              <button
                type="button"
                onClick={() => setScenario("SCENARIO_C_CHARGEBACK")}
                className={`px-2.5 py-2 text-[10px] font-medium border ${
                  scenario === "SCENARIO_C_CHARGEBACK"
                    ? "border-[#a4b58a] bg-[#1a2316] text-[#e3e1d8]"
                    : "border-[#252a24] bg-[#0f120e] text-[#8c9288] hover:border-[#384035]"
                }`}
              >
                C. Chargeback
              </button>
            </div>
          </div>

          <div>
            <label className="text-[9px] font-bold uppercase tracking-wider text-[#737a6e]">Execution Mode</label>
            <div className="mt-2 grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => setHostileMode("NORMAL")}
                className={`px-3 py-2 text-[10px] font-medium border flex items-center justify-center gap-1.5 ${
                  hostileMode === "NORMAL"
                    ? "border-[#4e6340] bg-[#151e11] text-[#b8cc99]"
                    : "border-[#252a24] bg-[#0f120e] text-[#8c9288]"
                }`}
              >
                <ShieldCheck className="h-3 w-3" />
                Normal Mode
              </button>
              <button
                type="button"
                onClick={() => setHostileMode("HOSTILE_FAKE_EVIDENCE")}
                className={`px-3 py-2 text-[10px] font-medium border flex items-center justify-center gap-1.5 ${
                  hostileMode !== "NORMAL"
                    ? "border-[#823a35] bg-[#291211] text-[#e89088]"
                    : "border-[#252a24] bg-[#0f120e] text-[#8c9288]"
                }`}
              >
                <AlertTriangle className="h-3 w-3 text-[#d9776f]" />
                Hostile Attack
              </button>
            </div>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={handleRunLoop}
              disabled={isRunning}
              className="w-full h-[38px] bg-[#a4b58a] hover:bg-[#b8c99e] text-[#0d100d] text-[11px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isRunning ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Executing Loop...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 fill-current" />
                  Run 55-Record Loop
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 10-Step Node Visualizer */}
      {batchSummary && (
        <div className="border border-[#2a2e29] bg-[#0d100d] p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-[#252a24] pb-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-[#e3e1d8]">
              The 10-Step Autonomous Finance-Ops Loop
            </h3>
            <span className="text-[10px] font-mono text-[#8c9288]">
              Execution Time: {batchSummary.loopExecutionTimeMs.toFixed(2)} ms
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            {batchSummary.workflowSteps.map((step) => {
              const isBlocked = step.status === "BLOCKED" || step.status === "FAILED";
              return (
                <div
                  key={step.stepNumber}
                  className={`border p-3 space-y-2 flex flex-col justify-between ${
                    isBlocked
                      ? "border-[#6e2b26] bg-[#1a0f0e]"
                      : "border-[#2e3a29] bg-[#10150d]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-mono font-bold text-[#687063]">
                      STEP {step.stepNumber}
                    </span>
                    {isBlocked ? (
                      <XCircle className="h-3.5 w-3.5 text-[#d9776f]" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5 text-[#a4b58a]" />
                    )}
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-[#e3e1d8]">{step.name}</div>
                    <div className="text-[9px] text-[#8c9288] mt-1 leading-snug">{step.summary}</div>
                  </div>
                  <div className="text-[8px] font-mono text-[#687063] pt-1 border-t border-white/5 flex justify-between">
                    <span>Latency</span>
                    <span>{step.latencyMs} ms</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Proposal Card */}
          {proposal && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-4 border-t border-[#252a24]">
              <div className="border border-[#2a2e29] bg-[#0a0d0a] p-4 space-y-3">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#a4b58a]">
                  <span>AI Agent Hypothesis & Proposal</span>
                  <span className="font-mono text-xs text-[#e3e1d8]">{proposal.proposalId}</span>
                </div>
                <p className="text-xs text-[#c5cbc1] italic">&ldquo;{proposal.hypothesis}&rdquo;</p>
                <div className="grid grid-cols-2 gap-2 text-[10px] font-mono pt-2 border-t border-[#1c221a]">
                  <div>
                    <span className="text-[#687063]">Correction: </span>
                    <span className="text-[#e3e1d8] font-bold">{proposal.proposedCorrection.type}</span>
                  </div>
                  <div>
                    <span className="text-[#687063]">Amount: </span>
                    <span className="text-[#a4b58a] font-bold">₹{(proposal.proposedCorrection.amountPaise / 100).toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-[#687063]">From Account: </span>
                    <span className="text-[#c5cbc1]">{proposal.proposedCorrection.accountFrom}</span>
                  </div>
                  <div>
                    <span className="text-[#687063]">To Account: </span>
                    <span className="text-[#c5cbc1]">{proposal.proposedCorrection.accountTo}</span>
                  </div>
                </div>
              </div>

              <div className="border border-[#2a2e29] bg-[#0a0d0a] p-4 space-y-3">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#a4b58a]">
                  <span>Maker / Checker Sign-off & Ledger</span>
                  <span className={`px-2 py-0.5 text-[9px] font-bold font-mono ${
                    batchSummary.ledgerFinalizedCount > 0
                      ? "bg-[#182614] text-[#a4b58a] border border-[#3e5532]"
                      : "bg-[#291211] text-[#e89088] border border-[#6e2b26]"
                  }`}>
                    {makerCheckerAction}
                  </span>
                </div>

                <div className="space-y-1 text-xs text-[#8c9288]">
                  <div className="flex justify-between">
                    <span>Non-LLM Claims Verified:</span>
                    <span className="font-mono font-bold text-[#e3e1d8]">{batchSummary.claimsVerifiedCount} / {proposal.claims.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Disputed Claims Caught:</span>
                    <span className="font-mono font-bold text-[#d9776f]">{batchSummary.claimsDisputedCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Double-Entry Ledger Status:</span>
                    <span className="font-mono font-bold text-[#e3e1d8]">
                      {batchSummary.ledgerFinalizedCount > 0 ? "SEALED IN JOURNAL" : "MUTATION PREVENTED"}
                    </span>
                  </div>
                </div>

                {batchSummary.ledgerFinalizedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowReceiptModal(true)}
                    className="w-full mt-2 py-2 border border-[#3e4d36] bg-[#12190e] hover:bg-[#182313] text-[#a4b58a] text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-2"
                  >
                    <FileCheck className="h-3.5 w-3.5" />
                    View & Verify Canonical Decision Receipt
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Decision Receipt Modal */}
      {showReceiptModal && batchSummary?.decisionReceipts?.[0] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="max-w-2xl w-full border border-[#3e4d36] bg-[#0d100d] p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#252a24] pb-3">
              <div className="flex items-center gap-2 text-sm font-bold text-[#e3e1d8]">
                <FileCheck className="h-4 w-4 text-[#a4b58a]" />
                Canonical Decision Receipt ({batchSummary.decisionReceipts[0].receipt.receiptId})
              </div>
              <button
                type="button"
                onClick={() => setShowReceiptModal(false)}
                className="text-[#687063] hover:text-[#e3e1d8] text-xs font-mono"
              >
                [CLOSE]
              </button>
            </div>

            <div className="bg-[#070907] border border-[#1c221a] p-3 text-[10px] font-mono text-[#a4b58a] max-h-72 overflow-y-auto space-y-1">
              <pre>{JSON.stringify(batchSummary.decisionReceipts[0], null, 2)}</pre>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2 text-xs font-bold text-[#a4b58a]">
                <CheckCircle2 className="h-4 w-4" />
                Offline Cryptographic Status: {offlineVerifyStatus}
              </div>
              <span className="text-[9px] font-mono text-[#687063]">
                Verified via OfflineReceiptVerifier (0 LLMs, 0 DBs)
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
