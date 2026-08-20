import { prisma } from "@/lib/db";
import { fetchBatchData } from "./normalizer";
import { buildIndexes } from "./indexer";
import { matchAllRecords } from "./matcher";
import { evaluateResults } from "./evaluator";
import type { ReconciliationMetrics } from "./types";

export async function runReconciliation(
  batchId: string
): Promise<ReconciliationMetrics> {
  const totalStart = performance.now();
  const phaseTimings: Record<string, number> = {};

  // Update batch status
  await prisma.batch.update({
    where: { id: batchId },
    data: { status: "PROCESSING" },
  });

  await prisma.auditLog.create({
    data: {
      batchId,
      actor: "SYSTEM",
      action: "RECONCILIATION_STARTED",
      entityType: "batch",
      entityId: batchId,
      reason: "Multi-source reconciliation initiated",
    },
  });

  // Phase 1: Fetch & Normalize
  const phase1Start = performance.now();
  const data = await fetchBatchData(batchId);
  phaseTimings["normalize"] = Math.round(performance.now() - phase1Start);

  // Phase 2: Build Indexes
  const phase2Start = performance.now();
  const indexes = buildIndexes(data);
  phaseTimings["index"] = Math.round(performance.now() - phase2Start);

  // Phase 3: Match & Classify
  const phase3Start = performance.now();
  const results = matchAllRecords(data, indexes);
  phaseTimings["match_classify"] = Math.round(performance.now() - phase3Start);

  // Phase 4: Evaluate
  const phase4Start = performance.now();
  const processingTimeMs = Math.round(performance.now() - totalStart);
  const metrics = evaluateResults(results, data, phaseTimings, processingTimeMs);
  phaseTimings["evaluate"] = Math.round(performance.now() - phase4Start);

  // Phase 5: Store results in database
  const phase5Start = performance.now();

  // Delete previous results for this batch (if re-running)
  await prisma.reconciliationResult.deleteMany({ where: { batchId } });
  await prisma.exception.deleteMany({ where: { batchId } });

  // Store reconciliation results
  const reconResults = results.map((r) => ({
    batchId,
    paymentId: r.paymentId,
    orderId: r.orderId,
    settlementId: r.settlementIds.join(",") || null,
    bankTxnId: r.bankTxnIds.join(",") || null,
    refundIds: r.refundIds.join(",") || null,
    chargebackIds: r.chargebackIds.join(",") || null,
    orderAmount: r.orderAmount,
    paymentAmount: r.paymentAmount,
    paymentFee: r.paymentFee,
    paymentTax: r.paymentTax,
    refundAmount: r.refundAmount,
    chargebackAmount: r.chargebackAmount,
    expectedNetAmount: r.expectedNetAmount,
    actualSettledAmount: r.actualSettledAmount,
    bankCreditedAmount: r.bankCreditedAmount,
    mismatchAmount: r.mismatchAmount,
    status: r.status,
    confidenceScore: r.confidenceScore,
    matchMethod: r.matchMethod,
    matchDetails: r.matchDetails,
    passNumber: 1,
  }));

  // Batch insert in chunks of 100
  for (let i = 0; i < reconResults.length; i += 100) {
    const chunk = reconResults.slice(i, i + 100);
    await prisma.reconciliationResult.createMany({ data: chunk });
  }

  // Create exception records for non-matched results
  const exceptionResults = results.filter((r) => r.status !== "AUTO_MATCHED");
  const exceptions = exceptionResults.map((r) => ({
    batchId,
    exceptionType: r.status,
    paymentId: r.paymentId.startsWith("orphan_") ? null : r.paymentId,
    orderId: r.orderId === "N/A" ? null : r.orderId,
    settlementId: r.settlementIds[0] || null,
    bankTxnId: r.bankTxnIds[0] || null,
    utr: null,
    amount: r.expectedNetAmount || r.bankCreditedAmount || r.paymentAmount,
    mismatchAmount: r.mismatchAmount,
    confidenceScore: r.confidenceScore,
    riskLevel:
      r.confidenceScore < 30
        ? "HIGH"
        : r.confidenceScore < 60
        ? "MEDIUM"
        : "LOW",
    status: "OPEN",
    suggestedAction: generateSuggestedAction(r.status),
  }));

  for (let i = 0; i < exceptions.length; i += 100) {
    const chunk = exceptions.slice(i, i + 100);
    await prisma.exception.createMany({ data: chunk });
  }

  phaseTimings["store"] = Math.round(performance.now() - phase5Start);

  // Update batch with metrics
  const finalTime = Math.round(performance.now() - totalStart);
  metrics.processingTimeMs = finalTime;
  metrics.throughputRps = Math.round((results.length / (finalTime / 1000)) * 100) / 100;

  await prisma.batch.update({
    where: { id: batchId },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      totalRecords: metrics.totalRecords,
      autoMatched: metrics.autoMatched,
      exceptionsFound: metrics.exceptionsFound,
      unresolvedCount: metrics.unresolvedCount,
      accuracy: metrics.accuracy,
      precision: metrics.precision,
      recall: metrics.recall,
      throughputRps: metrics.throughputRps,
      processingTimeMs: metrics.processingTimeMs,
      pass1Accuracy: metrics.accuracy,
      amountAtRisk: metrics.amountAtRisk,
    },
  });

  await prisma.auditLog.create({
    data: {
      batchId,
      actor: "SYSTEM",
      action: "RECONCILIATION_COMPLETED",
      entityType: "batch",
      entityId: batchId,
      reason: `Completed in ${finalTime}ms. Accuracy: ${metrics.accuracy}%. ${metrics.exceptionsFound} exceptions found.`,
      metadata: JSON.stringify({
        totalRecords: metrics.totalRecords,
        autoMatched: metrics.autoMatched,
        accuracy: metrics.accuracy,
        throughputRps: metrics.throughputRps,
        phaseTimings,
      }),
    },
  });

  return metrics;
}

function generateSuggestedAction(status: string): string {
  const actions: Record<string, string> = {
    PENDING_SETTLEMENT: "Wait for T+2 settlement window to complete. No action needed.",
    MISSING_BANK_CREDIT: "Contact Razorpay support with settlement ID. Check bank statement for UTR.",
    AMOUNT_MISMATCH: "Verify fee and tax deduction against Razorpay settlement report. Check for hidden charges.",
    DUPLICATE_SETTLEMENT: "Contact Razorpay support immediately. Potential overpayment. Provide both settlement IDs.",
    ORPHAN_BANK_CREDIT: "Identify source of credit. Check if it belongs to a different merchant account or batch.",
    REFUND_MISMATCH: "Verify refund was processed. Check if settlement was generated before refund was applied.",
    CHARGEBACK_ADJUSTMENT: "Review chargeback reason. Prepare evidence for dispute if applicable.",
    DELAYED_BANK_CREDIT: "Monitor bank account. If delay exceeds 72h, contact bank and Razorpay.",
    NEEDS_MANUAL_REVIEW: "Manually verify records. Multiple candidates exist — human judgment required.",
  };
  return actions[status] || "Review exception details and take appropriate action.";
}