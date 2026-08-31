"use client";

import React, { useCallback, useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  RefreshCw,
  Download,
  BookOpen,
  LogIn,
  AlertTriangle,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Badge } from "@/components/ui/badge";
import { Dropdown } from "@/components/ui/dropdown";
import { apiErrorMessage } from "@/lib/api/error-message";

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

function getBadgeVariant(risk: RiskCategory | RiskBand) {
  switch (risk) {
    case "CRITICAL":
    case "HIGH":
      return "destructive";
    case "ELEVATED":
    case "MEDIUM":
      return "warning";
    case "MODERATE":
      return "secondary";
    default:
      return "outline";
  }
}

import { safeFetch } from "@/lib/api/safe-fetch";

async function fetchExposure(batchId?: string | null): Promise<RiskResponse> {
  const payload = batchId ? { batchId } : {};
  const res = await safeFetch<RiskResponse>("/api/risk/exposure", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok || !res.data?.success) {
    if (res.status === 401) {
      throw new Error("UNAUTHORIZED: Session expired or authentication required. Please sign in to access the Risk & Exposure Command Center.");
    }
    throw new Error(res.error || apiErrorMessage(res.data, `Request failed (${res.status})`));
  }

  return res.data;
}


function RiskDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialBatchId = searchParams.get("batchId");

  const [selectedBatchId, setSelectedBatchId] = useState<string>(initialBatchId || "COMBINED");
  const [availableBatches, setAvailableBatches] = useState<{ id: string; name: string }[]>([]);
  const [data, setData] = useState<RiskResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthError, setIsAuthError] = useState(false);

  // Fetch available batches for the dropdown
  useEffect(() => {
    let active = true;
    fetch("/api/batches")
      .then((res) => (res.ok ? res.json() : { batches: [] }))
      .then((json) => {
        if (active && Array.isArray(json.batches)) {
          setAvailableBatches(
            json.batches.map((b: { id: string; name?: string }) => ({
              id: b.id,
              name: b.name || b.id,
            }))
          );
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const runAnalysis = useCallback(async (batchIdToUse?: string) => {
    setLoading(true);
    setError(null);
    setIsAuthError(false);
    const target = batchIdToUse !== undefined ? batchIdToUse : selectedBatchId;
    const batchIdParam = target === "COMBINED" ? null : target;

    try {
      const response = await fetchExposure(batchIdParam);
      setData(response);
    } catch (err) {
      const msg = (err as Error).message || "Failed to compute risk exposure.";
      setError(msg);
      if (msg.includes("UNAUTHORIZED") || msg.includes("401")) {
        setIsAuthError(true);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedBatchId]);

  useEffect(() => {
    let active = true;
    const target = initialBatchId || "COMBINED";
    const batchIdParam = target === "COMBINED" ? null : target;

    fetchExposure(batchIdParam)
      .then((d) => {
        if (active) {
          setData(d);
          setError(null);
          setIsAuthError(false);
        }
      })
      .catch((err) => {
        if (active) {
          const msg = (err as Error).message || "Failed to compute risk exposure.";
          setError(msg);
          if (msg.includes("UNAUTHORIZED") || msg.includes("401")) {
            setIsAuthError(true);
          }
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [initialBatchId]);

  const handleBatchChange = (newBatchId: string) => {
    setSelectedBatchId(newBatchId);
    if (newBatchId === "COMBINED") {
      router.push("/risk-dashboard");
    } else {
      router.push(`/risk-dashboard?batchId=${encodeURIComponent(newBatchId)}`);
    }
    void runAnalysis(newBatchId);
  };

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

  const datasetDropdownOptions = [
    { value: "COMBINED", label: "Combined Scenario Lab Dataset (5 Scenarios)", badge: "Multi-Anomaly" },
    ...availableBatches.map((b) => ({
      value: b.id,
      label: `Stored Batch: ${b.name}`,
      badge: "Database",
    })),
  ];

  return (
    <div className="space-y-10 pb-12">
      {/* Header */}
      <PageHeader
        tag="Security & Audit"
        title="Risk & exposure dashboard"
        description="Aggregated real-time exposure across unresolved exceptions, tolerance-stacking breaches, and severity tiers in exact integer paise."
        badge={data ? <Badge variant="outline">{data.datasetLabel}</Badge> : undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={exportReport}
              disabled={!data || loading}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-40 transition"
            >
              <Download className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Export report</span>
            </button>
            <button
              type="button"
              onClick={() => runAnalysis()}
              disabled={loading}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3.5 text-xs font-medium hover:bg-[#ffffff] disabled:opacity-50 transition"
            >
              {loading ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Run analysis</span>
                </>
              )}
            </button>
          </div>
        }
      />

      {/* Dataset Selection Bar */}
      <div className="rounded-lg border border-border bg-card p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
            Analysis Dataset:
          </span>
          <Dropdown
            value={selectedBatchId}
            onValueChange={handleBatchChange}
            options={datasetDropdownOptions}
            triggerClassName="min-w-[280px] text-xs font-mono"
            data-testid="risk-dataset-dropdown"
          />
        </div>

        {data && (
          <div className="text-xs font-mono text-muted-foreground/80 flex items-center gap-3">
            <span>Generated: {new Date(data.generatedAt).toLocaleTimeString()}</span>
            <span>Source: {data.source}</span>
          </div>
        )}
      </div>

      {/* Auth Error Banner */}
      {isAuthError && (
        <div className="rounded-lg border border-[#ef4444]/40 bg-[#1a0a0a] p-5 space-y-3">
          <div className="flex items-center gap-2.5 text-[#ef4444]">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <div className="font-semibold text-sm">Authentication Required</div>
          </div>
          <p className="text-xs text-muted-foreground">
            Your session has expired or requires authentication. Please sign in to access the Risk & Exposure Command Center.
          </p>
          <div className="pt-1 flex items-center gap-3">
            <Link
              href="/login?next=/risk-dashboard"
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3.5 text-xs font-medium hover:bg-[#ffffff] transition"
            >
              <LogIn className="h-3.5 w-3.5" />
              <span>Sign in to SettleMate</span>
            </Link>
            <button
              type="button"
              onClick={() => runAnalysis()}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-accent transition"
            >
              <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Retry request</span>
            </button>
          </div>
        </div>
      )}

      {/* General Error Banner */}
      {error && !isAuthError && (
        <div className="rounded-lg border border-[#3b1818] bg-[#140a0a] p-4 flex items-start justify-between gap-3 text-xs font-mono text-[#ef4444]">
          <div>
            <span className="font-semibold">Risk analysis failed: </span>
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => runAnalysis()}
            className="inline-flex items-center gap-1 shrink-0 text-xs text-muted-foreground hover:text-foreground underline"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {loading && !report && (
        <div className="flex items-center justify-center gap-3 rounded-lg border border-border bg-card p-16 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin text-foreground" />
          <span>Computing aggregated risk exposure...</span>
        </div>
      )}

      {report && (
        <>
          {/* Primary KPI cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Total Unresolved Amount */}
            <div className="rounded-lg border border-border bg-card p-5 space-y-1">
              <div className="font-mono text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
                {report.totals.unresolvedAmountFormatted}
              </div>
              <div className="text-xs font-medium text-foreground">
                Total unresolved amount
              </div>
              <div className="text-[11px] text-muted-foreground/70">
                across {report.totals.unresolvedCount} unresolved exception{report.totals.unresolvedCount === 1 ? "" : "s"}
              </div>
            </div>

            {/* High-Risk Exceptions */}
            <div className="rounded-lg border border-border bg-card p-5 space-y-1">
              <div className="flex items-center justify-between">
                <div className="font-mono text-2xl sm:text-3xl font-semibold tracking-tight text-[#ef4444]">
                  {report.byCategory.HIGH.count}
                </div>
                <Badge variant="destructive">Critical</Badge>
              </div>
              <div className="text-xs font-medium text-foreground">
                High-risk exceptions
              </div>
              <div className="text-[11px] text-muted-foreground/70">
                {report.byCategory.HIGH.amountFormatted} &middot; variance &gt; ₹50,000
              </div>
            </div>

            {/* Tolerance Stacking Exposure */}
            <div className="rounded-lg border border-border bg-card p-5 space-y-1">
              <div className="flex items-center justify-between">
                <div className="font-mono text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
                  {report.toleranceStacking.exposureFormatted}
                </div>
                {report.toleranceStacking.breached ? (
                  <Badge variant="destructive">Breached</Badge>
                ) : (
                  <Badge variant="outline">Nominal</Badge>
                )}
              </div>
              <div className="text-xs font-medium text-foreground">
                Tolerance stacking
              </div>
              <div className="text-[11px] text-muted-foreground/70">
                {report.toleranceStacking.smallVarianceCount} small variance{report.toleranceStacking.smallVarianceCount === 1 ? "" : "s"}
              </div>
            </div>

            {/* Overall Risk Score */}
            <div className="rounded-lg border border-border bg-card p-5 space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-baseline gap-1">
                  <span className="font-mono text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
                    {report.riskScore}
                  </span>
                  <span className="text-xs text-muted-foreground/70 font-mono">/ 100</span>
                </div>
                <Badge variant={getBadgeVariant(report.riskBand)}>{report.riskBand}</Badge>
              </div>
              <div className="text-xs font-medium text-foreground">
                Overall risk score
              </div>
              <div className="text-[11px] text-muted-foreground/70">
                Weighted composite score
              </div>
            </div>
          </div>

          {/* Secondary risk signals */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SignalCard label="SLA Breaches" count={report.slaBreaches.count} amount={report.slaBreaches.amountAffectedFormatted} />
            <SignalCard label="Duplicate Credit Risks" count={report.duplicateCreditRisks.count} amount={report.duplicateCreditRisks.amountFormatted} />
            <SignalCard label="Cross-Currency Risks" count={report.crossCurrencyRisks.count} amount={report.crossCurrencyRisks.amountFormatted} />
            <div className="rounded-lg border border-border bg-card p-4 space-y-2">
              <div className="text-xs font-semibold text-foreground">Score Composition</div>
              <div className="space-y-1.5 font-mono text-[11px] text-muted-foreground">
                <ScoreBar label="Severity" value={report.scoreBreakdown.severity} max={40} />
                <ScoreBar label="Amount" value={report.scoreBreakdown.amount} max={30} />
                <ScoreBar label="Count" value={report.scoreBreakdown.count} max={15} />
                <ScoreBar label="Stacking" value={report.scoreBreakdown.stacking} max={15} />
              </div>
            </div>
          </div>

          {/* Exceptions grouped by risk category */}
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-border p-5">
              <SectionHeader
                title="Unresolved exceptions by risk category"
                className="border-b-0 pb-0"
              />
              <span className="font-mono text-xs text-muted-foreground/70">{report.exceptions.length} total</span>
            </div>

            {report.exceptions.length === 0 ? (
              <div className="p-10 text-center text-xs text-muted-foreground/70">
                No unresolved exceptions in this dataset — exposure is clear.
              </div>
            ) : (
              CATEGORY_ORDER.map((cat) => {
                const rows = report.exceptions.filter((e) => e.riskLevel === cat);
                if (rows.length === 0) return null;
                const bucket = report.byCategory[cat];
                return (
                  <div key={cat} className="border-b border-border last:border-b-0">
                    <div className="flex items-center justify-between px-5 py-2.5 bg-background border-b border-border">
                      <div className="flex items-center gap-2">
                        <Badge variant={getBadgeVariant(cat)}>
                          {cat} Risk
                        </Badge>
                        <span className="text-xs text-muted-foreground/70">
                          {bucket.count} exception{bucket.count === 1 ? "" : "s"}
                        </span>
                      </div>
                      <span className="font-mono text-xs font-semibold text-foreground">{bucket.amountFormatted}</span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground">
                            <th className="px-5 py-2.5 font-medium">Exception ID</th>
                            <th className="px-3 py-2.5 font-medium">Type</th>
                            <th className="px-3 py-2.5 text-right font-medium">Variance</th>
                            <th className="px-3 py-2.5 font-medium">Risk</th>
                            <th className="px-3 py-2.5 font-medium">Root Cause</th>
                            <th className="px-3 py-2.5 font-medium">Recommended Action</th>
                            <th className="px-5 py-2.5 font-medium">Playbook</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {rows.map((ex) => (
                            <tr key={ex.id} className="align-top hover:bg-accent/40">
                              <td className="px-5 py-3 font-mono text-xs text-foreground">{ex.id}</td>
                              <td className="px-3 py-3 font-mono text-[11px] text-muted-foreground">{ex.type}</td>
                              <td className="px-3 py-3 text-right font-mono font-medium text-foreground">{ex.varianceFormatted}</td>
                              <td className="px-3 py-3">
                                <Badge variant={getBadgeVariant(ex.riskLevel)}>
                                  {ex.riskLevel}
                                </Badge>
                              </td>
                              <td className="max-w-[16rem] px-3 py-3 text-xs text-muted-foreground">{ex.rootCause}</td>
                              <td className="max-w-[16rem] px-3 py-3 text-xs text-muted-foreground">{ex.recommendedAction}</td>
                              <td className="px-5 py-3">
                                <Link
                                  href="/playbook"
                                  className="inline-flex items-center gap-1 text-xs text-foreground hover:underline"
                                >
                                  <BookOpen className="h-3 w-3 text-muted-foreground" />
                                  <span>{ex.playbookType}</span>
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
  label,
  count,
  amount,
}: {
  label: string;
  count: number;
  amount: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-1">
      <div className="text-xs text-muted-foreground">
        {label}
      </div>
      <div className="font-mono text-xl font-semibold text-foreground">{count}</div>
      <div className="text-[11px] text-muted-foreground/70">{amount} affected</div>
    </div>
  );
}

function ScoreBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value * 100) / max)) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-muted-foreground/70">{label}</span>
      <span className="h-1 flex-1 overflow-hidden bg-[#181818] rounded-full">
        <span className="block h-full bg-primary text-primary-foreground rounded-full" style={{ width: `${pct}%` }} />
      </span>
      <span className="w-10 shrink-0 text-right text-muted-foreground">
        {value}/{max}
      </span>
    </div>
  );
}

export default function RiskDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center gap-3 rounded-lg border border-border bg-card p-16 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin text-foreground" />
          <span>Loading Risk Dashboard...</span>
        </div>
      }
    >
      <RiskDashboardContent />
    </Suspense>
  );
}
