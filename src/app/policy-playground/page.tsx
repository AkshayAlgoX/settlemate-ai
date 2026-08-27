"use client";

import React, { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import {
  Settings2,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Sliders,
  ShieldCheck,
  Zap,
  ArrowRight,
  TrendingUp,
  Layers,
  Lock,
} from "lucide-react";

interface RecordEvaluation {
  id: string;
  referenceId: string;
  grossAmountPaise: number;
  settledAmountPaise: number;
  discrepancyPaise: number;
  timeDeltaHours: number;
  provider: string;
  method: string;
  description: string;
  baselineDecision: "AUTO_MATCH" | "SUGGESTED_MATCH" | "EXCEPTION";
  baselineRisk: string;
  effectiveDecision: "AUTO_MATCH" | "SUGGESTED_MATCH" | "EXCEPTION";
  effectiveRisk: string;
  effectiveConfidence: number;
  requiresMakerChecker: boolean;
  statusChanged: boolean;
  matchedRules: string[];
  reasons: string[];
}

interface PolicyRunSummary {
  totalRecords: number;
  autoMatched: number;
  suggestedMatches: number;
  exceptions: number;
  matchRatePct: number;
  reclassifiedCount: number;
  baselineAutoMatched: number;
  baselineExceptions: number;
  netMatchRateDeltaPct: number;
}

export default function PolicyPlaygroundPage() {
  const [, startTransition] = useTransition();

  // Policy parameter slider state
  const [tolerancePaise, setTolerancePaise] = useState<number>(100); // ₹1.00
  const [windowHours, setWindowHours] = useState<number>(48); // 48h
  const [materialityPaise, setMaterialityPaise] = useState<number>(500000); // ₹5,000
  const [makerCheckerPaise, setMakerCheckerPaise] = useState<number>(1000000); // ₹10,000

  // Result state
  const [summary, setSummary] = useState<PolicyRunSummary | null>(null);
  const [records, setRecords] = useState<RecordEvaluation[]>([]);
  const [policyHash, setPolicyHash] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    const fetchPolicyEvaluation = async () => {
      try {
        setIsLoading(true);
        const res = await fetch("/api/policy/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            policyOverrides: {
              amountTolerancePaise: tolerancePaise,
              toleranceWindowHours: windowHours,
              materialityThresholdPaise: materialityPaise,
              makerCheckerThresholdPaise: makerCheckerPaise,
            },
          }),
        });

        if (res.ok && isMounted) {
          const data = await res.json();
          setSummary(data.summary);
          setRecords(data.records);
          setPolicyHash(data.effectiveRules?.policyContentHash || "");
        }
      } catch {
        // Fallback error handling
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void fetchPolicyEvaluation();
    return () => {
      isMounted = false;
    };
  }, [tolerancePaise, windowHours, materialityPaise, makerCheckerPaise]);

  const handleResetDefaults = () => {
    startTransition(() => {
      setTolerancePaise(100);
      setWindowHours(48);
      setMaterialityPaise(500000);
      setMakerCheckerPaise(1000000);
    });
  };

  const reclassifiedRecords = records.filter((r) => r.statusChanged);

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      {/* Top Header */}
      <header className="border border-[#2a2e29] bg-[#0d100d] p-6 sm:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#a4b58a]">
              <Settings2 className="h-4 w-4 text-[#a4b58a]" />
              Policy-as-Code Live Simulation
            </div>
            <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-[#e3e1d8]">
              Interactive Policy Playground
            </h1>
            <p className="mt-2 max-w-3xl text-xs sm:text-sm text-[#8c9288]">
              Adjust reconciliation tolerance thresholds, SLA timing windows, and materiality rules in real time. Observe how deterministic Policy-as-Code governs transaction matching without code deployments.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleResetDefaults}
              className="px-4 py-2 border border-[#3e4d36] bg-[#11160f] hover:bg-[#182313] text-[#a4b58a] text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition"
            >
              <RotateCcw className="h-4 w-4" />
              Reset to Defaults
            </button>
            <Link
              href="/verify"
              className="px-4 py-2 bg-[#a4b58a] hover:bg-[#b8c99e] text-[#0d100d] text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition"
            >
              <ShieldCheck className="h-4 w-4" />
              Live Proof Hub
            </Link>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-[#1f241e] pt-4 font-mono text-xs text-[#8c9288]">
          <span>Effective Policy Hash:</span>
          <span className="text-[#a4b58a] font-bold">{policyHash ? policyHash.slice(0, 32) + "..." : "Computing..."}</span>
          <span className="text-[#6c7465]">|</span>
          <span>Sample Dataset: 20 Production Records</span>
        </div>
      </header>

      {/* Interactive Controls & Live KPIs */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Policy Sliders (5 cols) */}
        <div className="lg:col-span-5 border border-[#252a24] bg-[#0d100d] p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-[#1f241e] pb-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#e3e1d8] flex items-center gap-2">
              <Sliders className="h-4 w-4 text-[#a4b58a]" />
              Policy Parameter Controls
            </h2>
            {isLoading && <span className="text-[10px] font-mono text-[#a4b58a] animate-pulse">Evaluating...</span>}
          </div>

          {/* Slider 1: Amount Tolerance */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-[#8c9288]">Amount Variance Tolerance</span>
              <span className="text-[#a4b58a] font-bold">
                ₹{(tolerancePaise / 100).toFixed(2)} ({tolerancePaise} paise)
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={5000} // Up to ₹50.00
              step={10} // 10 paise steps
              value={tolerancePaise}
              onChange={(e) => setTolerancePaise(Number(e.target.value))}
              className="w-full accent-[#a4b58a] bg-[#1a1f18] h-2 rounded cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-[#6c7465] font-mono">
              <span>₹0.00 (Strict 0-Tolerance)</span>
              <span>₹50.00 (Wide Tolerance)</span>
            </div>
          </div>

          {/* Slider 2: Timing Window */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-[#8c9288]">SLA Settlement Window</span>
              <span className="text-[#a4b58a] font-bold">{windowHours} Hours</span>
            </div>
            <input
              type="range"
              min={12}
              max={120}
              step={6}
              value={windowHours}
              onChange={(e) => setWindowHours(Number(e.target.value))}
              className="w-full accent-[#a4b58a] bg-[#1a1f18] h-2 rounded cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-[#6c7465] font-mono">
              <span>12h (Same-Day Strict)</span>
              <span>120h (T+5 Extended)</span>
            </div>
          </div>

          {/* Slider 3: Materiality Threshold */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-[#8c9288]">Materiality Escalation Threshold</span>
              <span className="text-[#a4b58a] font-bold">₹{(materialityPaise / 100).toLocaleString()}</span>
            </div>
            <input
              type="range"
              min={50000} // ₹500
              max={2000000} // ₹20,000
              step={50000}
              value={materialityPaise}
              onChange={(e) => setMaterialityPaise(Number(e.target.value))}
              className="w-full accent-[#a4b58a] bg-[#1a1f18] h-2 rounded cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-[#6c7465] font-mono">
              <span>₹500 (Low Escalation)</span>
              <span>₹20,000 (High Materiality)</span>
            </div>
          </div>

          {/* Slider 4: Maker/Checker Cap */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-[#8c9288]">Maker/Checker Dual-Signoff Trigger</span>
              <span className="text-[#a4b58a] font-bold">₹{(makerCheckerPaise / 100).toLocaleString()}</span>
            </div>
            <input
              type="range"
              min={100000} // ₹1,000
              max={5000000} // ₹50,000
              step={100000}
              value={makerCheckerPaise}
              onChange={(e) => setMakerCheckerPaise(Number(e.target.value))}
              className="w-full accent-[#a4b58a] bg-[#1a1f18] h-2 rounded cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-[#6c7465] font-mono">
              <span>₹1,000 (Strict Dual-Control)</span>
              <span>₹50,000 (Executive Only)</span>
            </div>
          </div>
        </div>

        {/* Right: Live Impact KPIs (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Auto Matched */}
            <div className="border border-[#2e4027] bg-[#0f170c] p-4 space-y-1">
              <div className="text-[10px] font-bold uppercase text-[#a4b58a] flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Auto-Matched
              </div>
              <div className="text-2xl font-bold font-mono text-[#e3e1d8]">
                {summary?.autoMatched ?? 0}
                <span className="text-xs text-[#6c7465] ml-1">/ 20</span>
              </div>
              <div className="text-[11px] font-mono text-[#a4b58a]">{summary?.matchRatePct ?? 0}% Rate</div>
            </div>

            {/* Exceptions */}
            <div className="border border-[#4a2624] bg-[#180e0d] p-4 space-y-1">
              <div className="text-[10px] font-bold uppercase text-[#e06c75] flex items-center gap-1">
                <XCircle className="h-3.5 w-3.5" />
                Exceptions
              </div>
              <div className="text-2xl font-bold font-mono text-[#e3e1d8]">
                {summary?.exceptions ?? 0}
                <span className="text-xs text-[#6c7465] ml-1">/ 20</span>
              </div>
              <div className="text-[11px] font-mono text-[#e06c75]">
                {summary ? ((summary.exceptions / 20) * 100).toFixed(1) : 0}% Excluded
              </div>
            </div>

            {/* Reclassified Shifts */}
            <div className="border border-[#252a24] bg-[#0d100d] p-4 space-y-1">
              <div className="text-[10px] font-bold uppercase text-[#e5c07b] flex items-center gap-1">
                <Zap className="h-3.5 w-3.5" />
                Status Shifts
              </div>
              <div className="text-2xl font-bold font-mono text-[#e3e1d8]">
                {summary?.reclassifiedCount ?? 0}
              </div>
              <div className="text-[11px] font-mono text-[#8c9288]">Records Reclassified</div>
            </div>

            {/* Net Rate Delta */}
            <div className="border border-[#252a24] bg-[#0d100d] p-4 space-y-1">
              <div className="text-[10px] font-bold uppercase text-[#8c9288] flex items-center gap-1">
                <TrendingUp className="h-3.5 w-3.5" />
                Net Match Delta
              </div>
              <div className="text-2xl font-bold font-mono text-[#e3e1d8]">
                {summary && summary.netMatchRateDeltaPct > 0 ? `+${summary.netMatchRateDeltaPct}%` : `${summary?.netMatchRateDeltaPct ?? 0}%`}
              </div>
              <div className="text-[11px] font-mono text-[#6c7465]">vs Baseline Policy</div>
            </div>
          </div>

          {/* Reclassification Alert Box */}
          {reclassifiedRecords.length > 0 ? (
            <div className="border border-[#3e4d36] bg-[#11160f] p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#a4b58a] flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  Live Reclassification Impact ({reclassifiedRecords.length} Records Shifted)
                </h3>
                <span className="text-[10px] font-mono text-[#8c9288]">Policy Dynamic Binding</span>
              </div>

              <div className="space-y-2">
                {reclassifiedRecords.map((r) => (
                  <div
                    key={r.id}
                    className="p-3 border border-[#253320] bg-[#0c120a] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono"
                  >
                    <div>
                      <div className="font-bold text-[#e3e1d8]">
                        {r.referenceId} — {r.description}
                      </div>
                      <div className="text-[11px] text-[#8c9288] mt-0.5">
                        Δ: ₹{(r.discrepancyPaise / 100).toFixed(2)} | Delay: {r.timeDeltaHours}h | {r.reasons.join(", ")}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="px-2 py-0.5 border border-[#4a2624] bg-[#180e0d] text-[#e06c75] text-[10px] font-bold">
                        {r.baselineDecision}
                      </span>
                      <ArrowRight className="h-3 w-3 text-[#a4b58a]" />
                      <span className="px-2 py-0.5 border border-[#3e5532] bg-[#142211] text-[#a4b58a] text-[10px] font-bold">
                        {r.effectiveDecision}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="border border-[#1f241e] bg-[#090b09] p-6 text-center text-xs text-[#8c9288] italic">
              Currently operating at standard baseline parameters. Move the tolerance or timing sliders to trigger real-time transaction reclassifications.
            </div>
          )}
        </div>
      </section>

      {/* Comprehensive 20-Record Evaluation Table */}
      <section className="space-y-4">
        <div className="border-b border-[#242820] pb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[#e3e1d8] flex items-center gap-2">
            <Layers className="h-5 w-5 text-[#a4b58a]" />
            Evaluated Transaction Stream (20 Records)
          </h2>
          <span className="text-[11px] font-mono text-[#8c9288]">
            Policy AST Deterministically Evaluated
          </span>
        </div>

        <div className="overflow-x-auto border border-[#252a24]">
          <table className="w-full text-left text-xs text-[#e3e1d8]">
            <thead className="bg-[#11140f] text-[10px] font-bold uppercase tracking-wider text-[#a4b58a] border-b border-[#252a24]">
              <tr>
                <th className="py-3 px-4">Ref ID</th>
                <th className="py-3 px-4">Gross / Settled</th>
                <th className="py-3 px-4">Discrepancy</th>
                <th className="py-3 px-4">Delay</th>
                <th className="py-3 px-4">Provider</th>
                <th className="py-3 px-4">Baseline</th>
                <th className="py-3 px-4 bg-[#161c13]">Playground Decision</th>
                <th className="py-3 px-4">Maker/Checker</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e231c] bg-[#090b09]">
              {records.map((r) => (
                <tr
                  key={r.id}
                  className={`hover:bg-[#0f130e] transition ${
                    r.statusChanged ? "bg-[#141b11]" : ""
                  }`}
                >
                  <td className="py-3 px-4 font-mono font-bold text-[#f0eee5] whitespace-nowrap">
                    {r.referenceId}
                    {r.statusChanged && (
                      <span className="ml-2 text-[9px] px-1.5 py-0.5 bg-[#a4b58a] text-[#0d100d] font-bold rounded">
                        SHIFTED
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 font-mono text-[#a0a69a] whitespace-nowrap">
                    ₹{(r.grossAmountPaise / 100).toFixed(2)} / ₹{(r.settledAmountPaise / 100).toFixed(2)}
                  </td>
                  <td className="py-3 px-4 font-mono whitespace-nowrap">
                    {r.discrepancyPaise === 0 ? (
                      <span className="text-[#6c7465]">₹0.00</span>
                    ) : (
                      <span className="text-[#e5c07b] font-bold">₹{(r.discrepancyPaise / 100).toFixed(2)}</span>
                    )}
                  </td>
                  <td className="py-3 px-4 font-mono text-[#8c9288] whitespace-nowrap">
                    {r.timeDeltaHours}h
                  </td>
                  <td className="py-3 px-4 text-[#8c9288] text-[11px] whitespace-nowrap">
                    {r.provider} ({r.method})
                  </td>
                  <td className="py-3 px-4 font-mono whitespace-nowrap">
                    <span
                      className={`px-2 py-0.5 border text-[10px] font-bold ${
                        r.baselineDecision === "AUTO_MATCH"
                          ? "border-[#2e4027] bg-[#0f170c] text-[#a4b58a]"
                          : "border-[#4a2624] bg-[#180e0d] text-[#e06c75]"
                      }`}
                    >
                      {r.baselineDecision}
                    </span>
                  </td>
                  <td className="py-3 px-4 bg-[#11170e] font-mono border-l border-[#2e3a28] whitespace-nowrap">
                    <span
                      className={`px-2 py-0.5 border text-[10px] font-bold ${
                        r.effectiveDecision === "AUTO_MATCH"
                          ? "border-[#3e5532] bg-[#142211] text-[#a4b58a]"
                          : "border-[#6e2b26] bg-[#291211] text-[#e06c75]"
                      }`}
                    >
                      {r.effectiveDecision}
                    </span>
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    {r.requiresMakerChecker ? (
                      <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-[#e5c07b]">
                        <Lock className="h-3 w-3" /> REQUIRED
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-[#6c7465]">STANDARD</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
