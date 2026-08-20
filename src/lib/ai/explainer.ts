import { prisma } from "@/lib/db";
import { generateJSON } from "./client";
import { EXCEPTION_EXPLANATION_PROMPT } from "./prompts";
import { generateFallbackExplanation } from "./fallback";
import { formatCurrency } from "@/lib/format";

function paiseToRupeesStr(paise: number): string {
  return (paise / 100).toFixed(2);
}

export async function explainException(exceptionId: string): Promise<{
  explanation: {
    summary: string;
    reason: string;
    evidence: string[];
    recommended_action: string;
    risk_level: string;
    needs_manual_review: boolean;
  };
  model: string;
  tokensUsed: number;
  latencyMs: number;
}> {
  const exception = await prisma.exception.findUnique({
    where: { id: exceptionId },
    include: { aiExplanation: true },
  });

  if (!exception) throw new Error("Exception not found");

  // Return cached explanation if exists
  if (exception.aiExplanation) {
    return {
      explanation: {
        summary: exception.aiExplanation.summary,
        reason: exception.aiExplanation.reason,
        evidence: JSON.parse(exception.aiExplanation.evidence),
        recommended_action: exception.aiExplanation.recommendedAction,
        risk_level: exception.aiExplanation.riskLevel,
        needs_manual_review: exception.aiExplanation.needsManualReview,
      },
      model: exception.aiExplanation.model,
      tokensUsed: exception.aiExplanation.tokensUsed || 0,
      latencyMs: exception.aiExplanation.latencyMs || 0,
    };
  }

  // Get related records for context
  const [payment, settlement, bankTxn] = await Promise.all([
    exception.paymentId
      ? prisma.payment.findFirst({
          where: { batchId: exception.batchId, paymentId: exception.paymentId },
        })
      : null,
    exception.settlementId
      ? prisma.settlement.findFirst({
          where: { batchId: exception.batchId, settlementId: exception.settlementId },
        })
      : null,
    exception.bankTxnId
      ? prisma.bankTransaction.findFirst({
          where: { batchId: exception.batchId, txnId: exception.bankTxnId },
        })
      : null,
  ]);

  const reconResult = await prisma.reconciliationResult.findFirst({
    where: {
      batchId: exception.batchId,
      paymentId: exception.paymentId || "",
    },
  });

  const ctx = {
    exceptionType: exception.exceptionType,
    paymentId: exception.paymentId || "N/A",
    orderId: exception.orderId || "N/A",
    settlementId: exception.settlementId || "N/A",
    bankTxnId: exception.bankTxnId || "N/A",
    paymentAmount: paiseToRupeesStr(reconResult?.paymentAmount || 0),
    fee: paiseToRupeesStr(reconResult?.paymentFee || 0),
    tax: paiseToRupeesStr(reconResult?.paymentTax || 0),
    refundAmount: paiseToRupeesStr(reconResult?.refundAmount || 0),
    chargebackAmount: paiseToRupeesStr(reconResult?.chargebackAmount || 0),
    expectedNet: paiseToRupeesStr(reconResult?.expectedNetAmount || 0),
    actualSettled: paiseToRupeesStr(reconResult?.actualSettledAmount || 0),
    bankCredited: paiseToRupeesStr(reconResult?.bankCreditedAmount || 0),
    mismatch: paiseToRupeesStr(reconResult?.mismatchAmount || 0),
    confidence: exception.confidenceScore,
    matchMethod: reconResult?.matchMethod || "N/A",
    matchDetails: reconResult?.matchDetails || "N/A",
  };

  // Try AI first
  const prompt = EXCEPTION_EXPLANATION_PROMPT
    .replace(/{{exceptionType}}/g, ctx.exceptionType)
    .replace(/{{paymentId}}/g, ctx.paymentId)
    .replace(/{{orderId}}/g, ctx.orderId)
    .replace(/{{settlementId}}/g, ctx.settlementId)
    .replace(/{{bankTxnId}}/g, ctx.bankTxnId)
    .replace(/{{paymentAmount}}/g, ctx.paymentAmount)
    .replace(/{{fee}}/g, ctx.fee)
    .replace(/{{tax}}/g, ctx.tax)
    .replace(/{{refundAmount}}/g, ctx.refundAmount)
    .replace(/{{chargebackAmount}}/g, ctx.chargebackAmount)
    .replace(/{{expectedNet}}/g, ctx.expectedNet)
    .replace(/{{actualSettled}}/g, ctx.actualSettled)
    .replace(/{{bankCredited}}/g, ctx.bankCredited)
    .replace(/{{mismatch}}/g, ctx.mismatch)
    .replace(/{{confidence}}/g, String(ctx.confidence))
    .replace(/{{matchMethod}}/g, ctx.matchMethod)
    .replace(/{{matchDetails}}/g, ctx.matchDetails);

  const aiResult = await generateJSON(prompt);

  let explanation;
  let model: string;
  let tokensUsed = 0;
  let latencyMs = 0;

  if (aiResult && aiResult.data) {
    explanation = aiResult.data as typeof explanation;
    model = "gemini-3.6-flash";
    tokensUsed = aiResult.tokensUsed;
    latencyMs = aiResult.latencyMs;
  } else {
    // Fallback to template
    explanation = generateFallbackExplanation({
      ...ctx,
      paymentAmount: reconResult?.paymentAmount || 0,
      fee: reconResult?.paymentFee || 0,
      tax: reconResult?.paymentTax || 0,
      refundAmount: reconResult?.refundAmount || 0,
      chargebackAmount: reconResult?.chargebackAmount || 0,
      expectedNet: reconResult?.expectedNetAmount || 0,
      actualSettled: reconResult?.actualSettledAmount || 0,
      bankCredited: reconResult?.bankCreditedAmount || 0,
      mismatch: reconResult?.mismatchAmount || 0,
    });
    model = "fallback-template";
    latencyMs = 5;
  }

  // Store in database
  await prisma.aiExplanation.create({
    data: {
      exceptionId,
      summary: explanation.summary,
      reason: explanation.reason,
      evidence: JSON.stringify(explanation.evidence),
      recommendedAction: explanation.recommended_action,
      riskLevel: explanation.risk_level,
      needsManualReview: explanation.needs_manual_review,
      model,
      tokensUsed,
      latencyMs,
    },
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      batchId: exception.batchId,
      actor: "AI",
      action: "AI_EXPLANATION_GENERATED",
      entityType: "exception",
      entityId: exceptionId,
      reason: `Explanation generated using ${model} (${latencyMs}ms)`,
      metadata: JSON.stringify({ model, tokensUsed, latencyMs }),
    },
  });

  return { explanation, model, tokensUsed, latencyMs };
}