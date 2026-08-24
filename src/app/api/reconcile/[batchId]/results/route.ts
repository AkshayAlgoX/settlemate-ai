import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  try {
    const { batchId } = await params;

    if (!batchId) {
      return NextResponse.json({ error: "batchId required" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10)));
    const status = searchParams.get("status");
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { batchId };
    if (status && status !== "ALL") {
      where.status = status;
    }

    const [batch, results, totalResults, exceptions, totalExceptions] = await Promise.all([
      prisma.batch.findUnique({ where: { id: batchId } }),
      prisma.reconciliationResult.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "asc" },
      }),
      prisma.reconciliationResult.count({ where }),
      prisma.exception.findMany({
        where: { batchId },
        skip: 0,
        take: 50,
        orderBy: [{ riskLevel: "asc" }, { confidenceScore: "asc" }],
      }),
      prisma.exception.count({ where: { batchId } }),
    ]);

    if (!batch) {
      return NextResponse.json({ error: "Batch not found" }, { status: 404 });
    }

    const totalPages = Math.ceil(totalResults / pageSize);

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
        source: batch.source,
      },
      page,
      pageSize,
      totalPages,
      totalResults,
      hasNext: page < totalPages,
      hasPrev: page > 1,
      results,
      exceptions,
      totalExceptions,
    });
  } catch (error) {
    console.error("Results fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch results" },
      { status: 500 }
    );
  }
}