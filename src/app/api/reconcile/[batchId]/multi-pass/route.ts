import { NextRequest, NextResponse } from "next/server";
import { runMultiPassReconciliation } from "@/lib/reconciliation/multi-pass";
import { prisma } from "@/lib/db";

// GET returns the most recent persisted multi-pass snapshot for the batch. It
// NEVER re-runs reconciliation — the dashboard reads results instead of
// re-computing them (which previously wrote a fresh MULTI_PASS_COMPLETED audit
// row on every dashboard view).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  try {
    const { batchId } = await params;

    const batch = await prisma.batch.findUnique({
      where: { id: batchId },
      select: { id: true, status: true },
    });

    if (!batch) {
      return NextResponse.json({ error: "Batch not found" }, { status: 404 });
    }

    const lastRun = await prisma.auditLog.findFirst({
      where: { batchId, action: "MULTI_PASS_COMPLETED" },
      orderBy: { timestamp: "desc" },
      select: { metadata: true },
    });

    const snapshot = lastRun?.metadata
      ? (JSON.parse(lastRun.metadata) as Record<string, unknown> | null)
      : null;

    if (!snapshot) {
      return NextResponse.json({ success: false, persisted: false }, { status: 200 });
    }

    return NextResponse.json({
      success: true,
      persisted: true,
      passes: snapshot.passes ?? [],
      aiStatus: {
        totalCalls: snapshot.aiCalls ?? 0,
        maxCalls: 10,
        circuitTripped: snapshot.circuitTripped ?? false,
      },
      adversarial: snapshot.adversarial,
      calibration: snapshot.calibration,
      totalDurationMs: snapshot.totalDurationMs ?? 0,
    });
  } catch (error) {
    console.error("Multi-pass read error:", error);
    return NextResponse.json(
      { error: "Failed to read multi-pass results" },
      { status: 500 }
    );
  }
}

export async function POST(
  _req: NextRequest,
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