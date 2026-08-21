"use client";

import { use, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Shield,
  Brain,
  FileText,
  AlertTriangle,
  Clock,
  Sparkles,
  Bot,
  User,
  GitCommit,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  Link2,
  Database,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatDate } from "@/lib/format";
import { EXCEPTION_LABELS, type ExceptionType } from "@/lib/constants";

interface PageProps {
  params: Promise<{ batchId: string; exceptionId: string }>;
}

interface AiExplanationData {
  summary: string;
  reason: string;
  evidence: string;
  recommendedAction: string;
}

interface AgentTraceItem {
  id: string;
  passNumber: number;
  agentName: string;
  stepNumber: number;
  stepLabel: string;
  stepDetail: string;
}

interface AuditLogItem {
  id: string;
  actor: string;
  action: string;
  reason: string;
  timestamp: string;
  beforeState?: string | null;
  afterState?: string | null;
}

interface SourceOrder {
  orderId: string;
  amount: number;
  status: string;
  createdAt: string;
  customerEmail?: string;
  description?: string;
}

interface SourcePayment {
  paymentId: string;
  amount: number;
  fee: number;
  tax: number;
  method: string;
  status: string;
}

interface SourceSettlement {
  settlementId: string;
  amount: number;
  utr: string | null;
  status: string;
  settledAt?: string | null;
}

interface SourceBankTxn {
  txnId: string;
  amount: number;
  type: string;
  narration: string | null;
  txnDate?: string;
}

interface ExceptionData {
  id: string;
  batchId: string;
  paymentId: string | null;
  exceptionType: ExceptionType;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  status: string;
  confidenceScore: number;
  aiExplanation?: AiExplanationData | null;
  agentTraces?: AgentTraceItem[];
}

interface CalculationData {
  paymentAmount: number;
  fee: number;
  tax: number;
  refundAmount: number;
  chargebackAmount: number;
  expectedNetAmount: number;
  actualSettledAmount: number | null;
  mismatchAmount: number | null;
}

interface ExceptionDetailResponse {
  success: boolean;
  exception?: ExceptionData;
  sources?: {
    order?: SourceOrder | null;
    payment?: SourcePayment | null;
    settlement?: SourceSettlement | null;
    bankTxn?: SourceBankTxn | null;
  };
  calculation?: CalculationData | null;
  auditTimeline?: AuditLogItem[];
}

function getRiskColor(risk: string): string {
  switch (risk) {
    case "HIGH":
      return "bg-red-500/20 text-red-400 border-red-500/30";
    case "MEDIUM":
      return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    default:
      return "bg-blue-500/20 text-blue-400 border-blue-500/30";
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case "RESOLVED":
      return "bg-green-500/20 text-green-400 border-green-500/30";
    case "REJECTED":
      return "bg-red-500/20 text-red-400 border-red-500/30";
    case "ESCALATED":
      return "bg-orange-500/20 text-orange-400 border-orange-500/30";
    case "PENDING_APPROVAL":
      return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    default:
      return "bg-gray-500/20 text-gray-400 border-gray-500/30";
  }
}

