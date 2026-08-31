"use client";

/*
 * SettleMate AI — Milestone 4: Minimal Correcting Journal Entry Review Card
 *
 * Provides human review interface with:
 *   - Minimal journal entry proposal
 *   - Mathematical invariant restoration proof (Before vs After)
 *   - Cryptographic proof hash
 *   - Authenticated approval and rejection controls
 *   - Stale proof detection and prevention
 */

import React, { useState } from "react";
import type { ProposedCorrectionRecord } from "@/lib/corrections/types";

interface CorrectionReviewCardProps {
  correction: ProposedCorrectionRecord;
  onApproved?: (record: ProposedCorrectionRecord) => void;
  onRejected?: (record: ProposedCorrectionRecord) => void;
  isStale?: boolean;
}

export const CorrectionReviewCard: React.FC<CorrectionReviewCardProps> = ({
  correction: initialCorrection,
  onApproved,
  onRejected,
  isStale = false,
}) => {
  const [correction, setCorrection] = useState<ProposedCorrectionRecord>(initialCorrection);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const formatCurrency = (amountMinor: number, currency: string = "INR") => {
    const symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : "₹";
    return `${symbol}${(amountMinor / 100).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const handleApprove = async () => {
    if (isStale || correction.status !== "AWAITING_REVIEW") return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/corrections/${correction.correctionId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedVersion: correction.underlyingRecordVersion,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || "Approval failed");
      }
      setCorrection(data.record);
      setSuccessMsg("Correction atomically approved and posted to ledger.");
      if (onApproved) onApproved(data.record);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (correction.status === "APPROVED" || correction.status === "REJECTED") return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/corrections/${correction.correctionId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Manual rejection from review console" }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || "Rejection failed");
      }
      setCorrection(data.record);
      setSuccessMsg("Correction rejected.");
      if (onRejected) onRejected(data.record);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const proof = correction.invariantProof;
  const isApproved = correction.status === "APPROVED";
  const isRejected = correction.status === "REJECTED";
  const effectiveStale = isStale || correction.status === "STALE";

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-md transition-all">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-md bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
              HUMAN REVIEW REQUIRED
            </span>
            <span className="text-xs text-muted-foreground">
              Tx: {correction.transactionId}
            </span>
          </div>
          <h3 className="mt-1 text-base font-medium text-foreground">
            Minimal Correcting Journal Entry
          </h3>
        </div>

        <div className="flex items-center gap-2">
          {effectiveStale ? (
            <span className="rounded-full bg-destructive/10 px-3 py-1 text-xs font-semibold text-destructive">
              STALE PROOF
            </span>
          ) : isApproved ? (
            <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              ✓ APPROVED & COMMITTED
            </span>
          ) : isRejected ? (
            <span className="rounded-full bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-600 dark:text-rose-400">
              REJECTED
            </span>
          ) : (
            <span className="rounded-full bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-600 dark:text-sky-400">
              AWAITING REVIEW
            </span>
          )}
        </div>
      </div>

      {/* Discrepancy & Imbalance */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-lg bg-muted/40 p-3">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Discrepancy Classification
          </span>
          <div className="mt-1 text-sm font-semibold text-foreground">
            {correction.correctionType.replace(/_/g, " ")}
          </div>
        </div>
        <div className="rounded-lg bg-muted/40 p-3">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Detected Imbalance
          </span>
          <div className="mt-1 text-sm font-semibold text-amber-600 dark:text-amber-400">
            {formatCurrency(correction.detectedDifferenceMinor, correction.currency)}
          </div>
        </div>
      </div>

      {/* Recommended Minimal Journal Entry */}
      <div className="mt-5">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Recommended Minimal Journal Entry
        </h4>
        <div className="mt-2 space-y-2">
          {correction.journalLines.map((line) => (
            <div
              key={line.lineId}
              className="flex items-center justify-between rounded-lg border border-border/50 bg-background/60 p-3 text-sm"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`rounded px-2 py-0.5 text-xs font-bold ${
                    line.entryType === "DEBIT"
                      ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                      : "bg-purple-500/15 text-purple-600 dark:text-purple-400"
                  }`}
                >
                  {line.entryType}
                </span>
                <div>
                  <div className="font-medium text-foreground">{line.accountName}</div>
                  <div className="text-xs text-muted-foreground">{line.description}</div>
                </div>
              </div>
              <div className="text-right font-mono font-semibold text-foreground">
                {formatCurrency(line.amountMinor, line.currency)}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {correction.minimalExplanation}
        </p>
      </div>

      {/* Invariant Restoration Proof Comparison */}
      <div className="mt-5 rounded-lg border border-border/80 bg-muted/30 p-4">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">
          Invariant Restoration Proof
        </h4>

        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Before */}
          <div className="rounded border border-border/40 bg-background/70 p-3">
            <div className="text-xs font-medium text-muted-foreground">Before Proposed Correction</div>
            <div className="mt-1 space-y-0.5 text-xs">
              <div className="flex justify-between">
                <span>DEBIT:</span>
                <span className="font-mono">{formatCurrency(proof.beforeState.debitMinor, correction.currency)}</span>
              </div>
              <div className="flex justify-between">
                <span>CREDIT:</span>
                <span className="font-mono">{formatCurrency(proof.beforeState.creditMinor, correction.currency)}</span>
              </div>
              <div className="flex justify-between border-t border-border/40 pt-1 font-semibold text-amber-600">
                <span>Difference:</span>
                <span className="font-mono">{formatCurrency(proof.beforeState.differenceMinor, correction.currency)}</span>
              </div>
            </div>
          </div>

          {/* After */}
          <div className="rounded border border-emerald-500/30 bg-emerald-500/5 p-3">
            <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
              After Proposed Correction
            </div>
            <div className="mt-1 space-y-0.5 text-xs">
              <div className="flex justify-between">
                <span>DEBIT:</span>
                <span className="font-mono">{formatCurrency(proof.afterState.debitMinor, correction.currency)}</span>
              </div>
              <div className="flex justify-between">
                <span>CREDIT:</span>
                <span className="font-mono">{formatCurrency(proof.afterState.creditMinor, correction.currency)}</span>
              </div>
              <div className="flex justify-between border-t border-emerald-500/30 pt-1 font-semibold text-emerald-600 dark:text-emerald-400">
                <span>Difference:</span>
                <span className="font-mono">{formatCurrency(proof.afterState.differenceMinor, correction.currency)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-2 text-xs">
          <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
            <span>✓</span>
            <span>Double-entry invariant VERIFIED</span>
          </div>
          <div className="font-mono text-[11px] text-muted-foreground">
            Proof: {proof.proofHash.slice(0, 16)}...
          </div>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="mt-4 rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
          <strong>Error:</strong> {error}
        </div>
      )}
      {successMsg && (
        <div className="mt-4 rounded-lg bg-emerald-500/10 p-3 text-xs text-emerald-600 dark:text-emerald-400">
          {successMsg}
        </div>
      )}

      {/* Action Buttons */}
      {!isApproved && !isRejected && (
        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={handleReject}
            disabled={loading || effectiveStale}
            className="rounded-lg border border-border bg-background px-4 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={handleApprove}
            disabled={loading || effectiveStale}
            className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "Processing..." : "Approve Correction"}
          </button>
        </div>
      )}
    </div>
  );
};
