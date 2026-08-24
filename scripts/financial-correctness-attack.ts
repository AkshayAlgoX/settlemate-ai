/*
 * SettleMate AI — 16-Scenario Financial Correctness Adversarial Attack Suite (M7)
 */

import assert from "node:assert/strict";
import {
  findSettlementGroupForBank,
  findBankGroupForSettlement,
  findManyToManyMatch,
} from "../src/lib/reconciliation/cardinality";
import { CorrectionManager } from "../src/lib/exceptions/correction";
import { evaluatePolicy } from "../src/lib/policy/evaluator";
import { DEFAULT_RULES_V1 } from "../src/lib/policy/manager";
import type { NormalizedBankTxn, NormalizedSettlement } from "../src/lib/reconciliation/types";

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log("  ✓ " + name);
  } catch (err) {
    console.error("  ✗ " + name + " — " + (err as Error).message);
    throw err;
  }
}

const BASE_DATE = new Date("2026-08-23T00:00:00Z");

function makeSettlement(id: string, amount: number, utr?: string, date = BASE_DATE): NormalizedSettlement {
  return {
    dbId: "db_" + id,
    settlementId: id,
    paymentId: "pay_" + id,
    amount,
    fee: 0,
    tax: 0,
    utr: utr ?? "UTR_" + id,
    status: "settled",
    settledAt: date,
    createdAt: date,
  };
}

function makeCredit(id: string, amount: number, utr?: string, date = BASE_DATE): NormalizedBankTxn {
  return {
    dbId: "db_" + id,
    txnId: id,
    utr: utr ?? "UTR_" + id,
    amount,
    type: "CREDIT",
    narration: "BANK SETTLEMENT",
    txnDate: date,
    matched: false,
  };
}

