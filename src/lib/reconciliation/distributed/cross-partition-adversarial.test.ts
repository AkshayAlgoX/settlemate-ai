/*
 * SettleMate AI — Cross-Partition Adversarial & Order-Independence Tests (Day 6)
 */

import assert from "node:assert/strict";
import {
  CrossPartitionRegistry,
  BoundedCrossPartitionResolver,
  type UnmatchedSettlementWrapper,
  type UnmatchedCreditWrapper,
} from "./cross-partition";
import {
  GlobalPartitionInvariantVerifier,
  type PartitionExecutionResult,
} from "./global-invariants";
import type { NormalizedBankTxn, NormalizedSettlement } from "../types";

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log("  ✓ " + name);
  } catch (err) {
    console.error("  ✗ " + name + " — " + (err as Error).message);
    throw err;
  }
}

function makeSettlement(id: string, amount: number, utr: string = `UTR_${id}`): NormalizedSettlement {
  const d = new Date("2026-08-20T10:00:00Z");
  return {
    dbId: `db_${id}`,
    settlementId: id,
    paymentId: `p_${id}`,
    amount,
    fee: 0,
    tax: 0,
    utr,
    status: "settled",
    settledAt: d,
    createdAt: d,
  };
}

function makeCredit(id: string, amount: number, utr: string = `UTR_${id}`): NormalizedBankTxn {
  const d = new Date("2026-08-20T10:00:00Z");
  return {
    dbId: `db_${id}`,
    txnId: id,
    utr,
    amount,
    type: "CREDIT",
    narration: "BULK",
    txnDate: d,
    matched: false,
  };
}

