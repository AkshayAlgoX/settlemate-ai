"use client";

import React, { useState } from "react";
import {
  FlaskConical,
  Play,
  RefreshCw,
  Sparkles,
  CreditCard,
  Percent,
  Clock,
  Copy,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

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
    tag: "REFUND_VARIANCE",
    icon: Sparkles,
    desc: "A ₹20,000 payment settled for ₹18,450 because an un-notified ₹1,550 refund voucher was executed at the gateway.",
  },
  {
    id: "fee-discrepancy",
    name: "Gateway Fee Tier Overcharge",
    tag: "FEE_MISMATCH",
    icon: Percent,
    desc: "Processor billed 2.0% fee (₹200.00) instead of the negotiated contract rate 1.5% (₹150.00), leaving a ₹50.00 variance.",
  },
  {
    id: "chargeback",
    name: "Expired Chargeback Reversal Risk",
    tag: "CHARGEBACK_RISK",
    icon: CreditCard,
    desc: "Chargeback of ₹15,000 filed at T+120 days, exceeding the 90-day dispute SLA window defined by card networks.",
  },
  {
    id: "delayed-settlement",
    name: "Delayed Settlement SLA Breach",
    tag: "SLA_BREACH",
    icon: Clock,
    desc: "Payment captured 5 days ago settled today, breaching the contractual T+1 settlement SLA.",
  },
  {
    id: "duplicate-payment",
    name: "Duplicate Bank Credit Detection",
    tag: "DUPLICATE_CREDIT",
    icon: Copy,
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
      const data = await res.json();
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
      const data = await res.json();
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
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="border border-[#2a2e29] bg-[#0d100d] p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.2em] text-[#a4b58a]">
              <FlaskConical className="h-4 w-4 text-[#a4b58a]" />
              Finance-Ops Scenario Lab
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#e3e1d8]">
              Deterministic Exception Resolution & AI Grounding Testbed
            </h1>
            <p className="mt-1 text-xs text-[#8c9288]">
              Test how SettleMate AI handles real-world financial anomalies: exception detection, advisory AI claim formulation, mechanical non-LLM verification, and Maker/Checker adjustment proposals.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {Object.keys(results).length > 0 && (
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2 border border-[#252a24] bg-[#090b09] hover:bg-[#121611] text-[#8c9288] text-xs font-bold uppercase tracking-wider"
              >
                Reset Lab
              </button>
            )}
            <button
              type="button"
              onClick={runAllScenarios}
              disabled={isRunningAll}
              className="px-6 py-2.5 bg-[#a4b58a] hover:bg-[#b8c99e] text-[#0d100d] text-xs font-bold uppercase tracking-wider flex items-center gap-2 disabled:opacity-50"
            >
              {isRunningAll ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Running All 5 Scenarios...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 fill-current" />
                  Run All Scenarios (5)
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Scenario Cards Grid */}
      <div className="space-y-4">
        {PRESET_SCENARIOS.map((scenario) => {
          const res = results[scenario.id];
          const isLoading = loadingMap[scenario.id] || isRunningAll;
          const isExpanded = expandedMap[scenario.id];
          const Icon = scenario.icon;

          return (
            <div
              key={scenario.id}
              className={`border transition-all ${
                res
                  ? "border-[#3e4d36] bg-[#0d100d]"
                  : "border-[#252a24] bg-[#090b09] hover:border-[#3e4d36]"
              }`}
            >
              <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div className="p-2 border border-[#3e4d36] bg-[#11160f] shrink-0 mt-0.5">
                    <Icon className="h-5 w-5 text-[#a4b58a]" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-[#e3e1d8]">{scenario.name}</h3>
                      <span className="px-2 py-0.5 text-[9px] font-mono font-bold bg-[#141b12] border border-[#2e3a29] text-[#a4b58a]">
                        {scenario.tag}
                      </span>
                    </div>
                    <p className="text-xs text-[#8c9288] mt-1">{scenario.desc}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {res && (
                    <button
                      type="button"
                      onClick={() => toggleExpand(scenario.id)}
                      className="p-2 border border-[#252a24] bg-[#090b09] hover:bg-[#141812] text-[#8c9288] text-xs flex items-center gap-1"
                    >
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      <span className="text-[10px] font-bold uppercase">{isExpanded ? "Collapse" : "Expand"}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => runScenario(scenario.id)}
                    disabled={isLoading}
                    className="px-4 py-2 border border-[#3e4d36] bg-[#11160f] hover:bg-[#182313] text-[#a4b58a] text-xs font-bold uppercase tracking-wider flex items-center gap-2 disabled:opacity-50"
                  >
                    {isLoading ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        Testing...
                      </>
                    ) : (
                      <>
                        <Play className="h-3.5 w-3.5 fill-current" />
                        {res ? "Re-Run Scenario" : "Run Scenario"}
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Expanded Detail Panel */}
              {res && isExpanded && (
                <div className="border-t border-[#252a24] bg-[#060806] p-5 space-y-5">
                  {/* Summary & Metrics */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="p-3 border border-[#252a24] bg-[#0d100d]">
                      <div className="text-[9px] uppercase text-[#687063] font-bold">Auto-Matched</div>
                      <div className="text-xl font-mono font-bold text-[#a4b58a]">{res.summary.autoMatched}</div>
                    </div>
                    <div className="p-3 border border-[#6e2b26] bg-[#1a0f0e]">
                      <div className="text-[9px] uppercase text-[#823a35] font-bold">Exceptions Detected</div>
                      <div className="text-xl font-mono font-bold text-[#d9776f]">{res.summary.exception}</div>
                    </div>
                    <div className="p-3 border border-[#252a24] bg-[#0d100d]">
                      <div className="text-[9px] uppercase text-[#687063] font-bold">Confidence Score</div>
                      <div className="text-xl font-mono font-bold text-[#e3e1d8]">{(res.aiSuggestion.confidenceScore * 100).toFixed(0)}%</div>
                    </div>
                    <div className="p-3 border border-[#3e4d36] bg-[#11160f]">
                      <div className="text-[9px] uppercase text-[#778264] font-bold">Maker / Checker Gate</div>
                      <div className="text-xs font-mono font-bold text-[#a4b58a] mt-1">REQUIRED (Admin)</div>
                    </div>
                  </div>

                  {/* AI Hypothesis & Mechanical Claims */}
                  <div className="border border-[#2e3a29] bg-[#090b09] p-4 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-[#e3e1d8]">
                      <Sparkles className="h-4 w-4 text-[#a4b58a]" />
                      Advisory AI Investigation & Non-LLM Verified Claims
                    </div>

                    <div className="text-xs text-[#a4b58a] font-mono bg-[#11160f] p-2.5 border border-[#252a24]">
                      &ldquo;{res.aiSuggestion.hypothesis}&rdquo;
                    </div>

                    <div className="space-y-2 pt-1">
                      {res.aiSuggestion.claims.map((claim, idx) => (
                        <div key={idx} className="p-2.5 border border-[#1f241d] bg-[#070907] flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs">
                          <div>
                            <div className="font-mono text-[10px] text-[#687063] font-bold">{claim.type}</div>
                            <div className="text-[#e3e1d8]">{claim.claimText}</div>
                            <div className="text-[10px] text-[#8c9288] mt-0.5">{claim.details}</div>
                          </div>
                          <div className="shrink-0 text-right">
                            <span className="px-2 py-0.5 text-[9px] font-mono font-bold bg-[#182614] border border-[#3e5532] text-[#a4b58a]">
                              [PASS] {claim.status}
                            </span>
                            <div className="text-[9px] font-mono text-[#687063] mt-1">{claim.validationCheck}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Proposed Double-Entry Correction */}
                  <div className="border border-[#3e4d36] bg-[#11160f] p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                      <div className="text-[9px] font-bold uppercase tracking-wider text-[#a4b58a]">
                        Recommended Double-Entry Journal Adjustment
                      </div>
                      <div className="text-xs font-mono text-[#e3e1d8] mt-0.5">
                        {res.aiSuggestion.proposedCorrection}
                      </div>
                    </div>
                    <span className="px-3 py-1 bg-[#182614] border border-[#3e5532] text-[10px] font-mono font-bold text-[#a4b58a] shrink-0">
                      Target: {res.aiSuggestion.targetAccount}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
