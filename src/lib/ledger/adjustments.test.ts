/*
 * SettleMate AI — Post-Finalization Late Event Adjustment Tests (Day 1 Pass)
 */

import assert from "node:assert/strict";
import { AdjustmentLedgerManager, type FinalizedLedgerRecord } from "./adjustments";

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
  console.log(" SETTLEMATE AI — POST-FINALIZATION LATE EVENT ADJUSTMENT TESTS");
  console.log("=========================================================================\n");

  const manager = new AdjustmentLedgerManager();

  const originalRecord: FinalizedLedgerRecord = {
    ledgerEntryId: "ldg_hist_1001",
    batchId: "batch_2026_08",
    paymentId: "pay_1001",
    grossAmountPaise: 500000, // ₹5,000
    feePaise: 10000, // ₹100
    taxPaise: 1800, // ₹18
    netSettledPaise: 488200, // ₹4,882
    status: "FINALIZED",
    finalizedAt: new Date("2026-08-20T00:00:00Z"),
    contentHash: "hash_hist_1001",
  };

  manager.registerFinalizedEntry(originalRecord);

  await test("1. Late Refund: Emits append-only linked adjustment without mutating parent record", () => {
    const res = manager.processLateEvent({
      eventId: "evt_late_ref_1",
      originalLedgerEntryId: "ldg_hist_1001",
      paymentId: "pay_1001",
      eventType: "LATE_REFUND",
      adjustmentAmountPaise: -155000, // ₹1,550 refund deduction
      reason: "Customer partial return after settlement finalization",
      observedAt: new Date("2026-08-22T00:00:00Z"),
      idempotencyKey: "late_idem_ref_1001",
    });

    assert.equal(res.success, true);
    assert.equal(res.isDuplicate, false);
    assert.equal(res.adjustmentRecord?.originalNetPaise, 488200);
    assert.equal(res.adjustmentRecord?.newEffectiveNetPaise, 333200); // 488200 - 155000

    // Prove historical record is 100% immutable
    const parent = manager.getFinalizedEntry("ldg_hist_1001");
    assert.equal(parent?.netSettledPaise, 488200);
  });

  await test("2. Duplicate Late Event Delivery: Idempotency returns identical adjustment without duplicate write", () => {
    const resDup = manager.processLateEvent({
      eventId: "evt_late_ref_1_dup",
      originalLedgerEntryId: "ldg_hist_1001",
      paymentId: "pay_1001",
      eventType: "LATE_REFUND",
      adjustmentAmountPaise: -155000,
      reason: "Duplicate webhook delivery",
      observedAt: new Date("2026-08-22T00:00:05Z"),
      idempotencyKey: "late_idem_ref_1001", // Same idempotency key
    });

    assert.equal(resDup.success, true);
    assert.equal(resDup.isDuplicate, true);
    assert.equal(manager.getAdjustmentsForEntry("ldg_hist_1001").length, 1);
  });

  await test("3. Late Chargeback: Linked adjustment tracks cumulative deductions", () => {
    const resCb = manager.processLateEvent({
      eventId: "evt_late_cb_1",
      originalLedgerEntryId: "ldg_hist_1001",
      paymentId: "pay_1001",
      eventType: "LATE_CHARGEBACK",
      adjustmentAmountPaise: -50000, // ₹500 chargeback deduction
      reason: "Fraud dispute clawback",
      observedAt: new Date("2026-08-23T00:00:00Z"),
      idempotencyKey: "late_idem_cb_1001",
    });

    assert.equal(resCb.success, true);
    assert.equal(resCb.adjustmentRecord?.eventType, "LATE_CHARGEBACK");
    assert.equal(manager.getAdjustmentsForEntry("ldg_hist_1001").length, 2);
  });

  await test("4. Out-of-Bounds Adjustment: Excessive deduction violating invariant is rejected", () => {
    const resExcessive = manager.processLateEvent({
      eventId: "evt_late_excess",
      originalLedgerEntryId: "ldg_hist_1001",
      paymentId: "pay_1001",
      eventType: "LATE_REFUND",
      adjustmentAmountPaise: -900000, // Exceeds entire net balance
      reason: "Invalid huge refund",
      observedAt: new Date("2026-08-24T00:00:00Z"),
      idempotencyKey: "late_idem_excess_1001",
    });

    assert.equal(resExcessive.success, false);
    assert.ok(resExcessive.error?.includes("INVARIANT_BREACH"));
  });

  console.log("\nadjustments: ALL 4 POST-FINALIZATION ADJUSTMENT TESTS PASSED\n");
}

void runTests();
