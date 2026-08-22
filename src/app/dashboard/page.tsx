"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Brain,
  CheckCircle2,
  Clock3,
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
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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

interface DashboardPass {
  passNumber: number;
  name: string;
  accuracy: number;
  exceptions: number;
  autoMatched: number;
  durationMs: number;
  aiUsed?: boolean;
}

interface DashboardCalibration {
  range: string;
  accuracy: number;
  total: number;
}

interface DashboardAdversarialTest {
  testName: string;
  detected: boolean;
}

interface DashboardAdversarial {
  detected: number;
  totalTests: number;
  detectionRate: number;
  tests?: DashboardAdversarialTest[];
}

interface DashboardMultiPass {
  passes?: DashboardPass[];
  calibration?: DashboardCalibration[];
  adversarial?: DashboardAdversarial;
}

interface DashboardData {
  batch?: DashboardBatch;
  exceptions?: DashboardException[];
}

const CHART_COLORS = [
  "#A8B88A",
  "#C7B67E",
  "#7FA99A",
  "#B38D6A",
  "#8794A0",
  "#C57F74",
  "#97AA73",
  "#AF8D70",
  "#7FA59A",
  "#A79C72",
];

const TOOLTIP_STYLE = {
  backgroundColor: "#0d100d",
  border: "1px solid #2c302b",
  borderRadius: 0,
  fontSize: 11,
  color: "#d8d6cd",
};

