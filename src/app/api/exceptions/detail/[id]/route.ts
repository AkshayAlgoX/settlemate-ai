import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Exception ID required" }, { status: 400 });
    }

    const exception = await prisma.exception.findUnique({
      where: { id },
      include: {
        aiExplanation: true,
        agentTraces: {
          orderBy: [{ passNumber: "asc" }, { stepNumber: "asc" }],
        },
      },
    });

    if (!exception) {
      return NextResponse.json({ error: "Exception not found" }, { status: 404 });
    }

    const { batchId, paymentId, settlementId, bankTxnId } = exception;

    const [
      payment,
      settlement,
      bankTxn,
      refunds,
      chargebacks,
      reconResult,
      auditLogs,
    ] = await Promise.all([
      paymentId
        ? prisma.payment.findFirst({ where: { batchId, paymentId } })
        : null,
      settlementId
        ? prisma.settlement.findFirst({ where: { batchId, settlementId } })
        : paymentId
        ? prisma.settlement.findFirst({ where: { batchId, paymentId } })
        : null,
      bankTxnId
        ? prisma.bankTransaction.findFirst({ where: { batchId, txnId: bankTxnId } })
        : null,
      paymentId
        ? prisma.refund.findMany({ where: { batchId, paymentId } })
        : [],
      paymentId
        ? prisma.chargeback.findMany({ where: { batchId, paymentId } })
        : [],
      paymentId
        ? prisma.reconciliationResult.findFirst({ where: { batchId, paymentId } })
        : null,
      prisma.auditLog.findMany({
        where: {
          batchId,
          OR: [
            { entityId: id },
            ...(paymentId ? [{ entityId: paymentId }] : []),
          ],
        },
        orderBy: { timestamp: "desc" },
      }),
    ]);

    let order = null;
    if (payment?.orderId) {
      order = await prisma.order.findFirst({
        where: { batchId, orderId: payment.orderId },
      });
    }

    let provenanceData = null;
    if (reconResult?.matchDetails) {
      try {
        provenanceData = JSON.parse(reconResult.matchDetails);
      } catch {
        provenanceData = { raw: reconResult.matchDetails };
      }
    }

    return NextResponse.json({
      success: true,
      exception,
      sources: {
        order,
        payment,
        settlement,
        bankTxn,
        refunds,
        chargebacks,
      },
      calculation: reconResult
        ? {
            orderAmount: reconResult.orderAmount,
            paymentAmount: reconResult.paymentAmount,
            fee: reconResult.paymentFee,
            tax: reconResult.paymentTax,
            refundAmount: reconResult.refundAmount,
            chargebackAmount: reconResult.chargebackAmount,
            expectedNetAmount: reconResult.expectedNetAmount,
            actualSettledAmount: reconResult.actualSettledAmount,
            bankCreditedAmount: reconResult.bankCreditedAmount,
            mismatchAmount: reconResult.mismatchAmount,
            confidenceScore: reconResult.confidenceScore,
            matchMethod: reconResult.matchMethod,
          }
        : null,
      provenance: provenanceData,
      auditTimeline: auditLogs,
    });
  } catch (error) {
    console.error("Exception detail fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch exception detail" },
      { status: 500 }
    );
  }
}