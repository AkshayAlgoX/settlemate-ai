"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Search,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Dropdown } from "@/components/ui/dropdown";
import { formatDateTime } from "@/lib/format";

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
  { value: "RECONCILIATION_STARTED", label: "Reconciliation started" },
  { value: "RECONCILIATION_COMPLETED", label: "Reconciliation completed" },
  { value: "WORKFLOW_TRANSITION", label: "Workflow transition" },
  { value: "ANOMALY_RECLASSIFIED", label: "Anomaly reclassified" },
  { value: "RESOLVER_PROPOSAL", label: "Resolver proposal" },
  { value: "AI_EXPLANATION_GENERATED", label: "AI explanation generated" },
  { value: "ADVERSARIAL_TEST_COMPLETED", label: "Adversarial test completed" },
];

const ACTORS = [
  { value: "ALL", label: "All actors" },
  { value: "SYSTEM", label: "System" },
  { value: "AI", label: "AI agent" },
  { value: "USER", label: "User" },
];

function ActorBadge({ actor }: { actor: string }) {
  const normalized = actor.toUpperCase();

  if (normalized === "AI") {
    return <Badge variant="secondary">AI Agent</Badge>;
  }

  if (normalized === "SYSTEM") {
    return <Badge variant="outline">System</Badge>;
  }

  return <Badge variant="secondary">{actor}</Badge>;
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

  return (
    <div className="space-y-8 pb-12 font-sans">
      {/* Header */}
      <PageHeader
        tag="Governance & Compliance"
        title="Audit trail"
        description="Chronological record of reconciliation, AI, system, and human actions for traceability and financial control."
        badge={<Badge variant="outline">Append-Only</Badge>}
        actions={
          <div className="flex items-center gap-3">
            {batchId && (
              <span className="font-mono text-xs text-muted-foreground">
                Batch: {batchId.slice(0, 16)}...
              </span>
            )}
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={filteredLogs.length === 0}
              className="inline-flex h-8 items-center rounded-lg bg-primary px-3.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition shadow-xs"
            >
              <span>Export CSV</span>
            </button>
          </div>
        }
      />

      {/* Filter Bar */}
      <div className="rounded-xl border border-border bg-card p-4 flex flex-wrap items-center justify-between gap-4 shadow-2xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search audit records..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 w-60 rounded-lg border border-border bg-background pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-foreground/40 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium">Actor:</span>
            <Dropdown
              value={filterActor}
              onValueChange={setFilterActor}
              options={ACTORS}
              size="sm"
              triggerClassName="w-[140px]"
              data-testid="audit-actor-dropdown"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium">Action:</span>
            <Dropdown
              value={filterAction}
              onValueChange={setFilterAction}
              options={ACTIONS}
              size="sm"
              triggerClassName="w-[200px]"
              data-testid="audit-action-dropdown"
            />
          </div>
        </div>

        <span className="text-xs font-mono text-muted-foreground">
          {filteredLogs.length} events logged
        </span>
      </div>

      {/* Audit Log Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs font-semibold text-muted-foreground">
                <th className="py-2.5 px-4">Timestamp</th>
                <th className="py-2.5 px-3">Actor</th>
                <th className="py-2.5 px-4">Action</th>
                <th className="py-2.5 px-4">Entity & ID</th>
                <th className="py-2.5 px-4">Reason & Context</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-xs text-muted-foreground">
                    Loading audit events...
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-xs text-muted-foreground">
                    No audit records matching criteria.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-accent/40 transition">
                    <td className="py-3 px-4 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                      {formatDateTime(log.timestamp)}
                    </td>
                    <td className="py-3 px-3">
                      <ActorBadge actor={log.actor} />
                    </td>
                    <td className="py-3 px-4 font-medium text-foreground">
                      {formatAction(log.action)}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-muted-foreground">
                      {log.entityType ? (
                        <span>
                          {log.entityType}: <strong className="text-foreground">{log.entityId}</strong>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-3 px-4 text-muted-foreground max-w-xs truncate">
                      {log.reason || "Standard system state transition"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function AuditPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-xs text-muted-foreground">
          Loading audit trail...
        </div>
      }
    >
      <AuditTrailContent />
    </Suspense>
  );
}