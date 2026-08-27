/*
 * SettleMate AI — Multi-Agent Verification Council with Claim-Level Falsifiability (Day 2–3)
 *
 * Implements dual-agent adversarial review with deterministic, non-LLM claim verification:
 *   - Investigator emits structured, falsifiable claims (AIClaim)
 *   - Deterministic Claim Validator verifies claims against ground-truth arithmetic & evidence
 *   - Skeptic challenges only unverified or disputed claims
 *   - AI output is strictly advisory (CANNOT directly write to ledger)
 */

import { createHash } from "node:crypto";
import type { ContradictionFinding, EvidenceItem } from "../evidence/types";
import type { ReconciliationPolicy } from "../policy/types";
import { DEFAULT_POLICY } from "../policy/manager";
import type { AIClaim, ClaimAuditReceipt, ClaimValidationResult } from "./claim-types";
import { DeterministicClaimValidator } from "./claim-validator";
import { executeAiInvestigator, generateDeterministicClaims } from "./llm-investigator";

export type CouncilVerdict =
  | "VERIFIED"
  | "DISPUTED"
  | "INSUFFICIENT_EVIDENCE"
  | "CONFLICTING_EVIDENCE"
  | "CONTROL_FAILURE";

export interface CouncilRoutingDecision {
  shouldInvoke: boolean;
  routingReason: string;
  materialityScore: number;
}

export interface CouncilReviewRequest {
  exceptionId: string;
  batchId?: string;
  exceptionType: string;
  amountPaise: number;
  discrepancyPaise?: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  evidenceItems: EvidenceItem[];
  contradictions?: ContradictionFinding[];
  activePolicy?: ReconciliationPolicy;
  paymentRecord?: {
    paymentId: string;
    amount: number;
    fee: number;
    tax: number;
    currency?: string;
    method?: string;
    createdAt: Date;
  };
  settlementRecord?: {
    settlementId: string;
    amount: number;
    fee?: number;
    tax?: number;
    settledAt: Date;
    utr?: string | null;
  };
  bankRecord?: {
    txnId: string;
    amount: number;
    txnDate: Date;
    utr?: string | null;
  };
  refundRecord?: {
    refundId: string;
    amount: number;
    status: string;
    createdAt: Date;
  };
  chargebackRecord?: {
    chargebackId: string;
    amount: number;
    status: string;
    createdAt: Date;
  };
}

export interface InvestigatorOutput {
  hypothesis: string;
  reasoning: string;
  evidenceIds: string[];
  supportingFacts: string[];
  uncertainties: string[];
  recommendedAction: string;
  confidence: number;
  claimedNetPaise?: number;
  claims: AIClaim[];
}

