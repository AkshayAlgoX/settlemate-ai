"use client";

import React, { useState, useMemo } from "react";
import {
  ExternalLink,
} from "lucide-react";
import { calculateBusinessImpact } from "@/lib/business-impact/calculator";
import { Dropdown } from "@/components/ui/dropdown";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Badge } from "@/components/ui/badge";

const CURRENCY_OPTIONS = [
  { value: "USD", label: "USD ($) - US Dollars" },
  { value: "INR", label: "INR (₹) - Indian Rupees" },
];

export default function BusinessImpactPage() {
  const [volume, setVolume] = useState<number>(500000);
  const [exceptionRate, setExceptionRate] = useState<number>(5.0);
  const [reviewTime, setReviewTime] = useState<number>(12);
  const [hourlyWage, setHourlyWage] = useState<number>(45);
  const [currency, setCurrency] = useState<"USD" | "INR">("USD");

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
    <div className="space-y-10 pb-12">
      {/* Header Banner */}
      <PageHeader
        tag="Finance Operations Value"
        title="Business impact & ROI"
        description="Quantifying deterministic reconciliation, non-LLM claim verification, and zero-drift invariants in tangible cost savings and risk reduction."
        badge={<Badge variant="outline">Impact Model</Badge>}
        actions={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Currency:</span>
              <Dropdown
                value={currency}
                onValueChange={(val) => setCurrency(val as "USD" | "INR")}
                options={CURRENCY_OPTIONS}
                triggerClassName="min-w-[140px]"
                data-testid="business-impact-currency-dropdown"
              />
            </div>

            <a
              href="/api/report/generate"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3.5 text-xs font-medium text-primary-foreground hover:bg-[#ffffff] transition"
            >
              <span>Export audit pack</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        }
      />

      {/* 4 Primary Value Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-lg border border-border bg-card space-y-1">
          <div className="text-2xl sm:text-3xl font-semibold font-mono text-foreground">
            {formatCurrency(results.annualCostSavings)}
          </div>
          <div className="text-xs font-medium text-foreground">Annualized cost saved</div>
          <div className="text-[11px] text-muted-foreground/70">
            {formatCurrency(results.monthlyCostSavings)} / month saved
          </div>
        </div>

        <div className="p-5 rounded-lg border border-border bg-card space-y-1">
          <div className="text-2xl sm:text-3xl font-semibold font-mono text-foreground">
            {results.monthlyHoursSaved.toLocaleString()} <span className="text-sm font-normal text-muted-foreground/70">hrs</span>
          </div>
          <div className="text-xs font-medium text-foreground">Monthly labor saved</div>
          <div className="text-[11px] text-muted-foreground/70">
            {results.annualHoursSaved.toLocaleString()} hrs / year saved
          </div>
        </div>

        <div className="p-5 rounded-lg border border-border bg-card space-y-1">
          <div className="text-2xl sm:text-3xl font-semibold font-mono text-foreground">
            {results.fteRepurposed} <span className="text-sm font-normal text-muted-foreground/70">FTEs</span>
          </div>
          <div className="text-xs font-medium text-foreground">Analyst FTE repurposed</div>
          <div className="text-[11px] text-muted-foreground/70">
            Shifted to strategic investigations
          </div>
        </div>

        <div className="p-5 rounded-lg border border-border bg-card space-y-1">
          <div className="text-2xl sm:text-3xl font-semibold font-mono text-foreground">
            {results.automatedResolutionRatePct}%
          </div>
          <div className="text-xs font-medium text-foreground">Automated resolution</div>
          <div className="text-[11px] text-muted-foreground/70">
            Only {results.manualReviewRatePct}% require manual review
          </div>
        </div>
      </div>

      {/* Interactive Parameter Controls & Comparison Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Controls Form */}
        <div className="lg:col-span-5 p-6 rounded-lg border border-border bg-card space-y-6">
          <SectionHeader
            title="Enterprise operating parameters"
          />

          {/* Slider 1: Monthly Volume */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Monthly transaction volume:</span>
              <span className="font-mono font-semibold text-foreground">{volume.toLocaleString()} txns</span>
            </div>
            <input
              type="range"
              min="25000"
              max="2000000"
              step="25000"
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="w-full h-1 bg-[#181818] rounded-none appearance-none cursor-pointer accent-[#ededed]"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground/70 font-mono">
              <span>25k (Mid-market)</span>
              <span>500k</span>
              <span>2M (High-scale)</span>
            </div>
          </div>

          {/* Slider 2: Exception Rate */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Historical exception rate:</span>
              <span className="font-mono font-semibold text-foreground">{exceptionRate}% ({results.totalMonthlyExceptions.toLocaleString()} txns)</span>
            </div>
            <input
              type="range"
              min="1.0"
              max="15.0"
              step="0.5"
              value={exceptionRate}
              onChange={(e) => setExceptionRate(Number(e.target.value))}
              className="w-full h-1 bg-[#181818] rounded-none appearance-none cursor-pointer accent-[#ededed]"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground/70 font-mono">
              <span>1% (Clean)</span>
              <span>5% (Typical)</span>
              <span>15% (Fragmented)</span>
            </div>
          </div>

          {/* Slider 3: Review Time */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Manual investigation time:</span>
              <span className="font-mono font-semibold text-foreground">{reviewTime} minutes</span>
            </div>
            <input
              type="range"
              min="5"
              max="30"
              step="1"
              value={reviewTime}
              onChange={(e) => setReviewTime(Number(e.target.value))}
              className="w-full h-1 bg-[#181818] rounded-none appearance-none cursor-pointer accent-[#ededed]"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground/70 font-mono">
              <span>5 mins (Quick)</span>
              <span>12 mins (Standard)</span>
              <span>30 mins (Complex)</span>
            </div>
          </div>

          {/* Slider 4: Hourly Wage */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Analyst hourly rate:</span>
              <span className="font-mono font-semibold text-foreground">{formatCurrency(hourlyWage * (currency === "INR" ? 80 : 1))}/hr</span>
            </div>
            <input
              type="range"
              min="20"
              max="120"
              step="5"
              value={hourlyWage}
              onChange={(e) => setHourlyWage(Number(e.target.value))}
              className="w-full h-1 bg-[#181818] rounded-none appearance-none cursor-pointer accent-[#ededed]"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground/70 font-mono">
              <span>$20/hr</span>
              <span>$45/hr</span>
              <span>$120/hr</span>
            </div>
          </div>
        </div>

        {/* Value Attribution Breakdown */}
        <div className="lg:col-span-7 space-y-4">
          <div className="p-6 rounded-lg border border-border bg-card space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <SectionHeader
                title="Benchmark proportions & impact lineage"
                className="border-b-0 pb-0"
              />
              <span className="text-xs font-mono text-foreground">98.1% Accuracy</span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3.5 rounded-md border border-border bg-background space-y-0.5">
                <div className="font-medium text-foreground">
                  Deterministic Multi-Pass Pass-Through (39.2% Auto-Match)
                </div>
                <div className="text-muted-foreground">
                  103 of 263 benchmark transactions match immediately via 1:1, 1:N, and N:1 amount-indexed rules with 0 latency overhead and 0 LLM costs.
                </div>
              </div>

              <div className="p-3.5 rounded-md border border-border bg-background space-y-0.5">
                <div className="font-medium text-foreground">
                  Grounded AI Evidence Resolution (52.1% Grounded Autopilot)
                </div>
                <div className="text-muted-foreground">
                  137 of 160 exceptions are resolved automatically by AI agents querying Context Vault and passing mechanical non-LLM verification gates (134k+ claims/s).
                </div>
              </div>

              <div className="p-3.5 rounded-md border border-border bg-background space-y-0.5">
                <div className="font-medium text-foreground">
                  Targeted Maker / Checker Escalation (8.7% Human Review)
                </div>
                <div className="text-muted-foreground">
                  Only 23 genuinely ambiguous transactions require human touch, slashing operational backlogs by 91.3%.
                </div>
              </div>

              <div className="p-3.5 rounded-md border border-border bg-background space-y-0.5">
                <div className="font-medium text-foreground">
                  Zero Clerical Error & Invariant Protection Guarantee
                </div>
                <div className="text-muted-foreground">
                  SettleMate eliminates estimated <span className="font-medium text-foreground font-mono">{results.preventedClericalErrorsMonthly.toLocaleString()}</span> monthly manual entry errors while preserving strict paise-level balance conservation (0 false financial writes).
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
