import { prisma } from "@/lib/db";
import {
  assertValidTransition,
  isWorkflowState,
  InvalidTransitionError,
  type WorkflowState,
} from "./state-machine";

// ── Typed domain errors (mapped to HTTP codes by the route) ──
export class ExceptionNotFoundError extends Error {
  constructor(id: string) {
    super(`Exception ${id} not found`);
    this.name = "ExceptionNotFoundError";
  }
}

export class InvalidWorkflowStateError extends Error {
  constructor(state: string) {
    super(`Invalid workflow state: ${state}`);
    this.name = "InvalidWorkflowStateError";
  }
}

export class WorkflowConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowConflictError";
  }
}

export interface TransitionExceptionInput {
  exceptionId: string;
  toState: string; // from the client; validated against the state machine
  actor: string;
  reason?: string | null;
  resolution?: string | null;
}

export interface TransitionResult {
  success: boolean;
  idempotent: boolean;
  fromState: WorkflowState;
  toState: WorkflowState;
  exception: {
    id: string;
    status: string;
    resolution: string | null;
    resolvedBy: string | null;
    resolvedAt: Date | null;
  } | null;
}

/**
 * Transition an exception's workflow state.
 *
 * Safety guarantees:
 *  - The current state is read from the DB; the client-provided value is only
 *    ever the TARGET. The client never supplies `fromState`.
 *  - The transition is validated against the state machine before any write.
 *  - The write is an atomic compare-and-swap on the status column inside a
 *    transaction, so two concurrent requests that both read the same state
 *    cannot both succeed (one wins; the other conflicts).
 *  - A failed or rejected transition never mutates data.
 *  - A same-state request is a safe, idempotent no-op (no mutation, no audit).
 */
export async function transitionException(
  input: TransitionExceptionInput
): Promise<TransitionResult> {
  const toState = input.toState.trim() as WorkflowState;
  if (!isWorkflowState(toState)) {
    throw new InvalidWorkflowStateError(input.toState);
  }
  const actor = input.actor || "USER";

  // 1. Read current workflow state from DB — never trust the client for `from`.
  const current = await prisma.exception.findUnique({
    where: { id: input.exceptionId },
    select: {
      id: true,
      status: true,
      batchId: true,
      confidenceScore: true,
    },
  });
  if (!current) throw new ExceptionNotFoundError(input.exceptionId);

  const fromState = current.status as WorkflowState;

  // 2. Same-state → idempotent no-op (no mutation, no duplicate audit event).
  if (fromState === toState) {
    return {
      success: true,
      idempotent: true,
      fromState,
      toState,
      exception: null,
    };
  }

  // 3. Validate the transition BEFORE any write.
  assertValidTransition(fromState, toState); // throws InvalidTransitionError

  // 3.5. Financial safety: AI actors cannot resolve exceptions.
// Resolution requires human approval through PENDING_APPROVAL.
if (actor.toUpperCase() === "AI" && toState === "RESOLVED") {
  throw new InvalidTransitionError(fromState, toState);
  // Reusing InvalidTransitionError because the effect is the same:
  // the transition is not permitted for this actor.
}

  // 4. Perform the transition atomically.
  return prisma.$transaction(async (tx) => {
    const data: {
      status: WorkflowState;
      resolution?: string | null;
      resolvedBy?: string | null;
      resolvedAt?: Date | null;
    } = { status: toState };

    // Terminal state carries resolution metadata.
    if (toState === "RESOLVED") {
      data.resolution = input.resolution ?? null;
      data.resolvedBy = actor;
      data.resolvedAt = new Date();
    } else if (fromState === "RESOLVED" && toState === "REOPENED") {
      // Reopening a resolved case clears its resolution metadata.
      data.resolution = null;
      data.resolvedBy = null;
      data.resolvedAt = null;
    }

    // Compare-and-swap on the status column. If another request changed the
    // state between our read and this update, the WHERE clause no longer
    // matches and zero rows are affected → conflict (transaction aborts).
    const updated = await tx.exception.updateMany({
      where: { id: input.exceptionId, status: fromState },
      data,
    });
    if (updated.count !== 1) {
      throw new WorkflowConflictError("Exception state changed concurrently");
    }

    // Successful transition → audit record (always).
    await tx.auditLog.create({
      data: {
        batchId: current.batchId,
        actor,
        action: "WORKFLOW_TRANSITION",
        entityType: "exception",
        entityId: input.exceptionId,
        beforeState: JSON.stringify({ status: fromState }),
        afterState: JSON.stringify({ status: toState }),
        reason: input.reason || `Workflow transitioned ${fromState} -> ${toState}`,
      },
    });

    // Preserve the learning-loop signal when a case is closed.
    if (toState === "RESOLVED") {
      await tx.feedbackEntry.create({
        data: {
          batchId: current.batchId,
          exceptionId: input.exceptionId,
          originalStatus: fromState,
          newStatus: toState,
          confidenceBefore: current.confidenceScore,
          confidenceAfter: 100,
        },
      });
    }

    const final = await tx.exception.findUnique({
      where: { id: input.exceptionId },
      select: {
        id: true,
        status: true,
        resolution: true,
        resolvedBy: true,
        resolvedAt: true,
      },
    });

    return {
      success: true,
      idempotent: false,
      fromState,
      toState,
      exception: final,
    };
  });
}