export interface SkepticChallengeItem {
  code:
    | "AMOUNT_ARITHMETIC_ERROR"
    | "UNACCOUNTED_REFUND"
    | "UNACCOUNTED_CHARGEBACK"
    | "TIMING_WINDOW_VIOLATION"
    | "UNSUPPORTED_PAYMENT_METHOD"
    | "INVENTED_EVIDENCE_ID"
    | "TAMPERED_EVIDENCE"
    | "CONFLICTING_CLAIMS"
    | "INSUFFICIENT_CONTEXT"
    | "POLICY_VIOLATION"
    | "INVARIANT_BREACH";
  detail: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

export interface SkepticOutput {
  verdict: CouncilVerdict;
  challenges: SkepticChallengeItem[];
  verifiedEvidenceIds: string[];
  confidence: number;
  riskAdjustment: "NONE" | "INCREASED" | "CRITICAL";
  reason: string;
}

export interface CouncilExecutionAudit {
  councilRunId: string;
  exceptionId: string;
  policyVersion: string;
  engineVersion: string;
  investigatorInputHash: string;
  investigatorOutputHash: string;
  skepticInputHash: string;
  skepticOutputHash: string;
  decisionOutcome: CouncilVerdict;
  riskBefore: string;
  riskAfter: string;
  startedAt: Date;
  completedAt: Date;
}

export interface CouncilDecision {
  councilRunId: string;
  exceptionId: string;
  outcome: CouncilVerdict;
  investigator: InvestigatorOutput;
  skeptic: SkepticOutput;
  claimReceipt: ClaimAuditReceipt;
  claimValidation: ClaimValidationResult[];
  finalRiskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  citedEvidenceIds: string[];
  requiresHumanReview: boolean;
  deterministicOverrideApplied: boolean;
  auditTrail: CouncilExecutionAudit;
  authorityDisclaimer: "AI_AUTHORITY_READ_ONLY_SUGGESTION_CANNOT_WRITE_LEDGER";
  traceLog: string[];
}

/**
 * Deterministic Routing Gate for Verification Council.
 */
export function shouldInvokeCouncil(params: {
  decision: "AUTO_MATCHED" | "SUGGESTED_MATCH" | "EXCEPTION";
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  discrepancyPaise?: number;
  amountPaise: number;
  hasContradictions?: boolean;
  policy?: ReconciliationPolicy;
}): CouncilRoutingDecision {
  const policy = params.policy || DEFAULT_POLICY;
  const discrepancy = Math.abs(params.discrepancyPaise || 0);

  // 1. AUTO_MATCHED low risk records ALWAYS bypass
  if (params.decision === "AUTO_MATCHED" && params.riskLevel === "LOW" && !params.hasContradictions) {
    return {
      shouldInvoke: false,
      routingReason: "Straight-through AUTO_MATCHED record with low risk bypasses council",
      materialityScore: 0,
    };
  }

  // 2. Contradictory evidence triggers immediate council review
  if (params.hasContradictions) {
    return {
      shouldInvoke: true,
      routingReason: "Contradictory evidence claims detected across records",
      materialityScore: 90,
    };
  }

  // 3. Materiality threshold trigger
  if (discrepancy >= policy.rules.materialityThresholdPaise) {
    return {
      shouldInvoke: true,
      routingReason: "Discrepancy exceeds materiality threshold ₹" + (policy.rules.materialityThresholdPaise / 100),
      materialityScore: 95,
    };
  }

  // 4. Ambiguous suggested matches or high risk exceptions
  if (params.decision === "SUGGESTED_MATCH" || params.riskLevel === "HIGH" || params.riskLevel === "CRITICAL") {
    return {
      shouldInvoke: true,
      routingReason: "Ambiguous match pattern or elevated risk level (" + params.riskLevel + ")",
      materialityScore: 75,
    };
  }

  return {
    shouldInvoke: false,
    routingReason: "Standard low-materiality exception handles via deterministic workflow",
    materialityScore: 10,
  };
}

export class VerificationCouncil {
  private validator = new DeterministicClaimValidator();

  /**
   * Run multi-agent adversarial deliberation synchronously (using deterministic claim generator).
   */
  deliberate(request: CouncilReviewRequest): CouncilDecision {
    const startedAt = new Date();
    const trace: string[] = [];
    const policy = request.activePolicy || DEFAULT_POLICY;
    const councilRunId = "ccl_" + Math.random().toString(36).slice(2, 10);

    trace.push("[Council Started] Run " + councilRunId + " for exception " + request.exceptionId + " (" + request.exceptionType + ")");

    const evidenceItems = request.evidenceItems || [];
    const contradictions = request.contradictions || [];

    // Check Evidence Sufficiency & Contradictions
    if (evidenceItems.length === 0) {
      trace.push("[Investigator] INSUFFICIENT_EVIDENCE: No evidence items available in vault");
      const completedAt = new Date();
      return this.buildInsufficientEvidenceResponse(request, councilRunId, policy, startedAt, completedAt, trace);
    }

    if (contradictions.length > 0) {
      trace.push("[Investigator] CONFLICTING_EVIDENCE: Vault reported " + contradictions.length + " contradiction(s)");
      const completedAt = new Date();
      return this.buildConflictingEvidenceResponse(request, councilRunId, policy, contradictions, startedAt, completedAt, trace);
    }

    const investigator = generateDeterministicClaims(request);
    trace.push("[Investigator] Emitted " + investigator.claims.length + " structured claims (deterministic)");

    return this.evaluateDeliberation(request, investigator, councilRunId, policy, startedAt, trace);
  }

