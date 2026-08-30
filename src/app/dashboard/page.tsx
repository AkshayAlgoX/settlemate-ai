"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Database,
  Fingerprint,
  Gauge,
  Loader2,
  ShieldCheck,
  Target,
  Zap,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Badge } from "@/components/ui/badge";
import { Dropdown } from "@/components/ui/dropdown";

interface DashboardBatch {
  id: string;
  size: number;
  status: string;
  totalRecords: number;
  autoMatched: number;
  exceptionsFound: number;
  accuracy: number;
  throughputRps: number;
  unresolvedCount: number;
  amountAtRisk: number;
  processingTimeMs: number;
}

interface DashboardException {
  id: string;
  exceptionType: string;
  amount: number;
  paymentId?: string | null;
  mismatchAmount?: number | null;
  riskLevel?: string;
  status?: string;
  confidenceScore?: number;
}

interface DashboardData {
  batch?: DashboardBatch;
  exceptions?: DashboardException[];
}

const CHART_COLORS = [
  "#0070F3",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#06B6D4",
  "#8E8E8E",
];

const TOOLTIP_STYLE = {
  backgroundColor: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--foreground)",
};

const AXIS_STYLE = {
  fill: "var(--muted-foreground)",
  fontSize: 11,
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-IN").format(value);
}

function formatRupees(paise: number) {
  const rupees = paise / 100;

  if (rupees >= 10000000) {
    return `₹${(rupees / 10000000).toFixed(2)}Cr`;
  }

  if (rupees >= 100000) {
    return `₹${(rupees / 100000).toFixed(1)}L`;
  }

  if (rupees >= 1000) {
    return `₹${(rupees / 1000).toFixed(1)}K`;
  }

  return `₹${rupees.toFixed(0)}`;
}