const AXIS_STYLE = {
  fill: "#777d73",
  fontSize: 10,
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

function StatusPill({ status }: { status: string }) {
  const config: Record<
    string,
    { label: string; dot: string; text: string; border: string; bg: string }
  > = {
    COMPLETED: {
      label: "Completed",
      dot: "bg-[#9caf83]",
      text: "text-[#b6c39a]",
      border: "border-[#46513b]",
      bg: "bg-[#11170f]",
    },
    PROCESSING: {
      label: "Processing",
      dot: "bg-[#c9ad72] animate-pulse",
      text: "text-[#c8b788]",
      border: "border-[#594d35]",
      bg: "bg-[#18140c]",
    },
    CREATED: {
      label: "Created",
      dot: "bg-[#858a84]",
      text: "text-[#a8aaa4]",
      border: "border-[#353934]",
      bg: "bg-[#111310]",
    },
  };

  const item = config[status] || {
    label: status,
    dot: "bg-[#858a84]",
    text: "text-[#a8aaa4]",
    border: "border-[#353934]",
    bg: "bg-[#111310]",
  };

  return (
    <span
      className={`inline-flex items-center gap-2 border px-2.5 py-1 text-[9px] font-medium uppercase tracking-[0.18em] ${item.border} ${item.bg} ${item.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${item.dot}`} />
      {item.label}
    </span>
  );
}

function MetricTile({
  label,
  value,
  sublabel,
  icon: Icon,
  accent = "neutral",
}: {
  label: string;
  value: string | number;
  sublabel?: string;
  icon: React.ElementType;
  accent?: "neutral" | "success" | "warning" | "risk";
}) {
  const accentMap = {
    neutral: {
      icon: "text-[#969d91]",
      border: "border-[#2a2e29]",
    },
    success: {
      icon: "text-[#9caf83]",
      border: "border-[#33412f]",
    },
    warning: {
      icon: "text-[#c3aa76]",
      border: "border-[#4d4330]",
    },
    risk: {
      icon: "text-[#b88378]",
      border: "border-[#4a3430]",
    },
  };

  const palette = accentMap[accent];

  return (
    <div
      className={`group relative min-w-0 border bg-[#0d100d] p-4 transition-colors hover:bg-[#101410] ${palette.border}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-[9px] font-medium uppercase tracking-[0.18em] text-[#747a71]">
          {label}
        </span>

        <Icon className={`h-3.5 w-3.5 shrink-0 ${palette.icon}`} />
      </div>

      <div className="mt-4 truncate text-[22px] font-semibold tracking-[-0.035em] text-[#eceae1]">
        {value}
      </div>

      {sublabel ? (
        <div className="mt-1 truncate text-[9px] text-[#5e645b]">
          {sublabel}
        </div>
      ) : null}

      <div
        className={`absolute bottom-0 left-0 h-px w-0 transition-all duration-300 group-hover:w-full ${
          accent === "success"
            ? "bg-[#7d9166]"
            : accent === "warning"
              ? "bg-[#a8915d]"
              : accent === "risk"
                ? "bg-[#9d665e]"
                : "bg-[#666d62]"
        }`}
      />
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        {eyebrow ? (
          <div className="mb-1 text-[8px] font-medium uppercase tracking-[0.22em] text-[#60665d]">
            {eyebrow}
          </div>
        ) : null}

        <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-[#dddcd4]">
          {title}
        </h2>
      </div>

      {action}
    </div>
  );
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const batchId = searchParams.get("batchId");

  const [data, setData] = useState<DashboardData | null>(null);
  const [multiPass, setMultiPass] = useState<DashboardMultiPass | null>(null);
  const [loading, setLoading] = useState(true);

  const loadDashboard = useCallback(async (id: string) => {
    try {
      const [resultsRes, multiPassRes] = await Promise.all([
        fetch(`/api/reconcile/${id}/results`),
        fetch(`/api/reconcile/${id}/multi-pass`),
      ]);

      const resultsData = await resultsRes.json();

      const multiPassData = (await multiPassRes.json()) as DashboardMultiPass & {
        persisted?: boolean;
        success?: boolean;
      };

      setData(resultsData);

      if (multiPassData.persisted || multiPassData.success) {
        setMultiPass(multiPassData);
      } else if (resultsData.batch?.status !== "COMPLETED") {
        const runRes = await fetch(`/api/reconcile/${id}/multi-pass`, {
          method: "POST",
        });

        const runData = await runRes.json();
        setMultiPass(runData);
      }
    } catch (error) {
      console.error("Dashboard load error:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const run = async () => {
      try {
        if (!batchId) {
          const response = await fetch("/api/batches");
          const result = await response.json();

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
  }, [batchId, loadDashboard]);

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center border border-[#30352f] bg-[#0d100d]">
            <Loader2 className="h-4 w-4 animate-spin text-[#9caf83]" />
          </div>

          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#6f756c]">
            Loading reconciliation state
          </p>
        </div>
      </div>
    );
  }

  if (!data?.batch) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="w-full max-w-md border border-[#2a2e29] bg-[#0d100d] p-8 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center border border-[#4c4231] bg-[#17130d]">
            <AlertTriangle className="h-5 w-5 text-[#c3aa76]" />
          </div>

          <h2 className="mt-5 text-lg font-semibold tracking-[-0.02em] text-[#e8e6de]">
            No reconciliation batch
          </h2>

          <p className="mx-auto mt-2 max-w-xs text-xs leading-5 text-[#6f756c]">
            Generate demo data before opening the operational dashboard.
          </p>

          <Link
            href="/demo"
            className="mt-6 inline-flex h-10 items-center gap-2 bg-[#d9d6c7] px-4 text-xs font-semibold text-[#11130f] transition hover:bg-[#eeeade]"
          >
            Open demo data
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

  const passData =
    multiPass?.passes?.map((pass) => ({
      name: `Pass ${pass.passNumber}`,
      accuracy: pass.accuracy,
    })) || [];

  const calibrationData =
    multiPass?.calibration?.map((calibration) => ({
      range: calibration.range,
      accuracy: calibration.accuracy,
      total: calibration.total,
    })) || [];

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

  const mediumRiskCount = exceptions.filter(
    (exception) => exception.riskLevel === "MEDIUM",
  ).length;

  const lowRiskCount = exceptions.filter(
    (exception) => exception.riskLevel === "LOW",
  ).length;

  const passAccuracyDelta =
    passData.length >= 2
      ? passData[passData.length - 1].accuracy - passData[0].accuracy
      : 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="border-b border-[#20241f] pb-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center border border-[#30352f] bg-[#10130f]">
                <BarChart3 className="h-3.5 w-3.5 text-[#9aa08f]" />
              </div>

              <span className="text-[8px] font-medium uppercase tracking-[0.22em] text-[#666c63]">
                Operations / Reconciliation
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[28px] font-semibold tracking-[-0.045em] text-[#eeece3]">
                Control overview
              </h1>

              <StatusPill status={batch.status} />
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[#666c63]">
              <span>
                Batch{" "}
                <span className="font-mono text-[#989c93]">
                  {batch.id?.slice(0, 14)}
                </span>
              </span>

              <span className="text-[#3b4039]">/</span>

              <span>{formatNumber(batch.size)} records</span>

              <span className="text-[#3b4039]">/</span>

              <span>Settlement control</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={`/exceptions?batchId=${batch.id}`}
              className="inline-flex h-9 items-center gap-2 border border-[#30352f] bg-[#0d100d] px-3 text-[10px] font-medium uppercase tracking-[0.12em] text-[#a1a59d] transition hover:border-[#4a5341] hover:text-[#d7d6cf]"
            >
              Review exceptions
              <ArrowRight className="h-3 w-3" />
            </Link>

            <Link
              href={`/audit?batchId=${batch.id}`}
              className="inline-flex h-9 items-center gap-2 border border-[#30352f] bg-[#0d100d] px-3 text-[10px] font-medium uppercase tracking-[0.12em] text-[#777d74] transition hover:border-[#4a5341] hover:text-[#b1b4ac]"
            >
              Audit trail
            </Link>
          </div>
        </div>
      </header>

      {/* Primary metrics */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[8px] font-medium uppercase tracking-[0.22em] text-[#5f655c]">
            Financial state
          </div>

          <div className="flex items-center gap-2 text-[8px] uppercase tracking-[0.16em] text-[#525850]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#98a97c]" />
            Live from persisted batch state
          </div>
        </div>

        <div className="grid grid-cols-2 gap-px overflow-hidden border border-[#252a24] bg-[#252a24] md:grid-cols-3 xl:grid-cols-6">
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
            sublabel={`${batch.unresolvedCount} currently open`}
            icon={AlertTriangle}
            accent="warning"
          />

          <MetricTile
            label="Accuracy"
            value={`${batch.accuracy}%`}
            sublabel="reconciliation result"
            icon={Target}
            accent="success"
          />

          <MetricTile
            label="Throughput"
            value={`${batch.throughputRps}/s`}
            sublabel={`${batch.processingTimeMs}ms processing`}
            icon={Zap}
          />

          <MetricTile
            label="Amount at risk"
            value={formatRupees(batch.amountAtRisk || 0)}
            sublabel="across active exceptions"
            icon={Gauge}
            accent={highRiskCount > 0 ? "risk" : "neutral"}
          />
        </div>
      </section>

      {/* Top risks */}
      <section className="border border-[#2a2e29] bg-[#0d100d]">
        <div className="flex flex-col gap-4 border-b border-[#252a24] px-5 py-4 md:flex-row md:items-end md:justify-between">
          <SectionHeader
            eyebrow="Attention queue"
            title="Priority exceptions"
            action={
              <div className="flex items-center gap-3 text-[8px] uppercase tracking-[0.14em]">
                <span className="flex items-center gap-1.5 text-[#aa7970]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#a46e66]" />
                  {highRiskCount} high
                </span>
                <span className="flex items-center gap-1.5 text-[#b2a06f]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#b09a60]" />
                  {mediumRiskCount} medium
                </span>
                <span className="flex items-center gap-1.5 text-[#70766e]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#6e766c]" />
                  {lowRiskCount} low
                </span>
              </div>
            }
          />

          <Link
            href={`/exceptions?batchId=${batch.id}`}
            className="inline-flex items-center gap-1 text-[9px] font-medium uppercase tracking-[0.14em] text-[#8f9a80] transition hover:text-[#bcc6aa]"
          >
            View all
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {topRisks.length === 0 ? (
          <div className="px-5 py-10">
            <div className="flex items-center gap-3 text-sm text-[#70766e]">
              <CheckCircle2 className="h-4 w-4 text-[#8fa17a]" />
              No active exceptions awaiting review.
            </div>
          </div>
        ) : (
          <div className="divide-y divide-[#20241f]">
            {topRisks.map((exception, index) => {
              const risk =
                exception.riskLevel === "HIGH"
                  ? "HIGH"
                  : exception.riskLevel === "MEDIUM"
                    ? "MEDIUM"
                    : "LOW";

              const riskClass =
                risk === "HIGH"
                  ? "text-[#b78177]"
                  : risk === "MEDIUM"
                    ? "text-[#baa56f]"
                    : "text-[#87977a]";

              const dotClass =
                risk === "HIGH"
                  ? "bg-[#a26c63]"
                  : risk === "MEDIUM"
                    ? "bg-[#ad975d]"
                    : "bg-[#77886c]";

              return (
                <Link
                  key={exception.id}
                  href={`/exceptions/${batch.id}/${exception.id}`}
                  className="group grid grid-cols-[30px_minmax(0,1fr)_auto_auto] items-center gap-4 px-5 py-4 transition hover:bg-[#11150f]"
                >
                  <span className="font-mono text-[9px] text-[#4f554d]">
                    {String(index + 1).padStart(2, "0")}
                  </span>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[12px] font-medium text-[#d5d4cd]">
                        {formatExceptionType(exception.exceptionType)}
                      </span>

                      <span className="text-[8px] uppercase tracking-[0.12em] text-[#5d635a]">
                        {exception.status || "OPEN"}
                      </span>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="truncate font-mono text-[9px] text-[#5e645b]">
                        {exception.paymentId || "No payment reference"}
                      </span>

                      {exception.confidenceScore !== undefined ? (
                        <>
                          <span className="text-[#363b35]">/</span>
                          <span className="text-[9px] text-[#686f64]">
                            {exception.confidenceScore}% confidence
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <div className="hidden text-right sm:block">
                    <div className="text-[11px] font-medium text-[#c7b68a]">
                      {formatRupees(exception.amount)}
                    </div>

                    {exception.mismatchAmount ? (
                      <div className="mt-0.5 font-mono text-[8px] text-[#656b62]">
                        Δ {formatRupees(exception.mismatchAmount)}
                      </div>
                    ) : null}
                  </div>

                  <div className={`flex items-center gap-2 text-[8px] font-medium uppercase tracking-[0.14em] ${riskClass}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
                    {risk}
                    <ArrowRight className="h-3 w-3 text-[#474d45] transition-transform group-hover:translate-x-0.5" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Reconciliation engine */}
      {passData.length > 0 ? (
        <section className="border border-[#2a2e29] bg-[#0d100d]">
          <div className="border-b border-[#252a24] px-5 py-4">
            <SectionHeader
              eyebrow="Decision pipeline"
              title="Reconciliation engine"
              action={
                <div className="flex items-center gap-2 text-[8px] uppercase tracking-[0.15em] text-[#62685f]">
                  <Brain className="h-3 w-3 text-[#8e947e]" />
                  Deterministic → grounded AI
                </div>
              }
            />
          </div>

          <div className="p-5">
            <div className="grid grid-cols-1 gap-px overflow-hidden border border-[#252a24] bg-[#252a24] md:grid-cols-3">
              {multiPass?.passes?.map((pass, index) => {
                const previous = multiPass.passes?.[index - 1];
                const delta = previous
                  ? pass.accuracy - previous.accuracy
                  : null;

                return (
                  <div key={pass.passNumber} className="bg-[#0a0d0a] p-5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[8px] font-medium uppercase tracking-[0.16em] text-[#6c7269]">
                        Pass {String(pass.passNumber).padStart(2, "0")}
                      </span>

                      <span
                        className={`text-[8px] uppercase tracking-[0.14em] ${
                          pass.aiUsed
                            ? "text-[#9c9478]"
                            : "text-[#87977a]"
                        }`}
                      >
                        {pass.aiUsed ? "AI assisted" : "Deterministic"}
                      </span>
                    </div>

                    <div className="mt-3 text-[11px] font-medium text-[#c4c3ba]">
                      {pass.name}
                    </div>

                    <div className="mt-4 flex items-end gap-2">
                      <span className="text-[30px] font-semibold tracking-[-0.05em] text-[#eceae1]">
                        {pass.accuracy}%
                      </span>

                      {delta !== null && delta !== 0 ? (
                        <span
                          className={`mb-1 text-[9px] font-medium ${
                            delta > 0
                              ? "text-[#9caf83]"
                              : "text-[#b57a70]"
                          }`}
                        >
                          {delta > 0 ? "+" : ""}
                          {delta.toFixed(1)}%
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-2 text-[9px] text-[#5f655c]">
                      {formatNumber(pass.autoMatched)} matched
                      <span className="mx-1.5 text-[#333833]">·</span>
                      {formatNumber(pass.exceptions)} exceptions
                      <span className="mx-1.5 text-[#333833]">·</span>
                      {pass.durationMs}ms
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between text-[8px] uppercase tracking-[0.16em] text-[#5e645b]">
                <span>Accuracy progression</span>
                <span>
                  {passAccuracyDelta >= 0 ? "+" : ""}
                  {passAccuracyDelta.toFixed(1)}pp overall
                </span>
              </div>

              <div className="h-[190px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={passData}>
                    <CartesianGrid
                      stroke="#20241f"
                      strokeDasharray="2 6"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="name"
                      tick={AXIS_STYLE}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      domain={[95, 100]}
                      tick={AXIS_STYLE}
                      tickLine={false}
                      axisLine={false}
                      width={34}
                    />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Line
                      type="monotone"
                      dataKey="accuracy"
                      stroke="#b4c58d"
                      strokeWidth={2}
                      dot={{
                      fill: "#b4c58d",
                      stroke: "#b4c58d",
                      r: 3,
                      }}
                      activeDot={{
                        fill: "#d5dcc5",
                        stroke: "#9caf83",
                        strokeWidth: 2,
                        r: 4,
                      }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* Analysis */}
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Exception mix */}
        <div className="border border-[#2a2e29] bg-[#0d100d]">
          <div className="border-b border-[#252a24] px-5 py-4">
            <SectionHeader
              eyebrow="Exception analysis"
              title="Exception mix"
            />
          </div>

          <div className="p-5">
            {pieData.length > 0 ? (
              <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-[1fr_170px]">
                <div className="h-[245px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={62}
                        outerRadius={88}
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

                <div className="space-y-2">
                  {pieData.slice(0, 7).map((item, index) => (
                    <div
                      key={item.name}
                      className="flex items-center justify-between gap-3"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{
                            backgroundColor:
                              CHART_COLORS[index % CHART_COLORS.length],
                          }}
                        />

                        <span className="truncate text-[9px] text-[#737970]">
                          {item.name}
                        </span>
                      </div>

                      <span className="font-mono text-[9px] text-[#a1a69c]">
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="py-10 text-center text-xs text-[#61675e]">
                No exceptions recorded.
              </div>
            )}
          </div>
        </div>

        {/* Amount at risk */}
        <div className="border border-[#2a2e29] bg-[#0d100d]">
          <div className="border-b border-[#252a24] px-5 py-4">
            <SectionHeader
              eyebrow="Exposure analysis"
              title="Amount at risk by type"
            />
          </div>

          <div className="p-5">
            {barData.length > 0 ? (
              <div className="h-[285px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={barData}
                    layout="vertical"
                    margin={{ left: 4, right: 12, top: 6, bottom: 6 }}
                  >
                    <CartesianGrid
                      stroke="#20241f"
                      horizontal={false}
                    />

                    <XAxis
                      type="number"
                      tick={AXIS_STYLE}
                      tickLine={false}
                      axisLine={false}
                    />

                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={AXIS_STYLE}
                      width={112}
                      tickLine={false}
                      axisLine={false}
                    />

                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(value) => [
                        `₹${Number(value ?? 0).toLocaleString("en-IN")}`,
                        "Exposure",
                      ]}
                    />

                    <Bar
                      dataKey="amount"
                      fill="#b39a72"
                      radius={[0, 2, 2, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="py-10 text-center text-xs text-[#61675e]">
                No exposure data.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Trust + adversarial */}
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Calibration */}
        {calibrationData.length > 0 ? (
          <div className="border border-[#2a2e29] bg-[#0d100d]">
            <div className="border-b border-[#252a24] px-5 py-4">
              <SectionHeader
                eyebrow="Model reliability"
                title="Confidence calibration"
              />
            </div>

            <div className="p-5">
              <div className="h-[210px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={calibrationData}>
                    <CartesianGrid
                      stroke="#20241f"
                      strokeDasharray="2 6"
                      vertical={false}
                    />

                    <XAxis
                      dataKey="range"
                      tick={AXIS_STYLE}
                      tickLine={false}
                      axisLine={false}
                    />

                    <YAxis
                      domain={[0, 100]}
                      tick={AXIS_STYLE}
                      tickLine={false}
                      axisLine={false}
                      width={34}
                    />

                    <Tooltip contentStyle={TOOLTIP_STYLE} />

                    <Bar
                      dataKey="accuracy"
                      fill="#9fb381"
                      radius={[2, 2, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-3 border-t border-[#20241f] pt-3 text-[9px] leading-5 text-[#656b62]">
                At 81–100% reported confidence, the current calibration
                bucket is{" "}
                <span className="text-[#aeb7a0]">
                  {calibrationData.find(
                    (calibration) => calibration.range === "81-100",
                  )?.accuracy || 0}
                  %
                </span>{" "}
                accurate.
              </div>
            </div>
          </div>
        ) : null}

        {/* Adversarial */}
        {multiPass?.adversarial ? (
          <div className="border border-[#2a2e29] bg-[#0d100d]">
            <div className="border-b border-[#252a24] px-5 py-4">
              <SectionHeader
                eyebrow="Control integrity"
                title="Adversarial self-test"
                action={
                  <span className="inline-flex items-center gap-1.5 text-[8px] uppercase tracking-[0.14em] text-[#92a17f]">
                    <ShieldCheck className="h-3 w-3" />
                    Verified
                  </span>
                }
              />
            </div>

            <div className="p-5">
              <div className="flex items-end gap-4">
                <div className="text-[42px] font-semibold tracking-[-0.06em] text-[#eceae1]">
                  {multiPass.adversarial.detected}
                  <span className="text-[#565c53]">
                    /{multiPass.adversarial.totalTests}
                  </span>
                </div>

                <div className="mb-2">
                  <div className="text-[10px] uppercase tracking-[0.15em] text-[#8f9886]">
                    injected errors detected
                  </div>
                  <div className="mt-1 text-[9px] text-[#5f655d]">
                    {multiPass.adversarial.detectionRate}% detection rate
                  </div>
                </div>
              </div>

              <div className="mt-6 space-y-2">
                {multiPass.adversarial.tests?.map((test, index) => (
                  <div
                    key={`${test.testName}-${index}`}
                    className="flex items-center justify-between border-b border-[#1e231e] pb-2 last:border-b-0"
                  >
                    <div className="min-w-0 pr-4 text-[9px] text-[#7b8178]">
                      {test.testName}
                    </div>

                    {test.detected ? (
                      <div className="flex items-center gap-1.5 text-[8px] uppercase tracking-[0.13em] text-[#92a17f]">
                        <CheckCircle2 className="h-3 w-3" />
                        Detected
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-[8px] uppercase tracking-[0.13em] text-[#a26f67]">
                        <AlertTriangle className="h-3 w-3" />
                        Not detected
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {/* Batch snapshot */}
      <section className="border border-[#2a2e29] bg-[#0d100d]">
        <div className="border-b border-[#252a24] px-5 py-4">
          <SectionHeader
            eyebrow="Batch record"
            title="Final reconciliation snapshot"
            action={
              <div className="flex items-center gap-1.5 text-[8px] uppercase tracking-[0.14em] text-[#62685f]">
                <Clock3 className="h-3 w-3" />
                {batch.processingTimeMs}ms processing
              </div>
            }
          />
        </div>

        <div className="grid grid-cols-2 gap-px bg-[#252a24] md:grid-cols-4">
          <div className="bg-[#0a0d0a] px-5 py-5">
            <div className="text-[8px] uppercase tracking-[0.17em] text-[#61675e]">
              Amount at risk
            </div>
            <div className="mt-2 text-xl font-semibold tracking-[-0.035em] text-[#c4ae7d]">
              {formatRupees(batch.amountAtRisk || 0)}
            </div>
            <div className="mt-1 text-[9px] text-[#555b53]">
              across active exceptions
            </div>
          </div>

          <div className="bg-[#0a0d0a] px-5 py-5">
            <div className="text-[8px] uppercase tracking-[0.17em] text-[#61675e]">
              Processing time
            </div>
            <div className="mt-2 text-xl font-semibold tracking-[-0.035em] text-[#c5c8c0]">
              {batch.processingTimeMs}ms
            </div>
            <div className="mt-1 text-[9px] text-[#555b53]">
              reconciliation pipeline
            </div>
          </div>

          <div className="bg-[#0a0d0a] px-5 py-5">
            <div className="text-[8px] uppercase tracking-[0.17em] text-[#61675e]">
              Auto-match rate
            </div>
            <div className="mt-2 text-xl font-semibold tracking-[-0.035em] text-[#a9b78f]">
              {autoMatchRate}%
            </div>
            <div className="mt-1 text-[9px] text-[#555b53]">
              records matched automatically
            </div>
          </div>

          <div className="bg-[#0a0d0a] px-5 py-5">
            <div className="text-[8px] uppercase tracking-[0.17em] text-[#61675e]">
              Open review
            </div>
            <div className="mt-2 text-xl font-semibold tracking-[-0.035em] text-[#c6aa77]">
              {formatNumber(batch.unresolvedCount)}
            </div>
            <div className="mt-1 text-[9px] text-[#555b53]">
              exceptions requiring attention
            </div>
          </div>
        </div>
      </section>

      {/* Footer status */}
      <div className="flex flex-col gap-3 border-t border-[#20241f] pt-4 text-[8px] uppercase tracking-[0.16em] text-[#4f554d] sm:flex-row sm:items-center sm:justify-between">
        <span>
          SettleMate AI / Reconciliation Control Plane
        </span>

        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <Fingerprint className="h-3 w-3" />
            Batch state persisted
          </span>

          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-3 w-3" />
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
          <Loader2 className="h-5 w-5 animate-spin text-[#9caf83]" />
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
} 