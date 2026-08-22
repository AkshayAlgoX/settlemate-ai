"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { EXCEPTION_LABELS, type ExceptionType } from "@/lib/constants";
import { formatCurrency } from "@/lib/format";

interface ExceptionItem {
  id: string;
  batchId: string;
  exceptionType: ExceptionType;
  paymentId: string | null;
  orderId: string | null;
  settlementId: string | null;
  amount: number;
  mismatchAmount: number | null;
  confidenceScore: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  status: string;
  suggestedAction: string | null;
  createdAt: string;
}

interface Summary {
  totalAmountAtRisk: number;
  highRiskCount: number;
  mediumRiskCount: number;
  lowRiskCount: number;
}

const WORKFLOW_STATES = [
  "OPEN",
  "INVESTIGATING",
  "PENDING_APPROVAL",
  "ESCALATED",
  "RESOLVED",
  "REJECTED",
  "REOPENED",
];

function formatType(value: string) {
  return (
    EXCEPTION_LABELS[value as ExceptionType] ||
    value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function RiskBadge({ risk }: { risk: string }) {
  const config = {
    HIGH: {
      label: "High",
      text: "text-[#c88679]",
      border: "border-[#5a3b36]",
      bg: "bg-[#180f0d]",
      dot: "bg-[#b77167]",
    },
    MEDIUM: {
      label: "Medium",
      text: "text-[#c6af77]",
      border: "border-[#5b4d32]",
      bg: "bg-[#171309]",
      dot: "bg-[#b69a5d]",
    },
    LOW: {
      label: "Low",
      text: "text-[#a3b289]",
      border: "border-[#3b4935]",
      bg: "bg-[#10150f]",
      dot: "bg-[#879c72]",
    },
  }[risk as "HIGH" | "MEDIUM" | "LOW"] || {
    label: risk,
    text: "text-[#929890]",
    border: "border-[#333832]",
    bg: "bg-[#10130f]",
    dot: "bg-[#747b72]",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.15em] ${config.border} ${config.bg} ${config.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<
    string,
    { text: string; border: string; bg: string }
  > = {
    OPEN: {
      text: "text-[#a6aaa1]",
      border: "border-[#3b4039]",
      bg: "bg-[#111410]",
    },
    INVESTIGATING: {
      text: "text-[#a7b49a]",
      border: "border-[#414c39]",
      bg: "bg-[#12160f]",
    },
    PENDING_APPROVAL: {
      text: "text-[#c4ad76]",
      border: "border-[#564a31]",
      bg: "bg-[#17130b]",
    },
    ESCALATED: {
      text: "text-[#c58378]",
      border: "border-[#533b36]",
      bg: "bg-[#170f0d]",
    },
    RESOLVED: {
      text: "text-[#9eb281]",
      border: "border-[#394936]",
      bg: "bg-[#10150e]",
    },
    REJECTED: {
      text: "text-[#c07f77]",
      border: "border-[#503834]",
      bg: "bg-[#170f0d]",
    },
    REOPENED: {
      text: "text-[#b1a47f]",
      border: "border-[#4e4532]",
      bg: "bg-[#14120d]",
    },
  };

  const style = config[status] || {
    text: "text-[#8e948c]",
    border: "border-[#343934]",
    bg: "bg-[#111410]",
  };

  return (
    <span
      className={`inline-flex whitespace-nowrap border px-2 py-1 text-[8px] font-medium uppercase tracking-[0.12em] ${style.border} ${style.bg} ${style.text}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

function StatBlock({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  detail?: string;
  tone?: "neutral" | "risk" | "warning" | "safe";
}) {
  const valueColor = {
    neutral: "text-[#ece9df]",
    risk: "text-[#c78678]",
    warning: "text-[#c6ad73]",
    safe: "text-[#a6b78b]",
  }[tone];

  return (
    <div className="border-r border-[#252a24] px-5 py-5 last:border-r-0">
      <div className="text-[8px] font-medium uppercase tracking-[0.2em] text-[#666d63]">
        {label}
      </div>

      <div
        className={`mt-3 text-[25px] font-semibold tracking-[-0.045em] ${valueColor}`}
      >
        {value}
      </div>

      {detail ? (
        <div className="mt-1 text-[9px] text-[#5f655c]">{detail}</div>
      ) : null}
    </div>
  );
}
function PremiumSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    const close = () => setOpen(false);
    window.addEventListener("click", close);

    return () => window.removeEventListener("click", close);
  }, [open]);

  const selected =
    options.find((option) => option.value === value)?.label || value;

  return (
    <div
      className="relative bg-[#0a0d0a] p-4"
      onClick={(e) => e.stopPropagation()}
    >
      <label className="mb-2 block text-[8px] font-medium uppercase tracking-[0.18em] text-[#687066]">
        {label}
      </label>

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`flex h-10 w-full items-center justify-between border px-3 text-left transition ${
          open
            ? "border-[#697557] bg-[#11150f]"
            : "border-[#30352f] bg-[#10130f] hover:border-[#4a5342]"
        }`}
      >
        <span className="truncate text-[11px] text-[#c4c5bd]">
          {selected}
        </span>

        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-[#777e73] transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="absolute left-4 right-4 top-[76px] z-50 overflow-hidden border border-[#41483a] bg-[#0b0e0b] shadow-[0_20px_45px_rgba(0,0,0,0.55)]">
          <div className="max-h-[280px] overflow-y-auto py-1">
            {options.map((option) => {
              const active = option.value === value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2.5 text-left transition ${
                    active
                      ? "bg-[#171d13] text-[#e0e0d7]"
                      : "text-[#9b9e96] hover:bg-[#131711] hover:text-[#d8d7cf]"
                  }`}
                >
                  <span className="text-[11px]">
                    {option.label}
                  </span>

                  {active && (
                    <Check className="h-3.5 w-3.5 text-[#aab88d]" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ExceptionsQueueContent() {
  const searchParams = useSearchParams();

  const [batchId, setBatchId] = useState<string | null>(
    searchParams.get("batchId"),
  );

  const [exceptions, setExceptions] = useState<ExceptionItem[]>([]);
  const [summary, setSummary] = useState<Summary>({
    totalAmountAtRisk: 0,
    highRiskCount: 0,
    mediumRiskCount: 0,
    lowRiskCount: 0,
  });

  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterRisk, setFilterRisk] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (batchId) return;

    let active = true;

    fetch("/api/batches")
      .then((res) => res.json())
      .then((data: { batches?: { id: string }[] }) => {
        if (!active) return;

        if (data.batches && data.batches.length > 0) {
          setBatchId(data.batches[0].id);
        } else {
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [batchId]);

  useEffect(() => {
    if (!batchId) return;

    let active = true;

    const query = new URLSearchParams();

    if (filterType !== "ALL") query.set("type", filterType);
    if (filterStatus !== "ALL") query.set("status", filterStatus);
    if (filterRisk !== "ALL") query.set("risk", filterRisk);

    // Reset the spinner outside the synchronous effect frame; the fetch's own
    // async completion clears it (react-hooks/set-state-in-effect).
    queueMicrotask(() => setLoading(true));

    fetch(`/api/exceptions/${batchId}?${query.toString()}`)
      .then((res) => res.json())
      .then(
        (data: {
          success: boolean;
          exceptions: ExceptionItem[];
          summary: Summary;
        }) => {
          if (!active) return;

          if (data.success) {
            setExceptions(data.exceptions);
            setSummary(data.summary);
          }

          setLoading(false);
        },
      )
      .catch((error) => {
        console.error(error);

        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [batchId, filterType, filterStatus, filterRisk]);

  const filteredExceptions = exceptions.filter((exception) => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) return true;

    return [
      exception.paymentId,
      exception.orderId,
      exception.settlementId,
      exception.exceptionType,
      exception.status,
    ].some((value) => value?.toLowerCase().includes(query));
  });

  const activeFilterCount =
    Number(filterType !== "ALL") +
    Number(filterStatus !== "ALL") +
    Number(filterRisk !== "ALL");

  const clearFilters = () => {
    setFilterType("ALL");
    setFilterStatus("ALL");
    setFilterRisk("ALL");
  };

  return (
    <div className="space-y-7">
      {/* Header */}
      <header className="border-b border-[#20241f] pb-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center border border-[#343a31] bg-[#10130f]">
                <AlertTriangle className="h-3.5 w-3.5 text-[#b8a170]" />
              </div>

              <span className="text-[8px] font-medium uppercase tracking-[0.22em] text-[#666d63]">
                Operations / Exceptions
              </span>
            </div>

            <h1 className="text-[28px] font-semibold tracking-[-0.045em] text-[#eeece4]">
              Exception queue
            </h1>

            <p className="mt-2 max-w-2xl text-[11px] leading-5 text-[#737971]">
              Review, investigate, and progress settlement exceptions through
              the controlled financial workflow.
            </p>
          </div>

          {batchId ? (
            <div className="border border-[#30352f] bg-[#0e110e] px-3 py-2">
              <div className="text-[7px] font-medium uppercase tracking-[0.18em] text-[#62685f]">
                Active batch
              </div>

              <div className="mt-1 font-mono text-[9px] text-[#a5a99f]">
                {batchId.slice(0, 18)}...
              </div>
            </div>
          ) : null}
        </div>
      </header>

      {/* Risk overview */}
      <section className="border border-[#2a2e29] bg-[#0d100d]">
        <div className="border-b border-[#252a24] px-5 py-4">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-3.5 w-3.5 text-[#8f987c]" />

            <span className="text-[8px] font-medium uppercase tracking-[0.2em] text-[#626960]">
              Risk overview
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-px bg-[#252a24] md:grid-cols-4">
          <div className="bg-[#0b0e0b]">
            <StatBlock
              label="Amount at risk"
              value={formatCurrency(summary.totalAmountAtRisk)}
              detail="filtered exception exposure"
              tone="risk"
            />
          </div>

          <div className="bg-[#0b0e0b]">
            <StatBlock
              label="High risk"
              value={summary.highRiskCount}
              detail="requires highest scrutiny"
              tone="risk"
            />
          </div>

          <div className="bg-[#0b0e0b]">
            <StatBlock
              label="Medium risk"
              value={summary.mediumRiskCount}
              detail="requires investigation"
              tone="warning"
            />
          </div>

          <div className="bg-[#0b0e0b]">
            <StatBlock
              label="Low risk"
              value={summary.lowRiskCount}
              detail="lower priority exceptions"
              tone="safe"
            />
          </div>
        </div>
      </section>

      {/* Controls */}
      <section className="border border-[#2a2e29] bg-[#0d100d]">
        <div className="flex flex-col gap-4 border-b border-[#252a24] px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="text-[8px] font-medium uppercase tracking-[0.2em] text-[#626960]">
              Investigation filters
            </div>

            <div className="mt-1 flex items-center gap-2">
              <span className="text-[12px] text-[#cccac2]">
                {filteredExceptions.length} visible exceptions
              </span>

              {activeFilterCount > 0 ? (
                <span className="border border-[#4a533d] bg-[#11160f] px-2 py-0.5 text-[8px] uppercase tracking-[0.12em] text-[#aeb98f]">
                  {activeFilterCount} active
                </span>
              ) : null}
            </div>
          </div>

          {activeFilterCount > 0 ? (
            <button
              onClick={clearFilters}
              className="inline-flex items-center gap-1.5 text-[8px] font-medium uppercase tracking-[0.15em] text-[#858b82] transition hover:text-[#d1d0c8]"
            >
              <X className="h-3 w-3" />
              Clear filters
            </button>
          ) : null}
        </div>

        <div className="grid gap-px bg-[#252a24] md:grid-cols-2 xl:grid-cols-4">
  <PremiumSelect
    label="Exception type"
    value={filterType}
    onChange={setFilterType}
    options={[
      { value: "ALL", label: "All exception types" },
      ...Object.entries(EXCEPTION_LABELS).map(([key, label]) => ({
        value: key,
        label,
      })),
    ]}
  />

  <PremiumSelect
    label="Workflow state"
    value={filterStatus}
    onChange={setFilterStatus}
    options={[
      { value: "ALL", label: "All workflow states" },
      ...WORKFLOW_STATES.map((state) => ({
        value: state,
        label: state.replace(/_/g, " "),
      })),
    ]}
  />

  <PremiumSelect
    label="Risk level"
    value={filterRisk}
    onChange={setFilterRisk}
    options={[
      { value: "ALL", label: "All risk levels" },
      { value: "HIGH", label: "High" },
      { value: "MEDIUM", label: "Medium" },
      { value: "LOW", label: "Low" },
    ]}
  />

  <div className="bg-[#0a0d0a] p-4">
    <div className="mb-2 flex items-center justify-between">
      <label className="text-[8px] font-medium uppercase tracking-[0.18em] text-[#687066]">
        Search records
      </label>

      {searchQuery && (
        <button
          type="button"
          onClick={() => setSearchQuery("")}
          className="text-[8px] uppercase tracking-[0.13em] text-[#666d63] transition hover:text-[#b5b9af]"
        >
          Clear
        </button>
      )}
    </div>

    <div
      className={`flex h-10 items-center border bg-[#10130f] transition ${
        searchQuery
          ? "border-[#687557]"
          : "border-[#30352f] hover:border-[#4a5342]"
      }`}
    >
      <Search className="ml-3 h-3.5 w-3.5 shrink-0 text-[#697067]" />

      <input
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Payment, order or settlement ID"
        className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-[11px] text-[#d0cec5] outline-none placeholder:text-[#50564e]"
      />

      <span className="mr-3 hidden border border-[#30352f] px-1.5 py-0.5 text-[7px] uppercase tracking-[0.12em] text-[#535a51] sm:inline-block">
        Search
      </span>
    </div>
  </div>
</div>
      </section>

      {/* Queue */}
      <section className="border border-[#2a2e29] bg-[#0d100d]">
        <div className="flex items-center justify-between border-b border-[#252a24] px-5 py-4">
          <div>
            <div className="text-[8px] font-medium uppercase tracking-[0.2em] text-[#626960]">
              Investigation queue
            </div>

            <div className="mt-1 text-[13px] font-semibold text-[#d9d7cf]">
              Exceptions requiring action
            </div>
          </div>

          <span className="text-[8px] uppercase tracking-[0.15em] text-[#555b52]">
            {filteredExceptions.length} records
          </span>
        </div>

        {loading ? (
          <div className="flex min-h-[360px] items-center justify-center">
            <div className="text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center border border-[#30352f] bg-[#10130f]">
                <Loader2 className="h-4 w-4 animate-spin text-[#a5b47f]" />
              </div>

              <p className="mt-4 text-[9px] font-medium uppercase tracking-[0.18em] text-[#666c63]">
                Loading exception queue
              </p>
            </div>
          </div>
        ) : filteredExceptions.length === 0 ? (
          <div className="flex min-h-[360px] flex-col items-center justify-center px-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center border border-[#394736] bg-[#10150f]">
              <CheckCircle2 className="h-5 w-5 text-[#9daf83]" />
            </div>

            <h3 className="mt-5 text-[15px] font-semibold text-[#d9d7cf]">
              Queue is clear
            </h3>

            <p className="mt-2 max-w-sm text-[11px] leading-5 text-[#656b62]">
              No exceptions match the current investigation criteria.
            </p>

            {activeFilterCount > 0 || searchQuery ? (
              <button
                onClick={() => {
                  clearFilters();
                  setSearchQuery("");
                }}
                className="mt-5 border border-[#343a31] px-4 py-2 text-[9px] font-medium uppercase tracking-[0.14em] text-[#aab095] hover:bg-[#131710]"
              >
                Reset view
              </button>
            ) : null}
          </div>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[900px] border-collapse">
                <thead>
                  <tr className="border-b border-[#252a24] bg-[#0a0d0a]">
                    <th className="px-5 py-3 text-left text-[8px] font-medium uppercase tracking-[0.16em] text-[#5e645b]">
                      Exception
                    </th>

                    <th className="px-4 py-3 text-left text-[8px] font-medium uppercase tracking-[0.16em] text-[#5e645b]">
                      Reference
                    </th>

                    <th className="px-4 py-3 text-right text-[8px] font-medium uppercase tracking-[0.16em] text-[#5e645b]">
                      Exposure
                    </th>

                    <th className="px-4 py-3 text-left text-[8px] font-medium uppercase tracking-[0.16em] text-[#5e645b]">
                      Confidence
                    </th>

                    <th className="px-4 py-3 text-left text-[8px] font-medium uppercase tracking-[0.16em] text-[#5e645b]">
                      Risk
                    </th>

                    <th className="px-4 py-3 text-left text-[8px] font-medium uppercase tracking-[0.16em] text-[#5e645b]">
                      Workflow
                    </th>

                    <th className="px-5 py-3 text-right text-[8px] font-medium uppercase tracking-[0.16em] text-[#5e645b]">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {filteredExceptions.map((item, index) => (
                    <tr
                      key={item.id}
                      className="group border-b border-[#1d211d] transition hover:bg-[#10140f]"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-start gap-3">
                          <span className="pt-0.5 font-mono text-[8px] text-[#4d534b]">
                            {String(index + 1).padStart(2, "0")}
                          </span>

                          <div>
                            <div className="text-[11px] font-medium text-[#d7d5cd]">
                              {formatType(item.exceptionType)}
                            </div>

                            <div className="mt-1 max-w-[210px] truncate text-[9px] text-[#62685f]">
                              {item.suggestedAction || "Investigation required"}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-4">
                        <div className="font-mono text-[9px] text-[#8b9088]">
                          {item.paymentId ||
                            item.settlementId ||
                            item.orderId ||
                            "N/A"}
                        </div>

                        {item.paymentId && item.settlementId ? (
                          <div className="mt-1 text-[8px] text-[#50564e]">
                            settlement linked
                          </div>
                        ) : null}
                      </td>

                      <td className="px-4 py-4 text-right">
                        <div className="text-[11px] font-medium text-[#c4b17c]">
                          {formatCurrency(item.amount)}
                        </div>

                        {item.mismatchAmount ? (
                          <div className="mt-1 text-[8px] text-[#a77a6f]">
                            Δ {formatCurrency(item.mismatchAmount)}
                          </div>
                        ) : (
                          <div className="mt-1 text-[8px] text-[#4f554d]">
                            no variance
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-[70px] overflow-hidden bg-[#232823]">
                            <div
                              className={`h-full ${
                                item.confidenceScore >= 80
                                  ? "bg-[#91a577]"
                                  : item.confidenceScore >= 50
                                    ? "bg-[#b7a06b]"
                                    : "bg-[#a66d64]"
                              }`}
                              style={{
                                width: `${Math.min(
                                  100,
                                  Math.max(0, item.confidenceScore),
                                )}%`,
                              }}
                            />
                          </div>

                          <span className="font-mono text-[9px] text-[#858b82]">
                            {item.confidenceScore}%
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-4">
                        <RiskBadge risk={item.riskLevel} />
                      </td>

                      <td className="px-4 py-4">
                        <StatusBadge status={item.status} />
                      </td>

                      <td className="px-5 py-4 text-right">
                        <Link
                          href={`/exceptions/${batchId}/${item.id}`}
                          className="inline-flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-[0.13em] text-[#aab48e] transition hover:text-[#d0d8bc]"
                        >
                          Investigate
                          <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="divide-y divide-[#1e231e] md:hidden">
              {filteredExceptions.map((item, index) => (
                <Link
                  key={item.id}
                  href={`/exceptions/${batchId}/${item.id}`}
                  className="block p-4 transition hover:bg-[#10140f]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[8px] text-[#4f554d]">
                          {String(index + 1).padStart(2, "0")}
                        </span>

                        <span className="truncate text-[11px] font-medium text-[#d7d5cd]">
                          {formatType(item.exceptionType)}
                        </span>
                      </div>

                      <div className="mt-2 truncate font-mono text-[9px] text-[#686e65]">
                        {item.paymentId ||
                          item.settlementId ||
                          item.orderId ||
                          "N/A"}
                      </div>
                    </div>

                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-[#51584e]" />
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[8px] uppercase tracking-[0.13em] text-[#555b52]">
                        Exposure
                      </div>

                      <div className="mt-1 text-[11px] text-[#c4b17c]">
                        {formatCurrency(item.amount)}
                      </div>
                    </div>

                    <div>
                      <div className="text-[8px] uppercase tracking-[0.13em] text-[#555b52]">
                        Confidence
                      </div>

                      <div className="mt-1 text-[11px] text-[#9ca198]">
                        {item.confidenceScore}%
                      </div>
                    </div>

                    <div>
                      <div className="text-[8px] uppercase tracking-[0.13em] text-[#555b52]">
                        Risk
                      </div>

                      <div className="mt-1">
                        <RiskBadge risk={item.riskLevel} />
                      </div>
                    </div>

                    <div>
                      <div className="text-[8px] uppercase tracking-[0.13em] text-[#555b52]">
                        Workflow
                      </div>

                      <div className="mt-1">
                        <StatusBadge status={item.status} />
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

export default function ExceptionsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[70vh] items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-[#a5b47f]" />
        </div>
      }
    >
      <ExceptionsQueueContent />
    </Suspense>
  );
}