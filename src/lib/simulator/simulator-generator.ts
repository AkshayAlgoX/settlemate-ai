/*
 * SettleMate AI — Deterministic Transaction Batch Simulator
 *
 * Generates reproducible synthetic batches (50-200 rows) with configurable
 * anomaly rates for external ERP/e-commerce integration demonstrations.
 */

export interface AnomalyConfig {
  partialRefundRate: number; // e.g. 0.08 (8%)
  feeMismatchRate: number; // e.g. 0.06 (6%)
  duplicateRate: number; // e.g. 0.04 (4%)
  delayedSettlementRate: number; // e.g. 0.05 (5%)
  orphanCreditRate: number; // e.g. 0.03 (3%)
}

export interface SimulatorRow {
  source: "PAYMENT" | "SETTLEMENT" | "BANK" | "REFUND" | "CHARGEBACK";
  amount: number;
  currency: string;
  date: string;
  reference_id: string;
  utr?: string;
  fee?: number;
  tax?: number;
  anomalyTag?: string;
}

export interface SimulatorBatchResult {
  seed: number;
  rowCount: number;
  transactions: SimulatorRow[];
  csvContent: string;
  stats: {
    cleanTxnCount: number;
    partialRefundCount: number;
    feeMismatchCount: number;
    duplicateCount: number;
    delayedCount: number;
    orphanCount: number;
    totalRowsGenerated: number;
  };
}

export function createPrng(seed: number) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateSimulatorBatch(
  rowCount: number = 75,
  seed: number = 42,
  anomalyConfig: AnomalyConfig = {
    partialRefundRate: 0.08,
    feeMismatchRate: 0.06,
    duplicateRate: 0.04,
    delayedSettlementRate: 0.05,
    orphanCreditRate: 0.03,
  }
): SimulatorBatchResult {
  const boundedRowCount = Math.min(200, Math.max(50, Math.round(rowCount)));
  const prng = createPrng(seed);

  const transactions: SimulatorRow[] = [];
  const baseDate = new Date("2026-08-25T00:00:00Z");

  let cleanTxnCount = 0;
  let partialRefundCount = 0;
  let feeMismatchCount = 0;
  let duplicateCount = 0;
  let orphanCount = 0;

  const standardAmounts = [
    499.0, 999.0, 1499.0, 2499.0, 3999.0, 5000.0, 7500.0, 12000.0, 15500.0, 20000.0,
  ];

  for (let i = 1; i <= boundedRowCount; i++) {
    const refId = `TXN_${seed}_${String(i).padStart(4, "0")}`;
    const amountIdx = Math.floor(prng() * standardAmounts.length);
    const grossAmount = standardAmounts[amountIdx];
    const roll = prng();

    // Timestamp with minor jitter
    const txDate = new Date(baseDate.getTime() + i * 180000);
    const dateStr = txDate.toISOString();

    // 1. Partial Refund Anomaly
    if (roll < anomalyConfig.partialRefundRate) {
      partialRefundCount++;
      const refundAmount = Number((grossAmount * 0.15).toFixed(2));
      const settledAmount = Number((grossAmount - refundAmount).toFixed(2));

      transactions.push({
        source: "PAYMENT",
        amount: grossAmount,
        currency: "INR",
        date: dateStr,
        reference_id: refId,
        anomalyTag: "PARTIAL_REFUND",
      });
      transactions.push({
        source: "SETTLEMENT",
        amount: settledAmount,
        currency: "INR",
        date: dateStr,
        reference_id: refId,
        utr: `UTR_${refId}`,
      });
      transactions.push({
        source: "REFUND",
        amount: refundAmount,
        currency: "INR",
        date: dateStr,
        reference_id: refId,
      });
    }
    // 2. Fee Mismatch Anomaly
    else if (roll < anomalyConfig.partialRefundRate + anomalyConfig.feeMismatchRate) {
      feeMismatchCount++;
      const expectedFee = Number((grossAmount * 0.015).toFixed(2));
      const inflatedFee = Number((grossAmount * 0.03).toFixed(2)); // Double fee
      const settled = Number((grossAmount - inflatedFee).toFixed(2));

      transactions.push({
        source: "PAYMENT",
        amount: grossAmount,
        currency: "INR",
        date: dateStr,
        reference_id: refId,
        fee: expectedFee,
        anomalyTag: "FEE_MISMATCH",
      });
      transactions.push({
        source: "SETTLEMENT",
        amount: settled,
        currency: "INR",
        date: dateStr,
        reference_id: refId,
        fee: inflatedFee,
        utr: `UTR_${refId}`,
      });
      transactions.push({
        source: "BANK",
        amount: settled,
        currency: "INR",
        date: dateStr,
        reference_id: refId,
        utr: `UTR_${refId}`,
      });
    }
    // 3. Duplicate Settlement Anomaly
    else if (roll < anomalyConfig.partialRefundRate + anomalyConfig.feeMismatchRate + anomalyConfig.duplicateRate) {
      duplicateCount++;
      transactions.push({
        source: "PAYMENT",
        amount: grossAmount,
        currency: "INR",
        date: dateStr,
        reference_id: refId,
        anomalyTag: "DUPLICATE_SETTLEMENT",
      });
      transactions.push({
        source: "SETTLEMENT",
        amount: grossAmount,
        currency: "INR",
        date: dateStr,
        reference_id: refId,
        utr: `UTR_${refId}_A`,
      });
      transactions.push({
        source: "SETTLEMENT",
        amount: grossAmount,
        currency: "INR",
        date: dateStr,
        reference_id: refId,
        utr: `UTR_${refId}_B`,
      });
    }
    // 4. Orphan Bank Credit
    else if (
      roll <
      anomalyConfig.partialRefundRate +
        anomalyConfig.feeMismatchRate +
        anomalyConfig.duplicateRate +
        anomalyConfig.orphanCreditRate
    ) {
      orphanCount++;
      transactions.push({
        source: "BANK",
        amount: grossAmount,
        currency: "INR",
        date: dateStr,
        reference_id: `ORPHAN_${refId}`,
        utr: `UTR_UNKNOWN_${refId}`,
        anomalyTag: "ORPHAN_CREDIT",
      });
    }
    // 5. Clean 1:1:1 Match
    else {
      cleanTxnCount++;
      transactions.push({
        source: "PAYMENT",
        amount: grossAmount,
        currency: "INR",
        date: dateStr,
        reference_id: refId,
      });
      transactions.push({
        source: "SETTLEMENT",
        amount: grossAmount,
        currency: "INR",
        date: dateStr,
        reference_id: refId,
        utr: `UTR_${refId}`,
      });
      transactions.push({
        source: "BANK",
        amount: grossAmount,
        currency: "INR",
        date: dateStr,
        reference_id: refId,
        utr: `UTR_${refId}`,
      });
    }
  }

  // Generate CSV representation
  const csvHeader = "source,amount,currency,date,reference_id,utr,fee,tax,anomalyTag\n";
  const csvRows = transactions
    .map(
      (t) =>
        `${t.source},${t.amount},${t.currency},${t.date},${t.reference_id},${t.utr || ""},${t.fee || ""},${t.tax || ""},${t.anomalyTag || ""}`
    )
    .join("\n");
  const csvContent = csvHeader + csvRows;

  return {
    seed,
    rowCount: boundedRowCount,
    transactions,
    csvContent,
    stats: {
      cleanTxnCount,
      partialRefundCount,
      feeMismatchCount,
      duplicateCount,
      delayedCount: 0,
      orphanCount,
      totalRowsGenerated: transactions.length,
    },
  };
}
