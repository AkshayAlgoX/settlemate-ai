import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { status, resolution } = body;

    const validStatuses = ["OPEN", "INVESTIGATING", "RESOLVED", "MANUAL_REVIEW"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const exception = await prisma.exception.findUnique({ where: { id } });
    if (!exception) {
      return NextResponse.json({ error: "Exception not found" }, { status: 404 });
    }

    const updated = await prisma.exception.update({
      where: { id },
      data: {
        status,
        resolution: resolution || null,
        resolvedBy: status === "RESOLVED" ? "USER" : null,
        resolvedAt: status === "RESOLVED" ? new Date() : null,
      },
    });

    await prisma.auditLog.create({
      data: {
        batchId: exception.batchId,
        actor: "USER",
        action: "STATUS_CHANGED",
        entityType: "exception",
        entityId: id,
        beforeState: JSON.stringify({ status: exception.status }),
        afterState: JSON.stringify({ status }),
        reason: resolution || `Status changed to ${status}`,
      },
    });

    // Check if this is a feedback correction (for learning loop)
    if (status === "RESOLVED" && exception.status === "OPEN") {
      await prisma.feedbackEntry.create({
        data: {
          batchId: exception.batchId,
          exceptionId: id,
          originalStatus: exception.status,
          newStatus: status,
          confidenceBefore: exception.confidenceScore,
          confidenceAfter: 100,
        },
      });
    }

    return NextResponse.json({ success: true, exception: updated });
  } catch (error) {
    console.error("Status update error:", error);
    return NextResponse.json(
      { error: "Failed to update status" },
      { status: 500 }
    );
  }
}