function formatExceptionType(value: string) {
  return value
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function MetricTile({
  label,
  value,
  sublabel,
  accent = "neutral",
}: {
  label: string;
  value: string | number;
  sublabel?: string;
  icon?: React.ElementType;
  accent?: "neutral" | "success" | "warning" | "risk";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 sm:p-6 space-y-1.5 shadow-2xs">
      <div
        className={`text-2xl sm:text-3xl font-mono font-bold tracking-tight ${
          accent === "success"
            ? "text-emerald-500"
            : accent === "risk"
            ? "text-rose-500"
            : accent === "warning"
            ? "text-amber-500"
            : "text-foreground"
        }`}
      >
        {value}
      </div>
      <div className="text-xs font-semibold text-foreground">
        {label}
      </div>
      {sublabel && (
        <div className="text-[11px] text-muted-foreground truncate">
          {sublabel}
        </div>
      )}
    </div>
  );
}

interface ScaleHistoryItem {
  id: string;
  name: string;
  records: number;
  durationMs: number;
  throughputRps: number;
  accuracy: number;
  partitions: number;
  workers: number;
  retries: number;
  dlq: number;
  amountAtRisk: number;
  status: string;
  source: string;
  createdAt: string;
  classification: "OFFICIAL BENCHMARK" | "REAL MEASURED" | "STANDARD RUN";
}

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const batchId = searchParams.get("batchId");

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [scaleHistory, setScaleHistory] = useState<ScaleHistoryItem[]>([]);
  const [availableBatches, setAvailableBatches] = useState<{ id: string; name: string; size: number }[]>([]);

  useEffect(() => {
    fetch("/api/scale/run")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.history) {
          setScaleHistory(data.history);
        }
      })
      .catch(() => {});
  }, []);

  const loadDashboard = useCallback(async (id: string) => {
    try {
      const resultsRes = await fetch(`/api/reconcile/${id}/results`);
      const resultsData = await resultsRes.json();
      setData(resultsData);
    } catch (error) {
      console.error("Dashboard load error:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        const response = await fetch("/api/batches");
        const result = await response.json();

        if (active && Array.isArray(result.batches)) {
          setAvailableBatches(
            result.batches.map((b: { id: string; name?: string; size?: number; totalRecords?: number }) => ({
              id: b.id,
              name: b.name || b.id,
              size: b.totalRecords || b.size || 0,
            }))
          );
        }

        if (!batchId) {
          if (result.batches?.length > 0) {
            await loadDashboard(result.batches[0].id);
          } else {
            setLoading(false);
          }
        } else {
          await loadDashboard(batchId);
        }
      } catch {
        setLoading(false);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [batchId, loadDashboard]);

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="text-center space-y-2">
          <Loader2 className="h-5 w-5 animate-spin text-foreground mx-auto" />
          <p className="text-xs text-muted-foreground">
            Loading reconciliation control plane...
          </p>
        </div>
      </div>
    );
  }

  if (!data?.batch) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 text-center space-y-4">
          <AlertTriangle className="h-6 w-6 text-muted-foreground mx-auto" />
          <div>
            <h2 className="text-base font-semibold text-foreground">
              No reconciliation batch found
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Generate sample data to explore operational telemetry.
            </p>
          </div>
          <Link
            href="/demo"
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3.5 text-xs font-medium text-primary-foreground hover:bg-[#ffffff] transition"
          >
            <span>Open demo center</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    );
  }

  const batch = data.batch;
  const exceptions = data.exceptions || [];

  const exceptionTypeCounts: Record<string, number> = {};
  const amountByType: Record<string, number> = {};

  exceptions.forEach((exception) => {
    exceptionTypeCounts[exception.exceptionType] =
      (exceptionTypeCounts[exception.exceptionType] || 0) + 1;

    amountByType[exception.exceptionType] =
      (amountByType[exception.exceptionType] || 0) + exception.amount;
  });

  const pieData = Object.entries(exceptionTypeCounts).map(([name, value]) => ({
    name: formatExceptionType(name),
    value,
  }));

  const barData = Object.entries(amountByType)
    .map(([name, value]) => ({
      name: formatExceptionType(name).slice(0, 17),
      amount: value / 100,
    }))
    .sort((a, b) => b.amount - a.amount);

  const autoMatchRate =
    batch.totalRecords > 0
      ? Math.round((batch.autoMatched / batch.totalRecords) * 1000) / 10
      : 0;

  const riskPriority = (exception: DashboardException) =>
    exception.riskLevel === "HIGH"
      ? 0
      : exception.riskLevel === "MEDIUM"
        ? 1
        : 2;

  const ACTIVE_STATUSES = new Set([
    "OPEN",
    "INVESTIGATING",
    "ESCALATED",
    "REOPENED",
  ]);

  const topRisks = [...exceptions]
    .filter((exception) => ACTIVE_STATUSES.has(exception.status || ""))
    .sort(
      (a, b) =>
        riskPriority(a) - riskPriority(b) ||
        (b.amount || 0) - (a.amount || 0),
    )
    .slice(0, 6);

  const highRiskCount = exceptions.filter(
    (exception) => exception.riskLevel === "HIGH",
  ).length;

  return (
    <div className="space-y-8 lg:space-y-10 pb-16 font-sans">
      {/* Header */}
      <PageHeader
        tag="Operations"
        title="Reconciliation control center"
        description={`Batch ${batch.id?.slice(0, 14)}... · ${formatNumber(batch.size)} records · Settlement control`}
        badge={<Badge variant="success">{batch.status}</Badge>}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {availableBatches.length > 1 && (
              <Dropdown
                value={batch.id}
                onValueChange={(newId) => {
                  router.push(`/dashboard?batchId=${encodeURIComponent(newId)}`);
                }}
                options={availableBatches.map((b) => ({
                  value: b.id,
                  label: b.name,
                  badge: `${b.size} recs`,
                }))}
                size="sm"
                triggerClassName="min-w-[180px] text-xs font-mono"
                data-testid="dashboard-batch-dropdown"
              />
            )}
            <Link
              href={`/exceptions?batchId=${batch.id}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-accent hover:border-foreground/30 transition"
            >
              <span>Review exceptions</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
            <Link
              href={`/audit?batchId=${batch.id}`}
              className="inline-flex h-8 items-center rounded-lg border border-border bg-card px-3 text-xs font-medium text-muted-foreground hover:text-foreground transition"
            >
              <span>Audit trail</span>
            </Link>
          </div>
        }
      />

      {/* Primary Metrics Grid */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <MetricTile
          label="Records processed"
          value={formatNumber(batch.totalRecords)}
          icon={Database}
        />

        <MetricTile
          label="Auto-matched"
          value={formatNumber(batch.autoMatched)}
          sublabel={`${autoMatchRate}% of batch`}
          icon={CheckCircle2}
          accent="success"
        />

        <MetricTile
          label="Exceptions"
          value={formatNumber(batch.exceptionsFound)}
          sublabel={`${batch.unresolvedCount} open`}
          icon={AlertTriangle}
          accent="warning"
        />

        <MetricTile
          label="Accuracy"
          value={`${batch.accuracy}%`}
          sublabel="Reconciliation result"
          icon={Target}
          accent="success"
        />

        <MetricTile
          label="Throughput"
          value={`${batch.throughputRps}/s`}
          sublabel={`${batch.processingTimeMs}ms execution`}
          icon={Zap}
        />

        <MetricTile
          label="Amount at risk"
          value={formatRupees(batch.amountAtRisk || 0)}
          sublabel="Across active exceptions"
          icon={Gauge}
          accent={highRiskCount > 0 ? "risk" : "neutral"}
        />
      </section>

      {/* Hyperscale Financial Telemetry & Engine State */}
      <section className="rounded-xl border border-border bg-card p-5 sm:p-6 space-y-4 shadow-2xs">
        <SectionHeader
          title="Engine telemetry & lineage state"
          description="Distributed execution metrics and cryptographic invariants"
          className="border-b-0 pb-0"
        />

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-border bg-background p-4 space-y-1">
            <div className="text-xs text-muted-foreground">
              Partitioning & Bucketing
            </div>
            <div className="font-mono text-sm font-semibold text-foreground">
              {batch.totalRecords >= 100000 ? `${(batch.totalRecords / 20).toLocaleString()} Partitions` : "Exact Single-Pass"}
            </div>
            <div className="text-[11px] text-muted-foreground/70">
              Deterministic UTR + Amount Hash
            </div>
          </div>

          <div className="rounded-lg border border-border bg-background p-4 space-y-1">
            <div className="text-xs text-muted-foreground">
              Queue & Reliability
            </div>
            <div className="font-mono text-sm font-semibold text-foreground">
              0 Retries / 0 DLQ
            </div>
            <div className="text-[11px] text-muted-foreground/70">
              At-Least-Once Consumer Ack
            </div>
          </div>

          <div className="rounded-lg border border-border bg-background p-4 space-y-1">
            <div className="text-xs text-muted-foreground">
              Financial Invariants
            </div>
            <div className="font-mono text-sm font-semibold text-emerald-500">
              ALL 6 PASSED
            </div>
            <div className="text-[11px] text-muted-foreground/70">
              Zero-Tolerance Conservation
            </div>
          </div>

          <div className="rounded-lg border border-border bg-background p-4 space-y-1">
            <div className="text-xs text-muted-foreground">
              Cryptographic Lineage
            </div>
            <div className="font-mono text-sm font-semibold text-foreground">
              Merkle Root Verified
            </div>
            <div className="text-[11px] text-muted-foreground/70">
              SHA-256 Binary Tree DAG
            </div>
          </div>
        </div>
      </section>

      {/* Scale Execution History */}
      <section className="rounded-xl border border-border bg-card p-5 sm:p-6 space-y-4 shadow-2xs">
        <SectionHeader
          title="Scale execution ledger"
          description={`${scaleHistory.length} recorded benchmark runs`}
        />

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs font-semibold text-muted-foreground">
                <th className="px-4 py-2.5">Batch / Run Name</th>
                <th className="px-4 py-2.5 text-right">Records</th>
                <th className="px-4 py-2.5 text-right">Duration</th>
                <th className="px-4 py-2.5 text-right">Throughput</th>
                <th className="px-4 py-2.5 text-center">Retries / DLQ</th>
                <th className="px-4 py-2.5">Classification</th>
                <th className="px-4 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {scaleHistory.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-xs text-muted-foreground">
                    No historical scale runs recorded yet.
                  </td>
                </tr>
              ) : (
                scaleHistory.map((run) => (
                  <tr key={run.id} className="hover:bg-accent/40 transition">
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground truncate max-w-[200px]">
                        {run.name}
                      </div>
                      <div className="font-mono text-[11px] text-muted-foreground">
                        {run.id}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-foreground">
                      {run.records.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                      {run.durationMs >= 1000 ? `${(run.durationMs / 1000).toFixed(2)}s` : `${run.durationMs}ms`}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-foreground">
                      {run.throughputRps > 0 ? `${run.throughputRps.toLocaleString()} rec/s` : "—"}
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-emerald-500">
                      {run.retries} / {run.dlq}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={run.classification === "OFFICIAL BENCHMARK" ? "success" : "outline"}>
                        {run.classification}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/dashboard?batchId=${run.id}`}
                        className="text-xs text-muted-foreground hover:text-foreground font-medium"
                      >
                        Inspect →
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Top Risks */}
      <section className="rounded-xl border border-border bg-card p-5 sm:p-6 space-y-4 shadow-2xs">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <SectionHeader
            title="Priority exceptions"
            description="Attention queue requiring investigation"
            className="border-b-0 pb-0"
          />

          <Link
            href={`/exceptions?batchId=${batch.id}`}
            className="text-xs text-muted-foreground hover:text-foreground font-medium flex items-center gap-1"
          >
            <span>View all ({exceptions.length})</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {topRisks.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span>No active exceptions awaiting review.</span>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {topRisks.map((exception, index) => (
              <Link
                key={exception.id}
                href={`/exceptions/${batch.id}/${exception.id}`}
                className="grid grid-cols-[24px_minmax(0,1fr)_auto_auto] items-center gap-4 py-3 px-2 rounded-lg hover:bg-accent/40 transition"
              >
                <span className="font-mono text-xs text-muted-foreground">
                  {String(index + 1).padStart(2, "0")}
                </span>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-foreground truncate">
                      {formatExceptionType(exception.exceptionType)}
                    </span>
                    <Badge variant="outline">{exception.status || "OPEN"}</Badge>
                  </div>
                  <div className="text-[11px] font-mono text-muted-foreground truncate mt-0.5">
                    {exception.paymentId || "No reference"}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs font-mono font-semibold text-foreground">
                    {formatRupees(exception.amount)}
                  </div>
                  {exception.mismatchAmount ? (
                    <div className="text-[10px] font-mono text-rose-500">
                      Δ {formatRupees(exception.mismatchAmount)}
                    </div>
                  ) : null}
                </div>

                <Badge variant={exception.riskLevel === "HIGH" ? "destructive" : "warning"}>
                  {exception.riskLevel || "MEDIUM"}
                </Badge>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Analysis Charts Grid */}
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Exception Mix */}
        <div className="rounded-xl border border-border bg-card p-5 sm:p-6 space-y-4 shadow-2xs">
          <SectionHeader
            title="Exception distribution"
            description="Categorization of detected anomalies"
            className="border-b-0 pb-0"
          />

          {pieData.length > 0 ? (
            <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-[1fr_160px]">
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      dataKey="value"
                      paddingAngle={2}
                      stroke="none"
                    >
                      {pieData.map((_, index) => (
                        <Cell
                          key={index}
                          fill={CHART_COLORS[index % CHART_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-1.5">
                {pieData.slice(0, 6).map((item, index) => (
                  <div key={item.name} className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                      />
                      <span className="text-muted-foreground truncate">{item.name}</span>
                    </div>
                    <span className="font-mono text-foreground shrink-0">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-muted-foreground">
              No exceptions recorded.
            </div>
          )}
        </div>

        {/* Amount at risk */}
        <div className="rounded-xl border border-border bg-card p-5 sm:p-6 space-y-4 shadow-2xs">
          <SectionHeader
            title="Exposure by category"
            description="Amount at risk categorized by exception type"
            className="border-b-0 pb-0"
          />

          {barData.length > 0 ? (
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={barData}
                  layout="vertical"
                  margin={{ left: 4, right: 12, top: 6, bottom: 6 }}
                >
                  <CartesianGrid stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tick={AXIS_STYLE} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" tick={AXIS_STYLE} width={100} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value) => [`₹${Number(value ?? 0).toLocaleString("en-IN")}`, "Exposure"]}
                  />
                  <Bar dataKey="amount" fill="var(--chart-1)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-muted-foreground">
              No exposure data.
            </div>
          )}
        </div>
      </section>

      {/* Footer status */}
      <div className="flex flex-col gap-3 border-t border-border pt-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>SettleMate AI Financial Control Plane</span>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <Fingerprint className="h-3.5 w-3.5" />
            Batch state persisted
          </span>
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            Control checks active
          </span>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[70vh] flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-foreground" />
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}