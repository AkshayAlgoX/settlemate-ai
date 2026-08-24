/*
 * SettleMate AI — Finance-Ops Closure Loop Unit Tests (M5)
 */

import assert from "node:assert/strict";
import {
  canTransition,
  assertValidTransition,
} from "./state-machine";
import { CorrectionManager } from "./correction";

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log("  ✓ " + name);
  } catch (err) {
    console.error("  ✗ " + name + " — " + (err as Error).message);
    throw err;
  }
}

async function runTests() {
  console.log("\n=========================================================================");
  console.log(" SETTLEMATE AI — FINANCE-OPS CLOSURE LOOP & GOVERNANCE TESTS (M5)");
  console.log("=========================================================================\n");

  const manager = new CorrectionManager();

  await test("1. Complete State Machine Sequence: OPEN -> INVESTIGATING -> PENDING_APPROVAL -> APPROVED -> CORRECTING -> RE_CALCULATING -> RE_VERIFICATION -> FINALIZABLE -> RESOLVED", () => {
    assert.equal(canTransition("OPEN", "INVESTIGATING"), true);
    assert.equal(canTransition("INVESTIGATING", "PENDING_APPROVAL"), true);
    assert.equal(canTransition("PENDING_APPROVAL", "APPROVED"), true);
    assert.equal(canTransition("APPROVED", "CORRECTING"), true);
    assert.equal(canTransition("CORRECTING", "RE_CALCULATING"), true);
    assert.equal(canTransition("RE_CALCULATING", "RE_VERIFICATION"), true);
    assert.equal(canTransition("RE_VERIFICATION", "FINALIZABLE"), true);
    assert.equal(canTransition("FINALIZABLE", "RESOLVED"), true);
  });

  await test("2. Safety Guards: Prohibit shortcuts from OPEN -> RESOLVED, CORRECTING -> RESOLVED, and APPROVED -> RESOLVED", () => {
    assert.equal(canTransition("OPEN", "RESOLVED"), false);
    assert.equal(canTransition("CORRECTING", "RESOLVED"), false);
    assert.equal(canTransition("APPROVED", "RESOLVED"), false);

    assert.throws(
      () => assertValidTransition("OPEN", "RESOLVED"),
      /Invalid workflow transition: OPEN -> RESOLVED/
    );
  });

  await test("3. Correction Proposal Creation & Financial Impact Preview Calculation", () => {
    const proposal = manager.proposeCorrection({
      exceptionId: "exc_demo_101",
      makerId: "OPERATOR_ALICE",
      actionType: "ATTACH_REFUND",
      reason: "Customer was refunded ₹1,550 on gateway",
      evidenceIds: ["ev_refund_101"],
      adjustmentPaise: 155000,
      refundId: "ref_101",
      grossAmountPaise: 2000000, // ₹20,000
      feePaise: 40000,           // ₹400
      taxPaise: 7200,            // ₹72
      refundPaise: 155000,       // ₹1,550
      actualSettledPaise: 1797800, // Net: 20,000 - 400 - 72 - 1,550 = 17,978
    });

    assert.equal(proposal.status, "PENDING_CHECKER");
    assert.equal(proposal.impactPreview.expectedNetPaise, 1797800);
    assert.equal(proposal.impactPreview.variancePaise, 0);
  });

  await test("4. Maker/Checker Separation: Maker cannot approve their own correction proposal", () => {
    const proposal = manager.proposeCorrection({
      exceptionId: "exc_demo_102",
      makerId: "OPERATOR_ALICE",
      actionType: "FORCE_MATCH",
      reason: "Timing window exception approved",
      evidenceIds: ["ev_doc_102"],
      adjustmentPaise: 0,
      grossAmountPaise: 100000,
      feePaise: 2000,
      taxPaise: 360,
      actualSettledPaise: 97640,
    });

    // Maker tries to approve own proposal -> Must throw
    assert.throws(
      () => manager.reviewCorrection({
        correctionId: proposal.correctionId,
        checkerId: "OPERATOR_ALICE",
        action: "APPROVE",
      }),
      /Separation of duties violation/
    );

    // Independent Checker approves -> Succeeds
    const reviewed = manager.reviewCorrection({
      correctionId: proposal.correctionId,
      checkerId: "SUPERVISOR_BOB",
      action: "APPROVE",
    });
    assert.equal(reviewed.status, "APPROVED");
    assert.equal(reviewed.checkerId, "SUPERVISOR_BOB");
  });

  await test("5. Deterministic Re-verification catches faulty arithmetic and returns CONTROL_FAILURE", () => {
    // Propose faulty correction where money conservation fails
    const faultyProposal = manager.proposeCorrection({
      exceptionId: "exc_faulty_math",
      makerId: "OPERATOR_CAROL",
      actionType: "ADJUST_FEE",
      reason: "Adjusted fee incorrectly",
      evidenceIds: ["ev_faulty_1"],
      adjustmentPaise: 50000,
      grossAmountPaise: 2000000,
      feePaise: 40000,
      taxPaise: 7200,
      refundPaise: 0, // Ignores refund
      actualSettledPaise: 1800000, // Discrepancy of 1528 INR
    });

    manager.reviewCorrection({
      correctionId: faultyProposal.correctionId,
      checkerId: "SUPERVISOR_BOB",
      action: "APPROVE",
    });

    const { invariantResult, nextState } = manager.recalculateAndVerify(faultyProposal.correctionId);

    assert.equal(invariantResult.status, "CONTROL_FAILURE");
    assert.equal(invariantResult.checks.moneyConservation, false);
    assert.equal(nextState, "CORRECTING");

    // System strictly refuses finalization on failed re-verification
    assert.throws(
      () => manager.finalizeToLedger({
        exceptionId: "exc_faulty_math",
        correctionId: faultyProposal.correctionId,
        actorId: "CONTROLLER",
        currentState: "CORRECTING",
      }),
      /Cannot finalize exception/
    );
  });

  await test("6. Valid Re-verification passes all 6 invariants and transitions to FINALIZABLE", () => {
    const validProposal = manager.proposeCorrection({
      exceptionId: "exc_valid_flow",
      makerId: "OPERATOR_ALICE",
      actionType: "ATTACH_REFUND",
      reason: "Attached processed refund evidence",
      evidenceIds: ["ev_ref_valid"],
      adjustmentPaise: 155000,
      refundId: "ref_valid_1",
      grossAmountPaise: 2000000,
      feePaise: 40000,
      taxPaise: 7200,
      refundPaise: 155000,
      actualSettledPaise: 1797800,
    });

    manager.reviewCorrection({
      correctionId: validProposal.correctionId,
      checkerId: "SUPERVISOR_BOB",
      action: "APPROVE",
    });

    const { invariantResult, nextState } = manager.recalculateAndVerify(validProposal.correctionId);

    assert.equal(invariantResult.status, "PASSED");
    assert.equal(invariantResult.checks.moneyConservation, true);
    assert.equal(invariantResult.checks.completeness, true);
    assert.equal(nextState, "FINALIZABLE");

    // Finalize to Ledger
    const finalization = manager.finalizeToLedger({
      exceptionId: "exc_valid_flow",
      correctionId: validProposal.correctionId,
      actorId: "CONTROLLER_ADMIN",
      currentState: "FINALIZABLE",
    });

    assert.equal(finalization.success, true);
    assert.equal(finalization.finalState, "RESOLVED");
    assert.ok(finalization.ledgerEntryId.startsWith("ldg_corr_"));
  });

  await test("7. Bounded Retry Escalation: Exceeding 3 failed attempts escalates to UNRESOLVABLE", () => {
    const repeatedProposal = manager.proposeCorrection({
      exceptionId: "exc_retry_test",
      makerId: "OPERATOR_ALICE",
      actionType: "FORCE_MATCH",
      reason: "Attempting unresolvable match",
      evidenceIds: ["ev_1"],
      adjustmentPaise: 0,
      grossAmountPaise: 100000,
      feePaise: 0,
      taxPaise: 0,
      actualSettledPaise: 50000, // 50% mismatch
    });

    // Attempt 1 -> CORRECTING
    const r1 = manager.recalculateAndVerify(repeatedProposal.correctionId);
    assert.equal(r1.nextState, "CORRECTING");

    // Attempt 2 -> CORRECTING
    const r2 = manager.recalculateAndVerify(repeatedProposal.correctionId);
    assert.equal(r2.nextState, "CORRECTING");

    // Attempt 3 -> UNRESOLVABLE
    const r3 = manager.recalculateAndVerify(repeatedProposal.correctionId);
    assert.equal(r3.nextState, "UNRESOLVABLE");
  });

  await test("8. Idempotent Finalization: Duplicate finalization calls produce exact same ledger entry", () => {
    const p = manager.proposeCorrection({
      exceptionId: "exc_idempotent",
      makerId: "MAKER_1",
      actionType: "ATTACH_REFUND",
      reason: "Refund attached",
      evidenceIds: ["ev_idemp"],
      adjustmentPaise: 0,
      grossAmountPaise: 100000,
      feePaise: 2000,
      taxPaise: 360,
      actualSettledPaise: 97640,
    });
    manager.reviewCorrection({ correctionId: p.correctionId, checkerId: "CHECKER_2", action: "APPROVE" });
    manager.recalculateAndVerify(p.correctionId);

    const f1 = manager.finalizeToLedger({
      exceptionId: "exc_idempotent",
      correctionId: p.correctionId,
      actorId: "ADMIN",
      currentState: "FINALIZABLE",
    });

    const f2 = manager.finalizeToLedger({
      exceptionId: "exc_idempotent",
      correctionId: p.correctionId,
      actorId: "ADMIN",
      currentState: "FINALIZABLE",
    });

    assert.equal(f1.ledgerEntryId, f2.ledgerEntryId);
    assert.equal(f1.idempotencyKey, f2.idempotencyKey);
  });

  console.log("\nfinance-ops-closure: ALL 8 TESTS PASSED\n");
}

void runTests();
