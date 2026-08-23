import type { BatchData } from "./types";

export interface Indexes {
  paymentById: Map<string, BatchData["payments"][0]>;
  orderById: Map<string, BatchData["orders"][0]>;
  settlementById: Map<string, BatchData["settlements"][0]>;
  settlementsByPaymentId: Map<string, BatchData["settlements"]>;
  bankByUtr: Map<string, BatchData["bankTransactions"][0]>;
  bankByAmount: Map<number, BatchData["bankTransactions"]>;
  sortedBankAmounts: number[];
  amountFirstSeenIndex: Map<number, number>;
  settlementUtrSet: Set<string>;
  hasNullSettlementUtr: boolean;
  refundsByPaymentId: Map<string, BatchData["refunds"]>;
  chargebacksByPaymentId: Map<string, BatchData["chargebacks"]>;
  maxCapturedDate: Date;
}

export function buildIndexes(data: BatchData): Indexes {
  const paymentById = new Map<string, BatchData["payments"][0]>();
  const orderById = new Map<string, BatchData["orders"][0]>();
  const settlementById = new Map<string, BatchData["settlements"][0]>();
  const settlementsByPaymentId = new Map<string, BatchData["settlements"]>();
  const bankByUtr = new Map<string, BatchData["bankTransactions"][0]>();
  const bankByAmount = new Map<number, BatchData["bankTransactions"]>();
  const amountFirstSeenIndex = new Map<number, number>();
  const settlementUtrSet = new Set<string>();
  let hasNullSettlementUtr = false;
  const refundsByPaymentId = new Map<string, BatchData["refunds"]>();
  const chargebacksByPaymentId = new Map<string, BatchData["chargebacks"]>();

  let maxCapturedDate = new Date(0);

  for (const p of data.payments) {
    paymentById.set(p.paymentId, p);
    if (p.capturedAt && p.capturedAt > maxCapturedDate) {
      maxCapturedDate = p.capturedAt;
    }
  }

  for (const o of data.orders) {
    orderById.set(o.orderId, o);
  }

  for (const s of data.settlements) {
    settlementById.set(s.settlementId, s);
    const existing = settlementsByPaymentId.get(s.paymentId);
    if (existing) {
      existing.push(s);
    } else {
      settlementsByPaymentId.set(s.paymentId, [s]);
    }

    if (s.utr) {
      settlementUtrSet.add(s.utr);
    } else {
      hasNullSettlementUtr = true;
    }
  }

  let amountOrder = 0;
  for (const b of data.bankTransactions) {
    if (b.utr && b.type === "CREDIT") {
      bankByUtr.set(b.utr, b);
    }
    if (b.type === "CREDIT") {
      const existing = bankByAmount.get(b.amount);
      if (existing) {
        existing.push(b);
      } else {
        bankByAmount.set(b.amount, [b]);
        amountFirstSeenIndex.set(b.amount, amountOrder++);
      }
    }
  }

  const sortedBankAmounts = Array.from(bankByAmount.keys()).sort((a, b) => a - b);

  for (const r of data.refunds) {
    if (r.status === "processed") {
      const existing = refundsByPaymentId.get(r.paymentId);
      if (existing) {
        existing.push(r);
      } else {
        refundsByPaymentId.set(r.paymentId, [r]);
      }
    }
  }

  for (const c of data.chargebacks) {
    if (["open", "under_review", "accepted"].includes(c.status)) {
      const existing = chargebacksByPaymentId.get(c.paymentId);
      if (existing) {
        existing.push(c);
      } else {
        chargebacksByPaymentId.set(c.paymentId, [c]);
      }
    }
  }

  return {
    paymentById,
    orderById,
    settlementById,
    settlementsByPaymentId,
    bankByUtr,
    bankByAmount,
    sortedBankAmounts,
    amountFirstSeenIndex,
    settlementUtrSet,
    hasNullSettlementUtr,
    refundsByPaymentId,
    chargebacksByPaymentId,
    maxCapturedDate,
  };
}