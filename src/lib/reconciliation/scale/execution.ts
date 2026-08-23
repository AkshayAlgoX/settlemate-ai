/*
 * Scalable cardinality — bounded-memory per-partition execution (requirement 4).
 *
 * The durable orchestrator processes partitions one cluster at a time. This module is
 * the per-partition unit of work: it resolves a single partition to its relationships
 * and matched count, releasing the cluster's references once done. It never materializes
 * subset enumerations over the full set — only the current partition's arrays are in
 * scope. The strategy selector (strategy.ts) guarantees that a partition reaching the
 * bounded solver is tiny (<= boundedClusterMaxItems), so no exponential path exists.
 */

import type { CardinalityMatch } from "../cardinality";
import type { ScalePartition } from "./clusters";
import { resolvePartition, type StrategyConfig } from "./strategy";

export interface PartitionExecutionResult {
  relationships: CardinalityMatch[];
  /** Number of distinct source/target records consumed by the resolved relationships. */
  matchedCount: number;
}

/**
 * Execute one partition. Pure (no I/O). The caller owns durable bookkeeping; this is the
 * compute that a retried partition re-runs idempotently (same inputs → same output).
 */
export function executePartition(
  partition: ScalePartition,
  config: StrategyConfig,
): PartitionExecutionResult {
  const relationships = resolvePartition(partition, config);
  const matchedCount = countMatched(partition, relationships);
  return { relationships, matchedCount };
}

function countMatched(
  partition: ScalePartition,
  relationships: CardinalityMatch[],
): number {
  const consumedSettlements = new Set<string>();
  const consumedCredits = new Set<string>();
  for (const rel of relationships) {
    for (const id of rel.settlementIds) consumedSettlements.add(id);
    for (const id of rel.bankTxnIds) consumedCredits.add(id);
  }
  const settlements = new Set<string>(
    partition.settlements.map((s) => s.settlementId),
  );
  const credits = new Set<string>(partition.credits.map((c) => c.txnId));
  let count = 0;
  for (const id of consumedSettlements) {
    if (settlements.has(id)) count += 1;
  }
  for (const id of consumedCredits) {
    if (credits.has(id)) count += 1;
  }
  return count;
}
