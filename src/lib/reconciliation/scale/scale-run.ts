/*
 * Scalable cardinality — orchestrator (buckets → partitions → durable execute → report).
 *
 * runScalableCardinality is the large-batch entry point (invoked by apply-cardinality.ts
 * above SCALE_CONFIG.scalableMinRecords). It:
 *   1. partitions the unresolved settlements + unused bulk credits deterministically,
 *   2. executes each partition through the durable/resumable layer (retry/backoff/dead-letter),
 *   3. collects the resolved relationships and a ScaleReport of measured cost.
 *
 * Relationship persistence is deliberately NOT done here — engine.ts persists
 * CardinalityLink rows only after the durable run COMPLETES, so a dead-lettered or
 * failed run writes nothing (no partial / duplicate writes). The durable layer tracks
 * compute progress; resume is achieved by re-invoking with the same runId (createScaleRun
 * is idempotent and claimNextPartition skips COMPLETED partitions).
 */

import type { CardinalityMatch } from "../cardinality";
import type {
  NormalizedBankTxn,
  NormalizedSettlement,
} from "../types";
import { SCALE_CONFIG } from "./buckets";
import { partitionCandidates, type ScalePartition } from "./clusters";
import { selectStrategy, type StrategyConfig } from "./strategy";
import { executePartition } from "./execution";
import {
  SCALE_PARTITION_STATUS,
  SCALE_RUN_STATUS,
  claimNextPartitionBatch,
  completePartitionBatch,
  countPartitionsByStatus,
  createScaleRun,
  finalizeScaleRun,
  type ClaimedPartition,
  type CompletePartitionInput,
} from "./durable";

export interface ScaleReport {
  partitionCount: number;
  candidateCount: number;
  maxClusterSize: number;
  resolvedBy: { indexed: number; bounded: number; review: number };
  retryCount: number;
  deadLetterCount: number;
  dbTimeMs: number;
  matchTimeMs: number;
  throughputRps: number;
  totalMatched: number;
}

export interface ScalePlan {
  partitions: ScalePartition[];
  candidateCount: number;
  maxClusterSize: number;
}

export function buildStrategyConfig(): StrategyConfig {
  return {
    tolerancePaise: SCALE_CONFIG.tolerancePaise,
    maxHours: SCALE_CONFIG.maxHours,
    boundedClusterMaxItems: SCALE_CONFIG.boundedClusterMaxItems,
  };
}

/** Pure planning: deterministic partitions + summary. No I/O. */
export function planScaleExecution(
  settlements: NormalizedSettlement[],
  credits: NormalizedBankTxn[],
): ScalePlan {
  const partitions = partitionCandidates(
    settlements,
    credits,
    SCALE_CONFIG.partitionWindowMs,
  );
  const candidateCount = settlements.length + credits.length;
  const maxClusterSize = partitions.reduce(
    (acc, p) =>
      Math.max(acc, p.settlements.length + p.credits.length),
    0,
  );
  return { partitions, candidateCount, maxClusterSize };
}

function strategyBucket(partition: ScalePartition): "indexed" | "bounded" | "review" {
  const strategy = selectStrategy(partition, buildStrategyConfig());
  if (strategy === "INDEXED") return "indexed";
  if (strategy === "BOUNDED") return "bounded";
  return "review";
}

export interface RunScalableCardinalityInput {
  batchId: string;
  runId: string;
  settlements: NormalizedSettlement[];
  credits: NormalizedBankTxn[];
}

export interface RunScalableCardinalityResult {
  relationships: CardinalityMatch[];
  report: ScaleReport;
}

/**
 * Execute the scalable cardinality pass for a large batch. Returns the resolved
 * relationships (to be persisted by the caller) plus a measured ScaleReport.
 */
