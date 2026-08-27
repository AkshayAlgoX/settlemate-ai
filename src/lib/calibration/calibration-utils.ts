/*
 * SettleMate AI — Confidence Calibration Server Utilities
 *
 * Provides benchmark calibration curves, Expected Calibration Error (ECE),
 * Brier score calculations, and deterministic live calibration test harnesses.
 */

import { generateSyntheticBatch } from "@/lib/synthetic/generator";
import { buildIndexes } from "@/lib/reconciliation/indexer";
import { matchAllRecords } from "@/lib/reconciliation/matcher";
import { applyCardinalityMatching } from "@/lib/reconciliation/apply-cardinality";
import type { BatchData } from "@/lib/reconciliation/types";
import {
  type CalibrationTestPoint,
  type LiveCalibrationResult,
  aggregateCalibrationBuckets,
  computeExpectedCalibrationError,
  computeBrierScore,
} from "./calibration-types";

export * from "./calibration-types";

/**
 * Deterministic live calibration test runner:
 * Simulates a batch of records with ground truth, matches in memory, and evaluates confidence vs accuracy.
 */
export async function runLiveCalibrationTest(options?: {
  seed?: number;
  sampleSize?: number;
}): Promise<LiveCalibrationResult> {
  const seed = options?.seed ?? 20260825;
  const sampleSize = options?.sampleSize ?? 50;

  // Generate deterministic synthetic data with ground truths
  const rawData = generateSyntheticBatch(sampleSize, seed);

  // Normalize into standard BatchData structure with transient dbIds and typed fields
  const batchData: BatchData = {
    orders: rawData.orders.map((o, i) => ({
      dbId: `ord_${i}`,
      orderId: o.orderId,
      amount: o.amount,
      status: o.status,
      createdAt: o.createdAt,
    })),
    payments: rawData.payments.map((p, i) => ({
      dbId: `pay_${i}`,
      paymentId: p.paymentId,
      orderId: p.orderId,
      amount: p.amount,
      fee: p.fee,
      tax: p.tax,
      method: p.method,
      status: p.status,
      capturedAt: p.capturedAt,
      createdAt: p.createdAt,
    })),
    settlements: rawData.settlements.map((s, i) => ({
      dbId: `set_${i}`,
      settlementId: s.settlementId,
      paymentId: s.paymentId,
      amount: s.amount,
      fee: s.fee,
      tax: s.tax,
      utr: s.utr,
      status: s.status,
      settledAt: s.settledAt,
      createdAt: s.createdAt,
    })),
    bankTransactions: rawData.bankTransactions.map((b, i) => ({
      dbId: `bnk_${i}`,
      txnId: b.txnId,
      utr: b.utr,
      amount: b.amount,
      type: b.type,
      narration: b.narration,
      txnDate: b.txnDate,
      matched: false,
    })),
    refunds: rawData.refunds.map((r, i) => ({
      dbId: `ref_${i}`,
      refundId: r.refundId,
      paymentId: r.paymentId,
      amount: r.amount,
      status: r.status,
    })),
    chargebacks: rawData.chargebacks.map((c, i) => ({
      dbId: `cb_${i}`,
      chargebackId: c.chargebackId,
      paymentId: c.paymentId,
      amount: c.amount,
      status: c.status,
    })),
    groundTruths: rawData.groundTruths.map((g, i) => ({
      dbId: `gt_${i}`,
      paymentId: g.paymentId,
      expectedLabel: g.expectedLabel,
      scenario: g.scenario,
    })),
  };

  // In-memory reconciliation execution
  const indexes = buildIndexes(batchData);
  const matchResults = matchAllRecords(batchData, indexes);
  await applyCardinalityMatching(matchResults, batchData);

  // Map ground truths
  const gtMap = new Map<string, string>();
  for (const gt of batchData.groundTruths) {
    const effective = gt.expectedLabel === "ORPHAN_BANK_CREDIT" ? "AUTO_MATCHED" : gt.expectedLabel;
    gtMap.set(gt.paymentId, effective);
  }

  const points: CalibrationTestPoint[] = [];
  let correctCount = 0;

  // Evaluate each match result against ground truth
  matchResults.forEach((res, idx) => {
    if (res.paymentId.startsWith("orphan_")) return;

    const gt = gtMap.get(res.paymentId);
    if (!gt) return;

    const isCorrect = res.status === gt;
    if (isCorrect) correctCount++;

    const conf = res.confidenceScore;
    let bucketStr = "81-100";
    if (conf <= 20) bucketStr = "0-20";
    else if (conf <= 40) bucketStr = "21-40";
    else if (conf <= 60) bucketStr = "41-60";
    else if (conf <= 80) bucketStr = "61-80";

    // Jitter Y coordinate slightly for visual separation in scatter plot
    // Correct items cluster near 1.0 (0.94 - 1.06), incorrect cluster near 0.0 (-0.06 - 0.06)
    const pseudoRandomOffset = ((idx * 37 + (seed % 100)) % 100) / 1000 - 0.05;
    const baseVal = isCorrect ? 1.0 : 0.0;
    const jitteredY = Number((baseVal + pseudoRandomOffset).toFixed(3));

    points.push({
      id: `pt_${res.paymentId || idx + 1}`,
      paymentId: res.paymentId,
      orderId: res.orderId,
      predictedConfidence: conf,
      predictedStatus: res.status,
      groundTruth: gt,
      isCorrect,
      mismatchAmountPaise: res.mismatchAmount,
      bucket: bucketStr,
      jitteredY,
      details: res.matchDetails || `Evaluated against ground truth ${gt}`,
    });
  });

  const buckets = aggregateCalibrationBuckets(
    points.map((p) => ({
      predictedConfidence: p.predictedConfidence,
      isCorrect: p.isCorrect,
    }))
  );

  const total = points.length;
  const overallAccuracy = total > 0 ? Number(((correctCount / total) * 100).toFixed(1)) : 0;
  const expectedCalibrationError = computeExpectedCalibrationError(buckets, total);
  const brierScore = computeBrierScore(
    points.map((p) => ({
      predictedConfidence: p.predictedConfidence,
      isCorrect: p.isCorrect,
    }))
  );

  return {
    seed,
    totalRecords: total,
    correctRecords: correctCount,
    overallAccuracy,
    expectedCalibrationError,
    brierScore,
    buckets,
    points,
    testedAt: new Date().toISOString(),
  };
}
