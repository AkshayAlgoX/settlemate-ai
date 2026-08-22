import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateSyntheticBatch } from "@/lib/synthetic/generator";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const size = body.size || 250;

    if (![50, 100, 250, 500].includes(size)) {
      return NextResponse.json(
        { error: "Batch size must be 50, 100, 250, or 500" },
        { status: 400 }
      );
    }

    const data = generateSyntheticBatch(size);
    const batchName = `Synthetic Batch ${new Date().toISOString().slice(0, 16)}`;

    const batch = await prisma.batch.create({
      data: {
        name: batchName,
        size,
        status: "CREATED",
        source: "GENERATED",
        orders: {
          create: data.orders.map((o) => ({
            orderId: o.orderId,
            amount: o.amount,
            currency: o.currency,
            status: o.status,
            customerEmail: o.customerEmail,
            description: o.description,
            createdAt: o.createdAt,
          })),
        },
        payments: {
          create: data.payments.map((p) => ({
            paymentId: p.paymentId,
            orderId: p.orderId,
            amount: p.amount,
            currency: p.currency,
            status: p.status,
            method: p.method,
            fee: p.fee,
            tax: p.tax,
            capturedAt: p.capturedAt,
            createdAt: p.createdAt,
          })),
        },
        settlements: {
          create: data.settlements.map((s) => ({
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
        },
        bankTransactions: {
          create: data.bankTransactions.map((b) => ({
            txnId: b.txnId,
            utr: b.utr,
            amount: b.amount,
            type: b.type,
            narration: b.narration,
            balance: b.balance,
            txnDate: b.txnDate,
            valueDate: b.valueDate,
          })),
        },
        refunds: {
          create: data.refunds.map((r) => ({
            refundId: r.refundId,
            paymentId: r.paymentId,
            amount: r.amount,
            status: r.status,
            reason: r.reason,
            createdAt: r.createdAt,
            processedAt: r.processedAt,
          })),
        },
        chargebacks: {
          create: data.chargebacks.map((c) => ({
            chargebackId: c.chargebackId,
            paymentId: c.paymentId,
            amount: c.amount,
            reason: c.reason,
            status: c.status,
            createdAt: c.createdAt,
            resolvedAt: c.resolvedAt,
          })),
        },
        groundTruths: {
          create: data.groundTruths.map((g) => ({
            paymentId: g.paymentId,
            expectedLabel: g.expectedLabel,
            scenario: g.scenario,
          })),
        },
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        batchId: batch.id,
        actor: "SYSTEM",
        action: "BATCH_GENERATED",
        entityType: "batch",
        entityId: batch.id,
        reason: `Generated ${size} synthetic records with 10 exception scenarios`,
        metadata: JSON.stringify({
          orders: data.orders.length,
          payments: data.payments.length,
          settlements: data.settlements.length,
          bankTransactions: data.bankTransactions.length,
          refunds: data.refunds.length,
          chargebacks: data.chargebacks.length,
          groundTruths: data.groundTruths.length,
        }),
      },
    });

    return NextResponse.json({
      batchId: batch.id,
      stats: {
        orders: data.orders.length,
        payments: data.payments.length,
        settlements: data.settlements.length,
        bankTransactions: data.bankTransactions.length,
        refunds: data.refunds.length,
        chargebacks: data.chargebacks.length,
        groundTruths: data.groundTruths.length,
      },
    });
  } catch (error) {
    console.error("Batch generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate batch" },
      { status: 500 }
    );
  }
}