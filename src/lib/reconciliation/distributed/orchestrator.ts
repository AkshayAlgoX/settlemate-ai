/*
 * Distributed Reconciliation — Distributed Orchestrator
 *
 * Coordinates:
 *   1. Deterministic candidate partitioning
 *   2. Payload staging and batch queue ingestion
 *   3. Concurrent worker pool execution (W workers)
 *   4. Merkle audit tree synthesis and cluster report generation
 */

import { randomUUID } from "node:crypto";
import { partitionCandidates } from "../scale/clusters";
import { SCALE_CONFIG } from "../scale/buckets";
import type { NormalizedBankTxn, NormalizedSettlement } from "../types";
import { buildBatchMerkleTree } from "./merkle";
import { InMemoryDistributedQueue } from "./queue";
import { InMemoryStorageAdapter } from "./storage";
import type {
  DistributedScaleReport,
  PartitionMessage,
  PartitionPayload,
  QueueAdapter,
  StorageAdapter,
} from "./types";
import { PartitionWorker } from "./worker";

export interface DistributedOrchestratorOptions {
  batchId: string;
  runId?: string;
  workerCount?: number;
  queue?: QueueAdapter;
  storage?: StorageAdapter;
  offloadPayloadToStorage?: boolean;
  partitionWindowMs?: number;
}

export class DistributedOrchestrator {
  private queue: QueueAdapter;
  private storage: StorageAdapter;
  private workerCount: number;
  private batchId: string;
  private runId: string;
  private offloadPayloadToStorage: boolean;
  private partitionWindowMs: number;

  constructor(options: DistributedOrchestratorOptions) {
    this.batchId = options.batchId;
    this.runId = options.runId ?? `dist-run-${randomUUID().slice(0, 8)}`;
    this.workerCount = Math.max(1, options.workerCount ?? 4);
    this.queue = options.queue ?? new InMemoryDistributedQueue();
    this.storage = options.storage ?? new InMemoryStorageAdapter();
    this.offloadPayloadToStorage = options.offloadPayloadToStorage ?? false;
    this.partitionWindowMs = options.partitionWindowMs ?? SCALE_CONFIG.partitionWindowMs;
  }

  async runReconciliation(
    settlements: NormalizedSettlement[],
    credits: NormalizedBankTxn[],
  ): Promise<DistributedScaleReport> {
    const t0 = Date.now();
    const initialHeap = process.memoryUsage().heapUsed;

    // 1. Deterministic Partition Planning
    const tPlan0 = Date.now();
    const partitions = partitionCandidates(
      settlements,
      credits,
      this.partitionWindowMs,
    );

    const totalRecords = settlements.length + credits.length;

    // 2. Stage Payloads & Prepare Queue Messages
    const messages: PartitionMessage[] = [];
    for (const p of partitions) {
      const payload = {
        partitionId: p.id,
        bucketKey: p.bucketKey,
        settlements: p.settlements,
        credits: p.credits,
      };

      let payloadKey: string | undefined;
      let payloadInline = payload;

      if (this.offloadPayloadToStorage) {
        payloadKey = `payload-${this.runId}-${p.id}`;
        await this.storage.stagePayload(payloadKey, payload);
        payloadInline = undefined as unknown as typeof payload;
      }

      messages.push({
        messageId: `msg-${this.runId}-${p.id}`,
        runId: this.runId,
        batchId: this.batchId,
        partitionId: p.id,
        bucketKey: p.bucketKey,
        settlementCount: p.settlements.length,
        creditCount: p.credits.length,
        payloadKey,
        payloadInline,
        enqueuedAt: Date.now(),
        attempt: 0,
      });
    }

    // 3. Batch Enqueue Messages
    const CHUNK_SIZE = 1000;
    for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
      await this.queue.enqueueBatch(messages.slice(i, i + CHUNK_SIZE));
    }
    const planningMs = Date.now() - tPlan0;

    // 4. Initialize & Launch Worker Pool
    const workers: PartitionWorker[] = [];
    for (let i = 0; i < this.workerCount; i++) {
      workers.push(
        new PartitionWorker({
          workerId: `worker-${i + 1}`,
          queue: this.queue,
          storage: this.storage,
          batchSize: 50,
        }),
      );
    }

