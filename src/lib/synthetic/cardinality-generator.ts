/*
 * Cardinality-focused synthetic dataset generator.
 *
 * Separate from the official `generateSyntheticBatch` (which drives the benchmark
 * fingerprint). This file produces small, hand-shaped batches whose settlements and
 * bank credits are arranged so the deterministic matcher leaves the settlements
 * without a 1:1 bank relationship (bankTxnIds === []) — making them eligible for the
 * cardinality N:1 / 1:N / N:M passes in apply-cardinality.ts.
 *
 * Fuzzy-safety invariant relied upon by every scenario:
 *   no bank credit may be within max(100, settlement.amount * 0.01) paise of any
 *   single settlement's amount, otherwise the matcher's findFuzzyBankCandidates
 *   consumes the settlement and it becomes ineligible for cardinality.
 *
 * This module is pure — it imports no database code.
 */

const BASE_DATE = new Date("2025-08-01T00:00:00Z");
const BULK_NARRATION = "RAZORPAY BULK SETTLEMENT BATCH";
const NORMAL_NARRATION = "RAZORPAY SETTLEMENT";

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function addHours(date: Date, hours: number): Date {
  const d = new Date(date);
  d.setHours(d.getHours() + hours);
  return d;
}

export interface GeneratedRecord {
  orders: Array<{
    orderId: string; amount: number; currency: string;
    status: string; customerEmail: string; description: string; createdAt: Date;
  }>;
  payments: Array<{
    paymentId: string; orderId: string; amount: number; currency: string;
    status: string; method: string; fee: number; tax: number;
    capturedAt: Date | null; createdAt: Date;
  }>;
  settlements: Array<{
    settlementId: string; paymentId: string; amount: number;
    fee: number; tax: number; utr: string | null;
    status: string; settledAt: Date | null; createdAt: Date;
  }>;
  bankTransactions: Array<{
    txnId: string; utr: string | null; amount: number;
    type: string; narration: string | null; balance: number;
    txnDate: Date; valueDate: Date | null;
  }>;
  refunds: Array<{
    refundId: string; paymentId: string; amount: number;
    status: string; reason: string; createdAt: Date; processedAt: Date | null;
  }>;
  chargebacks: Array<{
    chargebackId: string; paymentId: string; amount: number;
    reason: string; status: string; createdAt: Date; resolvedAt: Date | null;
  }>;
  groundTruths: Array<{
    paymentId: string; expectedLabel: string; scenario: string;
  }>;
}

export type CardinalityScenarioKind =
  | "exactNto1"
  | "exactOneToN"
  | "exactNtoM"
  | "nToMWithNoise"
  | "ambiguousNtoM"
  | "toleranceBoundary"
  | "outsideTolerance"
  | "duplicateCandidates";

interface SettlementSpec {
  settlementId: string;
  paymentId: string;
  amount: number;
}

interface CreditSpec {
  txnId: string;
  amount: number;
  bulk: boolean;
  /**
   * When set to a distinct non-null UTR, the matcher classifies this credit as an
   * orphan bank credit (no settlement shares the UTR), so it is excluded from
   * cardinality and the financial-invariants control layer attributes it. Credits
   * left null remain available for the cardinality passes.
   */
  orphanUtr?: string;
}

interface ScenarioSpec {
  kind: CardinalityScenarioKind;
  settlements: SettlementSpec[];
  credits: CreditSpec[];
}

/**
 * Shape of a scenario. Kept intentionally small: one settlement per payment, all
 * with fee/tax = 0 and utr = null so the matcher cannot attach a 1:1 relationship.
 */
function buildRecord(spec: ScenarioSpec): GeneratedRecord {
  const orders: GeneratedRecord["orders"] = [];
  const payments: GeneratedRecord["payments"] = [];
  const settlements: GeneratedRecord["settlements"] = [];
  const groundTruths: GeneratedRecord["groundTruths"] = [];

  for (const s of spec.settlements) {
    const orderId = `order_${s.paymentId}`;
    orders.push({
      orderId,
      amount: s.amount,
      currency: "INR",
      status: "captured",
      customerEmail: "customer@example.com",
      description: "",
      createdAt: BASE_DATE,
    });

    payments.push({
      paymentId: s.paymentId,
      orderId,
      amount: s.amount,
      currency: "INR",
      status: "captured",
      method: "upi",
      fee: 0,
      tax: 0,
      capturedAt: BASE_DATE,
      createdAt: BASE_DATE,
    });

    // settledAt = captured + 2 days; within the 96h cardinality time window of the
    // bank credits below (txnDate = settledAt + 2h).
    const settledAt = addDays(BASE_DATE, 2);
    settlements.push({
      settlementId: s.settlementId,
      paymentId: s.paymentId,
      amount: s.amount,
      fee: 0,
      tax: 0,
      utr: null,
      status: "settled",
      settledAt,
      createdAt: BASE_DATE,
    });

    groundTruths.push({
      paymentId: s.paymentId,
      expectedLabel: "MISSING_BANK_CREDIT",
      scenario: spec.kind,
    });
  }

  const bankTransactions: GeneratedRecord["bankTransactions"] = spec.credits.map(
    (c) => ({
      txnId: c.txnId,
      utr: c.orphanUtr ?? null,
      amount: c.amount,
      type: "CREDIT",
      narration: c.bulk ? BULK_NARRATION : NORMAL_NARRATION,
      balance: 100_000_000,
      txnDate: addHours(addDays(BASE_DATE, 2), 2),
      valueDate: null,
    }),
  );

  return {
    orders,
    payments,
    settlements,
    bankTransactions,
    refunds: [],
    chargebacks: [],
    groundTruths,
  };
}

