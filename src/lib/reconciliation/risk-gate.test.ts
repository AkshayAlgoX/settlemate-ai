/*
 * Risk Gate — pure unit tests for routing + the corrective path.
 *
 * Required scenarios covered:
 *   1. low-risk auto finalization
 *   2. medium review
 *   3. high mandatory approval
 *   4. failed invariant (CRITICAL always blocks; never confidence-downgraded)
 *   5. successful correction + re-verification
 *   6. repeated failed correction -> escalation (MAX_CORRECTION_ATTEMPTS)
 *   7. AI cannot finalize
 *
 * No DB, no I/O.
 */

import assert from "node:assert/strict";
import {
  evaluateGate,
  evaluateCorrectionCycle,
  correctiveEndState,
  canFinalize,
  MAX_CORRECTION_ATTEMPTS,
} from "./risk-gate";
import type { DecisionReport, RiskLevel } from "./decision";
import type { InvariantReport } from "./invariants";

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

console.log("\nRisk Gate — pure routing + corrective-path tests");

function report(
  maxRisk: RiskLevel,
  highRiskCount = 0,
  mediumRiskCount = 0,
): DecisionReport {
  return {
    decisions: [],
    aggregate: {
      total: 0,
      autoMatched: 0,
      suggestedMatches: 0,
      exceptions: 0,
      byOutcome: { AUTO_MATCHED: 0, SUGGESTED_MATCH: 0, EXCEPTION: 0 },
      byRisk: { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 },
      lowRiskCount: 0,
      mediumRiskCount,
      highRiskCount,
      amountAtRisk: 0,
      aggregateExposurePaise: 0,
      novelCount: 0,
      maxRisk,
    },
  };
}

function passingInvariants(): InvariantReport {
  return { passed: true, failures: [], checkedCounts: {}, checkedAmounts: {} };
}

function failingInvariants(): InvariantReport {
  return {
    passed: false,
    failures: [
      {
        code: "INVARIANT_MONEY_CONSERVATION",
        reason: "Sum of expectedNetAmount does not reconcile.",
        expected: 1000,
        actual: 900,
        tolerance: 100,
      },
    ],
    checkedCounts: {},
    checkedAmounts: {},
  };
}

// 1. LOW → straight-through auto finalization
check("low-risk report routes STRAIGHT_THROUGH (auto finalization)", () => {
  const v = evaluateGate(report("LOW"), passingInvariants(), 0);
  assert.equal(v.routing, "STRAIGHT_THROUGH");
  assert.equal(v.riskLevel, "LOW");
  assert.equal(v.escalated, false);
  assert.equal(v.endState, null);
});

// 2. MEDIUM → controlled review
check("medium-risk report routes CONTROLLED_REVIEW", () => {
  const v = evaluateGate(report("MEDIUM", 0, 3), passingInvariants(), 0);
  assert.equal(v.routing, "CONTROLLED_REVIEW");
  assert.equal(v.riskLevel, "MEDIUM");
});

// 3. HIGH → mandatory maker/checker
check("high-risk report routes MAKER_CHECKER_REQUIRED (mandatory approval)", () => {
  const v = evaluateGate(report("HIGH", 2, 0), passingInvariants(), 0);
  assert.equal(v.routing, "MAKER_CHECKER_REQUIRED");
  assert.equal(v.riskLevel, "HIGH");
});

check("a single high-risk decision forces maker/checker even with low count", () => {
  const v = evaluateGate(report("MEDIUM", 1, 5), passingInvariants(), 0);
  assert.equal(v.routing, "MAKER_CHECKER_REQUIRED");
});

// 4. Failed invariant → CRITICAL always blocks, never confidence-downgraded
check("failed invariant routes CRITICAL_BLOCKED regardless of report risk", () => {
  for (const maxRisk of ["LOW", "MEDIUM", "HIGH"] as RiskLevel[]) {
    const v = evaluateGate(report(maxRisk), failingInvariants(), 0);
    assert.equal(v.routing, "CRITICAL_BLOCKED", maxRisk);
    assert.equal(v.riskLevel, "CRITICAL", maxRisk);
  }
});

