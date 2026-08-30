"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Cpu,
  Check,
  CheckCircle2,
  Database,
  FileText,
  GitBranch,
  Loader2,
  LockKeyhole,
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
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Badge } from "@/components/ui/badge";

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
      className={`rounded-md border p-4 space-y-2 ${
        found
          ? "border-border bg-background"
          : "border-[#3b1818] bg-[#140a0a]"
      }`}
    >
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 font-medium text-foreground">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span>{label}</span>
        </div>

        {found ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-[#10b981]" />
        ) : (
          <XCircle className="h-3.5 w-3.5 text-[#ef4444]" />
        )}
      </div>

      {found ? (
        <div className="space-y-1 text-xs font-mono">
          <div className="text-[11px] text-muted-foreground truncate">{id}</div>
          {amount ? (
            <div className="font-semibold text-foreground">{amount}</div>
          ) : null}
          {detail ? (
            <div className="text-[10px] text-muted-foreground/70 truncate">{detail}</div>
          ) : null}
          {date ? (
            <div className="text-[10px] text-muted-foreground/70">{date}</div>
          ) : null}
        </div>
      ) : (
        <div className="text-[11px] text-[#ef4444] italic">
          Record not found in source dataset.
        </div>
      )}
    </div>
  );
}

function parseEvidence(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    return raw
      ? raw.split("\n").map((value) => value.trim()).filter(Boolean)
      : [];
  }
}

