import type { BatchData } from "./types";
import { prisma } from "@/lib/db";

export async function fetchBatchData(batchId: string): Promise<BatchData> {
  const [orders, payments, settlements, bankTransactions, refunds, chargebacks, groundTruths] =
    await Promise.all([
      prisma.order.findMany({ where: { batchId } }),
      prisma.payment.findMany({ where: { batchId } }),
      prisma.settlement.findMany({ where: { batchId } }),
      prisma.bankTransaction.findMany({ where: { batchId } }),
      prisma.refund.findMany({ where: { batchId } }),
      prisma.chargeback.findMany({ where: { batchId } }),
      prisma.groundTruth.findMany({ where: { batchId } }),
    ]);

  return {
    orders: orders.map((o) => ({
      dbId: o.id,
      orderId: o.orderId.trim().toLowerCase(),
      amount: o.amount,
      status: o.status.trim().toLowerCase(),
      createdAt: new Date(o.createdAt),
    })),
    payments: payments.map((p) => ({
      dbId: p.id,
      paymentId: p.paymentId.trim().toLowerCase(),
      orderId: p.orderId.trim().toLowerCase(),
      amount: p.amount,
      fee: p.fee,
      tax: p.tax,
      method: p.method.trim().toLowerCase(),
      status: p.status.trim().toLowerCase(),
      capturedAt: p.capturedAt ? new Date(p.capturedAt) : null,
      createdAt: new Date(p.createdAt),
    })),
    settlements: settlements.map((s) => ({
      dbId: s.id,
      settlementId: s.settlementId.trim().toLowerCase(),
      paymentId: s.paymentId.trim().toLowerCase(),
      amount: s.amount,
      fee: s.fee,
      tax: s.tax,
      utr: s.utr ? s.utr.trim().toUpperCase() : null,
      status: s.status.trim().toLowerCase(),
      settledAt: s.settledAt ? new Date(s.settledAt) : null,
      createdAt: new Date(s.createdAt),
    })),
    bankTransactions: bankTransactions.map((b) => ({
      dbId: b.id,
      txnId: b.txnId.trim().toLowerCase(),
      utr: b.utr ? b.utr.trim().toUpperCase() : null,
      amount: b.amount,
      type: b.type.trim().toUpperCase(),
      narration: b.narration ? b.narration.trim() : null,
      txnDate: new Date(b.txnDate),
      matched: false,
    })),
    refunds: refunds.map((r) => ({
      dbId: r.id,
      refundId: r.refundId.trim().toLowerCase(),
      paymentId: r.paymentId.trim().toLowerCase(),
      amount: r.amount,
      status: r.status.trim().toLowerCase(),
    })),
    chargebacks: chargebacks.map((c) => ({
      dbId: c.id,
      chargebackId: c.chargebackId.trim().toLowerCase(),
      paymentId: c.paymentId.trim().toLowerCase(),
      amount: c.amount,
      status: c.status.trim().toLowerCase(),
    })),
    groundTruths: groundTruths.map((g) => ({
      paymentId: g.paymentId.trim().toLowerCase(),
      expectedLabel: g.expectedLabel,
      scenario: g.scenario,
    })),
  };
}