    // Execute workers concurrently
    const tWorker0 = Date.now();
    await Promise.all(workers.map((w) => w.runUntilDrained()));
    const workerExecutionMs = Math.max(1, Date.now() - tWorker0);

    // 5. Gather Staged Results & Build Merkle Audit Tree
    const tMerkle0 = Date.now();
    const stagedResults = await this.storage.readResults(`results-${this.runId}`);
    const partitionAuditHashes = stagedResults.map((r) => ({
      partitionId: r.partitionId,
      hash: r.auditHash,
    }));

    const { rootHash } = buildBatchMerkleTree(partitionAuditHashes);
    const merkleBuildMs = Date.now() - tMerkle0;

    const wallTimeMs = Math.max(1, Date.now() - t0);

    // 6. Compute Cluster Report Metrics
    const queueMetrics = await this.queue.getMetrics();
    const strategyCounts = { indexed: 0, bounded: 0, review: 0 };
    for (const r of stagedResults) {
      if (r.strategy === "INDEXED") strategyCounts.indexed++;
      else if (r.strategy === "BOUNDED") strategyCounts.bounded++;
      else strategyCounts.review++;
    }

    const totalComputeTimeMs = workers.reduce((acc, w) => acc + w.totalComputeTimeMs, 0);
    const workerUtilizationPct = Math.min(
      100,
      Math.round((totalComputeTimeMs / (workerExecutionMs * this.workerCount)) * 1000) / 10,
    );

    const throughputRps = Math.round((totalRecords / (wallTimeMs / 1000)) * 10) / 10;
    const recordsPerWorkerSec = Math.round((totalRecords / (workerExecutionMs / 1000) / this.workerCount) * 10) / 10;
    const partitionsPerSec = Math.round((partitions.length / (workerExecutionMs / 1000)) * 10) / 10;

    const finalHeap = process.memoryUsage().heapUsed;
    const peakHeapMB = Math.round(Math.max(initialHeap, finalHeap) / (1024 * 1024));
    const peakHeapMBPerWorker = Math.round(peakHeapMB / this.workerCount);

    const scalingEfficiencyPct = Math.min(
      100,
      Math.round((totalComputeTimeMs / (workerExecutionMs * this.workerCount || 1)) * 100),
    );