  /**
   * Run multi-agent adversarial deliberation asynchronously (invoking real LLM when API key is set).
   */
  async deliberateAsync(request: CouncilReviewRequest): Promise<CouncilDecision> {
    const startedAt = new Date();
    const trace: string[] = [];
    const policy = request.activePolicy || DEFAULT_POLICY;
    const councilRunId = "ccl_" + Math.random().toString(36).slice(2, 10);

    trace.push("[Council Async Started] Run " + councilRunId + " for exception " + request.exceptionId + " (" + request.exceptionType + ")");

    const evidenceItems = request.evidenceItems || [];
    const contradictions = request.contradictions || [];

    // Check Evidence Sufficiency & Contradictions
    if (evidenceItems.length === 0) {
      trace.push("[Investigator] INSUFFICIENT_EVIDENCE: No evidence items available in vault");
      const completedAt = new Date();
      return this.buildInsufficientEvidenceResponse(request, councilRunId, policy, startedAt, completedAt, trace);
    }

    if (contradictions.length > 0) {
      trace.push("[Investigator] CONFLICTING_EVIDENCE: Vault reported " + contradictions.length + " contradiction(s)");
      const completedAt = new Date();
      return this.buildConflictingEvidenceResponse(request, councilRunId, policy, contradictions, startedAt, completedAt, trace);
    }

    const execResult = await executeAiInvestigator(request);
    const investigator = execResult.investigator;
    trace.push(
      `[Investigator] Emitted ${investigator.claims.length} claims via ${execResult.model} (${execResult.latencyMs}ms)`
    );

    return this.evaluateDeliberation(request, investigator, councilRunId, policy, startedAt, trace);
  }

