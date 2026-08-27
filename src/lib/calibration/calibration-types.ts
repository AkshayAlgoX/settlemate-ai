/*
 * SettleMate AI — Confidence Calibration Types & Metrics
 * Pure frontend/backend shared types and benchmark data without Node/DB dependencies.
 */

export interface CalibrationBucketData {
  range: string;
  minConf: number;
  maxConf: number;
  total: number;
  correct: number;
  accuracy: number;
  expectedConfidence: number;
  calibrationGap: number;
  operationalRouting: string;
}

export interface CalibrationTestPoint {
  id: string;
  paymentId: string;
  orderId: string;
  predictedConfidence: number;
  predictedStatus: string;
  groundTruth: string;
  isCorrect: boolean;
  mismatchAmountPaise: number | null;
  bucket: string;
  jitteredY: number;
  details: string;
}

export interface LiveCalibrationResult {
  seed: number;
  totalRecords: number;
  correctRecords: number;
  overallAccuracy: number;
  expectedCalibrationError: number;
  brierScore: number;
  buckets: CalibrationBucketData[];
  points: CalibrationTestPoint[];
  testedAt: string;
}

/**
 * Official benchmark calibration results from evaluation suite (Seed: 20260821, Size: 250)
 */
export const BENCHMARK_CALIBRATION_DATA: CalibrationBucketData[] = [
  {
    range: "0-20",
    minConf: 0,
    maxConf: 20,
    total: 57,
    correct: 56,
    accuracy: 98.2, // 56/57 = 98.2%
    expectedConfidence: 10,
    calibrationGap: 88.2,
    operationalRouting: "Abstain / Verification Council & Hostile Falsification",
  },
  {
    range: "21-40",
    minConf: 21,
    maxConf: 40,
    total: 13,
    correct: 13,
    accuracy: 100.0, // 13/13 = 100%
    expectedConfidence: 30.5,
    calibrationGap: 69.5,
    operationalRouting: "Manual Exception Review / Maker-Checker Quarantine",
  },
  {
    range: "41-60",
    minConf: 41,
    maxConf: 60,
    total: 35,
    correct: 31,
    accuracy: 88.6, // 31/35 = 88.6%
    expectedConfidence: 50.5,
    calibrationGap: 38.1,
    operationalRouting: "Discrepancy Investigation / Policy Rule Gating",
  },
  {
    range: "61-80",
    minConf: 61,
    maxConf: 80,
    total: 20,
    correct: 20,
    accuracy: 100.0, // 20/20 = 100%
    expectedConfidence: 70.5,
    calibrationGap: 29.5,
    operationalRouting: "Suggested Match / Single Reviewer Sign-off",
  },
  {
    range: "81-100",
    minConf: 81,
    maxConf: 100,
    total: 125,
    correct: 125,
    accuracy: 100.0, // 125/125 = 100%
    expectedConfidence: 90.5,
    calibrationGap: 9.5,
    operationalRouting: "Straight-Through Processing / Immediate Ledger Posting",
  },
];

/**
 * Computes the Expected Calibration Error (ECE) across buckets
 */
export function computeExpectedCalibrationError(
  buckets: CalibrationBucketData[],
  totalRecords?: number
): number {
  const n = totalRecords || buckets.reduce((sum, b) => sum + b.total, 0);
  if (n === 0) return 0;

  let weightedError = 0;
  for (const b of buckets) {
    if (b.total === 0) continue;
    const weight = b.total / n;
    const gap = Math.abs(b.accuracy - b.expectedConfidence);
    weightedError += weight * gap;
  }

  return Number(weightedError.toFixed(2));
}

/**
 * Computes Brier Score
 */
export function computeBrierScore(
  items: Array<{ predictedConfidence: number; isCorrect: boolean }>
): number {
  if (items.length === 0) return 0;

  let sumSquaredDiff = 0;
  for (const item of items) {
    const prob = item.predictedConfidence / 100;
    const actual = item.isCorrect ? 1 : 0;
    sumSquaredDiff += Math.pow(prob - actual, 2);
  }

  return Number((sumSquaredDiff / items.length).toFixed(4));
}

/**
 * Aggregate predictions into buckets
 */
export function aggregateCalibrationBuckets(
  items: Array<{ predictedConfidence: number; isCorrect: boolean }>
): CalibrationBucketData[] {
  const buckets: CalibrationBucketData[] = [
    {
      range: "0-20",
      minConf: 0,
      maxConf: 20,
      total: 0,
      correct: 0,
      accuracy: 0,
      expectedConfidence: 10,
      calibrationGap: 0,
      operationalRouting: "Abstain / Verification Council Review",
    },
    {
      range: "21-40",
      minConf: 21,
      maxConf: 40,
      total: 0,
      correct: 0,
      accuracy: 0,
      expectedConfidence: 30.5,
      calibrationGap: 0,
      operationalRouting: "Manual Exception Review / Quarantine",
    },
    {
      range: "41-60",
      minConf: 41,
      maxConf: 60,
      total: 0,
      correct: 0,
      accuracy: 0,
      expectedConfidence: 50.5,
      calibrationGap: 0,
      operationalRouting: "Discrepancy Investigation / Policy Gate",
    },
    {
      range: "61-80",
      minConf: 61,
      maxConf: 80,
      total: 0,
      correct: 0,
      accuracy: 0,
      expectedConfidence: 70.5,
      calibrationGap: 0,
      operationalRouting: "Suggested Match / Reviewer Review",
    },
    {
      range: "81-100",
      minConf: 81,
      maxConf: 100,
      total: 0,
      correct: 0,
      accuracy: 0,
      expectedConfidence: 90.5,
      calibrationGap: 0,
      operationalRouting: "Straight-Through Auto Match",
    },
  ];

  for (const item of items) {
    const bucket = buckets.find(
      (b) => item.predictedConfidence >= b.minConf && item.predictedConfidence <= b.maxConf
    );
    if (bucket) {
      bucket.total++;
      if (item.isCorrect) {
        bucket.correct++;
      }
    }
  }

  for (const bucket of buckets) {
    bucket.accuracy =
      bucket.total > 0 ? Number(((bucket.correct / bucket.total) * 100).toFixed(1)) : 0;
    bucket.calibrationGap =
      bucket.total > 0 ? Number(Math.abs(bucket.accuracy - bucket.expectedConfidence).toFixed(1)) : 0;
  }

  return buckets;
}
