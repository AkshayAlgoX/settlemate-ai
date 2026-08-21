import { prisma } from "@/lib/db";
import { generateJSON, isAIAvailable } from "@/lib/ai/client";
import { parseAnomalyDecisions } from "@/lib/ai/schemas";

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

// src/lib/reconciliation/anomaly-agent.ts — BATCH VERSION

export async function runAnomalyAgent(batchId: string): Promise<AnomalyReviewResult[]> {
  const results: AnomalyReviewResult[] = [];

  const lowConfidenceExceptions = await prisma.exception.findMany({
    where: {
      batchId,
      confidenceScore: { lt: 70 },
      status: "OPEN",
      exceptionType: { notIn: ["AUTO_MATCHED", "PENDING_SETTLEMENT"] },
    },
    orderBy: { confidenceScore: "asc" },
    take: 5,
  });

  if (lowConfidenceExceptions.length === 0 || !isAIAvailable()) {
    return results;
  }

  // ── BATCH ALL CASES INTO ONE PROMPT ──
  const casesData = [];
  for (const exception of lowConfidenceExceptions) {
    const reconResult = await prisma.reconciliationResult.findFirst({
      where: { batchId, paymentId: exception.paymentId || "" },
    });
    if (!reconResult) continue;

    casesData.push({
      case_id: exception.id,
      payment_id: exception.paymentId,
      current_status: exception.exceptionType,
      confidence: exception.confidenceScore,
      payment_amount: reconResult.paymentAmount / 100,
      expected_net: reconResult.expectedNetAmount / 100,
      actual_settled: (reconResult.actualSettledAmount || 0) / 100,
      bank_credited: (reconResult.bankCreditedAmount || 0) / 100,
      mismatch: (reconResult.mismatchAmount || 0) / 100,
      match_method: reconResult.matchMethod,
      match_details: reconResult.matchDetails,
    });
  }

  if (casesData.length === 0) return results;

  const batchPrompt = `You are the Anomaly Detection Agent. Review ALL these reconciliation cases and return a JSON array of decisions.

CASES:
${JSON.stringify(casesData, null, 2)}

Respond with a JSON array (one object per case):
[
  {
    "case_id": "...",
    "should_reclassify": true/false,
    "new_status": "STATUS or same",
    "new_confidence": 0-100,
    "reasoning": "one-line reason",
    "anomaly_detected": "description or null",
    "risk_assessment": "LOW|MEDIUM|HIGH"
  }
]

Rules:
- Only reclassify if you find a genuine pattern or error
- Be conservative — prefer keeping current status over wrong reclassification
- If data is insufficient, set should_reclassify to false`;

  // ONE API CALL for all 5 cases
  const aiResult = await generateJSON(batchPrompt);

  // Parse + validate every decision BEFORE any DB write. Invalid shapes, unknown
  // enums, out-of-range confidence, and invented case_ids are dropped → those
  // cases take the safe fallback path below (no DB mutation).
  const decisionByCaseId = parseAnomalyDecisions(
    aiResult && aiResult.data,
    new Set(lowConfidenceExceptions.map((e) => e.id))
  );

  for (const caseData of casesData) {
    const exception = lowConfidenceExceptions.find((e) => e.id === caseData.case_id);
    if (!exception) continue;

    const decision = decisionByCaseId.get(caseData.case_id);

    // Missing/malformed decision (or Gemini unavailable) → fall back safely.
    if (!decision) {
      results.push({
        exceptionId: exception.id,
        shouldReclassify: false,
        newStatus: exception.exceptionType,
        newConfidence: exception.confidenceScore,
        reasoningSteps: [{ step: 1, label: "Batch Review", detail: "No AI decision returned; keeping original classification.", impact: "0" }],
        anomalyDetected: null,
        riskAssessment: exception.riskLevel,
        model: "fallback",
        latencyMs: aiResult ? aiResult.latencyMs : 0,
      });
      continue;
    }

    const shouldReclassify = decision.should_reclassify;
    const newStatus = decision.new_status;
    const newConfidence = decision.new_confidence;
    const reasoning = decision.reasoning;
    const anomalyDetected = decision.anomaly_detected;
    const riskAssessment = decision.risk_assessment;

    results.push({
      exceptionId: exception.id,
      shouldReclassify,
      newStatus,
      newConfidence,
      reasoningSteps: [{ step: 1, label: "Batch Review", detail: reasoning, impact: String(newConfidence - exception.confidenceScore) }],
      anomalyDetected,
      riskAssessment,
      model: "gemini-3.6-flash",
      latencyMs: aiResult ? aiResult.latencyMs : 0,
    });

    // Keep a per-exception AgentTrace record.
    await prisma.agentTrace.create({
      data: {
        batchId,
        exceptionId: exception.id,
        agentName: "ANOMALY_DETECTOR",
        passNumber: 2,
        stepNumber: 1,
        stepLabel: "Batch Review",
        stepDetail: reasoning,
        confidenceBefore: exception.confidenceScore,
        confidenceAfter: newConfidence,
      },
    });

    if (shouldReclassify && newStatus !== exception.exceptionType) {
      await prisma.exception.update({
        where: { id: exception.id },
        data: {
          exceptionType: newStatus,
          confidenceScore: newConfidence,
          riskLevel: riskAssessment,
        },
      });

      await prisma.reconciliationResult.updateMany({
        where: { batchId, paymentId: exception.paymentId || "" },
        data: { status: newStatus, confidenceScore: newConfidence, passNumber: 2 },
      });

      await prisma.auditLog.create({
        data: {
          batchId,
          actor: "AI",
          action: "ANOMALY_RECLASSIFIED",
          entityType: "exception",
          entityId: exception.id,
          beforeState: JSON.stringify({ status: exception.exceptionType, confidence: exception.confidenceScore }),
          afterState: JSON.stringify({ status: newStatus, confidence: newConfidence }),
          reason: `Anomaly Agent reclassified: ${anomalyDetected || "pattern detected"}`,
        },
      });
    }
  }

  return results;
}