    return {
      totalRecords,
      totalPartitions: partitions.length,
      workerCount: this.workerCount,
      wallTimeMs,
      planningMs,
      workerExecutionMs,
      merkleBuildMs,
      totalComputeTimeMs,
      workerUtilizationPct,
      throughputRps,
      recordsPerWorkerSec,
      partitionsPerSec,
      peakHeapMB,
      peakHeapMBPerWorker,
      scalingEfficiencyPct,
      merkleRoot: rootHash,
      deadLetterCount: queueMetrics.deadLetterCount,
      retryCount: queueMetrics.retryCount,
      strategyCounts,
    };
  }

  /**
   * Execute reconciliation over an asynchronous stream of partition payloads.
   * Eliminates the need to hold whole-batch datasets in memory at any point.
   */
  async runStreamingReconciliation(
    partitionGenerator: () => AsyncGenerator<PartitionPayload[], void, unknown> | Generator<PartitionPayload[], void, unknown>,
  ): Promise<DistributedScaleReport> {
    const t0 = Date.now();
    const initialHeap = process.memoryUsage().heapUsed;

    let totalRecords = 0;
    let totalPartitions = 0;

    // Launch persistent worker pool
    const workers: PartitionWorker[] = [];
    for (let i = 0; i < this.workerCount; i++) {
      workers.push(
        new PartitionWorker({
          workerId: `worker-${i + 1}`,
          queue: this.queue,
          storage: this.storage,
          batchSize: 100,
        }),
      );
    }

    let producerDone = false;
    const tWorker0 = Date.now();

    // Start persistent workers draining queue
    const workerPromises = workers.map(async (w) => {
      while (true) {
        const processed = await w.processBatch();
        if (processed === 0) {
          const metrics = await this.queue.getMetrics();
          if (producerDone && metrics.pendingCount === 0 && metrics.runningLeases === 0) {
            break;
          }
          await new Promise((r) => setImmediate(r));
        }
      }
    });

    // Continuously stream chunks into queue
    for await (const partitionChunk of partitionGenerator()) {
      const messages: PartitionMessage[] = [];
      for (const p of partitionChunk) {
        totalPartitions++;
        totalRecords += p.settlements.length + p.credits.length;

        let payloadKey: string | undefined;
        let payloadInline: PartitionPayload | undefined = p;

        if (this.offloadPayloadToStorage) {
          payloadKey = `payload-${this.runId}-${p.partitionId}`;
          await this.storage.stagePayload(payloadKey, p);
          payloadInline = undefined;
        }

        messages.push({
          messageId: `msg-${this.runId}-${p.partitionId}`,
          runId: this.runId,
          batchId: this.batchId,
          partitionId: p.partitionId,
          bucketKey: p.bucketKey,
          settlementCount: p.settlements.length,
          creditCount: p.credits.length,
          payloadKey,
          payloadInline,
          enqueuedAt: Date.now(),
          attempt: 0,
        });
      }

      await this.queue.enqueueBatch(messages);

      // Bounded-memory backpressure guard: prevents queue bloat when streaming millions of records
      let qMetrics = await this.queue.getMetrics();
      while (qMetrics.pendingCount > 5000) {
        await new Promise((resolve) => setTimeout(resolve, 5));
        qMetrics = await this.queue.getMetrics();
      }
    }
    producerDone = true;

    // Await all workers to drain
    await Promise.all(workerPromises);
    const planningMs = 0; // Streamed in-line
    const workerExecutionMs = Math.max(1, Date.now() - tWorker0);

    const tMerkle0 = Date.now();
    const stagedResults = await this.storage.readResults(`results-${this.runId}`);
    const partitionAuditHashes = stagedResults.map((r) => ({
      partitionId: r.partitionId,
      hash: r.auditHash,
    }));

    const { rootHash } = buildBatchMerkleTree(partitionAuditHashes);
    const merkleBuildMs = Date.now() - tMerkle0;

    const wallTimeMs = Math.max(1, Date.now() - t0);

    const queueMetrics = await this.queue.getMetrics();
    const strategyCounts = { indexed: 0, bounded: 0, review: 0 };
    for (const r of stagedResults) {
      if (r.strategy === "INDEXED") strategyCounts.indexed++;
      else if (r.strategy === "BOUNDED") strategyCounts.bounded++;
      else strategyCounts.review++;
    }

    const totalComputeTimeMs = workers.reduce((acc, w) => acc + w.totalComputeTimeMs, 0);
    const workerUtilizationPct = Math.min(
      100,
      Math.round((totalComputeTimeMs / (workerExecutionMs * this.workerCount)) * 1000) / 10,
    );

    const throughputRps = Math.round((totalRecords / (wallTimeMs / 1000)) * 10) / 10;
    const recordsPerWorkerSec = Math.round((totalRecords / (workerExecutionMs / 1000) / this.workerCount) * 10) / 10;
    const partitionsPerSec = Math.round((totalPartitions / (workerExecutionMs / 1000)) * 10) / 10;

    const finalHeap = process.memoryUsage().heapUsed;
    const peakHeapMB = Math.round(Math.max(initialHeap, finalHeap) / (1024 * 1024));
    const peakHeapMBPerWorker = Math.round(peakHeapMB / this.workerCount);

    const scalingEfficiencyPct = Math.min(
      100,
      Math.round((totalComputeTimeMs / (workerExecutionMs * this.workerCount || 1)) * 100),
    );

    return {
      totalRecords,
      totalPartitions,
      workerCount: this.workerCount,
      wallTimeMs,
      planningMs,
      workerExecutionMs,
      merkleBuildMs,
      totalComputeTimeMs,
      workerUtilizationPct,
      throughputRps,
      recordsPerWorkerSec,
      partitionsPerSec,
      peakHeapMB,
      peakHeapMBPerWorker,
      scalingEfficiencyPct,
      merkleRoot: rootHash,
      deadLetterCount: queueMetrics.deadLetterCount,
      retryCount: queueMetrics.retryCount,
      strategyCounts,
    };
  }
}
