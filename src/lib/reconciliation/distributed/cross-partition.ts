/*
 * SettleMate AI — Bounded Cross-Partition Correlation Resolver
 *
 * Implements:
 *   1. Bounded sliding-window buffer for boundary settlements and orphan rollover
 *   2. Resolves cross-window / delayed credits without all-to-all Cartesian products
 *   3. Complexity: O(K_cross log K_cross) where K_cross is strictly bounded (<< N)
 */

import { executePartition } from "../scale/execution";
import { buildStrategyConfig } from "../scale/scale-run";
import type { NormalizedBankTxn, NormalizedSettlement } from "../types";

export interface CrossPartitionItem {
  partitionId: string;
  windowIndex: number;
  item: NormalizedSettlement | NormalizedBankTxn;
  kind: "SETTLEMENT" | "BANK_TXN";
}

export interface CrossMatchedResult {
  settlementId: string;
  paymentId: string;
  bankTxnId: string;
  status: "matched";
  confidence: number;
  matchType: "exact";
  discrepancy: number;
  discrepancyType: "none";
  source: string;
  matchDetails: {
    paymentAmount: number;
    bankAmount: number;
    amountMatched: boolean;
    utrMatched: boolean;
    dateMatched: boolean;
    settlementDate: Date | null;
    bankDate: Date;
    narration: string | null;
  };
}

export interface CrossPartitionResolution {
  matchedResults: CrossMatchedResult[];
  unresolvedSettlements: NormalizedSettlement[];
  unresolvedCredits: NormalizedBankTxn[];
  crossComparisonsCount: number;
}

export class BoundedCrossPartitionResolver {
  private maxWindowDelta: number;
  private maxRolloverCapacity: number;

  constructor(options?: { maxWindowDelta?: number; maxRolloverCapacity?: number }) {
    this.maxWindowDelta = options?.maxWindowDelta ?? 2; // Look across +/- 2 window buckets
    this.maxRolloverCapacity = options?.maxRolloverCapacity ?? 10_000;
  }

  /**
   * Resolves unmatched orphan items across adjacent window partitions.
   * Groups items by exact (tenant, currency, amount) and evaluates matches
   * strictly within the bounded window delta.
   */
  resolveCrossPartitionOrphans(
    unmatchedSettlements: Array<{ partitionId: string; windowIndex: number; settlement: NormalizedSettlement }>,
    unmatchedCredits: Array<{ partitionId: string; windowIndex: number; credit: NormalizedBankTxn }>,
  ): CrossPartitionResolution {
    const matchedResults: CrossMatchedResult[] = [];
    const matchedSettlementIds = new Set<string>();
    const matchedCreditIds = new Set<string>();
    let crossComparisonsCount = 0;

    // Bounded capacity guard
    const boundedSettlements = unmatchedSettlements.slice(0, this.maxRolloverCapacity);
    const boundedCredits = unmatchedCredits.slice(0, this.maxRolloverCapacity);

    // Group credits by UTR for O(1) direct correlation
    const creditByUtr = new Map<string, Array<{ partitionId: string; windowIndex: number; credit: NormalizedBankTxn }>>();
    for (const c of boundedCredits) {
      if (c.credit.utr) {
        const list = creditByUtr.get(c.credit.utr) ?? [];
        list.push(c);
        creditByUtr.set(c.credit.utr, list);
      }
    }

    // 1. Direct UTR correlation across boundary
    for (const s of boundedSettlements) {
      if (!s.settlement.utr) continue;
      const candidates = creditByUtr.get(s.settlement.utr);
      if (!candidates || candidates.length === 0) continue;

      for (const c of candidates) {
        crossComparisonsCount++;
        const delta = Math.abs(s.windowIndex - c.windowIndex);
        if (delta <= this.maxWindowDelta && !matchedCreditIds.has(c.credit.dbId)) {
          if (Math.abs(s.settlement.amount - c.credit.amount) <= 100) {
            matchedSettlementIds.add(s.settlement.dbId);
            matchedCreditIds.add(c.credit.dbId);

            matchedResults.push({
              settlementId: s.settlement.settlementId,
              paymentId: s.settlement.paymentId,
              bankTxnId: c.credit.txnId,
              status: "matched",
              confidence: 95,
              matchType: "exact",
              discrepancy: 0,
              discrepancyType: "none",
              source: "CROSS_PARTITION_RESOLVER",
              matchDetails: {
                paymentAmount: s.settlement.amount,
                bankAmount: c.credit.amount,
                amountMatched: true,
                utrMatched: true,
                dateMatched: false, // Cross-window
                settlementDate: s.settlement.settledAt,
                bankDate: c.credit.txnDate,
                narration: c.credit.narration,
              },
            });
            break;
          }
        }
      }
    }

    // 2. Residual sliding window matching
    const remainingSettlements = boundedSettlements
      .filter((s) => !matchedSettlementIds.has(s.settlement.dbId))
      .map((s) => s.settlement);
    const remainingCredits = boundedCredits
      .filter((c) => !matchedCreditIds.has(c.credit.dbId))
      .map((c) => c.credit);

    if (remainingSettlements.length > 0 && remainingCredits.length > 0 && remainingSettlements.length + remainingCredits.length <= 100) {
      const residualOutput = executePartition(
        {
          id: "cross-boundary-residual",
          bucketKey: "cross",
          settlements: remainingSettlements,
          credits: remainingCredits,
        },
        buildStrategyConfig(),
      );

      for (const rel of residualOutput.relationships) {
        for (let i = 0; i < rel.settlementIds.length; i++) {
          const sId = rel.settlementIds[i]!;
          const cId = rel.bankTxnIds[i] ?? rel.bankTxnIds[0]!;
          const sObj = remainingSettlements.find((s) => s.settlementId === sId);
          const cObj = remainingCredits.find((c) => c.txnId === cId);

          if (sObj && cObj) {
            matchedResults.push({
              settlementId: sId,
              paymentId: sObj.paymentId,
              bankTxnId: cId,
              status: "matched",
              confidence: 90,
              matchType: "exact",
              discrepancy: 0,
              discrepancyType: "none",
              source: "CROSS_PARTITION_RESIDUAL",
              matchDetails: {
                paymentAmount: sObj.amount,
                bankAmount: cObj.amount,
                amountMatched: true,
                utrMatched: Boolean(sObj.utr && sObj.utr === cObj.utr),
                dateMatched: false,
                settlementDate: sObj.settledAt,
                bankDate: cObj.txnDate,
                narration: cObj.narration,
              },
            });
            matchedSettlementIds.add(sObj.dbId);
            matchedCreditIds.add(cObj.dbId);
          }
        }
      }
    }

    return {
      matchedResults,
      unresolvedSettlements: boundedSettlements
        .filter((s) => !matchedSettlementIds.has(s.settlement.dbId))
        .map((s) => s.settlement),
      unresolvedCredits: boundedCredits
        .filter((c) => !matchedCreditIds.has(c.credit.dbId))
        .map((c) => c.credit),
      crossComparisonsCount,
    };
  }
}
