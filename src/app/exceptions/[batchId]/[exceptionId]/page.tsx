"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bot,
  Brain,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Database,
  FileText,
  Fingerprint,
  GitBranch,
  Loader2,
  LockKeyhole,
  MessageSquareText,
  ShieldAlert,
  ShieldCheck,
  UserRound,
  XCircle,
} from "lucide-react";
import {
  formatCurrency,
  formatDate,
} from "@/lib/format";
import {
  EXCEPTION_LABELS,
  type ExceptionType,
} from "@/lib/constants";

interface PageProps {
  params: Promise<{
    batchId: string;
    exceptionId: string;
  }>;
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

interface EvidenceItemUI {
  evidenceId: string;
  sourceType: string;
  sourceReference: string;
  title: string;
  contentHash: string;
  hashAlgorithm: string;
  byteLength: number;
  accessClassification: string;
  provider: string;
  verificationStatus: "VALID" | "TAMPER_DETECTED";
  rawText?: string;
  structuredData?: Record<string, unknown>;
  createdAt: string;
}

interface ContradictionFindingUI {
  type: string;
  sourceA: string;
  claimA: string;
  valueA: string | number;
  sourceB: string;
  claimB: string;
  valueB: string | number;
  severity: string;
  description: string;
  recommendedReviewLevel: string;
}

interface GraphNodeUI {
  id: string;
  type: string;
  label: string;
  classification: string;
}

interface GraphEdgeUI {
  source: string;
  target: string;
  relationType: string;
  confidence: number;
  reason: string;
  evidenceIds: string[];
  isTrusted: boolean;
}


interface ClaimCheckUI {
  checkName: string;
  passed: boolean;
  message: string;
}

interface ClaimValidationUI {
  claimId: string;
  type: string;
  status: "VERIFIED" | "DISPUTED" | "UNSUPPORTED" | "INSUFFICIENT_EVIDENCE";
  statement: string;
  evidenceIds: string[];
  checks: ClaimCheckUI[];
  disputeReasons: string[];
  receiptHash: string;
}

interface ClaimAuditReceiptUI {
  receiptId: string;
  totalClaimsCount: number;
  verifiedClaimsCount: number;
  disputedClaimsCount: number;
  unsupportedClaimsCount: number;
  abstain: boolean;
  canonicalHash: string;
}

interface CouncilChallengeUI {
  code: string;
  detail: string;
  severity: string;
}

interface VerificationCouncilUI {
  routing: {
    shouldInvoke: boolean;
    routingReason: string;
    materialityScore: number;
  };
  decision: {
    councilRunId: string;
    outcome: string;
    investigator: {
      hypothesis: string;
      reasoning: string;
      evidenceIds: string[];
      supportingFacts: string[];
      uncertainties: string[];
      recommendedAction: string;
      confidence: number;
    };
    skeptic: {
      verdict: string;
      challenges: CouncilChallengeUI[];
      verifiedEvidenceIds: string[];
      confidence: number;
      riskAdjustment: string;
      reason: string;
    };
    claimReceipt?: ClaimAuditReceiptUI;
    claimValidation?: ClaimValidationUI[];
    finalRiskLevel: string;
    auditTrail: {
      councilRunId: string;
      policyVersion: string;
      investigatorInputHash: string;
      investigatorOutputHash: string;
      skepticInputHash: string;
      skepticOutputHash: string;
      decisionOutcome: string;
    };
    authorityDisclaimer: string;
  };
}

interface GroundedInvestigationUI {
  summary: string;
  reason: string;
  evidenceIds: string[];
  recommendedAction: string;
  confidence: number;
  uncertainties: string[];
  questionsRemaining: string[];
  conflictsFound: ContradictionFindingUI[];
  decisionOutcome: string;
  authorityNotice: string;
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
    evidenceVault?: {
    items: EvidenceItemUI[];
    totalItems: number;
    tamperedCount: number;
    contradictions: ContradictionFindingUI[];
    graph: {
      nodes: GraphNodeUI[];
      edges: GraphEdgeUI[];
    };
  };
  groundedInvestigation?: GroundedInvestigationUI;
  verificationCouncil?: VerificationCouncilUI;
}

const WORKFLOW_PATH = [
  "OPEN",
  "INVESTIGATING",
  "PENDING_APPROVAL",
  "RESOLVED",
] as const;

const transitionMap: Record<string, string[]> = {
  OPEN: ["INVESTIGATING", "ESCALATED"],
  INVESTIGATING: ["PENDING_APPROVAL", "ESCALATED"],
  PENDING_APPROVAL: ["RESOLVED", "REJECTED"],
  REJECTED: ["INVESTIGATING"],
  ESCALATED: ["INVESTIGATING"],
  RESOLVED: ["REOPENED"],
  REOPENED: ["INVESTIGATING"],
};

function formatExceptionType(value: string) {
  return (
    EXCEPTION_LABELS[value as ExceptionType] ||
    value
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase())
  );
}

function getRiskMeta(risk: string) {
  if (risk === "HIGH") {
    return {
      text: "text-[#c9877b]",
      border: "border-[#593a35]",
      bg: "bg-[#180f0d]",
      dot: "bg-[#b67167]",
    };
  }

  if (risk === "MEDIUM") {
    return {
      text: "text-[#c8b173]",
      border: "border-[#584b31]",
      bg: "bg-[#17130b]",
      dot: "bg-[#b49a60]",
    };
  }

  return {
    text: "text-[#a7b58e]",
    border: "border-[#3c4a35]",
    bg: "bg-[#10150f]",
    dot: "bg-[#899d73]",
  };
}

function getStatusMeta(status: string) {
  const map: Record<
    string,
    { text: string; border: string; bg: string; dot: string }
  > = {
    OPEN: {
      text: "text-[#a5aaa1]",
      border: "border-[#3a4038]",
      bg: "bg-[#111410]",
      dot: "bg-[#9aa09a]",
    },
    INVESTIGATING: {
      text: "text-[#a9b68f]",
      border: "border-[#44503b]",
      bg: "bg-[#12170f]",
      dot: "bg-[#8f9f78]",
    },
    PENDING_APPROVAL: {
      text: "text-[#c9b376]",
      border: "border-[#584b31]",
      bg: "bg-[#17130b]",
      dot: "bg-[#b49a60]",
    },
    ESCALATED: {
      text: "text-[#c78578]",
      border: "border-[#563b36]",
      bg: "bg-[#170f0d]",
      dot: "bg-[#b67167]",
    },
    RESOLVED: {
      text: "text-[#a6b58c]",
      border: "border-[#3b4a35]",
      bg: "bg-[#10150f]",
      dot: "bg-[#899d73]",
    },
    REJECTED: {
      text: "text-[#c17f76]",
      border: "border-[#533936]",
      bg: "bg-[#170f0d]",
      dot: "bg-[#b0675e]",
    },
    REOPENED: {
      text: "text-[#b9aa7b]",
      border: "border-[#50462f]",
      bg: "bg-[#15130d]",
      dot: "bg-[#a9966a]",
    },
  };

  return (
    map[status] || {
      text: "text-[#9a9f97]",
      border: "border-[#343934]",
      bg: "bg-[#111410]",
      dot: "bg-[#858b83]",
    }
  );
}

