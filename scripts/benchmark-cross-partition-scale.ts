/*
 * SettleMate AI — Cross-Partition Scale & Concurrency Benchmark (Day 6)
 */

import {
  BoundedCrossPartitionResolver,
  type UnmatchedSettlementWrapper,
  type UnmatchedCreditWrapper,
} from "../src/lib/reconciliation/distributed/cross-partition";
import {
  GlobalPartitionInvariantVerifier,
  type PartitionExecutionResult,
} from "../src/lib/reconciliation/distributed/global-invariants";
import type { NormalizedBankTxn, NormalizedSettlement } from "../src/lib/reconciliation/types";

function makeSettlement(id: string, amount: number, utr: string): NormalizedSettlement {
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

function makeCredit(id: string, amount: number, utr: string): NormalizedBankTxn {
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

function runScaleBenchmark() {
  console.log("\n=========================================================================");
  console.log(" SETTLEMATE AI — CROSS-PARTITION SCALE & INVARIANT BENCHMARK (DAY 6)");
  console.log("=========================================================================\n");

  const scales = [
    { count: 1000, name: "1,000 Boundary Candidates" },
    { count: 10000, name: "10,000 Boundary Candidates" },
    { count: 100000, name: "100,000 Boundary Candidates" },
  ];

  const resolver = new BoundedCrossPartitionResolver({ maxWindowDelta: 2 });
  const verifier = new GlobalPartitionInvariantVerifier();

  console.log("Workload                     | Boundary Pairs | Matched | Duplicates | Invariants | Time (ms)  | Speed (pairs/s)");
  console.log("-----------------------------+----------------+---------+------------+------------+------------+----------------");

  for (const s of scales) {
    const settlements: UnmatchedSettlementWrapper[] = [];
    const credits: UnmatchedCreditWrapper[] = [];

    for (let i = 0; i < s.count; i++) {
      const utr = `UTR_BOUNDARY_${i}`;
      const partIdx = i % 10;
      settlements.push({
        partitionId: `part_${partIdx}`,
        windowIndex: partIdx,
        settlement: makeSettlement(`s_scale_${i}`, 50000, utr),
      });
      credits.push({
        partitionId: `part_${(partIdx + 1) % 10}`,
        windowIndex: (partIdx + 1) % 10,
        credit: makeCredit(`c_scale_${i}`, 50000, utr),
      });
    }

    const start = performance.now();
    const res = resolver.resolveCrossPartitionOrphans(settlements, credits);
    const dur = performance.now() - start;

    const partitionResult: PartitionExecutionResult = {
      partitionId: "global_test",
      windowIndex: 0,
      inputSettlementIds: settlements.map((x) => x.settlement.settlementId),
      inputBankTxnIds: credits.map((x) => x.credit.txnId),
      matchedResults: res.matchedResults,
      unresolvedSettlementIds: res.unresolvedSettlements.map((x) => x.settlement.settlementId),
      unresolvedBankTxnIds: res.unresolvedCredits.map((x) => x.credit.txnId),
    };

    const inv = verifier.verifyGlobalInvariants([partitionResult]);
    const speed = Math.round((s.count / dur) * 1000);

    const nameStr = s.name.padEnd(28);
    const countStr = String(s.count).padStart(14);
    const matchStr = String(res.matchedResults.length).padStart(7);
    const dupStr = String(inv.duplicateSettlementIds.length).padStart(10);
    const invStr = (inv.passed ? "PASSED" : "FAILED").padEnd(10);
    const timeStr = (dur.toFixed(2) + " ms").padStart(10);
    const speedStr = (speed.toLocaleString() + " /s").padStart(15);

    console.log(`${nameStr} | ${countStr} | ${matchStr} | ${dupStr} | ${invStr} | ${timeStr} | ${speedStr}`);
  }
  console.log("");
}

runScaleBenchmark();
