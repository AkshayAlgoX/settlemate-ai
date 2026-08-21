import { NextRequest, NextResponse } from "next/server";
import {
  transitionException,
  ExceptionNotFoundError,
  InvalidWorkflowStateError,
  WorkflowConflictError,
} from "@/lib/exceptions/service";
import { InvalidTransitionError } from "@/lib/exceptions/state-machine";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    let body: { status?: unknown; reason?: unknown; resolution?: unknown; actor?: unknown } = {};
    try {
      body = await req.json();
    } catch {
      // Malformed JSON → treated as a missing body below.
    }

    const { status, reason, resolution, actor } = body;
    if (typeof status !== "string" || !status.trim()) {
      return NextResponse.json({ error: "Missing status" }, { status: 400 });
    }

    const result = await transitionException({
      exceptionId: id,
      toState: status,
      actor: typeof actor === "string" && actor.trim() ? actor.trim() : "USER",
      reason: typeof reason === "string" ? reason : undefined,
      resolution: typeof resolution === "string" ? resolution : undefined,
    });

    if (result.idempotent) {
      return NextResponse.json({
        success: true,
        idempotent: true,
        exceptionId: id,
        status,
      });
    }

    return NextResponse.json({ success: true, exception: result.exception });
  } catch (error) {
    if (error instanceof InvalidWorkflowStateError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof ExceptionNotFoundError) {
      return NextResponse.json({ error: "Exception not found" }, { status: 404 });
    }
    if (error instanceof InvalidTransitionError) {
      return NextResponse.json(
        { error: `Invalid transition: ${error.from} -> ${error.to}` },
        { status: 409 }
      );
    }
    if (error instanceof WorkflowConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    console.error("Status update error:", error);
    return NextResponse.json(
      { error: "Failed to update exception status" },
      { status: 500 }
    );
  }
}