"use client";

import React, { useState, useMemo } from "react";
import {
  TrendingUp,
  DollarSign,
  Clock,
  Users,
  ShieldCheck,
  ArrowUpRight,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  BarChart3,
  Percent,
} from "lucide-react";
import { calculateBusinessImpact } from "@/lib/business-impact/calculator";

export default function BusinessImpactPage() {
  const [volume, setVolume] = useState<number>(500000);
  const [exceptionRate, setExceptionRate] = useState<number>(5.0);
  const [reviewTime, setReviewTime] = useState<number>(12);
  const [hourlyWage, setHourlyWage] = useState<number>(45);
  const [currency, setCurrency] = useState<"USD" | "INR">("USD");

  const symbol = currency === "USD" ? "$" : "₹";

  const results = useMemo(() => {
    return calculateBusinessImpact({
      monthlyTransactionVolume: volume,
      baselineExceptionRatePct: exceptionRate,
      manualReviewTimeMinutes: reviewTime,
      analystHourlyCost: hourlyWage * (currency === "INR" ? 80 : 1),
    });
  }, [volume, exceptionRate, reviewTime, hourlyWage, currency]);

  const formatCurrency = (val: number) => {
    if (currency === "USD") {
      return `$${val.toLocaleString("en-US")}`;
    }
    return `₹${val.toLocaleString("en-IN")}`;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header Banner */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-950/60 via-slate-900 to-indigo-950/50 border border-emerald-500/20 p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
                <TrendingUp className="w-3.5 h-3.5" />
                Track 04 Practical Finance-Ops Value · 💼 00P
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
                Business Impact & ROI Calculator
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 max-w-2xl">
                Translate deterministic multi-pass reconciliation, non-LLM claim verification, and zero-drift invariants into tangible labor savings, ROI, and enterprise risk reduction.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setCurrency(currency === "USD" ? "INR" : "USD")}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-all flex items-center gap-2"
              >
                Currency: <span className="text-emerald-400 font-mono">{currency} ({symbol})</span>
              </button>

              <a
                href="/api/report/generate"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
              >
                Export Audit Pack <ArrowUpRight className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>

        {/* 4 Primary Value Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-900/80 border border-emerald-500/30 shadow-lg space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Annualized Cost Saved</span>
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-3xl font-extrabold text-emerald-400 font-mono">
              {formatCurrency(results.annualCostSavings)}
            </div>
            <div className="text-xs text-slate-400">
              <span className="text-emerald-400 font-semibold">{formatCurrency(results.monthlyCostSavings)}</span> / month saved
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-900/80 border border-indigo-500/30 shadow-lg space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Monthly Labor Saved</span>
              <Clock className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-3xl font-extrabold text-indigo-300 font-mono">
              {results.monthlyHoursSaved.toLocaleString()} <span className="text-sm font-normal">hrs</span>
            </div>
            <div className="text-xs text-slate-400">
              <span className="text-indigo-400 font-semibold">{results.annualHoursSaved.toLocaleString()}</span> hrs / year saved
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-900/80 border border-cyan-500/30 shadow-lg space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Analyst FTE Repurposed</span>
              <Users className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-3xl font-extrabold text-cyan-400 font-mono">
              {results.fteRepurposed} <span className="text-sm font-normal">FTEs</span>
            </div>
            <div className="text-xs text-slate-400">
              Shifted to strategic investigations
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-900/80 border border-amber-500/30 shadow-lg space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Automated Resolution</span>
              <Percent className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-3xl font-extrabold text-amber-400 font-mono">
              {results.automatedResolutionRatePct}%
            </div>
            <div className="text-xs text-slate-400">
              Only <span className="text-amber-300 font-semibold">{results.manualReviewRatePct}%</span> need manual review
            </div>
          </div>
        </div>

        {/* Interactive Parameter Controls & Comparison Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Controls Form */}
          <div className="lg:col-span-5 p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-6">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <Sliders className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Enterprise Operating Parameters
              </h2>
            </div>

            {/* Slider 1: Monthly Volume */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-300 font-semibold">Monthly Transaction Volume:</span>
                <span className="font-mono font-bold text-emerald-400">{volume.toLocaleString()} txns</span>
              </div>
              <input
                type="range"
                min="25000"
                max="2000000"
                step="25000"
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>25k (Mid-market)</span>
                <span>500k</span>
                <span>2M (High-scale)</span>
              </div>
            </div>

            {/* Slider 2: Exception Rate */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-300 font-semibold">Historical Exception Rate:</span>
                <span className="font-mono font-bold text-indigo-400">{exceptionRate}% ({results.totalMonthlyExceptions.toLocaleString()} txns)</span>
              </div>
              <input
                type="range"
                min="1.0"
                max="15.0"
                step="0.5"
                value={exceptionRate}
                onChange={(e) => setExceptionRate(Number(e.target.value))}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>1% (Clean)</span>
                <span>5% (Typical)</span>
                <span>15% (Fragmented)</span>
              </div>
            </div>

            {/* Slider 3: Review Time */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-300 font-semibold">Manual Investigation Time / Exception:</span>
                <span className="font-mono font-bold text-cyan-400">{reviewTime} minutes</span>
              </div>
              <input
                type="range"
                min="5"
                max="30"
                step="1"
                value={reviewTime}
                onChange={(e) => setReviewTime(Number(e.target.value))}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>5 mins (Quick)</span>
                <span>12 mins (Standard)</span>
                <span>30 mins (Complex)</span>
              </div>
            </div>

            {/* Slider 4: Hourly Wage */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-300 font-semibold">Finance Ops Analyst Hourly Rate:</span>
                <span className="font-mono font-bold text-amber-400">{formatCurrency(hourlyWage * (currency === "INR" ? 80 : 1))}/hr</span>
              </div>
              <input
                type="range"
                min="20"
                max="120"
                step="5"
                value={hourlyWage}
                onChange={(e) => setHourlyWage(Number(e.target.value))}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>$20/hr</span>
                <span>$45/hr (Avg)</span>
                <span>$120/hr (Senior)</span>
              </div>
            </div>
          </div>

          {/* Value Attribution Breakdown */}
          <div className="lg:col-span-7 space-y-4">
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-emerald-400" />
                  <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                    Official Benchmark Proportions & Impact Lineage
                  </h2>
                </div>
                <span className="text-xs font-mono text-emerald-400">98.1% Accuracy</span>
              </div>

              <div className="space-y-3 text-xs">
                <div className="p-3.5 rounded-xl bg-slate-800/40 border border-slate-700/60 flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <div className="font-bold text-slate-200">
                      Deterministic Multi-Pass Pass-Through (39.2% Auto-Match)
                    </div>
                    <div className="text-slate-400">
                      103 of 263 benchmark transactions match immediately via 1:1, 1:N, and N:1 amount-indexed rules with 0 latency overhead and 0 LLM costs.
                    </div>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-800/40 border border-slate-700/60 flex items-start gap-3">
                  <Sparkles className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <div className="font-bold text-slate-200">
                      Grounded AI Evidence Resolution (52.1% Grounded Autopilot)
                    </div>
                    <div className="text-slate-400">
                      137 of 160 exceptions are resolved automatically by AI agents querying the Context Vault and passing mechanical non-LLM verification gates (134k+ claims/s).
                    </div>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-800/40 border border-slate-700/60 flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <div className="font-bold text-slate-200">
                      Targeted Maker / Checker Escalation (8.7% Human Review)
                    </div>
                    <div className="text-slate-400">
                      Only 23 genuinely ambiguous transactions require human touch, slashing operational backlogs by 91.3%.
                    </div>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 flex items-start gap-3">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <div className="font-bold text-emerald-300">
                      Zero Clerical Error & Invariant Protection Guarantee
                    </div>
                    <div className="text-emerald-400/80">
                      SettleMate eliminates estimated <span className="font-bold text-white font-mono">{results.preventedClericalErrorsMonthly.toLocaleString()}</span> monthly manual entry errors while preserving strict paise-level balance conservation (0 false financial writes).
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