  private evaluateDeliberation(
    request: CouncilReviewRequest,
    investigator: InvestigatorOutput,
    councilRunId: string,
    policy: ReconciliationPolicy,
    startedAt: Date,
    trace: string[]
  ): CouncilDecision {
    const claims = investigator.claims || [];
    const citedIds = investigator.evidenceIds || [];

    // -------------------------------------------------------------------------
    // 2. Deterministic Non-LLM Claim Validator Gate
    // -------------------------------------------------------------------------
    const claimReceipt = this.validator.validateAllClaims(claims, request, councilRunId);
    trace.push(`[Validator] Evaluated ${claims.length} claims: ${claimReceipt.verifiedClaimsCount} verified, ${claimReceipt.disputedClaimsCount} disputed, ${claimReceipt.unsupportedClaimsCount} unsupported`);

    // -------------------------------------------------------------------------
    // 3. Adversarial Skeptic Deliberation
    // -------------------------------------------------------------------------
    const skepticChallenges: SkepticChallengeItem[] = [];
    const verifiedEvidenceIds: string[] = [];

    // If any claim is disputed, translate dispute reasons to Skeptic challenges
    for (const claimResult of claimReceipt.claims) {
      if (claimResult.status === "DISPUTED" || claimResult.status === "UNSUPPORTED") {
        for (const reason of claimResult.disputeReasons) {
          skepticChallenges.push({
            code: reason.includes("INVENTED")
              ? "INVENTED_EVIDENCE_ID"
              : reason.includes("ARITHMETIC") || reason.includes("AMOUNT")
              ? "AMOUNT_ARITHMETIC_ERROR"
              : reason.includes("TIMING")
              ? "TIMING_WINDOW_VIOLATION"
              : "INVARIANT_BREACH",
            detail: `Claim ${claimResult.claimId} failed validation: ${reason}`,
            severity: "CRITICAL",
          });
        }
      } else if (claimResult.status === "VERIFIED") {
        verifiedEvidenceIds.push(...claimResult.evidenceIds);
      }
    }

    // Direct Mathematical Invariant Check
    if (request.paymentRecord && request.settlementRecord) {
      const p = request.paymentRecord;
      const s = request.settlementRecord;
      const toPaise = (v?: number) => (v === undefined ? 0 : v < 500000 ? Math.round(v * 100) : v);
      const gross = toPaise(p.amount);
      const fee = toPaise(p.fee);
      const tax = toPaise(p.tax);
      const ref = request.refundRecord ? toPaise(request.refundRecord.amount) : 0;
      const cb = request.chargebackRecord ? toPaise(request.chargebackRecord.amount) : 0;
      const actual = toPaise(s.amount);

      const calcNet = gross - fee - tax - ref - cb;
      const diff = Math.abs(calcNet - actual);
      const tol = policy.rules?.amountTolerancePaise ?? 100;
      if (diff > tol && !skepticChallenges.some((c) => c.code === "AMOUNT_ARITHMETIC_ERROR")) {
        skepticChallenges.push({
          code: "AMOUNT_ARITHMETIC_ERROR",
          detail: `Calculated net (${calcNet} paise) diverges from settled (${actual} paise) by ${diff} paise (exceeds policy tolerance ${tol} paise)`,
          severity: "CRITICAL",
        });
      }
    }

    // Direct Timing Window Check
    if (request.paymentRecord && request.settlementRecord) {
      const diffMs = Math.abs(request.settlementRecord.settledAt.getTime() - request.paymentRecord.createdAt.getTime());
      const diffHours = diffMs / 3600_000;
      const maxHours = policy.rules?.toleranceWindowHours ?? ((policy.rules as unknown as Record<string, number>)?.maxSettlementDelayHours) ?? 72;
      if (diffHours > maxHours && !skepticChallenges.some((c) => c.code === "TIMING_WINDOW_VIOLATION")) {
        skepticChallenges.push({
          code: "TIMING_WINDOW_VIOLATION",
          detail: `Timing delay (${diffHours.toFixed(1)}h) exceeds policy maximum (${maxHours}h)`,
          severity: "HIGH",
        });
      }
    }

    let finalOutcome: CouncilVerdict = "VERIFIED";
    let finalRisk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "LOW";
    let skepticVerdict: CouncilVerdict = "VERIFIED";
    let skepticReason = "All investigator claims mechanically verified against evidence and mathematical invariants.";

    if (claimReceipt.abstain) {
      finalOutcome = "INSUFFICIENT_EVIDENCE";
      skepticVerdict = "INSUFFICIENT_EVIDENCE";
      finalRisk = "HIGH";
      skepticReason = "Investigator abstained: insufficient evidence to verify claims.";
    } else if (skepticChallenges.length > 0) {
      const hasArithmetic = skepticChallenges.some((c) => c.code === "AMOUNT_ARITHMETIC_ERROR" || c.code === "INVARIANT_BREACH");
      finalOutcome = hasArithmetic ? "CONTROL_FAILURE" : "DISPUTED";
      skepticVerdict = finalOutcome;
      finalRisk = "CRITICAL";
      skepticReason = `Skeptic challenged ${skepticChallenges.length} unverified claim assertions.`;
    }

    const skeptic: SkepticOutput = {
      verdict: skepticVerdict,
      challenges: skepticChallenges,
      verifiedEvidenceIds: Array.from(new Set(verifiedEvidenceIds)),
      confidence: skepticChallenges.length === 0 ? 94 : 45,
      riskAdjustment: skepticChallenges.length > 0 ? "CRITICAL" : "NONE",
      reason: skepticReason,
    };

    const completedAt = new Date();

    const auditTrail: CouncilExecutionAudit = {
      councilRunId,
      exceptionId: request.exceptionId,
      policyVersion: policy.version ? String(policy.version) : "1",
      engineVersion: "1.0.0",
      investigatorInputHash: createHash("sha256").update(JSON.stringify(request)).digest("hex"),
      investigatorOutputHash: createHash("sha256").update(JSON.stringify(investigator)).digest("hex"),
      skepticInputHash: claimReceipt.canonicalHash,
      skepticOutputHash: createHash("sha256").update(JSON.stringify(skeptic)).digest("hex"),
      decisionOutcome: finalOutcome,
      riskBefore: request.riskLevel,
      riskAfter: finalRisk,
      startedAt,
      completedAt,
    };

    return {
      councilRunId,
      exceptionId: request.exceptionId,
      outcome: finalOutcome,
      investigator,
      skeptic,
      claimReceipt,
      claimValidation: claimReceipt.claims,
      finalRiskLevel: finalRisk,
      citedEvidenceIds: citedIds,
      requiresHumanReview: true,
      deterministicOverrideApplied: false,
      auditTrail,
      authorityDisclaimer: "AI_AUTHORITY_READ_ONLY_SUGGESTION_CANNOT_WRITE_LEDGER",
      traceLog: trace,
    };
  }

