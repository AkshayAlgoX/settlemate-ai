/*
 * SettleMate AI — Meet-in-the-Middle vs. Direct Combinatorial Comparison Benchmark
 */

import { solveManyToManyMeetInMiddle } from "../src/lib/reconciliation/meet-in-middle";
import { findManyToManyMatch } from "../src/lib/reconciliation/cardinality";
import type { NormalizedBankTxn, NormalizedSettlement } from "../src/lib/reconciliation/types";

function makeSettlement(id: string, amount: number): NormalizedSettlement {
  const d = new Date("2026-08-20T10:00:00Z");
  return {
    dbId: `db_${id}`,
    settlementId: id,
    paymentId: `p_${id}`,
    amount,
    fee: 0,
    tax: 0,
    utr: `UTR_${id}`,
    status: "settled",
    settledAt: d,
    createdAt: d,
  };
}

function makeCredit(id: string, amount: number): NormalizedBankTxn {
  const d = new Date("2026-08-20T10:00:00Z");
  return {
    dbId: `db_${id}`,
    txnId: id,
    utr: `UTR_${id}`,
    amount,
    type: "CREDIT",
    narration: "BULK",
    txnDate: d,
    matched: false,
  };
}

function runComparison() {
  console.log("\n=========================================================================");
  console.log(" SETTLEMATE AI — MEET-IN-THE-MIDDLE VS DIRECT COMBINATORIAL BENCHMARK");
  console.log("=========================================================================\n");

  const config = {
    maxGroupSize: 6,
    maxCandidates: 24,
    tolerancePaise: 100,
    maxHours: 96,
  };

  const testCases = [
    { n: 4, m: 4, name: "Small 4x4 Cluster" },
    { n: 6, m: 6, name: "Medium 6x6 Cluster" },
    { n: 8, m: 8, name: "Medium 8x8 Cluster" },
    { n: 10, m: 10, name: "Dense 10x10 Cluster" },
    { n: 14, m: 14, name: "Large 14x14 Cluster" },
  ];

  console.log("Cluster Size | Direct Solver (ms) | MITM Solver (ms) | Speedup / Parity | Verdict");
  console.log("-------------+--------------------+------------------+------------------+--------------------");

  for (const tc of testCases) {
    const setls = Array.from({ length: tc.n }, (_, i) => makeSettlement(`s_${i}`, 10000 + (i % 3) * 5000));
    const credits = Array.from({ length: tc.m }, (_, i) => makeCredit(`c_${i}`, 15000 + (i % 2) * 5000));

    // Measure Direct Combinatorial Solver (100 iterations)
    const startDirect = performance.now();
    for (let i = 0; i < 100; i++) {
      findManyToManyMatch(setls, credits, config);
    }
    const durDirect = (performance.now() - startDirect) / 100;

    // Measure Meet-in-the-Middle Solver (100 iterations)
    const startMITM = performance.now();
    for (let i = 0; i < 100; i++) {
      solveManyToManyMeetInMiddle(setls, credits, config);
    }
    const durMITM = (performance.now() - startMITM) / 100;

    const speedup = (durDirect / durMITM).toFixed(2);
    const sizeStr = tc.name.padEnd(12);
    const dirStr = (durDirect.toFixed(3) + " ms").padStart(18);
    const mitmStr = (durMITM.toFixed(3) + " ms").padStart(16);
    const spdStr = (speedup + "x").padStart(16);
    const verdict = durMITM <= durDirect ? "✅ MITM Optimal" : "⚡ Direct Optimal";

    console.log(`${sizeStr} | ${dirStr} | ${mitmStr} | ${spdStr} | ${verdict}`);
  }
  console.log("");
}

runComparison();