export default function ExceptionDetailPage({ params }: PageProps) {
  const { batchId, exceptionId } = use(params);

  const [data, setData] = useState<ExceptionDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [transitioning, setTransitioning] = useState(false);
  const [explaining, setExplaining] = useState(false);

  const [actionReason, setReason] = useState("");
  const [resolutionText, setResolution] = useState("");

  const [showProvenance, setShowProvenance] = useState(true);

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
        <div className="text-center space-y-2">
          <Loader2 className="h-5 w-5 animate-spin text-foreground mx-auto" />
          <p className="text-xs text-muted-foreground">Loading investigation record...</p>
        </div>
      </div>
    );
  }

  if (!data?.exception) {
    return (
      <div className="flex min-h-[75vh] items-center justify-center">
        <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 text-center space-y-4">
          <AlertTriangle className="h-6 w-6 text-[#ef4444] mx-auto" />
          <h2 className="text-base font-semibold text-foreground">Investigation record not found</h2>
          <p className="text-xs text-muted-foreground">The exception may have been removed or is no longer available.</p>
          <Link
            href={`/exceptions?batchId=${batchId}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3.5 text-xs font-medium text-primary-foreground hover:bg-[#ffffff] transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Return to queue</span>
          </Link>
        </div>
      </div>
    );
  }

  const ex = data.exception;
  const sources = data.sources || {};
  const calc = data.calculation;
  const explanation = ex.aiExplanation;
  const auditTimeline = data.auditTimeline || [];

  const allowedNextStates = transitionMap[ex.status] || [];
  const workflowIndex = WORKFLOW_PATH.indexOf(
    ex.status as (typeof WORKFLOW_PATH)[number],
  );
  const offPath = workflowIndex === -1;

  const evidence = explanation ? parseEvidence(explanation.evidence) : [];
  const isAdmin = currentRole?.toUpperCase() === "ADMIN";

  const provenanceSteps = [
    {
      label: "Order",
      icon: FileText,
      found: Boolean(sources.order),
      id: sources.order?.orderId,
      amount: sources.order ? formatCurrency(sources.order.amount) : undefined,
      detail: sources.order?.status,
      date: sources.order?.createdAt ? formatDate(sources.order.createdAt) : null,
    },
    {
      label: "Payment",
      icon: Database,
      found: Boolean(sources.payment),
      id: sources.payment?.paymentId,
      amount: sources.payment ? formatCurrency(sources.payment.amount) : undefined,
      detail: sources.payment ? `${sources.payment.method} · fee ${formatCurrency(sources.payment.fee)}` : undefined,
      date: null,
    },
    {
      label: "Settlement",
      icon: GitBranch,
      found: Boolean(sources.settlement),
      id: sources.settlement?.settlementId,
      amount: sources.settlement ? formatCurrency(sources.settlement.amount) : undefined,
      detail: sources.settlement?.utr ? `UTR ${sources.settlement.utr}` : "No UTR",
      date: sources.settlement?.settledAt ? formatDate(sources.settlement.settledAt) : null,
    },
    {
      label: "Bank credit",
      icon: Database,
      found: Boolean(sources.bankTxn),
      id: sources.bankTxn?.txnId,
      amount: sources.bankTxn ? formatCurrency(sources.bankTxn.amount) : undefined,
      detail: sources.bankTxn?.type,
      date: sources.bankTxn?.txnDate ? formatDate(sources.bankTxn.txnDate) : null,
    },
  ];

  return (
    <div className="space-y-10 pb-12">
      {/* Header */}
      <PageHeader
        tag="Investigation Record"
        title={formatExceptionType(ex.exceptionType)}
        description={`Exception ${ex.id} · Payment ${ex.paymentId || "N/A"} · ${ex.confidenceScore}% confidence`}
        badge={
          <div className="flex items-center gap-2">
            <Badge variant={ex.riskLevel === "HIGH" ? "destructive" : ex.riskLevel === "MEDIUM" ? "warning" : "success"}>
              {ex.riskLevel} Risk
            </Badge>
            <Badge variant="outline">
              {ex.status.replace(/_/g, " ")}
            </Badge>
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
            <Link
              href={`/exceptions?batchId=${batchId}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-accent transition"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to queue</span>
            </Link>
          </div>
        }
      />

      {/* Error Alert */}
      {actionError ? (
        <div className="flex items-start justify-between gap-4 rounded-md border border-[#3b1818] bg-[#140a0a] p-4 text-xs text-[#ef4444]">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-semibold">Action rejected</div>
              <div className="mt-0.5 text-muted-foreground">{actionError}</div>
            </div>
          </div>
          <button type="button" onClick={() => setActionError(null)} className="text-muted-foreground hover:text-foreground">
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {/* Financial Discrepancy Card */}
      {calc ? (
        <section className="rounded-lg border border-border bg-card p-5 space-y-4">
          <SectionHeader
            title="Financial discrepancy calculation"
            description="Deterministic comparison of expected net vs observed settlement"
            className="border-b-0 pb-0"
          />

          <div className="grid gap-3 sm:grid-cols-3 text-xs">
            <div className="rounded-md border border-border bg-background p-4 space-y-1 font-mono">
              <div className="text-xs text-muted-foreground">Expected Net</div>
              <div className="text-xl font-semibold text-foreground">
                {formatCurrency(calc.expectedNetAmount)}
              </div>
              <div className="text-[11px] text-muted-foreground/70">Deterministic formula</div>
            </div>

            <div className="rounded-md border border-border bg-background p-4 space-y-1 font-mono">
              <div className="text-xs text-muted-foreground">Actual Settled</div>
              <div className="text-xl font-semibold text-foreground">
                {calc.actualSettledAmount !== null ? formatCurrency(calc.actualSettledAmount) : "—"}
              </div>
              <div className="text-[11px] text-muted-foreground/70">Observed settlement</div>
            </div>

            <div className="rounded-md border border-border bg-background p-4 space-y-1 font-mono">
              <div className="text-xs text-muted-foreground">Discrepancy</div>
              <div className="text-xl font-semibold text-[#ef4444]">
                {calc.mismatchAmount ? `Δ ${formatCurrency(calc.mismatchAmount)}` : "No variance"}
              </div>
              <div className="text-[11px] text-muted-foreground/70">Classification output</div>
            </div>
          </div>
        </section>
      ) : null}

      {/* Workflow Path */}
      <section className="rounded-lg border border-border bg-card p-5 space-y-4">
        <SectionHeader
          title="Investigation workflow progression"
          description="Governed state transition lifecycle"
          className="border-b-0 pb-0"
        />

        <div className="grid gap-3 sm:grid-cols-4 text-xs">
          {WORKFLOW_PATH.map((state, index) => {
            const isCurrent = !offPath && workflowIndex === index;
            const isReached = !offPath && workflowIndex > index;

            return (
              <div
                key={state}
                className={`p-3 rounded-md border text-center space-y-1 transition ${
                  isCurrent
                    ? "border-[#ededed] bg-secondary text-foreground"
                    : isReached
                    ? "border-border bg-background text-muted-foreground"
                    : "border-border bg-muted/30 text-[#444444]"
                }`}
              >
                <div className="font-semibold text-xs uppercase tracking-wider">
                  {state.replace(/_/g, " ")}
                </div>
                {isCurrent && (
                  <Badge variant="success">Current Stage</Badge>
                )}
                {isReached && (
                  <div className="flex justify-center pt-0.5">
                    <Check className="h-3.5 w-3.5 text-[#10b981]" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Provenance Source Chain */}
      <section className="rounded-lg border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <SectionHeader
            title="Golden record provenance chain"
            description="Four-corner reconciliation sources"
            className="border-b-0 pb-0"
          />

          <button
            type="button"
            onClick={() => setShowProvenance((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground font-medium"
          >
            {showProvenance ? "Collapse" : "Expand"}
          </button>
        </div>

        {showProvenance ? (
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
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
        ) : null}
      </section>

      {/* Authorized Actions */}
      <section className="rounded-lg border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <SectionHeader
            title="Authorized workflow actions"
            description="State updates governed by role permissions"
            className="border-b-0 pb-0"
          />
          {currentRole ? (
            <Badge variant="outline">{currentRole}</Badge>
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {allowedNextStates.length === 0 ? (
              <div className="text-xs text-muted-foreground/70 italic">
                No further workflow transitions available.
              </div>
            ) : (
              allowedNextStates.map((nextState) => {
                const isApproval = nextState === "RESOLVED" || nextState === "REJECTED";
                const blocked = isApproval && !isAdmin;

                return (
                  <button
                    key={nextState}
                    type="button"
                    disabled={transitioning || blocked}
                    onClick={() => handleTransition(nextState)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-40 transition"
                  >
                    {transitioning ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : isApproval ? (
                      <LockKeyhole className="h-3 w-3 text-muted-foreground" />
                    ) : (
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    )}
                    <span>{nextState.replace(/_/g, " ")}</span>
                  </button>
                );
              })
            )}
          </div>

          {allowedNextStates.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 text-xs pt-2 border-t border-border">
              <div>
                <label className="text-muted-foreground block mb-1">Transition Reason</label>
                <input
                  value={actionReason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Verified against bank statement / UTR..."
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:border-foreground/40 focus:outline-none"
                />
              </div>

              {allowedNextStates.includes("RESOLVED") ? (
                <div>
                  <label className="text-muted-foreground block mb-1">Resolution Notes</label>
                  <input
                    value={resolutionText}
                    onChange={(e) => setResolution(e.target.value)}
                    placeholder="Describe the verified resolution..."
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:border-foreground/40 focus:outline-none"
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      {/* Multi-Agent Verification Council */}
      {data.verificationCouncil ? (
        <section className="rounded-lg border border-border bg-card p-5 space-y-5">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <SectionHeader
              title="Verification council: Dual adversarial review"
              description="Investigator vs. Skeptic cross-examination"
              className="border-b-0 pb-0"
            />
            <Badge variant={data.verificationCouncil.decision.outcome === "VERIFIED" ? "success" : "destructive"}>
              {data.verificationCouncil.decision.outcome}
            </Badge>
          </div>

          <div className="grid gap-4 md:grid-cols-2 text-xs">
            {/* Investigator Card */}
            <div className="rounded-md border border-border bg-background p-4 space-y-3">
              <div className="flex items-center justify-between font-semibold text-foreground">
                <span>Agent 1: Investigator</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {data.verificationCouncil.decision.investigator.confidence}% confidence
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase text-muted-foreground/70">Hypothesis</span>
                <p className="mt-0.5 text-foreground">{data.verificationCouncil.decision.investigator.hypothesis}</p>
              </div>
              <div>
                <span className="text-[10px] uppercase text-muted-foreground/70">Reasoning</span>
                <p className="mt-0.5 text-muted-foreground">{data.verificationCouncil.decision.investigator.reasoning}</p>
              </div>
            </div>

            {/* Skeptic Card */}
            <div className="rounded-md border border-border bg-background p-4 space-y-3">
              <div className="flex items-center justify-between font-semibold text-foreground">
                <span>Agent 2: Skeptic / Verifier</span>
                <Badge variant={data.verificationCouncil.decision.skeptic.verdict === "VERIFIED" ? "success" : "destructive"}>
                  {data.verificationCouncil.decision.skeptic.verdict}
                </Badge>
              </div>
              <div>
                <span className="text-[10px] uppercase text-muted-foreground/70">Rationale</span>
                <p className="mt-0.5 text-foreground">{data.verificationCouncil.decision.skeptic.reason}</p>
              </div>
              {data.verificationCouncil.decision.skeptic.challenges.length > 0 ? (
                <div className="space-y-1">
                  <span className="text-[10px] uppercase text-[#ef4444]">Adversarial Challenges ({data.verificationCouncil.decision.skeptic.challenges.length})</span>
                  {data.verificationCouncil.decision.skeptic.challenges.map((ch, idx) => (
                    <div key={idx} className="rounded border border-[#3b1818] bg-[#140a0a] p-2 text-xs">
                      <span className="font-semibold text-[#ef4444]">{ch.code}: </span>
                      <span className="text-muted-foreground">{ch.detail}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {/* AI Explanation */}
      <section className="rounded-lg border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <SectionHeader
            title="Grounded investigation analysis"
            description="AI explanation grounded in cryptographic evidence"
            className="border-b-0 pb-0"
          />

          {!explanation ? (
            <button
              type="button"
              disabled={explaining}
              onClick={handleExplain}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 text-xs font-medium text-primary-foreground hover:bg-[#ffffff] disabled:opacity-50 transition"
            >
              {explaining ? <Loader2 className="h-3 w-3 animate-spin" /> : <Cpu className="h-3 w-3" />}
              <span>{explaining ? "Generating..." : "Generate analysis"}</span>
            </button>
          ) : (
            <Badge variant="success">Grounded output</Badge>
          )}
        </div>

        {explanation ? (
          <div className="grid gap-4 md:grid-cols-2 text-xs">
            <div className="rounded-md border border-border bg-background p-4 space-y-3">
              <div>
                <span className="text-[10px] uppercase text-muted-foreground/70">Summary</span>
                <p className="mt-1 text-foreground leading-relaxed">{explanation.summary}</p>
              </div>
              <div>
                <span className="text-[10px] uppercase text-muted-foreground/70">Root Cause</span>
                <p className="mt-1 text-muted-foreground leading-relaxed">{explanation.reason}</p>
              </div>
            </div>

            <div className="rounded-md border border-border bg-background p-4 space-y-3">
              <div>
                <span className="text-[10px] uppercase text-muted-foreground/70">Recommended Action</span>
                <p className="mt-1 text-foreground leading-relaxed font-medium">{explanation.recommendedAction}</p>
              </div>
              {evidence.length > 0 && (
                <div>
                  <span className="text-[10px] uppercase text-muted-foreground/70">Evidence References</span>
                  <div className="mt-1 space-y-1 font-mono text-[11px] text-muted-foreground">
                    {evidence.map((item, idx) => (
                      <div key={idx} className="truncate">• {item}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="py-6 text-center text-xs text-muted-foreground/70">
            No explanation generated yet. Click &apos;Generate analysis&apos; to investigate.
          </div>
        )}
      </section>

      {/* Audit Timeline */}
      <section className="rounded-lg border border-border bg-card p-5 space-y-4">
        <SectionHeader
          title="Exception audit timeline"
          description={`${auditTimeline.length} events logged for this record`}
          className="border-b-0 pb-0"
        />

        <div className="space-y-3">
          {auditTimeline.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground/70">
              No audit events recorded for this exception yet.
            </div>
          ) : (
            auditTimeline.map((log) => (
              <div key={log.id} className="rounded-md border border-border bg-background p-3.5 text-xs space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">{log.action}</span>
                    <Badge variant="outline">{log.actor}</Badge>
                  </div>
                  <span className="text-[11px] text-muted-foreground/70 font-mono">{formatDate(log.timestamp)}</span>
                </div>
                <p className="text-muted-foreground">{log.reason}</p>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}