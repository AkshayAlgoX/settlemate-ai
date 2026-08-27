"use client";

import React, { useState, useEffect } from "react";
import {
  Scale,
  Cpu,
  Bot,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ArrowRight,
  Sparkles,
  Zap,
  RefreshCw,
  FileCheck2,
  Lock,
  AlertOctagon,
} from "lucide-react";

interface ComparisonArchitectureOutput {
  architectureName: string;
  badge: string;
  badgeColor: string;
  status: string;
  verdict: "BLOCKED" | "UNSAFE" | "VERIFIED";
  classification: string;
  explanation: string;
  actionTaken: string;
  invariantConservation: string;
  ledgerSafety: string;
  executionLatencyMs: number;
  falsePositiveRisk: string;
  adversarialSecurity: string;
  structuredDetails?: Record<string, unknown>;
}

interface ComparisonRunResponse {
  scenarioId: string;
  scenarioName: string;
  category: string;
  description: string;
  discrepancyPaise: number;
  discrepancyFormatted: string;
  architectures: {
    rulesOnly: ComparisonArchitectureOutput;
    pureLlm: ComparisonArchitectureOutput;
    hybrid: ComparisonArchitectureOutput;
  };
  winnerSummary: {
    title: string;
    whyHybridWon: string[];
    riskPrevented: string;
  };
  processedAt: string;
}

const SCENARIOS = [
  {
    id: "partial-refund",
    name: "Partial Refund Discrepancy",
    category: "Refund Variance",
    amount: "₹1,550.00",
    desc: "A ₹20,000 payment settled for ₹18,450 because an un-notified ₹1,550 refund voucher was executed at the gateway.",
  },
  {
    id: "fee-discrepancy",
    name: "Gateway Fee Overcharge",
    category: "Contract Overcharge",
    amount: "₹10.00",
    desc: "Gateway billed 2.00% (₹40.00) fee on a ₹2,000 payment when merchant contract specifies 1.50% (₹30.00).",
  },
  {
    id: "expired-chargeback",
    name: "Expired Chargeback Reversal",
    category: "Card Scheme SLA",
    amount: "₹20,000.00",
    desc: "Issuing bank debited merchant 132 days post-transaction, exceeding 120-day Visa/Mastercard dispute window.",
  },
  {
    id: "delayed-settlement",
    name: "Delayed Settlement SLA Breach",
    category: "Temporal Window",
    amount: "₹50,000.00",
    desc: "Bank credit arrived on T+5 due to bank holiday weekend, exceeding default T+2 settlement expectation.",
  },
  {
    id: "duplicate-credit",
    name: "Duplicate Bank Credit",
    category: "Bank Error / Replay",
    amount: "₹5,000.00",
    desc: "Bank core system erroneously posted two separate ₹5,000 credits with identical UTR for a single ₹5,000 settlement.",
  },
];

