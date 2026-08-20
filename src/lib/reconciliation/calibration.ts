import { prisma } from "@/lib/db";

interface CalibrationBucket {
  range: string;
  minConf: number;
  maxConf: number;
  total: number;
  correct: number;
  accuracy: number;
}

export async function computeCalibration(
  batchId: string
): Promise<CalibrationBucket[]> {
  const results = await prisma.reconciliationResult.findMany({
    where: { batchId },
  });

  const groundTruths = await prisma.groundTruth.findMany({
    where: { batchId },
  });

  const gtMap = new Map<string, string>();
  for (const gt of groundTruths) {
    const effective = gt.expectedLabel === "ORPHAN_BANK_CREDIT" ? "AUTO_MATCHED" : gt.expectedLabel;
    gtMap.set(gt.paymentId, effective);
  }

  const buckets: CalibrationBucket[] = [
    { range: "0-20", minConf: 0, maxConf: 20, total: 0, correct: 0, accuracy: 0 },
    { range: "21-40", minConf: 21, maxConf: 40, total: 0, correct: 0, accuracy: 0 },
    { range: "41-60", minConf: 41, maxConf: 60, total: 0, correct: 0, accuracy: 0 },
    { range: "61-80", minConf: 61, maxConf: 80, total: 0, correct: 0, accuracy: 0 },
    { range: "81-100", minConf: 81, maxConf: 100, total: 0, correct: 0, accuracy: 0 },
  ];

  for (const result of results) {
    if (result.paymentId.startsWith("orphan_")) continue;

    const gt = gtMap.get(result.paymentId);
    if (!gt) continue;

    const bucket = buckets.find(
      (b) => result.confidenceScore >= b.minConf && result.confidenceScore <= b.maxConf
    );
    if (!bucket) continue;

    bucket.total++;
    if (result.status === gt) {
      bucket.correct++;
    }
  }

  for (const bucket of buckets) {
    bucket.accuracy = bucket.total > 0
      ? Math.round((bucket.correct / bucket.total) * 100)
      : 0;
  }

  return buckets;
}