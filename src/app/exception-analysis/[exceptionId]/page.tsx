"use client";

import React, { useState, use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Database,
  Layers,
  Lock,
  ShieldCheck,
  Copy,
} from "lucide-react";

interface RootCauseData {
  exceptionId: string;
  category: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  title: string;
  summary: string;
  paymentId: string;
  orderId: string;
  grossAmountPaise: number;
  expectedSettlementPaise: number;
  actualBankCreditPaise: number;
  variancePaise: number;
  currency: string;
  events: Array<{
    step: number;
    title: string;
    source: string;
    timestamp: string;
    details: string;
    amountPaise: number;
    type: "ORDER" | "PAYMENT" | "EXCEPTION_TRIGGER" | "SETTLEMENT" | "BANK";
    status: "PASS" | "WARN" | "FAIL";
  }>;
  evidenceVoucher: {
    voucherId: string;
    type: string;
    sha256Hash: string;
    vaultReference: string;
    authorizedSigner: string;
    status: "VERIFIED_IN_VAULT" | "TAMPER_DETECTED" | "MISSING";
  };
  groundedClaim: {
    claimId: string;
    rule: string;
    statement: string;
    nonLlmStatus: "PASS" | "BLOCKED";
    mechanicallyVerified: boolean;
  };
}

const SAMPLE_ANALYSIS_DATA: Record<string, RootCauseData> = {
  "EXP-REFUND-001": {
    exceptionId: "EXP-REFUND-001",
    category: "PARTIAL_REFUND_DISCREPANCY",
    severity: "HIGH",
    title: "Captured Payment ₹20,000 settled for ₹18,450 (Variance: ₹1,550)",
    summary:
      "Gateway captured gross ₹20,000 for Order ORD_8821. Bank statement credited only ₹18,450 due to an unlinked mid-cycle partial customer refund advice REF_8821.",
    paymentId: "PAY_UPI_9921",
    orderId: "ORD_8821",
    grossAmountPaise: 2000000,
    expectedSettlementPaise: 1845000,
    actualBankCreditPaise: 1845000,
    variancePaise: 155000,
    currency: "INR",
    events: [
      {
        step: 1,
        title: "Order Placed & Invoiced",
        source: "Merchant ERP Feeds",
        timestamp: "2026-08-20T09:15:00.000Z",
        details: "Customer initiated order ORD_8821 for consumer electronics.",
        amountPaise: 2000000,
        type: "ORDER",
        status: "PASS",
      },
      {
        step: 2,
        title: "Payment Captured via Razorpay UPI",
        source: "Gateway Ingestion Stream",
        timestamp: "2026-08-20T09:15:32.000Z",
        details: "Payment PAY_UPI_9921 captured. Standard fee schedule applied.",
        amountPaise: 2000000,
        type: "PAYMENT",
        status: "PASS",
      },
      {
        step: 3,
        title: "Partial Refund Voucher Issued (REF_8821)",
        source: "Context Vault / Merchant Returns API",
        timestamp: "2026-08-20T11:42:10.000Z",
        details: "Customer requested partial return. Refund advice REF_8821 created in Context Vault.",
        amountPaise: 155000,
        type: "EXCEPTION_TRIGGER",
        status: "WARN",
      },
      {
        step: 4,
        title: "Net Settlement Batch Finalized",
        source: "Razorpay Settlement Schedule",
        timestamp: "2026-08-21T06:00:00.000Z",
        details: "Net settlement calculated: ₹20,000 gross - ₹1,550 refund = ₹18,450.",
        amountPaise: 1845000,
        type: "SETTLEMENT",
        status: "PASS",
      },
      {
        step: 5,
        title: "Bank Statement Credit Posted",
        source: "HDFC Nodal Clearing Statement",
        timestamp: "2026-08-21T14:22:15.000Z",
        details: "Single UTR credit posted for ₹18,450 (UTR: CMS8821992100).",
        amountPaise: 1845000,
        type: "BANK",
        status: "PASS",
      },
    ],
    evidenceVoucher: {
      voucherId: "REF_8821",
      type: "PARTIAL_REFUND_ADVICE",
      sha256Hash: "a7f92b41c0e84b8d7e98a123f456c7890123456789abcdef0123456789abcdef",
      vaultReference: "vault://evidence/refunds/2026-08/REF_8821.json",
      authorizedSigner: "merchant_support_lead",
      status: "VERIFIED_IN_VAULT",
    },
    groundedClaim: {
      claimId: "CLM-REF-001",
      rule: "RULE_EVIDENCE_EXISTS_IN_VAULT",
      statement: "Partial refund REF_8821 for ₹1,550 accounts exactly for the ₹1,550 variance between Gross and Net Settlement.",
      nonLlmStatus: "PASS",
      mechanicallyVerified: true,
    },
  },
};

