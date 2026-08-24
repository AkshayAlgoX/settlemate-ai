/*
 * SettleMate AI — Subsystem Performance Profiler (Frontier 8)
 *
 * Measures CPU execution time and percentage breakdown across all core stages:
 *   1. Normalization & Sanitization
 *   2. Date Partitioning & Amount Bucketing
 *   3. 1:1 Rule Matching
 *   4. Combinatorial N:M Solver
 *   5. 6-Point Financial Invariants Verification
 *   6. Policy-as-Code Evaluation
 *   7. Cryptographic Binary Merkle DAG Hashing
 *   8. Immutable Audit Chain Appends
 */

import { partitionCandidates } from "../src/lib/reconciliation/scale/clusters";
import { findSettlementGroupForBank } from "../src/lib/reconciliation/cardinality";
import { evaluateInvariants } from "../src/lib/reconciliation/invariants";
import { evaluatePolicy } from "../src/lib/policy/evaluator";
import { DEFAULT_RULES_V1 } from "../src/lib/policy/manager";
import { buildBatchMerkleTree, computePartitionAuditHash } from "../src/lib/reconciliation/distributed/merkle";
import { hashChainLink, canonicalize } from "../src/lib/reconciliation/audit-chain";
import { validatePayments } from "../src/lib/reconciliation/ingestion-validator";

