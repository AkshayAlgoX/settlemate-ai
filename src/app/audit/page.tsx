"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  ScrollText,
  Filter,
  Bot,
  User,
  Shield,
  Download,
  RefreshCw,
  Search,
  CheckCircle2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

function AuditTrailContent() {
  const searchParams = useSearchParams();
  const [batchId, setBatchId] = useState<string | null>(searchParams.get("batchId"));
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterActor, setFilterActor] = useState("ALL");
  const [filterAction, setFilterAction] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!batchId) {
      fetch("/api/batches")
        .then((res) => res.json())
        .then((data: { batches?: { id: string }[] }) => {
          if (data.batches && data.batches.length > 0) {
            setBatchId(data.batches[0].id);
          } else {
            setLoading(false);
          }
        })
        .catch(() => setLoading(false));
    }
  }, [batchId]);

  useEffect(() => {
    if (!batchId) return;

    const query = new URLSearchParams();
    if (filterActor !== "ALL") query.set("actor", filterActor);
    if (filterAction !== "ALL") query.set("action", filterAction);

    let isMounted = true;
    fetch(`/api/audit/${batchId}?${query.toString()}`)
      .then((res) => res.json())
      .then((data: { success: boolean; logs: AuditLogItem[] }) => {
        if (isMounted && data.success) {
          setLogs(data.logs);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error(err);
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [batchId, filterActor, filterAction]);

  const filteredLogs = logs.filter((log) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      log.action.toLowerCase().includes(q) ||
      log.actor.toLowerCase().includes(q) ||
      log.reason?.toLowerCase().includes(q) ||
      log.entityId?.toLowerCase().includes(q)
    );
  });

  const getActorBadge = (actor: string) => {
    switch (actor.toUpperCase()) {
      case "AI":
        return (
          <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 gap-1">
            <Bot className="w-3 h-3" /> AI AGENT
          </Badge>
        );
      case "SYSTEM":
        return (
          <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 gap-1">
            <Shield className="w-3 h-3" /> SYSTEM
          </Badge>
        );
      default:
        return (
          <Badge className="bg-green-500/20 text-green-400 border-green-500/30 gap-1">
            <User className="w-3 h-3" /> {actor}
          </Badge>
        );
    }
  };

  const handleExportCSV = () => {
    if (filteredLogs.length === 0) return;

    const headers = ["Timestamp", "Actor", "Action", "Entity Type", "Entity ID", "Reason", "Before State", "After State"];
    const rows = filteredLogs.map((l) => [
      new Date(l.timestamp).toISOString(),
      l.actor,
      l.action,
      l.entityType || "",
      l.entityId || "",
      `"${(l.reason || "").replace(/"/g, '""')}"`,
      `"${(l.beforeState || "").replace(/"/g, '""')}"`,
      `"${(l.afterState || "").replace(/"/g, '""')}"`,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `settlemate_audit_${batchId || "export"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ScrollText className="w-6 h-6 text-blue-400" />
            Append-Only Audit Trail
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Chronological, immutable system and user action record for compliance & traceability
          </p>
        </div>
        <div className="flex items-center gap-2">
          {batchId && (
            <Badge variant="outline" className="border-gray-700 text-gray-400">
              Batch: {batchId.slice(0, 14)}...
            </Badge>
          )}
          <Button
            size="sm"
            onClick={handleExportCSV}
            disabled={filteredLogs.length === 0}
            variant="outline"
            className="border-gray-700 text-gray-300 hover:bg-gray-800"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <Card className="bg-gray-900 border-gray-800">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-gray-400 mr-2">
              <Filter className="w-4 h-4 text-blue-400" /> Filters:
            </div>

            <select
              value={filterActor}
              onChange={(e) => setFilterActor(e.target.value)}
              className="bg-gray-800 text-gray-200 border border-gray-700 rounded-lg text-xs px-3 py-2 outline-none focus:border-blue-500"
            >
              <option value="ALL">All Actors</option>
              <option value="SYSTEM">SYSTEM</option>
              <option value="AI">AI</option>
              <option value="USER">USER</option>
            </select>

            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="bg-gray-800 text-gray-200 border border-gray-700 rounded-lg text-xs px-3 py-2 outline-none focus:border-blue-500"
            >
              <option value="ALL">All Actions</option>
              <option value="BATCH_GENERATED">BATCH_GENERATED</option>
              <option value="RECONCILIATION_STARTED">RECONCILIATION_STARTED</option>
              <option value="RECONCILIATION_COMPLETED">RECONCILIATION_COMPLETED</option>
              <option value="WORKFLOW_TRANSITION">WORKFLOW_TRANSITION</option>
              <option value="ANOMALY_RECLASSIFIED">ANOMALY_RECLASSIFIED</option>
              <option value="RESOLVER_PROPOSAL">RESOLVER_PROPOSAL</option>
              <option value="AI_EXPLANATION_GENERATED">AI_EXPLANATION_GENERATED</option>
              <option value="ADVERSARIAL_TEST_COMPLETED">ADVERSARIAL_TEST_COMPLETED</option>
            </select>

            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-2.5" />
              <Input
                placeholder="Search action, entity ID, or reason..."
                value={searchQuery}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                className="bg-gray-800 border-gray-700 text-xs pl-8 h-8 text-gray-200"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Log Table */}
      <Card className="bg-gray-900 border-gray-800 overflow-hidden">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center text-gray-500">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-400" />
              Loading audit history...
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
              No audit records match the current filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-800/60 text-gray-400 border-b border-gray-800">
                  <tr>
                    <th className="p-3">Timestamp</th>
                    <th className="p-3">Actor</th>
                    <th className="p-3">Action</th>
                    <th className="p-3">Entity</th>
                    <th className="p-3">Reason / Context</th>
                    <th className="p-3">State Diff</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800 text-gray-300 font-mono">
                  {filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-800/40 transition-colors">
                      <td className="p-3 text-gray-500 whitespace-nowrap font-sans">
                        {formatDate(log.timestamp)}
                      </td>
                      <td className="p-3 whitespace-nowrap">{getActorBadge(log.actor)}</td>
                      <td className="p-3 font-semibold text-gray-200">{log.action}</td>
                      <td className="p-3 text-gray-400">
                        {log.entityType ? `${log.entityType}: ` : ""}
                        <span className="text-blue-400">{log.entityId || "N/A"}</span>
                      </td>
                      <td className="p-3 text-gray-300 font-sans max-w-xs truncate">
                        {log.reason || "N/A"}
                      </td>
                      <td className="p-3 text-[11px]">
                        {log.beforeState || log.afterState ? (
                          <div className="space-y-0.5">
                            {log.beforeState && (
                              <span className="block text-red-400/80 truncate max-w-[180px]">
                                - {log.beforeState}
                              </span>
                            )}
                            {log.afterState && (
                              <span className="block text-green-400/80 truncate max-w-[180px]">
                                + {log.afterState}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AuditPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400">Loading audit log...</div>}>
      <AuditTrailContent />
    </Suspense>
  );
}