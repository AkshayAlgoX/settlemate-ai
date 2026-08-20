import { prisma } from "@/lib/db";
import { generateJSON } from "@/lib/ai/client";
import { ANOMALY_REVIEW_PROMPT } from "@/lib/ai/prompts";

interface AnomalyReviewResult {
  exceptionId: string;
  shouldReclassify: boolean;
  newStatus: string;
  newConfidence: number;
  reasoningSteps: Array<{
    step: number;
    label: string;
    detail: string;
    impact: string;
  }>;
  anomalyDetected: string | null;
  riskAssessment: string;
  model: string;
  latencyMs: number;
}

function paiseToRupees(paise: number): string {
  return (paise / 100).toFixed(2);
}

export async function runAnomalyAgent(
  batchId: string
): Promise<AnomalyReviewResult[]> {
  const results: AnomalyReviewResult[] = [];

  // Get low-confidence exceptions (confidence < 80)
  const lowConfidenceExceptions = await prisma.exception.findMany({
    where: {
      batchId,
      confidenceScore: { lt: 80 },
      status: "OPEN",
    },
    orderBy: { confidenceScore: "asc" },
    take: 30, // Limit AI calls for cost
  });

  for (const exception of lowConfidenceExceptions) {
    const reconResult = await prisma.reconciliationResult.findFirst({
      where: {
        batchId,
        paymentId: exception.paymentId || "",
      },
    });

    if (!reconResult) continue;

    const startTime = Date.now();

    const prompt = ANOMALY_REVIEW_PROMPT
      .replace(/{{paymentId}}/g, exception.paymentId || "N/A")
      .replace(/{{currentStatus}}/g, exception.exceptionType)
      .replace(/{{confidence}}/g, String(exception.confidenceScore))
      .replace(/{{matchMethod}}/g, reconResult.matchMethod || "N/A")
      .replace(/{{matchDetails}}/g, reconResult.matchDetails || "N/A")
      .replace(/{{paymentAmount}}/g, paiseToRupees(reconResult.paymentAmount))
      .replace(/{{expectedNet}}/g, paiseToRupees(reconResult.expectedNetAmount))
      .replace(/{{actualSettled}}/g, paiseToRupees(reconResult.actualSettledAmount || 0))
      .replace(/{{bankCredited}}/g, paiseToRupees(reconResult.bankCreditedAmount || 0))
      .replace(/{{mismatch}}/g, paiseToRupees(reconResult.mismatchAmount || 0))
      .replace(/{{settlementCount}}/g, reconResult.settlementId ? reconResult.settlementId.split(",").length.toString() : "0")
      .replace(/{{bankCandidates}}/g, reconResult.bankTxnId ? reconResult.bankTxnId.split(",").length.toString() : "0")
      .replace(/{{hasRefunds}}/g, String(reconResult.refundAmount > 0))
      .replace(/{{hasChargebacks}}/g, String(reconResult.chargebackAmount > 0))
      .replace(/{{daysSinceCapture}}/g, "3");

    const aiResult = await generateJSON(prompt);

    if (aiResult && aiResult.data) {
      const data = aiResult.data as {
        should_reclassify: boolean;
        new_status: string;
        new_confidence: number;
        reasoning_steps: Array<{ step: number; label: string; detail: string; impact: string }>;
        anomaly_detected: string | null;
        risk_assessment: string;
      };

      results.push({
        exceptionId: exception.id,
        shouldReclassify: data.should_reclassify,
        newStatus: data.new_status,
        newConfidence: Math.max(0, Math.min(100, data.new_confidence)),
        reasoningSteps: data.reasoning_steps || [],
        anomalyDetected: data.anomaly_detected,
        riskAssessment: data.risk_assessment,
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
              agentName: "ANOMALY_DETECTOR",
              passNumber: 2,
              stepNumber: step.step,
              stepLabel: step.label,
              stepDetail: step.detail,
              confidenceBefore: exception.confidenceScore,
              confidenceAfter: data.new_confidence,
            },
          });
        }
      }

      // Apply reclassification if AI recommends it
      if (data.should_reclassify && data.new_status !== exception.exceptionType) {
        await prisma.exception.update({
          where: { id: exception.id },
          data: {
            exceptionType: data.new_status,
            confidenceScore: data.new_confidence,
            riskLevel: data.risk_assessment,
          },
        });

        await prisma.reconciliationResult.updateMany({
          where: {
            batchId,
            paymentId: exception.paymentId || "",
          },
          data: {
            status: data.new_status,
            confidenceScore: data.new_confidence,
            passNumber: 2,
          },
        });

        await prisma.auditLog.create({
          data: {
            batchId,
            actor: "AI",
            action: "ANOMALY_RECLASSIFIED",
            entityType: "exception",
            entityId: exception.id,
            beforeState: JSON.stringify({ status: exception.exceptionType, confidence: exception.confidenceScore }),
            afterState: JSON.stringify({ status: data.new_status, confidence: data.new_confidence }),
            reason: `Anomaly Agent reclassified: ${data.anomaly_detected || "pattern detected"}`,
          },
        });
      }
    } else {
      // AI unavailable — keep original classification
      results.push({
        exceptionId: exception.id,
        shouldReclassify: false,
        newStatus: exception.exceptionType,
        newConfidence: exception.confidenceScore,
        reasoningSteps: [{ step: 1, label: "AI Unavailable", detail: "Using deterministic classification", impact: "0" }],
        anomalyDetected: null,
        riskAssessment: exception.riskLevel,
        model: "unavailable",
        latencyMs: Date.now() - startTime,
      });
    }
  }

  return results;
}