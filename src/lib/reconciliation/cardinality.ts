import type {
  NormalizedBankTxn,
  NormalizedSettlement,
} from "./types";

export type CardinalityType = "1:1" | "1:N" | "N:1" | "N:M";

export interface CardinalityMatch {
  type: CardinalityType;
  settlementIds: string[];
  bankTxnIds: string[];
  settlementAmount: number;
  bankAmount: number;
  differencePaise: number;
  confidenceScore: number;
  reasonCode: string;
  details: string;
}

export interface CardinalitySolverConfig {
  maxGroupSize: number;
  maxCandidates: number;
  tolerancePaise: number;
  maxHours: number;
}

const DEFAULT_CONFIG: CardinalitySolverConfig = {
  maxGroupSize: 8,
  maxCandidates: 24,
  tolerancePaise: 100,
  maxHours: 96,
};

interface CandidateSettlement {
  settlement: NormalizedSettlement;
  netAmount: number;
}

function normalizeAmount(amount: number): number {
  return Math.round(amount);
}

function hoursBetween(a: Date | null, b: Date): number {
  if (!a) return Number.POSITIVE_INFINITY;

  return Math.abs(a.getTime() - b.getTime()) / 3_600_000;
}

function selectCandidates(
  settlements: NormalizedSettlement[],
  bankTxn: NormalizedBankTxn,
  config: CardinalitySolverConfig,
): CandidateSettlement[] {
  return settlements
    .map((settlement) => ({
      settlement,
      netAmount: normalizeAmount(settlement.amount),
    }))
    .filter((candidate) => {
      if (!candidate.settlement.settledAt) return true;

      return (
        hoursBetween(candidate.settlement.settledAt, bankTxn.txnDate) <=
        config.maxHours
      );
    })
    .sort((a, b) => {
      const amountDeltaA = Math.abs(
        a.netAmount - bankTxn.amount,
      );
      const amountDeltaB = Math.abs(
        b.netAmount - bankTxn.amount,
      );

      return (
        amountDeltaA - amountDeltaB ||
        a.settlement.settlementId.localeCompare(
          b.settlement.settlementId,
        )
      );
    })
    .slice(0, config.maxCandidates);
}

export function findSettlementGroupForBank(
  settlements: NormalizedSettlement[],
  bankTxn: NormalizedBankTxn,
  config: CardinalitySolverConfig = DEFAULT_CONFIG,
): CardinalityMatch | null {
  if (bankTxn.type !== "CREDIT") return null;

  const candidates = selectCandidates(
    settlements,
    bankTxn,
    config,
  );

  if (candidates.length < 2) return null;

  let bestGroup: CandidateSettlement[] = [];
  let bestDifference = Number.POSITIVE_INFINITY;

  function search(
    startIndex: number,
    selected: CandidateSettlement[],
    sum: number,
  ): void {
    if (selected.length >= 2) {
      const difference = Math.abs(sum - bankTxn.amount);

      if (
        difference <= config.tolerancePaise &&
        (
          bestGroup.length === 0 ||
          difference < bestDifference ||
          (
            difference === bestDifference &&
            selected.length < bestGroup.length
          )
        )
      ) {
        bestGroup = [...selected];
        bestDifference = difference;
      }

      if (sum >= bankTxn.amount + config.tolerancePaise) {
        return;
      }
    }

    if (selected.length >= config.maxGroupSize) return;

    for (let i = startIndex; i < candidates.length; i += 1) {
      search(
        i + 1,
        [...selected, candidates[i]],
        sum + candidates[i].netAmount,
      );
    }
  }

  search(0, [], 0);

  if (bestGroup.length < 2) return null;

  const settlementAmount = bestGroup.reduce(
    (sum, candidate) => sum + candidate.netAmount,
    0,
  );

  return {
    type: "N:1",
    settlementIds: bestGroup
      .map((candidate) => candidate.settlement.settlementId)
      .sort(),
    bankTxnIds: [bankTxn.txnId],
    settlementAmount,
    bankAmount: bankTxn.amount,
    differencePaise: Math.abs(
      settlementAmount - bankTxn.amount,
    ),
    confidenceScore:
      settlementAmount === bankTxn.amount ? 96 : 90,
    reasonCode:
      settlementAmount === bankTxn.amount
        ? "EXACT_MANY_TO_ONE_AGGREGATION"
        : "TOLERATED_MANY_TO_ONE_AGGREGATION",
    details:
      settlementAmount === bankTxn.amount
        ? `Matched ${bestGroup.length} settlements to one bank credit by exact aggregation`
        : `Matched ${bestGroup.length} settlements to one bank credit within ${config.tolerancePaise} paise`,
  };
}

