import { prisma } from "@/lib/db";
import { fetchBatchData } from "./normalizer";
import { buildIndexes } from "./indexer";
import { matchAllRecords } from "./matcher";
import { evaluateResults } from "./evaluator";
import type { ReconciliationMetrics } from "./types";
import { applyCardinalityMatching } from "./apply-cardinality";
import {
  deleteCardinalityLinks,
  persistCardinalityLinks,
} from "./cardinality-persistence";
import {
  evaluateInvariants,
  ControlFailureError,
} from "./invariants";
import { evaluateBatchDecisions } from "./decision";
import { evaluateGate } from "./risk-gate";

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

const cardinalityApplication = applyCardinalityMatching(results, data);
  phaseTimings["match_classify"] = Math.round(performance.now() - phase3Start);

  // Decision Engine: centralize per-record outcomes (AUTO_MATCHED / SUGGESTED_MATCH /
  // EXCEPTION), confidence, reasonCode, matchStrategy, evidence, and risk. Drives the
  // Exception risk level below and the batch Risk Gate after the invariants gate.
  const decisionReport = evaluateBatchDecisions(
    results,
    data,
    cardinalityApplication.relationships,
  );
  const decisionByPaymentId = new Map(
    decisionReport.decisions.map((d) => [d.paymentId, d]),
  );

  // Phase 4: Evaluate
  const phase4Start = performance.now();
  const processingTimeMs = Math.round(performance.now() - totalStart);
  const metrics = evaluateResults(results, data, phaseTimings, processingTimeMs);
  phaseTimings["evaluate"] = Math.round(performance.now() - phase4Start);

  // Phase 5: Store results in database
  const phase5Start = performance.now();

  // Delete previous results for this batch (if re-running)
  await prisma.reconciliationResult.deleteMany({
  where: { batchId },
});

await prisma.exception.deleteMany({
  where: { batchId },
});

await deleteCardinalityLinks(batchId);

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
    cardinalityType: r.cardinalityType,
    cardinalityReason: r.cardinalityReason,
    relationshipScore: r.relationshipScore,
    passNumber: 1,
  }));

  // Batch insert in chunks of 100
  for (let i = 0; i < reconResults.length; i += 100) {
    const chunk = reconResults.slice(i, i + 100);
    await prisma.reconciliationResult.createMany({ data: chunk });
  }
  await persistCardinalityLinks(
  batchId,
  cardinalityApplication.relationships,
);

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
      decisionByPaymentId.get(r.paymentId)?.riskLevel ??
      (r.confidenceScore < 30
        ? "HIGH"
        : r.confidenceScore < 60
        ? "MEDIUM"
        : "LOW"),
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

  // ── FINANCIAL INVARIANTS GATE (fail-closed, before finalization) ──
  // Decision Engine → Invariants → PASS → Risk Gate / finalize.
  // On FAIL → CONTROL_FAILURE → Maker/Checker → Corrective Action → RE-CALCULATE →
  // Invariants again. A failed (re-)verification never reaches COMPLETED.
  const invariantReport = evaluateInvariants(
    data,
    results,
    metrics,
    cardinalityApplication.relationships,
  );
  if (invariantReport.failures.length > 0) {
    await prisma.batch.update({
      where: { id: batchId },
      data: { status: "CONTROL_FAILURE" },
    });
    await prisma.auditLog.create({
      data: {
        batchId,
        actor: "SYSTEM",
        action: "CONTROL_FAILURE",
        entityType: "batch",
        entityId: batchId,
        reason: `Financial invariant(s) failed: ${invariantReport.failures
          .map((f) => f.code)
          .join(", ")}`,
        metadata: JSON.stringify({
          checkedCounts: invariantReport.checkedCounts,
          checkedAmounts: invariantReport.checkedAmounts,
          failures: invariantReport.failures,
        }),
      },
    });
    throw new ControlFailureError(invariantReport);
  }

  // ── RISK GATE (batch routing) ──
  // LOW   → straight-through finalization (COMPLETED below).
  // MEDIUM→ controlled review / sampling (UNDER_REVIEW).
  // HIGH  → mandatory Maker/Checker approval (AWAITING_APPROVAL).
  // CRITICAL (invariant failure) always blocks finalization and is never downgraded by
  // confidence — it was already thrown above by the invariants gate, so we only reach
  // this point on a PASS (STRAIGHT_THROUGH / CONTROLLED_REVIEW / MAKER_CHECKER_REQUIRED).
  const correctionAttempts = await prisma.auditLog.count({
    where: { batchId, action: "CONTROL_FAILURE" },
  });
  const verdict = evaluateGate(decisionReport, invariantReport, correctionAttempts);

  async function riskGateAudit(
    routing: string,
    riskLevel: string,
    reason: string,
  ): Promise<void> {
    await prisma.auditLog.create({
      data: {
        batchId,
        actor: "SYSTEM",
        action: "RISK_GATE",
        entityType: "batch",
        entityId: batchId,
        reason,
        metadata: JSON.stringify({
          routing,
          riskLevel,
          correctionAttempts,
          aggregate: decisionReport.aggregate,
        }),
      },
    });
  }

  if (verdict.routing === "MAKER_CHECKER_REQUIRED") {
    await prisma.batch.update({
      where: { id: batchId },
      data: { status: "AWAITING_APPROVAL" },
    });
    await riskGateAudit(verdict.routing, verdict.riskLevel, verdict.reason);
    return metrics; // held for mandatory Maker/Checker — NOT finalized to COMPLETED
  }

  if (verdict.routing === "CONTROLLED_REVIEW") {
    await prisma.batch.update({
      where: { id: batchId },
      data: { status: "UNDER_REVIEW" },
    });
    await riskGateAudit(verdict.routing, verdict.riskLevel, verdict.reason);
    return metrics; // controlled review/sample — NOT finalized to COMPLETED
  }

  // STRAIGHT_THROUGH — record the routing for observability, then finalize below.
  await riskGateAudit(verdict.routing, verdict.riskLevel, verdict.reason);

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