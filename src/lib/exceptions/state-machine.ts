// ── Exception Workflow State Machine ──
//
// WORKFLOW STATE (Exception.status) describes WHERE an investigation is.
// This is distinct from reconciliation CLASSIFICATION (Exception.exceptionType),
// which describes WHAT happened. The two are independent concerns:
//   - exceptionType: AMOUNT_MISMATCH, MISSING_BANK_CREDIT, ...  (never changes here)
//   - status:        OPEN, INVESTIGATING, PENDING_APPROVAL, ... (driven by this module)
//
// Financial safety: the machine is intentionally NOT a full lattice. There is
// NO path from OPEN (or INVESTIGATING / PENDING_APPROVAL) directly to any
// terminal state other than the allowed ones below, and no AI-driven path may
// reach RESOLVED without passing through an explicit human workflow step.

export const WORKFLOW_STATES = [
  "OPEN",
  "INVESTIGATING",
  "PENDING_APPROVAL",
  "ESCALATED",
  "RESOLVED",
  "REJECTED",
  "REOPENED",
] as const;

export type WorkflowState = (typeof WORKFLOW_STATES)[number];

// Allowed transitions, from → [to...]. Anything not listed is rejected.
export const WORKFLOW_TRANSITIONS: Record<WorkflowState, readonly WorkflowState[]> = {
  OPEN: ["INVESTIGATING", "ESCALATED"],
  INVESTIGATING: ["PENDING_APPROVAL", "ESCALATED"],
  PENDING_APPROVAL: ["RESOLVED", "REJECTED"],
  REJECTED: ["INVESTIGATING"],
  ESCALATED: ["INVESTIGATING"],
  RESOLVED: ["REOPENED"],
  REOPENED: ["INVESTIGATING"],
};

export function isWorkflowState(value: string): value is WorkflowState {
  return (WORKFLOW_STATES as readonly string[]).includes(value);
}

export function getAllowedTransitions(from: WorkflowState): WorkflowState[] {
  return [...WORKFLOW_TRANSITIONS[from]];
}

export function canTransition(from: WorkflowState, to: WorkflowState): boolean {
  return WORKFLOW_TRANSITIONS[from]?.includes(to) ?? false;
}

export class InvalidTransitionError extends Error {
  readonly from: WorkflowState;
  readonly to: WorkflowState;

  constructor(from: WorkflowState, to: WorkflowState) {
    super(`Invalid workflow transition: ${from} -> ${to}`);
    this.name = "InvalidTransitionError";
    this.from = from;
    this.to = to;
  }
}

// Throws InvalidTransitionError when the transition is not permitted.
export function assertValidTransition(from: WorkflowState, to: WorkflowState): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}
