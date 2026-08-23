/*
 * Large-scale synthetic batch generator for the scale benchmark.
 *
 * Produces a deterministic batch of `size` settlements that exercise the scalable
 * cardinality path across all three strategies:
 *
 *   - clean clusters  : a group of settlements (all utr = null so the matcher leaves them
 *                       eligible) aggregated by ONE bulk credit whose amount equals their
 *                       sum → resolves via the INDEXED whole-batch path.
 *   - bounded clusters: small groups whose settlements do not sum to a single credit but
 *                       are small enough for the bounded combinatorial fallback.
 *   - ambiguous clusters: a group whose bulk credit does NOT equal the settlement sum and
 *                       whose cluster is too large to brute-force → routed to REVIEW, no
 *                       fabricated relationship.
 *
 * Dates are deterministic (seeded LCG) and each cluster sits in its own 96h date bucket so
 * clusters never bleed into one another. The returned `clusters` ground truth lets the
 * benchmark assert that clean clusters actually resolve.
 */

const BULK_NARRATION = "RAZORPAY BULK SETTLEMENT BATCH";

const WINDOW_MS = 96 * 3_600_000;
const BASE_EPOCH = new Date("2025-01-01T00:00:00Z").getTime();

export interface ScaleClusterGroundTruth {
  index: number;
  kind: "clean" | "bounded" | "ambiguous";
  settlementIds: string[];
  creditTxnId: string | null;
  expectedSum: number | null;
}

export interface GeneratedScaleBatch {
  orders: Array<Record<string, unknown> & { orderId: string; amount: number; createdAt: Date }>;
  payments: Array<Record<string, unknown> & { paymentId: string; orderId: string; amount: number; createdAt: Date }>;
  settlements: Array<Record<string, unknown> & { settlementId: string; paymentId: string; amount: number; settledAt: Date }>;
  bankTransactions: Array<Record<string, unknown> & { txnId: string; amount: number; txnDate: Date; narration: string | null }>;
  groundTruths: Array<{ paymentId: string; expectedLabel: string; scenario: string }>;
  clusters: ScaleClusterGroundTruth[];
}

export interface ScaleGeneratorOptions {
  size: number;
  groupSize?: number;
  boundedShare?: number;
  ambiguousShare?: number;
  seed?: number;
}

/** Deterministic LCG so identical options → identical batches (reproducible benchmark). */
function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function paise(amountInr: number): number {
  return Math.round(amountInr * 100);
}

export function generateScaleBatch(
  options: ScaleGeneratorOptions,
): GeneratedScaleBatch {
  const size = options.size;
  const groupSize = options.groupSize ?? 12;
  const boundedShare = options.boundedShare ?? 0.2;
  const ambiguousShare = options.ambiguousShare ?? 0.1;
  const seed = options.seed ?? 20260822;
  const rng = createRng(seed);

  const orders: GeneratedScaleBatch["orders"] = [];
  const payments: GeneratedScaleBatch["payments"] = [];
  const settlements: GeneratedScaleBatch["settlements"] = [];
  const bankTransactions: GeneratedScaleBatch["bankTransactions"] = [];
  const groundTruths: GeneratedScaleBatch["groundTruths"] = [];
  const clusters: ScaleClusterGroundTruth[] = [];

  let settled = 0;
  let groupIndex = 0;

  while (settled < size) {
    const roll = rng();
    const kind: "clean" | "bounded" | "ambiguous" =
      roll < ambiguousShare
        ? "ambiguous"
        : roll < ambiguousShare + boundedShare
          ? "bounded"
          : "clean";

    const k = kind === "bounded" ? 3 + Math.floor(rng() * 3) : groupSize;
    const remaining = size - settled;
    const actualK = Math.min(k, remaining);
    if (actualK <= 0) break;

    const bucketEpoch = BASE_EPOCH + groupIndex * WINDOW_MS + Math.floor(rng() * 3_600_000);
    const settledAt = new Date(bucketEpoch);
    const creditTxnDate = new Date(bucketEpoch + 3_600_000 * 2);

    const settlementIds: string[] = [];
    const amounts: number[] = [];
    let sum = 0;

    for (let i = 0; i < actualK; i++) {
      const paymentId = `pay_${String(settled).padStart(8, "0")}`;
      const orderId = `order_${String(settled).padStart(8, "0")}`;
      const settlementId = `setl_${String(settled).padStart(8, "0")}`;
      settlementIds.push(settlementId);

      // Similar-magnitude amounts so the bulk credit is far (>> 1%) from any single
      // settlement — the matcher's fuzzy window never consumes a cardinality settlement.
      const amount = paise(5_000 + Math.floor(rng() * 45_000));
      amounts.push(amount);
      sum += amount;

      orders.push({
        orderId,
        amount,
        currency: "INR",
        status: "captured",
        customerEmail: "customer@example.com",
        description: "",
        createdAt: settledAt,
      });
      payments.push({
        paymentId,
        orderId,
        amount,
        currency: "INR",
        status: "captured",
        method: "upi",
        fee: 0,
        tax: 0,
        capturedAt: settledAt,
        createdAt: settledAt,
      });
      settlements.push({
        settlementId,
        paymentId,
        amount,
        fee: 0,
        tax: 0,
        utr: null,
        status: "settled",
        settledAt,
        createdAt: settledAt,
      });
      groundTruths.push({
        paymentId,
        expectedLabel: "MISSING_BANK_CREDIT",
        scenario: kind,
      });

      settled += 1;
    }

    // Clean clusters aggregate into one bulk credit equal to the settlement sum.
    if (kind !== "ambiguous") {
      const creditTxnId = `txn_grp_${groupIndex}`;
      const creditAmount =
        kind === "clean"
          ? sum
          : // bounded clusters: a credit that is NOT the exact sum (within 1% to stay
            // fuzzy-safe) so the bounded solver has to find a subset.
            sum + Math.round(sum * 0.07);
      bankTransactions.push({
        txnId: creditTxnId,
        utr: null,
        amount: creditAmount,
        type: "CREDIT",
        narration: BULK_NARRATION,
        balance: 100_000_000,
        txnDate: creditTxnDate,
        valueDate: null,
      });
      clusters.push({
        index: groupIndex,
        kind,
        settlementIds,
        creditTxnId,
        expectedSum: creditAmount,
      });
    } else {
      // Ambiguous: a bulk credit that does NOT match the settlement sum (outside the
      // 100-paise tolerance) — the cluster is too large to brute-force → review.
      const creditTxnId = `txn_grp_${groupIndex}`;
      bankTransactions.push({
        txnId: creditTxnId,
        utr: null,
        amount: sum + 5_000,
        type: "CREDIT",
        narration: BULK_NARRATION,
        balance: 100_000_000,
        txnDate: creditTxnDate,
        valueDate: null,
      });
      clusters.push({
        index: groupIndex,
        kind,
        settlementIds,
        creditTxnId,
        expectedSum: sum,
      });
    }

    groupIndex += 1;
  }

  return {
    orders,
    payments,
    settlements,
    bankTransactions,
    groundTruths,
    clusters,
  };
}
