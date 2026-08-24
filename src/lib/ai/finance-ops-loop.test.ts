/*
 * SettleMate AI — 50+ Record Autonomous Finance-Ops Loop Tests (Razorpay Track 04)
 *
 * Tests the generic resolution proposal contract across:
 *   1. Scenario A: Partial Refund (₹20,000 - ₹1,550 = ₹18,450)
 *   2. Scenario B: Fee Discrepancy (₹20,000 - ₹1,050 = ₹18,950)
 *   3. Scenario C: Chargeback / Reversal (₹20,000 - ₹20,000 = ₹0)
 *   4. Generic Proposal Contract & Schema Completeness
 *   5. Hostile Mode: Fake Evidence ID -> Ledger Blocked
 *   6. Hostile Mode: Wrong Voucher Amount -> Ledger Blocked
 *   7. 10-Step Workflow State Machine & Latency Verification
 */

import assert from "node:assert/strict";
import { FinanceOpsLoopRunner } from "../reconciliation/finance-ops-loop";

async function test(name: string, fn: () => Promise<void> | void) {
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
  console.log(" SETTLEMATE AI — GENERIC FINANCE-OPS LOOP TESTS (TRACK 04)");
  console.log("=========================================================================\n");

  const runner = new FinanceOpsLoopRunner();

  await test("1. Scenario A: Partial Refund Resolution (55 records, ₹1,550 refund)", async () => {
    const res = await runner.execute50RecordFinanceOpsLoop({ scenario: "SCENARIO_A_REFUND" });
    const { summary, exceptionInvestigation } = res;

    assert.equal(summary.totalRecords, 55);
    assert.equal(summary.autoMatchedCount, 53);
    assert.equal(summary.aiBypassedCount, 53);
    assert.equal(summary.aiInvokedCount, 1);
    assert.equal(exceptionInvestigation.proposal.proposedCorrection.type, "ADJUST_REFUND");
    assert.equal(exceptionInvestigation.proposal.proposedCorrection.amountPaise, 155000);
    assert.equal(exceptionInvestigation.makerCheckerAction, "APPROVED_BY_CONTROLLER");
    assert.equal(summary.ledgerFinalizedCount, 1);
    assert.equal(summary.sealedReceiptsCount, 1);
    assert.equal(exceptionInvestigation.offlineReceiptVerificationStatus, "VERIFIED");
  });

  await test("2. Scenario B: Provider Fee Discrepancy Resolution (55 records, ₹1,050 fee)", async () => {
    const res = await runner.execute50RecordFinanceOpsLoop({ scenario: "SCENARIO_B_FEE" });
    const { summary, exceptionInvestigation } = res;

    assert.equal(summary.aiInvokedCount, 1);
    assert.equal(exceptionInvestigation.proposal.proposedCorrection.type, "ADJUST_FEE");
    assert.equal(exceptionInvestigation.proposal.proposedCorrection.amountPaise, 105000);
    assert.equal(exceptionInvestigation.proposal.proposedCorrection.accountFrom, "GATEWAY_FEE_EXPENSE_AC");
    assert.equal(exceptionInvestigation.makerCheckerAction, "APPROVED_BY_CONTROLLER");
    assert.equal(summary.ledgerFinalizedCount, 1);
    assert.equal(summary.sealedReceiptsCount, 1);
  });

  await test("3. Scenario C: Chargeback Reversal Resolution (55 records, ₹20,000 reversal)", async () => {
    const res = await runner.execute50RecordFinanceOpsLoop({ scenario: "SCENARIO_C_CHARGEBACK" });
    const { summary, exceptionInvestigation } = res;

    assert.equal(summary.aiInvokedCount, 1);
    assert.equal(exceptionInvestigation.proposal.proposedCorrection.type, "ADJUST_CHARGEBACK");
    assert.equal(exceptionInvestigation.proposal.proposedCorrection.amountPaise, 2000000);
    assert.equal(exceptionInvestigation.proposal.proposedCorrection.accountFrom, "CHARGEBACK_LIABILITY_AC");
    assert.equal(exceptionInvestigation.makerCheckerAction, "APPROVED_BY_CONTROLLER");
    assert.equal(summary.ledgerFinalizedCount, 1);
    assert.equal(summary.sealedReceiptsCount, 1);
  });

  await test("4. Generic Proposal Contract Completeness & Separation of Duties", async () => {
    const res = await runner.execute50RecordFinanceOpsLoop({ scenario: "SCENARIO_A_REFUND" });
    const p = res.exceptionInvestigation.proposal;

    assert.ok(p.proposalId.startsWith("prop_"));
    assert.ok(p.exceptionId.startsWith("exc_"));
    assert.ok(p.claims.length >= 2);
    assert.ok(p.expectedFinancialImpact.adjustmentPaise > 0);
    assert.equal(p.recommendedAction, "APPROVE_CORRECTION");
  });

  await test("5. Hostile Mode (Fake Evidence ID): Non-LLM Validator disputes -> Ledger Blocked", async () => {
    const res = await runner.execute50RecordFinanceOpsLoop({ hostileMode: "HOSTILE_FAKE_EVIDENCE" });
    const { summary, exceptionInvestigation } = res;

    assert.equal(summary.hostileMode, "HOSTILE_FAKE_EVIDENCE");
    assert.equal(exceptionInvestigation.claimAudit.disputedClaimsCount, 2); // Both C1 & C2 cite fake ID
    assert.equal(exceptionInvestigation.claimAudit.verifiedClaimsCount, 0);
    assert.equal(exceptionInvestigation.makerCheckerAction, "ESCALATED_TO_MANUAL_INVESTIGATION_AI_ABSTAINED");
    assert.equal(summary.ledgerFinalizedCount, 0);
    assert.equal(summary.sealedReceiptsCount, 0);
    assert.equal(summary.falseResolutionsCount, 0);
  });

  await test("6. Hostile Mode (Wrong Voucher Amount): Non-LLM Validator disputes -> Ledger Blocked", async () => {
    const res = await runner.execute50RecordFinanceOpsLoop({ hostileMode: "HOSTILE_WRONG_AMOUNT" });
    const { summary, exceptionInvestigation } = res;

    assert.equal(summary.hostileMode, "HOSTILE_WRONG_AMOUNT");
    assert.equal(exceptionInvestigation.claimAudit.disputedClaimsCount, 1);
    assert.equal(summary.ledgerFinalizedCount, 0);
    assert.equal(summary.falseResolutionsCount, 0);
  });

  await test("7. 10-Step Visualizer Workflow State Machine & Latency Recording", async () => {
    const res = await runner.execute50RecordFinanceOpsLoop();
    const steps = res.summary.workflowSteps;

    assert.equal(steps.length, 10);
    assert.equal(steps[0].name, "Batch Ingestion");
    assert.equal(steps[1].name, "Fast Reconciliation");
    assert.equal(steps[4].name, "AI Investigation");
    assert.equal(steps[5].name, "Non-LLM Claim Validation");
    assert.equal(steps[7].name, "Maker/Checker Gate");
    assert.equal(steps[9].name, "Ledger Finalization");

    // All steps must have non-negative recorded latencies
    for (const step of steps) {
      assert.ok(step.latencyMs >= 0);
      assert.equal(step.status, "COMPLETED");
    }
  });

  console.log("\nfinance-ops-loop: ALL 7 FINANCE-OPS TESTS PASSED\n");
}

void runTests();
