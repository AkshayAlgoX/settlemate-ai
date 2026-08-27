/*
 * SettleMate AI — Multi-Currency & Tax-Aware Reconciliation Engine
 *
 * Reconciles global cross-border payments, settlements, refunds, and bank credits
 * across multiple sovereign currencies and tax jurisdictions while maintaining
 * strict integer minor-unit arithmetic in base INR paise.
 */

import {
  STATIC_FX_RATES,
  BASE_CURRENCY,
  convertToBaseMinor,
  formatForeignCurrency,
  type FxCurrencyDef,
} from "./fx-rates";
import { formatCurrency } from "@/lib/format";
import { buildIndexes } from "@/lib/reconciliation/indexer";
import { matchAllRecords } from "@/lib/reconciliation/matcher";
import { applyCardinalityMatching } from "@/lib/reconciliation/apply-cardinality";
import type {
  BatchData,
  NormalizedPayment,
  NormalizedSettlement,
  NormalizedBankTxn,
  NormalizedRefund,
  NormalizedChargeback,
  NormalizedOrder,
} from "@/lib/reconciliation/types";
import {
  type MultiCurrencyTxnInput,
  type ConvertedTxnDetail,
  type MultiCurrencyReconciliationResult,
  type MultiCurrencyExceptionItem,
} from "./currency-types";

export * from "./currency-types";

/**
 * Executes multi-currency and tax-aware reconciliation
 */
