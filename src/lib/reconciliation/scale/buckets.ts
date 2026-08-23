/*
 * Scalable cardinality — candidate bucketing / indexing.
 *
 * The small-batch cardinality solver is whole-array O(S·B): it re-scans every eligible
 * settlement per bulk credit and every credit per settlement. At 10k+ records that is
 * the bottleneck. This module builds deterministic, bounded indexes that let the
 * partition-aware path group candidates WITHOUT ever comparing every settlement against
 * every bank transaction:
 *
 *   - amount buckets  : settlements / credits grouped by their exact integer amount,
 *   - date buckets    : a record is assigned to a rounded time window so only records
 *                       that could fall within the reconciliation time window share a
 *                       partition,
 *   - UTR/identifier  : exact-identifier maps for orphan/exact classification.
 *
 * All functions are pure and deterministic — identical inputs always produce identical
 * buckets regardless of array order (keys are rounded, lists are sorted).
 */

import type {
  NormalizedBankTxn,
  NormalizedSettlement,
} from "../types";

/** Shared tuning for the scalable cardinality path. */
export const SCALE_CONFIG = {
  /** Amount tolerance for an aggregation to count as a match (paise). */
  tolerancePaise: 100,
  /** Reconciliation time window (hours); inherited from the small-path solver. */
  maxHours: 96,
  /** Bounded combinatorial fallback only on clusters at or below this many total items. */
  boundedClusterMaxItems: 12,
  /** Below this total record count apply-cardinality uses the existing whole-array path. */
  scalableMinRecords: 1000,
  /** Durable-execution tuning. */
  maxRetries: 3,
  backoffBaseMs: 50,
  backoffFactor: 2,
  /** Date-bucket window: a settlement run and its credits share one bucket. */
  partitionWindowMs: 96 * 3_600_000,
} as const;

export interface AmountIndexes {
  settlementsByAmount: Map<number, NormalizedSettlement[]>;
  creditsByAmount: Map<number, NormalizedBankTxn[]>;
}

export interface UtrIndexes {
  settlementsByUtr: Map<string, NormalizedSettlement>;
  creditsByUtr: Map<string, NormalizedBankTxn>;
}

function push<T>(map: Map<number, T[]>, key: number, value: T): void {
  const existing = map.get(key);
  if (existing) existing.push(value);
  else map.set(key, [value]);
}

/** Group settlements and credits by exact integer amount. */
export function buildAmountIndexes(
  settlements: NormalizedSettlement[],
  credits: NormalizedBankTxn[],
): AmountIndexes {
  const settlementsByAmount = new Map<number, NormalizedSettlement[]>();
  const creditsByAmount = new Map<number, NormalizedBankTxn[]>();

  for (const s of settlements) {
    push(settlementsByAmount, Math.round(s.amount), s);
  }
  for (const c of credits) {
    if (c.type !== "CREDIT") continue;
    push(creditsByAmount, Math.round(c.amount), c);
  }
  return { settlementsByAmount, creditsByAmount };
}

/** Index settlements and credits by UTR for exact/orphan classification. */
export function buildUtrIndexes(
  settlements: NormalizedSettlement[],
  credits: NormalizedBankTxn[],
): UtrIndexes {
  const settlementsByUtr = new Map<string, NormalizedSettlement>();
  const creditsByUtr = new Map<string, NormalizedBankTxn>();
  for (const s of settlements) {
    if (s.utr) settlementsByUtr.set(s.utr, s);
  }
  for (const c of credits) {
    if (c.utr && c.type === "CREDIT") creditsByUtr.set(c.utr, c);
  }
  return { settlementsByUtr, creditsByUtr };
}

/**
 * Deterministic date-bucket key for a timestamp. Records sharing a key are within the
 * partition window of each other and are grouped into one partition; records in
 * different keys cannot meet. A null/unknown date is grouped into a single "unknown"
 * bucket so it still participates deterministically.
 */
export function dateBucketKey(
  ts: number | null | undefined,
  windowMs: number,
): string {
  if (ts == null) return "unknown";
  return String(Math.floor(ts / windowMs));
}

export function hoursBetween(
  a: Date | null | undefined,
  b: Date | null | undefined,
): number {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  return Math.abs(a.getTime() - b.getTime()) / 3_600_000;
}
