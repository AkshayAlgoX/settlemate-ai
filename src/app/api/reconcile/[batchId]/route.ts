import { NextRequest, NextResponse } from "next/server";
import { runReconciliation } from "@/lib/reconciliation/engine";
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
    console.error("Reconciliation error:", error);
    return NextResponse.json(
      { error: "Reconciliation failed" },
      { status: 500 }
    );
  }
}