export async function reconcileMultiCurrencyBatch(
  inputs: MultiCurrencyTxnInput[],
  customRates: Record<string, FxCurrencyDef> = STATIC_FX_RATES
): Promise<MultiCurrencyReconciliationResult> {
  const convertedTransactions: ConvertedTxnDetail[] = [];

  const orders: NormalizedOrder[] = [];
  const payments: NormalizedPayment[] = [];
  const settlements: NormalizedSettlement[] = [];
  const bankTransactions: NormalizedBankTxn[] = [];
  const refunds: NormalizedRefund[] = [];
  const chargebacks: NormalizedChargeback[] = [];

  let totalGrossConvertedPaise = 0;
  let totalTaxConvertedPaise = 0;
  let totalNetConvertedPaise = 0;

  const currencyStats = new Map<
    string,
    { count: number; originalMinor: number; convertedPaise: number }
  >();
  const taxStats = new Map<string, { count: number; taxPaise: number }>();

  // 1. Convert each transaction and tax to base INR paise
  for (let idx = 0; idx < inputs.length; idx++) {
    const raw = inputs[idx];
    const currency = raw.currency.toUpperCase();
    const taxCurrency = (raw.taxCurrency || raw.currency).toUpperCase();
    const feeCurrency = (raw.feeCurrency || raw.currency).toUpperCase();

    const rawTaxMinor = Math.max(0, Math.floor(raw.taxAmount || 0));
    const rawFeeMinor = Math.max(0, Math.floor(raw.feeAmount || 0));
    const taxType = raw.taxType || (rawTaxMinor > 0 ? (currency === "INR" ? "GST" : "VAT") : "NONE");

    // Exact integer conversions
    const fxConversion = convertToBaseMinor(raw.amount, currency, BASE_CURRENCY, customRates);
    const taxFxConversion = convertToBaseMinor(rawTaxMinor, taxCurrency, BASE_CURRENCY, customRates);
    const feeFxConversion = convertToBaseMinor(rawFeeMinor, feeCurrency, BASE_CURRENCY, customRates);

    const baseAmountPaise = fxConversion.convertedMinor;
    const baseTaxPaise = taxFxConversion.convertedMinor;
    const baseFeePaise = feeFxConversion.convertedMinor;
    const baseTotalPaise = baseAmountPaise + baseTaxPaise; // Total amount inclusive of tax

    const dateObj = raw.date ? new Date(raw.date) : new Date();

    const detail: ConvertedTxnDetail = {
      id: raw.id,
      referenceId: raw.referenceId,
      type: raw.type,
      originalAmountMinor: raw.amount,
      originalCurrency: currency,
      originalTaxMinor: rawTaxMinor,
      taxCurrency,
      taxType,
      originalFeeMinor: rawFeeMinor,
      feeCurrency,
      fxConversion,
      taxFxConversion,
      feeFxConversion,
      baseAmountPaise,
      baseTaxPaise,
      baseFeePaise,
      baseTotalPaise,
      formattedOriginal: formatForeignCurrency(raw.amount, currency),
      formattedOriginalTax: formatForeignCurrency(rawTaxMinor, taxCurrency),
      formattedOriginalFee: formatForeignCurrency(rawFeeMinor, feeCurrency),
      formattedBaseAmount: formatCurrency(baseAmountPaise),
      formattedBaseTax: formatCurrency(baseTaxPaise),
      formattedBaseTotal: formatCurrency(baseTotalPaise),
      date: dateObj.toISOString(),
      utr: raw.utr,
      description: raw.description,
    };
    convertedTransactions.push(detail);

    // Track statistics
    totalGrossConvertedPaise += baseTotalPaise;
    totalTaxConvertedPaise += baseTaxPaise;
    totalNetConvertedPaise += baseAmountPaise - baseFeePaise;

    const curAcc = currencyStats.get(currency) || { count: 0, originalMinor: 0, convertedPaise: 0 };
    curAcc.count++;
    curAcc.originalMinor += raw.amount;
    curAcc.convertedPaise += baseTotalPaise;
    currencyStats.set(currency, curAcc);

    if (baseTaxPaise > 0) {
      const taxAcc = taxStats.get(taxType) || { count: 0, taxPaise: 0 };
      taxAcc.count++;
      taxAcc.taxPaise += baseTaxPaise;
      taxStats.set(taxType, taxAcc);
    }

    // 2. Map into normalized reconciliation structures
    const dbId = `mc_${idx}_${raw.id}`;
    switch (raw.type) {
      case "order":
        orders.push({
          dbId,
          orderId: raw.id,
          amount: baseTotalPaise,
          status: "PAID",
          createdAt: dateObj,
        });
        break;

      case "payment":
        payments.push({
          dbId,
          paymentId: raw.id,
          orderId: raw.referenceId || `ord_${raw.id}`,
          amount: baseTotalPaise,
          fee: baseFeePaise,
          tax: baseTaxPaise,
          method: currency === "INR" ? "UPI" : "CARD_FX",
          status: "captured",
          capturedAt: dateObj,
          createdAt: dateObj,
        });
        // Auto-create matching Order if not explicitly passed
        if (!orders.some((o) => o.orderId === (raw.referenceId || `ord_${raw.id}`))) {
          orders.push({
            dbId: `ord_auto_${raw.id}`,
            orderId: raw.referenceId || `ord_${raw.id}`,
            amount: baseTotalPaise,
            status: "PAID",
            createdAt: dateObj,
          });
        }
        break;

      case "settlement":
        settlements.push({
          dbId,
          settlementId: raw.id,
          paymentId: raw.referenceId,
          amount: baseAmountPaise, // Net settlement received
          fee: baseFeePaise,
          tax: baseTaxPaise,
          utr: raw.utr || `UTR_${raw.id}`,
          status: "settled",
          settledAt: dateObj,
          createdAt: dateObj,
        });
        break;

      case "bank_transaction":
        bankTransactions.push({
          dbId,
          txnId: raw.id,
          utr: raw.utr || raw.referenceId,
          amount: baseAmountPaise,
          type: "CREDIT",
          narration: `FX Inward Remittance ${raw.amount} ${currency} Ref:${raw.referenceId}`,
          txnDate: dateObj,
          matched: false,
        });
        break;

      case "refund":
        refunds.push({
          dbId,
          refundId: raw.id,
          paymentId: raw.referenceId,
          amount: baseAmountPaise + baseTaxPaise,
          status: "processed",
        });
        break;

      case "chargeback":
        chargebacks.push({
          dbId,
          chargebackId: raw.id,
          paymentId: raw.referenceId,
          amount: baseAmountPaise + baseTaxPaise,
          status: "open",
        });
        break;
    }
  }

  // 3. Execute reconciliation engine on converted base INR records
  const batchData: BatchData = {
    orders,
    payments,
    settlements,
    bankTransactions,
    refunds,
    chargebacks,
    groundTruths: [],
  };

  const indexes = buildIndexes(batchData);
  const matchResults = matchAllRecords(batchData, indexes);
  await applyCardinalityMatching(matchResults, batchData);

  // 4. Analyze exceptions and attach multi-currency root causes
  const exceptions: MultiCurrencyExceptionItem[] = [];
  let matchedCount = 0;
  let manualReviewCount = 0;

  for (const match of matchResults) {
    if (match.status === "AUTO_MATCHED") {
      matchedCount++;
      continue;
    }

    if (match.status === "NEEDS_MANUAL_REVIEW") {
      manualReviewCount++;
    }

    const linkedTxns = convertedTransactions.filter(
      (t) => t.id === match.paymentId || t.referenceId === match.paymentId || t.referenceId === match.orderId
    );

    const payTxn = linkedTxns.find((t) => t.type === "payment");
    const setTxn = linkedTxns.find((t) => t.type === "settlement");

    const paymentCurrency = payTxn?.originalCurrency || "INR";
    const settlementCurrency = setTxn?.originalCurrency || "INR";

    let fxVariancePaise = 0;
    let taxVariancePaise = 0;
    let rootCause = "Settlement discrepancy detected in cross-currency stream.";
    let recommendedAction = "Investigate discrepancy in Multi-Currency Journal.";

    if (paymentCurrency !== settlementCurrency) {
      rootCause = `Cross-currency mismatch: Payment billed in ${paymentCurrency} vs Settlement received in ${settlementCurrency}.`;
      recommendedAction = "Verify FX booking rate and gateway multi-currency conversion spread.";
    }

    if (payTxn && payTxn.baseTaxPaise > 0 && (!setTxn || setTxn.baseTaxPaise === 0)) {
      taxVariancePaise = payTxn.baseTaxPaise;
      rootCause += ` Tax discrepancy: Payment included ₹${(taxVariancePaise / 100).toFixed(2)} ${payTxn.taxType} tax not reflected in settlement.`;
      recommendedAction = "Post Tax Clearing Journal entry to offset withholding VAT/GST.";
    }

    if (match.mismatchAmount && match.mismatchAmount <= 500) {
      fxVariancePaise = match.mismatchAmount;
      rootCause += ` Minor FX Rounding variance of ₹${(fxVariancePaise / 100).toFixed(2)} (${fxVariancePaise} paise).`;
      recommendedAction = "Apply automated Policy §3.1 Penny Tolerance Rounding write-off.";
    }

    exceptions.push({
      id: `mc_exc_${match.paymentId}`,
      paymentId: match.paymentId,
      orderId: match.orderId,
      status: match.status,
      confidenceScore: match.confidenceScore,
      mismatchAmountPaise: match.mismatchAmount || 0,
      formattedMismatchINR: formatCurrency(match.mismatchAmount || 0),
      matchDetails: match.matchDetails || "Exception flagged by reconciliation engine",
      paymentCurrency,
      settlementCurrency,
      fxVariancePaise,
      taxVariancePaise,
      rootCause,
      recommendedAction,
    });
  }

  const totalResults = matchResults.length;
  const matchRatePct = totalResults > 0 ? Number(((matchedCount / totalResults) * 100).toFixed(1)) : 100;

  // 5. Build summary breakdown
  const currencyBreakdown = Array.from(currencyStats.entries()).map(([curr, stats]) => {
    const def = customRates[curr] || STATIC_FX_RATES.INR;
    return {
      currency: curr,
      symbol: def.symbol,
      transactionCount: stats.count,
      totalOriginalMinor: stats.originalMinor,
      formattedOriginalTotal: formatForeignCurrency(stats.originalMinor, curr),
      totalConvertedPaise: stats.convertedPaise,
      formattedConvertedINR: formatCurrency(stats.convertedPaise),
      fxRateToINR: def.rateToINR,
    };
  });

  const taxBreakdown = Array.from(taxStats.entries()).map(([type, stats]) => ({
    taxType: type,
    totalTaxPaise: stats.taxPaise,
    formattedTaxINR: formatCurrency(stats.taxPaise),
    transactionCount: stats.count,
  }));

  return {
    summary: {
      totalInputTransactions: inputs.length,
      matchedCount,
      exceptionCount: exceptions.length,
      manualReviewCount,
      matchRatePct,
      totalGrossConvertedPaise,
      totalTaxConvertedPaise,
      totalNetConvertedPaise,
      formattedTotalGrossINR: formatCurrency(totalGrossConvertedPaise),
      formattedTotalTaxINR: formatCurrency(totalTaxConvertedPaise),
      formattedTotalNetINR: formatCurrency(totalNetConvertedPaise),
      currencyBreakdown,
      taxBreakdown,
    },
    convertedTransactions,
    matchResults,
    exceptions,
    reconciledAt: new Date().toISOString(),
  };
}