function SectionHeader({
  eyebrow,
  title,
  icon: Icon,
  right,
}: {
  eyebrow: string;
  title: string;
  icon: typeof Database;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4 border-b border-[#252a24] px-5 py-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-[#98a27e]" />

          <span className="text-[8px] font-medium uppercase tracking-[0.2em] text-[#626960]">
            {eyebrow}
          </span>
        </div>

        <h2 className="mt-1 text-[13px] font-semibold tracking-[-0.01em] text-[#dddcd4]">
          {title}
        </h2>
      </div>

      {right}
    </div>
  );
}

function SourceCard({
  label,
  icon: Icon,
  found,
  id,
  amount,
  detail,
  date,
}: {
  label: string;
  icon: typeof Database;
  found: boolean;
  id?: string;
  amount?: string;
  detail?: string;
  date?: string | null;
}) {
  return (
    <div
      className={`border p-4 ${
        found
          ? "border-[#30372d] bg-[#0b0e0b]"
          : "border-[#523632] bg-[#130e0d]"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon
            className={`h-4 w-4 ${
              found ? "text-[#9eae84]" : "text-[#b9786d]"
            }`}
          />

          <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#9ea199]">
            {label}
          </span>
        </div>

        {found ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-[#8fa278]" />
        ) : (
          <XCircle className="h-3.5 w-3.5 text-[#ad6c62]" />
        )}
      </div>

      {found ? (
        <div className="mt-4 space-y-1.5">
          <div className="truncate font-mono text-[10px] font-medium text-[#ceccc3]">
            {id}
          </div>

          {amount ? (
            <div className="text-[13px] font-semibold text-[#c9b57f]">
              {amount}
            </div>
          ) : null}

          {detail ? (
            <div className="truncate text-[9px] text-[#666d63]">
              {detail}
            </div>
          ) : null}

          {date ? (
            <div className="text-[9px] text-[#50574e]">{date}</div>
          ) : null}
        </div>
      ) : (
        <div className="mt-4 text-[9px] italic leading-5 text-[#a06e66]">
          Record not found in source data.
        </div>
      )}
    </div>
  );
}

function parseEvidence(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw || "[]");

    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (value): value is string => typeof value === "string",
    );
  } catch {
    return raw
      ? raw
          .split("\n")
          .map((value) => value.trim())
          .filter(Boolean)
      : [];
  }
}

export default function ExceptionDetailPage({
  params,
}: PageProps) {
  const { batchId, exceptionId } = use(params);

  const [data, setData] = useState<ExceptionDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [transitioning, setTransitioning] = useState(false);
  const [explaining, setExplaining] = useState(false);

  const [actionReason, setReason] = useState("");
  const [resolutionText, setResolution] = useState("");

  const [showProvenance, setShowProvenance] = useState(true);
  const [showCalculation, setShowCalculation] = useState(true);
  const [showTrace, setShowTrace] = useState(false);

  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadData = useCallback(() => {
    setLoading(true);

    fetch(`/api/exceptions/detail/${exceptionId}`)
      .then((res) => res.json())
      .then((result: ExceptionDetailResponse) => {
        if (result.success) {
          setData(result);
        }
      })
      .catch((error) => {
        console.error(error);
        setActionError("Unable to load the investigation record.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [exceptionId]);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((result: { user?: { role: string } }) => {
        if (result.user) {
          setCurrentRole(result.user.role);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    // loadData resets loading synchronously; defer the initial invocation out
    // of the effect frame so setState runs after the effect body completes
    // (react-hooks/set-state-in-effect).
    queueMicrotask(() => loadData());
  }, [loadData]);

  const handleTransition = async (targetState: string) => {
    setTransitioning(true);
    setActionError(null);

    try {
      const response = await fetch(
        `/api/exceptions/${exceptionId}/status`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status: targetState,
            reason:
              actionReason.trim() ||
              `Transitioned to ${targetState}`,
            resolution: resolutionText.trim() || undefined,
          }),
        },
      );

      const responseData = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        setActionError(
          responseData.error || "The workflow transition was rejected.",
        );
        return;
      }

      setReason("");
      setResolution("");
      loadData();
    } catch (error) {
      setActionError(`Unable to update workflow: ${String(error)}`);
    } finally {
      setTransitioning(false);
    }
  };

  const handleExplain = async () => {
    setExplaining(true);
    setActionError(null);

    try {
      const response = await fetch(
        `/api/exceptions/${exceptionId}/explain`,
        {
          method: "POST",
        },
      );

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));

        setActionError(
          result.error || "Unable to generate the explanation.",
        );

        return;
      }

      loadData();
    } catch (error) {
      setActionError(`Unable to generate explanation: ${String(error)}`);
    } finally {
      setExplaining(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[75vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center border border-[#30352f] bg-[#0d100d]">
            <Loader2 className="h-4 w-4 animate-spin text-[#a7b587]" />
          </div>

          <p className="mt-4 text-[9px] font-medium uppercase tracking-[0.18em] text-[#656b62]">
            Loading investigation record
          </p>
        </div>
      </div>
    );
  }

  if (!data?.exception) {
    return (
      <div className="flex min-h-[75vh] items-center justify-center">
        <div className="w-full max-w-md border border-[#40332f] bg-[#100d0c] p-8 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center border border-[#593b35]">
            <AlertTriangle className="h-5 w-5 text-[#bb786e]" />
          </div>

          <h2 className="mt-5 text-lg font-semibold text-[#e7e4db]">
            Investigation record not found
          </h2>

          <p className="mt-2 text-[11px] leading-5 text-[#6f756c]">
            The exception may have been removed or is no longer available.
          </p>

          <Link
            href={`/exceptions?batchId=${batchId}`}
            className="mt-6 inline-flex items-center gap-2 border border-[#353b32] px-4 py-2.5 text-[9px] font-medium uppercase tracking-[0.14em] text-[#b0b59f] hover:bg-[#141811]"
          >
            <ArrowLeft className="h-3 w-3" />
            Return to queue
          </Link>
        </div>
      </div>
    );
  }

  const ex = data.exception;
  const sources = data.sources || {};
  const calc = data.calculation;
  const explanation = ex.aiExplanation;
  const traces = ex.agentTraces || [];
  const auditTimeline = data.auditTimeline || [];

  const allowedNextStates = transitionMap[ex.status] || [];
  const workflowIndex = WORKFLOW_PATH.indexOf(
    ex.status as (typeof WORKFLOW_PATH)[number],
  );

  const offPath = workflowIndex === -1;

  const offPathLabel: Record<string, string> = {
    ESCALATED:
      "Escalated — returned to investigation before approval.",
    REJECTED:
      "Rejected at approval — returned to investigation.",
    REOPENED:
      "Reopened — returned to investigation.",
  };

  const riskMeta = getRiskMeta(ex.riskLevel);
  const statusMeta = getStatusMeta(ex.status);
  const evidence = explanation
    ? parseEvidence(explanation.evidence)
    : [];

  const isAdmin = currentRole?.toUpperCase() === "ADMIN";

  const provenanceSteps = [
    {
      label: "Order",
      icon: FileText,
      found: Boolean(sources.order),
      id: sources.order?.orderId,
      amount: sources.order
        ? formatCurrency(sources.order.amount)
        : undefined,
      detail: sources.order?.status,
      date: sources.order?.createdAt
        ? formatDate(sources.order.createdAt)
        : null,
    },
    {
      label: "Payment",
      icon: Database,
      found: Boolean(sources.payment),
      id: sources.payment?.paymentId,
      amount: sources.payment
        ? formatCurrency(sources.payment.amount)
        : undefined,
      detail: sources.payment
        ? `${sources.payment.method} · fee ${formatCurrency(
            sources.payment.fee,
          )}`
        : undefined,
      date: null,
    },
    {
      label: "Settlement",
      icon: GitBranch,
      found: Boolean(sources.settlement),
      id: sources.settlement?.settlementId,
      amount: sources.settlement
        ? formatCurrency(sources.settlement.amount)
        : undefined,
      detail: sources.settlement?.utr
        ? `UTR ${sources.settlement.utr}`
        : "No UTR",
      date: sources.settlement?.settledAt
        ? formatDate(sources.settlement.settledAt)
        : null,
    },
    {
      label: "Bank credit",
      icon: Database,
      found: Boolean(sources.bankTxn),
      id: sources.bankTxn?.txnId,
      amount: sources.bankTxn
        ? formatCurrency(sources.bankTxn.amount)
        : undefined,
      detail: sources.bankTxn?.type,
      date: sources.bankTxn?.txnDate
        ? formatDate(sources.bankTxn.txnDate)
        : null,
    },
  ];

  const confidenceColor =
    ex.confidenceScore >= 80
      ? "text-[#a9b98e]"
      : ex.confidenceScore >= 50
        ? "text-[#c5ac73]"
        : "text-[#c47d73]";

  const confidenceBar =
    ex.confidenceScore >= 80
      ? "bg-[#93a97a]"
      : ex.confidenceScore >= 50
        ? "bg-[#b79b61]"
        : "bg-[#a9655e]";

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <header className="border-b border-[#20241f] pb-6">
        <Link
          href={`/exceptions?batchId=${batchId}`}
          className="mb-5 inline-flex items-center gap-2 text-[9px] font-medium uppercase tracking-[0.16em] text-[#747b71] transition hover:text-[#c0c3ba]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Exception queue
        </Link>

        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex items-center gap-2">
              <div
                className={`flex h-7 w-7 items-center justify-center border ${riskMeta.border} ${riskMeta.bg}`}
              >
                <AlertTriangle className={`h-3.5 w-3.5 ${riskMeta.text}`} />
              </div>

              <span className="text-[8px] font-medium uppercase tracking-[0.22em] text-[#626960]">
                Investigation / Financial exception
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-[28px] font-semibold tracking-[-0.045em] text-[#efede5]">
                {formatExceptionType(ex.exceptionType)}
              </h1>

              <span
                className={`inline-flex items-center gap-1.5 border px-2.5 py-1 text-[8px] font-semibold uppercase tracking-[0.14em] ${riskMeta.border} ${riskMeta.bg} ${riskMeta.text}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${riskMeta.dot}`} />
                {ex.riskLevel} risk
              </span>

              <span
                className={`border px-2.5 py-1 text-[8px] font-medium uppercase tracking-[0.14em] ${statusMeta.border} ${statusMeta.bg} ${statusMeta.text}`}
              >
                {ex.status.replace(/_/g, " ")}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-[#60675e]">
              <span>
                Exception{" "}
                <span className="font-mono text-[#888d84]">
                  {ex.id}
                </span>
              </span>

              <span className="text-[#353a34]">/</span>

              <span>
                Payment{" "}
                <span className="font-mono text-[#888d84]">
                  {ex.paymentId || "N/A"}
                </span>
              </span>
            </div>
          </div>

          <div className="min-w-[220px] border border-[#2a2f28] bg-[#0d100d] px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-[8px] font-medium uppercase tracking-[0.17em] text-[#62685f]">
                Engine confidence
              </span>

              <Fingerprint className="h-3.5 w-3.5 text-[#6c7464]" />
            </div>

            <div className="mt-3 flex items-end justify-between">
              <span className={`text-[27px] font-semibold tracking-[-0.05em] ${confidenceColor}`}>
                {ex.confidenceScore}%
              </span>

              <span className="mb-1 text-[8px] uppercase tracking-[0.14em] text-[#5d645b]">
                deterministic
              </span>
            </div>

            <div className="mt-2 h-1 bg-[#232823]">
              <div
                className={`h-full ${confidenceBar}`}
                style={{
                  width: `${Math.min(
                    100,
                    Math.max(0, ex.confidenceScore),
                  )}%`,
                }}
              />
            </div>
          </div>
        </div>
      </header>

      {/* Error */}
      {actionError ? (
        <div className="flex items-start justify-between gap-4 border border-[#593b35] bg-[#160f0d] px-4 py-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#b9756b]" />

            <div>
              <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#c28278]">
                Action rejected
              </div>

              <div className="mt-1 text-[11px] text-[#a97870]">
                {actionError}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-[#6d736a] hover:text-[#aaaFA5]"
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {/* What is wrong */}
      {calc ? (
        <section className="border border-[#4c3b32] bg-[#110f0c]">
          <div className="border-b border-[#332a24] px-5 py-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-[#c29c67]" />
              <span className="text-[8px] font-medium uppercase tracking-[0.2em] text-[#7e7769]">
                Financial discrepancy
              </span>
            </div>
          </div>

          <div className="grid gap-px bg-[#332a24] md:grid-cols-3">
            <div className="bg-[#0f0d0b] px-5 py-5">
              <div className="text-[8px] uppercase tracking-[0.17em] text-[#69645a]">
                Expected net
              </div>

              <div className="mt-2 font-mono text-[20px] font-semibold tracking-[-0.03em] text-[#e4dfd2]">
                {formatCurrency(calc.expectedNetAmount)}
              </div>

              <div className="mt-1 text-[9px] text-[#59564f]">
                calculated by deterministic engine
              </div>
            </div>

            <div className="bg-[#0f0d0b] px-5 py-5">
              <div className="text-[8px] uppercase tracking-[0.17em] text-[#69645a]">
                Actual settled
              </div>

              <div className="mt-2 font-mono text-[20px] font-semibold tracking-[-0.03em] text-[#d1cec3]">
                {calc.actualSettledAmount !== null
                  ? formatCurrency(calc.actualSettledAmount)
                  : "—"}
              </div>

              <div className="mt-1 text-[9px] text-[#59564f]">
                observed settlement amount
              </div>
            </div>

            <div className="bg-[#120e0c] px-5 py-5">
              <div className="text-[8px] uppercase tracking-[0.17em] text-[#746056]">
                Discrepancy
              </div>

              <div className="mt-2 font-mono text-[20px] font-semibold tracking-[-0.03em] text-[#c78678]">
                {calc.mismatchAmount
                  ? `Δ ${formatCurrency(calc.mismatchAmount)}`
                  : "No variance"}
              </div>

              <div className="mt-1 text-[9px] text-[#66534d]">
                materiality / classification output
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* Workflow */}
      <section className="border border-[#2a2e29] bg-[#0d100d]">
        <SectionHeader
  eyebrow="Human-in-the-loop control"
  title="Investigation workflow"
  icon={GitBranch}
  right={
    <div className="flex items-center gap-2 text-[8px] uppercase tracking-[0.14em] text-[#626960]">
      <LockKeyhole className="h-3 w-3" />
      Controlled transitions
    </div>
  }
/>

        <div className="p-5">
          <div className="grid gap-3 md:grid-cols-4">
  {WORKFLOW_PATH.map((state, index) => {
    const isCurrent =
      !offPath && workflowIndex === index;

    const isReached =
      !offPath && workflowIndex > index;

    return (
      <div
        key={state}
        className="flex min-w-0 items-center gap-3"
      >
        <div className="min-w-0 flex-1">
          <div
            className={`relative border px-3 py-4 text-center transition ${
              isCurrent
                ? "border-[#697753] bg-[#141a11] shadow-[inset_0_0_0_1px_rgba(169,184,139,0.08)]"
                : isReached
                  ? "border-[#30382c] bg-[#0f130f]"
                  : "border-[#262b25] bg-[#0a0d0a]"
            }`}
          >
            {isCurrent && (
              <div className="absolute inset-x-0 top-0 h-px bg-[#a8b98b]" />
            )}

            <div
              className={`text-[9px] font-semibold uppercase tracking-[0.14em] ${
                isCurrent
                  ? "text-[#c2cfaa]"
                  : isReached
                    ? "text-[#8f997f]"
                    : "text-[#6d746b]"
              }`}
            >
              {state.replace(/_/g, " ")}
            </div>

            {isCurrent ? (
              <div className="mt-2 flex items-center justify-center gap-1.5 text-[7px] font-medium uppercase tracking-[0.18em] text-[#9faf83]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#9faf83]" />
                Current
              </div>
            ) : isReached ? (
              <div className="mt-2 flex justify-center">
                <Check className="h-3 w-3 text-[#849675]" />
              </div>
            ) : null}
          </div>
        </div>

        {index < WORKFLOW_PATH.length - 1 ? (
          <div className="hidden shrink-0 items-center md:flex">
            <div
              className={`h-px w-3 ${
                isReached
                  ? "bg-[#59664b]"
                  : "bg-[#30352e]"
              }`}
            />

            <ArrowRight
              className={`h-3.5 w-3.5 ${
                isReached
                  ? "text-[#7f8e6a]"
                  : "text-[#4a5148]"
              }`}
              strokeWidth={1.5}
            />
          </div>
        ) : null}
      </div>
    );
  })}
</div>

          {offPath ? (
            <div className="mt-4 flex items-start gap-3 border border-[#514037] bg-[#15100d] px-4 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#b67c6c]" />

              <div>
                <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#bd877a]">
                  {ex.status}
                </div>

                <div className="mt-1 text-[10px] leading-5 text-[#7f6860]">
                  {offPathLabel[ex.status] ||
                    "This case is currently outside the main approval path."}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {/* Provenance */}
      <section className="border border-[#2a2e29] bg-[#0d100d]">
        <div className="flex items-center justify-between border-b border-[#252a24] px-5 py-4">
          <div className="flex items-center gap-2">
            <Fingerprint className="h-3.5 w-3.5 text-[#9aa47f]" />

            <div>
              <div className="text-[8px] font-medium uppercase tracking-[0.2em] text-[#626960]">
                Golden record provenance
              </div>

              <div className="mt-1 text-[13px] font-semibold text-[#dddcd4]">
                Source chain
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowProvenance((value) => !value)}
            className="inline-flex items-center gap-1.5 border border-[#30352f] px-3 py-1.5 text-[8px] font-medium uppercase tracking-[0.14em] text-[#737a71] transition hover:border-[#4a5341] hover:text-[#b0b4aa]"
          >
            {showProvenance ? (
              <>
                <ChevronUp className="h-3 w-3" />
                Collapse
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" />
                Expand
              </>
            )}
          </button>
        </div>

        {showProvenance ? (
          <div className="p-5">
            <div className="grid gap-px bg-[#252a24] md:grid-cols-4">
              {provenanceSteps.map((step) => (
                <SourceCard
                  key={step.label}
                  label={step.label}
                  icon={step.icon}
                  found={step.found}
                  id={step.id}
                  amount={step.amount}
                  detail={step.detail}
                  date={step.date}
                />
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {/* Action control */}
      <section className="border border-[#2a2e29] bg-[#0d100d]">
        <SectionHeader
          eyebrow="Workflow execution"
          title="Authorized actions"
          icon={LockKeyhole}
          right={
            currentRole ? (
              <span className="border border-[#30352f] bg-[#10130f] px-2.5 py-1 text-[8px] uppercase tracking-[0.14em] text-[#777d74]">
                {currentRole}
              </span>
            ) : null
          }
        />

        <div className="p-5">
          <div className="flex flex-wrap gap-2">
            {allowedNextStates.length === 0 ? (
              <div className="text-[10px] italic text-[#626960]">
                No further workflow transitions are available.
              </div>
            ) : (
              allowedNextStates.map((nextState) => {
                const isApproval =
                  nextState === "RESOLVED" ||
                  nextState === "REJECTED";

                const blocked = isApproval && !isAdmin;

                const actionStyle =
                  nextState === "RESOLVED"
                    ? "border-[#495c3b] bg-[#15200f] text-[#b5c899] hover:bg-[#1a2712]"
                    : nextState === "REJECTED" ||
                        nextState === "ESCALATED"
                      ? "border-[#543935] bg-[#190f0d] text-[#c7887d] hover:bg-[#211310]"
                      : "border-[#414c39] bg-[#13180f] text-[#aab893] hover:bg-[#19200f]";

                return (
                  <button
                    key={nextState}
                    type="button"
                    disabled={transitioning || blocked}
                    title={
                      blocked
                        ? "ADMIN only — separation of duties"
                        : undefined
                    }
                    onClick={() => handleTransition(nextState)}
                    className={`inline-flex h-10 items-center gap-2 border px-4 text-[9px] font-semibold uppercase tracking-[0.13em] transition disabled:cursor-not-allowed disabled:opacity-40 ${actionStyle}`}
                  >
                    {transitioning ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : isApproval ? (
                      <LockKeyhole className="h-3 w-3" />
                    ) : (
                      <ArrowRight className="h-3 w-3" />
                    )}

                    {nextState.replace(/_/g, " ")}
                  </button>
                );
              })
            )}
          </div>

          {allowedNextStates.some(
            (state) =>
              state === "RESOLVED" || state === "REJECTED",
          ) && !isAdmin ? (
            <div className="mt-4 flex items-start gap-2 border border-[#4e4732] bg-[#14120d] px-3 py-2.5 text-[9px] leading-5 text-[#9d8c63]">
              <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Approval and rejection are ADMIN-only. Reviewers can
                investigate and prepare the case, but cannot execute the
                final financial decision.
              </span>
            </div>
          ) : null}

          {allowedNextStates.length > 0 ? (
            <div className="mt-5 grid gap-3 border-t border-[#222720] pt-5 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-[8px] font-medium uppercase tracking-[0.17em] text-[#62685f]">
                  Transition reason
                </label>

                <input
                  value={actionReason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Verified against bank statement / UTR..."
                  className="h-10 w-full border border-[#30352f] bg-[#0a0d0a] px-3 text-[11px] text-[#d1d0c8] outline-none placeholder:text-[#4f554d] focus:border-[#687557]"
                />
              </div>

              {allowedNextStates.includes("RESOLVED") ? (
                <div>
                  <label className="mb-2 block text-[8px] font-medium uppercase tracking-[0.17em] text-[#62685f]">
                    Resolution notes
                  </label>

                  <input
                    value={resolutionText}
                    onChange={(e) => setResolution(e.target.value)}
                    placeholder="Describe the verified resolution..."
                    className="h-10 w-full border border-[#30352f] bg-[#0a0d0a] px-3 text-[11px] text-[#d1d0c8] outline-none placeholder:text-[#4f554d] focus:border-[#687557]"
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      {/* Calculation */}
      {calc ? (
        <section className="border border-[#2a2e29] bg-[#0d100d]">
          <div className="flex items-center justify-between border-b border-[#252a24] px-5 py-4">
            <div className="flex items-center gap-2">
              <Database className="h-3.5 w-3.5 text-[#9aa47f]" />

              <div>
                <div className="text-[8px] font-medium uppercase tracking-[0.2em] text-[#626960]">
                  Deterministic engine
                </div>

                <div className="mt-1 text-[13px] font-semibold text-[#dddcd4]">
                  Settlement calculation
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowCalculation((value) => !value)}
              className="text-[#6e756b]"
            >
              {showCalculation ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
          </div>

          {showCalculation ? (
            <div className="p-5">
              <div className="overflow-hidden border border-[#292e28]">
                <div className="flex items-center justify-between border-b border-[#20241f] bg-[#0a0d0a] px-4 py-3">
                  <span className="text-[9px] uppercase tracking-[0.14em] text-[#626960]">
                    Payment captured
                  </span>

                  <span className="font-mono text-[11px] text-[#d1d0c7]">
                    {formatCurrency(calc.paymentAmount)}
                  </span>
                </div>

                <div className="flex items-center justify-between border-b border-[#20241f] px-4 py-3">
                  <span className="text-[9px] uppercase tracking-[0.14em] text-[#626960]">
                    Razorpay fee deduction
                  </span>

                  <span className="font-mono text-[11px] text-[#aa7970]">
                    -{formatCurrency(calc.fee)}
                  </span>
                </div>

                <div className="flex items-center justify-between border-b border-[#20241f] px-4 py-3">
                  <span className="text-[9px] uppercase tracking-[0.14em] text-[#626960]">
                    GST on fee
                  </span>

                  <span className="font-mono text-[11px] text-[#aa7970]">
                    -{formatCurrency(calc.tax)}
                  </span>
                </div>

                {calc.refundAmount > 0 ? (
                  <div className="flex items-center justify-between border-b border-[#20241f] px-4 py-3">
                    <span className="text-[9px] uppercase tracking-[0.14em] text-[#626960]">
                      Refunds applied
                    </span>

                    <span className="font-mono text-[11px] text-[#b8a06c]">
                      -{formatCurrency(calc.refundAmount)}
                    </span>
                  </div>
                ) : null}

                {calc.chargebackAmount > 0 ? (
                  <div className="flex items-center justify-between border-b border-[#20241f] px-4 py-3">
                    <span className="text-[9px] uppercase tracking-[0.14em] text-[#626960]">
                      Chargeback deductions
                    </span>

                    <span className="font-mono text-[11px] text-[#ab746c]">
                      -{formatCurrency(calc.chargebackAmount)}
                    </span>
                  </div>
                ) : null}

                <div className="flex items-center justify-between bg-[#10140f] px-4 py-4">
                  <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#9aa18f]">
                    Expected net settlement
                  </span>

                  <span className="font-mono text-[15px] font-semibold text-[#b8c79a]">
                    {formatCurrency(calc.expectedNetAmount)}
                  </span>
                </div>

                <div className="flex items-center justify-between border-t border-[#252a24] px-4 py-3">
                  <span className="text-[9px] uppercase tracking-[0.14em] text-[#626960]">
                    Actual settled amount
                  </span>

                  <span className="font-mono text-[11px] text-[#c9c8c0]">
                    {calc.actualSettledAmount !== null
                      ? formatCurrency(calc.actualSettledAmount)
                      : "N/A"}
                  </span>
                </div>

                {calc.mismatchAmount ? (
                  <div className="flex items-center justify-between border-t border-[#483731] bg-[#160f0d] px-4 py-4">
                    <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#987066]">
                      Discrepancy
                    </span>

                    <span className="font-mono text-[13px] font-semibold text-[#c27b70]">
                      Δ {formatCurrency(calc.mismatchAmount)}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Contradiction Alert Banner */}
      {data.evidenceVault?.contradictions && data.evidenceVault.contradictions.length > 0 ? (
        <section className="border border-[#683935] bg-[#160e0d]">
          <div className="flex items-center justify-between border-b border-[#3d2320] px-5 py-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-[#cf796c]" />
              <div>
                <div className="text-[8px] font-bold uppercase tracking-[0.2em] text-[#cf796c]">
                  Contradiction Detected
                </div>
                <div className="mt-0.5 text-[12px] font-semibold text-[#eed5d0]">
                  Conflicting claims across financial & contextual evidence
                </div>
              </div>
            </div>
            <span className="border border-[#552e2a] bg-[#221312] px-2.5 py-1 text-[8px] font-bold uppercase tracking-[0.14em] text-[#e0897d]">
              MANDATORY MAKER/CHECKER ESCALATION
            </span>
          </div>

          <div className="p-5 space-y-3">
            {data.evidenceVault.contradictions.map((c, idx) => (
              <div key={idx} className="border border-[#38201d] bg-[#0f0909] p-4 text-[11px]">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span className="font-semibold uppercase tracking-wider text-[#e6988d]">
                    {c.type.replace(/_/g, " ")} ({c.severity} SEVERITY)
                  </span>
                  <span className="font-mono text-[9px] text-[#916b65]">
                    {c.recommendedReviewLevel}
                  </span>
                </div>
                <p className="mt-1 text-[#b59e9a]">{c.description}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="border border-[#2d1a18] bg-[#140c0b] p-2.5">
                    <div className="text-[7px] uppercase tracking-wider text-[#755752]">{c.sourceA}</div>
                    <div className="mt-1 font-mono text-[10px] text-[#e3ceca]">{c.claimA}</div>
                  </div>
                  <div className="border border-[#2d1a18] bg-[#140c0b] p-2.5">
                    <div className="text-[7px] uppercase tracking-wider text-[#755752]">{c.sourceB}</div>
                    <div className="mt-1 font-mono text-[10px] text-[#e3ceca]">{c.claimB}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Context Vault & Evidence Graph */}
      {data.evidenceVault ? (
        <section className="border border-[#2a2e29] bg-[#0d100d]">
          <div className="flex flex-col gap-4 border-b border-[#252a24] px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <Database className="h-3.5 w-3.5 text-[#98a47f]" />
              <div>
                <div className="text-[8px] font-medium uppercase tracking-[0.2em] text-[#626960]">
                  Context Vault & Lineage
                </div>
                <div className="mt-1 text-[13px] font-semibold text-[#dddcd4]">
                  Deterministic Evidence Graph ({data.evidenceVault.totalItems} verified items)
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 border border-[#3e4d36] bg-[#11160f] px-2.5 py-1 text-[8px] font-bold uppercase tracking-[0.14em] text-[#a4b58a]">
                <CheckCircle2 className="h-3 w-3" />
                SHA-256 Verified
              </span>
            </div>
          </div>

          <div className="p-5 space-y-5">
            {/* Evidence Items List */}
            <div className="space-y-3">
              <div className="text-[8px] font-bold uppercase tracking-[0.16em] text-[#687066]">
                Verified Evidence Items in Vault
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.evidenceVault.items.map((item) => (
                  <div
                    key={item.evidenceId}
                    className="border border-[#252a24] bg-[#0a0d0a] p-3.5 transition hover:border-[#384234]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="truncate font-semibold text-[11px] text-[#dddcd4]">
                        {item.title}
                      </div>
                      <span className={"px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-wider border " + (
                        item.verificationStatus === "VALID"
                          ? "border-[#384a32] bg-[#10160d] text-[#a8b88d]"
                          : "border-[#552e2a] bg-[#221312] text-[#e0897d]"
                      )}>
                        {item.verificationStatus}
                      </span>
                    </div>

                    <div className="mt-2 flex items-center justify-between font-mono text-[8px] text-[#60675e]">
                      <span>{item.sourceType}</span>
                      <span>{item.provider}</span>
                    </div>

                    {item.rawText ? (
                      <p className="mt-2 line-clamp-2 text-[9px] leading-4 text-[#8a9186]">
                        {item.rawText}
                      </p>
                    ) : null}

                    <div className="mt-3 border-t border-[#1f241e] pt-2 flex items-center justify-between text-[7px] font-mono text-[#525950]">
                      <span className="truncate max-w-[120px]">hash: {item.contentHash.slice(0, 12)}...</span>
                      <span>{item.byteLength} bytes</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Relationship Graph Nodes & Edges */}
            {data.evidenceVault.graph.edges.length > 0 ? (
              <div className="border-t border-[#20241f] pt-4">
                <div className="text-[8px] font-bold uppercase tracking-[0.16em] text-[#687066]">
                  Active Graph Relations ({data.evidenceVault.graph.edges.length} edges)
                </div>

                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[600px] border-collapse text-left text-[9px]">
                    <thead>
                      <tr className="border-b border-[#20241f] bg-[#0a0d0a] text-[7px] uppercase tracking-[0.16em] text-[#555c52]">
                        <th className="px-3 py-2">Source Node</th>
                        <th className="px-3 py-2">Relation Type</th>
                        <th className="px-3 py-2">Target Node</th>
                        <th className="px-3 py-2 text-right">Confidence</th>
                        <th className="px-3 py-2">Trust Level</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#181c18]">
                      {data.evidenceVault.graph.edges.map((edge, idx) => (
                        <tr key={idx} className="hover:bg-[#0f130f]">
                          <td className="px-3 py-2 font-mono text-[#b3b9ab] truncate max-w-[160px]">{edge.source}</td>
                          <td className="px-3 py-2 font-bold text-[#8ba373]">{edge.relationType}</td>
                          <td className="px-3 py-2 font-mono text-[#b3b9ab] truncate max-w-[160px]">{edge.target}</td>
                          <td className="px-3 py-2 text-right font-mono text-[#9caf83]">{edge.confidence}%</td>
                          <td className="px-3 py-2">
                            <span className={"px-1.5 py-0.5 text-[7px] uppercase font-semibold " + (edge.isTrusted ? "text-[#9caf83]" : "text-[#bda068]")}>
                              {edge.isTrusted ? "DETERMINISTIC" : "AI_SUGGESTED"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}


      {/* MULTI-AGENT VERIFICATION COUNCIL */}
      {data.verificationCouncil ? (
        <section className="border border-[#2a2e29] bg-[#0d100d]">
          <div className="flex flex-col gap-4 border-b border-[#252a24] px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-[#98a47f]" />
              <div>
                <div className="text-[8px] font-medium uppercase tracking-[0.2em] text-[#626960]">
                  Multi-Agent Verification Council
                </div>
                <div className="mt-0.5 text-[13px] font-semibold text-[#dddcd4]">
                  Dual Adversarial Review (Investigator vs. Skeptic)
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className={"px-2.5 py-1 text-[8px] font-bold uppercase tracking-[0.14em] border " + (
                data.verificationCouncil.decision.outcome === "VERIFIED"
                  ? "border-[#4a5839] bg-[#12180e] text-[#a8b88d]"
                  : data.verificationCouncil.decision.outcome === "CONTROL_FAILURE"
                  ? "border-[#552e2a] bg-[#221312] text-[#e0897d]"
                  : "border-[#4e432a] bg-[#14120a] text-[#c9b275]"
              )}>
                COUNCIL VERDICT: {data.verificationCouncil.decision.outcome}
              </span>
            </div>
          </div>

          <div className="p-5 space-y-5">
            {/* Dual Agent Grid */}
            <div className="grid gap-4 md:grid-cols-2">
              {/* Investigator Card */}
              <div className="border border-[#252a24] bg-[#0a0d0a] p-4">
                <div className="flex items-center justify-between border-b border-[#1f241e] pb-3">
                  <div className="flex items-center gap-2">
                    <Brain className="h-3.5 w-3.5 text-[#98a47f]" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#dddcd4]">
                      Agent 1: Investigator
                    </span>
                  </div>
                  <span className="font-mono text-[9px] text-[#a8b88d]">
                    {data.verificationCouncil.decision.investigator.confidence}% confidence
                  </span>
                </div>

                <div className="mt-3 space-y-2.5 text-[11px]">
                  <div>
                    <div className="text-[7px] uppercase tracking-wider text-[#60675d]">Hypothesis</div>
                    <p className="mt-0.5 text-[#c8c7bf]">{data.verificationCouncil.decision.investigator.hypothesis}</p>
                  </div>

                  <div>
                    <div className="text-[7px] uppercase tracking-wider text-[#60675d]">Reasoning</div>
                    <p className="mt-0.5 text-[10px] text-[#8e958a]">{data.verificationCouncil.decision.investigator.reasoning}</p>
                  </div>

                  {data.verificationCouncil.decision.investigator.supportingFacts.length > 0 ? (
                    <div>
                      <div className="text-[7px] uppercase tracking-wider text-[#60675d]">Supporting Evidence Facts</div>
                      <ul className="mt-1 space-y-1">
                        {data.verificationCouncil.decision.investigator.supportingFacts.map((fact, idx) => (
                          <li key={idx} className="flex items-start gap-1.5 text-[9px] text-[#7a8176]">
                            <span className="mt-1 h-1 w-1 rounded-full bg-[#525a4d]" />
                            <span>{fact}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* AI CLAIMS & DETERMINISTIC VALIDATION PANEL */}
            {data.verificationCouncil.decision.claimValidation && data.verificationCouncil.decision.claimValidation.length > 0 ? (
              <div className="border border-[#252a24] bg-[#070a07] p-4">
                <div className="flex items-center justify-between border-b border-[#1f241e] pb-2.5">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-[#a8b88d]" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#dddcd4]">
                      AI Claims & Deterministic Validation ({data.verificationCouncil.decision.claimValidation.length})
                    </span>
                  </div>
                  {data.verificationCouncil.decision.claimReceipt ? (
                    <span className="font-mono text-[8px] text-[#697265]">
                      Receipt: {data.verificationCouncil.decision.claimReceipt.canonicalHash.slice(0, 16)}...
                    </span>
                  ) : null}
                </div>

                <div className="mt-3 space-y-3">
                  {data.verificationCouncil.decision.claimValidation.map((c, cIdx) => (
                    <div
                      key={cIdx}
                      className={"border p-3 " + (
                        c.status === "VERIFIED"
                          ? "border-[#2a3a22] bg-[#0c140a]"
                          : c.status === "DISPUTED"
                          ? "border-[#4a2220] bg-[#1a0a09]"
                          : "border-[#3d331d] bg-[#141006]"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] font-bold text-[#dddcd4]">
                            Claim {c.claimId}
                          </span>
                          <span className="text-[8px] uppercase tracking-wider text-[#798175]">
                            [{c.type}]
                          </span>
                        </div>
                        <span className={"px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider border " + (
                          c.status === "VERIFIED"
                            ? "border-[#4a5839] bg-[#12180e] text-[#a8b88d]"
                            : c.status === "DISPUTED"
                            ? "border-[#552e2a] bg-[#221312] text-[#e0897d]"
                            : "border-[#4e432a] bg-[#14120a] text-[#c9b275]"
                        )}>
                          {c.status}
                        </span>
                      </div>

                      <p className="mt-1.5 text-[11px] font-medium text-[#c8c7bf]">
                        &ldquo;{c.statement}&rdquo;
                      </p>

                      {c.evidenceIds.length > 0 ? (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className="text-[7px] uppercase tracking-wider text-[#60675d]">Evidence:</span>
                          {c.evidenceIds.map((eid, eIdx) => (
                            <span key={eIdx} className="border border-[#2a3028] bg-[#141813] px-1.5 py-0.5 font-mono text-[8px] text-[#98a47f]">
                              {eid}
                            </span>
                          ))}
                        </div>
                      ) : null}

                      {/* Deterministic Checks */}
                      <div className="mt-2.5 border-t border-[#1a2018] pt-2 space-y-1">
                        <div className="text-[7px] uppercase tracking-wider text-[#60675d]">Deterministic Validator Checks:</div>
                        <div className="grid gap-1 sm:grid-cols-2">
                          {c.checks.map((chk, chkIdx) => (
                            <div key={chkIdx} className="flex items-center gap-1.5 text-[9px]">
                              {chk.passed ? (
                                <Check className="h-3 w-3 text-[#a8b88d] shrink-0" />
                              ) : (
                                <XCircle className="h-3 w-3 text-[#e0897d] shrink-0" />
                              )}
                              <span className={chk.passed ? "text-[#8e958a]" : "font-bold text-[#e0897d]"}>
                                {chk.message}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {c.disputeReasons.length > 0 ? (
                        <div className="mt-2 border border-[#4a2220] bg-[#22100e] p-2 text-[9px] text-[#e0897d]">
                          <span className="font-bold">Dispute Reason: </span>
                          {c.disputeReasons.join(" | ")}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Skeptic Card */}
              <div className="border border-[#252a24] bg-[#0a0d0a] p-4">
                <div className="flex items-center justify-between border-b border-[#1f241e] pb-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-3.5 w-3.5 text-[#c9b275]" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#dddcd4]">
                      Agent 2: Skeptic / Verifier
                    </span>
                  </div>
                  <span className={"font-mono text-[9px] font-bold uppercase " + (
                    data.verificationCouncil.decision.skeptic.verdict === "VERIFIED"
                      ? "text-[#a8b88d]"
                      : "text-[#e0897d]"
                  )}>
                    {data.verificationCouncil.decision.skeptic.verdict}
                  </span>
                </div>

                <div className="mt-3 space-y-2.5 text-[11px]">
                  <div>
                    <div className="text-[7px] uppercase tracking-wider text-[#60675d]">Verification Rationale</div>
                    <p className="mt-0.5 text-[#c8c7bf]">{data.verificationCouncil.decision.skeptic.reason}</p>
                  </div>

                  {data.verificationCouncil.decision.skeptic.challenges.length > 0 ? (
                    <div>
                      <div className="text-[7px] uppercase tracking-wider text-[#916b65]">Adversarial Challenges ({data.verificationCouncil.decision.skeptic.challenges.length})</div>
                      <div className="mt-1.5 space-y-1.5">
                        {data.verificationCouncil.decision.skeptic.challenges.map((ch, idx) => (
                          <div key={idx} className="border border-[#38201d] bg-[#140c0b] p-2 text-[9px]">
                            <span className="font-bold text-[#e0897d]">{ch.code}: </span>
                            <span className="text-[#b59e9a]">{ch.detail}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="border border-[#384a32] bg-[#10160d] p-2.5 text-[9px] text-[#a8b88d]">
                      ✓ Passed all mathematical invariant, timing window, and evidence authenticity checks.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Audit Lineage & Disclaimer Banner */}
            <div className="flex flex-col gap-2 border-t border-[#1f241e] pt-3 text-[8px] font-mono text-[#5f665c] sm:flex-row sm:items-center sm:justify-between">
              <div className="truncate">
                Council Run: <span className="text-[#8e958a]">{data.verificationCouncil.decision.councilRunId}</span> | Policy: <span className="text-[#8e958a]">v{data.verificationCouncil.decision.auditTrail.policyVersion}</span>
              </div>
              <div className="text-[#968361] uppercase tracking-wider">
                {data.verificationCouncil.decision.authorityDisclaimer}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* AI explanation */}
      <section className="border border-[#2a2e29] bg-[#0d100d]">
        <div className="flex flex-col gap-4 border-b border-[#252a24] px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <MessageSquareText className="h-3.5 w-3.5 text-[#a4a17d]" />

            <div>
              <div className="text-[8px] font-medium uppercase tracking-[0.2em] text-[#626960]">
                Grounded investigation
              </div>

              <div className="mt-1 text-[13px] font-semibold text-[#dddcd4]">
                AI explanation & evidence
              </div>
            </div>
          </div>

          {!explanation ? (
            <button
              type="button"
              disabled={explaining}
              onClick={handleExplain}
              className="inline-flex h-9 items-center justify-center gap-2 border border-[#514b38] bg-[#15130d] px-3 text-[9px] font-semibold uppercase tracking-[0.13em] text-[#c2b37f] transition hover:bg-[#1b1810] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {explaining ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Bot className="h-3.5 w-3.5" />
              )}
              {explaining ? "Generating..." : "Generate explanation"}
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 border border-[#394936] bg-[#10150e] px-2.5 py-1.5 text-[8px] uppercase tracking-[0.13em] text-[#9caf83]">
              <CheckCircle2 className="h-3 w-3" />
              Grounded output
            </span>
          )}
        </div>

        <div className="p-5">
          {!explanation ? (
            <div className="border border-dashed border-[#30362e] bg-[#0a0d0a] px-5 py-10 text-center">
              <Bot className="mx-auto h-6 w-6 text-[#697064]" />

              <div className="mt-4 text-[11px] font-medium text-[#8e948b]">
                No explanation generated yet
              </div>

              <div className="mx-auto mt-1 max-w-md text-[9px] leading-5 text-[#565c54]">
                Generate an evidence-grounded explanation using the
                exception&apos;s verified source context.
              </div>
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="border border-[#292e28] bg-[#0a0d0a] p-5">
                <div className="text-[8px] font-medium uppercase tracking-[0.18em] text-[#646b61]">
                  Summary
                </div>

                <p className="mt-3 text-[12px] leading-6 text-[#c9c8c0]">
                  {explanation.summary}
                </p>

                <div className="mt-6 border-t border-[#20241f] pt-4">
                  <div className="text-[8px] font-medium uppercase tracking-[0.18em] text-[#646b61]">
                    Root cause
                  </div>

                  <p className="mt-3 text-[11px] leading-6 text-[#929890]">
                    {explanation.reason}
                  </p>
                </div>
              </div>

              <div className="border border-[#292e28] bg-[#0a0d0a] p-5">
                <div className="text-[8px] font-medium uppercase tracking-[0.18em] text-[#646b61]">
                  Evidence chain
                </div>

                {evidence.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    {evidence.map((item, index) => (
                      <div
                        key={`${item}-${index}`}
                        className="flex items-start gap-2.5 border-b border-[#1f241f] pb-2.5 last:border-0"
                      >
                        <span className="mt-0.5 font-mono text-[8px] text-[#525950]">
                          {String(index + 1).padStart(2, "0")}
                        </span>

                        <span className="font-mono text-[9px] leading-5 text-[#858b83]">
                          {item}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 text-[9px] text-[#666c63]">
                    No evidence references returned.
                  </div>
                )}

                <div className="mt-6 border-t border-[#20241f] pt-4">
                  <div className="text-[8px] font-medium uppercase tracking-[0.18em] text-[#646b61]">
                    Recommended action
                  </div>

                  <p className="mt-3 text-[11px] leading-6 text-[#aab994]">
                    {explanation.recommendedAction}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Agent trace */}
      {traces.length > 0 ? (
        <section className="border border-[#2a2e29] bg-[#0d100d]">
          <div className="flex items-center justify-between border-b border-[#252a24] px-5 py-4">
            <div className="flex items-center gap-2">
              <Bot className="h-3.5 w-3.5 text-[#929d7e]" />

              <div>
                <div className="text-[8px] font-medium uppercase tracking-[0.2em] text-[#626960]">
                  Decision trace
                </div>

                <div className="mt-1 text-[13px] font-semibold text-[#dddcd4]">
                  Agent reasoning record
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowTrace((value) => !value)}
              className="inline-flex items-center gap-1.5 border border-[#30352f] px-3 py-1.5 text-[8px] font-medium uppercase tracking-[0.14em] text-[#737a71]"
            >
              {showTrace ? (
                <>
                  <ChevronUp className="h-3 w-3" />
                  Collapse
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3" />
                  Show trace
                </>
              )}
            </button>
          </div>

          {showTrace ? (
            <div className="divide-y divide-[#20241f]">
              {traces.map((trace) => (
                <div
                  key={trace.id}
                  className="grid gap-4 px-5 py-4 md:grid-cols-[160px_1fr]"
                >
                  <div>
                    <div className="text-[8px] uppercase tracking-[0.14em] text-[#555c52]">
                      Pass {trace.passNumber} / Step {trace.stepNumber}
                    </div>

                    <div className="mt-1 text-[10px] font-medium text-[#a9b18f]">
                      {trace.agentName}
                    </div>

                    <div className="mt-1 text-[9px] text-[#666d64]">
                      {trace.stepLabel}
                    </div>
                  </div>

                  <div className="border-l border-[#2b302a] pl-4">
                    <p className="font-mono text-[9px] leading-5 text-[#868c83]">
                      {trace.stepDetail}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Audit */}
      <section className="border border-[#2a2e29] bg-[#0d100d]">
        <SectionHeader
          eyebrow="Provenance"
          title="Exception audit history"
          icon={Clock3}
          right={
            <span className="text-[8px] uppercase tracking-[0.14em] text-[#555c53]">
              {auditTimeline.length} events
            </span>
          }
        />

        <div className="p-5">
          {auditTimeline.length === 0 ? (
            <div className="border border-dashed border-[#30362e] px-5 py-8 text-center text-[10px] text-[#626960]">
              No audit records are associated with this exception.
            </div>
          ) : (
            <div className="space-y-0">
              {auditTimeline.map((log, index) => {
                const isAI = log.actor === "AI";
                const isSystem = log.actor === "SYSTEM";

                return (
                  <div
                    key={log.id}
                    className="relative grid grid-cols-[28px_1fr] gap-4 pb-6 last:pb-0"
                  >
                    {index < auditTimeline.length - 1 ? (
                      <span className="absolute left-[13px] top-7 h-[calc(100%-16px)] w-px bg-[#282d27]" />
                    ) : null}

                    <div
                      className={`relative z-10 flex h-7 w-7 items-center justify-center border ${
                        isAI
                          ? "border-[#4d4736] bg-[#15130d]"
                          : isSystem
                            ? "border-[#394633] bg-[#10150f]"
                            : "border-[#354039] bg-[#101412]"
                      }`}
                    >
                      {isAI ? (
                        <Bot className="h-3.5 w-3.5 text-[#ae9e70]" />
                      ) : isSystem ? (
                        <ShieldCheckIcon />
                      ) : (
                        <UserRound className="h-3.5 w-3.5 text-[#92aa83]" />
                      )}
                    </div>

                    <div className="border border-[#252a24] bg-[#0a0d0a] px-5 py-4">
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] font-semibold text-[#d8d6ce]">
                            {log.action}
                          </span>

                          <span className="border border-[#30352f] bg-[#10130f] px-1.5 py-0.5 text-[7px] uppercase tracking-[0.13em] text-[#7a8076]">
                            {log.actor}
                          </span>
                        </div>

                        <span className="text-[9px] text-[#676e65]">
                          {formatDate(log.timestamp)}
                        </span>
                      </div>

                      <p className="mt-2 text-[11px] leading-6 text-[#858b82]">
                        {log.reason}
                      </p>

                      {log.beforeState || log.afterState ? (
                        <div className="mt-3 grid gap-2 border-t border-[#20241f] pt-3 md:grid-cols-2">
                          {log.beforeState ? (
                            <div>
                              <div className="text-[7px] uppercase tracking-[0.15em] text-[#5b6158]">
                                Before
                              </div>

                              <div className="mt-1 truncate font-mono text-[8px] text-[#a06f68]">
                                {log.beforeState}
                              </div>
                            </div>
                          ) : null}

                          {log.afterState ? (
                            <div>
                              <div className="text-[7px] uppercase tracking-[0.15em] text-[#5b6158]">
                                After
                              </div>

                              <div className="mt-1 truncate font-mono text-[8px] text-[#8fa17b]">
                                {log.afterState}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Bottom provenance strip */}
      <div className="flex flex-col gap-3 border-t border-[#20241f] pt-4 text-[8px] uppercase tracking-[0.16em] text-[#4f554d] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Fingerprint className="h-3 w-3" />
          Evidence chain preserved
        </div>

        <div className="flex items-center gap-4">
          <span>Deterministic classification</span>
          <span>Human controlled</span>
          <span>Auditable</span>
        </div>
      </div>
    </div>
  );
}

function ShieldCheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-3.5 w-3.5 text-[#91a17c]"
      aria-hidden="true"
    >
      <path d="M12 3 5.5 6v5.2c0 4.2 2.7 7.9 6.5 9.4 3.8-1.5 6.5-5.2 6.5-9.4V6L12 3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}