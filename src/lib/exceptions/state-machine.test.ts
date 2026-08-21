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
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name} — ${(err as Error).message}`);
  }
}

console.log("\nException Workflow State Machine — pure logic tests");

// ── Enum integrity ──
check("exposes exactly the 7 required states", () => {
  assert.deepEqual([...WORKFLOW_STATES].sort(), [
    "ESCALATED",
    "INVESTIGATING",
    "OPEN",
    "PENDING_APPROVAL",
    "REJECTED",
    "REOPENED",
    "RESOLVED",
  ].sort());
});

// ── Every valid transition ──
const VALID: Array<[WorkflowState, WorkflowState]> = [
  ["OPEN", "INVESTIGATING"],
  ["OPEN", "ESCALATED"],
  ["INVESTIGATING", "PENDING_APPROVAL"],
  ["INVESTIGATING", "ESCALATED"],
  ["PENDING_APPROVAL", "RESOLVED"],
  ["PENDING_APPROVAL", "REJECTED"],
  ["REJECTED", "INVESTIGATING"],
  ["ESCALATED", "RESOLVED"],
  ["ESCALATED", "INVESTIGATING"],
  ["RESOLVED", "REOPENED"],
  ["REOPENED", "INVESTIGATING"],
];
for (const [from, to] of VALID) {
  check(`valid: ${from} -> ${to}`, () => {
    assert.equal(canTransition(from, to), true);
    assert.doesNotThrow(() => assertValidTransition(from, to));
  });
}

// ── Key invalid transitions ──
const INVALID: Array<[WorkflowState, WorkflowState]> = [
  ["OPEN", "RESOLVED"], // AI/human shortcut to terminal — forbidden
  ["OPEN", "PENDING_APPROVAL"],
  ["OPEN", "REJECTED"],
  ["OPEN", "REOPENED"],
  ["RESOLVED", "OPEN"],
  ["RESOLVED", "PENDING_APPROVAL"],
  ["RESOLVED", "INVESTIGATING"],
  ["REJECTED", "RESOLVED"],
  ["REJECTED", "REOPENED"],
  ["REOPENED", "RESOLVED"],
  ["INVESTIGATING", "RESOLVED"],
  ["PENDING_APPROVAL", "OPEN"],
  ["ESCALATED", "REJECTED"],
];
for (const [from, to] of INVALID) {
  check(`invalid: ${from} -> ${to} rejected`, () => {
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
check("getAllowedTransitions(PENDING_APPROVAL) = [RESOLVED, REJECTED]", () => {
  assert.deepEqual(getAllowedTransitions("PENDING_APPROVAL"), ["RESOLVED", "REJECTED"]);
});
check("getAllowedTransitions(RESOLVED) = [REOPENED]", () => {
  assert.deepEqual(getAllowedTransitions("RESOLVED"), ["REOPENED"]);
});

// ── isWorkflowState ──
check("isWorkflowState rejects arbitrary strings", () => {
  assert.equal(isWorkflowState("OPEN"), true);
  assert.equal(isWorkflowState("MANUAL_REVIEW"), false);
  assert.equal(isWorkflowState("AMOUNT_MISMATCH"), false);
  assert.equal(isWorkflowState(""), false);
});

// ── Financial-safety invariants at the machine level ──
check("NO path reaches RESOLVED without an explicit approval/review step", () => {
  // RESOLVED is only reachable from PENDING_APPROVAL or ESCALATED.
  const sourcesOfResolved = WORKFLOW_STATES.filter(
    (s) => (WORKFLOW_TRANSITIONS[s] as readonly string[]).includes("RESOLVED")
  );
  assert.deepEqual([...sourcesOfResolved].sort(), ["ESCALATED", "PENDING_APPROVAL"].sort());
});
check("OPEN has no terminal/shortcut exits", () => {
  const opensTo = WORKFLOW_TRANSITIONS["OPEN"] as readonly string[];
  assert.ok(!opensTo.includes("RESOLVED"));
  assert.ok(!opensTo.includes("REJECTED"));
});

console.log(`\nstate-machine: ${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
