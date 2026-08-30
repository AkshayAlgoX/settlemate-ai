"use client";

import React, { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import {
  RotateCcw,
  ArrowRight,
  Lock,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Badge } from "@/components/ui/badge";

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
  const [tolerancePaise, setTolerancePaise] = useState<number>(100);
  const [windowHours, setWindowHours] = useState<number>(48);
  const [materialityPaise, setMaterialityPaise] = useState<number>(500000);
  const [makerCheckerPaise, setMakerCheckerPaise] = useState<number>(1000000);

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
    <div className="space-y-10 pb-12">
      {/* Top Header */}
      <PageHeader
        tag="Policy Engineering"
        title="Interactive policy playground"
        description="Adjust reconciliation tolerance thresholds, SLA timing windows, and materiality rules in real time to observe deterministic Policy-as-Code matching shifts."
        badge={<Badge variant="outline">Live Simulation</Badge>}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetDefaults}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-accent transition"
            >
              <RotateCcw className="h-3 w-3 text-muted-foreground" />
              <span>Reset</span>
            </button>
            <Link
              href="/verify"
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3.5 text-xs font-medium text-primary-foreground hover:bg-[#ffffff] transition"
            >
              <span>Verification Hub</span>
            </Link>
          </div>
        }
      />

      {/* Interactive Controls & Live KPIs */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Policy Sliders (5 cols) */}
        <div className="lg:col-span-5 rounded-lg border border-border bg-card p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <SectionHeader
              title="Parameter controls"
              className="border-b-0 pb-0"
            />
            {isLoading && <span className="text-[11px] font-mono text-muted-foreground">Evaluating...</span>}
          </div>

          {/* Slider 1: Amount Tolerance */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-muted-foreground">Amount Tolerance</span>
              <span className="text-foreground font-semibold">
                ₹{(tolerancePaise / 100).toFixed(2)} ({tolerancePaise} paise)
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={5000}
              step={10}
              value={tolerancePaise}
              onChange={(e) => setTolerancePaise(Number(e.target.value))}
              className="w-full accent-[#ededed] cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground/70 font-mono">
              <span>₹0.00 (Strict)</span>
              <span>₹50.00 (Wide)</span>
            </div>
          </div>

          {/* Slider 2: Timing Window */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-muted-foreground">SLA Window</span>
              <span className="text-foreground font-semibold">{windowHours} Hours</span>
            </div>
            <input
              type="range"
              min={12}
              max={120}
              step={6}
              value={windowHours}
              onChange={(e) => setWindowHours(Number(e.target.value))}
              className="w-full accent-[#ededed] cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground/70 font-mono">
              <span>12h (Same-Day)</span>
              <span>120h (T+5)</span>
            </div>
          </div>

          {/* Slider 3: Materiality Threshold */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-muted-foreground">Materiality Threshold</span>
              <span className="text-foreground font-semibold">₹{(materialityPaise / 100).toLocaleString()}</span>
            </div>
            <input
              type="range"
              min={50000}
              max={2000000}
              step={50000}
              value={materialityPaise}
              onChange={(e) => setMaterialityPaise(Number(e.target.value))}
              className="w-full accent-[#ededed] cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground/70 font-mono">
              <span>₹500</span>
              <span>₹20,000</span>
            </div>
          </div>

          {/* Slider 4: Maker/Checker Cap */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-muted-foreground">Dual-Control Trigger</span>
              <span className="text-foreground font-semibold">₹{(makerCheckerPaise / 100).toLocaleString()}</span>
            </div>
            <input
              type="range"
              min={100000}
              max={5000000}
              step={100000}
              value={makerCheckerPaise}
              onChange={(e) => setMakerCheckerPaise(Number(e.target.value))}
              className="w-full accent-[#ededed] cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground/70 font-mono">
              <span>₹1,000</span>
              <span>₹50,000</span>
            </div>
          </div>

          <div className="pt-2 border-t border-border font-mono text-[11px] text-muted-foreground/70">
            <span>Hash: </span>
            <span className="text-muted-foreground">{policyHash ? policyHash.slice(0, 24) + "..." : "Computing..."}</span>
          </div>
        </div>

        {/* Right: Live Impact KPIs (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg border border-border bg-card p-4 space-y-0.5">
              <div className="text-xs text-muted-foreground">Auto-Matched</div>
              <div className="text-xl font-semibold font-mono text-foreground">
                {summary?.autoMatched ?? 0}
                <span className="text-xs text-muted-foreground/70 ml-1">/ 20</span>
              </div>
              <div className="text-[11px] font-mono text-[#10b981]">{summary?.matchRatePct ?? 0}% Rate</div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4 space-y-0.5">
              <div className="text-xs text-muted-foreground">Exceptions</div>
              <div className="text-xl font-semibold font-mono text-[#ef4444]">
                {summary?.exceptions ?? 0}
                <span className="text-xs text-muted-foreground/70 ml-1">/ 20</span>
              </div>
              <div className="text-[11px] font-mono text-[#ef4444]">
                {summary ? ((summary.exceptions / 20) * 100).toFixed(1) : 0}% Excluded
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4 space-y-0.5">
              <div className="text-xs text-muted-foreground">Status Shifts</div>
              <div className="text-xl font-semibold font-mono text-foreground">
                {summary?.reclassifiedCount ?? 0}
              </div>
              <div className="text-[11px] font-mono text-muted-foreground/70">Reclassified</div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4 space-y-0.5">
              <div className="text-xs text-muted-foreground">Net Delta</div>
              <div className="text-xl font-semibold font-mono text-foreground">
                {summary && summary.netMatchRateDeltaPct > 0 ? `+${summary.netMatchRateDeltaPct}%` : `${summary?.netMatchRateDeltaPct ?? 0}%`}
              </div>
              <div className="text-[11px] font-mono text-muted-foreground/70">vs Baseline</div>
            </div>
          </div>

          {/* Reclassification Alert Box */}
          {reclassifiedRecords.length > 0 ? (
            <div className="rounded-lg border border-border bg-card p-5 space-y-3">
              <SectionHeader
                title={`Reclassification impact (${reclassifiedRecords.length} shifted)`}
                description="Dynamic binding applied"
                className="border-b-0 pb-0"
              />

              <div className="space-y-2">
                {reclassifiedRecords.map((r) => (
                  <div
                    key={r.id}
                    className="p-3 rounded border border-border bg-background flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono"
                  >
                    <div>
                      <div className="font-semibold text-foreground">
                        {r.referenceId} — {r.description}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        Δ: ₹{(r.discrepancyPaise / 100).toFixed(2)} | Delay: {r.timeDeltaHours}h | {r.reasons.join(", ")}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="destructive">
                        {r.baselineDecision}
                      </Badge>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <Badge variant="success">
                        {r.effectiveDecision}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center text-xs text-muted-foreground">
              Operating at baseline parameters. Move sliders to trigger live transaction reclassifications.
            </div>
          )}
        </div>
      </section>

      {/* Comprehensive 20-Record Evaluation Table */}
      <section className="space-y-4">
        <SectionHeader
          title="Transaction evaluation stream"
          description="20 sample records evaluated deterministically against current policy."
        />

        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground">
                  <th className="py-2.5 px-4 font-medium">Ref ID</th>
                  <th className="py-2.5 px-4 font-medium">Gross / Settled</th>
                  <th className="py-2.5 px-4 font-medium">Discrepancy</th>
                  <th className="py-2.5 px-4 font-medium">Delay</th>
                  <th className="py-2.5 px-4 font-medium">Provider</th>
                  <th className="py-2.5 px-4 font-medium">Baseline</th>
                  <th className="py-2.5 px-4 font-medium">Decision</th>
                  <th className="py-2.5 px-4 font-medium">Maker/Checker</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {records.map((r) => (
                  <tr
                    key={r.id}
                    className="hover:bg-accent/40 transition"
                  >
                    <td className="py-3 px-4 font-mono font-semibold text-foreground whitespace-nowrap">
                      {r.referenceId}
                      {r.statusChanged && (
                        <span className="ml-2 text-[10px] px-1.5 py-0.2 bg-primary text-primary-foreground font-sans font-medium rounded">
                          Shifted
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-muted-foreground whitespace-nowrap">
                      ₹{(r.grossAmountPaise / 100).toFixed(2)} / ₹{(r.settledAmountPaise / 100).toFixed(2)}
                    </td>
                    <td className="py-3 px-4 font-mono whitespace-nowrap">
                      {r.discrepancyPaise === 0 ? (
                        <span className="text-muted-foreground/70">₹0.00</span>
                      ) : (
                        <span className="text-foreground font-semibold">₹{(r.discrepancyPaise / 100).toFixed(2)}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-muted-foreground/70 whitespace-nowrap">
                      {r.timeDeltaHours}h
                    </td>
                    <td className="py-3 px-4 text-muted-foreground text-[11px] whitespace-nowrap">
                      {r.provider} ({r.method})
                    </td>
                    <td className="py-3 px-4 font-mono whitespace-nowrap">
                      <Badge variant={r.baselineDecision === "AUTO_MATCH" ? "success" : "destructive"}>
                        {r.baselineDecision}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 font-mono whitespace-nowrap">
                      <Badge variant={r.effectiveDecision === "AUTO_MATCH" ? "success" : "destructive"}>
                        {r.effectiveDecision}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {r.requiresMakerChecker ? (
                        <span className="flex items-center gap-1 text-[11px] font-mono text-foreground">
                          <Lock className="h-3 w-3" /> Required
                        </span>
                      ) : (
                        <span className="text-[11px] font-mono text-muted-foreground/70">Standard</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
