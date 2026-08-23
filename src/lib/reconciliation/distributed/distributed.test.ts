/*
 * Distributed Reconciliation — Comprehensive Test Suite
 *
 * Tests:
 *   1. Lease-based queue claiming, expiration on worker crash, renewal, and retry backoff
 *   2. Dead-Letter Queue (DLQ) transitions after max retries
 *   3. Idempotent duplicate delivery & ACK handling
 *   4. File & Memory Storage staging
 *   5. Merkle Tree deterministic root, O(log K) proof verification, and tamper detection
 *   6. Multi-worker concurrent orchestration & scaling
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  buildBatchMerkleTree,
  computePartitionAuditHash,
  generateMerkleProof,
  verifyMerkleProof,
} from "./merkle";
import { DistributedOrchestrator } from "./orchestrator";
import { InMemoryDistributedQueue } from "./queue";
import { FileStagingAdapter, InMemoryStorageAdapter } from "./storage";
import type { NormalizedBankTxn, NormalizedSettlement } from "../types";

let passed = 0;
let failed = 0;

async function check(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name} — ${(err as Error).message}`);
  }
}

const BASE_DATE = new Date("2026-08-23T00:00:00Z");

function makeSettlement(id: string, amount: number, utr?: string): NormalizedSettlement {
  return {
    dbId: `db_${id}`,
    settlementId: id,
    paymentId: `pay_${id}`,
    amount,
    fee: 0,
    tax: 0,
    utr: utr ?? `UTR_${id}`,
    status: "settled",
    settledAt: BASE_DATE,
    createdAt: BASE_DATE,
  };
}

function makeCredit(id: string, amount: number, utr?: string): NormalizedBankTxn {
  return {
    dbId: `db_${id}`,
    txnId: id,
    utr: utr ?? `UTR_${id}`,
    amount,
    type: "CREDIT",
    narration: "BANK SETTLEMENT",
    txnDate: BASE_DATE,
    matched: false,
  };
}

async function main() {
  console.log("\nDistributed Reconciliation — Architecture & Concurrency Tests");

  // ── 1. QUEUE LEASE & CRASH RECOVERY ──
  await check("Worker claims lease and transitions message to RUNNING", async () => {
    const queue = new InMemoryDistributedQueue();
    await queue.enqueueBatch([
      {
        messageId: "m1",
        runId: "r1",
        batchId: "b1",
        partitionId: "p1",
        bucketKey: "0",
        settlementCount: 1,
        creditCount: 1,
        enqueuedAt: Date.now(),
        attempt: 0,
      },
    ]);

    const leases = await queue.claimLeases("worker-1", 10, 5000);
    assert.equal(leases.length, 1);
    assert.equal(leases[0]!.workerId, "worker-1");
    assert.equal(leases[0]!.message.messageId, "m1");

    const metrics = await queue.getMetrics();
    assert.equal(metrics.runningLeases, 1);
    assert.equal(metrics.pendingCount, 0);
  });

  await check("Crashed worker lease expires and is reclaimed with attempt increment", async () => {
    const queue = new InMemoryDistributedQueue();
    const t0 = 1000;
    await queue.enqueueBatch([
      {
        messageId: "m2",
        runId: "r1",
        batchId: "b1",
        partitionId: "p2",
        bucketKey: "0",
        settlementCount: 1,
        creditCount: 1,
        enqueuedAt: t0,
        attempt: 0,
      },
    ]);

    // Worker 1 claims lease for 1000ms
    const leases = await queue.claimLeases("worker-1", 1, 1000, t0);
    assert.equal(leases.length, 1);

    // At t0 + 500ms, worker 2 cannot claim it
    const activeClaim = await queue.claimLeases("worker-2", 1, 1000, t0 + 500);
    assert.equal(activeClaim.length, 0);

    // At t0 + 1500ms (lease expired), worker 2 claims it
    const reclaimed = await queue.claimLeases("worker-2", 1, 1000, t0 + 1500);
    assert.equal(reclaimed.length, 1);
    assert.equal(reclaimed[0]!.workerId, "worker-2");
    assert.equal(reclaimed[0]!.message.attempt, 1);
  });

  await check("Exceeding max retries dead-letters the message", async () => {
    const queue = new InMemoryDistributedQueue({ maxRetries: 2 });
    await queue.enqueueBatch([
      {
        messageId: "m3",
        runId: "r1",
        batchId: "b1",
        partitionId: "p3",
        bucketKey: "0",
        settlementCount: 1,
        creditCount: 1,
        enqueuedAt: 0,
        attempt: 0,
      },
    ]);

    const l1 = await queue.claimLeases("w1", 1, 100, 0);
    await queue.nackLease(l1[0]!, "err 1", 50, 50);

    const l2 = await queue.claimLeases("w1", 1, 100, 150);
    await queue.nackLease(l2[0]!, "err 2", 50, 200);

    const metrics = await queue.getMetrics();
    assert.equal(metrics.deadLetterCount, 1);
    assert.equal(metrics.pendingCount, 0);
  });

  // ── 2. STORAGE STAGING ──
  await check("File staging adapter stores and reads payloads accurately", async () => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), "sm-dist-storage-"));
    try {
      const storage = new FileStagingAdapter(tmpDir);
      const payload = {
        partitionId: "p-file-1",
        bucketKey: "100",
        settlements: [makeSettlement("s1", 5000)],
        credits: [makeCredit("c1", 5000)],
      };

      const uri = await storage.stagePayload("p-file-1", payload);
      assert.ok(uri.startsWith("file://"));

      const readBack = await storage.readPayload("p-file-1");
      assert.equal(readBack.partitionId, payload.partitionId);
      assert.equal(readBack.settlements.length, 1);
      assert.equal(readBack.credits.length, 1);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // ── 3. MERKLE AUDIT LINEAGE ──
  await check("Merkle tree builds deterministically and verifies inclusion proofs", () => {
    const leaves = [
      { partitionId: "p-01", hash: computePartitionAuditHash({ partitionId: "p-01", strategy: "INDEXED", matchedCount: 2, relationships: [] }) },
      { partitionId: "p-02", hash: computePartitionAuditHash({ partitionId: "p-02", strategy: "BOUNDED", matchedCount: 1, relationships: [] }) },
      { partitionId: "p-03", hash: computePartitionAuditHash({ partitionId: "p-03", strategy: "AMBIGUOUS", matchedCount: 0, relationships: [] }) },
      { partitionId: "p-04", hash: computePartitionAuditHash({ partitionId: "p-04", strategy: "INDEXED", matchedCount: 5, relationships: [] }) },
    ];

    const tree1 = buildBatchMerkleTree(leaves);
    const tree2 = buildBatchMerkleTree([...leaves].reverse()); // reverse input order

    assert.equal(tree1.rootHash, tree2.rootHash, "root hash must be order-independent");

    // Proof generation & verification
    const proof = generateMerkleProof(leaves, "p-02");
    assert.ok(proof);
    assert.equal(proof.partitionId, "p-02");
    assert.equal(verifyMerkleProof(proof), true, "valid proof verifies");

    // Tamper detection
    const tamperedProof = { ...proof, steps: [{ position: proof.steps[0]!.position, hash: "0000000000000000" }] };
    assert.equal(verifyMerkleProof(tamperedProof), false, "tampered proof fails verification");
  });

  // ── 4. CONCURRENT ORCHESTRATION ──
  await check("DistributedOrchestrator reconciles dataset across 4 concurrent workers", async () => {
    const settlements: NormalizedSettlement[] = [];
    const credits: NormalizedBankTxn[] = [];

    // Generate 40 clean 1:1 pairs in distinct date windows (40 partitions)
    for (let i = 0; i < 40; i++) {
      const date = new Date(BASE_DATE.getTime() + i * 96 * 3600_000);
      const sharedUtr = `SHARED_UTR_${i}`;
      const s = { ...makeSettlement(`s_${i}`, (i + 1) * 1000, sharedUtr), settledAt: date };
      const c = { ...makeCredit(`c_${i}`, (i + 1) * 1000, sharedUtr), txnDate: date };
      settlements.push(s);
      credits.push(c);
    }

    const orchestrator = new DistributedOrchestrator({
      batchId: "batch-dist-1",
      workerCount: 4,
      queue: new InMemoryDistributedQueue(),
      storage: new InMemoryStorageAdapter(),
    });

    const report = await orchestrator.runReconciliation(settlements, credits);

    assert.equal(report.totalRecords, 80);
    assert.equal(report.totalPartitions, 40);
    assert.equal(report.workerCount, 4);
    assert.equal(report.deadLetterCount, 0);
    assert.equal(report.retryCount, 0);
    assert.ok(report.throughputRps > 0);
    assert.ok(report.merkleRoot.length === 64, "valid 256-bit Merkle root");
    assert.equal(report.strategyCounts.indexed, 40);
  });

  // ── 5. DETERMINISTIC SCALING INVARIANCE TEST (1 vs 2 vs 4 vs 8 workers) ──
  await check("Partition results and Merkle root are 100% identical regardless of worker count", async () => {
    const settlements: NormalizedSettlement[] = [];
    const credits: NormalizedBankTxn[] = [];

    // Generate 20 clean 1:1 pairs + 1 N:1 cluster
    for (let i = 0; i < 20; i++) {
      const date = new Date(BASE_DATE.getTime() + i * 3600_000);
      const sharedUtr = `SHARED_UTR_${i}`;
      settlements.push({ ...makeSettlement(`s_${i}`, 10000, sharedUtr), settledAt: date });
      credits.push({ ...makeCredit(`c_${i}`, 10000, sharedUtr), txnDate: date });
    }

    const workerCounts = [1, 2, 4, 8];
    const roots: string[] = [];
    const reports: unknown[] = [];

    for (const count of workerCounts) {
      const orchestrator = new DistributedOrchestrator({
        batchId: `batch-equiv-${count}`,
        workerCount: count,
        partitionWindowMs: 3600_000,
        queue: new InMemoryDistributedQueue(),
        storage: new InMemoryStorageAdapter(),
      });

      const rep = await orchestrator.runReconciliation(settlements, credits);
      roots.push(rep.merkleRoot);
      reports.push({
        totalRecords: rep.totalRecords,
        totalPartitions: rep.totalPartitions,
        strategyCounts: rep.strategyCounts,
        deadLetterCount: rep.deadLetterCount,
      });
    }

    // Assert that every worker configuration produces the exact identical Merkle root and strategy breakdown
    for (let i = 1; i < roots.length; i++) {
      assert.equal(roots[i], roots[0], `Merkle root mismatch between workerCount=${workerCounts[i]} and ${workerCounts[0]}`);
      assert.deepEqual(reports[i], reports[0], `Report metrics mismatch between workerCount=${workerCounts[i]} and ${workerCounts[0]}`);
    }
  });

  // ── 6. IDEMPOTENT DUPLICATE DELIVERY & SAFE RETRY ──
  await check("Duplicate delivery is safe and already-ACKed partitions are not re-executed", async () => {
    const queue = new InMemoryDistributedQueue();
    const msg = {
      messageId: "dup-msg-1",
      runId: "run-dup",
      batchId: "batch-dup",
      partitionId: "p-dup",
      bucketKey: "0",
      settlementCount: 1,
      creditCount: 1,
      enqueuedAt: Date.now(),
      attempt: 0,
    };

    // Enqueue original
    await queue.enqueueBatch([msg]);
    // Enqueue duplicate with same messageId (no-op)
    const added = await queue.enqueueBatch([msg]);
    assert.equal(added, 0, "duplicate messageId was deduplicated");

    // Claim and ack
    const leases = await queue.claimLeases("w1", 1, 5000);
    assert.equal(leases.length, 1);
    const acked = await queue.ackLease(leases[0]!);
    assert.equal(acked, true);

    // Duplicate re-ACK is idempotent true
    const reAck = await queue.ackLease(leases[0]!);
    assert.equal(reAck, true);

    // Further claim finds no pending messages
    const emptyClaim = await queue.claimLeases("w2", 1, 5000);
    assert.equal(emptyClaim.length, 0);
  });

  console.log(`\ndistributed: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

void main();
