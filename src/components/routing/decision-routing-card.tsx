/*
 * SettleMate AI — Milestone 2: Confidence x Exposure Decision Routing Card
 *
 * Visualizes the deterministic risk routing decision without representing
 * raw LLM confidence as authority.
 */

"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ShieldCheck, AlertTriangle, XCircle, RefreshCw } from "lucide-react";
import type { RoutingDecisionRecord } from "@/lib/routing/types";

interface DecisionRoutingCardProps {
  record: RoutingDecisionRecord;
  className?: string;
}

export function DecisionRoutingCard({ record, className = "" }: DecisionRoutingCardProps) {
  const isAutoResolve = record.decision === "AUTO_RESOLVE";
  const isHumanReview = record.decision === "HUMAN_REVIEW";
  const isBlocked = record.decision === "BLOCKED";
  const isReinvestigate = record.decision === "REINVESTIGATE";

  const formattedExposure = `₹${(record.normalizedExposurePaise / 100).toLocaleString()}`;
  const confidencePct = `${(record.originalConfidence * 100).toFixed(1)}%`;
  const adjustedConfidencePct = `${(record.adjustedConfidence * 100).toFixed(1)}%`;

  return (
    <Card className={`border-border bg-card shadow-xs ${className}`}>
      <CardHeader className="pb-3 border-b border-border/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
              Deterministic Risk Routing
            </CardTitle>
            <Badge variant="outline" className="text-[10px] font-mono">
              {record.policyVersion}
            </Badge>
          </div>
          {isAutoResolve && (
            <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 flex items-center gap-1 font-medium">
              <ShieldCheck className="w-3.5 h-3.5" />
              AUTO-RESOLVED
            </Badge>
          )}
          {isHumanReview && (
            <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 flex items-center gap-1 font-medium">
              <AlertTriangle className="w-3.5 h-3.5" />
              HUMAN REVIEW REQUIRED
            </Badge>
          )}
          {isBlocked && (
            <Badge className="bg-destructive/15 text-destructive border-destructive/30 flex items-center gap-1 font-medium">
              <XCircle className="w-3.5 h-3.5" />
              BLOCKED
            </Badge>
          )}
          {isReinvestigate && (
            <Badge className="bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30 flex items-center gap-1 font-medium">
              <RefreshCw className="w-3.5 h-3.5" />
              REINVESTIGATE
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-4 space-y-4 text-xs">
        {/* Metric Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="p-2.5 rounded-lg bg-secondary/50 border border-border/50 space-y-1">
            <div className="text-[11px] text-muted-foreground">AI Model Confidence</div>
            <div className="font-mono font-medium text-sm text-foreground flex items-center gap-1.5">
              {confidencePct}
              {record.survivalBonusApplied > 0 && (
                <span className="text-[10px] text-emerald-500 font-sans" title="Adversarial challenge survival bonus">
                  (+{(record.survivalBonusApplied * 100).toFixed(0)}%)
                </span>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground">Adjusted: {adjustedConfidencePct}</div>
          </div>

          <div className="p-2.5 rounded-lg bg-secondary/50 border border-border/50 space-y-1">
            <div className="text-[11px] text-muted-foreground">Adversarial Challenge</div>
            <div className="font-medium text-sm text-foreground">
              {record.challengeStatus === "CHALLENGED_SURVIVED" && (
                <span className="text-emerald-500 font-mono">SURVIVED</span>
              )}
              {record.challengeStatus === "NEVER_CHALLENGED" && (
                <span className="text-muted-foreground font-mono">UNCHECKED</span>
              )}
              {record.challengeStatus === "CHALLENGE_CONFIRMED" && (
                <span className="text-destructive font-mono">CONFIRMED DEFECT</span>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground">Invariants: {record.invariantStatus}</div>
          </div>

          <div className="p-2.5 rounded-lg bg-secondary/50 border border-border/50 space-y-1">
            <div className="text-[11px] text-muted-foreground">Financial Exposure</div>
            <div className="font-mono font-medium text-sm text-foreground">{formattedExposure}</div>
            <div className="text-[10px] font-mono uppercase text-muted-foreground">
              Band: <span className="text-foreground font-semibold">{record.exposureBand}</span>
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-secondary/50 border border-border/50 space-y-1">
            <div className="text-[11px] text-muted-foreground">Deterministic Risk</div>
            <div className="font-mono font-medium text-sm text-foreground">
              {record.routingRisk.toFixed(4)}
            </div>
            <div className="text-[10px] text-muted-foreground">
              Factor: {(record.exposureFactor * 100).toFixed(1)}%
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-secondary/50 border border-border/50 space-y-1">
            <div className="text-[11px] text-muted-foreground">Policy Threshold</div>
            <div className="font-mono font-medium text-sm text-foreground">
              {record.threshold.toFixed(2)}
            </div>
            <div className="text-[10px] text-muted-foreground">
              Max Risk Allowed
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-secondary/50 border border-border/50 space-y-1">
            <div className="text-[11px] text-muted-foreground">Evidence & Proof</div>
            <div className="font-mono text-xs truncate text-foreground" title={record.recordHash}>
              {record.recordHash.slice(0, 12)}…
            </div>
            <div className="text-[10px] text-muted-foreground">
              {record.evidenceIds.length} Verified Evidence ID(s)
            </div>
          </div>
        </div>

        {/* Explainability Callout */}
        <div className="p-3 rounded-lg border border-border bg-background/80 space-y-1">
          <div className="font-medium text-foreground text-xs flex items-center justify-between">
            <span>Why this routing decision?</span>
            <span className="text-[10px] font-mono text-muted-foreground">
              Rule: Deterministic Confidence x Exposure Policy
            </span>
          </div>
          <p className="text-muted-foreground leading-relaxed text-[11px]">
            {record.decisionReason}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
