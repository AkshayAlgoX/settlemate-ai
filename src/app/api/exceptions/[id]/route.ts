import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: batchId } = await params;
    const { searchParams } = new URL(req.url);

    const type = searchParams.get("type");
    const status = searchParams.get("status");
    const risk = searchParams.get("risk");
    const minConfidence = searchParams.get("minConfidence");
    const maxConfidence = searchParams.get("maxConfidence");

    const where: Record<string, unknown> = { batchId };

    if (type && type !== "ALL") where.exceptionType = type;
    if (status && status !== "ALL") where.status = status;
    if (risk && risk !== "ALL") where.riskLevel = risk;

    if (minConfidence || maxConfidence) {
      where.confidenceScore = {
        gte: minConfidence ? parseInt(minConfidence, 10) : 0,
        lte: maxConfidence ? parseInt(maxConfidence, 10) : 100,
      };
    }

    const search = searchParams.get("search")?.trim();
    if (search) {
      where.OR = [
        { paymentId: { contains: search } },
        { orderId: { contains: search } },
        { settlementId: { contains: search } },
        { exceptionType: { contains: search } },
        { id: { contains: search } },
      ];
    }

    const sortBy = searchParams.get("sortBy") || "risk";
    const sortOrder = searchParams.get("sortOrder") === "asc" ? "asc" : "desc";

    let orderBy: Array<Record<string, "asc" | "desc">> = [];
    if (sortBy === "amount") {
      orderBy = [{ amount: sortOrder }];
    } else if (sortBy === "confidence") {
      orderBy = [{ confidenceScore: sortOrder }];
    } else if (sortBy === "date") {
      orderBy = [{ createdAt: sortOrder }];
    } else if (sortBy === "type") {
      orderBy = [{ exceptionType: sortOrder }];
    } else {
      // Default: sort by risk
      orderBy = [{ riskLevel: sortOrder }, { confidenceScore: "asc" }];
    }

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10)));
    const skip = (page - 1) * pageSize;

    const [exceptions, totalCount, aggregateRisk, highCount, medCount, lowCount] = await Promise.all([
      prisma.exception.findMany({
        where,
        skip,
        take: pageSize,
        orderBy,
        include: {
          aiExplanation: {
            select: { summary: true, recommendedAction: true },
          },
        },
      }),
      prisma.exception.count({ where }),
      prisma.exception.aggregate({
        where: { batchId },
        _sum: { amount: true },
      }),
      prisma.exception.count({ where: { batchId, riskLevel: "HIGH" } }),
      prisma.exception.count({ where: { batchId, riskLevel: "MEDIUM" } }),
      prisma.exception.count({ where: { batchId, riskLevel: "LOW" } }),
    ]);

    const totalPages = Math.ceil(totalCount / pageSize);

    return NextResponse.json({
      success: true,
      batchId,
      page,
      pageSize,
      totalPages,
      totalCount,
      hasNext: page < totalPages,
      hasPrev: page > 1,
      summary: {
        totalAmountAtRisk: aggregateRisk._sum.amount || 0,
        highRiskCount: highCount,
        mediumRiskCount: medCount,
        lowRiskCount: lowCount,
      },
      exceptions,
    });
  } catch (error) {
    console.error("Fetch exceptions list error:", error);
    return NextResponse.json(
      { error: "Failed to fetch exceptions" },
      { status: 500 }
    );
  }
}
