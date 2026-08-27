/*
 * Scalable cardinality — deterministic, disjoint partitions.
 *
 * The partition-aware path must never compare every settlement against every bank
 * transaction. Instead, the unresolved settlements + unused bulk credits are grouped
 * into disjoint partitions by a deterministic date-bucket key. Each record lands in
 * exactly one partition (so solving partitions independently can never double-consume
 * a record), and identical inputs always yield identical partitions in identical
 * order (stable rounding + sorted ids) — re-runs and resumed runs see the same shape.
 *
 * A partition is a candidate cluster: a set of settlements and credits that share a
 * time window and could aggregate. The strategy selector (strategy.ts) then decides
 * per partition whether it resolves by an indexed sum, a bounded combinatorial solve,
 * or is routed to review.
 */

import type {
  NormalizedBankTxn,
  NormalizedSettlement,
} from "../types";
import { dateBucketKey } from "./buckets";

export interface ScalePartition {
  /** Deterministic id: `p-<bucketKey>-<index>`. */
  id: string;
  bucketKey: string;
  settlements: NormalizedSettlement[];
  credits: NormalizedBankTxn[];
}

interface BucketAccumulator {
  bucketKey: string;
  settlements: NormalizedSettlement[];
  credits: NormalizedBankTxn[];
}

function bySettlementId(
  a: NormalizedSettlement,
  b: NormalizedSettlement,
): number {
  return a.settlementId < b.settlementId ? -1 : a.settlementId > b.settlementId ? 1 : 0;
}

function byTxnId(a: NormalizedBankTxn, b: NormalizedBankTxn): number {
  return a.txnId < b.txnId ? -1 : a.txnId > b.txnId ? 1 : 0;
}

/**
 * Group unresolved settlements + unused bulk credits into disjoint, deterministic
 * partitions keyed by their date bucket. Each record appears in exactly one partition.
 * The result is ordered deterministically (bucket keys ascending, ids sorted).
 */
export function partitionCandidates(
  settlements: NormalizedSettlement[],
  credits: NormalizedBankTxn[],
  windowMs: number,
): ScalePartition[] {
  const byBucket = new Map<string, BucketAccumulator>();

  for (let i = 0; i < settlements.length; i++) {
    const s = settlements[i]!;
    const key = dateBucketKey(s.settledAt?.getTime(), windowMs);
    let acc = byBucket.get(key);
    if (!acc) {
      acc = {
        bucketKey: key,
        settlements: [],
        credits: [],
      };
      byBucket.set(key, acc);
    }
    acc.settlements.push(s);
  }

  for (let i = 0; i < credits.length; i++) {
    const c = credits[i]!;
    if (c.type !== "CREDIT") continue;
    const key = dateBucketKey(c.txnDate.getTime(), windowMs);
    let acc = byBucket.get(key);
    if (!acc) {
      acc = {
        bucketKey: key,
        settlements: [],
        credits: [],
      };
      byBucket.set(key, acc);
    }
    acc.credits.push(c);
  }

  const keys = [...byBucket.keys()].sort(numericCompare);

  return keys.map((key, index) => {
    const acc = byBucket.get(key)!;
    return {
      id: `p-${key}-${index}`,
      bucketKey: acc.bucketKey,
      settlements: acc.settlements.sort(bySettlementId),
      credits: acc.credits.sort(byTxnId),
    };
  });
}

function numericCompare(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return a < b ? -1 : a > b ? 1 : 0;
}