export function findBankGroupForSettlement(
  settlement: NormalizedSettlement,
  bankTransactions: NormalizedBankTxn[],
  config: CardinalitySolverConfig = DEFAULT_CONFIG,
): CardinalityMatch | null {
  const credits = bankTransactions
    .filter((txn) => txn.type === "CREDIT")
    .filter(
      (txn) =>
        hoursBetween(settlement.settledAt, txn.txnDate) <=
        config.maxHours,
    )
    .sort((a, b) => {
      const deltaA = Math.abs(a.amount - settlement.amount);
      const deltaB = Math.abs(b.amount - settlement.amount);

      return (
        deltaA - deltaB ||
        a.txnId.localeCompare(b.txnId)
      );
    })
    .slice(0, config.maxCandidates);

  if (credits.length < 2) return null;

  let bestGroup: NormalizedBankTxn[] = [];
  let bestDifference = Number.POSITIVE_INFINITY;

  function search(
    startIndex: number,
    selected: NormalizedBankTxn[],
    sum: number,
  ): void {
    if (selected.length >= 2) {
      const difference = Math.abs(sum - settlement.amount);

      if (
        difference <= config.tolerancePaise &&
        (
          bestGroup.length === 0 ||
          difference < bestDifference ||
          (
            difference === bestDifference &&
            selected.length < bestGroup.length
          )
        )
      ) {
        bestGroup = [...selected];
        bestDifference = difference;
      }

      if (
        sum >=
        settlement.amount + config.tolerancePaise
      ) {
        return;
      }
    }

    if (selected.length >= config.maxGroupSize) return;

    for (let i = startIndex; i < credits.length; i += 1) {
      search(
        i + 1,
        [...selected, credits[i]],
        sum + credits[i].amount,
      );
    }
  }

  search(0, [], 0);

  if (bestGroup.length < 2) return null;

  const bankAmount = bestGroup.reduce(
    (sum, txn) => sum + txn.amount,
    0,
  );

  return {
    type: "1:N",
    settlementIds: [settlement.settlementId],
    bankTxnIds: bestGroup
      .map((txn) => txn.txnId)
      .sort(),
    settlementAmount: settlement.amount,
    bankAmount,
    differencePaise: Math.abs(
      bankAmount - settlement.amount,
    ),
    confidenceScore:
      bankAmount === settlement.amount ? 96 : 90,
    reasonCode:
      bankAmount === settlement.amount
        ? "EXACT_ONE_TO_MANY_AGGREGATION"
        : "TOLERATED_ONE_TO_MANY_AGGREGATION",
    details:
      bankAmount === settlement.amount
        ? `Matched one settlement to ${bestGroup.length} bank credits by exact aggregation`
        : `Matched one settlement to ${bestGroup.length} bank credits within ${config.tolerancePaise} paise`,
  };
}

