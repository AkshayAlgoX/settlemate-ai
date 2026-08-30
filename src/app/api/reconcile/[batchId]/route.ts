import { NextRequest, NextResponse } from "next/server";
import { runReconciliation } from "@/lib/reconciliation/engine";
import { ControlFailureError } from "@/lib/reconciliation/invariants";
import { buildControlFailureResponse, buildIncompleteRecordsError } from "@/lib/reconciliation/control-error";
import { prisma } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  try {
    const { batchId } = await params;

    if (!batchId) {
      return NextResponse.json({ error: "batchId required" }, { status: 400 });
    }

    // Verify batch exists before attempting reconciliation
    const batch = await prisma.batch.findUnique({
      where: { id: batchId },
      select: { id: true },
    });

    if (!batch) {
      return NextResponse.json({ error: "Batch not found" }, { status: 404 });
    }

    // Pre-validation: ensure all required record types are present in the batch
    const paymentCount = await prisma.payment.count({ where: { batchId } });
    const settlementCount = await prisma.settlement.count({ where: { batchId } });
    const bankCreditCount = await prisma.bankTransaction.count({
      where: { batchId, type: "CREDIT" },
    });
    const bankDebitCount = await prisma.bankTransaction.count({
      where: { batchId, type: "DEBIT" },
    });
    const chargebackCount = await prisma.chargeback.count({ where: { batchId } });

    const missingRecords: string[] = [];
    if (paymentCount === 0) missingRecords.push("payments");
    if (settlementCount === 0) missingRecords.push("settlements");
    if (bankCreditCount === 0) missingRecords.push("bankCredits");
    if (bankDebitCount === 0 && chargebackCount > 0) missingRecords.push("bankDebits");

    if (missingRecords.length > 0 && (paymentCount === 0 || bankCreditCount === 0 || settlementCount === 0)) {
      return NextResponse.json(buildIncompleteRecordsError(missingRecords), { status: 422 });
    }

    const metrics = await runReconciliation(batchId);

    return NextResponse.json({
      success: true,
      batchId,
      metrics: {
        totalRecords: metrics.totalRecords,
        autoMatched: metrics.autoMatched,
        exceptionsFound: metrics.exceptionsFound,
        unresolvedCount: metrics.unresolvedCount,
        accuracy: metrics.accuracy,
        precision: metrics.precision,
        recall: metrics.recall,
        throughputRps: metrics.throughputRps,
        processingTimeMs: metrics.processingTimeMs,
        amountAtRisk: metrics.amountAtRisk,
        exceptionsByType: metrics.exceptionsByType,
        phaseTimings: metrics.phaseTimings,
      },
    });
  } catch (error) {
    if (
      error instanceof ControlFailureError ||
      (error as { name?: string })?.name === "ControlFailureError" ||
      (error as { code?: string })?.code === "CONTROL_FAILURE"
    ) {
      const payload = buildControlFailureResponse(error as ControlFailureError);
      return NextResponse.json(payload, { status: 422 });
    }

    console.error("Reconciliation error:", error);
    return NextResponse.json(
      { error: "Reconciliation failed" },
      { status: 500 }
    );
  }
}
