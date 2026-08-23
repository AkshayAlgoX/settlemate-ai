import type {
  BatchData,
  MatchResult,
} from "./types";
import {
  findSettlementGroupForBank,
  findBankGroupForSettlement,
  findManyToManyMatch,
  type CardinalityMatch,
} from "./cardinality";
import { SCALE_CONFIG } from "./scale/buckets";
import { runScalableCardinality } from "./scale/scale-run";

interface CardinalityConfig {
  maxGroupSize: number;
  maxCandidates: number;
  tolerancePaise: number;
  maxHours: number;
}

export interface CardinalityApplication {
  results: MatchResult[];
  relationships: CardinalityMatch[];
}

const CONFIG: CardinalityConfig = {
  maxGroupSize: 8,
  maxCandidates: 24,
  tolerancePaise: 100,
  maxHours: 96,
};

function isBulkBankCredit(
  txn: BatchData["bankTransactions"][number],
): boolean {
  if (txn.type !== "CREDIT") return false;

  const narration = (txn.narration || "").toUpperCase();

  return (
    narration.includes("BULK SETTLEMENT") ||
    narration.includes("AGGREGATED SETTLEMENT") ||
    narration.includes("PAYOUT BATCH")
  );
}

function setCardinality(
  result: MatchResult,
  type: "1:1" | "1:N" | "N:1" | "N:M",
  reason: string,
  score: number,
): void {
  result.cardinalityType = type;
  result.cardinalityReason = reason;
  result.relationshipScore = score;
  result.confidenceScore = Math.max(
    result.confidenceScore,
    score,
  );
}

function hasBankRelationship(result: MatchResult): boolean {
  return result.bankTxnIds.length > 0;
}

export interface CardinalityMatchingOpts {
  batchId?: string;
  runId?: string;
}

/**
 * Apply a resolved cardinality relationship to the affected ReconciliationResult rows
 * and mark its bank credits consumed. Mirrors the application block used by the
 * small-path PASS 3 so both paths label results consistently.
 */
function applyRelationshipToResults(
  results: MatchResult[],
  data: BatchData,
  resultByPaymentId: Map<string, MatchResult>,
  usedBankTxnIds: Set<string>,
  relationship: CardinalityMatch,
  settlementById?: Map<string, BatchData["settlements"][number]>,
): void {
  for (const settlementId of relationship.settlementIds) {
    const settlement = settlementById
      ? settlementById.get(settlementId)
      : data.settlements.find((item) => item.settlementId === settlementId);

    if (!settlement) continue;

    const result = resultByPaymentId.get(settlement.paymentId);

    if (!result) continue;

    result.settlementIds = result.settlementIds.includes(settlementId)
      ? result.settlementIds
      : [...result.settlementIds, settlementId];

    result.bankTxnIds = relationship.bankTxnIds;
    result.bankCreditedAmount = relationship.bankAmount;

    setCardinality(
      result,
      relationship.type,
      relationship.reasonCode,
      relationship.confidenceScore,
    );

    result.matchMethod =
      `CARDINALITY_${relationship.type.replace(":", "_TO_")}`;

    result.matchDetails =
      `${relationship.details}. ` +
      `Relationship verified within ` +
      `${relationship.differencePaise} paise.`;
  }

  for (const bankTxnId of relationship.bankTxnIds) {
    usedBankTxnIds.add(bankTxnId);
  }
}