export async function runScalableCardinality(
  input: RunScalableCardinalityInput,
): Promise<RunScalableCardinalityResult> {
  const empty = emptyResult(input.settlements, input.credits);
  const plan = planScaleExecution(input.settlements, input.credits);
  if (plan.partitions.length === 0) {
    return { relationships: [], report: { ...empty.report } };
  }

  const report: ScaleReport = {
    partitionCount: plan.partitions.length,
    candidateCount: plan.candidateCount,
    maxClusterSize: plan.maxClusterSize,
    resolvedBy: { indexed: 0, bounded: 0, review: 0 },
    retryCount: 0,
    deadLetterCount: 0,
    dbTimeMs: 0,
    matchTimeMs: 0,
    throughputRps: 0,
    totalMatched: 0,
  };

  const relationships: CardinalityMatch[] = [];
  const partitionById = new Map(
    plan.partitions.map((p) => [p.id, p]),
  );

  let t = nowMs();
  const created = await createScaleRun({
    batchId: input.batchId,
    runId: input.runId,
    partitions: plan.partitions.map((p) => ({
      partitionId: p.id,
      bucketKey: p.bucketKey,
      settlementIds: p.settlements.map((s) => s.settlementId),
      creditIds: p.credits.map((c) => c.txnId),
    })),
  });
  report.dbTimeMs += nowMs() - t;

  let deadLettered = false;
  const BATCH_SIZE = 250;

  // Bounded retry sweeps: claim runnable partition batches, execute, complete in batch.
  // claimNextPartitionBatch skips COMPLETED partitions and only returns FAILED ones whose
  // backoff has elapsed — so re-invoking this function resumes a run after a failure.
  for (let sweep = 0; sweep < SCALE_CONFIG.maxRetries; sweep += 1) {
    let claimedBatch = await nextClaimBatch(created.scaleRunId, BATCH_SIZE, report);
    if (claimedBatch.length === 0) break;

    while (claimedBatch.length > 0) {
      const completionItems: CompletePartitionInput[] = [];

      for (const claimed of claimedBatch) {
        const partition = partitionById.get(claimed.partitionId);
        if (partition) {
          t = nowMs();
          const execution = executePartition(partition, buildStrategyConfig());
          report.matchTimeMs += nowMs() - t;

          const bucket = strategyBucket(partition);
          report.resolvedBy[bucket] += 1;
          report.totalMatched += execution.matchedCount;
          relationships.push(...execution.relationships);

          completionItems.push({
            scaleRunId: created.scaleRunId,
            partitionId: claimed.partitionId,
            matchedCount: execution.matchedCount,
            bucket,
          });
        } else {
          report.retryCount += 1;
        }
      }

      t = nowMs();
      await completePartitionBatch(created.scaleRunId, completionItems);
      report.dbTimeMs += nowMs() - t;

      claimedBatch = await nextClaimBatch(created.scaleRunId, BATCH_SIZE, report);
    }

    if (await hasDeadLetters(created.scaleRunId)) {
      deadLettered = true;
      break;
    }
  }

  const terminal = await finalizeScaleRun(
    created.scaleRunId,
    deadLettered ? SCALE_RUN_STATUS.DEAD_LETTER : SCALE_RUN_STATUS.COMPLETED,
    JSON.stringify(report),
  );
  report.retryCount = terminal.retryCount;
  report.deadLetterCount = terminal.deadLetterCount;

  const totalMs = Math.max(report.dbTimeMs + report.matchTimeMs, 1);
  report.throughputRps = Math.round((report.candidateCount / (totalMs / 1000)) * 10) / 10;

  return {
    relationships: deadLettered ? [] : relationships,
    report,
  };
}

function emptyResult(
  settlements: NormalizedSettlement[],
  credits: NormalizedBankTxn[],
): RunScalableCardinalityResult {
  return {
    relationships: [],
    report: {
      partitionCount: 0,
      candidateCount: settlements.length + credits.length,
      maxClusterSize: 0,
      resolvedBy: { indexed: 0, bounded: 0, review: 0 },
      retryCount: 0,
      deadLetterCount: 0,
      dbTimeMs: 0,
      matchTimeMs: 0,
      throughputRps: 0,
      totalMatched: 0,
    },
  };
}

async function nextClaimBatch(
  scaleRunId: string,
  limit: number,
  report: ScaleReport,
): Promise<ClaimedPartition[]> {
  const t = nowMs();
  const claimed = await claimNextPartitionBatch(scaleRunId, limit);
  report.dbTimeMs += nowMs() - t;
  return claimed;
}

async function hasDeadLetters(scaleRunId: string): Promise<boolean> {
  return (await countPartitionsByStatus(scaleRunId, SCALE_PARTITION_STATUS.DEAD_LETTER)) > 0;
}

function nowMs(): number {
  return Date.now();
}
