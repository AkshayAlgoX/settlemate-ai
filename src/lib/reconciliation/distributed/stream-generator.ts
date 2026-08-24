/*
 * SettleMate AI — Bounded-Memory Streaming Partition Generator
 *
 * Generates disjoint candidate partitions in bounded streaming chunks (O(chunk) memory).
 * Yields PartitionPayload arrays ready for queue ingestion without whole-dataset heap allocation.
 */

import type { PartitionPayload } from "./types";
import type { NormalizedBankTxn, NormalizedSettlement } from "../types";

export const STREAM_BASE_DATE = new Date("2026-08-23T00:00:00Z");

export interface StreamGeneratorOptions {
  pairsPerPartition?: number;
  chunkSizePartitions?: number;
  baseDate?: Date;
}

/**
 * Generator that yields partition payloads in bounded streaming chunks.
 * Generates disjoint candidate partitions with pairsPerPartition (default 10 = 20 records) per partition.
 */
export function* generateStreamingPartitions(
  totalRecords: number,
  options: StreamGeneratorOptions = {},
): Generator<PartitionPayload[], void, unknown> {
  const pairsPerPartition = options.pairsPerPartition ?? 10;
  const recordsPerPartition = pairsPerPartition * 2;
  const totalPartitions = Math.max(1, Math.floor(totalRecords / recordsPerPartition));
  const chunkSizePartitions = options.chunkSizePartitions ?? Math.min(1000, totalPartitions);
  const baseDate = options.baseDate ?? STREAM_BASE_DATE;

  for (let pStart = 0; pStart < totalPartitions; pStart += chunkSizePartitions) {
    const pEnd = Math.min(pStart + chunkSizePartitions, totalPartitions);
    const chunk: PartitionPayload[] = [];

    for (let p = pStart; p < pEnd; p++) {
      const windowOffsetMs = p * 3600_000;
      const date = new Date(baseDate.getTime() + windowOffsetMs);
      const settlements: NormalizedSettlement[] = [];
      const credits: NormalizedBankTxn[] = [];

      for (let i = 0; i < pairsPerPartition; i++) {
        const globalIdx = p * pairsPerPartition + i;
        const amount = ((globalIdx % 1000) + 1) * 100;
        const sharedUtr = `UTR_P${p}_I${i}`;

        settlements.push({
          dbId: `s_${globalIdx}`,
          settlementId: `setl_${globalIdx}`,
          paymentId: `pay_${globalIdx}`,
          amount,
          fee: 0,
          tax: 0,
          utr: sharedUtr,
          status: "settled",
          settledAt: date,
          createdAt: date,
        });

        credits.push({
          dbId: `c_${globalIdx}`,
          txnId: `txn_${globalIdx}`,
          utr: sharedUtr,
          amount,
          type: "CREDIT",
          narration: "STREAMED SETTLEMENT",
          txnDate: date,
          matched: false,
        });
      }

      chunk.push({
        partitionId: `part-${p}`,
        bucketKey: String(p),
        settlements,
        credits,
      });
    }

    yield chunk;
  }
}
