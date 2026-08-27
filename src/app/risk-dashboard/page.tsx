"use client";

/*
 * SettleMate AI — Risk & Exposure Command Center (/risk-dashboard)
 *
 * A finance-controller view that aggregates every unresolved reconciliation
 * exception into a single real-time exposure picture: total amount at risk,
 * high-risk count, tolerance-stacking exposure, and a 0–100 risk score, plus a
 * category-grouped exception table with root cause + recommended action.
 *
 * Data comes from POST /api/risk/exposure (combined Scenario Lab dataset by
 * default, or a stored batch by id). This page is presentation-only: all money
 * arrives pre-formatted from the server (exact integer paise) and every derived
 * number here is a plain count — no floating-point money math on the client.
 */

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  RefreshCw,
  Download,
  ShieldAlert,
  Layers,
  Gauge,
  IndianRupee,
  Clock,
  Copy,
  Globe,
  BookOpen,
} from "lucide-react";

type RiskCategory = "HIGH" | "MEDIUM" | "LOW";
type RiskBand = "LOW" | "MODERATE" | "ELEVATED" | "CRITICAL";

interface ClassifiedException {
  id: string;
  type: string;
  paymentId: string;
  variancePaise: number;
  varianceFormatted: string;
  riskLevel: RiskCategory;
  family: string;
  rootCause: string;
  recommendedAction: string;
  playbookType: string;
}

interface CategoryBucket {
  count: number;
  amountPaise: number;
  amountFormatted: string;
}

interface RiskReport {
  totals: { unresolvedCount: number; unresolvedAmountPaise: number; unresolvedAmountFormatted: string };
  byCategory: Record<RiskCategory, CategoryBucket>;
  toleranceStacking: {
    smallVarianceCount: number;
    smallVarianceCapPaise: number;
    exposurePaise: number;
    exposureFormatted: string;
    breached: boolean;
    reason: string;
  };
  slaBreaches: { count: number; amountAffectedPaise: number; amountAffectedFormatted: string };
  duplicateCreditRisks: { count: number; amountPaise: number; amountFormatted: string };
  crossCurrencyRisks: { count: number; amountPaise: number; amountFormatted: string };
  riskScore: number;
  riskBand: RiskBand;
  scoreBreakdown: { severity: number; amount: number; count: number; stacking: number };
  exceptions: ClassifiedException[];
}

interface RiskResponse {
  success: boolean;
  source: "batch" | "combined-scenarios";
  batchId: string | null;
  datasetLabel: string;
  scenarioCount?: number;
  generatedAt: string;
  report: RiskReport;
}

const CATEGORY_ORDER: RiskCategory[] = ["HIGH", "MEDIUM", "LOW"];

/** Olive/amber/red styling for a risk band or per-exception category. */
function bandStyle(band: RiskBand | RiskCategory): { text: string; border: string; bg: string } {
  switch (band) {
    case "CRITICAL":
    case "HIGH":
      return { text: "text-[#d9776f]", border: "border-[#6e2b26]", bg: "bg-[#1a0f0e]" };
    case "ELEVATED":
    case "MEDIUM":
      return { text: "text-[#d3a24b]", border: "border-[#5c4a1d]", bg: "bg-[#17120633]" };
    case "MODERATE":
      return { text: "text-[#a4b58a]", border: "border-[#3e4d36]", bg: "bg-[#11160f]" };
    default:
      return { text: "text-[#8c9288]", border: "border-[#252a24]", bg: "bg-[#0d100d]" };
  }
}

function scoreArc(score: number): string {
  if (score >= 75) return "#d9776f";
  if (score >= 50) return "#d3a24b";
  if (score >= 25) return "#a4b58a";
  return "#687063";
}

/** Fetch + validate the exposure report. No React state — callers own the state. */
async function fetchExposure(): Promise<RiskResponse> {
  const res = await fetch("/api/risk/exposure", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json?.error?.message || `Request failed (${res.status})`);
  }
  return json as RiskResponse;
}

