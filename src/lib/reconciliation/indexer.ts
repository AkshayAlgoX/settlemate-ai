import type { BatchData } from "./types";

export interface Indexes {
  paymentById: Map<string, BatchData["payments"][0]>;
  orderById: Map<string, BatchData["orders"][0]>;
  settlementsByPaymentId: Map<string, BatchData["settlements"]>;
  bankByUtr: Map<string, BatchData["bankTransactions"][0]>;
  bankByAmount: Map<number, BatchData["bankTransactions"]>;
  refundsByPaymentId: Map<string, BatchData["refunds"]>;
  chargebacksByPaymentId: Map<string, BatchData["chargebacks"]>;
  maxCapturedDate: Date;
}

export function buildIndexes(data: BatchData): Indexes {
  const paymentById = new Map<string, BatchData["payments"][0]>();
  const orderById = new Map<string, BatchData["orders"][0]>();
  const settlementsByPaymentId = new Map<string, BatchData["settlements"]>();
  const bankByUtr = new Map<string, BatchData["bankTransactions"][0]>();
  const bankByAmount = new Map<number, BatchData["bankTransactions"]>();
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
    const existing = settlementsByPaymentId.get(s.paymentId) || [];
    existing.push(s);
    settlementsByPaymentId.set(s.paymentId, existing);

    if (s.utr) {
      bankByUtr.set(s.utr, data.bankTransactions.find(
        (b) => b.utr === s.utr && b.type === "CREDIT"
      ) || null as unknown as BatchData["bankTransactions"][0]);
    }
  }

  // Rebuild bankByUtr properly from bank transactions
  bankByUtr.clear();
  for (const b of data.bankTransactions) {
    if (b.utr && b.type === "CREDIT") {
      bankByUtr.set(b.utr, b);
    }
  }

  for (const b of data.bankTransactions) {
    if (b.type === "CREDIT") {
      const existing = bankByAmount.get(b.amount) || [];
      existing.push(b);
      bankByAmount.set(b.amount, existing);
    }
  }

  for (const r of data.refunds) {
    if (r.status === "processed") {
      const existing = refundsByPaymentId.get(r.paymentId) || [];
      existing.push(r);
      refundsByPaymentId.set(r.paymentId, existing);
    }
  }

  for (const c of data.chargebacks) {
    if (["open", "under_review", "accepted"].includes(c.status)) {
      const existing = chargebacksByPaymentId.get(c.paymentId) || [];
      existing.push(c);
      chargebacksByPaymentId.set(c.paymentId, existing);
    }
  }

  return {
    paymentById,
    orderById,
    settlementsByPaymentId,
    bankByUtr,
    bankByAmount,
    refundsByPaymentId,
    chargebacksByPaymentId,
    maxCapturedDate,
  };
}