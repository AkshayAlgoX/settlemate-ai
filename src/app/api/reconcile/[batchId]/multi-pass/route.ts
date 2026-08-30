import { NextRequest, NextResponse } from "next/server";
import { readMultiPassSnapshot, runMultiPassIdempotent } from "@/lib/reconciliation/multi-pass";
import { ControlFailureError } from "@/lib/reconciliation/invariants";
import { buildControlFailureResponse } from "@/lib/reconciliation/control-error";
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

    const snapshot = await readMultiPassSnapshot(batchId);

    if (!snapshot.persisted) {
      return NextResponse.json({ success: false, persisted: false }, { status: 200 });
    }

    return NextResponse.json({
      success: true,
      ...snapshot,
    });
  } catch (error) {
    console.error("Multi-pass read error:", error);
    return NextResponse.json(
      { error: "Failed to read multi-pass results" },
      { status: 500 }
    );
  }
}

// POST runs the 3-pass reconciliation **idempotently**: a batch that already has
// a persisted snapshot returns that snapshot without re-running, and a per-batch
// lock guarantees at most one in-flight run per batch (browser double-click,
// retry, or concurrent duplicate POST all observe the existing result instead of
// appending duplicate audit/agent-trace/result rows).
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

    const outcome = await runMultiPassIdempotent(batchId);

    if (outcome.inProgress) {
      // Another run for this batch is already underway; don't double-run.
      return NextResponse.json(
        { success: false, persisted: false, inProgress: true },
        { status: 202 }
      );
    }

    return NextResponse.json({
      success: true,
      persisted: true,
      idempotent: outcome.idempotent,
      executed: outcome.executed,
      ...outcome.body,
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

    console.error("Multi-pass error:", error);
    return NextResponse.json(
      { error: "Multi-pass reconciliation failed" },
      { status: 500 }
    );
  }
}
