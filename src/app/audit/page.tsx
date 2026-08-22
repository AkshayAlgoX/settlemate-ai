"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  Download,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  ScrollText,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import { formatDate } from "@/lib/format";

interface AuditLogItem {
  id: string;
  batchId: string | null;
  timestamp: string;
  actor: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  beforeState: string | null;
  afterState: string | null;
  reason: string | null;
  metadata: string | null;
}

const ACTIONS = [
  { value: "ALL", label: "All actions" },
  { value: "BATCH_GENERATED", label: "Batch generated" },
  {
    value: "RECONCILIATION_STARTED",
    label: "Reconciliation started",
  },
  {
    value: "RECONCILIATION_COMPLETED",
    label: "Reconciliation completed",
  },
  {
    value: "WORKFLOW_TRANSITION",
    label: "Workflow transition",
  },
  {
    value: "ANOMALY_RECLASSIFIED",
    label: "Anomaly reclassified",
  },
  {
    value: "RESOLVER_PROPOSAL",
    label: "Resolver proposal",
  },
  {
    value: "AI_EXPLANATION_GENERATED",
    label: "AI explanation generated",
  },
  {
    value: "ADVERSARIAL_TEST_COMPLETED",
    label: "Adversarial test completed",
  },
];

const ACTORS = [
  { value: "ALL", label: "All actors" },
  { value: "SYSTEM", label: "System" },
  { value: "AI", label: "AI agent" },
  { value: "USER", label: "User" },
];

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

    const handleWindowClick = () => setOpen(false);

    window.addEventListener("click", handleWindowClick);

    return () => window.removeEventListener("click", handleWindowClick);
  }, [open]);

  const selected =
    options.find((option) => option.value === value)?.label ||
    value;

  return (
    <div
      className="relative bg-[#0a0d0a] p-4"
      onClick={(event) => event.stopPropagation()}
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

      {open ? (
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

                  {active ? (
                    <Check className="h-3.5 w-3.5 text-[#aab88d]" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ActorBadge({ actor }: { actor: string }) {
  const normalized = actor.toUpperCase();

  if (normalized === "AI") {
    return (
      <span className="inline-flex items-center gap-1.5 border border-[#4e4938] bg-[#15130e] px-2 py-1 text-[8px] font-medium uppercase tracking-[0.14em] text-[#b7a976]">
        <Bot className="h-3 w-3" />
        AI agent
      </span>
    );
  }

  if (normalized === "SYSTEM") {
    return (
      <span className="inline-flex items-center gap-1.5 border border-[#3d4937] bg-[#11150f] px-2 py-1 text-[8px] font-medium uppercase tracking-[0.14em] text-[#a7b58d]">
        <ShieldCheck className="h-3 w-3" />
        System
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 border border-[#343d34] bg-[#101410] px-2 py-1 text-[8px] font-medium uppercase tracking-[0.14em] text-[#a3a99f]">
      <UserRound className="h-3 w-3" />
      {actor}
    </span>
  );
}

function formatAction(action: string) {
  return action
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function AuditTrailContent() {
  const searchParams = useSearchParams();

  const [batchId, setBatchId] = useState<string | null>(
    searchParams.get("batchId"),
  );

  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterActor, setFilterActor] = useState("ALL");
  const [filterAction, setFilterAction] = useState("ALL");
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

  const loadLogs = async () => {
    if (!batchId) return;

    setLoading(true);

    const query = new URLSearchParams();

    if (filterActor !== "ALL") {
      query.set("actor", filterActor);
    }

    if (filterAction !== "ALL") {
      query.set("action", filterAction);
    }

    try {
      const response = await fetch(
        `/api/audit/${batchId}?${query.toString()}`,
      );

      const data = (await response.json()) as {
        success: boolean;
        logs: AuditLogItem[];
      };

      if (data.success) {
        setLogs(data.logs);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // loadLogs resets loading synchronously; defer out of the effect frame
    // (react-hooks/set-state-in-effect).
    queueMicrotask(() => void loadLogs());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId, filterActor, filterAction]);

  const filteredLogs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) return logs;

    return logs.filter((log) => {
      return (
        log.action.toLowerCase().includes(query) ||
        log.actor.toLowerCase().includes(query) ||
        log.reason?.toLowerCase().includes(query) ||
        log.entityId?.toLowerCase().includes(query) ||
        log.entityType?.toLowerCase().includes(query)
      );
    });
  }, [logs, searchQuery]);

  const activeFilterCount =
    Number(filterActor !== "ALL") +
    Number(filterAction !== "ALL") +
    Number(searchQuery.trim().length > 0);

  const handleExportCSV = () => {
    if (filteredLogs.length === 0) return;

    const headers = [
      "Timestamp",
      "Actor",
      "Action",
      "Entity Type",
      "Entity ID",
      "Reason",
      "Before State",
      "After State",
    ];

    const rows = filteredLogs.map((log) => [
      new Date(log.timestamp).toISOString(),
      log.actor,
      log.action,
      log.entityType || "",
      log.entityId || "",
      `"${(log.reason || "").replace(/"/g, '""')}"`,
      `"${(log.beforeState || "").replace(/"/g, '""')}"`,
      `"${(log.afterState || "").replace(/"/g, '""')}"`,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");

    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `settlemate_audit_${batchId || "export"}.csv`,
    );

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const clearFilters = () => {
    setFilterActor("ALL");
    setFilterAction("ALL");
    setSearchQuery("");
  };

  return (
    <div className="space-y-7 pb-8">
      {/* Header */}
      <header className="border-b border-[#20241f] pb-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center border border-[#343a31] bg-[#10130f]">
                <ScrollText className="h-3.5 w-3.5 text-[#9da884]" />
              </div>

              <span className="text-[8px] font-medium uppercase tracking-[0.22em] text-[#626960]">
                Governance / Audit
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[28px] font-semibold tracking-[-0.045em] text-[#eeece4]">
                Audit trail
              </h1>

              <span className="inline-flex items-center gap-1.5 border border-[#384633] bg-[#10150f] px-2.5 py-1 text-[8px] font-medium uppercase tracking-[0.14em] text-[#a5b48b]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#99aa7e]" />
                Append-only
              </span>
            </div>

            <p className="mt-2 max-w-2xl text-[11px] leading-5 text-[#747a71]">
              Chronological record of reconciliation, AI, system, and human
              actions for traceability and financial control.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
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

            <button
              type="button"
              onClick={handleExportCSV}
              disabled={filteredLogs.length === 0}
              className="inline-flex h-10 items-center gap-2 border border-[#394132] bg-[#11150f] px-3.5 text-[9px] font-semibold uppercase tracking-[0.13em] text-[#b4bf95] transition hover:bg-[#171c13] disabled:cursor-not-allowed disabled:opacity-30"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
          </div>
        </div>
      </header>

      {/* Trust / summary strip */}
      <section className="grid gap-px overflow-hidden border border-[#2a2e29] bg-[#2a2e29] md:grid-cols-3">
        <div className="bg-[#0d100d] p-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-[#9eaa83]" />

            <span className="text-[8px] uppercase tracking-[0.18em] text-[#666d63]">
              Integrity
            </span>
          </div>

          <div className="mt-2 text-[11px] text-[#c8c7bf]">
            Append-only event history
          </div>

          <div className="mt-1 text-[9px] text-[#5f655c]">
            State changes preserve before and after values.
          </div>
        </div>

        <div className="bg-[#0d100d] p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-[#9eaa83]" />

            <span className="text-[8px] uppercase tracking-[0.18em] text-[#666d63]">
              Coverage
            </span>
          </div>

          <div className="mt-2 text-[11px] text-[#c8c7bf]">
            System + AI + human actions
          </div>

          <div className="mt-1 text-[9px] text-[#5f655c]">
            One chronological source of operational truth.
          </div>
        </div>

        <div className="bg-[#0d100d] p-4">
          <div className="flex items-center gap-2">
            <ScrollText className="h-3.5 w-3.5 text-[#a6946f]" />

            <span className="text-[8px] uppercase tracking-[0.18em] text-[#666d63]">
              Records
            </span>
          </div>

          <div className="mt-2 text-[11px] text-[#c8c7bf]">
            {filteredLogs.length} visible events
          </div>

          <div className="mt-1 text-[9px] text-[#5f655c]">
            Current filtered audit scope.
          </div>
        </div>
      </section>

      {/* Filters */}
      <section className="border border-[#2a2e29] bg-[#0d100d]">
        <div className="flex flex-col gap-2 border-b border-[#252a24] px-5 py-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Filter className="h-3.5 w-3.5 text-[#9aa47f]" />

              <span className="text-[8px] font-medium uppercase tracking-[0.2em] text-[#626960]">
                Investigation filters
              </span>
            </div>

            <div className="mt-1 text-[12px] text-[#cccac2]">
              {filteredLogs.length} events in view
            </div>
          </div>

          {activeFilterCount > 0 ? (
            <button
              type="button"
              onClick={clearFilters}
              className="text-[8px] font-medium uppercase tracking-[0.14em] text-[#7f867b] transition hover:text-[#c4c5bd]"
            >
              Clear filters
            </button>
          ) : null}
        </div>

        <div className="grid gap-px bg-[#252a24] md:grid-cols-3">
          <PremiumSelect
            label="Actor"
            value={filterActor}
            onChange={setFilterActor}
            options={ACTORS}
          />

          <PremiumSelect
            label="Action"
            value={filterAction}
            onChange={setFilterAction}
            options={ACTIONS}
          />

          <div className="bg-[#0a0d0a] p-4">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-[8px] font-medium uppercase tracking-[0.18em] text-[#687066]">
                Search records
              </label>

              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="text-[8px] uppercase tracking-[0.13em] text-[#666d63] hover:text-[#b5b9af]"
                >
                  Clear
                </button>
              ) : null}
            </div>

            <div
              className={`flex h-10 items-center border bg-[#10130f] transition ${
                searchQuery
                  ? "border-[#697557]"
                  : "border-[#30352f] hover:border-[#4a5342]"
              }`}
            >
              <Search className="ml-3 h-3.5 w-3.5 shrink-0 text-[#697067]" />

              <input
                value={searchQuery}
                onChange={(event) =>
                  setSearchQuery(event.target.value)
                }
                placeholder="Action, entity or reason"
                className="min-w-0 flex-1 bg-transparent px-2.5 text-[11px] text-[#d0cec5] outline-none placeholder:text-[#50564e]"
              />

              <span className="mr-3 hidden border border-[#30352f] px-1.5 py-0.5 text-[7px] uppercase tracking-[0.12em] text-[#535a51] sm:inline-block">
                Search
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Event ledger */}
      <section className="border border-[#2a2e29] bg-[#0d100d]">
        <div className="flex items-center justify-between border-b border-[#252a24] px-5 py-4">
          <div>
            <div className="text-[8px] font-medium uppercase tracking-[0.2em] text-[#626960]">
              Event ledger
            </div>

            <div className="mt-1 text-[13px] font-semibold text-[#dddcd4]">
              Chronological audit history
            </div>
          </div>

          <button
            type="button"
            onClick={() => void loadLogs()}
            disabled={loading || !batchId}
            className="inline-flex items-center gap-1.5 text-[8px] font-medium uppercase tracking-[0.14em] text-[#737a71] transition hover:text-[#b6baaf] disabled:opacity-30"
          >
            <RefreshCw
              className={`h-3 w-3 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex min-h-[400px] items-center justify-center">
            <div className="text-center">
              <div className="mx-auto flex h-11 w-11 items-center justify-center border border-[#30352f] bg-[#0e110e]">
                <Loader2 className="h-4 w-4 animate-spin text-[#a6b58a]" />
              </div>

              <p className="mt-4 text-[9px] font-medium uppercase tracking-[0.18em] text-[#656b62]">
                Loading audit history
              </p>
            </div>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex min-h-[400px] flex-col items-center justify-center text-center">
            <div className="flex h-12 w-12 items-center justify-center border border-[#394736] bg-[#10150f]">
              <CheckCircle2 className="h-5 w-5 text-[#9fb181]" />
            </div>

            <h3 className="mt-5 text-[14px] font-semibold text-[#d8d6ce]">
              No matching audit events
            </h3>

            <p className="mt-2 max-w-sm text-[10px] leading-5 text-[#626960]">
              No records match the current actor, action, or search filters.
            </p>

            {activeFilterCount > 0 ? (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-5 border border-[#343a31] px-4 py-2 text-[8px] font-medium uppercase tracking-[0.14em] text-[#aab095] hover:bg-[#131710]"
              >
                Reset filters
              </button>
            ) : null}
          </div>
        ) : (
          <>
            {/* Desktop ledger */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[1050px] border-collapse">
                <thead>
                  <tr className="border-b border-[#252a24] bg-[#0a0d0a]">
                    <th className="px-5 py-3 text-left text-[8px] font-medium uppercase tracking-[0.16em] text-[#5e645b]">
                      Timestamp
                    </th>

                    <th className="px-4 py-3 text-left text-[8px] font-medium uppercase tracking-[0.16em] text-[#5e645b]">
                      Actor
                    </th>

                    <th className="px-4 py-3 text-left text-[8px] font-medium uppercase tracking-[0.16em] text-[#5e645b]">
                      Action
                    </th>

                    <th className="px-4 py-3 text-left text-[8px] font-medium uppercase tracking-[0.16em] text-[#5e645b]">
                      Entity
                    </th>

                    <th className="px-4 py-3 text-left text-[8px] font-medium uppercase tracking-[0.16em] text-[#5e645b]">
                      Reason / context
                    </th>

                    <th className="px-5 py-3 text-left text-[8px] font-medium uppercase tracking-[0.16em] text-[#5e645b]">
                      State change
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {filteredLogs.map((log) => (
                    <tr
                      key={log.id}
                      className="group border-b border-[#1d211d] transition hover:bg-[#10140f]"
                    >
                      <td className="whitespace-nowrap px-5 py-4 align-top">
                        <div className="text-[9px] text-[#777e74]">
                          {formatDate(log.timestamp)}
                        </div>
                      </td>

                      <td className="whitespace-nowrap px-4 py-4 align-top">
                        <ActorBadge actor={log.actor} />
                      </td>

                      <td className="px-4 py-4 align-top">
                        <div className="text-[10px] font-semibold text-[#d2d1c9]">
                          {formatAction(log.action)}
                        </div>

                        <div className="mt-1 font-mono text-[8px] text-[#4f564d]">
                          {log.action}
                        </div>
                      </td>

                      <td className="px-4 py-4 align-top">
                        <div className="text-[9px] text-[#777e74]">
                          {log.entityType || "system"}
                        </div>

                        <div className="mt-1 max-w-[180px] truncate font-mono text-[8px] text-[#9b9e96]">
                          {log.entityId || "N/A"}
                        </div>
                      </td>

                      <td className="max-w-[330px] px-4 py-4 align-top">
                        <div className="text-[10px] leading-5 text-[#868c83]">
                          {log.reason || "No context supplied."}
                        </div>
                      </td>

                      <td className="px-5 py-4 align-top">
                        {log.beforeState || log.afterState ? (
                          <div className="space-y-2">
                            {log.beforeState ? (
                              <div>
                                <div className="text-[7px] uppercase tracking-[0.15em] text-[#555c53]">
                                  Before
                                </div>

                                <div className="mt-1 max-w-[240px] truncate font-mono text-[8px] text-[#a06f67]">
                                  {log.beforeState}
                                </div>
                              </div>
                            ) : null}

                            {log.afterState ? (
                              <div>
                                <div className="text-[7px] uppercase tracking-[0.15em] text-[#555c53]">
                                  After
                                </div>

                                <div className="mt-1 max-w-[240px] truncate font-mono text-[8px] text-[#91a27c]">
                                  {log.afterState}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-[9px] text-[#444a42]">
                            —
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile ledger */}
            <div className="divide-y divide-[#20241f] md:hidden">
              {filteredLogs.map((log) => (
                <div key={log.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-semibold text-[#d3d1c9]">
                        {formatAction(log.action)}
                      </div>

                      <div className="mt-1 text-[8px] text-[#555c53]">
                        {formatDate(log.timestamp)}
                      </div>
                    </div>

                    <ActorBadge actor={log.actor} />
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-[7px] uppercase tracking-[0.15em] text-[#555c53]">
                        Entity
                      </div>

                      <div className="mt-1 font-mono text-[8px] text-[#898f86]">
                        {log.entityId || "N/A"}
                      </div>
                    </div>

                    <div>
                      <div className="text-[7px] uppercase tracking-[0.15em] text-[#555c53]">
                        Type
                      </div>

                      <div className="mt-1 text-[9px] text-[#898f86]">
                        {log.entityType || "system"}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 border-t border-[#20241f] pt-3">
                    <div className="text-[7px] uppercase tracking-[0.15em] text-[#555c53]">
                      Reason
                    </div>

                    <p className="mt-1 text-[10px] leading-5 text-[#858b82]">
                      {log.reason || "No context supplied."}
                    </p>
                  </div>

                  {log.beforeState || log.afterState ? (
                    <div className="mt-4 grid grid-cols-1 gap-3 border-t border-[#20241f] pt-3">
                      {log.beforeState ? (
                        <div>
                          <div className="text-[7px] uppercase tracking-[0.15em] text-[#555c53]">
                            Before
                          </div>

                          <div className="mt-1 font-mono text-[8px] text-[#a06f67]">
                            {log.beforeState}
                          </div>
                        </div>
                      ) : null}

                      {log.afterState ? (
                        <div>
                          <div className="text-[7px] uppercase tracking-[0.15em] text-[#555c53]">
                            After
                          </div>

                          <div className="mt-1 font-mono text-[8px] text-[#91a27c]">
                            {log.afterState}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Footer */}
      <div className="flex flex-col gap-3 border-t border-[#20241f] pt-4 text-[8px] uppercase tracking-[0.16em] text-[#4f554d] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-3 w-3" />
          Audit integrity active
        </div>

        <div className="flex items-center gap-4">
          <span>Append-only</span>
          <span>Chronological</span>
          <span>Traceable</span>
        </div>
      </div>
    </div>
  );
}

export default function AuditPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[70vh] items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-[#a5b47f]" />
        </div>
      }
    >
      <AuditTrailContent />
    </Suspense>
  );
}