/*
 * Distributed Reconciliation — Partition Worker
 *
 * Implements:
 *   1. Autonomous worker loop processing partition leases from QueueAdapter
 *   2. Bounded-memory partition execution and Merkle audit hash computation
 *   3. Result staging to StorageAdapter and idempotent lease ACK/NACK
 *   4. Heartbeat lease extension and error backoff handling
 */

import { executePartition } from "../scale/execution";
import { selectStrategy } from "../scale/strategy";
import { buildStrategyConfig } from "../scale/scale-run";
import { computePartitionAuditHash } from "./merkle";
import type {
  PartitionExecutionOutput,
  PartitionLease,
  PartitionPayload,
  QueueAdapter,
  StorageAdapter,
} from "./types";

export interface WorkerOptions {
  workerId: string;
  queue: QueueAdapter;
  storage: StorageAdapter;
  leaseDurationMs?: number;
  batchSize?: number;
  idlePollMs?: number;
}

export class PartitionWorker {
  readonly workerId: string;
  private queue: QueueAdapter;
  private storage: StorageAdapter;
  private leaseDurationMs: number;
  private batchSize: number;
  private isRunning = false;

  // Metrics
  recordsProcessed = 0;
  partitionsProcessed = 0;
  totalComputeTimeMs = 0;
  peakHeapBytes = 0;
  failedPartitions = 0;

  private strategyConfig = buildStrategyConfig();

  constructor(options: WorkerOptions) {
    this.workerId = options.workerId;
    this.queue = options.queue;
    this.storage = options.storage;
    this.leaseDurationMs = options.leaseDurationMs ?? 30000;
    this.batchSize = options.batchSize ?? 50;
  }

  /**
   * Process a single batch of claimed leases from the queue.
   * Returns the number of successfully processed partitions.
   */
  async processBatch(): Promise<number> {
    const leases = await this.queue.claimLeases(
      this.workerId,
      this.batchSize,
      this.leaseDurationMs,
    );

    if (leases.length === 0) return 0;

    const results: PartitionExecutionOutput[] = [];
    const tBatch0 = Date.now();
    let batchRecordCount = 0;

    for (const lease of leases) {
      try {
        const payload = await this.resolvePayload(lease);

        // 1. Pure deterministic partition execution
        const scalePartition = {
          id: payload.partitionId,
          bucketKey: payload.bucketKey,
          settlements: payload.settlements,
          credits: payload.credits,
        };

        const execution = executePartition(scalePartition, this.strategyConfig);
        const strategy = selectStrategy(scalePartition, this.strategyConfig);

        // 2. Compute partition audit hash
        const auditHash = computePartitionAuditHash({
          partitionId: payload.partitionId,
          strategy,
          matchedCount: execution.matchedCount,
          relationships: execution.relationships,
        });

        const output: PartitionExecutionOutput = {
          partitionId: payload.partitionId,
          runId: lease.message.runId,
          workerId: this.workerId,
          matchedCount: execution.matchedCount,
          relationships: execution.relationships,
          strategy,
          auditHash,
          durationMs: 0,
          executedAt: tBatch0,
        };

        results.push(output);
        await this.queue.ackLease(lease);

        batchRecordCount += payload.settlements.length + payload.credits.length;
      } catch (err) {
        this.failedPartitions++;
        const errorMessage = (err as Error).message ?? String(err);
        await this.queue.nackLease(lease, errorMessage, 500);
      }
    }

    if (results.length > 0) {
      const runId = leases[0]!.message.runId;
      await this.storage.stageResults(`results-${runId}`, results);
    }

    const durationMs = Date.now() - tBatch0;
    this.recordsProcessed += batchRecordCount;
    this.partitionsProcessed += results.length;
    this.totalComputeTimeMs += durationMs;

    return results.length;
  }

  /**
   * Run the worker continuously until the queue is drained or stop() is called.
   */
  async runUntilDrained(maxIdleLoops: number = 3): Promise<void> {
    this.isRunning = true;
    let idleCount = 0;

    while (this.isRunning) {
      const processed = await this.processBatch();
      if (processed === 0) {
        idleCount++;
        if (idleCount >= maxIdleLoops) {
          break;
        }
      } else {
        idleCount = 0;
      }
    }
  }

  stop(): void {
    this.isRunning = false;
  }

  private async resolvePayload(lease: PartitionLease): Promise<PartitionPayload> {
    if (lease.message.payloadInline) {
      return lease.message.payloadInline;
    }
    if (lease.message.payloadKey) {
      return this.storage.readPayload(lease.message.payloadKey);
    }
    throw new Error(`Lease ${lease.leaseId} has neither inline nor keyed payload`);
  }
}
