"use client";

/*
 * SettleMate AI — Milestone 5: Signed Terminal Decision Receipt Card
 *
 * Provides:
 *   - Comprehensive terminal decision and lineage display
 *   - Cryptographic proof hash and HMAC-SHA256 signature details
 *   - Live interactive verification button ("VERIFY RECEIPT" -> "RECEIPT VERIFIED ✅")
 *   - Interactive tampering demonstration ("SIMULATE TAMPERING" -> "INVALID RECEIPT ❌")
 */

import React, { useState } from "react";
import type { TerminalDecisionReceipt, TerminalReceiptVerificationReport } from "@/lib/receipts/types";
import { ReceiptLineageGraph } from "./receipt-lineage-graph";

interface TerminalReceiptCardProps {
  receipt: TerminalDecisionReceipt;
  onVerified?: (report: TerminalReceiptVerificationReport) => void;
}

export const TerminalReceiptCard: React.FC<TerminalReceiptCardProps> = ({
  receipt,
  onVerified,
}) => {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<TerminalReceiptVerificationReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = async (tamper: boolean = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/receipts/${receipt.receiptId}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          tamper
            ? {
                tamperedFields: {
                  proofHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                },
              }
            : {}
        ),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || "Verification failed");
      }

      setReport(data.report);
      if (onVerified) onVerified(data.report);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const getDecisionBadge = (decision: string) => {
    switch (decision) {
      case "AUTO_RESOLVED":
        return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";
      case "HUMAN_APPROVED":
        return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30";
      case "HUMAN_REJECTED":
        return "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30";
      case "BLOCKED":
        return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30";
      default:
        return "bg-muted text-muted-foreground border-border";
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-md transition-all">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-bold ${getDecisionBadge(
                receipt.finalDecision
              )}`}
            >
              {receipt.finalDecision.replace(/_/g, " ")}
            </span>
            <span className="font-mono text-xs text-muted-foreground">{receipt.receiptId}</span>
          </div>
          <h3 className="mt-1 text-base font-semibold text-foreground">
            Signed Terminal Decision Proof
          </h3>
        </div>

        <div className="text-right text-xs text-muted-foreground">
          <div>Tx: {receipt.transactionId}</div>
          <div>{new Date(receipt.createdAt).toLocaleString()}</div>
        </div>
      </div>

      {/* Lineage Graph */}
      <div className="mt-5">
        <ReceiptLineageGraph receipt={receipt} />
      </div>

      {/* Cryptographic Commitments */}
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-lg bg-muted/40 p-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Canonical Proof Hash (SHA-256)
          </div>
          <div className="mt-1 font-mono text-xs text-foreground break-all">
            {receipt.proofHash}
          </div>
        </div>

        <div className="rounded-lg bg-muted/40 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              HMAC Signature (Key {receipt.signingKeyVersion})
            </span>
            <span className="text-[10px] text-muted-foreground">{receipt.signatureAlgorithm}</span>
          </div>
          <div className="mt-1 font-mono text-xs text-foreground break-all">
            {receipt.signature}
          </div>
        </div>
      </div>

      {/* Policy Versions */}
      <div className="mt-4 rounded-lg border border-border/60 bg-muted/20 p-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Immutable Policy Commitments
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <div>
            <span className="text-muted-foreground">Reconciliation: </span>
            <span className="font-mono font-medium text-foreground">
              {receipt.policyVersions.reconciliationPolicyVersion}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Routing: </span>
            <span className="font-mono font-medium text-foreground">
              {receipt.policyVersions.routingPolicyVersion}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Invariant: </span>
            <span className="font-mono font-medium text-foreground">
              {receipt.policyVersions.invariantPolicyVersion}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Canonical: </span>
            <span className="font-mono font-medium text-foreground">
              {receipt.policyVersions.canonicalizationVersion}
            </span>
          </div>
        </div>
      </div>

      {/* Verification Report */}
      {report && (
        <div
          className={`mt-5 rounded-lg border p-4 transition-all ${
            report.verdict === "VALID"
              ? "border-emerald-500/40 bg-emerald-500/5"
              : "border-destructive/40 bg-destructive/5"
          }`}
        >
          <div className="flex items-center justify-between border-b border-border/50 pb-2">
            <div className="flex items-center gap-2">
              <span
                className={`font-bold text-sm ${
                  report.verdict === "VALID"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-destructive"
                }`}
              >
                {report.verdict === "VALID" ? "RECEIPT VERIFIED ✅" : "INVALID RECEIPT ❌"}
              </span>
              {report.failureReason && (
                <span className="rounded bg-destructive/10 px-2 py-0.5 text-xs font-bold text-destructive">
                  {report.failureReason}
                </span>
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              Verified in {report.latencyMs}ms
            </span>
          </div>

          <div className="mt-3 space-y-1.5 text-xs">
            {report.steps.map((s, idx) => (
              <div key={idx} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={
                      s.status === "PASS"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-destructive"
                    }
                  >
                    {s.status === "PASS" ? "✓" : "✗"}
                  </span>
                  <span className="font-medium text-foreground">{s.step}</span>
                </div>
                <span className="text-muted-foreground text-[11px] truncate max-w-[300px]">
                  {s.detail}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="mt-4 rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Actions */}
      <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => handleVerify(true)}
          disabled={loading}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          Simulate Tampering
        </button>
        <button
          type="button"
          onClick={() => handleVerify(false)}
          disabled={loading}
          className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? "Verifying..." : "Verify Receipt"}
        </button>
      </div>
    </div>
  );
};
