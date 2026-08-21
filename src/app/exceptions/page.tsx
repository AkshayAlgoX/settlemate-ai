"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  Filter,
  Search,
  ChevronRight,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/format";
import { EXCEPTION_LABELS, type ExceptionType } from "@/lib/constants";

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

function ExceptionsQueueContent() {
  const searchParams = useSearchParams();
  const [batchId, setBatchId] = useState<string | null>(searchParams.get("batchId"));
  const [exceptions, setExceptions] = useState<ExceptionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({
    totalAmountAtRisk: 0,
    highRiskCount: 0,
    mediumRiskCount: 0,
    lowRiskCount: 0,
  });

  const [filterType, setFilterType] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterRisk, setFilterRisk] = useState("ALL");
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
    if (filterType !== "ALL") query.set("type", filterType);
    if (filterStatus !== "ALL") query.set("status", filterStatus);
    if (filterRisk !== "ALL") query.set("risk", filterRisk);

    let isMounted = true;
    fetch(`/api/exceptions/${batchId}?${query.toString()}`)
      .then((res) => res.json())
      .then((data: { success: boolean; exceptions: ExceptionItem[]; summary: typeof summary }) => {
        if (isMounted && data.success) {
          setExceptions(data.exceptions);
          setSummary(data.summary);
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
  }, [batchId, filterType, filterStatus, filterRisk]);

  const filteredExceptions = exceptions.filter((e) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      e.paymentId?.toLowerCase().includes(q) ||
      e.orderId?.toLowerCase().includes(q) ||
      e.settlementId?.toLowerCase().includes(q) ||
      e.exceptionType.toLowerCase().includes(q)
    );
  });

  const getRiskBadge = (risk: string) => {
    switch (risk) {
      case "HIGH":
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">HIGH</Badge>;
      case "MEDIUM":
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">MEDIUM</Badge>;
      default:
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">LOW</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "RESOLVED":
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">RESOLVED</Badge>;
      case "PENDING_APPROVAL":
        return <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">PENDING APPROVAL</Badge>;
      case "INVESTIGATING":
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">INVESTIGATING</Badge>;
      case "ESCALATED":
        return <Badge className="bg-rose-500/20 text-rose-400 border-rose-500/30">ESCALATED</Badge>;
      default:
        return <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-orange-400" />
            Exception Queue
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Review, investigate, and approve workflow transitions for settlement exceptions
          </p>
        </div>
        {batchId && (
          <Badge variant="outline" className="border-gray-700 text-gray-400">
            Batch: {batchId.slice(0, 14)}...
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">Total Amount at Risk</p>
            <p className="text-2xl font-bold text-red-400">
              {formatCurrency(summary.totalAmountAtRisk)}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">High Risk Items</p>
            <p className="text-2xl font-bold text-rose-400">{summary.highRiskCount}</p>
          </CardContent>
        </Card>
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">Medium Risk Items</p>
            <p className="text-2xl font-bold text-yellow-400">{summary.mediumRiskCount}</p>
          </CardContent>
        </Card>
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">Low Risk Items</p>
            <p className="text-2xl font-bold text-blue-400">{summary.lowRiskCount}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-gray-900 border-gray-800">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-gray-400 mr-2">
              <Filter className="w-4 h-4 text-blue-400" /> Filters:
            </div>

            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="bg-gray-800 text-gray-200 border border-gray-700 rounded-lg text-xs px-3 py-2 outline-none focus:border-blue-500"
            >
              <option value="ALL">All Exception Types</option>
              {Object.entries(EXCEPTION_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-gray-800 text-gray-200 border border-gray-700 rounded-lg text-xs px-3 py-2 outline-none focus:border-blue-500"
            >
              <option value="ALL">All Workflow States</option>
              <option value="OPEN">OPEN</option>
              <option value="INVESTIGATING">INVESTIGATING</option>
              <option value="PENDING_APPROVAL">PENDING APPROVAL</option>
              <option value="ESCALATED">ESCALATED</option>
              <option value="RESOLVED">RESOLVED</option>
              <option value="REJECTED">REJECTED</option>
              <option value="REOPENED">REOPENED</option>
            </select>

            <select
              value={filterRisk}
              onChange={(e) => setFilterRisk(e.target.value)}
              className="bg-gray-800 text-gray-200 border border-gray-700 rounded-lg text-xs px-3 py-2 outline-none focus:border-blue-500"
            >
              <option value="ALL">All Risk Levels</option>
              <option value="HIGH">HIGH</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="LOW">LOW</option>
            </select>

            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-2.5" />
              <Input
                placeholder="Search payment ID, settlement ID..."
                value={searchQuery}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                className="bg-gray-800 border-gray-700 text-xs pl-8 h-8 text-gray-200"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gray-900 border-gray-800 overflow-hidden">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center text-gray-500">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-400" />
              Loading exception queue...
            </div>
          ) : filteredExceptions.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
              No exceptions match the criteria.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-800/60 text-gray-400 border-b border-gray-800">
                  <tr>
                    <th className="p-3">Type</th>
                    <th className="p-3">Payment / Ref ID</th>
                    <th className="p-3">Amount</th>
                    <th className="p-3">Confidence</th>
                    <th className="p-3">Risk</th>
                    <th className="p-3">Workflow State</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800 text-gray-300">
                  {filteredExceptions.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-gray-800/40 transition-colors group cursor-pointer"
                    >
                      <td className="p-3 font-medium">
                        <span className="text-gray-200">
                          {EXCEPTION_LABELS[item.exceptionType] || item.exceptionType}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-gray-400">
                        {item.paymentId || item.settlementId || "N/A"}
                      </td>
                      <td className="p-3 font-bold text-gray-200">
                        {formatCurrency(item.amount)}
                        {item.mismatchAmount ? (
                          <span className="block text-[10px] text-orange-400 font-normal">
                            Δ {formatCurrency(item.mismatchAmount)}
                          </span>
                        ) : null}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          <div className="w-12 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${
                                item.confidenceScore >= 80
                                  ? "bg-green-500"
                                  : item.confidenceScore >= 50
                                  ? "bg-yellow-500"
                                  : "bg-red-500"
                              }`}
                              style={{ width: `${item.confidenceScore}%` }}
                            />
                          </div>
                          <span className="text-[11px] text-gray-400">
                            {item.confidenceScore}%
                          </span>
                        </div>
                      </td>
                      <td className="p-3">{getRiskBadge(item.riskLevel)}</td>
                      <td className="p-3">{getStatusBadge(item.status)}</td>
                      <td className="p-3 text-right">
                        <Link
                          href={`/exceptions/${batchId}/${item.id}`}
                          className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 font-medium text-xs group-hover:translate-x-0.5 transition-transform"
                        >
                          Investigate <ChevronRight className="w-3.5 h-3.5" />
                        </Link>
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

export default function ExceptionsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400">Loading queue...</div>}>
      <ExceptionsQueueContent />
    </Suspense>
  );
}