import { NextRequest, NextResponse } from "next/server";
import { runMultiPassReconciliation } from "@/lib/reconciliation/multi-pass";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  try {
    const { batchId } = await params;
    const result = await runMultiPassReconciliation(batchId);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Multi-pass error:", error);
    return NextResponse.json(
      { error: "Multi-pass reconciliation failed", details: String(error) },
      { status: 500 }
    );
  }
}