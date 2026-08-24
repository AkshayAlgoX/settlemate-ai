/*
 * SettleMate AI — Cross-Partition Boundary Reconciliation Tests (Frontier 6)
 */

import assert from "node:assert/strict";
import { CrossPartitionRegistry } from "./cross-partition";
import type { NormalizedSettlement } from "../types";

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log("  ✓ " + name);
  } catch (err) {
    console.error("  ✗ " + name + " — " + (err as Error).message);
    throw err;
  }
}

const T_DAY1 = new Date("2026-08-20T23:59:00Z");

function makeSettlement(id: string, utr: string, amount: number): NormalizedSettlement {
  return {
    dbId: "db_" + id,
    settlementId: id,
    paymentId: "pay_" + id,
    amount,
    fee: 0,
    tax: 0,
    utr,
    status: "settled",
    settledAt: T_DAY1,
    createdAt: T_DAY1,
  };
}

async function runTests() {
  console.log("\n=========================================================================");
  console.log(" SETTLEMATE AI — CROSS-PARTITION BOUNDARY RECONCILIATION TESTS (F6)");
  console.log("=========================================================================\n");

  const registry = new CrossPartitionRegistry();

  await test("1. Cross-Partition Match: Partition B matches unconsumed candidate from Partition A", () => {
    // Partition A (Day 1) registers settlement
    const sA = makeSettlement("setl_day1_101", "UTR_CROSS_BOUNDARY", 75000);
    registry.registerSettlement("partition_day_1", sA);

    // Partition B (Day 2) observes bank credit with same UTR and claims candidate
    const claim = registry.claimCrossPartitionCandidate(
      "partition_day_2",
      "UTR_CROSS_BOUNDARY",
      75000
    );

    assert.equal(claim.success, true);
    assert.equal(claim.candidate?.sourcePartitionId, "partition_day_1");
    assert.equal(claim.candidate?.consumedByPartition, "partition_day_2");
  });

  await test("2. Double-Consumption Prevention: Second partition attempting claim is rejected", () => {
    const claim2 = registry.claimCrossPartitionCandidate(
      "partition_day_3",
      "UTR_CROSS_BOUNDARY",
      75000
    );

    assert.equal(claim2.success, false);
    assert.equal(claim2.reason, "ALREADY_CONSUMED_BY_partition_day_2");
  });

  await test("3. Amount Divergence: Cross-partition candidate with mismatching amount is rejected", () => {
    const sA2 = makeSettlement("setl_day1_102", "UTR_AMT_MISMATCH", 50000);
    registry.registerSettlement("partition_day_1", sA2);

    const claim = registry.claimCrossPartitionCandidate(
      "partition_day_2",
      "UTR_AMT_MISMATCH",
      99999 // Different expected amount
    );

    assert.equal(claim.success, false);
    assert.equal(claim.reason, "AMOUNT_MISMATCH");
    assert.equal(registry.isCandidateConsumed("UTR_AMT_MISMATCH"), false);
  });

  console.log("\ncross-partition: ALL 3 CROSS-PARTITION TESTS PASSED\n");
}

void runTests();