export function generateCardinalityBatch(
  kind: CardinalityScenarioKind,
): GeneratedRecord {
  switch (kind) {
    case "exactNto1":
      // Settlements S1(10000) + S2(25000) aggregate to one bulk credit of 35000.
      return buildRecord({
        kind,
        settlements: [
          { settlementId: "setl_1", paymentId: "pay_1", amount: 10000 },
          { settlementId: "setl_2", paymentId: "pay_2", amount: 25000 },
        ],
        credits: [{ txnId: "txn_b1", amount: 35000, bulk: true }],
      });

    case "exactOneToN":
      // One settlement of 50000 split across three ordinary credits summing to 50000.
      return buildRecord({
        kind,
        settlements: [
          { settlementId: "setl_1", paymentId: "pay_1", amount: 50000 },
        ],
        credits: [
          { txnId: "txn_c1", amount: 10000, bulk: false },
          { txnId: "txn_c2", amount: 15000, bulk: false },
          { txnId: "txn_c3", amount: 25000, bulk: false },
        ],
      });

    case "exactNtoM":
      // Settlements 30000 + 20000 ↔ two bulk credits 25000 + 25000 (both sum 50000).
      return buildRecord({
        kind,
        settlements: [
          { settlementId: "setl_1", paymentId: "pay_1", amount: 30000 },
          { settlementId: "setl_2", paymentId: "pay_2", amount: 20000 },
        ],
        credits: [
          { txnId: "txn_b1", amount: 25000, bulk: true },
          { txnId: "txn_b2", amount: 25000, bulk: true },
        ],
      });

    case "nToMWithNoise":
      // Real group: settlements 30000 + 20000 ↔ bulk credits 18000 + 32000 (both sum
      // 50000). Neither bulk credit (18000 / 32000) is within 1% of any single
      // settlement amount (so the matcher does not fuzzy-consume them) nor aggregates
      // any ≥2-settlement subset (so PASS 1 skips them) — the correlation is resolved
      // as an N:M in PASS 3. Noise: settlement S3(15000) plus bulk credits 12345 /
      // 88888 / 77777 that must neither fuzzy-match a settlement, form an N:1, nor
      // join the resolved group.
      return buildRecord({
        kind,
        settlements: [
          { settlementId: "setl_1", paymentId: "pay_1", amount: 30000 },
          { settlementId: "setl_2", paymentId: "pay_2", amount: 20000 },
          { settlementId: "setl_3", paymentId: "pay_3", amount: 15000 },
        ],
        credits: [
          { txnId: "txn_real1", amount: 18000, bulk: true },
          { txnId: "txn_real2", amount: 32000, bulk: true },
          // Unrelated credits from another batch carry distinct UTRs so the matcher
          // classifies them as orphan bank credits (excluded from the N:M, and
          // attributed by the financial-invariants control layer).
          { txnId: "txn_noise1", amount: 12345, bulk: true, orphanUtr: "NOISE_UTR_1" },
          { txnId: "txn_noise2", amount: 88888, bulk: true, orphanUtr: "NOISE_UTR_2" },
          { txnId: "txn_noise3", amount: 77777, bulk: true, orphanUtr: "NOISE_UTR_3" },
        ],
      });

    case "ambiguousNtoM":
      // No subset-sum of {31000, 22000} aligns (within 100 paise) with any subset-sum
      // of {26000, 21000}; PASS 1/2/3 all return null and no link is fabricated.
      return buildRecord({
        kind,
        settlements: [
          { settlementId: "setl_1", paymentId: "pay_1", amount: 31000 },
          { settlementId: "setl_2", paymentId: "pay_2", amount: 22000 },
        ],
        credits: [
          // Neither credit resolves to a settlement; with distinct UTRs they are
          // orphan-classified so no money is left unexplained.
          { txnId: "txn_b1", amount: 26000, bulk: true, orphanUtr: "AMB_UTR_A" },
          { txnId: "txn_b2", amount: 21000, bulk: true, orphanUtr: "AMB_UTR_B" },
        ],
      });

    case "toleranceBoundary":
      // Settlements sum 34900 vs bulk 35000 → delta 100, exactly at tolerancePaise.
      return buildRecord({
        kind,
        settlements: [
          { settlementId: "setl_1", paymentId: "pay_1", amount: 10000 },
          { settlementId: "setl_2", paymentId: "pay_2", amount: 24900 },
        ],
        credits: [{ txnId: "txn_b1", amount: 35000, bulk: true }],
      });

    case "outsideTolerance":
      // Settlements sum 34900 vs bulk 35001 → delta 101, outside tolerance → no link.
      return buildRecord({
        kind,
        settlements: [
          { settlementId: "setl_1", paymentId: "pay_1", amount: 10000 },
          { settlementId: "setl_2", paymentId: "pay_2", amount: 24900 },
        ],
        credits: [
          // Beyond tolerance so no relationship forms; a distinct UTR makes it an
          // orphan credit (attributed, not unexplained money).
          { txnId: "txn_b1", amount: 35001, bulk: true, orphanUtr: "TOL_UTR_O" },
        ],
      });

    case "duplicateCandidates":
      // One bulk credit of 60000. Two equal settlements of 30000 both participate
      // (fewest-items tie-break beats {30000, 20000, 10000}), and exactly one link is
      // produced — no duplicate row per participating settlement.
      return buildRecord({
        kind,
        settlements: [
          { settlementId: "setl_1", paymentId: "pay_1", amount: 30000 },
          { settlementId: "setl_2", paymentId: "pay_2", amount: 30000 },
          { settlementId: "setl_3", paymentId: "pay_3", amount: 20000 },
          { settlementId: "setl_4", paymentId: "pay_4", amount: 10000 },
        ],
        credits: [{ txnId: "txn_b1", amount: 60000, bulk: true }],
      });
  }
}
