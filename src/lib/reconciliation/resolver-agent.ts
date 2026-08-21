import { prisma } from "@/lib/db";
import { generateJSON, isAIAvailable } from "@/lib/ai/client";

interface ResolverResult {
  exceptionId: string;
  canAutoFix: boolean;
  proposedFix: string;
  fixType: string;
  expectedAccuracyAfterFix: number;
  evidence: string[];
  razorpayTicketNeeded: boolean;
  ticketSubject: string;
  ticketBody: string;
  reasoningSteps: Array<{ step: number; label: string; detail: string }>;
  riskIfApplied: string;
  model: string;
  latencyMs: number;
}

interface ResolverDecision {
  case_id?: string;
  can_auto_fix?: unknown;
  proposed_fix?: unknown;
  fix_type?: unknown;
  expected_accuracy_after_fix?: unknown;
  evidence?: unknown;
  razorpay_ticket_needed?: unknown;
  ticket_subject?: unknown;
  ticket_body?: unknown;
  reasoning_steps?: unknown;
  risk_if_applied?: unknown;
}

// src/lib/reconciliation/resolver-agent.ts — BATCH VERSION

// A single batched request covering 5 cases has a large response; allow it
// more time than the default 15s per-call timeout so it does not fall back.
const RESOLVER_TIMEOUT_MS = 45_000;