export default function RiskDashboardPage() {
  const [data, setData] = useState<RiskResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const runAnalysis = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchExposure());
    } catch (err) {
      setError((err as Error).message || "Failed to compute risk exposure.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load. setState happens only in the async .then/.catch/.finally
  // callbacks (never synchronously in the effect body), so this stays clear of
  // react-hooks/set-state-in-effect; `loading` already defaults to true.
  useEffect(() => {
    let active = true;
    fetchExposure()
      .then((d) => {
        if (active) setData(d);
      })
      .catch((err) => {
        if (active) setError((err as Error).message || "Failed to compute risk exposure.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const exportReport = useCallback(() => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = data.generatedAt.replace(/[:.]/g, "-");
    a.href = url;
    a.download = `settlemate-risk-report-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [data]);

  const report = data?.report;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="border border-[#2a2e29] bg-[#0d100d] p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.2em] text-[#a4b58a]">
              <AlertTriangle className="h-4 w-4 text-[#a4b58a]" />
              Risk &amp; Exposure Command Center
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#e3e1d8]">
              Real-Time Financial Risk &amp; Unresolved Exposure
            </h1>
            <p className="mt-1 max-w-3xl text-xs text-[#8c9288]">
              Aggregated view of unresolved reconciliation exceptions, tolerance-stacking breaches, and exception
              severity — scored deterministically in exact integer paise. Use it to triage where the money is at risk
              and which controller action clears it fastest.
            </p>
            {data && (
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-mono text-[#687063]">
                <span>
                  SOURCE: <span className="text-[#a4b58a]">{data.datasetLabel}</span>
                </span>
                <span>
                  GENERATED: <span className="text-[#a4b58a]">{new Date(data.generatedAt).toLocaleString()}</span>
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={exportReport}
              disabled={!data || loading}
              className="flex items-center gap-2 border border-[#252a24] bg-[#090b09] px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-[#8c9288] hover:bg-[#121611] disabled:opacity-40"
            >
              <Download className="h-4 w-4" />
              Export Risk Report
            </button>
            <button
              type="button"
              onClick={runAnalysis}
              disabled={loading}
              className="flex items-center gap-2 bg-[#a4b58a] px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-[#0d100d] hover:bg-[#b8c99e] disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Analyzing…
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Run Fresh Analysis
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="border border-[#6e2b26] bg-[#1a0f0e] p-4 text-xs font-mono text-[#d9776f]">
          Risk analysis failed: {error}
        </div>
      )}

      {loading && !report && (
        <div className="flex items-center justify-center gap-3 border border-[#252a24] bg-[#090b09] p-16 text-sm text-[#8c9288]">
          <RefreshCw className="h-5 w-5 animate-spin text-[#a4b58a]" />
          Computing aggregated risk exposure…
        </div>
      )}

      {report && (
        <>
          {/* Primary KPI cards */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* Total Unresolved Amount */}
            <div className="border border-[#252a24] bg-[#0d100d] p-5">
              <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-wider text-[#687063]">
                <IndianRupee className="h-3.5 w-3.5" />
                Total Unresolved Amount
              </div>
              <div className="mt-2 font-mono text-2xl font-bold text-[#e3e1d8]">
                {report.totals.unresolvedAmountFormatted}
              </div>
              <div className="mt-1 text-[10px] text-[#687063]">
                across {report.totals.unresolvedCount} unresolved exception
                {report.totals.unresolvedCount === 1 ? "" : "s"}
              </div>
            </div>

            {/* High-Risk Exceptions */}
            <div className={`border p-5 ${bandStyle("HIGH").border} ${bandStyle("HIGH").bg}`}>
              <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-wider text-[#823a35]">
                <ShieldAlert className="h-3.5 w-3.5" />
                High-Risk Exceptions
              </div>
              <div className="mt-2 font-mono text-2xl font-bold text-[#d9776f]">{report.byCategory.HIGH.count}</div>
              <div className="mt-1 text-[10px] text-[#8c7370]">
                {report.byCategory.HIGH.amountFormatted} &middot; variance &gt; ₹50,000
              </div>
            </div>

            {/* Tolerance Stacking Exposure */}
            <div
              className={`border p-5 ${
                report.toleranceStacking.breached ? `${bandStyle("HIGH").border} ${bandStyle("HIGH").bg}` : "border-[#252a24] bg-[#0d100d]"
              }`}
            >
              <div
                className={`flex items-center gap-2 text-[9px] font-bold uppercase tracking-wider ${
                  report.toleranceStacking.breached ? "text-[#823a35]" : "text-[#687063]"
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                Tolerance Stacking Exposure
              </div>
              <div
                className={`mt-2 font-mono text-2xl font-bold ${
                  report.toleranceStacking.breached ? "text-[#d9776f]" : "text-[#e3e1d8]"
                }`}
              >
                {report.toleranceStacking.exposureFormatted}
              </div>
              <div className="mt-1 text-[10px] text-[#687063]">
                {report.toleranceStacking.smallVarianceCount} small variance
                {report.toleranceStacking.smallVarianceCount === 1 ? "" : "s"} ·{" "}
                {report.toleranceStacking.breached ? (
                  <span className="text-[#d9776f]">BREACHED</span>
                ) : (
                  <span className="text-[#a4b58a]">within tolerance</span>
                )}
              </div>
            </div>

            {/* Overall Risk Score */}
            <div className={`border p-5 ${bandStyle(report.riskBand).border} ${bandStyle(report.riskBand).bg}`}>
              <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-wider text-[#687063]">
                <Gauge className="h-3.5 w-3.5" />
                Overall Risk Score
              </div>
              <div className="mt-2 flex items-end gap-2">
                <span className="font-mono text-3xl font-bold" style={{ color: scoreArc(report.riskScore) }}>
                  {report.riskScore}
                </span>
                <span className="mb-1 text-[10px] font-mono text-[#687063]">/ 100</span>
              </div>
              {/* Score bar */}
              <div className="mt-2 h-1.5 w-full overflow-hidden bg-[#1c211a]">
                <div
                  className="h-full transition-all"
                  style={{ width: `${report.riskScore}%`, backgroundColor: scoreArc(report.riskScore) }}
                />
              </div>
              <div className="mt-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: scoreArc(report.riskScore) }}>
                {report.riskBand}
              </div>
            </div>
          </div>

          {/* Secondary risk signals */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SignalCard icon={Clock} label="SLA Breaches" count={report.slaBreaches.count} amount={report.slaBreaches.amountAffectedFormatted} />
            <SignalCard icon={Copy} label="Duplicate Credit Risks" count={report.duplicateCreditRisks.count} amount={report.duplicateCreditRisks.amountFormatted} />
            <SignalCard icon={Globe} label="Cross-Currency Risks" count={report.crossCurrencyRisks.count} amount={report.crossCurrencyRisks.amountFormatted} />
            <div className="border border-[#252a24] bg-[#0d100d] p-4">
              <div className="text-[9px] font-bold uppercase tracking-wider text-[#687063]">Score Composition</div>
              <div className="mt-2 space-y-1 font-mono text-[10px] text-[#8c9288]">
                <ScoreBar label="Severity" value={report.scoreBreakdown.severity} max={40} />
                <ScoreBar label="Amount" value={report.scoreBreakdown.amount} max={30} />
                <ScoreBar label="Count" value={report.scoreBreakdown.count} max={15} />
                <ScoreBar label="Stacking" value={report.scoreBreakdown.stacking} max={15} />
              </div>
            </div>
          </div>

          {/* Tolerance stacking detail */}
          <div
            className={`border p-5 ${
              report.toleranceStacking.breached ? "border-[#6e2b26] bg-[#1a0f0e]" : "border-[#3e4d36] bg-[#0d100d]"
            }`}
          >
            <div className="flex items-center gap-2">
              <Layers className={`h-4 w-4 ${report.toleranceStacking.breached ? "text-[#d9776f]" : "text-[#a4b58a]"}`} />
              <h2 className={`text-sm font-bold ${report.toleranceStacking.breached ? "text-[#d9776f]" : "text-[#e3e1d8]"}`}>
                Tolerance Stacking {report.toleranceStacking.breached ? "— BREACH DETECTED" : "— Within Limits"}
              </h2>
            </div>
            <p className="mt-2 text-xs text-[#a9aea3]">{report.toleranceStacking.reason}</p>
            <p className="mt-1 text-[10px] font-mono text-[#687063]">
              &ldquo;Death by a thousand pauses&rdquo;: individually-immaterial variances (each ≤ ₹1,000) that
              collectively cross a material line. Cumulative exposure {report.toleranceStacking.exposureFormatted} from{" "}
              {report.toleranceStacking.smallVarianceCount} small variance
              {report.toleranceStacking.smallVarianceCount === 1 ? "" : "s"}.
            </p>
          </div>

          {/* Exceptions grouped by risk category */}
          <div className="border border-[#252a24] bg-[#090b09]">
            <div className="flex items-center justify-between border-b border-[#252a24] px-5 py-3">
              <h2 className="text-sm font-bold text-[#e3e1d8]">Unresolved Exceptions by Risk Category</h2>
              <span className="font-mono text-[10px] text-[#687063]">{report.exceptions.length} total</span>
            </div>

            {report.exceptions.length === 0 ? (
              <div className="p-10 text-center text-sm text-[#687063]">
                No unresolved exceptions in this dataset — exposure is clear.
              </div>
            ) : (
              CATEGORY_ORDER.map((cat) => {
                const rows = report.exceptions.filter((e) => e.riskLevel === cat);
                if (rows.length === 0) return null;
                const style = bandStyle(cat);
                const bucket = report.byCategory[cat];
                return (
                  <div key={cat} className="border-b border-[#161a15] last:border-b-0">
                    <div className={`flex items-center justify-between px-5 py-2.5 ${style.bg}`}>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 text-[9px] font-mono font-bold ${style.text} border ${style.border}`}>
                          {cat} RISK
                        </span>
                        <span className="text-[10px] font-mono text-[#687063]">
                          {bucket.count} exception{bucket.count === 1 ? "" : "s"}
                        </span>
                      </div>
                      <span className={`font-mono text-xs font-bold ${style.text}`}>{bucket.amountFormatted}</span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-[#161a15] text-[9px] uppercase tracking-wider text-[#565d51]">
                            <th className="px-5 py-2 font-bold">Exception ID</th>
                            <th className="px-3 py-2 font-bold">Type</th>
                            <th className="px-3 py-2 text-right font-bold">Variance</th>
                            <th className="px-3 py-2 font-bold">Risk</th>
                            <th className="px-3 py-2 font-bold">Root Cause</th>
                            <th className="px-3 py-2 font-bold">Recommended Action</th>
                            <th className="px-5 py-2 font-bold">Playbook</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((ex) => (
                            <tr key={ex.id} className="border-b border-[#101410] align-top last:border-b-0 hover:bg-[#0d100d]">
                              <td className="px-5 py-3 font-mono text-[11px] text-[#c9cabf]">{ex.id}</td>
                              <td className="px-3 py-3 font-mono text-[10px] text-[#8c9288]">{ex.type}</td>
                              <td className="px-3 py-3 text-right font-mono font-bold text-[#e3e1d8]">{ex.varianceFormatted}</td>
                              <td className="px-3 py-3">
                                <span className={`px-2 py-0.5 text-[9px] font-mono font-bold ${style.text} border ${style.border}`}>
                                  {ex.riskLevel}
                                </span>
                              </td>
                              <td className="max-w-[16rem] px-3 py-3 text-[11px] text-[#a9aea3]">{ex.rootCause}</td>
                              <td className="max-w-[16rem] px-3 py-3 text-[11px] text-[#a9aea3]">{ex.recommendedAction}</td>
                              <td className="px-5 py-3">
                                <Link
                                  href="/playbook"
                                  className="inline-flex items-center gap-1 text-[10px] font-mono text-[#a4b58a] hover:text-[#c2d3a6]"
                                  title={`Resolution playbook: ${ex.playbookType}`}
                                >
                                  <BookOpen className="h-3 w-3" />
                                  {ex.playbookType}
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SignalCard({
  icon: Icon,
  label,
  count,
  amount,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  amount: string;
}) {
  const active = count > 0;
  return (
    <div className={`border p-4 ${active ? "border-[#5c4a1d] bg-[#0d100d]" : "border-[#252a24] bg-[#0d100d]"}`}>
      <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-wider text-[#687063]">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className={`mt-2 font-mono text-2xl font-bold ${active ? "text-[#d3a24b]" : "text-[#e3e1d8]"}`}>{count}</div>
      <div className="mt-1 text-[10px] text-[#687063]">{amount} affected</div>
    </div>
  );
}

function ScoreBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value * 100) / max)) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-[#687063]">{label}</span>
      <span className="h-1.5 flex-1 overflow-hidden bg-[#1c211a]">
        <span className="block h-full bg-[#a4b58a]" style={{ width: `${pct}%` }} />
      </span>
      <span className="w-10 shrink-0 text-right text-[#8c9288]">
        {value}/{max}
      </span>
    </div>
  );
}
