"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronRight,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { EXCEPTION_LABELS, type ExceptionType } from "@/lib/constants";
import { formatCurrency } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Badge } from "@/components/ui/badge";
import { Dropdown } from "@/components/ui/dropdown";

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
    neutral: "text-foreground",
    risk: "text-[#ef4444]",
    warning: "text-foreground",
    safe: "text-[#10b981]",
  }[tone];

  return (
    <div className="p-4 space-y-1">
      <div className={`text-2xl font-semibold font-mono tracking-tight ${valueColor}`}>
        {value}
      </div>
      <div className="text-xs font-medium text-foreground">
        {label}
      </div>
      {detail ? (
        <div className="text-[11px] text-muted-foreground/70">{detail}</div>
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
  return (
    <div className="rounded-md border border-border bg-background p-3 space-y-1.5 text-xs">
      <label className="text-muted-foreground block font-medium">
        {label}
      </label>
      <Dropdown
        value={value}
        onValueChange={onChange}
        options={options}
        size="sm"
        triggerClassName="w-full text-xs"
      />
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
  const [sortBy, setSortBy] = useState("risk");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [pageSize, setPageSize] = useState(50);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);

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
    if (searchQuery.trim()) query.set("search", searchQuery.trim());
    query.set("sortBy", sortBy);
    query.set("sortOrder", sortOrder);
    query.set("page", String(page));
    query.set("pageSize", String(pageSize));

    queueMicrotask(() => setLoading(true));

    fetch(`/api/exceptions/${batchId}?${query.toString()}`)
      .then((res) => res.json())
      .then(
        (data: {
          success: boolean;
          exceptions: ExceptionItem[];
          summary: Summary;
          page?: number;
          totalPages?: number;
          totalCount?: number;
          hasNext?: boolean;
          hasPrev?: boolean;
        }) => {
          if (!active) return;

          if (data.success) {
            setExceptions(data.exceptions);
            setSummary(data.summary);
            if (data.totalPages !== undefined) setTotalPages(data.totalPages);
            if (data.totalCount !== undefined) setTotalCount(data.totalCount);
            if (data.hasNext !== undefined) setHasNext(data.hasNext);
            if (data.hasPrev !== undefined) setHasPrev(data.hasPrev);
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
  }, [batchId, filterType, filterStatus, filterRisk, searchQuery, sortBy, sortOrder, pageSize, page]);

  const activeFilterCount =
    Number(filterType !== "ALL") +
    Number(filterStatus !== "ALL") +
    Number(filterRisk !== "ALL") +
    Number(searchQuery.trim() !== "");

  const clearFilters = () => {
    setFilterType("ALL");
    setFilterStatus("ALL");
    setFilterRisk("ALL");
  };

  return (
    <div className="space-y-10 pb-12">
      {/* Header */}
      <PageHeader
        tag="Operations"
        title="Exception queue"
        description="Review, triage, and resolve settlement exceptions through deterministic multi-step audit verification."
        badge={<Badge variant="outline">{batchId ? `Batch ${batchId.slice(0, 14)}...` : "Active Batch"}</Badge>}
      />

      {/* Risk Overview Grid */}
      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border p-4">
          <SectionHeader
            title="Exposure overview"
            description="Filtered exception amounts categorized by severity"
            className="border-b-0 pb-0"
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-border">
          <StatBlock
            label="Amount at risk"
            value={formatCurrency(summary.totalAmountAtRisk)}
            detail="Filtered exception exposure"
            tone="risk"
          />
          <StatBlock
            label="High risk"
            value={summary.highRiskCount}
            detail="Highest scrutiny required"
            tone="risk"
          />
          <StatBlock
            label="Medium risk"
            value={summary.mediumRiskCount}
            detail="Investigation required"
            tone="warning"
          />
          <StatBlock
            label="Low risk"
            value={summary.lowRiskCount}
            detail="Standard resolution"
            tone="safe"
          />
        </div>
      </section>

      {/* Filter Controls */}
      <section className="rounded-lg border border-border bg-card p-5 space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground">
              Filter & Search ({totalCount.toLocaleString()} exceptions)
            </span>
            {activeFilterCount > 0 && (
              <Badge variant="secondary">{activeFilterCount} active</Badge>
            )}
          </div>

          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition"
            >
              <X className="h-3 w-3" />
              <span>Clear filters</span>
            </button>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5 text-xs">
          <PremiumSelect
            label="Exception type"
            value={filterType}
            onChange={(v) => { setFilterType(v); setPage(1); }}
            options={[
              { value: "ALL", label: "All types" },
              ...Object.entries(EXCEPTION_LABELS).map(([key, label]) => ({
                value: key,
                label,
              })),
            ]}
          />

          <PremiumSelect
            label="Workflow state"
            value={filterStatus}
            onChange={(v) => { setFilterStatus(v); setPage(1); }}
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
            onChange={(v) => { setFilterRisk(v); setPage(1); }}
            options={[
              { value: "ALL", label: "All risk levels" },
              { value: "HIGH", label: "High risk" },
              { value: "MEDIUM", label: "Medium risk" },
              { value: "LOW", label: "Low risk" },
            ]}
          />

          <div className="rounded-xl border border-border bg-card p-3 space-y-1.5 shadow-2xs">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-medium">Sort & Order</span>
              <button
                type="button"
                onClick={() => { setSortOrder((o) => o === "asc" ? "desc" : "asc"); setPage(1); }}
                className="font-mono text-[11px] text-foreground hover:underline"
              >
                {sortOrder === "desc" ? "DESC ↓" : "ASC ↑"}
              </button>
            </div>
            <Dropdown
              value={sortBy}
              onValueChange={(val) => { setSortBy(val); setPage(1); }}
              options={[
                { value: "risk", label: "Risk Level" },
                { value: "amount", label: "Exposure Amount" },
                { value: "confidence", label: "Confidence Score" },
                { value: "date", label: "Creation Date" },
                { value: "type", label: "Exception Type" },
              ]}
              size="sm"
              triggerClassName="w-full"
              data-testid="exceptions-sort-dropdown"
            />
          </div>

          <div className="rounded-md border border-border bg-background p-3 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Search Records</span>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => { setSearchQuery(""); setPage(1); }}
                  className="text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground/70" />
              <input
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                placeholder="ID / UTR / Order"
                className="h-8 w-full rounded border border-border bg-card pl-8 pr-2 text-xs text-foreground placeholder-[#666666] focus:border-foreground/40 focus:outline-none font-mono"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Queue Table */}
      <section className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border p-4">
          <SectionHeader
            title="Triage queue"
            description="Exceptions awaiting investigation or sign-off"
            className="border-b-0 pb-0"
          />

          <span className="text-xs font-mono text-muted-foreground/70">
            Page {page} of {totalPages}
          </span>
        </div>

        {loading ? (
          <div className="flex min-h-[300px] items-center justify-center">
            <div className="text-center space-y-2">
              <Loader2 className="h-5 w-5 animate-spin text-foreground mx-auto" />
              <p className="text-xs text-muted-foreground">Loading exception queue...</p>
            </div>
          </div>
        ) : exceptions.length === 0 ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center p-6 text-center space-y-3">
            <CheckCircle2 className="h-8 w-8 text-[#10b981]" />
            <div>
              <h3 className="text-sm font-semibold text-foreground">Queue is clear</h3>
              <p className="text-xs text-muted-foreground mt-1">No exceptions match current filters.</p>
            </div>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={() => { clearFilters(); setSearchQuery(""); }}
                className="inline-flex h-8 items-center rounded-md border border-border bg-card px-3 text-xs text-foreground hover:bg-accent transition"
              >
                Reset view
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Exception</th>
                    <th className="px-4 py-2.5 font-medium">Reference</th>
                    <th className="px-4 py-2.5 font-medium text-right">Exposure</th>
                    <th className="px-4 py-2.5 font-medium">Confidence</th>
                    <th className="px-4 py-2.5 font-medium">Risk</th>
                    <th className="px-4 py-2.5 font-medium">Workflow</th>
                    <th className="px-4 py-2.5 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {exceptions.map((item, index) => (
                    <tr key={item.id} className="hover:bg-accent/40 transition">
                      <td className="px-4 py-3.5">
                        <div className="flex items-start gap-2.5">
                          <span className="font-mono text-xs text-muted-foreground/70 pt-0.5">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <div>
                            <div className="font-medium text-foreground">
                              {formatType(item.exceptionType)}
                            </div>
                            <div className="text-[11px] text-muted-foreground truncate max-w-xs mt-0.5">
                              {item.suggestedAction || "Investigation required"}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3.5 font-mono text-[11px] text-muted-foreground">
                        {item.paymentId || item.settlementId || item.orderId || "N/A"}
                      </td>

                      <td className="px-4 py-3.5 text-right font-mono">
                        <div className="font-semibold text-foreground">
                          {formatCurrency(item.amount)}
                        </div>
                        {item.mismatchAmount ? (
                          <div className="text-[10px] text-[#ef4444]">
                            Δ {formatCurrency(item.mismatchAmount)}
                          </div>
                        ) : null}
                      </td>

                      <td className="px-4 py-3.5 font-mono text-muted-foreground">
                        {item.confidenceScore}%
                      </td>

                      <td className="px-4 py-3.5">
                        <Badge variant={item.riskLevel === "HIGH" ? "destructive" : item.riskLevel === "MEDIUM" ? "warning" : "success"}>
                          {item.riskLevel}
                        </Badge>
                      </td>

                      <td className="px-4 py-3.5">
                        <Badge variant="outline">
                          {item.status.replace(/_/g, " ")}
                        </Badge>
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        <Link
                          href={`/exceptions/${batchId}/${item.id}`}
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground font-medium"
                        >
                          <span>Investigate</span>
                          <ChevronRight className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-border p-4 text-xs">
              <div className="flex items-center gap-3 text-muted-foreground">
                <span>
                  Showing page <span className="font-semibold text-foreground">{page}</span> of{" "}
                  <span className="font-semibold text-foreground">{totalPages}</span> ({totalCount.toLocaleString()} items)
                </span>

                <div className="flex items-center gap-1">
                  <span>Rows:</span>
                  {[25, 50, 100].map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => { setPageSize(sz); setPage(1); }}
                      className={`h-6 px-2 font-mono text-[11px] rounded transition ${
                        pageSize === sz
                          ? "bg-secondary text-foreground font-medium"
                          : "text-muted-foreground/70 hover:text-foreground"
                      }`}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!hasPrev || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="inline-flex h-8 items-center rounded-md border border-border bg-card px-3 text-xs text-foreground hover:bg-accent disabled:opacity-50 transition"
                >
                  Previous
                </button>

                <button
                  type="button"
                  disabled={!hasNext || loading}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="inline-flex h-8 items-center rounded-md border border-border bg-card px-3 text-xs text-foreground hover:bg-accent disabled:opacity-50 transition"
                >
                  Next
                </button>
              </div>
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
          <Loader2 className="h-5 w-5 animate-spin text-foreground" />
        </div>
      }
    >
      <ExceptionsQueueContent />
    </Suspense>
  );
}