export default function ExceptionDetailPage({ params }: PageProps) {
  const { batchId, exceptionId } = use(params);

  const [data, setData] = useState<ExceptionDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [transitioning, setTransitioning] = useState(false);
  const [actionReason, setReason] = useState("");
  const [resolutionText, setResolution] = useState("");
  const [explaining, setExplaining] = useState(false);
  const [showProvenance, setShowProvenance] = useState(true);

  const loadData = useCallback(() => {
    fetch(`/api/exceptions/detail/${exceptionId}`)
      .then((res) => res.json())
      .then((d: ExceptionDetailResponse) => {
        if (d.success) setData(d);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [exceptionId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleTransition = async (targetState: string) => {
    setTransitioning(true);
    try {
      const res = await fetch(`/api/exceptions/${exceptionId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: targetState,
          reason: actionReason || `Transitioned to ${targetState}`,
          resolution: resolutionText || undefined,
        }),
      });

      const resData = (await res.json()) as { error?: string };
      if (!res.ok) {
        alert(`Transition failed: ${resData.error || "Unknown error"}`);
      } else {
        setReason("");
        setResolution("");
        loadData();
      }
    } catch (err) {
      alert(`Error updating status: ${String(err)}`);
    } finally {
      setTransitioning(false);
    }
  };

  const handleExplain = async () => {
    setExplaining(true);
    try {
      await fetch(`/api/exceptions/${exceptionId}/explain`, { method: "POST" });
      loadData();
    } catch (err) {
      console.error(err);
    } finally {
      setExplaining(false);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-gray-400">
        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-blue-400" />
        Loading exception investigation room...
      </div>
    );
  }

  if (!data?.exception) {
    return (
      <div className="p-12 text-center text-gray-400">
        <AlertTriangle className="w-10 h-10 text-yellow-400 mx-auto mb-2" />
        Exception record not found.
      </div>
    );
  }

  const ex = data.exception;
  const sources = data.sources || {};
  const calc = data.calculation;
  const explanation = ex.aiExplanation;
  const traces = ex.agentTraces || [];
  const auditTimeline = data.auditTimeline || [];

  const transitionMap: Record<string, string[]> = {
    OPEN: ["INVESTIGATING", "ESCALATED"],
    INVESTIGATING: ["PENDING_APPROVAL", "ESCALATED"],
    PENDING_APPROVAL: ["RESOLVED", "REJECTED"],
    REJECTED: ["INVESTIGATING"],
    ESCALATED: ["INVESTIGATING"],
    RESOLVED: ["REOPENED"],
    REOPENED: ["INVESTIGATING"],
  };

  const allowedNextStates = transitionMap[ex.status] || [];

  // ── Golden Record Provenance Chain ──
  const provenanceSteps = [
    {
      label: "Order",
      icon: FileText,
      status: sources.order ? "FOUND" : "MISSING",
      data: sources.order
        ? {
            id: sources.order.orderId,
            amount: formatCurrency(sources.order.amount),
            detail: sources.order.status,
            date: sources.order.createdAt ? formatDate(sources.order.createdAt) : null,
          }
        : null,
      color: sources.order ? "text-green-400" : "text-red-400",
    },
    {
      label: "Payment",
      icon: Database,
      status: sources.payment ? "FOUND" : "MISSING",
      data: sources.payment
        ? {
            id: sources.payment.paymentId,
            amount: formatCurrency(sources.payment.amount),
            detail: `${sources.payment.method} · fee ${formatCurrency(sources.payment.fee)}`,
            date: null,
          }
        : null,
      color: sources.payment ? "text-green-400" : "text-red-400",
    },
    {
      label: "Settlement",
      icon: Link2,
      status: sources.settlement ? "FOUND" : "MISSING",
      data: sources.settlement
        ? {
            id: sources.settlement.settlementId,
            amount: formatCurrency(sources.settlement.amount),
            detail: sources.settlement.utr ? `UTR: ${sources.settlement.utr}` : "No UTR",
            date: sources.settlement.settledAt ? formatDate(sources.settlement.settledAt) : null,
          }
        : null,
      color: sources.settlement ? "text-green-400" : "text-red-400",
    },
    {
      label: "Bank Credit",
      icon: Database,
      status: sources.bankTxn ? "FOUND" : "MISSING",
      data: sources.bankTxn
        ? {
            id: sources.bankTxn.txnId,
            amount: formatCurrency(sources.bankTxn.amount),
            detail: sources.bankTxn.type,
            date: sources.bankTxn.txnDate ? formatDate(sources.bankTxn.txnDate) : null,
          }
        : null,
      color: sources.bankTxn ? "text-green-400" : "text-red-400",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href={`/exceptions?batchId=${batchId}`}
          className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-white mb-3 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Exception Queue
        </Link>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-white">
                {EXCEPTION_LABELS[ex.exceptionType] || ex.exceptionType}
              </h1>
              <Badge className={getRiskColor(ex.riskLevel)}>
                {ex.riskLevel} RISK
              </Badge>
              <Badge variant="outline" className={getStatusColor(ex.status)}>
                {ex.status}
              </Badge>
            </div>
            <p className="text-xs text-gray-400 mt-1 font-mono">
              Exception ID: {ex.id} · Payment ID: {ex.paymentId || "N/A"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Engine Confidence:</span>
            <span className={`text-lg font-bold ${
              ex.confidenceScore < 30 ? "text-red-400" :
              ex.confidenceScore < 60 ? "text-yellow-400" : "text-green-400"
            }`}>
              {ex.confidenceScore}%
            </span>
          </div>
        </div>
      </div>

      {/* ── GOLDEN RECORD PROVENANCE CHAIN ── */}
      <Card className="bg-gray-900 border-amber-800/40">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold text-amber-400 flex items-center gap-2">
            <Link2 className="w-4 h-4" /> Golden Record — Source Provenance Chain
          </CardTitle>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowProvenance(!showProvenance)}
            className="text-xs text-gray-400 hover:text-white h-7"
          >
            {showProvenance ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {showProvenance ? "Collapse" : "Expand"}
          </Button>
        </CardHeader>
        {showProvenance && (
          <CardContent>
            <div className="flex flex-col md:flex-row gap-3">
              {provenanceSteps.map((step, idx) => {
                const Icon = step.icon;
                return (
                  <div key={idx} className="flex-1">
                    <div className={`bg-gray-950 rounded-lg border ${
                      step.status === "FOUND" ? "border-gray-700" : "border-red-800"
                    } p-3 h-full`}>
                      <div className="flex items-center gap-2 mb-2">
                        <Icon className={`w-4 h-4 ${step.color}`} />
                        <span className="text-xs font-semibold text-gray-300">{step.label}</span>
                        {step.status === "FOUND" ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-400 ml-auto" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-red-400 ml-auto" />
                        )}
                      </div>
                      {step.data ? (
                        <div className="space-y-1 text-[11px] font-mono text-gray-400">
                          <p className="text-gray-300 font-semibold">{step.data.id}</p>
                          <p>{step.data.amount}</p>
                          <p className="truncate">{step.data.detail}</p>
                          {step.data.date && <p className="text-gray-500">{step.data.date}</p>}
                        </div>
                      ) : (
                        <p className="text-[11px] text-red-400 italic">Not found in source records</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        )}
      </Card>

      {/* State Machine Action Control */}
      <Card className="bg-gray-900 border-blue-800/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-blue-400 flex items-center gap-2">
            <GitCommit className="w-4 h-4" /> State Machine Action Control
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-400 mr-2">Available Transitions:</span>
            {allowedNextStates.length === 0 ? (
              <span className="text-xs text-gray-500 italic">No transitions available</span>
            ) : (
              allowedNextStates.map((nextState) => (
                <Button
                  key={nextState}
                  size="sm"
                  disabled={transitioning}
                  onClick={() => handleTransition(nextState)}
                  className={
                    nextState === "RESOLVED"
                      ? "bg-green-600 hover:bg-green-700 text-white"
                      : nextState === "REJECTED" || nextState === "ESCALATED"
                      ? "bg-rose-600 hover:bg-rose-700 text-white"
                      : "bg-blue-600 hover:bg-blue-700 text-white"
                  }
                >
                  {transitioning ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                  {nextState}
                </Button>
              ))
            )}
          </div>

          {allowedNextStates.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-gray-800">
              <Input
                placeholder="Transition Reason (e.g. Verified with bank statement UTR)..."
                value={actionReason}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setReason(e.target.value)}
                className="bg-gray-800 border-gray-700 text-xs text-gray-200 h-8"
              />
              {allowedNextStates.includes("RESOLVED") && (
                <Input
                  placeholder="Resolution Notes (Mandatory for RESOLVED state)..."
                  value={resolutionText}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setResolution(e.target.value)}
                  className="bg-gray-800 border-gray-700 text-xs text-gray-200 h-8"
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Calculation Breakdown */}
      {calc && (
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-300">
              🧮 Settlement Calculation Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs font-mono space-y-1 text-gray-300 bg-gray-950 p-4 rounded-lg border border-gray-800">
            <div className="flex justify-between">
              <span>Payment Captured Amount:</span>
              <span>{formatCurrency(calc.paymentAmount)}</span>
            </div>
            <div className="flex justify-between text-red-400">
              <span>- Razorpay Fee Deduction:</span>
              <span>-{formatCurrency(calc.fee)}</span>
            </div>
            <div className="flex justify-between text-red-400">
              <span>- GST on Fee (18%):</span>
              <span>-{formatCurrency(calc.tax)}</span>
            </div>
            {calc.refundAmount > 0 && (
              <div className="flex justify-between text-amber-400">
                <span>- Refunds Applied:</span>
                <span>-{formatCurrency(calc.refundAmount)}</span>
              </div>
            )}
            {calc.chargebackAmount > 0 && (
              <div className="flex justify-between text-rose-400">
                <span>- Chargeback Deductions:</span>
                <span>-{formatCurrency(calc.chargebackAmount)}</span>
              </div>
            )}
            <div className="border-t border-gray-700 my-2 pt-2 flex justify-between font-bold text-white">
              <span>= Expected Net Settlement:</span>
              <span>{formatCurrency(calc.expectedNetAmount)}</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>Actual Settled Amount:</span>
              <span>{calc.actualSettledAmount ? formatCurrency(calc.actualSettledAmount) : "N/A"}</span>
            </div>
            {calc.mismatchAmount ? (
              <div className="flex justify-between font-bold text-orange-400 pt-1">
                <span>Discrepancy / Mismatch Amount:</span>
                <span>Δ {formatCurrency(calc.mismatchAmount)}</span>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* AI Analysis */}
      <Card className="bg-gray-900 border-purple-800/40">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-semibold text-purple-400 flex items-center gap-2">
            <Brain className="w-4 h-4" /> AI Analysis & Evidence
          </CardTitle>
          {!explanation && (
            <Button
              size="sm"
              disabled={explaining}
              onClick={handleExplain}
              className="bg-purple-600 hover:bg-purple-700 text-xs h-7"
            >
              {explaining ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Sparkles className="w-3 h-3 mr-1" />}
              Generate AI Analysis
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {explanation ? (
            <>
              <div>
                <p className="text-xs text-gray-500 font-semibold">Summary</p>
                <p className="text-sm text-gray-200">{explanation.summary}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-semibold">Root Cause Explanation</p>
                <p className="text-xs text-gray-300">{explanation.reason}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-semibold mb-1">Evidence Chain</p>
                <ul className="list-disc list-inside text-xs text-gray-400 space-y-1 font-mono">
                  {(JSON.parse(explanation.evidence || "[]") as string[]).map((ev, idx) => (
                    <li key={idx}>{ev}</li>
                  ))}
                </ul>
              </div>
              <div className="pt-2 border-t border-gray-800">
                <p className="text-xs text-gray-500 font-semibold">Recommended Action</p>
                <p className="text-xs text-green-400 font-medium">{explanation.recommendedAction}</p>
              </div>
            </>
          ) : (
            <p className="text-xs text-gray-500 italic">No AI analysis generated yet for this exception.</p>
          )}
        </CardContent>
      </Card>

      {/* Agent Reasoning Trace */}
      {traces.length > 0 && (
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-300 flex items-center gap-2">
              <Bot className="w-4 h-4 text-blue-400" /> Agent Reasoning Trace (Step-by-Step)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {traces.map((trace) => (
              <div key={trace.id} className="bg-gray-950 p-3 rounded border border-gray-800 text-xs">
                <div className="flex items-center justify-between text-gray-400 mb-1">
                  <span className="font-semibold text-blue-400">
                    Pass {trace.passNumber}: {trace.agentName} (Step {trace.stepNumber})
                  </span>
                  <span>{trace.stepLabel}</span>
                </div>
                <p className="text-gray-300 font-mono">{trace.stepDetail}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Audit History */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-gray-300 flex items-center gap-2">
            <Clock className="w-4 h-4 text-orange-400" /> Exception Audit History
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {auditTimeline.length === 0 ? (
            <p className="text-xs text-gray-500 italic">No audit records for this exception.</p>
          ) : (
            auditTimeline.map((log) => (
              <div key={log.id} className="flex items-start gap-3 text-xs border-b border-gray-800 pb-2.5 last:border-0">
                <div className="mt-0.5">
                  {log.actor === "AI" ? (
                    <Bot className="w-4 h-4 text-purple-400" />
                  ) : log.actor === "SYSTEM" ? (
                    <Shield className="w-4 h-4 text-blue-400" />
                  ) : (
                    <User className="w-4 h-4 text-green-400" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-200">
                      {log.action} by {log.actor}
                    </span>
                    <span className="text-[10px] text-gray-500">{formatDate(log.timestamp)}</span>
                  </div>
                  <p className="text-gray-400 mt-0.5">{log.reason}</p>
                  {log.beforeState && (
                    <p className="text-red-400/80 text-[10px] mt-1 font-mono">- {log.beforeState}</p>
                  )}
                  {log.afterState && (
                    <p className="text-green-400/80 text-[10px] mt-0.5 font-mono">+ {log.afterState}</p>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}