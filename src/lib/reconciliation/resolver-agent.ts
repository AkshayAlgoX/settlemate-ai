import { prisma } from "@/lib/db";
import { generateJSON } from "@/lib/ai/client";
import { RESOLVER_PROMPT } from "@/lib/ai/prompts";

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

function paiseToRupees(paise: number): string {
  return (paise / 100).toFixed(2);
}

export async function runResolverAgent(
  batchId: string
): Promise<ResolverResult[]> {
  const results: ResolverResult[] = [];

  // Get remaining exceptions after anomaly agent pass
  const remainingExceptions = await prisma.exception.findMany({
    where: {
      batchId,
      status: "OPEN",
      exceptionType: { notIn: ["AUTO_MATCHED", "PENDING_SETTLEMENT"] },
    },
    orderBy: { amount: "desc" },
    take: 20, // Focus on highest-amount exceptions
  });

  for (const exception of remainingExceptions) {
    const reconResult = await prisma.reconciliationResult.findFirst({
      where: {
        batchId,
        paymentId: exception.paymentId || "",
      },
    });

    if (!reconResult) continue;

    const startTime = Date.now();

    const prompt = RESOLVER_PROMPT
      .replace(/{{exceptionType}}/g, exception.exceptionType)
      .replace(/{{paymentId}}/g, exception.paymentId || "N/A")
      .replace(/{{settlementId}}/g, exception.settlementId || "N/A")
      .replace(/{{amount}}/g, paiseToRupees(exception.amount))
      .replace(/{{mismatch}}/g, paiseToRupees(exception.mismatchAmount || 0))
      .replace(/{{confidence}}/g, String(exception.confidenceScore))
      .replace(/{{expectedNet}}/g, paiseToRupees(reconResult.expectedNetAmount))
      .replace(/{{actualSettled}}/g, paiseToRupees(reconResult.actualSettledAmount || 0))
      .replace(/{{bankCredited}}/g, paiseToRupees(reconResult.bankCreditedAmount || 0))
      .replace(/{{fee}}/g, paiseToRupees(reconResult.paymentFee))
      .replace(/{{tax}}/g, paiseToRupees(reconResult.paymentTax))
      .replace(/{{refundAmount}}/g, paiseToRupees(reconResult.refundAmount))
      .replace(/{{chargebackAmount}}/g, paiseToRupees(reconResult.chargebackAmount));

    const aiResult = await generateJSON(prompt);

    if (aiResult && aiResult.data) {
      const data = aiResult.data as {
        can_auto_fix: boolean;
        proposed_fix: string;
        fix_type: string;
        expected_accuracy_after_fix: number;
        evidence: string[];
        razorpay_ticket_needed: boolean;
        ticket_subject: string;
        ticket_body: string;
        reasoning_steps: Array<{ step: number; label: string; detail: string }>;
        risk_if_applied: string;
      };

      results.push({
        exceptionId: exception.id,
        canAutoFix: data.can_auto_fix,
        proposedFix: data.proposed_fix,
        fixType: data.fix_type,
        expectedAccuracyAfterFix: data.expected_accuracy_after_fix,
        evidence: data.evidence || [],
        razorpayTicketNeeded: data.razorpay_ticket_needed,
        ticketSubject: data.ticket_subject || "",
        ticketBody: data.ticket_body || "",
        reasoningSteps: data.reasoning_steps || [],
        riskIfApplied: data.risk_if_applied,
        model: "gemini-1.5-flash",
        latencyMs: aiResult.latencyMs,
      });

      // Store agent trace
      if (data.reasoning_steps) {
        for (const step of data.reasoning_steps) {
          await prisma.agentTrace.create({
            data: {
              batchId,
              exceptionId: exception.id,
              agentName: "RESOLVER",
              passNumber: 3,
              stepNumber: step.step,
              stepLabel: step.label,
              stepDetail: step.detail,
              output: data.proposed_fix,
            },
          });
        }
      }

      // Store resolution proposal
      await prisma.exception.update({
        where: { id: exception.id },
        data: {
          suggestedAction: `[${data.fix_type}] ${data.proposed_fix}${data.razorpay_ticket_needed ? " | Razorpay ticket recommended" : ""}`,
        },
      });

      await prisma.auditLog.create({
        data: {
          batchId,
          actor: "AI",
          action: "RESOLVER_PROPOSAL",
          entityType: "exception",
          entityId: exception.id,
          reason: `Resolver proposed: ${data.fix_type} — ${data.proposed_fix}`,
          metadata: JSON.stringify({
            fixType: data.fix_type,
            canAutoFix: data.can_auto_fix,
            ticketNeeded: data.razorpay_ticket_needed,
          }),
        },
      });
    } else {
      results.push({
        exceptionId: exception.id,
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
        model: "unavailable",
        latencyMs: Date.now() - startTime,
      });
    }
  }

  return results;
}