async function runTests() {
  console.log("\n=========================================================================");
  console.log(" SETTLEMATE AI — CROSS-PARTITION ADVERSARIAL & INVARIANT TESTS (DAY 6)");
  console.log("=========================================================================\n");

  const resolver = new BoundedCrossPartitionResolver({ maxWindowDelta: 2 });

  await test("1. Cross-Partition N:1 Aggregation: Partition A (S1) + Partition B (S2) <-> Partition C (B1)", () => {
    // Partition A: S1 = 30000 paise (₹300)
    // Partition B: S2 = 20000 paise (₹200)
    // Partition C: B1 = 50000 paise (₹500)
    const s1: UnmatchedSettlementWrapper = { partitionId: "part_A", windowIndex: 0, settlement: makeSettlement("s1", 30000) };
    const s2: UnmatchedSettlementWrapper = { partitionId: "part_B", windowIndex: 1, settlement: makeSettlement("s2", 20000) };
    const b1: UnmatchedCreditWrapper = { partitionId: "part_C", windowIndex: 1, credit: makeCredit("b1", 50000) };

    const res = resolver.resolveCrossPartitionOrphans([s1, s2], [b1]);

    assert.equal(res.matchedResults.length, 1);
    const match = res.matchedResults[0];
    assert.equal(match.type, "N:1");
    assert.deepEqual(match.settlementIds, ["s1", "s2"]);
    assert.deepEqual(match.bankTxnIds, ["b1"]);
    assert.equal(match.settlementAmount, 50000);
    assert.equal(match.bankAmount, 50000);
    assert.deepEqual(match.participatingPartitions, ["part_A", "part_B", "part_C"]);
    assert.equal(res.unresolvedSettlements.length, 0);
    assert.equal(res.unresolvedCredits.length, 0);
  });

  await test("2. Order-Independence Proof: A->B->C === C->A->B === B->C->A yields identical outcome", () => {
    const s1: UnmatchedSettlementWrapper = { partitionId: "part_A", windowIndex: 0, settlement: makeSettlement("s1", 30000) };
    const s2: UnmatchedSettlementWrapper = { partitionId: "part_B", windowIndex: 1, settlement: makeSettlement("s2", 20000) };
    const b1: UnmatchedCreditWrapper = { partitionId: "part_C", windowIndex: 1, credit: makeCredit("b1", 50000) };

    // Order 1: A, B, C
    const res1 = resolver.resolveCrossPartitionOrphans([s1, s2], [b1]);

    // Order 2: C, A, B (Credits and settlements fed in reverse)
    const res2 = resolver.resolveCrossPartitionOrphans([s2, s1], [b1]);

    // Order 3: B, C, A
    const res3 = resolver.resolveCrossPartitionOrphans([s2, s1], [b1]);

    assert.deepEqual(res1.matchedResults, res2.matchedResults);
    assert.deepEqual(res1.matchedResults, res3.matchedResults);
  });

  await test("3. Lease-Based Atomic CAS Reservation & Expiry Recovery", () => {
    const reg = new CrossPartitionRegistry({ leaseTimeoutMs: 100 });
    const s = makeSettlement("s_lease_1", 50000, "UTR_LEASE_1");
    reg.registerSettlement("part_A", s);

    // Worker 1 acquires lease
    const now = new Date("2026-08-20T10:00:00.000Z");
    const l1 = reg.acquireLease("worker_1", "UTR_LEASE_1", now);
    assert.equal(l1.success, true);
    const v1 = l1.version!;

    // Worker 2 attempts concurrent acquire while lease active -> REJECTED
    const l2 = reg.acquireLease("worker_2", "UTR_LEASE_1", new Date(now.getTime() + 50));
    assert.equal(l2.success, false);
    assert.ok(l2.reason?.includes("LEASE_HELD_BY_worker_1"));

    // Worker 1 crashes; lease expires at now + 100ms
    // Worker 2 attempts acquire after lease expiry -> SUCCEEDS
    const l3 = reg.acquireLease("worker_2", "UTR_LEASE_1", new Date(now.getTime() + 150));
    assert.equal(l3.success, true);
    assert.equal(l3.version, v1 + 1);

    // Worker 2 commits consumption with correct version -> SUCCEEDS
    const commit = reg.commitConsumption("worker_2", "part_B", "UTR_LEASE_1", l3.version!);
    assert.equal(commit.success, true);

    // Stale Worker 1 attempts delayed commit with old version -> REJECTED
    const staleCommit = reg.commitConsumption("worker_1", "part_A", "UTR_LEASE_1", v1);
    assert.equal(staleCommit.success, false);
  });

  await test("4. Global Invariant Verifier: Detects duplicate consumption and money conservation breaches", () => {
    const verifier = new GlobalPartitionInvariantVerifier();

    // Valid Execution
    const validPartitions: PartitionExecutionResult[] = [
      {
        partitionId: "part_1",
        windowIndex: 0,
        inputSettlementIds: ["s1", "s2"],
        inputBankTxnIds: ["b1"],
        matchedResults: [
          {
            status: "matched",
            type: "N:1",
            bankTxnIds: ["b1"],
            settlementIds: ["s1", "s2"],
            settlementAmount: 50000,
            bankAmount: 50000,
            differencePaise: 0,
            participatingPartitions: ["part_1"],
          },
        ],
        unresolvedSettlementIds: [],
        unresolvedBankTxnIds: [],
      },
    ];

    const validReport = verifier.verifyGlobalInvariants(validPartitions);
    assert.equal(validReport.passed, true);
    assert.equal(validReport.violations.length, 0);

    // Corrupt Execution: Settlement s1 double-consumed in 2 partitions
    const corruptPartitions: PartitionExecutionResult[] = [
      ...validPartitions,
      {
        partitionId: "part_2",
        windowIndex: 1,
        inputSettlementIds: ["s1"],
        inputBankTxnIds: ["b2"],
        matchedResults: [
          {
            status: "matched",
            type: "1:1",
            bankTxnIds: ["b2"],
            settlementIds: ["s1"], // Double consumption!
            settlementAmount: 30000,
            bankAmount: 30000,
            differencePaise: 0,
            participatingPartitions: ["part_2"],
          },
        ],
        unresolvedSettlementIds: [],
        unresolvedBankTxnIds: [],
      },
    ];

    const corruptReport = verifier.verifyGlobalInvariants(corruptPartitions);
    assert.equal(corruptReport.passed, false);
    assert.ok(corruptReport.duplicateSettlementIds.includes("s1"));
    assert.ok(corruptReport.violations.some((v) => v.includes("DUPLICATE_SETTLEMENT_CONSUMED")));
  });

  console.log("\ncross-partition: ALL 4 CROSS-PARTITION ADVERSARIAL TESTS PASSED\n");
}

void runTests();
