/*
 * SettleMate AI — Milestone 3: CP-SAT Invoice Matching Explainability Card
 *
 * Renders combinatorial split / partial payment matching results with clean,
 * auditor-friendly explainability and zero solver noise.
 */

"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Layers, CheckCircle2, AlertCircle, Clock, Split, ArrowDownRight } from "lucide-react";
import type { InvoiceMatchResponse } from "@/lib/solver/types";

interface InvoiceMatchCardProps {
  match: InvoiceMatchResponse;
  className?: string;
}

export function InvoiceMatchCard({ match, className = "" }: InvoiceMatchCardProps) {
  const isExact = match.status === "EXACT_MATCH";
  const isSplit = match.status === "SPLIT_MATCH";
  const isSplitTol = match.status === "SPLIT_MATCH_WITH_TOLERANCE";
  const isPartial = match.status === "PARTIAL_PAYMENT";
  const isNoMatch = match.status === "NO_FEASIBLE_MATCH";
  const isTimeout = match.status === "SOLVER_TIMEOUT";

  const formattedPayment = `₹${(match.paymentAmountMinor / 100).toLocaleString()}`;
  const formattedSelected = `₹${(match.selectedTotalMinor / 100).toLocaleString()}`;
  const formattedDiff = `₹${(match.differenceMinor / 100).toFixed(2)}`;
  const formattedTol = `±₹${(match.toleranceMinor / 100).toFixed(2)}`;

  return (
    <Card className={`border-border bg-card shadow-xs ${className}`}>
      <CardHeader className="pb-3 border-b border-border/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-semibold tracking-wide uppercase text-muted-foreground flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-primary" />
              Combinatorial Invoice Match
            </CardTitle>
            <Badge variant="outline" className="text-[10px] font-mono">
              CP-SAT
            </Badge>
          </div>

          {(isExact || isSplit) && (
            <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 flex items-center gap-1 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {isExact ? "EXACT MATCH (1:1)" : `EXACT SPLIT (1:${match.selectedInvoiceIds.length})`}
            </Badge>
          )}
          {isSplitTol && (
            <Badge className="bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30 flex items-center gap-1 font-medium">
              <Split className="w-3.5 h-3.5" />
              SPLIT WITH TOLERANCE (1:{match.selectedInvoiceIds.length})
            </Badge>
          )}
          {isPartial && (
            <Badge className="bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30 flex items-center gap-1 font-medium">
              <ArrowDownRight className="w-3.5 h-3.5" />
              PARTIAL PAYMENT
            </Badge>
          )}
          {isNoMatch && (
            <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 flex items-center gap-1 font-medium">
              <AlertCircle className="w-3.5 h-3.5" />
              NO FEASIBLE MATCH
            </Badge>
          )}
          {isTimeout && (
            <Badge className="bg-destructive/15 text-destructive border-destructive/30 flex items-center gap-1 font-medium">
              <Clock className="w-3.5 h-3.5" />
              SOLVER TIMEOUT
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-4 space-y-4 text-xs">
        {/* Key Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-2.5 rounded-lg bg-secondary/50 border border-border/50 space-y-1">
            <div className="text-[11px] text-muted-foreground">Payment Amount</div>
            <div className="font-mono font-medium text-sm text-foreground">{formattedPayment}</div>
            <div className="text-[10px] text-muted-foreground">{match.currency} Minor Units</div>
          </div>

          <div className="p-2.5 rounded-lg bg-secondary/50 border border-border/50 space-y-1">
            <div className="text-[11px] text-muted-foreground">Selected Total</div>
            <div className="font-mono font-medium text-sm text-foreground">{formattedSelected}</div>
            <div className="text-[10px] text-muted-foreground">{match.selectedInvoiceIds.length} Invoice(s) Selected</div>
          </div>

          <div className="p-2.5 rounded-lg bg-secondary/50 border border-border/50 space-y-1">
            <div className="text-[11px] text-muted-foreground">Variance / Diff</div>
            <div className="font-mono font-medium text-sm text-foreground">{formattedDiff}</div>
            <div className="text-[10px] text-muted-foreground">Tolerance: {formattedTol}</div>
          </div>

          <div className="p-2.5 rounded-lg bg-secondary/50 border border-border/50 space-y-1">
            <div className="text-[11px] text-muted-foreground">Solver Engine</div>
            <div className="font-mono font-medium text-sm text-foreground">{match.solverStatus}</div>
            <div className="text-[10px] text-muted-foreground">{match.solveDurationMs}ms Latency</div>
          </div>
        </div>

        {/* Selected Invoices Badges */}
        {match.selectedInvoiceIds.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[11px] font-medium text-muted-foreground">Selected Invoice Identifiers:</div>
            <div className="flex flex-wrap gap-1.5">
              {match.selectedInvoiceIds.map((id) => (
                <Badge key={id} variant="secondary" className="font-mono text-xs px-2 py-0.5">
                  {id}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Explainability Callout */}
        <div className="p-3 rounded-lg border border-border bg-background/80 space-y-1">
          <div className="font-medium text-foreground text-xs flex items-center justify-between">
            <span>Optimization Summary</span>
            <span className="text-[10px] font-mono text-muted-foreground">
              {match.candidatesConsideredCount} Candidate(s) Evaluated
            </span>
          </div>
          <p className="text-muted-foreground leading-relaxed text-[11px]">
            {match.verificationReason}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