export async function runResolverAgent(batchId: string): Promise<ResolverResult[]> {
  const results: ResolverResult[] = [];

  // Only resolve the 5 highest-amount unresolved exceptions (max 5 cases per batch).
  const remainingExceptions = await prisma.exception.findMany({
    where: {
      batchId,
      status: "OPEN",
      exceptionType: {
        notIn: ["AUTO_MATCHED", "PENDING_SETTLEMENT", "DELAYED_BANK_CREDIT"],
      },
    },
    orderBy: { amount: "desc" },
    take: 5, // HARD CAP: 5 cases max
  });

  if (remainingExceptions.length === 0 || !isAIAvailable()) {
    return results;
  }

  // ── BATCH ALL CASES INTO ONE PROMPT ──
  const casesData: Array<{ case_id: string } & Record<string, unknown>> = [];
  for (const exception of remainingExceptions) {
    const reconResult = await prisma.reconciliationResult.findFirst({
      where: { batchId, paymentId: exception.paymentId || "" },
    });
    if (!reconResult) continue;

    casesData.push({
      case_id: exception.id,
      exception_type: exception.exceptionType,
      payment_id: exception.paymentId,
      settlement_id: exception.settlementId,
      amount: exception.amount / 100,
      mismatch: (exception.mismatchAmount || 0) / 100,
      confidence: exception.confidenceScore,
      expected_net: reconResult.expectedNetAmount / 100,
      actual_settled: (reconResult.actualSettledAmount || 0) / 100,
      bank_credited: (reconResult.bankCreditedAmount || 0) / 100,
      fee: reconResult.paymentFee / 100,
      tax: reconResult.paymentTax / 100,
      refund_amount: reconResult.refundAmount / 100,
      chargeback_amount: reconResult.chargebackAmount / 100,
    });
  }

  if (casesData.length === 0) return results;

  const batchPrompt = `You are the Resolver Agent in SettleMate AI. Propose a concrete fix for EACH reconciliation case below and return a JSON array of decisions.

CASES:
${JSON.stringify(casesData, null, 2)}

Respond with a JSON array (one object per case), each matched by case_id:
[
  {
    "case_id": "...",
    "can_auto_fix": true/false,
    "proposed_fix": "Description of the fix",
    "fix_type": "FEE_CORRECTION|REFUND_ADJUSTMENT|SPLIT_SETTLEMENT|WAIT_FOR_CREDIT|CONTACT_SUPPORT|CANNOT_FIX",
    "expected_accuracy_after_fix": 0-100,
    "evidence": ["reason 1", "reason 2"],
    "razorpay_ticket_needed": true/false,
    "ticket_subject": "Subject line if ticket needed",
    "ticket_body": "Draft ticket body if needed",
    "reasoning_steps": [{"step": 1, "label": "Analyzed root cause", "detail": "..."}],
    "risk_if_applied": "LOW|MEDIUM|HIGH"
  }
]

Rules:
- Only use the provided data. Never invent IDs or amounts.
- If data is insufficient, use can_auto_fix: false and fix_type: "CANNOT_FIX".
- ticket_subject/ticket_body may be empty strings when no Razorpay ticket is needed.
- Be CONCISE to keep the response fast: proposed_fix <= 40 words; evidence <= 2 items; reasoning_steps <= 2 steps; ticket_subject <= 8 words; ticket_body <= 2 sentences.`;

  // ONE API CALL for all 5 cases (with a longer timeout for the larger batch response)
  const aiResult = await generateJSON(batchPrompt, undefined, RESOLVER_TIMEOUT_MS);

  // Defensively index decisions by case_id; ignore malformed or duplicate entries.
  const rawDecisions =
    aiResult && Array.isArray(aiResult.data) ? (aiResult.data as ResolverDecision[]) : [];
  const decisionByCaseId = new Map<string, ResolverDecision>();
  for (const decision of rawDecisions) {
    if (
      decision &&
      typeof decision === "object" &&
      typeof decision.case_id === "string" &&
      !decisionByCaseId.has(decision.case_id)
    ) {
      decisionByCaseId.set(decision.case_id, decision);
    }
  }

  for (const caseData of casesData) {
    const exception = remainingExceptions.find((e) => e.id === caseData.case_id);
    if (!exception) continue;

    const decision = decisionByCaseId.get(caseData.case_id);

    // Missing/malformed decision (or Gemini unavailable) → fall back safely.
    if (!decision) {
      results.push({
        exceptionId: caseData.case_id,
        canAutoFix: false,
        proposedFix: "AI unavailable. Manual review required.",
        fixType: "CANNOT_FIX",
        expectedAccuracyAfterFix: 0,
        evidence: [],
        razorpayTicketNeeded: false,
        ticketSubject: "",
        ticketBody: "",
        reasoningSteps: [],
        riskIfApplied: "N/A",
        model: "fallback",
        latencyMs: aiResult ? aiResult.latencyMs : 0,
      });
      continue;
    }

    const canAutoFix = Boolean(decision.can_auto_fix);
    const proposedFix =
      typeof decision.proposed_fix === "string"
        ? decision.proposed_fix
        : "AI unavailable. Manual review required.";
    const fixType = typeof decision.fix_type === "string" ? decision.fix_type : "CANNOT_FIX";
    const expectedAccuracyAfterFix = Math.max(
      0,
      Math.min(100, Number(decision.expected_accuracy_after_fix) || 0)
    );
    const evidence = Array.isArray(decision.evidence) ? (decision.evidence as string[]) : [];
    const razorpayTicketNeeded = Boolean(decision.razorpay_ticket_needed);
    const ticketSubject = typeof decision.ticket_subject === "string" ? decision.ticket_subject : "";
    const ticketBody = typeof decision.ticket_body === "string" ? decision.ticket_body : "";
    const reasoningSteps = Array.isArray(decision.reasoning_steps)
      ? (decision.reasoning_steps as Array<{ step: number; label: string; detail: string }>)
      : [];
    const riskIfApplied =
      typeof decision.risk_if_applied === "string" ? decision.risk_if_applied : "N/A";

    results.push({
      exceptionId: caseData.case_id,
      canAutoFix,
      proposedFix,
      fixType,
      expectedAccuracyAfterFix,
      evidence,
      razorpayTicketNeeded,
      ticketSubject,
      ticketBody,
      reasoningSteps,
      riskIfApplied,
      model: "gemini-3.6-flash",
      latencyMs: aiResult ? aiResult.latencyMs : 0,
    });

    // Keep a per-exception AgentTrace record.
    for (const step of reasoningSteps) {
      await prisma.agentTrace.create({
        data: {
          batchId,
          exceptionId: caseData.case_id,
          agentName: "RESOLVER",
          passNumber: 3,
          stepNumber: step.step,
          stepLabel: step.label,
          stepDetail: step.detail,
          output: proposedFix,
        },
      });
    }

    await prisma.exception.update({
      where: { id: caseData.case_id },
      data: {
        suggestedAction: `[${fixType}] ${proposedFix}${razorpayTicketNeeded ? " | Razorpay ticket recommended" : ""}`,
      },
    });

    await prisma.auditLog.create({
      data: {
        batchId,
        actor: "AI",
        action: "RESOLVER_PROPOSAL",
        entityType: "exception",
        entityId: caseData.case_id,
        reason: `Resolver: ${fixType} — ${proposedFix}`,
        metadata: JSON.stringify({ fixType, canAutoFix, ticketNeeded: razorpayTicketNeeded }),
      },
    });
  }

  return results;
}