export async function applyCardinalityMatching(
  results: MatchResult[],
  data: BatchData,
  opts?: CardinalityMatchingOpts,
): Promise<CardinalityApplication> {
  const relationships: CardinalityMatch[] = [];

  const resultByPaymentId = new Map<string, MatchResult>();
  const settlementById = new Map<string, BatchData["settlements"][number]>();
  for (const s of data.settlements) {
    settlementById.set(s.settlementId, s);
  }

  for (const result of results) {
    if (result.paymentId.startsWith("orphan_")) {
      continue;
    }

    resultByPaymentId.set(result.paymentId, result);
  }

  /*
   * A settlement is considered available for aggregation only when
   * its payment-level result does NOT already have a bank relationship.
   *
   * This is important:
   * - a normal 1:1 match is already consumed
   * - an unmatched settlement is still eligible for N:1 / N:M
   */
  const getAvailableSettlements = () =>
    data.settlements.filter((settlement) => {
      const result = resultByPaymentId.get(
        settlement.paymentId,
      );

      if (!result) return false;

      return !hasBankRelationship(result);
    });

  const usedBankTxnIds = new Set<string>();

  /*
   * Existing bank relationships are already consumed by the
   * deterministic matcher.
   */
  for (const result of results) {
    for (const bankTxnId of result.bankTxnIds) {
      usedBankTxnIds.add(bankTxnId);
    }
  }

  /*
   * SCALABLE PATH — only for large batches (>= scalableMinRecords).
   *
   * The whole-array passes below are O(S·B) and bounded only in their inner solver;
   * above the threshold they would dominate. Route the unresolved settlements + unused
   * bulk credits (the same sets PASS 3 would consume) through the partition-aware,
   * durable cardinality engine instead. Below the threshold the existing passes run
   * unchanged — the 250-record benchmark and all small e2e scenarios are byte-identical.
   */
  if (
    data.settlements.length + data.bankTransactions.length >=
    SCALE_CONFIG.scalableMinRecords
  ) {
    if (opts?.batchId && opts.runId) {
      const eligibleSettlements = getAvailableSettlements();
      const unusedBulkCredits = data.bankTransactions
        .filter(isBulkBankCredit)
        .filter((txn) => !usedBankTxnIds.has(txn.txnId));

      const scaleResult = await runScalableCardinality({
        batchId: opts.batchId,
        runId: opts.runId,
        settlements: eligibleSettlements,
        credits: unusedBulkCredits,
      });

      for (const relationship of scaleResult.relationships) {
        applyRelationshipToResults(
          results,
          data,
          resultByPaymentId,
          usedBankTxnIds,
          relationship,
          settlementById,
        );
        relationships.push(relationship);
      }

      return { results, relationships };
    }
    // Fall through to the small path if batchId/runId were not provided (correct, just
    // not durable) — never a partial/incorrect result.
  }

  /*
   * PASS 1 — explicit bulk bank credits → N:1
   */
  const bulkCredits = data.bankTransactions.filter(
    isBulkBankCredit,
  );

  for (const bankTxn of bulkCredits) {
    if (usedBankTxnIds.has(bankTxn.txnId)) {
      continue;
    }

    const eligibleSettlements =
      getAvailableSettlements();

    if (eligibleSettlements.length < 2) {
      continue;
    }

    const nToOne = findSettlementGroupForBank(
      eligibleSettlements,
      bankTxn,
      CONFIG,
    );

    if (!nToOne) {
      continue;
    }

    relationships.push(nToOne);

    usedBankTxnIds.add(bankTxn.txnId);

    for (const settlementId of nToOne.settlementIds) {
      const settlement = settlementById.get(settlementId);

      if (!settlement) continue;

      const result = resultByPaymentId.get(
        settlement.paymentId,
      );

      if (!result) continue;

      result.settlementIds =
        result.settlementIds.includes(settlementId)
          ? result.settlementIds
          : [
              ...result.settlementIds,
              settlementId,
            ];

      result.bankTxnIds = [bankTxn.txnId];
      result.bankCreditedAmount =
        bankTxn.amount;

      setCardinality(
        result,
        "N:1",
        nToOne.reasonCode,
        nToOne.confidenceScore,
      );

      result.matchMethod =
        "CARDINALITY_N_TO_1";

      result.matchDetails =
        `${nToOne.details}. ` +
        `Bank credit ${bankTxn.txnId} ` +
        `aggregates ${nToOne.settlementIds.length} settlements.`;
      // Relationship identification is advisory: it never overrides the
      // deterministic matcher's classification, so the official benchmark's
      // accuracy/precision/recall stay driven by the matcher.
    }
  }

  /*
   * PASS 2 — one settlement → multiple bank credits.
   */
  for (const settlement of data.settlements) {
    const result = resultByPaymentId.get(
      settlement.paymentId,
    );

    if (!result) continue;

    if (hasBankRelationship(result)) {
      continue;
    }

    const eligibleBankTransactions =
      data.bankTransactions.filter(
        (txn) =>
          txn.type === "CREDIT" &&
          !usedBankTxnIds.has(txn.txnId),
      );

    const oneToN = findBankGroupForSettlement(
      settlement,
      eligibleBankTransactions,
      CONFIG,
    );

    if (!oneToN) {
      continue;
    }

    relationships.push(oneToN);

    for (const bankTxnId of oneToN.bankTxnIds) {
      usedBankTxnIds.add(bankTxnId);
    }

    result.bankTxnIds =
      oneToN.bankTxnIds;

    result.bankCreditedAmount =
      oneToN.bankAmount;

    setCardinality(
      result,
      "1:N",
      oneToN.reasonCode,
      oneToN.confidenceScore,
    );

    result.matchMethod =
      "CARDINALITY_1_TO_N";

    result.matchDetails =
      `${oneToN.details}. ` +
      `Settlement ${settlement.settlementId} ` +
      `maps to ${oneToN.bankTxnIds.length} bank credits.`;
  }

  /*
   * PASS 3 — bounded N:M.
   *
   * Only unresolved settlement records and explicit bulk bank
   * credits participate here.
   */
  const unresolvedSettlements =
    getAvailableSettlements();

  const unresolvedBulkBanks =
    bulkCredits.filter(
      (txn) =>
        !usedBankTxnIds.has(txn.txnId),
    );

  if (
    unresolvedSettlements.length >= 2 &&
    unresolvedBulkBanks.length >= 2
  ) {
    const manyToMany =
      findManyToManyMatch(
        unresolvedSettlements,
        unresolvedBulkBanks,
        CONFIG,
      );

    if (manyToMany) {
      relationships.push(manyToMany);

      for (const settlementId of manyToMany.settlementIds) {
        const settlement = settlementById.get(settlementId);

        if (!settlement) continue;

        const result =
          resultByPaymentId.get(
            settlement.paymentId,
          );

        if (!result) continue;

        result.settlementIds =
          result.settlementIds.includes(
            settlementId,
          )
            ? result.settlementIds
            : [
                ...result.settlementIds,
                settlementId,
              ];

        result.bankTxnIds =
          manyToMany.bankTxnIds;

        result.bankCreditedAmount =
          manyToMany.bankAmount;

        setCardinality(
          result,
          "N:M",
          manyToMany.reasonCode,
          manyToMany.confidenceScore,
        );

        result.matchMethod =
          "CARDINALITY_N_TO_M";

        result.matchDetails =
          `${manyToMany.details}. ` +
          `Relationship verified within ` +
          `${manyToMany.differencePaise} paise.`;
      }

      for (
        const bankTxnId of
          manyToMany.bankTxnIds
      ) {
        usedBankTxnIds.add(
          bankTxnId,
        );
      }
    }
  }

  return {
    results,
    relationships,
  };
}