import type { MatchResult, ReconciliationMetrics, BatchData } from "./types";

export function evaluateResults(
  results: MatchResult[],
  data: BatchData,
  phaseTimings: Record<string, number>,
  processingTimeMs: number
): ReconciliationMetrics {
  const groundTruthMap = new Map<string, string>();
  for (const gt of data.groundTruths) {
    groundTruthMap.set(gt.paymentId, gt.expectedLabel);
  }

  // Build confusion matrix
  const allLabels = [
    "AUTO_MATCHED", "PENDING_SETTLEMENT", "MISSING_BANK_CREDIT",
    "AMOUNT_MISMATCH", "DUPLICATE_SETTLEMENT", "ORPHAN_BANK_CREDIT",
    "REFUND_MISMATCH", "CHARGEBACK_ADJUSTMENT", "DELAYED_BANK_CREDIT",
    "NEEDS_MANUAL_REVIEW",
  ];

  const confusionMatrix: Record<string, Record<string, number>> = {};
  for (const label of allLabels) {
    confusionMatrix[label] = {};
    for (const label2 of allLabels) {
      confusionMatrix[label][label2] = 0;
    }
  }

  let correctPredictions = 0;
  let totalEvaluated = 0;
  const perTypeTP: Record<string, number> = {};
  const perTypeFP: Record<string, number> = {};
  const perTypeFN: Record<string, number> = {};

  for (const label of allLabels) {
    perTypeTP[label] = 0;
    perTypeFP[label] = 0;
    perTypeFN[label] = 0;
  }

  // Evaluate payment-level results
  const paymentResults = results.filter((r) => !r.paymentId.startsWith("orphan_"));

  for (const result of paymentResults) {
    const groundTruth = groundTruthMap.get(result.paymentId);
    if (!groundTruth) continue;

    totalEvaluated++;
    const predicted = result.status;

    // Special handling for ORPHAN_BANK_CREDIT ground truth:
    // The payment itself is correctly AUTO_MATCHED, the orphan is a separate bank txn
    const effectiveTruth = groundTruth === "ORPHAN_BANK_CREDIT" ? "AUTO_MATCHED" : groundTruth;

    if (predicted === effectiveTruth) {
      correctPredictions++;
      perTypeTP[predicted] = (perTypeTP[predicted] || 0) + 1;
    } else {
      perTypeFP[predicted] = (perTypeFP[predicted] || 0) + 1;
      perTypeFN[effectiveTruth] = (perTypeFN[effectiveTruth] || 0) + 1;
    }

    if (confusionMatrix[effectiveTruth] && confusionMatrix[effectiveTruth][predicted] !== undefined) {
      confusionMatrix[effectiveTruth][predicted]++;
    }
  }

  // Check orphan detection separately
  const orphanResults = results.filter((r) => r.status === "ORPHAN_BANK_CREDIT");
  const orphanGroundTruths = data.groundTruths.filter((g) => g.expectedLabel === "ORPHAN_BANK_CREDIT");
  if (orphanGroundTruths.length > 0 && orphanResults.length > 0) {
    // Orphans detected — add to correct predictions
    correctPredictions += Math.min(orphanResults.length, orphanGroundTruths.length);
    totalEvaluated += orphanGroundTruths.length;
  }

  const accuracy = totalEvaluated > 0 ? correctPredictions / totalEvaluated : 0;

  // Per-type metrics
  const perTypeMetrics: Record<string, { precision: number; recall: number; f1: number; count: number }> = {};
  for (const label of allLabels) {
    const tp = perTypeTP[label] || 0;
    const fp = perTypeFP[label] || 0;
    const fn = perTypeFN[label] || 0;
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    const count = data.groundTruths.filter((g) => {
      const effective = g.expectedLabel === "ORPHAN_BANK_CREDIT" ? "AUTO_MATCHED" : g.expectedLabel;
      return effective === label;
    }).length;

    perTypeMetrics[label] = { precision, recall, f1, count };
  }

  // Aggregate precision and recall
  const totalTP = Object.values(perTypeTP).reduce((a, b) => a + b, 0);
  const totalFP = Object.values(perTypeFP).reduce((a, b) => a + b, 0);
  const totalFN = Object.values(perTypeFN).reduce((a, b) => a + b, 0);
  const precision = totalTP + totalFP > 0 ? totalTP / (totalTP + totalFP) : 0;
  const recall = totalTP + totalFN > 0 ? totalTP / (totalTP + totalFN) : 0;

  // Financial metrics
  const autoMatched = results.filter((r) => r.status === "AUTO_MATCHED").length;
  const exceptions = results.filter((r) => r.status !== "AUTO_MATCHED");
  const unresolved = results.filter((r) => r.status === "NEEDS_MANUAL_REVIEW").length;

  const grossOrderAmount = data.orders.reduce((sum, o) => sum + o.amount, 0);
  const capturedPayments = data.payments
    .filter((p) => p.status === "captured")
    .reduce((sum, p) => sum + p.amount, 0);
  const expectedSettlement = results.reduce((sum, r) => sum + r.expectedNetAmount, 0);
  const actualBankCredits = data.bankTransactions
    .filter((b) => b.type === "CREDIT")
    .reduce((sum, b) => sum + b.amount, 0);
  const totalRefunds = data.refunds.reduce((sum, r) => sum + r.amount, 0);
  const totalChargebacks = data.chargebacks.reduce((sum, c) => sum + c.amount, 0);
  const amountAtRisk = exceptions.reduce((sum, e) => sum + Math.abs(e.expectedNetAmount || e.bankCreditedAmount || 0), 0);

  const exceptionsByType: Record<string, number> = {};
  for (const r of results) {
    exceptionsByType[r.status] = (exceptionsByType[r.status] || 0) + 1;
  }

  return {
    totalRecords: results.length,
    autoMatched,
    exceptionsFound: exceptions.length,
    unresolvedCount: unresolved,
    accuracy: Math.round(accuracy * 10000) / 100,
    precision: Math.round(precision * 10000) / 100,
    recall: Math.round(recall * 10000) / 100,
    throughputRps: Math.round((results.length / (processingTimeMs / 1000)) * 100) / 100,
    processingTimeMs,
    confusionMatrix,
    perTypeMetrics,
    grossOrderAmount,
    capturedPayments,
    expectedSettlement,
    actualBankCredits,
    totalRefunds,
    totalChargebacks,
    amountAtRisk,
    exceptionsByType,
    phaseTimings,
  };
}