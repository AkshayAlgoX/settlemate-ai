import { NextRequest, NextResponse } from "next/server";
import { runMultiPassReconciliation } from "@/lib/reconciliation/multi-pass";
import { prisma } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  try {
    const { batchId } = await params;

    const batch = await prisma.batch.findUnique({
      where: { id: batchId },
      select: { id: true },
    });

    if (!batch) {
      return NextResponse.json({ error: "Batch not found" }, { status: 404 });
    }

    const result = await runMultiPassReconciliation(batchId);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Multi-pass error:", error);
    return NextResponse.json(
      { error: "Multi-pass reconciliation failed" },
      { status: 500 }
    );
  }
}