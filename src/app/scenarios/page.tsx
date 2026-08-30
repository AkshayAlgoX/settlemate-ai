"use client";

import React, { useState } from "react";
import {
  Play,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Badge } from "@/components/ui/badge";

interface ScenarioClaim {
  type: string;
  claimText: string;
  status: "VERIFIED" | "DISPUTED";
  validationCheck: string;
  details: string;
}

interface ScenarioResult {
  scenarioId: string;
  scenarioName: string;
  category: string;
  description: string;
  summary: {
    autoMatched: number;
    suggested: number;
    exception: number;
    total: number;
  };
  exceptions: Array<{
    id: string;
    type: string;
    description: string;
    amountPaise: number;
    formattedAmount: string;
    referenceId: string;
    expectedNetPaise: number;
    actualSettledPaise: number | null;
  }>;
  aiSuggestion: {
    available: boolean;
    confidenceScore: number;
    hypothesis: string;
    claims: ScenarioClaim[];
    proposedCorrection: string;
    targetAccount: string;
    makerCheckerRequired: boolean;
  };
  processedAt: string;
}

const PRESET_SCENARIOS = [
  {
    id: "partial-refund",
    name: "Partial Refund Variance",
    tag: "Refund Variance",
    desc: "A ₹20,000 payment settled for ₹18,450 because an un-notified ₹1,550 refund voucher was executed at the gateway.",
  },
  {
    id: "fee-discrepancy",
    name: "Gateway Fee Tier Overcharge",
    tag: "Fee Mismatch",
    desc: "Processor billed 2.0% fee (₹200.00) instead of the negotiated contract rate 1.5% (₹150.00), leaving a ₹50.00 variance.",
  },
  {
    id: "chargeback",
    name: "Expired Chargeback Reversal Risk",
    tag: "Chargeback Risk",
    desc: "Chargeback of ₹15,000 filed at T+120 days, exceeding the 90-day dispute SLA window defined by card networks.",
  },
  {
    id: "delayed-settlement",
    name: "Delayed Settlement SLA Breach",
    tag: "SLA Breach",
    desc: "Payment captured 5 days ago settled today, breaching the contractual T+1 settlement SLA.",
  },
  {
    id: "duplicate-payment",
    name: "Duplicate Bank Credit Detection",
    tag: "Duplicate Credit",
    desc: "Bank statement contains two separate credit entries of ₹5,000 for a single ₹5,000 order settlement.",
  },
];

