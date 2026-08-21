import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  try {
    const { batchId } = await params;
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

    const [exceptions, totalCount, aggregateRisk] = await Promise.all([
      prisma.exception.findMany({
        where,
        orderBy: [{ riskLevel: "asc" }, { confidenceScore: "asc" }],
        include: {
          aiExplanation: {
            select: { summary: true, recommendedAction: true },
          },
        },
      }),
      prisma.exception.count({ where }),
      prisma.exception.aggregate({
        where,
        _sum: { amount: true },
      }),
    ]);

    // Count by risk
    const highRisk = exceptions.filter((e) => e.riskLevel === "HIGH").length;
    const mediumRisk = exceptions.filter((e) => e.riskLevel === "MEDIUM").length;
    const lowRisk = exceptions.filter((e) => e.riskLevel === "LOW").length;

    return NextResponse.json({
      success: true,
      batchId,
      totalCount,
      summary: {
        totalAmountAtRisk: aggregateRisk._sum.amount || 0,
        highRiskCount: highRisk,
        mediumRiskCount: mediumRisk,
        lowRiskCount: lowRisk,
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