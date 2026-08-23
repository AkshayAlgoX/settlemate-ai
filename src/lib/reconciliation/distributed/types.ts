/*
 * Distributed Reconciliation — Core Type Definitions
 *
 * Interfaces for:
 *   1. Lease-based queue abstraction (Redis Streams / Kafka / In-Memory worker pools)
 *   2. Object storage / Staging abstraction (S3 / Parquet / NDJSON / Chunk streams)
 *   3. Partition worker leases and heartbeats
 *   4. Partition-level Merkle DAG audit lineage
 *   5. Horizontal worker scaling and cluster reporting
 */

import type { CardinalityMatch } from "../cardinality";
import type { NormalizedBankTxn, NormalizedSettlement } from "../types";

export interface PartitionPayload {
  partitionId: string;
  bucketKey: string;
  settlements: NormalizedSettlement[];
  credits: NormalizedBankTxn[];
}

export interface PartitionMessage {
  messageId: string;
  runId: string;
  batchId: string;
  partitionId: string;
  bucketKey: string;
  settlementCount: number;
  creditCount: number;
  /** Storage key URI if payload is offloaded to object storage / staging */
  payloadKey?: string;
  /** Inlined payload for small / low-latency partitions */
  payloadInline?: PartitionPayload;
  enqueuedAt: number;
  attempt: number;
}

export interface PartitionLease {
  leaseId: string;
  message: PartitionMessage;
  workerId: string;
  acquiredAt: number;
  expiresAt: number;
  token: string;
}

export interface PartitionExecutionOutput {
  partitionId: string;
  runId: string;
  workerId: string;
  matchedCount: number;
  relationships: CardinalityMatch[];
  strategy: "INDEXED" | "BOUNDED" | "AMBIGUOUS";
  auditHash: string;
  durationMs: number;
  executedAt: number;
}

export interface QueueMetrics {
  pendingCount: number;
  runningLeases: number;
  completedCount: number;
  deadLetterCount: number;
  retryCount: number;
}

export interface QueueAdapter {
  enqueueBatch(messages: PartitionMessage[]): Promise<number>;
  claimLeases(
    workerId: string,
    maxLeases: number,
    leaseDurationMs: number,
    now?: number,
  ): Promise<PartitionLease[]>;
  renewLease(
    lease: PartitionLease,
    extensionMs: number,
    now?: number,
  ): Promise<boolean>;
  ackLease(lease: PartitionLease): Promise<boolean>;
  nackLease(
    lease: PartitionLease,
    error: string,
    backoffMs: number,
    now?: number,
  ): Promise<boolean>;
  getMetrics(): Promise<QueueMetrics>;
}

export interface StorageAdapter {
  stagePayload(key: string, payload: PartitionPayload): Promise<string>;
  readPayload(key: string): Promise<PartitionPayload>;
  stageResults(key: string, results: PartitionExecutionOutput[]): Promise<string>;
  readResults(key: string): Promise<PartitionExecutionOutput[]>;
}

export interface MerkleNode {
  hash: string;
  left?: MerkleNode;
  right?: MerkleNode;
  isLeaf: boolean;
  partitionId?: string;
}

export interface MerkleProofStep {
  position: "left" | "right";
  hash: string;
}

export interface MerkleProof {
  leafHash: string;
  partitionId: string;
  rootHash: string;
  steps: MerkleProofStep[];
}

export interface DistributedScaleReport {
  totalRecords: number;
  totalPartitions: number;
  workerCount: number;
  wallTimeMs: number;
  planningMs: number;
  workerExecutionMs: number;
  merkleBuildMs: number;
  totalComputeTimeMs: number;
  workerUtilizationPct: number;
  throughputRps: number;
  recordsPerWorkerSec: number;
  partitionsPerSec: number;
  peakHeapMB: number;
  peakHeapMBPerWorker: number;
  scalingEfficiencyPct: number;
  merkleRoot: string;
  deadLetterCount: number;
  retryCount: number;
  strategyCounts: {
    indexed: number;
    bounded: number;
    review: number;
  };
}