export async function runFinancialAttackSuite() {
  console.log("\n=========================================================================");
  console.log(" SETTLEMATE AI — 16-SCENARIO FINANCIAL CORRECTNESS ATTACK SUITE (M7)");
  console.log("=========================================================================\n");

  const closureManager = new CorrectionManager();

  // Scenario 1: Exact N:1 aggregation
  await test("Scenario 1: Exact N:1 settlement aggregation -> Matches 2 settlements to 1 bank credit", () => {
    const s1 = makeSettlement("s1", 25000, "UTR_N1");
    const s2 = makeSettlement("s2", 25000, "UTR_N1");
    const c1 = makeCredit("c1", 50000, "UTR_N1");

    const match = findSettlementGroupForBank([s1, s2], c1);
    assert.ok(match != null);
    assert.equal(match.type, "N:1");
    assert.equal(match.settlementIds.length, 2);
  });

  // Scenario 2: Exact 1:N split settlement
  await test("Scenario 2: Exact 1:N bank credit aggregation -> Matches 1 settlement to 2 bank deposits", () => {
    const s1 = makeSettlement("s1", 50000, "UTR_1N");
    const c1 = makeCredit("c1", 30000, "UTR_1N");
    const c2 = makeCredit("c2", 20000, "UTR_1N");

    const match = findBankGroupForSettlement(s1, [c1, c2]);
    assert.ok(match != null);
    assert.equal(match.type, "1:N");
    assert.equal(match.bankTxnIds.length, 2);
  });

  // Scenario 3: Incorrect UTR in N:1 aggregation
  await test("Scenario 3: Tolerance-aware N:1 aggregation without exact UTR match", () => {
    const s1 = makeSettlement("s1", 25000, "UTR_A");
    const s2 = makeSettlement("s2", 25000, "UTR_B");
    const c1 = makeCredit("c1", 50000, "UTR_BANK");

    const match = findSettlementGroupForBank([s1, s2], c1);
    assert.ok(match != null);
    assert.equal(match.differencePaise, 0);
  });

  // Scenario 4: Conflicting Amount in N:1 aggregation
  await test("Scenario 4: Conflicting amount in N:1 aggregation -> Refuses false positive match", () => {
    const s1 = makeSettlement("s1", 25000, "UTR_CONFLICT");
    const s2 = makeSettlement("s2", 25000, "UTR_CONFLICT");
    const c1 = makeCredit("c1", 75000, "UTR_CONFLICT");

    const match = findSettlementGroupForBank([s1, s2], c1);
    assert.equal(match, null);
  });

  // Scenario 5: Refund after settlement
  await test("Scenario 5: Refund after settlement -> Proposes adjustment and passes money conservation", () => {
    const p = closureManager.proposeCorrection({
      exceptionId: "exc_post_settle_ref",
      makerId: "OPERATOR_ALICE",
      actionType: "ATTACH_REFUND",
      reason: "Customer refunded after settlement batch processed",
      evidenceIds: ["ev_refund_post"],
      adjustmentPaise: 155000,
      refundId: "ref_post_1",
      grossAmountPaise: 2000000,
      feePaise: 40000,
      taxPaise: 7200,
      refundPaise: 155000,
      actualSettledPaise: 1797800,
    });

    closureManager.reviewCorrection({
      correctionId: p.correctionId,
      checkerId: "SUPERVISOR_BOB",
      action: "APPROVE",
    });

    const verify = closureManager.recalculateAndVerify(p.correctionId);
    assert.equal(verify.invariantResult.status, "PASSED");
    assert.equal(verify.nextState, "FINALIZABLE");
  });

  // Scenario 6: Refund before settlement
  await test("Scenario 6: Refund before settlement -> Net deducted payout matches bank credit", () => {
    const s1 = makeSettlement("s1", 100000, "UTR_DED");
    const s2 = makeSettlement("s2", 84500, "UTR_DED");
    const c1 = makeCredit("c1", 184500, "UTR_DED");

    const match = findSettlementGroupForBank([s1, s2], c1);
    assert.ok(match != null);
    assert.equal(match.settlementAmount, 184500);
  });

  // Scenario 7: Chargeback after payout
  await test("Scenario 7: Chargeback after payout -> Flagged with variance and requires review", () => {
    const p = closureManager.proposeCorrection({
      exceptionId: "exc_cb_payout",
      makerId: "OPERATOR_ALICE",
      actionType: "FORCE_MATCH",
      reason: "Unaccounted chargeback clawback",
      evidenceIds: ["ev_cb_doc"],
      adjustmentPaise: 0,
      grossAmountPaise: 100000,
      feePaise: 0,
      taxPaise: 0,
      chargebackPaise: 0,
      actualSettledPaise: 80000,
    });

    closureManager.reviewCorrection({
      correctionId: p.correctionId,
      checkerId: "SUPERVISOR_BOB",
      action: "APPROVE",
    });

    const verify = closureManager.recalculateAndVerify(p.correctionId);
    assert.equal(verify.invariantResult.status, "CONTROL_FAILURE");
  });

  // Scenario 8: Policy Materiality & Mismatch Threshold
  await test("Scenario 8: Materiality mismatch -> Policy routes directly to EXCEPTION", () => {
    const evalRes = evaluatePolicy(
      {
        policyId: "pol_test",
        version: "1.0.0",
        status: "ACTIVE",
        createdBy: "ADMIN",
        createdAt: new Date(),
        providerScope: ["*"],
        currencyScope: ["INR"],
        rules: DEFAULT_RULES_V1,
        contentHash: "hash_test",
      },
      {
        amountPaise: 5000000,
        discrepancyPaise: 50000,
        timeDeltaHours: 12,
        provider: "STRIPE",
      }
    );

    assert.equal(evalRes.decision, "EXCEPTION");
    assert.equal(evalRes.requiresMakerChecker, true);
  });

  // Scenario 9: Fee & Tax Mismatch in N:1
  await test("Scenario 9: Fee and tax mismatch -> Discrepancy > tolerance routes to exception", () => {
    const s1 = makeSettlement("s1", 50000, "UTR_FEE_MIS");
    const s2 = makeSettlement("s2", 50000, "UTR_FEE_MIS");
    const c1 = makeCredit("c1", 95000, "UTR_FEE_MIS"); // 5,000 paise mismatch

    const match = findSettlementGroupForBank([s1, s2], c1);
    assert.equal(match, null);
  });

  // Scenario 10: Timing Window Boundary
  await test("Scenario 10: Timing window exceeded -> Candidate excluded by policy", () => {
    const t0 = new Date("2026-08-23T00:00:00Z");
    const tLate = new Date("2026-08-28T00:00:00Z"); // 5 days late

    const s1 = makeSettlement("s_late1", 25000, "UTR_LATE", t0);
    const s2 = makeSettlement("s_late2", 25000, "UTR_LATE", t0);
    const c1 = makeCredit("c_late", 50000, "UTR_LATE", tLate);

    const match = findSettlementGroupForBank([s1, s2], c1);
    assert.equal(match, null);
  });

  // Scenario 11: N:M Ambiguous Combinations
  await test("Scenario 11: N:M ambiguous combinations -> Bounded combinatorial resolution", () => {
    const s1 = makeSettlement("s11_a", 25000, "UTR_NM");
    const s2 = makeSettlement("s11_b", 25000, "UTR_NM");
    const c1 = makeCredit("c11_a", 30000, "UTR_NM");
    const c2 = makeCredit("c11_b", 20000, "UTR_NM");

    const match = findManyToManyMatch([s1, s2], [c1, c2]);
    assert.ok(match != null);
    assert.equal(match.type, "N:M");
    assert.equal(match.differencePaise, 0);
  });

  // Scenario 12: Unrelated Candidate Noise in N:1
  await test("Scenario 12: Unrelated candidate noise -> Isolates signal from noise without false positive", () => {
    const s1 = makeSettlement("s_signal1", 25000, "UTR_SIG");
    const s2 = makeSettlement("s_signal2", 25000, "UTR_SIG");
    const sNoise = makeSettlement("s_noise", 13337, "UTR_NOISE");
    const c1 = makeCredit("c_signal", 50000, "UTR_SIG");

    const match = findSettlementGroupForBank([s1, s2, sNoise], c1);
    assert.ok(match != null);
    assert.equal(match.settlementIds.length, 2);
    assert.ok(!match.settlementIds.includes("s_noise"));
  });

  // Scenario 13: Partial Settlement in N:1
  await test("Scenario 13: Partial settlement -> Identified without fabricating whole match", () => {
    const s1 = makeSettlement("s_part1", 40000, "UTR_PARTIAL");
    const s2 = makeSettlement("s_part2", 10000, "UTR_PARTIAL");
    const c1 = makeCredit("c_full", 100000, "UTR_PARTIAL"); // Sum = 50,000 vs 100,000

    const match = findSettlementGroupForBank([s1, s2], c1);
    assert.equal(match, null);
  });

  // Scenario 14: Split Settlement (1:N)
  await test("Scenario 14: Split settlement (1:N bank deposits) -> Resolved as 1:N aggregation", () => {
    const s1 = makeSettlement("s_parent", 100000, "UTR_SPLIT");
    const c1 = makeCredit("c_child1", 60000, "UTR_SPLIT");
    const c2 = makeCredit("c_child2", 40000, "UTR_SPLIT");

    const match = findBankGroupForSettlement(s1, [c1, c2]);
    assert.ok(match != null);
    assert.equal(match.type, "1:N");
    assert.equal(match.bankTxnIds.length, 2);
  });

  // Scenario 15: Stale Evidence
  await test("Scenario 15: Stale evidence -> Rejected when rationale is incomplete", () => {
    const p = closureManager.proposeCorrection({
      exceptionId: "exc_stale_ev",
      makerId: "OPERATOR_ALICE",
      actionType: "FORCE_MATCH",
      reason: "",
      evidenceIds: [],
      adjustmentPaise: 0,
      grossAmountPaise: 100000,
      feePaise: 0,
      taxPaise: 0,
      actualSettledPaise: 100000,
    });

    closureManager.reviewCorrection({
      correctionId: p.correctionId,
      checkerId: "SUPERVISOR_BOB",
      action: "APPROVE",
    });

    const verify = closureManager.recalculateAndVerify(p.correctionId);
    assert.equal(verify.invariantResult.checks.completeness, false);
    assert.equal(verify.invariantResult.status, "CONTROL_FAILURE");
  });

  // Scenario 16: Contradictory Contextual Evidence
  await test("Scenario 16: Contradictory evidence -> Arithmetic contradiction triggers fail-closed", () => {
    const p = closureManager.proposeCorrection({
      exceptionId: "exc_contradictory",
      makerId: "OPERATOR_ALICE",
      actionType: "ATTACH_REFUND",
      reason: "Claimed refund of 1,550 on a 10,000 discrepancy",
      evidenceIds: ["ev_refund_small"],
      adjustmentPaise: 155000,
      refundId: "ref_small",
      grossAmountPaise: 2000000,
      feePaise: 40000,
      taxPaise: 7200,
      refundPaise: 155000,
      actualSettledPaise: 1000000,
    });

    closureManager.reviewCorrection({
      correctionId: p.correctionId,
      checkerId: "SUPERVISOR_BOB",
      action: "APPROVE",
    });

    const verify = closureManager.recalculateAndVerify(p.correctionId);
    assert.equal(verify.invariantResult.status, "CONTROL_FAILURE");
    assert.equal(verify.invariantResult.checks.moneyConservation, false);
  });

  console.log("\nfinancial-attack: ALL 16 ADVERSARIAL SCENARIOS PASSED (0 FABRICATED MATCHES)\n");
}

if (require.main === module) {
  void runFinancialAttackSuite();
}
