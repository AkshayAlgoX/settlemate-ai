import { NextRequest, NextResponse } from "next/server";
import { runReconciliation } from "@/lib/reconciliation/engine";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  try {
    const { batchId } = await params;

    if (!batchId) {
      return NextResponse.json({ error: "batchId required" }, { status: 400 });
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
      { error: "Reconciliation failed", details: String(error) },
      { status: 500 }
    );
  }
}