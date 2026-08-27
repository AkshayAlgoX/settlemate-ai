/*
 * SettleMate AI — Deep Hot-Path Profiling & Micro-Benchmark Suite
 */

import { matchAllRecords } from "../src/lib/reconciliation/matcher";
import { buildIndexes } from "../src/lib/reconciliation/indexer";
import { generateScaleBatch } from "../src/lib/synthetic/scale-generator";
import { meetInTheMiddleSubsets } from "../src/lib/reconciliation/cardinality";
import {
  buildAmountIndexes,
  buildUtrIndexes,
} from "../src/lib/reconciliation/scale/buckets";
import { buildBatchMerkleTree } from "../src/lib/reconciliation/distributed/merkle";
import { DurablePartitionedQueue } from "../src/lib/reconciliation/distributed/durable-queue";
import { BoundedCrossPartitionResolver } from "../src/lib/reconciliation/distributed/cross-partition";
import type { BatchData } from "../src/lib/reconciliation/types";

export interface BenchmarkMetrics {
  name: string;
  operations: number;
  elapsedMs: number;
  opsPerSec: number;
}

export async function runMicroBenchmarks(): Promise<BenchmarkMetrics[]> {
  const results: BenchmarkMetrics[] = [];

  // 1. Core Matcher on 10,000 Records
  {
    const rawBatch = generateScaleBatch({
      seed: 20260825,
      size: 10000,
    });
    const batchData: BatchData = {
      payments: rawBatch.payments.map((p) => ({
        dbId: `db_pay_${p.paymentId}`,
        paymentId: p.paymentId,
        orderId: p.orderId,
        amount: p.amount,
        currency: "INR",
        status: "captured",
        method: "upi",
        fee: 0,
        tax: 0,
        capturedAt: p.createdAt,
        createdAt: p.createdAt,
      })),
      orders: rawBatch.orders.map((o) => ({
        dbId: `db_ord_${o.orderId}`,
        orderId: o.orderId,
        amount: o.amount,
        currency: "INR",
        status: "paid",
        createdAt: o.createdAt,
      })),
      settlements: rawBatch.settlements.map((s) => ({
        dbId: `db_set_${s.settlementId}`,
        settlementId: s.settlementId,
        paymentId: s.paymentId,
        amount: s.amount,
        fee: 0,
        tax: 0,
        status: "settled",
        createdAt: new Date(),
        settledAt: s.settledAt,
        utr: null,
      })),
      bankTransactions: rawBatch.bankTransactions.map((b) => ({
        dbId: `db_bnk_${b.txnId}`,
        txnId: b.txnId,
        amount: b.amount,
        currency: "INR",
        type: "CREDIT" as const,
        txnDate: b.txnDate,
        utr: null,
        narration: b.narration,
        rawText: b.narration ?? "",
        matched: false,
      })),
      refunds: [],
      chargebacks: [],
      groundTruths: [],
    };

    const start = performance.now();
    const indexes = buildIndexes(batchData);
    void matchAllRecords(batchData, indexes);
    const elapsed = performance.now() - start;

    results.push({
      name: "Core Matcher (10k records)",
      operations: rawBatch.payments.length,
      elapsedMs: Number(elapsed.toFixed(2)),
      opsPerSec: Math.round((rawBatch.payments.length / elapsed) * 1000),
    });
  }

  // 2. Meet-in-the-Middle Subset Sum Combinatorics (1,000 combinations)
  {
    const items = Array.from({ length: 16 }, (_, i) => ({ id: `item_${i}`, amount: (i + 1) * 1000 }));

    const start = performance.now();
    for (let i = 0; i < 500; i++) {
      meetInTheMiddleSubsets(items, (x) => x.amount, 15000);
    }
    const elapsed = performance.now() - start;

    results.push({
      name: "Meet-in-the-Middle Combinatorics (500 runs)",
      operations: 500,
      elapsedMs: Number(elapsed.toFixed(2)),
      opsPerSec: Math.round((500 / elapsed) * 1000),
    });
  }

  // 3. Scale Indexing & Bucketing (25,000 records)
  {
    const rawBatch = generateScaleBatch({
      seed: 20260825,
      size: 25000,
    });
    const normSettlements = rawBatch.settlements.map((s) => ({
      dbId: `db_set_${s.settlementId}`,
      settlementId: s.settlementId,
      paymentId: s.paymentId,
      amount: s.amount,
      fee: 0,
      tax: 0,
      status: "settled",
      createdAt: new Date(),
      settledAt: s.settledAt,
      utr: null,
    }));
    const normCredits = rawBatch.bankTransactions.map((b) => ({
      dbId: `db_bnk_${b.txnId}`,
      txnId: b.txnId,
      amount: b.amount,
      currency: "INR",
      type: "CREDIT" as const,
      txnDate: b.txnDate,
      utr: null,
      narration: b.narration,
      rawText: b.narration ?? "",
      matched: false,
    }));

    const start = performance.now();
    for (let i = 0; i < 5; i++) {
      buildAmountIndexes(normSettlements, normCredits);
      buildUtrIndexes(normSettlements, normCredits);
    }
    const elapsed = performance.now() - start;

    results.push({
      name: "Scale Amount & UTR Indexing (125k items total)",
      operations: normSettlements.length * 5,
      elapsedMs: Number(elapsed.toFixed(2)),
      opsPerSec: Math.round(((normSettlements.length * 5) / elapsed) * 1000),
    });
  }

  // 4. Batch Merkle DAG Construction (1,000 partitions)
  {
    const leaves = Array.from({ length: 1000 }, (_, i) => ({
      partitionId: `part_${i.toString().padStart(4, "0")}`,
      hash: "a7f92b4510c89e34d7821bc08912e7631029ba88921e3f890123cb89a109823f",
    }));

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      buildBatchMerkleTree(leaves);
    }
    const elapsed = performance.now() - start;

    results.push({
      name: "Merkle Tree DAG Construction (100k leaves hashed)",
      operations: 100000,
      elapsedMs: Number(elapsed.toFixed(2)),
      opsPerSec: Math.round((100000 / elapsed) * 1000),
    });
  }

  // 5. Durable Queue Monotonic Lease Acquisition (10,000 operations)
  {
    const queue = new DurablePartitionedQueue({ partitionCount: 16, leaseDurationMs: 10000 });
    queue.registerConsumer("perf-group", "perf-worker-1");

    const messages = Array.from({ length: 10000 }, (_, i) => ({
      messageId: `msg_${i}`,
      runId: "run_perf",
      batchId: "batch_perf",
      partitionId: `part_${i % 16}`,
      bucketKey: `${i % 16}`,
      settlementCount: 10,
      creditCount: 10,
      enqueuedAt: Date.now(),
      attempt: 0,
    }));

    const start = performance.now();
    void queue.publishBatch(messages);
    const polled = await queue.pollLeases("perf-group", "perf-worker-1", 10000);
    const elapsed = performance.now() - start;

    results.push({
      name: "Durable Queue Monotonic Lease Polling (10k msgs)",
      operations: polled.length,
      elapsedMs: Number(elapsed.toFixed(2)),
      opsPerSec: Math.round((polled.length / elapsed) * 1000),
    });
  }

  // 6. Cross-Partition Resolution (5,000 orphan pairs)
  {
    const resolver = new BoundedCrossPartitionResolver({ maxWindowDelta: 2 });
    const settlements = Array.from({ length: 2500 }, (_, i) => ({
      partitionId: `part_${i % 10}`,
      windowIndex: Math.floor(i / 250),
      settlement: {
        dbId: `db_set_cp_${i}`,
        settlementId: `set_cp_${i}`,
        amount: 50000,
        fee: 0,
        tax: 0,
        status: "settled",
        createdAt: new Date(1700000000000 + i * 1000),
        settledAt: new Date(1700000000000 + i * 1000),
        utr: `UTR_CP_${i}`,
        paymentId: `pay_cp_${i}`,
      },
    }));
    const credits = Array.from({ length: 2500 }, (_, i) => ({
      partitionId: `part_${(i + 1) % 10}`,
      windowIndex: Math.floor(i / 250),
      credit: {
        dbId: `db_bnk_cp_${i}`,
        txnId: `txn_cp_${i}`,
        amount: 50000,
        currency: "INR",
        type: "CREDIT" as const,
        txnDate: new Date(1700000000000 + i * 1000),
        utr: `UTR_CP_${i}`,
        narration: `UPI/UTR_CP_${i}`,
        rawText: `UPI/UTR_CP_${i}`,
        matched: false,
      },
    }));

    const start = performance.now();
    resolver.resolveCrossPartitionOrphans(settlements, credits);
    const elapsed = performance.now() - start;

    results.push({
      name: "Cross-Partition Boundary Resolution (5k items)",
      operations: 5000,
      elapsedMs: Number(elapsed.toFixed(2)),
      opsPerSec: Math.round((5000 / elapsed) * 1000),
    });
  }

  return results;
}

if (process.argv[1]?.endsWith("profile-hotpaths.ts")) {
  console.log("\n=========================================================================");
  console.log(" 🚀 SETTLEMATE AI — DEEP HOT-PATH MICRO-BENCHMARK PROFILER");
  console.log("=========================================================================\n");

  void runMicroBenchmarks().then((results) => {
    console.table(results);
  });
}
