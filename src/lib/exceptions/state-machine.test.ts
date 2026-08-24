import assert from "node:assert/strict";
import {
  WORKFLOW_STATES,
  WORKFLOW_TRANSITIONS,
  canTransition,
  assertValidTransition,
  getAllowedTransitions,
  isWorkflowState,
  InvalidTransitionError,
  type WorkflowState,
} from "./state-machine";

let passed = 0;
let failed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log("  ✓ " + name);
  } catch (err) {
    failed++;
    console.error("  ✗ " + name + " — " + (err as Error).message);
  }
}

console.log("\nException Workflow State Machine — M5 Finance-Ops logic tests");

// ── Enum integrity ──
check("exposes exactly the 13 required states", () => {
  assert.deepEqual([...WORKFLOW_STATES].sort(), [
    "APPROVED",
    "CORRECTING",
    "ESCALATED",
    "FINALIZABLE",
    "INVESTIGATING",
    "OPEN",
    "PENDING_APPROVAL",
    "RE_CALCULATING",
    "RE_VERIFICATION",
    "REJECTED",
    "REOPENED",
    "RESOLVED",
    "UNRESOLVABLE",
  ].sort());
});

// ── Every valid transition ──
const VALID: Array<[WorkflowState, WorkflowState]> = [
  ["OPEN", "INVESTIGATING"],
  ["OPEN", "ESCALATED"],
  ["INVESTIGATING", "PENDING_APPROVAL"],
  ["INVESTIGATING", "CORRECTING"],
  ["INVESTIGATING", "ESCALATED"],
  ["PENDING_APPROVAL", "APPROVED"],
  ["PENDING_APPROVAL", "REJECTED"],
  ["APPROVED", "CORRECTING"],
  ["APPROVED", "RE_CALCULATING"],
  ["CORRECTING", "RE_CALCULATING"],
  ["RE_CALCULATING", "RE_VERIFICATION"],
  ["RE_VERIFICATION", "FINALIZABLE"],
  ["FINALIZABLE", "RESOLVED"],
  ["RESOLVED", "REOPENED"],
  ["REOPENED", "INVESTIGATING"],
];
for (const [from, to] of VALID) {
  check("valid: " + from + " -> " + to, () => {
    assert.equal(canTransition(from, to), true);
    assert.doesNotThrow(() => assertValidTransition(from, to));
  });
}

// ── Key invalid transitions ──
const INVALID: Array<[WorkflowState, WorkflowState]> = [
  ["OPEN", "RESOLVED"], // shortcut forbidden
  ["OPEN", "FINALIZABLE"],
  ["OPEN", "APPROVED"],
  ["CORRECTING", "RESOLVED"], // shortcut forbidden
  ["APPROVED", "RESOLVED"], // shortcut forbidden
  ["RESOLVED", "OPEN"],
  ["REOPENED", "RESOLVED"],
  ["INVESTIGATING", "RESOLVED"],
];
for (const [from, to] of INVALID) {
  check("invalid: " + from + " -> " + to + " rejected", () => {
    assert.equal(canTransition(from, to), false);
    assert.throws(
      () => assertValidTransition(from, to),
      (e: unknown) => e instanceof InvalidTransitionError
    );
  });
}

// ── getAllowedTransitions ──
check("getAllowedTransitions(OPEN) = [INVESTIGATING, ESCALATED]", () => {
  assert.deepEqual(getAllowedTransitions("OPEN"), ["INVESTIGATING", "ESCALATED"]);
});
check("getAllowedTransitions(FINALIZABLE) = [RESOLVED, ESCALATED]", () => {
  assert.deepEqual(getAllowedTransitions("FINALIZABLE"), ["RESOLVED", "ESCALATED"]);
});
check("getAllowedTransitions(RESOLVED) = [REOPENED]", () => {
  assert.deepEqual(getAllowedTransitions("RESOLVED"), ["REOPENED"]);
});

// ── isWorkflowState ──
check("isWorkflowState rejects arbitrary strings", () => {
  assert.equal(isWorkflowState("OPEN"), true);
  assert.equal(isWorkflowState("FINALIZABLE"), true);
  assert.equal(isWorkflowState("MANUAL_REVIEW"), false);
  assert.equal(isWorkflowState("AMOUNT_MISMATCH"), false);
  assert.equal(isWorkflowState(""), false);
});

// ── Financial-safety invariants at the machine level ──
check("NO path reaches RESOLVED without FINALIZABLE gate", () => {
  const sourcesOfResolved = WORKFLOW_STATES.filter(
    (s) => (WORKFLOW_TRANSITIONS[s] as readonly string[]).includes("RESOLVED")
  );
  assert.deepEqual([...sourcesOfResolved].sort(), ["FINALIZABLE"].sort());
});

check("OPEN has no terminal/shortcut exits", () => {
  const opensTo = WORKFLOW_TRANSITIONS["OPEN"] as readonly string[];
  assert.ok(!opensTo.includes("RESOLVED"));
  assert.ok(!opensTo.includes("FINALIZABLE"));
});

console.log("\nstate-machine: " + passed + " passed, " + failed + " failed\n");
if (failed > 0) process.exit(1);