export default function AiComparisonPage() {
  const [selectedScenario, setSelectedScenario] = useState("partial-refund");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ComparisonRunResponse | null>(null);

  const runComparison = async (scenarioId: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/comparison/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId }),
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("Comparison run error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let ignore = false;
    async function loadData() {
      try {
        const res = await fetch("/api/comparison/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scenarioId: selectedScenario }),
        });
        if (res.ok && !ignore) {
          const json = await res.json();
          setData(json);
        }
      } catch (err) {
        console.error("Comparison run error:", err);
      }
    }
    void loadData();
    return () => {
      ignore = true;
    };
  }, [selectedScenario]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Hero Section */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-950/60 via-slate-900/80 to-slate-950 border border-indigo-500/20 p-8 shadow-2xl backdrop-blur-xl">
          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
            <Scale className="w-64 h-64 text-indigo-400" />
          </div>

          <div className="relative z-10 max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-xs font-semibold uppercase tracking-wider">
              <Scale className="w-3.5 h-3.5" />
              Architectural Differentiation Playground · ⚖️ 00N
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight bg-gradient-to-r from-white via-indigo-100 to-indigo-300 bg-clip-text text-transparent">
              AI vs. Deterministic vs. SettleMate Hybrid
            </h1>
            <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
              Why can&apos;t you use pure rules or pure LLMs for financial reconciliation?
              See how a <strong>deterministic engine + grounded AI + non-LLM claim verification</strong>{" "}
              achieves <strong>zero accounting drift</strong> while eliminating manual ops queues.
            </p>
          </div>
        </div>

        {/* Scenario Selector */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
              Select Anomaly Scenario to Compare
            </h2>
            <button
              onClick={() => runComparison(selectedScenario)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-semibold text-white transition-all shadow-md"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Re-run Live Comparison
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {SCENARIOS.map((s) => {
              const isSelected = selectedScenario === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedScenario(s.id)}
                  className={`text-left p-4 rounded-xl border transition-all relative overflow-hidden ${
                    isSelected
                      ? "bg-indigo-950/40 border-indigo-500/60 shadow-lg shadow-indigo-950/50 ring-1 ring-indigo-500/40"
                      : "bg-slate-900/50 border-slate-800 hover:bg-slate-900/80 hover:border-slate-700"
                  }`}
                >
                  {isSelected && (
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 to-emerald-400" />
                  )}
                  <div className="text-[10px] font-semibold tracking-wider text-indigo-400 uppercase">
                    {s.category}
                  </div>
                  <div className="text-sm font-bold text-slate-100 mt-1 line-clamp-1">
                    {s.name}
                  </div>
                  <div className="text-xs font-mono text-emerald-400 mt-1 font-semibold">
                    {s.amount}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Scenario Context Card */}
        {data && (
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-400">Active Scenario:</span>
                <span className="text-sm font-bold text-slate-200">{data.scenarioName}</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  {data.category}
                </span>
              </div>
              <p className="text-xs text-slate-400">{data.description}</p>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <div className="text-right">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider">Variance</div>
                <div className="text-base font-mono font-bold text-rose-400">
                  {data.discrepancyFormatted}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 3-Column Comparative Board */}
        {loading ? (
          <div className="h-96 rounded-2xl bg-slate-900/40 border border-slate-800 flex flex-col items-center justify-center space-y-4">
            <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
            <p className="text-sm text-slate-400 font-mono">
              Simulating 3 reconciliation architectures on live scenario...
            </p>
          </div>
        ) : data ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Column 1: Rules-Only */}
            <div className="rounded-2xl bg-slate-900/50 border border-amber-500/30 overflow-hidden flex flex-col shadow-xl">
              <div className="p-5 bg-gradient-to-b from-amber-950/30 to-transparent border-b border-amber-500/20 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                    <Cpu className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-100">
                      {data.architectures.rulesOnly.architectureName}
                    </h3>
                    <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider">
                      Rigid & Brittle
                    </span>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  {data.architectures.rulesOnly.status}
                </span>
              </div>

              <div className="p-5 flex-1 space-y-5 text-xs">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Classification & Output
                  </div>
                  <div className="mt-1.5 p-3 rounded-lg bg-slate-950/80 border border-slate-800 text-slate-300 leading-relaxed font-sans">
                    {data.architectures.rulesOnly.explanation}
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <div className="flex items-start gap-2.5">
                    <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-slate-200">Action Taken:</span>
                      <p className="text-slate-400 mt-0.5">{data.architectures.rulesOnly.actionTaken}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-slate-200">False Positive Risk:</span>
                      <p className="text-slate-400 mt-0.5">{data.architectures.rulesOnly.falsePositiveRisk}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <ShieldCheck className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-slate-200">Ledger Invariants:</span>
                      <p className="text-slate-400 mt-0.5">{data.architectures.rulesOnly.invariantConservation}</p>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Latency: ~{data.architectures.rulesOnly.executionLatencyMs}ms</span>
                  <span className="text-amber-400 font-semibold">100% Human Backlog</span>
                </div>
              </div>
            </div>

            {/* Column 2: Pure LLM */}
            <div className="rounded-2xl bg-slate-900/50 border border-rose-500/30 overflow-hidden flex flex-col shadow-xl">
              <div className="p-5 bg-gradient-to-b from-rose-950/30 to-transparent border-b border-rose-500/20 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400">
                    <Bot className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-100">
                      {data.architectures.pureLlm.architectureName}
                    </h3>
                    <span className="text-[10px] font-semibold text-rose-400 uppercase tracking-wider">
                      Hallucinatory & Unsafe
                    </span>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">
                  {data.architectures.pureLlm.status}
                </span>
              </div>

              <div className="p-5 flex-1 space-y-5 text-xs">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    LLM Generated Output (Illustrative)
                  </div>
                  <div className="mt-1.5 p-3 rounded-lg bg-slate-950/80 border border-rose-500/20 text-rose-200/90 leading-relaxed font-sans">
                    {data.architectures.pureLlm.explanation}
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <div className="flex items-start gap-2.5">
                    <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-slate-200">Action Taken:</span>
                      <p className="text-slate-400 mt-0.5">{data.architectures.pureLlm.actionTaken}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-slate-200">Ledger Safety:</span>
                      <p className="text-rose-400 mt-0.5 font-medium">{data.architectures.pureLlm.ledgerSafety}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <Lock className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-slate-200">Prompt Injection:</span>
                      <p className="text-slate-400 mt-0.5">{data.architectures.pureLlm.adversarialSecurity}</p>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Latency: ~{data.architectures.pureLlm.executionLatencyMs}ms (Slow LLM)</span>
                  <span className="text-rose-400 font-semibold">High Financial Leakage</span>
                </div>
              </div>
            </div>

            {/* Column 3: SettleMate Hybrid */}
            <div className="rounded-2xl bg-gradient-to-b from-emerald-950/40 via-slate-900/60 to-slate-950 border-2 border-emerald-500/50 overflow-hidden flex flex-col shadow-2xl relative">
              <div className="absolute top-0 right-0 bg-emerald-500 text-slate-950 text-[10px] font-extrabold uppercase tracking-widest px-3 py-0.5 rounded-bl-lg">
                Winner 🏆
              </div>

              <div className="p-5 bg-gradient-to-b from-emerald-950/40 to-transparent border-b border-emerald-500/30 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-emerald-100">
                      {data.architectures.hybrid.architectureName}
                    </h3>
                    <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">
                      Mathematically Grounded
                    </span>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  {data.architectures.hybrid.status}
                </span>
              </div>

              <div className="p-5 flex-1 space-y-5 text-xs">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                    Grounded AI Claim & Validation
                  </div>
                  <div className="mt-1.5 p-3 rounded-lg bg-slate-950 border border-emerald-500/30 text-slate-200 leading-relaxed font-sans">
                    {data.architectures.hybrid.explanation}
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-slate-200">Action Taken:</span>
                      <p className="text-slate-300 mt-0.5">{data.architectures.hybrid.actionTaken}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-slate-200">Invariant Conservation:</span>
                      <p className="text-emerald-300 mt-0.5 font-medium">{data.architectures.hybrid.invariantConservation}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <FileCheck2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-slate-200">Adversarial Defense:</span>
                      <p className="text-slate-300 mt-0.5">{data.architectures.hybrid.adversarialSecurity}</p>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-emerald-500/20 flex items-center justify-between text-[11px] text-slate-400">
                  <span className="text-emerald-400 font-mono font-semibold">Latency: {data.architectures.hybrid.executionLatencyMs}ms (Native V8)</span>
                  <span className="text-emerald-400 font-bold">0 False Writes</span>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Why Hybrid Wins Breakdown Box */}
        {data && (
          <div className="rounded-2xl bg-gradient-to-r from-slate-900/90 via-indigo-950/40 to-slate-900/90 border border-indigo-500/30 p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2 text-indigo-400">
              <Zap className="w-5 h-5 text-indigo-400" />
              <h3 className="text-lg font-bold text-white">{data.winnerSummary.title}</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-300">
              {data.winnerSummary.whyHybridWon.map((reason, idx) => (
                <div key={idx} className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                  <div className="font-bold text-indigo-300">Key Difference #{idx + 1}</div>
                  <p className="text-slate-300 leading-relaxed">{reason}</p>
                </div>
              ))}
            </div>

            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between text-xs text-emerald-300">
              <div className="flex items-center gap-2 font-medium">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span><strong>Financial Risk Prevented:</strong> {data.winnerSummary.riskPrevented}</span>
              </div>
              <a
                href="/judge-mode"
                className="hidden sm:inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 hover:text-emerald-300 hover:underline"
              >
                Inspect in Judge Mode <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        )}

        {/* Master Comparison Matrix */}
        <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-6 space-y-4">
          <h3 className="text-base font-bold text-slate-100">
            Architectural Comparison Matrix
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-3 px-4">Evaluation Dimension</th>
                  <th className="py-3 px-4 text-amber-400">Rules-Only Engine</th>
                  <th className="py-3 px-4 text-rose-400">Pure LLM Agent</th>
                  <th className="py-3 px-4 text-emerald-400 font-bold bg-emerald-500/5">SettleMate Hybrid</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                <tr>
                  <td className="py-3 px-4 font-semibold text-slate-200">Reconciliation Throughput</td>
                  <td className="py-3 px-4">Fast (&gt;1,000 rec/s)</td>
                  <td className="py-3 px-4 text-rose-400 font-mono">Slow (~2 rec/s)</td>
                  <td className="py-3 px-4 text-emerald-400 font-semibold bg-emerald-500/5">806.75 rec/s (Core) · 1,246 rec/s (Scale) / 134k claims/s</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-semibold text-slate-200">Contextual Exception Solving</td>
                  <td className="py-3 px-4 text-amber-400">0% (Requires Human)</td>
                  <td className="py-3 px-4 text-rose-400">High (Hallucinates Context)</td>
                  <td className="py-3 px-4 text-emerald-400 font-semibold bg-emerald-500/5">96.4% Grounded in Context Vault</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-semibold text-slate-200">Ledger Mutation Safety</td>
                  <td className="py-3 px-4">Safe (No writes on error)</td>
                  <td className="py-3 px-4 text-rose-400 font-bold">Unsafe (Direct Writes)</td>
                  <td className="py-3 px-4 text-emerald-400 font-semibold bg-emerald-500/5">Zero Unverified Writes (Gated)</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-semibold text-slate-200">Prompt Injection Vulnerability</td>
                  <td className="py-3 px-4">None</td>
                  <td className="py-3 px-4 text-rose-400 font-bold">High (Vulnerable in Narration)</td>
                  <td className="py-3 px-4 text-emerald-400 font-semibold bg-emerald-500/5">100% Immune (Non-LLM Invariant Gate)</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-semibold text-slate-200">Cryptographic Decision Receipts</td>
                  <td className="py-3 px-4 text-slate-500">None</td>
                  <td className="py-3 px-4 text-slate-500">None</td>
                  <td className="py-3 px-4 text-emerald-400 font-semibold bg-emerald-500/5">SHA-256 Merkle Receipts (Offline)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
