"use client";

import React, { useState, use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Lock,
  Copy,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Badge } from "@/components/ui/badge";
import { formatAuditTime } from "@/lib/format";

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
    <div className="space-y-10 pb-12">
      {/* Header */}
      <PageHeader
        tag="Root Cause Analysis"
        title={data.title}
        description={data.summary}
        badge={
          <div className="flex items-center gap-2">
            <Badge variant="destructive">
              Severity: {data.severity}
            </Badge>
            <Badge variant="outline">
              {data.exceptionId}
            </Badge>
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/scenarios"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-accent transition"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to scenarios</span>
            </Link>
          </div>
        }
      />

      {/* 3-Column Proof Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
        <div className="rounded-lg border border-border bg-card p-4 space-y-1">
          <div className="text-xs text-muted-foreground">Gross order amount</div>
          <div className="text-xl font-semibold text-foreground">
            ₹{(data.grossAmountPaise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-muted-foreground font-sans">{data.orderId} · Captured via UPI</div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 space-y-1">
          <div className="text-xs text-muted-foreground">Actual bank credit</div>
          <div className="text-xl font-semibold text-[#10b981]">
            ₹{(data.actualBankCreditPaise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-muted-foreground font-sans">UTR Matched in Nodal Account</div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 space-y-1">
          <div className="text-xs text-muted-foreground">Isolated discrepancy</div>
          <div className="text-xl font-semibold text-[#ef4444]">
            ₹{(data.variancePaise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-muted-foreground font-sans">Explained by Voucher REF_8821</div>
        </div>
      </div>

      {/* Chronological Event Timeline */}
      <section className="rounded-lg border border-border bg-card p-5 space-y-4">
        <SectionHeader
          title="Multi-source chronological event timeline"
          description="5 sequenced ledger events across the transaction lifecycle"
        />

        <div className="space-y-3">
          {data.events.map((evt) => (
            <div key={evt.step} className="flex items-start gap-4 p-3.5 rounded-md border border-border bg-background">
              <div className="h-6 w-6 rounded border border-border bg-card text-foreground text-xs font-mono font-semibold flex items-center justify-center shrink-0">
                {evt.step}
              </div>

              <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-2 items-center text-xs">
                <div className="md:col-span-2 space-y-0.5">
                  <div className="font-semibold text-foreground">{evt.title}</div>
                  <div className="text-[11px] text-muted-foreground">{evt.details}</div>
                </div>

                <div className="font-mono text-muted-foreground">
                  <span className="text-[11px] block text-muted-foreground/70">{evt.source}</span>
                  {formatAuditTime(evt.timestamp)}
                </div>

                <div className="text-right font-mono font-semibold text-foreground">
                  ₹{(evt.amountPaise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Evidence Vault & Non-LLM Gate */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
        {/* Evidence Vault Card */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <SectionHeader
              title="Context vault grounded evidence"
              className="border-b-0 pb-0"
            />
            <Badge variant="success">
              {data.evidenceVoucher.status}
            </Badge>
          </div>

          <div className="space-y-2.5">
            <div className="flex justify-between py-1 border-b border-border">
              <span className="text-muted-foreground">Voucher Identifier:</span>
              <span className="font-mono font-semibold text-foreground">{data.evidenceVoucher.voucherId}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-border">
              <span className="text-muted-foreground">Document Type:</span>
              <span className="text-foreground">{data.evidenceVoucher.type}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-border">
              <span className="text-muted-foreground">Authorized Signer:</span>
              <span className="text-foreground">{data.evidenceVoucher.authorizedSigner}</span>
            </div>
            <div className="space-y-1 pt-1">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>SHA-256 Content Digest:</span>
                <button
                  type="button"
                  onClick={handleCopyHash}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  <Copy className="h-3 w-3" />
                  <span>{copied ? "Copied" : "Copy"}</span>
                </button>
              </div>
              <div className="p-2 rounded bg-background font-mono text-[11px] text-foreground break-all border border-border">
                {data.evidenceVoucher.sha256Hash}
              </div>
            </div>
          </div>
        </div>

        {/* Non-LLM Gate Card */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <SectionHeader
              title="Non-LLM verification gate"
              className="border-b-0 pb-0"
            />
            <Badge variant="success">
              Mechanically Verified
            </Badge>
          </div>

          <div className="space-y-3">
            <div className="p-3 rounded-md border border-border bg-background space-y-1">
              <div className="text-xs text-muted-foreground font-medium">Grounded AI claim</div>
              <p className="text-foreground italic">&ldquo;{data.groundedClaim.statement}&rdquo;</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[#10b981] font-medium">
                <CheckCircle2 className="h-4 w-4" />
                <span>Passed Rule: {data.groundedClaim.rule}</span>
              </div>
              <div className="flex items-center gap-2 text-[#10b981] font-medium">
                <CheckCircle2 className="h-4 w-4" />
                <span>Minor-Unit Conservation Verified (Net ₹0.00 Drift)</span>
              </div>
              <div className="flex items-center gap-2 text-[#10b981] font-medium">
                <CheckCircle2 className="h-4 w-4" />
                <span>Cryptographic Digest Matches Vault DAG</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Maker/Checker Action Bar */}
      <div className="rounded-lg border border-border bg-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h4 className="text-xs font-semibold text-foreground">Dual-Control Maker / Checker Sign-Off</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            Authorized sign-off posts final debit/credit entries to the General Ledger.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {actionTaken ? (
            <div className="px-3.5 py-1.5 rounded-md border border-border bg-background text-[#10b981] text-xs font-medium flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" />
              <span>{actionTaken}</span>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setActionTaken("Dispute Filed — Escalated to Compliance")}
                className="inline-flex h-8 items-center rounded-md border border-[#3b1818] bg-[#140a0a] px-3 text-xs font-medium text-[#ef4444] hover:bg-[#1f0f0f] transition"
              >
                Dispute Evidence
              </button>
              <button
                type="button"
                onClick={() => setActionTaken("Authorized & Posted to General Ledger")}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3.5 text-xs font-medium text-primary-foreground hover:bg-[#ffffff] transition"
              >
                <Lock className="h-3.5 w-3.5" />
                <span>Authorize adjustment</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
