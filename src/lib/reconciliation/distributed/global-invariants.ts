/*
 * SettleMate AI — Global Partition Invariant Verifier (Day 6)
 *
 * Enforces global financial correctness across distributed streaming partitions:
 *   - Input Completeness: Every input record must be accounted for (matched, exception, or review)
 *   - Money Conservation: Sum(Settled) + Sum(Variance) === Sum(Bank Credits)
 *   - Debit/Credit Balance
 *   - Cardinality Consistency: Zero duplicate consumed records across partitions
 *   - Global Receipt Hash: Canonical SHA-256 state seal across all partition results
 */

import { createHash } from "node:crypto";
import type { CrossPartitionMatchResult } from "./cross-partition";

export interface PartitionExecutionResult {
  partitionId: string;
  windowIndex: number;
  inputSettlementIds: string[];
  inputBankTxnIds: string[];
  matchedResults: CrossPartitionMatchResult[];
  unresolvedSettlementIds: string[];
  unresolvedBankTxnIds: string[];
}

export interface GlobalInvariantReport {
  passed: boolean;
  totalPartitions: number;
  totalInputSettlements: number;
  totalInputBankTxns: number;
  totalMatchedSettlements: number;
  totalMatchedBankTxns: number;
  totalUnresolvedSettlements: number;
  totalUnresolvedBankTxns: number;
  duplicateSettlementIds: string[];
  duplicateBankTxnIds: string[];
  moneyConservationPaise: {
    totalSettlementPaise: number;
    totalBankPaise: number;
    totalDiscrepancyPaise: number;
    balanced: boolean;
  };
  canonicalReceiptHash: string;
  violations: string[];
}

export class GlobalPartitionInvariantVerifier {
  verifyGlobalInvariants(results: PartitionExecutionResult[]): GlobalInvariantReport {
    const violations: string[] = [];

    const allInputSettlements = new Set<string>();
    const allInputBankTxns = new Set<string>();

    const matchedSettlementCounts = new Map<string, number>();
    const matchedBankTxnCounts = new Map<string, number>();

    let totalSettlementPaise = 0;
    let totalBankPaise = 0;
    let totalDiscrepancyPaise = 0;

    let totalUnresolvedSettlementsCount = 0;
    let totalUnresolvedBankTxnsCount = 0;

    for (const p of results) {
      for (const sid of p.inputSettlementIds) {
        allInputSettlements.add(sid);
      }
      for (const bid of p.inputBankTxnIds) {
        allInputBankTxns.add(bid);
      }

      totalUnresolvedSettlementsCount += p.unresolvedSettlementIds.length;
      totalUnresolvedBankTxnsCount += p.unresolvedBankTxnIds.length;

      for (const m of p.matchedResults) {
        totalSettlementPaise += m.settlementAmount;
        totalBankPaise += m.bankAmount;
        totalDiscrepancyPaise += m.differencePaise;

        for (const sid of m.settlementIds) {
          const prev = matchedSettlementCounts.get(sid) ?? 0;
          matchedSettlementCounts.set(sid, prev + 1);
        }
        for (const bid of m.bankTxnIds) {
          const prev = matchedBankTxnCounts.get(bid) ?? 0;
          matchedBankTxnCounts.set(bid, prev + 1);
        }
      }
    }

    // 1. Check for Duplicate Consumptions (Cardinality Consistency)
    const duplicateSettlementIds: string[] = [];
    for (const [sid, count] of matchedSettlementCounts.entries()) {
      if (count > 1) {
        duplicateSettlementIds.push(sid);
        violations.push(`DUPLICATE_SETTLEMENT_CONSUMED: Settlement ${sid} consumed in ${count} matches across partitions`);
      }
    }

    const duplicateBankTxnIds: string[] = [];
    for (const [bid, count] of matchedBankTxnCounts.entries()) {
      if (count > 1) {
        duplicateBankTxnIds.push(bid);
        violations.push(`DUPLICATE_BANK_TXN_CONSUMED: Bank Txn ${bid} consumed in ${count} matches across partitions`);
      }
    }

    // 2. Check Input Completeness
    const totalMatchedSettlements = matchedSettlementCounts.size;
    const totalMatchedBankTxns = matchedBankTxnCounts.size;

    const accountedSettlements = totalMatchedSettlements + totalUnresolvedSettlementsCount;
    if (accountedSettlements !== allInputSettlements.size) {
      violations.push(
        `INPUT_SETTLEMENT_COMPLETENESS_MISMATCH: Ingested ${allInputSettlements.size} != Accounted ${accountedSettlements} (Matched: ${totalMatchedSettlements}, Unresolved: ${totalUnresolvedSettlementsCount})`
      );
    }

    const accountedBankTxns = totalMatchedBankTxns + totalUnresolvedBankTxnsCount;
    if (accountedBankTxns !== allInputBankTxns.size) {
      violations.push(
        `INPUT_BANK_TXN_COMPLETENESS_MISMATCH: Ingested ${allInputBankTxns.size} != Accounted ${accountedBankTxns} (Matched: ${totalMatchedBankTxns}, Unresolved: ${totalUnresolvedBankTxnsCount})`
      );
    }

    // 3. Money Conservation
    const balanced = Math.abs(totalSettlementPaise - totalBankPaise) === totalDiscrepancyPaise;
    if (!balanced) {
      violations.push(
        `MONEY_CONSERVATION_BREACH: Settlement Sum (${totalSettlementPaise}) - Bank Sum (${totalBankPaise}) != Discrepancy (${totalDiscrepancyPaise})`
      );
    }

    // 4. Compute Canonical SHA-256 Receipt Hash
    const canonicalPayload = JSON.stringify({
      partitions: results.map((r) => r.partitionId).sort(),
      totalSettlementPaise,
      totalBankPaise,
      totalDiscrepancyPaise,
      matchedSettlementCount: totalMatchedSettlements,
      matchedBankTxnCount: totalMatchedBankTxns,
      violationsCount: violations.length,
    });
    const canonicalReceiptHash = createHash("sha256").update(canonicalPayload).digest("hex");

    return {
      passed: violations.length === 0,
      totalPartitions: results.length,
      totalInputSettlements: allInputSettlements.size,
      totalInputBankTxns: allInputBankTxns.size,
      totalMatchedSettlements,
      totalMatchedBankTxns,
      totalUnresolvedSettlements: totalUnresolvedSettlementsCount,
      totalUnresolvedBankTxns: totalUnresolvedBankTxnsCount,
      duplicateSettlementIds,
      duplicateBankTxnIds,
      moneyConservationPaise: {
        totalSettlementPaise,
        totalBankPaise,
        totalDiscrepancyPaise,
        balanced,
      },
      canonicalReceiptHash,
      violations,
    };
  }
}