  private buildInsufficientEvidenceResponse(
    request: CouncilReviewRequest,
    councilRunId: string,
    policy: ReconciliationPolicy,
    startedAt: Date,
    completedAt: Date,
    trace: string[]
  ): CouncilDecision {
    const investigator: InvestigatorOutput = {
      hypothesis: "Insufficient context to explain discrepancy.",
      reasoning: "No evidence artifacts found in Context Vault for payment " + request.exceptionId,
      evidenceIds: [],
      supportingFacts: [],
      uncertainties: ["Missing bank statement or payment gateway payload"],
      recommendedAction: "REQUEST_MERCHANT_EVIDENCE",
      confidence: 0,
      claims: [],
    };

    const skeptic: SkepticOutput = {
      verdict: "INSUFFICIENT_EVIDENCE",
      challenges: [{
        code: "INSUFFICIENT_CONTEXT",
        detail: "Zero evidence documents available to verify transaction validity",
        severity: "HIGH",
      }],
      verifiedEvidenceIds: [],
      confidence: 90,
      riskAdjustment: "INCREASED",
      reason: "Abstaining: Evidence vault contains no records for this transaction.",
    };

    const claimReceipt = this.validator.validateAllClaims([], request, councilRunId);

    const auditTrail: CouncilExecutionAudit = {
      councilRunId,
      exceptionId: request.exceptionId,
      policyVersion: policy.version ? String(policy.version) : "1",
      engineVersion: "1.0.0",
      investigatorInputHash: "0".repeat(64),
      investigatorOutputHash: "0".repeat(64),
      skepticInputHash: "0".repeat(64),
      skepticOutputHash: "0".repeat(64),
      decisionOutcome: "INSUFFICIENT_EVIDENCE",
      riskBefore: request.riskLevel,
      riskAfter: "HIGH",
      startedAt,
      completedAt,
    };

    return {
      councilRunId,
      exceptionId: request.exceptionId,
      outcome: "INSUFFICIENT_EVIDENCE",
      investigator,
      skeptic,
      claimReceipt,
      claimValidation: [],
      finalRiskLevel: "HIGH",
      citedEvidenceIds: [],
      requiresHumanReview: true,
      deterministicOverrideApplied: false,
      auditTrail,
      authorityDisclaimer: "AI_AUTHORITY_READ_ONLY_SUGGESTION_CANNOT_WRITE_LEDGER",
      traceLog: trace,
    };
  }

  private buildConflictingEvidenceResponse(
    request: CouncilReviewRequest,
    councilRunId: string,
    policy: ReconciliationPolicy,
    contradictions: ContradictionFinding[],
    startedAt: Date,
    completedAt: Date,
    trace: string[]
  ): CouncilDecision {
    const investigator: InvestigatorOutput = {
      hypothesis: "Conflicting evidence claims detected between payment gateway and bank statement.",
      reasoning: "Context Vault detected " + contradictions.length + " contradiction(s): " + contradictions.map((c) => c.description).join("; "),
      evidenceIds: contradictions.flatMap((c) => (c as unknown as Record<string, string[]>).conflictingEvidenceIds || [c.evidenceAId, c.evidenceBId].filter(Boolean) as string[]),
      supportingFacts: contradictions.map((c) => "Conflict: " + ((c as unknown as Record<string, string>).field || c.type) + " (" + c.description + ")"),
      uncertainties: ["Divergent amounts or statuses across authoritative documents"],
      recommendedAction: "ESCALATE_TO_MAKER_CHECKER_FRAUD_REVIEW",
      confidence: 30,
      claims: [],
    };

    const skeptic: SkepticOutput = {
      verdict: "CONFLICTING_EVIDENCE",
      challenges: contradictions.map((c) => ({
        code: "CONFLICTING_CLAIMS",
        detail: "Contradiction on field '" + ((c as unknown as Record<string, string>).field || c.type) + "': " + c.description,
        severity: "CRITICAL",
      })),
      verifiedEvidenceIds: [],
      confidence: 95,
      riskAdjustment: "CRITICAL",
      reason: "Abstaining: Evidence items make contradictory claims.",
    };

    const claimReceipt = this.validator.validateAllClaims([], request, councilRunId);

    const auditTrail: CouncilExecutionAudit = {
      councilRunId,
      exceptionId: request.exceptionId,
      policyVersion: policy.version ? String(policy.version) : "1",
      engineVersion: "1.0.0",
      investigatorInputHash: "0".repeat(64),
      investigatorOutputHash: "0".repeat(64),
      skepticInputHash: "0".repeat(64),
      skepticOutputHash: "0".repeat(64),
      decisionOutcome: "CONFLICTING_EVIDENCE",
      riskBefore: request.riskLevel,
      riskAfter: "CRITICAL",
      startedAt,
      completedAt,
    };

    return {
      councilRunId,
      exceptionId: request.exceptionId,
      outcome: "CONFLICTING_EVIDENCE",
      investigator,
      skeptic,
      claimReceipt,
      claimValidation: [],
      finalRiskLevel: "CRITICAL",
      citedEvidenceIds: investigator.evidenceIds,
      requiresHumanReview: true,
      deterministicOverrideApplied: false,
      auditTrail,
      authorityDisclaimer: "AI_AUTHORITY_READ_ONLY_SUGGESTION_CANNOT_WRITE_LEDGER",
      traceLog: trace,
    };
  }
}
