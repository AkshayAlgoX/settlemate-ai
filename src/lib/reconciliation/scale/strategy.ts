/*
 * Scalable cardinality — N:M strategy selection (requirement 10).
 *
 * For each partition (candidate cluster) exactly one strategy is chosen:
 *
 *   INDEXED  — no combinatorial work. (a) A single settlement ↔ single credit matching
 *              on exact amount + UTR resolves as a 1:1. (b) A single bulk credit whose
 *              amount equals the sum of all settlements in the partition (within
 *              tolerance) resolves as an N:1 — O(1) sum, no subset enumeration. This is
 *              the scalable mass case (a bulk settlement credit aggregates its batch).
 *
 *   BOUNDED  — only for truly tiny clusters (total items <= boundedClusterMaxItems).
 *              Delegates to the existing bounded subset solver in cardinality.ts, which
 *              self-limits to maxCandidates / maxGroupSize. Identical semantics to the
 *              small-batch path on these clusters.
 *
 *   AMBIGUOUS — any cluster too large to brute-force and not resolved by an indexed sum.
 *              Routed to review: NO solver call, NO exponential explosion, NO fabricated
 *              relationship. The settlement simply keeps its matcher classification.
 *
 * The resolvers are pure and return CardinalityMatch[] directly (the same shape
 * apply-cardinality.ts and cardinality-persistence.ts already consume).
 */

import {
  findBankGroupForSettlement,
  findManyToManyMatch,
  findSettlementGroupForBank,
  type CardinalityMatch,
} from "../cardinality";
import type { ScalePartition } from "./clusters";

export type ScaleStrategy = "INDEXED" | "BOUNDED" | "AMBIGUOUS";

export interface StrategyConfig {
  tolerancePaise: number;
  maxHours: number;
  boundedClusterMaxItems: number;
}

const SOLVER_CONFIG = {
  maxGroupSize: 8,
  maxCandidates: 24,
  tolerancePaise: 100,
  maxHours: 96,
};

function totalItems(partition: ScalePartition): number {
  return partition.settlements.length + partition.credits.length;
}

/** Choose the strategy for a partition (pure classification). */
export function selectStrategy(
  partition: ScalePartition,
  config: StrategyConfig,
): ScaleStrategy {
  // A single bulk credit whose amount equals the sum of all partition settlements is
  // resolved by the indexed path regardless of cluster size.
  if (
    partition.credits.length === 1 &&
    partition.settlements.length >= 2
  ) {
    const sum = partition.settlements.reduce(
      (acc, s) => acc + Math.round(s.amount),
      0,
    );
    if (
      Math.abs(sum - Math.round(partition.credits[0]!.amount)) <=
      config.tolerancePaise
    ) {
      return "INDEXED";
    }
  }
  // A single settlement ↔ single credit with exact amount + shared UTR → indexed 1:1.
  if (
    partition.settlements.length === 1 &&
    partition.credits.length === 1
  ) {
    const s = partition.settlements[0]!;
    const c = partition.credits[0]!;
    if (
      Math.abs(s.amount - c.amount) <= config.tolerancePaise &&
      s.utr &&
      c.utr &&
      s.utr === c.utr
    ) {
      return "INDEXED";
    }
  }
  if (totalItems(partition) <= config.boundedClusterMaxItems) {
    return "BOUNDED";
  }
  return "AMBIGUOUS";
}

/** Resolve a single settlement ↔ single credit exact UTR+amount match as a 1:1. */
function resolveIndexedOneToOne(
  partition: ScalePartition,
): CardinalityMatch | null {
  const s = partition.settlements[0]!;
  const c = partition.credits[0]!;
  const differencePaise = Math.abs(Math.round(s.amount) - Math.round(c.amount));
  return {
    type: "1:1",
    settlementIds: [s.settlementId],
    bankTxnIds: [c.txnId],
    settlementAmount: Math.round(s.amount),
    bankAmount: Math.round(c.amount),
    differencePaise,
    confidenceScore: 98,
    reasonCode: "EXACT_ONE_TO_ONE_INDEXED",
    details: `Indexed 1:1 by shared UTR + exact amount`,
  };
}

/** Resolve a whole-partition aggregation (sum of all settlements == one bulk credit). */
function resolveIndexedAggregate(
  partition: ScalePartition,
  config: StrategyConfig,
): CardinalityMatch | null {
  const credit = partition.credits[0]!;
  const settlementAmount = partition.settlements.reduce(
    (acc, s) => acc + Math.round(s.amount),
    0,
  );
  const bankAmount = Math.round(credit.amount);
  const differencePaise = Math.abs(settlementAmount - bankAmount);
  if (differencePaise > config.tolerancePaise) return null;

  return {
    type: "N:1",
    settlementIds: partition.settlements
      .map((s) => s.settlementId)
      .sort(),
    bankTxnIds: [credit.txnId],
    settlementAmount,
    bankAmount,
    differencePaise,
    confidenceScore: differencePaise === 0 ? 96 : 90,
    reasonCode:
      differencePaise === 0
        ? "EXACT_MANY_TO_ONE_AGGREGATION"
        : "TOLERATED_MANY_TO_ONE_AGGREGATION",
    details: `Indexed ${partition.settlements.length} settlements to one bulk credit by exact batch aggregation`,
  };
}

/** Bound the candidate pools to the partition itself (already small). */
function asSolverConfig(config: StrategyConfig) {
  return {
    maxGroupSize: SOLVER_CONFIG.maxGroupSize,
    maxCandidates: Math.max(config.boundedClusterMaxItems, SOLVER_CONFIG.maxCandidates),
    tolerancePaise: config.tolerancePaise,
    maxHours: config.maxHours,
  };
}

/** Delegate a tiny cluster to the existing bounded subset solver (unchanged semantics). */
function resolveBounded(
  partition: ScalePartition,
  config: StrategyConfig,
): CardinalityMatch | null {
  const solverConfig = asSolverConfig(config);

  // N:1 — one bulk credit aggregates ≥2 settlements (mirrors small-path PASS 1).
  for (const credit of partition.credits) {
    const match = findSettlementGroupForBank(
      partition.settlements,
      credit,
      solverConfig,
    );
    if (match) return match;
  }

  // 1:N — one settlement split across multiple credits (mirrors small-path PASS 2).
  for (const settlement of partition.settlements) {
    const match = findBankGroupForSettlement(
      settlement,
      partition.credits,
      solverConfig,
    );
    if (match) return match;
  }

  // N:M — correlated groups (mirrors small-path PASS 3).
  return findManyToManyMatch(partition.settlements, partition.credits, solverConfig);
}

/**
 * Resolve a partition to its cardinality relationships. Returns an empty array when the
 * partition is AMBIGUOUS (routed to review — no fabricated link) or when the bounded
 * solver finds nothing. Pure; no I/O.
 */
export function resolvePartition(
  partition: ScalePartition,
  config: StrategyConfig,
): CardinalityMatch[] {
  const strategy = selectStrategy(partition, config);

  if (strategy === "INDEXED") {
    if (
      partition.settlements.length === 1 &&
      partition.credits.length === 1
    ) {
      const oneToOne = resolveIndexedOneToOne(partition);
      return oneToOne ? [oneToOne] : [];
    }
    const aggregate = resolveIndexedAggregate(partition, config);
    return aggregate ? [aggregate] : [];
  }

  if (strategy === "BOUNDED") {
    const match = resolveBounded(partition, config);
    return match ? [match] : [];
  }

  return [];
}