check("CRITICAL is never downgraded to LOW/MEDIUM/HIGH by confidence", () => {
  // An all-LOW, high-confidence report still cannot pass a failing invariant.
  const v = evaluateGate(report("LOW", 0, 0), failingInvariants(), 0);
  assert.equal(v.riskLevel, "CRITICAL");
  assert.notEqual(v.routing, "STRAIGHT_THROUGH");
});

// 5. Successful correction + re-verification
check("correction cycle: failing invariants block; a fix + re-verify passes", () => {
  const low = report("LOW");
  const fail = evaluateCorrectionCycle({
    decisionReport: low,
    invariantsPass: false,
    riskLevel: "CRITICAL",
    attempt: 1,
  });
  assert.equal(fail.routing, "CRITICAL_BLOCKED");
  assert.equal(fail.riskLevel, "CRITICAL");
  assert.equal(fail.escalated, false);

  // Corrective action applied; re-run now passes invariants with all-LOW risk.
  const pass = evaluateCorrectionCycle({
    decisionReport: low,
    invariantsPass: true,
    riskLevel: "LOW",
    attempt: 2,
  });
  assert.equal(pass.routing, "STRAIGHT_THROUGH");
  assert.equal(pass.riskLevel, "LOW");
});

check("correction cycle: risk that remains HIGH after re-verify still needs maker/checker", () => {
  const v = evaluateCorrectionCycle({
    decisionReport: report("HIGH", 1, 0),
    invariantsPass: true,
    riskLevel: "HIGH",
    attempt: 2,
  });
  assert.equal(v.routing, "MAKER_CHECKER_REQUIRED");
});

// 6. Repeated failed correction → escalation after MAX_CORRECTION_ATTEMPTS
check("correctiveEndState returns null within the attempt budget", () => {
  for (let attempt = 1; attempt <= MAX_CORRECTION_ATTEMPTS; attempt++) {
    assert.equal(correctiveEndState(attempt, "CRITICAL"), null);
  }
});

check("correctiveEndState escalates CRITICAL/HIGH to ESCALATED_TO_CONTROLLER past the budget", () => {
  assert.equal(
    correctiveEndState(MAX_CORRECTION_ATTEMPTS + 1, "CRITICAL"),
    "ESCALATED_TO_CONTROLLER",
  );
  assert.equal(
    correctiveEndState(MAX_CORRECTION_ATTEMPTS + 1, "HIGH"),
    "ESCALATED_TO_CONTROLLER",
  );
});

check("correctiveEndState escalates MEDIUM/LOW to PERMANENTLY_BLOCKED_PENDING_REVIEW past the budget", () => {
  assert.equal(
    correctiveEndState(MAX_CORRECTION_ATTEMPTS + 1, "MEDIUM"),
    "PERMANENTLY_BLOCKED_PENDING_REVIEW",
  );
});

check("repeated failed correction cycles escalate only after the cap", () => {
  const low = report("LOW");
  for (let attempt = 1; attempt <= MAX_CORRECTION_ATTEMPTS; attempt++) {
    const v = evaluateCorrectionCycle({
      decisionReport: low,
      invariantsPass: false,
      riskLevel: "CRITICAL",
      attempt,
    });
    assert.equal(v.routing, "CRITICAL_BLOCKED");
    assert.equal(v.escalated, false, `attempt ${attempt} not yet escalated`);
    assert.equal(v.endState, null, `attempt ${attempt} has no end state`);
  }

  const beyond = evaluateCorrectionCycle({
    decisionReport: low,
    invariantsPass: false,
    riskLevel: "CRITICAL",
    attempt: MAX_CORRECTION_ATTEMPTS + 1,
  });
  assert.equal(beyond.escalated, true);
  assert.equal(beyond.endState, "ESCALATED_TO_CONTROLLER");
});

// 7. AI cannot finalize
check("AI cannot finalize; Maker/Checker/system/human can", () => {
  assert.equal(canFinalize("AI"), false);
  assert.equal(canFinalize("ai"), false);
  assert.equal(canFinalize("MAKER"), true);
  assert.equal(canFinalize("CHECKER"), true);
  assert.equal(canFinalize("SYSTEM"), true);
  assert.equal(canFinalize("analyst@example.com"), true);
});

console.log(`\nrisk-gate: ${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
