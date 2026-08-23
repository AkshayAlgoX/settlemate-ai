/*
 * Matcher Equivalence & Regression Test Suite
 *
 * Verifies 100% semantic equivalence between the optimized indexed pipeline
 * and the legacy oracle across all dimensions:
 *   - Fuzzy candidate ordering & tie-breaking
 *   - Multi-candidate handling
 *   - Null UTR vs non-null UTR behavior
 *   - Orphan credit detection and narration extraction
 *   - Duplicate settlement classification
 *   - Exact matchDetails content and ordering
 *   - Confidence scoring and status classification
 *   - Full-batch evaluation metrics parity
 */

import assert from "node:assert/strict";
import { generateSyntheticBatch } from "../synthetic/generator";
import { buildIndexes } from "./indexer";
import { matchAllRecords } from "./matcher";
import { evaluateResults } from "./evaluator";
import type { BatchData, MatchResult } from "./types";
import { computeConfidence, classifyByConfidence } from "./confidence";
import { SETTLEMENT_CONFIG } from "@/lib/constants";

let passed = 0;
let failed = 0;

function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name} — ${(err as Error).message}`);
  }
}

console.log("\nMatcher Equivalence & Regression Test Suite");

// ── LEGACY ORACLE IMPLEMENTATION ──

interface LegacyIndexes {
  paymentById: Map<string, BatchData["payments"][0]>;
  orderById: Map<string, BatchData["orders"][0]>;
  settlementsByPaymentId: Map<string, BatchData["settlements"]>;
  bankByUtr: Map<string, BatchData["bankTransactions"][0]>;
  bankByAmount: Map<number, BatchData["bankTransactions"]>;
  refundsByPaymentId: Map<string, BatchData["refunds"]>;
  chargebacksByPaymentId: Map<string, BatchData["chargebacks"]>;
  maxCapturedDate: Date;
}

function buildLegacyIndexes(data: BatchData): LegacyIndexes {
  const paymentById = new Map<string, BatchData["payments"][0]>();
  const orderById = new Map<string, BatchData["orders"][0]>();
  const settlementsByPaymentId = new Map<string, BatchData["settlements"]>();
  const bankByUtr = new Map<string, BatchData["bankTransactions"][0]>();
  const bankByAmount = new Map<number, BatchData["bankTransactions"]>();
  const refundsByPaymentId = new Map<string, BatchData["refunds"]>();
  const chargebacksByPaymentId = new Map<string, BatchData["chargebacks"]>();

  let maxCapturedDate = new Date(0);

  for (const p of data.payments) {
    paymentById.set(p.paymentId, p);
    if (p.capturedAt && p.capturedAt > maxCapturedDate) {
      maxCapturedDate = p.capturedAt;
    }
  }

  for (const o of data.orders) {
    orderById.set(o.orderId, o);
  }

  for (const s of data.settlements) {
    const existing = settlementsByPaymentId.get(s.paymentId) || [];
    existing.push(s);
    settlementsByPaymentId.set(s.paymentId, existing);
  }

  for (const b of data.bankTransactions) {
    if (b.utr && b.type === "CREDIT") {
      bankByUtr.set(b.utr, b);
    }
    if (b.type === "CREDIT") {
      const existing = bankByAmount.get(b.amount) || [];
      existing.push(b);
      bankByAmount.set(b.amount, existing);
    }
  }

  for (const r of data.refunds) {
    if (r.status === "processed") {
      const existing = refundsByPaymentId.get(r.paymentId) || [];
      existing.push(r);
      refundsByPaymentId.set(r.paymentId, existing);
    }
  }

  for (const c of data.chargebacks) {
    if (["open", "under_review", "accepted"].includes(c.status)) {
      const existing = chargebacksByPaymentId.get(c.paymentId) || [];
      existing.push(c);
      chargebacksByPaymentId.set(c.paymentId, existing);
    }
  }

  return {
    paymentById,
    orderById,
    settlementsByPaymentId,
    bankByUtr,
    bankByAmount,
    refundsByPaymentId,
    chargebacksByPaymentId,
    maxCapturedDate,
  };
}

function legacyFindFuzzyBankCandidates(
  settlement: { amount: number; settledAt: Date | null; settlementId: string; paymentId: string },
  indexes: LegacyIndexes,
  matchedIds: Set<string>
): BatchData["bankTransactions"] {
  const candidates: BatchData["bankTransactions"] = [];
  const TOLERANCE = Math.max(SETTLEMENT_CONFIG.AMOUNT_TOLERANCE_PAISE, Math.round(settlement.amount * 0.01));

  for (const [amount, txns] of indexes.bankByAmount.entries()) {
    if (Math.abs(amount - settlement.amount) <= TOLERANCE) {
      for (const txn of txns) {
        if (matchedIds.has(txn.txnId)) continue;
        if (txn.type !== "CREDIT") continue;

        if (settlement.settledAt) {
          const hoursDiff =
            (txn.txnDate.getTime() - settlement.settledAt.getTime()) /
            (1000 * 60 * 60);
          if (hoursDiff < -1 || hoursDiff > SETTLEMENT_CONFIG.BANK_CREDIT_MAX_HOURS) continue;
        }

        candidates.push(txn);
      }
    }
  }

  return candidates;
}

function legacyMatchAllRecords(
  data: BatchData,
  indexes: LegacyIndexes
): MatchResult[] {
  const results: MatchResult[] = [];
  const matchedBankTxnIds = new Set<string>();

  const capturedPayments = data.payments.filter((p) => p.status === "captured");

  for (const payment of capturedPayments) {
    const result: MatchResult = {
      paymentId: payment.paymentId,
      orderId: payment.orderId,
      settlementIds: [],
      bankTxnIds: [],
      refundIds: [],
      chargebackIds: [],
      orderAmount: 0,
      paymentAmount: payment.amount,
      paymentFee: payment.fee,
      paymentTax: payment.tax,
      refundAmount: 0,
      chargebackAmount: 0,
      expectedNetAmount: 0,
      actualSettledAmount: null,
      bankCreditedAmount: null,
      mismatchAmount: null,
      status: "AUTO_MATCHED",
      confidenceScore: 0,
      matchMethod: "NONE",
      matchDetails: "",
      cardinalityType: "1:1",
      cardinalityReason: null,
      relationshipScore: null,
    };

    const order = indexes.orderById.get(payment.orderId);
    result.orderAmount = order ? order.amount : payment.amount;

    const refunds = indexes.refundsByPaymentId.get(payment.paymentId) || [];
    result.refundIds = refunds.map((r) => r.refundId);
    result.refundAmount = refunds.reduce((sum, r) => sum + r.amount, 0);

    const chargebacks = indexes.chargebacksByPaymentId.get(payment.paymentId) || [];
    result.chargebackIds = chargebacks.map((c) => c.chargebackId);
    result.chargebackAmount = chargebacks.reduce((sum, c) => sum + c.amount, 0);

    result.expectedNetAmount =
      payment.amount - payment.fee - payment.tax - result.refundAmount - result.chargebackAmount;

    const settlements = indexes.settlementsByPaymentId.get(payment.paymentId) || [];
    result.settlementIds = settlements.map((s) => s.settlementId);

    if (settlements.length === 0) {
      if (payment.capturedAt) {
        const daysSinceCapture =
          (indexes.maxCapturedDate.getTime() - payment.capturedAt.getTime()) /
          (1000 * 60 * 60 * 24);

        if (daysSinceCapture < SETTLEMENT_CONFIG.DELAY_DAYS + 1) {
          result.status = "PENDING_SETTLEMENT";
          result.matchMethod = "NO_SETTLEMENT_YET";
          result.matchDetails = `Captured ${daysSinceCapture.toFixed(1)} days ago, within T+${SETTLEMENT_CONFIG.DELAY_DAYS} window`;
        } else {
          result.status = "MISSING_BANK_CREDIT";
          result.matchMethod = "OVERDUE_NO_SETTLEMENT";
          result.matchDetails = `Captured ${daysSinceCapture.toFixed(1)} days ago, settlement overdue`;
        }
      } else {
        result.status = "PENDING_SETTLEMENT";
        result.matchMethod = "NO_CAPTURE_DATE";
      }

      result.confidenceScore = computeConfidence({
        exactUtrMatch: false,
        exactIdMatch: true,
        exactAmountMatch: false,
        dateWithinWindow: result.status === "PENDING_SETTLEMENT",
        narrationContainsId: false,
        singleCandidate: true,
        multipleCandidates: false,
        amountDeltaPaise: 0,
        hasRefund: result.refundAmount > 0,
        hasChargeback: result.chargebackAmount > 0,
        noBankCredit: true,
        noSettlement: true,
      });

      results.push(result);
      continue;
    }

    if (settlements.length > 1) {
      result.status = "DUPLICATE_SETTLEMENT";
      result.actualSettledAmount = settlements.reduce((sum, s) => sum + s.amount, 0);
      result.matchMethod = "MULTIPLE_SETTLEMENTS";
      result.matchDetails = `Found ${settlements.length} settlements: ${settlements.map((s) => s.settlementId).join(", ")}`;

      result.confidenceScore = computeConfidence({
        exactUtrMatch: false,
        exactIdMatch: true,
        exactAmountMatch: false,
        dateWithinWindow: false,
        narrationContainsId: false,
        singleCandidate: false,
        multipleCandidates: true,
        amountDeltaPaise: Math.abs(result.expectedNetAmount - result.actualSettledAmount),
        hasRefund: result.refundAmount > 0,
        hasChargeback: result.chargebackAmount > 0,
        noBankCredit: false,
        noSettlement: false,
      });

      results.push(result);
      continue;
    }

    const settlement = settlements[0];
    result.actualSettledAmount = settlement.amount;

    const amountDelta = Math.abs(result.expectedNetAmount - settlement.amount);
    const TOLERANCE = SETTLEMENT_CONFIG.AMOUNT_TOLERANCE_PAISE;

    if (amountDelta > TOLERANCE) {
      if (result.refundAmount > 0) {
        const expectedWithoutRefund = payment.amount - payment.fee - payment.tax;
        const deltaWithoutRefund = Math.abs(expectedWithoutRefund - settlement.amount);
        if (deltaWithoutRefund <= TOLERANCE) {
          result.status = "REFUND_MISMATCH";
          result.matchDetails = `Refund ₹${result.refundAmount / 100} not deducted from settlement`;
        } else {
          result.status = "AMOUNT_MISMATCH";
          result.matchDetails = `Expected ₹${result.expectedNetAmount / 100}, settled ₹${settlement.amount / 100}, delta ₹${amountDelta / 100}`;
        }
      } else if (result.chargebackAmount > 0) {
        result.status = "CHARGEBACK_ADJUSTMENT";
        result.matchDetails = `Chargeback ₹${result.chargebackAmount / 100} on settled payment`;
      } else {
        result.status = "AMOUNT_MISMATCH";
        result.matchDetails = `Expected ₹${result.expectedNetAmount / 100}, settled ₹${settlement.amount / 100}, delta ₹${amountDelta / 100}`;
      }
      result.mismatchAmount = amountDelta;
    }

    let bankTxn = null;

    if (settlement.utr) {
      bankTxn = indexes.bankByUtr.get(settlement.utr) || null;
      if (bankTxn) {
        result.matchMethod = "EXACT_UTR";
        result.bankTxnIds = [bankTxn.txnId];
        result.bankCreditedAmount = bankTxn.amount;
        matchedBankTxnIds.add(bankTxn.txnId);

        const bankDelta = Math.abs(bankTxn.amount - settlement.amount);
        if (bankDelta > TOLERANCE && result.status === "AUTO_MATCHED") {
          result.status = "AMOUNT_MISMATCH";
          result.mismatchAmount = bankDelta;
          result.matchDetails = `Bank credit ₹${bankTxn.amount / 100} ≠ settlement ₹${settlement.amount / 100}`;
        }

        if (bankTxn && settlement.settledAt) {
          const hoursDelay =
            (bankTxn.txnDate.getTime() - settlement.settledAt.getTime()) /
            (1000 * 60 * 60);

          if (hoursDelay > SETTLEMENT_CONFIG.BANK_CREDIT_EXPECTED_HOURS && result.status === "AUTO_MATCHED") {
            result.status = "DELAYED_BANK_CREDIT";
            result.matchDetails = `Bank credit ${hoursDelay.toFixed(0)}h after settlement (expected <${SETTLEMENT_CONFIG.BANK_CREDIT_EXPECTED_HOURS}h)`;
          }
        }
      }
    }

    if (!bankTxn) {
      const candidates = legacyFindFuzzyBankCandidates(
        settlement,
        indexes,
        matchedBankTxnIds
      );

      if (candidates.length === 1) {
        bankTxn = candidates[0];
        result.matchMethod = result.matchMethod === "NONE" ? "FUZZY_AMOUNT_DATE" : result.matchMethod + "+FUZZY";
        result.bankTxnIds = [bankTxn.txnId];
        result.bankCreditedAmount = bankTxn.amount;
        matchedBankTxnIds.add(bankTxn.txnId);

        if (settlement.settledAt) {
          const hoursDelay =
            (bankTxn.txnDate.getTime() - settlement.settledAt.getTime()) /
            (1000 * 60 * 60);
          if (hoursDelay > SETTLEMENT_CONFIG.BANK_CREDIT_EXPECTED_HOURS && result.status === "AUTO_MATCHED") {
            result.status = "DELAYED_BANK_CREDIT";
            result.matchDetails = `Fuzzy match: bank credit ${hoursDelay.toFixed(0)}h after settlement`;
          }
        }
      } else if (candidates.length > 1) {
        if (result.status === "AUTO_MATCHED") {
          result.status = "NEEDS_MANUAL_REVIEW";
        }
        result.matchMethod = "AMBIGUOUS_FUZZY";
        result.matchDetails = `${candidates.length} bank credits match by amount/date: ${candidates.map((c) => c.txnId).join(", ")}`;
      } else {
        if (result.status === "AUTO_MATCHED") {
          if (settlement.settledAt) {
            const daysSinceSettlement =
              (indexes.maxCapturedDate.getTime() - settlement.settledAt.getTime()) /
              (1000 * 60 * 60 * 24);
            if (daysSinceSettlement > SETTLEMENT_CONFIG.DELAY_DAYS) {
              result.status = "MISSING_BANK_CREDIT";
              result.matchDetails = `Settlement ${settlement.settlementId} processed but no bank credit found`;
            }
          }
        }
        result.matchMethod = result.matchMethod === "NONE" ? "NO_BANK_MATCH" : result.matchMethod;
      }
    }

    result.confidenceScore = computeConfidence({
      exactUtrMatch: result.matchMethod.includes("EXACT_UTR"),
      exactIdMatch: true,
      exactAmountMatch: amountDelta <= TOLERANCE,
      dateWithinWindow: bankTxn !== null && settlement.settledAt !== null &&
        Math.abs(bankTxn!.txnDate.getTime() - settlement.settledAt!.getTime()) <
        SETTLEMENT_CONFIG.BANK_CREDIT_EXPECTED_HOURS * 3600000,
      narrationContainsId: bankTxn?.narration?.includes(settlement.settlementId) || false,
      singleCandidate: true,
      multipleCandidates: result.matchMethod === "AMBIGUOUS_FUZZY",
      amountDeltaPaise: amountDelta,
      hasRefund: result.refundAmount > 0,
      hasChargeback: result.chargebackAmount > 0,
      noBankCredit: !bankTxn,
      noSettlement: false,
    });

    result.status = classifyByConfidence(result.confidenceScore, result.status);

    results.push(result);
  }

  for (const bankTxn of data.bankTransactions) {
    if (bankTxn.type === "CREDIT" && !matchedBankTxnIds.has(bankTxn.txnId)) {
      const isMatchedToSettlement = data.settlements.some(
        (s) => s.utr === bankTxn.utr
      );

      if (!isMatchedToSettlement) {
        const orphanResult: MatchResult = {
          paymentId: legacyExtractId(bankTxn.narration, "pay_") || `orphan_${bankTxn.txnId}`,
          orderId: "N/A",
          settlementIds: [],
          bankTxnIds: [bankTxn.txnId],
          refundIds: [],
          chargebackIds: [],
          orderAmount: 0,
          paymentAmount: 0,
          paymentFee: 0,
          paymentTax: 0,
          refundAmount: 0,
          chargebackAmount: 0,
          expectedNetAmount: 0,
          actualSettledAmount: null,
          bankCreditedAmount: bankTxn.amount,
          mismatchAmount: null,
          status: "ORPHAN_BANK_CREDIT",
          confidenceScore: 25,
          matchMethod: "ORPHAN_DETECTION",
          matchDetails: `Bank credit ${bankTxn.txnId} (₹${bankTxn.amount / 100}) has no matching settlement. UTR: ${bankTxn.utr || "none"}. Narration: ${bankTxn.narration || "none"}`,
          cardinalityType: "1:1",
          cardinalityReason: null,
          relationshipScore: null,
        };

        const setlId = legacyExtractId(bankTxn.narration, "setl_");
        if (setlId) {
          orphanResult.settlementIds = [setlId];
        }

        results.push(orphanResult);
      }
    }
  }

  return results;
}

function legacyExtractId(narration: string | null, prefix: string): string | null {
  if (!narration) return null;
  const regex = new RegExp(`${prefix}[a-z0-9_]+`, "i");
  const match = narration.match(regex);
  return match ? match[0].toLowerCase() : null;
}

// ── TEST 1: Oracle Equivalence on Official Benchmark Batch (250 records) ──
check("Oracle Equivalence on Official 250-record synthetic batch", () => {
  const data = generateSyntheticBatch(250, 20260821) as unknown as BatchData;
  const legacyIndexes = buildLegacyIndexes(data);
  const optimizedIndexes = buildIndexes(data);

  const legacyResults = legacyMatchAllRecords(data, legacyIndexes);
  const optimizedResults = matchAllRecords(data, optimizedIndexes);

  assert.equal(legacyResults.length, optimizedResults.length, "Result counts must match");
  assert.deepEqual(optimizedResults, legacyResults, "All results must be deeply equal");

  const legacyMetrics = evaluateResults(legacyResults, data, {}, 100);
  const optimizedMetrics = evaluateResults(optimizedResults, data, {}, 100);

  assert.equal(optimizedMetrics.accuracy, legacyMetrics.accuracy);
  assert.equal(optimizedMetrics.precision, legacyMetrics.precision);
  assert.equal(optimizedMetrics.recall, legacyMetrics.recall);
  assert.equal(optimizedMetrics.autoMatched, legacyMetrics.autoMatched);
  assert.equal(optimizedMetrics.exceptionsFound, legacyMetrics.exceptionsFound);
  assert.equal(optimizedMetrics.unresolvedCount, legacyMetrics.unresolvedCount);
  assert.equal(optimizedMetrics.amountAtRisk, legacyMetrics.amountAtRisk);
  assert.deepEqual(optimizedMetrics.exceptionsByType, legacyMetrics.exceptionsByType);
  assert.deepEqual(optimizedMetrics.confusionMatrix, legacyMetrics.confusionMatrix);
});

// ── TEST 2: Oracle Equivalence across Multiple Random Seeds & Batch Sizes ──
for (const seed of [101, 2024, 77777, 999999]) {
  for (const size of [50, 100, 300]) {
    check(`Oracle Equivalence on synthetic batch (size=${size}, seed=${seed})`, () => {
      const data = generateSyntheticBatch(size, seed) as unknown as BatchData;
      const legacyIdx = buildLegacyIndexes(data);
      const optIdx = buildIndexes(data);

      const legacyRes = legacyMatchAllRecords(data, legacyIdx);
      const optRes = matchAllRecords(data, optIdx);

      assert.deepEqual(optRes, legacyRes, `Results must match for seed ${seed} size ${size}`);
    });
  }
}

// ── TEST 3: Multi-Candidate Fuzzy Ordering & Tie-Breaking ──
check("Fuzzy candidate ordering with multiple bank credits in same and different buckets", () => {
  const baseDate = new Date("2025-08-01T10:00:00Z");
  const testData: BatchData = {
    orders: [
      { dbId: "o1", orderId: "order_1", amount: 100000, status: "paid", createdAt: baseDate },
    ],
    payments: [
      {
        dbId: "p1", paymentId: "pay_1", orderId: "order_1", amount: 100000,
        fee: 0, tax: 0, method: "upi", status: "captured", capturedAt: baseDate, createdAt: baseDate,
      },
    ],
    settlements: [
      {
        dbId: "s1", settlementId: "setl_1", paymentId: "pay_1", amount: 100000,
        fee: 0, tax: 0, utr: null, status: "processed", settledAt: baseDate, createdAt: baseDate,
      },
    ],
    bankTransactions: [
      {
        dbId: "b1", txnId: "bank_txn_alpha", utr: null, amount: 100050, type: "CREDIT",
        narration: "BATCH A", txnDate: new Date(baseDate.getTime() + 3600000), matched: false,
      },
      {
        dbId: "b2", txnId: "bank_txn_beta", utr: null, amount: 99950, type: "CREDIT",
        narration: "BATCH B", txnDate: new Date(baseDate.getTime() + 7200000), matched: false,
      },
      {
        dbId: "b3", txnId: "bank_txn_gamma", utr: null, amount: 100000, type: "CREDIT",
        narration: "BATCH C", txnDate: new Date(baseDate.getTime() + 10800000), matched: false,
      },
    ],
    refunds: [],
    chargebacks: [],
    groundTruths: [],
  };

  const legacyIdx = buildLegacyIndexes(testData);
  const optIdx = buildIndexes(testData);

  const legacyRes = legacyMatchAllRecords(testData, legacyIdx);
  const optRes = matchAllRecords(testData, optIdx);

  assert.deepEqual(optRes, legacyRes);
  assert.equal(optRes[0].status, "NEEDS_MANUAL_REVIEW");
  assert.equal(optRes[0].matchMethod, "AMBIGUOUS_FUZZY");
  assert.equal(
    optRes[0].matchDetails,
    "3 bank credits match by amount/date: bank_txn_alpha, bank_txn_beta, bank_txn_gamma",
  );
});

// ── TEST 4: Null UTR vs Non-Null UTR & Orphan Detection ──
check("Orphan credit detection with null and non-null UTRs", () => {
  const baseDate = new Date("2025-08-01T10:00:00Z");
  const testData: BatchData = {
    orders: [],
    payments: [],
    settlements: [
      {
        dbId: "s1", settlementId: "setl_1", paymentId: "pay_1", amount: 50000,
        fee: 0, tax: 0, utr: "UTR_VALID_123", status: "processed", settledAt: baseDate, createdAt: baseDate,
      },
    ],
    bankTransactions: [
      // 1. Matched by UTR to settlement s1 (not orphan)
      {
        dbId: "b1", txnId: "txn_matched", utr: "UTR_VALID_123", amount: 50000, type: "CREDIT",
        narration: "VALID CREDIT", txnDate: baseDate, matched: false,
      },
      // 2. Unmatched UTR (orphan)
      {
        dbId: "b2", txnId: "txn_orphan_utr", utr: "UTR_UNKNOWN_999", amount: 75000, type: "CREDIT",
        narration: "ORPHAN WITH UTR", txnDate: baseDate, matched: false,
      },
      // 3. Null UTR (orphan because no settlement has null UTR)
      {
        dbId: "b3", txnId: "txn_orphan_null", utr: null, amount: 85000, type: "CREDIT",
        narration: "ORPHAN NO UTR setl_target_88", txnDate: baseDate, matched: false,
      },
    ],
    refunds: [],
    chargebacks: [],
    groundTruths: [],
  };

  const legacyIdx = buildLegacyIndexes(testData);
  const optIdx = buildIndexes(testData);

  const legacyRes = legacyMatchAllRecords(testData, legacyIdx);
  const optRes = matchAllRecords(testData, optIdx);

  assert.deepEqual(optRes, legacyRes);
  const orphanResults = optRes.filter((r) => r.status === "ORPHAN_BANK_CREDIT");
  assert.equal(orphanResults.length, 2);
  assert.equal(orphanResults[1].settlementIds[0], "setl_target_88");
});

// ── TEST 5: Duplicate Settlement Handling ──
check("Duplicate settlement classification and arithmetic parity", () => {
  const baseDate = new Date("2025-08-01T10:00:00Z");
  const testData: BatchData = {
    orders: [
      { dbId: "o1", orderId: "order_dup", amount: 200000, status: "paid", createdAt: baseDate },
    ],
    payments: [
      {
        dbId: "p1", paymentId: "pay_dup", orderId: "order_dup", amount: 200000,
        fee: 0, tax: 0, method: "upi", status: "captured", capturedAt: baseDate, createdAt: baseDate,
      },
    ],
    settlements: [
      {
        dbId: "s1", settlementId: "setl_d1", paymentId: "pay_dup", amount: 200000,
        fee: 0, tax: 0, utr: "UTR_D1", status: "processed", settledAt: baseDate, createdAt: baseDate,
      },
      {
        dbId: "s2", settlementId: "setl_d2", paymentId: "pay_dup", amount: 200000,
        fee: 0, tax: 0, utr: "UTR_D2", status: "processed", settledAt: baseDate, createdAt: baseDate,
      },
    ],
    bankTransactions: [],
    refunds: [],
    chargebacks: [],
    groundTruths: [],
  };

  const legacyIdx = buildLegacyIndexes(testData);
  const optIdx = buildIndexes(testData);

  const legacyRes = legacyMatchAllRecords(testData, legacyIdx);
  const optRes = matchAllRecords(testData, optIdx);

  assert.deepEqual(optRes, legacyRes);
  assert.equal(optRes[0].status, "DUPLICATE_SETTLEMENT");
  assert.equal(optRes[0].actualSettledAmount, 400000);
});

// ── TEST 6: Canonicalization & Low-Allocation Hash Equivalence ──
function legacyCanonicalize(payload: object): string {
  function normalize(value: unknown): unknown {
    if (value instanceof Date) return value.toISOString();
    if (value === undefined) return null;
    if (Array.isArray(value)) return value.map(normalize);
    if (value !== null && typeof value === "object") {
      const record = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(record).sort()) {
        if (record[key] === undefined) continue;
        out[key] = normalize(record[key]);
      }
      return out;
    }
    return value;
  }
  return JSON.stringify(normalize(payload));
}

check("Canonicalization output & SHA256 hashes are identical between legacy and optimized implementation", async () => {
  const { canonicalize, sha256Hex } = await import("./audit-chain");

  const testCases = [
    { z: 1, a: "test", d: new Date("2026-08-23T00:00:00Z"), u: undefined, nested: { y: [1, 2, 3], x: "hello" } },
    { emptyObj: {}, emptyArr: [], nullVal: null, undefVal: undefined },
    { batch: generateSyntheticBatch(50) },
    { b: 2, a: 1, c: { sub2: "b", sub1: "a" } },
  ];

  for (const tc of testCases) {
    const legacyStr = legacyCanonicalize(tc);
    const optStr = canonicalize(tc);
    assert.equal(optStr, legacyStr, "canonical string output mismatch");
    assert.equal(sha256Hex(optStr), sha256Hex(legacyStr), "hash mismatch");
  }
});

console.log(`\nmatcher-equivalence: ${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  process.exit(1);
}