export function findManyToManyMatch(
  settlements: NormalizedSettlement[],
  bankTransactions: NormalizedBankTxn[],
  config: CardinalitySolverConfig = DEFAULT_CONFIG,
): CardinalityMatch | null {
  const credits = bankTransactions
    .filter((txn) => txn.type === "CREDIT")
    .sort((a, b) => a.txnId.localeCompare(b.txnId))
    .slice(0, config.maxCandidates);

  const settlementCandidates = settlements
    .slice()
    .sort((a, b) =>
      a.settlementId.localeCompare(b.settlementId),
    )
    .slice(0, config.maxCandidates);

  if (
    settlementCandidates.length < 2 ||
    credits.length < 2
  ) {
    return null;
  }

  const buildGroups = <T>(
    items: T[],
    amountOf: (item: T) => number,
  ): Array<{ items: T[]; sum: number }> => {
    const groups: Array<{ items: T[]; sum: number }> = [];

    function walk(
      start: number,
      selected: T[],
      sum: number,
    ): void {
      if (selected.length >= 2) {
        groups.push({
          items: [...selected],
          sum,
        });
      }

      if (selected.length >= config.maxGroupSize) return;

      for (let i = start; i < items.length; i += 1) {
        walk(
          i + 1,
          [...selected, items[i]],
          sum + amountOf(items[i]),
        );
      }
    }

    walk(0, [], 0);

    return groups;
  };

  const settlementGroups = buildGroups(
    settlementCandidates,
    (settlement) => settlement.amount,
  );

  const bankGroups = buildGroups(
    credits,
    (txn) => txn.amount,
  );

  // Bucket bank groups by their integer sum so the pairing pass below can look
  // up groups inside the tolerance window in O(1) instead of scanning every
  // bank group for every settlement group. The raw O(groups²) nested loop is
  // pathological once the candidate pool reaches maxCandidates (the enumeration
  // grows to ~1.2M groups per side), so without bucketing the N:M pass hangs on
  // any realistic batch. Selection logic is unchanged: lowest difference wins,
  // then fewest total items.
  const bankGroupsBySum = new Map<
    number,
    Array<{ items: NormalizedBankTxn[]; sum: number }>
  >();
  for (const group of bankGroups) {
    const bucket = bankGroupsBySum.get(group.sum);
    if (bucket) {
      bucket.push(group);
    } else {
      bankGroupsBySum.set(group.sum, [group]);
    }
  }

  // Only iterate the distinct bank sums that actually exist, rather than every
  // integer in the tolerance window (which would still be ~200 lookups per
  // settlement group). With the sorted distinct sums, each settlement group
  // visits just the few buckets inside its window.
  const bankSums = [...bankGroupsBySum.keys()].sort((a, b) => a - b);

  let bestSettlementGroup: NormalizedSettlement[] = [];
  let bestBankGroup: NormalizedBankTxn[] = [];
  let bestDifference = Number.POSITIVE_INFINITY;

  for (const settlementGroup of settlementGroups) {
    const low = settlementGroup.sum - config.tolerancePaise;
    const high = settlementGroup.sum + config.tolerancePaise;

    // Binary search for the first bank sum >= low, then scan forward until the
    // window is exhausted.
    let lo = 0;
    let hi = bankSums.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (bankSums[mid] < low) lo = mid + 1;
      else hi = mid;
    }

    for (; lo < bankSums.length && bankSums[lo] <= high; lo += 1) {
      const candidates = bankGroupsBySum.get(bankSums[lo]);
      if (!candidates) continue;

      for (const bankGroup of candidates) {
        const difference = Math.abs(
          settlementGroup.sum - bankGroup.sum,
        );

        const totalCount =
          settlementGroup.items.length +
          bankGroup.items.length;

        const currentBestCount =
          bestSettlementGroup.length +
          bestBankGroup.length;

        if (
          bestSettlementGroup.length === 0 ||
          difference < bestDifference ||
          (
            difference === bestDifference &&
            totalCount < currentBestCount
          )
        ) {
          bestSettlementGroup =
            settlementGroup.items as NormalizedSettlement[];
          bestBankGroup =
            bankGroup.items as NormalizedBankTxn[];
          bestDifference = difference;
        }
      }
    }
  }

  if (
    bestSettlementGroup.length < 2 ||
    bestBankGroup.length < 2
  ) {
    return null;
  }

  const settlementAmount = bestSettlementGroup.reduce(
    (sum, item) => sum + item.amount,
    0,
  );

  const bankAmount = bestBankGroup.reduce(
    (sum, item) => sum + item.amount,
    0,
  );

  return {
    type: "N:M",
    settlementIds: bestSettlementGroup
      .map((settlement) => settlement.settlementId)
      .sort(),
    bankTxnIds: bestBankGroup
      .map((txn) => txn.txnId)
      .sort(),
    settlementAmount,
    bankAmount,
    differencePaise: bestDifference,
    confidenceScore:
      bestDifference === 0 ? 94 : 88,
    reasonCode:
      bestDifference === 0
        ? "EXACT_MANY_TO_MANY_CORRELATION"
        : "TOLERATED_MANY_TO_MANY_CORRELATION",
    details: `Correlated ${bestSettlementGroup.length} settlements with ${bestBankGroup.length} bank credits`,
  };
}