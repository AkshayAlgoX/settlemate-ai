import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  try {
    const { batchId } = await params;

    const [batch, results, exceptions] = await Promise.all([
      prisma.batch.findUnique({ where: { id: batchId } }),
      prisma.reconciliationResult.findMany({
        where: { batchId },
        orderBy: { createdAt: "asc" },
      }),
      prisma.exception.findMany({
        where: { batchId },
        orderBy: { confidenceScore: "asc" },
      }),
    ]);

    if (!batch) {
      return NextResponse.json({ error: "Batch not found" }, { status: 404 });
    }

    return NextResponse.json({
      batch: {
        id: batch.id,
        name: batch.name,
        status: batch.status,
        size: batch.size,
        accuracy: batch.accuracy,
        precision: batch.precision,
        recall: batch.recall,
        throughputRps: batch.throughputRps,
        processingTimeMs: batch.processingTimeMs,
        totalRecords: batch.totalRecords,
        autoMatched: batch.autoMatched,
        exceptionsFound: batch.exceptionsFound,
        unresolvedCount: batch.unresolvedCount,
        amountAtRisk: batch.amountAtRisk,
        grossOrderAmount: batch.totalRecords,
      },
      results: results.slice(0, 500), // Limit for performance
      exceptions,
    });
  } catch (error) {
    console.error("Results fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch results" },
      { status: 500 }
    );
  }
}