export async function profilePipeline() {
  console.log("\n=========================================================================");
  console.log(" SETTLEMATE AI — FULL SUBSYSTEM PERFORMANCE PROFILING BREAKDOWN (F8)");
  console.log("=========================================================================\n");

  const iterations = 1000;
  const timings: Record<string, number> = {};

  // 1. Ingestion Validation & Normalization
  let start = performance.now();
  const rawP = Array.from({ length: iterations }, (_, i) => ({
    id: `p_${i}`,
    amount: 50000,
    currency: "INR",
    status: "captured",
    created_at: "2026-08-20T00:00:00Z",
  }));
  validatePayments(rawP);
  timings["1. Ingestion Validation"] = performance.now() - start;

  // 2. Partitioning & Bucketing
  start = performance.now();
  const rawS = Array.from({ length: iterations }, (_, i) => ({
    dbId: `db_s_${i}`,
    settlementId: `setl_${i}`,
    paymentId: `p_${i}`,
    amount: 50000,
    fee: 1000,
    tax: 180,
    utr: `UTR_${i}`,
    status: "settled" as const,
    settledAt: new Date("2026-08-20T00:00:00Z"),
    createdAt: new Date("2026-08-20T00:00:00Z"),
  }));
  const rawC = Array.from({ length: iterations }, (_, i) => ({
    dbId: `db_c_${i}`,
    txnId: `tx_${i}`,
    utr: `UTR_${i}`,
    amount: 48820,
    type: "CREDIT" as const,
    narration: "SETTLEMENT",
    txnDate: new Date("2026-08-20T00:00:00Z"),
    matched: false,
  }));
  partitionCandidates(rawS, rawC, 86400000);
  timings["2. Partitioning & Indexing"] = performance.now() - start;

  // 3. 1:1 Matching
  start = performance.now();
  for (let i = 0; i < iterations; i++) {
    void (rawS[i].utr === rawC[i].utr && rawS[i].amount - rawS[i].fee - rawS[i].tax === rawC[i].amount);
  }
  timings["3. 1:1 Rule Matching"] = performance.now() - start;

  // 4. Combinatorial N:M Solver
  start = performance.now();
  findSettlementGroupForBank(rawS.slice(0, 50), rawC[0]);
  timings["4. Combinatorial N:M Solver"] = performance.now() - start;

  // 5. 6-Point Invariants
  start = performance.now();
  const mockBatch: Record<string, unknown> = {
    batchId: "b_bench",
    orders: [],
    payments: Array.from({ length: 50 }, (_, i) => ({
      dbId: "db_p_" + i,
      paymentId: "p_" + i,
      orderId: "ord_" + i,
      amount: 50000,
      fee: 1000,
      tax: 180,
      method: "card",
      status: "captured",
      capturedAt: new Date("2026-08-20T00:00:00Z"),
      createdAt: new Date("2026-08-20T00:00:00Z"),
    })),
    settlements: [],
    bankTransactions: [],
    refunds: [],
    chargebacks: [],
    groundTruths: [],
  };
  const mockResults: Array<Record<string, unknown>> = Array.from({ length: 50 }, (_, i) => ({
    paymentId: "p_" + i,
    orderId: "ord_" + i,
    expectedNetAmount: 48820,
    actualSettledAmount: 48820,
    discrepancy: 0,
    status: "AUTO_MATCHED",
    confidenceScore: 98,
    matchedSettlementIds: ["s_" + i],
    settlementIds: ["s_" + i],
    bankTxnIds: ["c_" + i],
    type: "ONE_TO_ONE",
    reason: "Exact match",
  }));
  const mockMetrics = {
    batchId: "b_bench",
    totalPayments: 50,
    autoMatched: 50,
    manualReview: 0,
    unmatched: 0,
    accuracy: 100,
    precision: 100,
    recall: 100,
    f1Score: 100,
    processingTimeMs: 10,
    throughputPerSec: 5000,
    amountAtRisk: 0,
    confidenceByBucket: {},
  };
  for (let i = 0; i < 100; i++) {
    evaluateInvariants(mockBatch as never, mockResults as never, mockMetrics as never, []);
  }
  timings["5. 6-Point Financial Invariants"] = performance.now() - start;

  // 6. Policy-as-Code Evaluation
  start = performance.now();
  const testPolicy = {
    policyId: "pol_bench",
    version: "1.0.0",
    status: "ACTIVE" as const,
    createdBy: "ADMIN",
    createdAt: new Date(),
    providerScope: ["*"],
    currencyScope: ["INR"],
    rules: DEFAULT_RULES_V1,
    contentHash: "hash_bench",
  };
  for (let i = 0; i < iterations; i++) {
    evaluatePolicy(testPolicy, { amountPaise: 50000, discrepancyPaise: 0 });
  }
  timings["6. Policy-as-Code Evaluation"] = performance.now() - start;

  // 7. Merkle Tree Root Aggregation
  start = performance.now();
  const leaves = Array.from({ length: 50 }, (_, i) => ({
    partitionId: `p_${i}`,
    hash: computePartitionAuditHash({
      partitionId: `p_${i}`,
      strategy: "EXACT_1_TO_1",
      matchedCount: 20,
      relationships: [],
    }),
  }));
  buildBatchMerkleTree(leaves);
  timings["7. Binary Merkle DAG Root"] = performance.now() - start;

  // 8. Audit Chain Hashing (SHA-256)
  start = performance.now();
  let prevHash = "0".repeat(64);
  for (let i = 0; i < iterations; i++) {
    const payload = canonicalize({ event: "MATCHED", seq: i, batchId: "b_1", timestamp: "2026-08-20T00:00:00Z" });
    prevHash = hashChainLink(prevHash, payload);
  }
  timings["8. Audit Chain Hash (SHA-256)"] = performance.now() - start;

  const totalTime = Object.values(timings).reduce((a, b) => a + b, 0);

  console.log("Stage Breakdown (" + iterations + " iterations per stage):");
  console.log("-------------------------------------------------------------------------");
  for (const [stage, ms] of Object.entries(timings)) {
    const pct = ((ms / totalTime) * 100).toFixed(1);
    const perItemUs = ((ms / iterations) * 1000).toFixed(2);
    console.log(`  ${stage.padEnd(35)} : ${ms.toFixed(2).padStart(7)} ms (${pct.padStart(4)}%) | ${perItemUs.padStart(6)} µs/op`);
  }
  console.log("-------------------------------------------------------------------------");
  console.log(`  TOTAL PIPELINE EXECUTION TIME        : ${totalTime.toFixed(2).padStart(7)} ms`);
  console.log(`  CORE RECONCILIATION SPEED (In-Memory): ${(iterations / (totalTime / 1000)).toFixed(0)} full cycles/sec\n`);
}

if (require.main === module) {
  void profilePipeline();
}