export default function ExceptionAnalysisPage({ params }: { params: Promise<{ exceptionId: string }> }) {
  const resolvedParams = use(params);
  const exceptionId = resolvedParams.exceptionId || "EXP-REFUND-001";
  const [copied, setCopied] = useState(false);
  const [actionTaken, setActionTaken] = useState<string | null>(null);

  const data = SAMPLE_ANALYSIS_DATA[exceptionId] || SAMPLE_ANALYSIS_DATA["EXP-REFUND-001"];

  const handleCopyHash = () => {
    navigator.clipboard.writeText(data.evidenceVoucher.sha256Hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Navigation & Header */}
        <div className="flex items-center justify-between">
          <Link
            href="/scenarios"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Scenarios
          </Link>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
              Severity: {data.severity}
            </span>
            <span className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 font-mono">
              {data.exceptionId}
            </span>
          </div>
        </div>

        {/* Title Card */}
        <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/30 to-slate-900 border border-indigo-500/20 shadow-xl space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-indigo-400 uppercase tracking-wider">
            <Layers className="w-4 h-4" /> Multi-Source Root Cause Analysis
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            {data.title}
          </h1>
          <p className="text-xs sm:text-sm text-slate-300">
            {data.summary}
          </p>
        </div>

        {/* 3-Column Key Arithmetic Proof Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono">
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
            <div className="text-[10px] text-slate-400 uppercase">Gross Order Amount</div>
            <div className="text-xl font-bold text-white">
              ₹{(data.grossAmountPaise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-slate-500 font-sans">{data.orderId} · Captured via UPI</div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
            <div className="text-[10px] text-slate-400 uppercase">Actual Bank Credit</div>
            <div className="text-xl font-bold text-emerald-400">
              ₹{(data.actualBankCreditPaise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-slate-500 font-sans">UTR Matched in Hodal Account</div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/60 border border-amber-500/30 space-y-1 bg-amber-950/10">
            <div className="text-[10px] text-amber-400 uppercase">Isolated Discrepancy (Paise Exact)</div>
            <div className="text-xl font-bold text-amber-400">
              ₹{(data.variancePaise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-amber-300 font-sans">Explained by Voucher REF_8821</div>
          </div>
        </div>

        {/* Multi-Source Chronological Timeline */}
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Multi-Source Chronological Event Timeline
              </h2>
            </div>
            <span className="text-xs text-slate-400">5 Sequenced Ledger Events</span>
          </div>

          <div className="space-y-4">
            {data.events.map((evt) => (
              <div key={evt.step} className="flex items-start gap-4 p-4 rounded-xl bg-slate-800/30 border border-slate-700/50">
                <div className="flex flex-col items-center">
                  <div className="w-7 h-7 rounded-full bg-indigo-950 border border-indigo-500/50 text-indigo-300 text-xs font-bold flex items-center justify-center font-mono">
                    {evt.step}
                  </div>
                  {evt.step < data.events.length && <div className="w-0.5 h-8 bg-slate-800 mt-1"></div>}
                </div>

                <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
                  <div className="md:col-span-2 space-y-0.5">
                    <div className="text-xs font-bold text-white">{evt.title}</div>
                    <div className="text-[11px] text-slate-400">{evt.details}</div>
                  </div>

                  <div className="text-xs font-mono text-slate-400">
                    <span className="text-[10px] uppercase block text-slate-500">{evt.source}</span>
                    {new Date(evt.timestamp).toLocaleTimeString()}
                  </div>

                  <div className="text-right font-mono font-bold text-xs text-slate-200">
                    ₹{(evt.amountPaise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Evidence Vault Citation & Non-LLM Gate */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Evidence Vault Card */}
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Context Vault Grounded Evidence
                </h3>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                {data.evidenceVoucher.status}
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Voucher Identifier:</span>
                <span className="font-mono font-bold text-white">{data.evidenceVoucher.voucherId}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Document Type:</span>
                <span className="text-slate-200">{data.evidenceVoucher.type}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Authorized Signer:</span>
                <span className="text-slate-200">{data.evidenceVoucher.authorizedSigner}</span>
              </div>
              <div className="space-y-1 pt-1">
                <div className="flex items-center justify-between text-slate-400">
                  <span>SHA-256 Content Digest:</span>
                  <button onClick={handleCopyHash} className="text-indigo-400 hover:text-indigo-300 text-[10px] flex items-center gap-1">
                    <Copy className="w-3 h-3" /> {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
                <div className="p-2 rounded bg-slate-950 font-mono text-[10px] text-slate-300 break-all border border-slate-800">
                  {data.evidenceVoucher.sha256Hash}
                </div>
              </div>
            </div>
          </div>

          {/* Non-LLM Gate Card */}
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Non-LLM Invariant Verification Gate
                </h3>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                MECHANICALLY VERIFIED
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                <div className="text-[10px] font-semibold text-indigo-400 uppercase">Grounded AI Claim Statement</div>
                <p className="text-slate-200 italic">&ldquo;{data.groundedClaim.statement}&rdquo;</p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                  <CheckCircle2 className="w-4 h-4" /> Passed Rule: {data.groundedClaim.rule}
                </div>
                <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                  <CheckCircle2 className="w-4 h-4" /> Passed Paired Minor-Unit Conservation Check (Net ₹0.00 Drift)
                </div>
                <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                  <CheckCircle2 className="w-4 h-4" /> Tamper-Proof Cryptographic Hash Verified Against Vault DAG
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Dual-Control Maker/Checker Action Bar */}
        <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 to-indigo-950/40 border border-indigo-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h4 className="text-sm font-bold text-white">Dual-Control Maker / Checker Sign-Off</h4>
            <p className="text-xs text-slate-400 mt-0.5">
              Reviewer approval authorizes the adjustment and posts final debit/credit entries to the General Ledger.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {actionTaken ? (
              <div className="px-4 py-2 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> {actionTaken}
              </div>
            ) : (
              <>
                <button
                  onClick={() => setActionTaken("Dispute Filed — Escalated to Compliance")}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-rose-400 text-xs font-bold border border-rose-500/30 transition-all"
                >
                  Dispute Evidence
                </button>
                <button
                  onClick={() => setActionTaken("Authorized & Posted to General Ledger (Receipt Sealed)")}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
                >
                  <Lock className="w-3.5 h-3.5" /> Authorize Adjustment
                </button>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
