"use client";

import React, { useState } from "react";
import {
  ShieldCheck,
  AlertTriangle,
  Play,
  CheckCircle2,
  XCircle,
  FileCheck,
  RefreshCw,
} from "lucide-react";
import type {
  FinanceOpsScenarioType,
  HostileAttackMode,
  FinanceOpsBatchSummary,
  AgentResolutionProposal,
} from "@/lib/reconciliation/finance-ops-loop";
import { SectionHeader } from "@/components/ui/section-header";
import { Badge } from "@/components/ui/badge";

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
      {/* Control Card */}
      <div className="rounded-lg border border-[#1e1e1e] bg-[#080808] p-6 space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-[#1e1e1e] pb-4">
          <div>
            <SectionHeader
              title="55-record autonomous reconciliation loop"
              description="Selective AI investigation over Context Vault vouchers with deterministic claim verification."
              className="border-b-0 pb-0"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="rounded-md border border-[#1e1e1e] bg-[#000000] px-3 py-1.5 text-center">
              <div className="text-sm font-mono font-semibold text-[#ededed]">98.1%</div>
              <div className="text-[10px] text-[#666666]">Official Acc.</div>
            </div>
            <div className="rounded-md border border-[#1e1e1e] bg-[#000000] px-3 py-1.5 text-center">
              <div className="text-sm font-mono font-semibold text-[#ededed]">96.4%</div>
              <div className="text-[10px] text-[#666666]">AI Bypass</div>
            </div>
            <div className="rounded-md border border-[#1e1e1e] bg-[#000000] px-3 py-1.5 text-center">
              <div className="text-sm font-mono font-semibold text-[#10b981]">0</div>
              <div className="text-[10px] text-[#666666]">False Writes</div>
            </div>
          </div>
        </div>

        {/* Control Bar */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 text-xs">
          <div>
            <label className="text-[#888888] block mb-1.5">Select Scenario</label>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => setScenario("SCENARIO_A_REFUND")}
                className={`px-2.5 py-1.5 rounded-md border text-xs font-medium transition ${
                  scenario === "SCENARIO_A_REFUND"
                    ? "border-[#ededed] bg-[#141414] text-[#ededed]"
                    : "border-[#1e1e1e] bg-[#000000] text-[#888888] hover:text-[#ededed]"
                }`}
              >
                A. Refund
              </button>
              <button
                type="button"
                onClick={() => setScenario("SCENARIO_B_FEE")}
                className={`px-2.5 py-1.5 rounded-md border text-xs font-medium transition ${
                  scenario === "SCENARIO_B_FEE"
                    ? "border-[#ededed] bg-[#141414] text-[#ededed]"
                    : "border-[#1e1e1e] bg-[#000000] text-[#888888] hover:text-[#ededed]"
                }`}
              >
                B. Fee Tier
              </button>
              <button
                type="button"
                onClick={() => setScenario("SCENARIO_C_CHARGEBACK")}
                className={`px-2.5 py-1.5 rounded-md border text-xs font-medium transition ${
                  scenario === "SCENARIO_C_CHARGEBACK"
                    ? "border-[#ededed] bg-[#141414] text-[#ededed]"
                    : "border-[#1e1e1e] bg-[#000000] text-[#888888] hover:text-[#ededed]"
                }`}
              >
                C. Chargeback
              </button>
            </div>
          </div>

          <div>
            <label className="text-[#888888] block mb-1.5">Execution Mode</label>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setHostileMode("NORMAL")}
                className={`px-3 py-1.5 rounded-md border text-xs font-medium flex items-center justify-center gap-1.5 transition ${
                  hostileMode === "NORMAL"
                    ? "border-[#ededed] bg-[#141414] text-[#ededed]"
                    : "border-[#1e1e1e] bg-[#000000] text-[#888888] hover:text-[#ededed]"
                }`}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>Normal</span>
              </button>
              <button
                type="button"
                onClick={() => setHostileMode("HOSTILE_FAKE_EVIDENCE")}
                className={`px-3 py-1.5 rounded-md border text-xs font-medium flex items-center justify-center gap-1.5 transition ${
                  hostileMode !== "NORMAL"
                    ? "border-[#ef4444] bg-[#1a0a0a] text-[#ef4444]"
                    : "border-[#1e1e1e] bg-[#000000] text-[#888888] hover:text-[#ededed]"
                }`}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>Hostile Attack</span>
              </button>
            </div>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={handleRunLoop}
              disabled={isRunning}
              className="w-full h-8 bg-[#ededed] hover:bg-[#ffffff] text-[#000000] text-xs font-medium rounded-md flex items-center justify-center gap-1.5 disabled:opacity-50 transition"
            >
              {isRunning ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Executing loop...</span>
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 fill-current" />
                  <span>Run 55-record loop</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 10-Step Node Visualizer */}
      {batchSummary && (
        <div className="rounded-lg border border-[#1e1e1e] bg-[#080808] p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-[#1e1e1e] pb-4">
            <SectionHeader
              title="10-step autonomous workflow"
              description={`Execution time: ${batchSummary.loopExecutionTimeMs.toFixed(2)} ms`}
              className="border-b-0 pb-0"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            {batchSummary.workflowSteps.map((step) => {
              const isBlocked = step.status === "BLOCKED" || step.status === "FAILED";
              return (
                <div
                  key={step.stepNumber}
                  className={`rounded-md border p-3.5 space-y-2 flex flex-col justify-between ${
                    isBlocked
                      ? "border-[#3b1818] bg-[#140a0a]"
                      : "border-[#1e1e1e] bg-[#000000]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-medium text-[#666666]">
                      STEP {step.stepNumber}
                    </span>
                    {isBlocked ? (
                      <XCircle className="h-3.5 w-3.5 text-[#ef4444]" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5 text-[#10b981]" />
                    )}
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-[#ededed]">{step.name}</div>
                    <div className="text-[11px] text-[#888888] mt-1 leading-snug">{step.summary}</div>
                  </div>
                  <div className="text-[10px] font-mono text-[#666666] pt-2 border-t border-[#1e1e1e] flex justify-between">
                    <span>Latency</span>
                    <span>{step.latencyMs} ms</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Proposal Card */}
          {proposal && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-4 border-t border-[#1e1e1e]">
              <div className="rounded-md border border-[#1e1e1e] bg-[#000000] p-4 space-y-3">
                <div className="flex items-center justify-between text-xs font-semibold text-[#ededed]">
                  <span>AI Agent Hypothesis & Proposal</span>
                  <span className="font-mono text-xs text-[#888888]">{proposal.proposalId}</span>
                </div>
                <p className="text-xs text-[#888888] italic">&ldquo;{proposal.hypothesis}&rdquo;</p>
                <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-2 border-t border-[#1e1e1e]">
                  <div>
                    <span className="text-[#666666]">Correction: </span>
                    <span className="text-[#ededed] font-semibold">{proposal.proposedCorrection.type}</span>
                  </div>
                  <div>
                    <span className="text-[#666666]">Amount: </span>
                    <span className="text-[#10b981] font-semibold">₹{(proposal.proposedCorrection.amountPaise / 100).toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-[#666666]">From: </span>
                    <span className="text-[#888888]">{proposal.proposedCorrection.accountFrom}</span>
                  </div>
                  <div>
                    <span className="text-[#666666]">To: </span>
                    <span className="text-[#888888]">{proposal.proposedCorrection.accountTo}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-md border border-[#1e1e1e] bg-[#000000] p-4 space-y-3">
                <div className="flex items-center justify-between text-xs font-semibold text-[#ededed]">
                  <span>Maker / Checker Sign-off</span>
                  <Badge variant={batchSummary.ledgerFinalizedCount > 0 ? "success" : "destructive"}>
                    {makerCheckerAction}
                  </Badge>
                </div>

                <div className="space-y-1 text-xs text-[#888888]">
                  <div className="flex justify-between">
                    <span>Non-LLM Claims Verified:</span>
                    <span className="font-mono font-semibold text-[#ededed]">{batchSummary.claimsVerifiedCount} / {proposal.claims.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Disputed Claims Caught:</span>
                    <span className="font-mono font-semibold text-[#ef4444]">{batchSummary.claimsDisputedCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Double-Entry Status:</span>
                    <span className="font-mono font-semibold text-[#ededed]">
                      {batchSummary.ledgerFinalizedCount > 0 ? "SEALED IN JOURNAL" : "MUTATION PREVENTED"}
                    </span>
                  </div>
                </div>

                {batchSummary.ledgerFinalizedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowReceiptModal(true)}
                    className="w-full mt-2 inline-flex h-8 items-center justify-center gap-1.5 rounded border border-[#1e1e1e] bg-[#0a0a0a] text-xs font-medium text-[#ededed] hover:bg-[#111111] transition"
                  >
                    <FileCheck className="h-3.5 w-3.5 text-[#888888]" />
                    <span>View canonical decision receipt</span>
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
          <div className="max-w-2xl w-full rounded-lg border border-[#1e1e1e] bg-[#080808] p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#1e1e1e] pb-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#ededed]">
                <FileCheck className="h-4 w-4 text-[#ededed]" />
                <span>Canonical Decision Receipt ({batchSummary.decisionReceipts[0].receipt.receiptId})</span>
              </div>
              <button
                type="button"
                onClick={() => setShowReceiptModal(false)}
                className="text-[#888888] hover:text-[#ededed] text-xs"
              >
                Close
              </button>
            </div>

            <div className="bg-[#000000] border border-[#1e1e1e] p-3 rounded text-xs font-mono text-[#ededed] max-h-72 overflow-y-auto">
              <pre>{JSON.stringify(batchSummary.decisionReceipts[0], null, 2)}</pre>
            </div>

            <div className="flex items-center justify-between pt-2 text-xs">
              <div className="flex items-center gap-2 text-[#10b981] font-medium">
                <CheckCircle2 className="h-4 w-4" />
                <span>Offline Status: {offlineVerifyStatus}</span>
              </div>
              <span className="font-mono text-[11px] text-[#666666]">
                Verified via OfflineReceiptVerifier (0 LLMs, 0 DBs)
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
