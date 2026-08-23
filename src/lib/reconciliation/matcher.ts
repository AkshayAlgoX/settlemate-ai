import type { BatchData, MatchResult } from "./types";
import type { Indexes } from "./indexer";
import { computeConfidence, classifyByConfidence } from "./confidence";
import { SETTLEMENT_CONFIG } from "@/lib/constants";

export function matchAllRecords(
  data: BatchData,
  indexes: Indexes
): MatchResult[] {
  const results: MatchResult[] = [];
  const matchedBankTxnIds = new Set<string>();

  // ── PHASE 1: Process each captured payment ──
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

    // Get order
    const order = indexes.orderById.get(payment.orderId);
    result.orderAmount = order ? order.amount : payment.amount;

    // Get refunds
    const refunds = indexes.refundsByPaymentId.get(payment.paymentId) || [];
    result.refundIds = refunds.map((r) => r.refundId);
    result.refundAmount = refunds.reduce((sum, r) => sum + r.amount, 0);

    // Get chargebacks
    const chargebacks = indexes.chargebacksByPaymentId.get(payment.paymentId) || [];
    result.chargebackIds = chargebacks.map((c) => c.chargebackId);
    result.chargebackAmount = chargebacks.reduce((sum, c) => sum + c.amount, 0);

    // Compute expected net
    result.expectedNetAmount =
      payment.amount - payment.fee - payment.tax - result.refundAmount - result.chargebackAmount;

    // Get settlements for this payment
    const settlements = indexes.settlementsByPaymentId.get(payment.paymentId) || [];
    result.settlementIds = settlements.map((s) => s.settlementId);

    // ── CLASSIFICATION LOGIC ──

    if (settlements.length === 0) {
      // No settlement found
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
      // Duplicate settlement
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

    // Exactly one settlement
    const settlement = settlements[0];
    result.actualSettledAmount = settlement.amount;

    // Check amount match
    const amountDelta = Math.abs(result.expectedNetAmount - settlement.amount);
    const TOLERANCE = SETTLEMENT_CONFIG.AMOUNT_TOLERANCE_PAISE;

    if (amountDelta > TOLERANCE) {
      // Amount mismatch — determine specific type
      if (result.refundAmount > 0) {
        // Check if the mismatch is approximately the refund amount
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

    // ── PHASE 2: Find bank credit ──
    let bankTxn = null;

    // Exact UTR match
    if (settlement.utr) {
      bankTxn = indexes.bankByUtr.get(settlement.utr) || null;
      if (bankTxn) {
        result.matchMethod = "EXACT_UTR";
        result.bankTxnIds = [bankTxn.txnId];
        result.bankCreditedAmount = bankTxn.amount;
        matchedBankTxnIds.add(bankTxn.txnId);

        // Check bank amount
        const bankDelta = Math.abs(bankTxn.amount - settlement.amount);
        if (bankDelta > TOLERANCE && result.status === "AUTO_MATCHED") {
          result.status = "AMOUNT_MISMATCH";
          result.mismatchAmount = bankDelta;
          result.matchDetails = `Bank credit ₹${bankTxn.amount / 100} ≠ settlement ₹${settlement.amount / 100}`;
        }

        // Check timing
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

    // Fuzzy match if no UTR match
    if (!bankTxn) {
      const candidates = findFuzzyBankCandidates(
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

        // Check timing for fuzzy match too
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
        // No bank credit found
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

    // Compute confidence
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

    // Apply confidence-based reclassification
    result.status = classifyByConfidence(result.confidenceScore, result.status);

    results.push(result);
  }

  // ── PHASE 3: Detect orphan bank credits ──
  for (const bankTxn of data.bankTransactions) {
    if (bankTxn.type === "CREDIT" && !matchedBankTxnIds.has(bankTxn.txnId)) {
      // Check if this bank credit matches any settlement by UTR
      const isMatchedToSettlement =
        bankTxn.utr === null
          ? indexes.hasNullSettlementUtr
          : indexes.settlementUtrSet.has(bankTxn.utr);

      if (!isMatchedToSettlement) {
        // This is an orphan bank credit
        const orphanResult: MatchResult = {
          paymentId: extractIdFromNarration(bankTxn.narration, "pay_") || `orphan_${bankTxn.txnId}`,
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

        // Try to extract settlement ID from narration
        const setlId = extractIdFromNarration(bankTxn.narration, "setl_");
        if (setlId) {
          orphanResult.settlementIds = [setlId];
        }

        results.push(orphanResult);
      }
    }
  }

  return results;
}

function lowerBound(arr: number[], target: number): number {
  let low = 0;
  let high = arr.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (arr[mid] < target) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

function upperBound(arr: number[], target: number): number {
  let low = 0;
  let high = arr.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (arr[mid] <= target) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

function findFuzzyBankCandidates(
  settlement: { amount: number; settledAt: Date | null; settlementId: string; paymentId: string },
  indexes: Indexes,
  matchedIds: Set<string>
): BatchData["bankTransactions"] {
  const candidates: BatchData["bankTransactions"] = [];
  const TOLERANCE = Math.max(SETTLEMENT_CONFIG.AMOUNT_TOLERANCE_PAISE, Math.round(settlement.amount * 0.01));
  const minAmount = settlement.amount - TOLERANCE;
  const maxAmount = settlement.amount + TOLERANCE;

  const sorted = indexes.sortedBankAmounts;
  const startIdx = lowerBound(sorted, minAmount);
  const endIdx = upperBound(sorted, maxAmount);

  if (startIdx >= endIdx) {
    return candidates;
  }

  // Get matching amounts preserving original insertion order
  let matchingAmounts: number[];
  const count = endIdx - startIdx;
  if (count === 1) {
    matchingAmounts = [sorted[startIdx]];
  } else {
    matchingAmounts = sorted.slice(startIdx, endIdx);
    const orderMap = indexes.amountFirstSeenIndex;
    matchingAmounts.sort((a, b) => (orderMap.get(a) ?? 0) - (orderMap.get(b) ?? 0));
  }

  for (const amount of matchingAmounts) {
    const txns = indexes.bankByAmount.get(amount);
    if (!txns) continue;
    for (const txn of txns) {
      if (matchedIds.has(txn.txnId)) continue;
      if (txn.type !== "CREDIT") continue;

      // Check date window
      if (settlement.settledAt) {
        const hoursDiff =
          (txn.txnDate.getTime() - settlement.settledAt.getTime()) /
          (1000 * 60 * 60);
        if (hoursDiff < -1 || hoursDiff > SETTLEMENT_CONFIG.BANK_CREDIT_MAX_HOURS) continue;
      }

      candidates.push(txn);
    }
  }

  return candidates;
}

function extractIdFromNarration(
  narration: string | null,
  prefix: string
): string | null {
  if (!narration) return null;
  const regex = new RegExp(`${prefix}[a-z0-9_]+`, "i");
  const match = narration.match(regex);
  return match ? match[0].toLowerCase() : null;
}