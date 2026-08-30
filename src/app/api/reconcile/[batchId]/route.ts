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

    // Atomic concurrency lock: flip status to PROCESSING only if in an executable state
    const lockUpdate = await prisma.batch.updateMany({
      where: {
        id: batchId,
        status: { in: ["CREATED", "FAILED", "CONTROL_FAILURE", "RECONCILED"] },
      },
      data: { status: "PROCESSING" },
    });

    if (lockUpdate.count === 0) {
      const existing = await prisma.batch.findUnique({
        where: { id: batchId },
        select: { status: true },
      });
      if (!existing) {
        return NextResponse.json({ error: "Batch not found" }, { status: 404 });
      }
      if (existing.status === "PROCESSING") {
        return NextResponse.json(
          { error: "Batch is currently being reconciled by another process", code: "CONCURRENT_RECONCILIATION" },
          { status: 409 }
        );
      }
    }

    // Parallel pre-validation: run count queries concurrently
    const [paymentCount, settlementCount, bankCreditCount, bankDebitCount, chargebackCount] =
      await Promise.all([
        prisma.payment.count({ where: { batchId } }),
        prisma.settlement.count({ where: { batchId } }),
        prisma.bankTransaction.count({ where: { batchId, type: "CREDIT" } }),
        prisma.bankTransaction.count({ where: { batchId, type: "DEBIT" } }),
        prisma.chargeback.count({ where: { batchId } }),
      ]);

    const missingRecords: string[] = [];
    if (paymentCount === 0) missingRecords.push("payments");
    if (settlementCount === 0) missingRecords.push("settlements");
    if (bankCreditCount === 0) missingRecords.push("bankCredits");
    if (bankDebitCount === 0 && chargebackCount > 0) missingRecords.push("bankDebits");

    if (missingRecords.length > 0 && (paymentCount === 0 || bankCreditCount === 0 || settlementCount === 0)) {
      // Release lock on validation failure
      await prisma.batch.update({ where: { id: batchId }, data: { status: "CREATED" } }).catch(() => {});
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