export default function ScenariosPage() {
  const [results, setResults] = useState<Record<string, ScenarioResult>>({});
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});
  const [isRunningAll, setIsRunningAll] = useState<boolean>(false);

  const runScenario = async (scenarioId: string) => {
    setLoadingMap((prev) => ({ ...prev, [scenarioId]: true }));
    try {
      const res = await fetch("/api/scenarios/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId }),
      });
      const data = await res.json().catch(() => ({}));
      if (data && data.success && data.scenario) {
        setResults((prev) => ({ ...prev, [scenarioId]: data.scenario }));
        setExpandedMap((prev) => ({ ...prev, [scenarioId]: true }));
      }
    } catch (err) {
      console.error("Scenario execution error:", err);
    } finally {
      setLoadingMap((prev) => ({ ...prev, [scenarioId]: false }));
    }
  };

  const runAllScenarios = async () => {
    setIsRunningAll(true);
    try {
      const res = await fetch("/api/scenarios/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId: "all" }),
      });
      const data = await res.json().catch(() => ({}));
      if (data && data.success && Array.isArray(data.scenarios)) {
        const map: Record<string, ScenarioResult> = {};
        const expand: Record<string, boolean> = {};
        data.scenarios.forEach((s: ScenarioResult) => {
          map[s.scenarioId] = s;
          expand[s.scenarioId] = true;
        });
        setResults(map);
        setExpandedMap(expand);
      }
    } catch (err) {
      console.error("Run all scenarios error:", err);
    } finally {
      setIsRunningAll(false);
    }
  };

  const handleReset = () => {
    setResults({});
    setExpandedMap({});
  };

  const toggleExpand = (scenarioId: string) => {
    setExpandedMap((prev) => ({ ...prev, [scenarioId]: !prev[scenarioId] }));
  };

  return (
    <div className="space-y-10 pb-12">
      {/* Header */}
      <PageHeader
        tag="Scenario Laboratory"
        title="Finance-ops anomaly testbed"
        description="Deterministic exception resolution testbed: exception detection, advisory AI claim formulation, non-LLM verification, and Maker/Checker adjustment proposals."
        badge={<Badge variant="outline">5 Scenarios</Badge>}
        actions={
          <div className="flex items-center gap-2">
            {Object.keys(results).length > 0 && (
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-accent transition"
              >
                <span>Reset</span>
              </button>
            )}
            <button
              type="button"
              onClick={runAllScenarios}
              disabled={isRunningAll}
              className="inline-flex h-8 items-center rounded-md bg-primary text-primary-foreground px-3.5 text-xs font-medium text-primary-foreground hover:bg-[#ffffff] disabled:opacity-50 transition"
            >
              {isRunningAll ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  <span>Running all 5...</span>
                </>
              ) : (
                <span>Run all scenarios (5)</span>
              )}
            </button>
          </div>
        }
      />

      {/* Scenario Cards Grid */}
      <div className="space-y-4">
        <SectionHeader
          title="Pre-configured anomaly scenarios"
          description="Test real-world financial mismatch patterns individually or collectively."
        />

        <div className="space-y-4">
          {PRESET_SCENARIOS.map((scenario) => {
            const res = results[scenario.id];
            const isLoading = loadingMap[scenario.id] || isRunningAll;
            const isExpanded = expandedMap[scenario.id];

            return (
              <div
                key={scenario.id}
                className="rounded-lg border border-border bg-card transition-all overflow-hidden"
              >
                <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-foreground">{scenario.name}</h3>
                      <Badge variant="outline">
                        {scenario.tag}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{scenario.desc}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {res && (
                      <button
                        type="button"
                        onClick={() => toggleExpand(scenario.id)}
                        className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-xs text-muted-foreground hover:text-foreground transition"
                      >
                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        <span>{isExpanded ? "Collapse" : "Expand"}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => runScenario(scenario.id)}
                      disabled={isLoading}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50 transition"
                    >
                      {isLoading ? (
                        <>
                          <RefreshCw className="h-3 w-3 animate-spin" />
                          <span>Testing...</span>
                        </>
                      ) : (
                        <>
                          <Play className="h-3 w-3 fill-current" />
                          <span>{res ? "Re-run" : "Run"}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Expanded Detail Panel */}
                {res && isExpanded && (
                  <div className="border-t border-border bg-background p-5 space-y-4">
                    {/* Summary & Metrics */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="p-3 rounded-md border border-border bg-card space-y-0.5">
                        <div className="text-xs text-muted-foreground">Auto-Matched</div>
                        <div className="text-lg font-mono font-semibold text-foreground">{res.summary.autoMatched}</div>
                      </div>
                      <div className="p-3 rounded-md border border-border bg-card space-y-0.5">
                        <div className="text-xs text-muted-foreground">Exceptions</div>
                        <div className="text-lg font-mono font-semibold text-[#ef4444]">{res.summary.exception}</div>
                      </div>
                      <div className="p-3 rounded-md border border-border bg-card space-y-0.5">
                        <div className="text-xs text-muted-foreground">Confidence</div>
                        <div className="text-lg font-mono font-semibold text-foreground">{(res.aiSuggestion.confidenceScore * 100).toFixed(0)}%</div>
                      </div>
                      <div className="p-3 rounded-md border border-border bg-card space-y-0.5">
                        <div className="text-xs text-muted-foreground">Maker / Checker</div>
                        <div className="text-xs font-mono font-medium text-foreground mt-1">Required (Admin)</div>
                      </div>
                    </div>

                    {/* AI Hypothesis & Mechanical Claims */}
                    <div className="rounded-md border border-border bg-card p-4 space-y-3">
                      <div className="text-xs font-semibold text-foreground">
                        Advisory AI Investigation & Non-LLM Verified Claims
                      </div>

                      <div className="text-xs text-foreground font-mono bg-background p-3 rounded border border-border">
                        &ldquo;{res.aiSuggestion.hypothesis}&rdquo;
                      </div>

                      <div className="space-y-2 pt-1">
                        {res.aiSuggestion.claims.map((claim, idx) => (
                          <div key={idx} className="p-3 rounded border border-border bg-background flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs">
                            <div>
                              <div className="font-mono text-[10px] text-muted-foreground/70 uppercase">{claim.type}</div>
                              <div className="text-foreground font-medium">{claim.claimText}</div>
                              <div className="text-[11px] text-muted-foreground mt-0.5">{claim.details}</div>
                            </div>
                            <div className="shrink-0 text-right">
                              <Badge variant="success">
                                {claim.status}
                              </Badge>
                              <div className="text-[10px] font-mono text-muted-foreground/70 mt-1">{claim.validationCheck}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Proposed Double-Entry Correction */}
                    <div className="rounded-md border border-border bg-card p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div>
                        <div className="text-xs text-muted-foreground">
                          Recommended Double-Entry Journal Adjustment
                        </div>
                        <div className="text-xs font-mono font-semibold text-foreground mt-0.5">
                          {res.aiSuggestion.proposedCorrection}
                        </div>
                      </div>
                      <Badge variant="outline">
                        Target: {res.aiSuggestion.targetAccount}
                      </Badge>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
