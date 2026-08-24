/*
 * SettleMate AI — Exception Workflow State Machine (M5 Complete Finance-Ops Loop)
 *
 * Implements strict, non-lattice workflow states with explicit governance gates.
 * Prohibits shortcuts from OPEN -> RESOLVED, CORRECTING -> RESOLVED, and APPROVED -> LEDGER.
 * Finalization strictly requires passing deterministic re-verification.
 */

export const WORKFLOW_STATES = [
  "OPEN",
  "INVESTIGATING",
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "CORRECTING",
  "RE_CALCULATING",
  "RE_VERIFICATION",
  "FINALIZABLE",
  "RESOLVED",
  "ESCALATED",
  "UNRESOLVABLE",
  "REOPENED",
] as const;

export type WorkflowState = (typeof WORKFLOW_STATES)[number];

// Allowed transitions, from -> [to...]. Anything not listed is strictly rejected.
export const WORKFLOW_TRANSITIONS: Record<WorkflowState, readonly WorkflowState[]> = {
  OPEN: ["INVESTIGATING", "ESCALATED"],
  INVESTIGATING: ["PENDING_APPROVAL", "CORRECTING", "ESCALATED"],
  PENDING_APPROVAL: ["APPROVED", "REJECTED", "ESCALATED"],
  REJECTED: ["INVESTIGATING", "CORRECTING", "ESCALATED"],
  APPROVED: ["CORRECTING", "RE_CALCULATING"],
  CORRECTING: ["RE_CALCULATING", "ESCALATED"],
  RE_CALCULATING: ["RE_VERIFICATION", "ESCALATED"],
  RE_VERIFICATION: ["FINALIZABLE", "CORRECTING", "ESCALATED", "UNRESOLVABLE"],
  FINALIZABLE: ["RESOLVED", "ESCALATED"],
  ESCALATED: ["INVESTIGATING", "UNRESOLVABLE"],
  UNRESOLVABLE: ["INVESTIGATING"], // Controller override only
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
    super("Invalid workflow transition: " + from + " -> " + to);
    this.name = "InvalidTransitionError";
    this.from = from;
    this.to = to;
  }
}

export function assertValidTransition(from: WorkflowState, to: WorkflowState): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}
