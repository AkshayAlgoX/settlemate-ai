/*
 * SettleMate AI — Multi-Currency Types & Shared Utilities
 *
 * Pure shared frontend/backend data structures, currency definitions,
 * and synthetic sample generators without Node/DB dependencies.
 */

import {
  SUPPORTED_CURRENCIES,
  type ConversionResult,
} from "./fx-rates";
import type { MatchResult } from "@/lib/reconciliation/types";

export interface MultiCurrencyTxnInput {
  id: string;
  amount: number; // in native minor units (e.g. 10000 = $100.00 USD, 150000 = ₹1,500.00 INR)
  currency: string; // "USD", "EUR", "GBP", "SGD", "AED", "JPY", "INR"
  type: "payment" | "settlement" | "refund" | "chargeback" | "bank_transaction" | "order";
  taxAmount?: number; // native minor units of taxCurrency (defaults to 0)
  taxCurrency?: string; // currency for tax (defaults to txn currency)
  taxType?: "GST" | "VAT" | "SALES_TAX" | "CUSTOMS" | "NONE";
  feeAmount?: number; // native minor units
  feeCurrency?: string;
  date?: string | Date;
  referenceId: string; // paymentId / orderId linking key
  utr?: string;
  description?: string;
}

export interface ConvertedTxnDetail {
  id: string;
  referenceId: string;
  type: string;
  originalAmountMinor: number;
  originalCurrency: string;
  originalTaxMinor: number;
  taxCurrency: string;
  taxType: string;
  originalFeeMinor: number;
  feeCurrency: string;
  fxConversion: ConversionResult;
  taxFxConversion: ConversionResult;
  feeFxConversion: ConversionResult;
  baseAmountPaise: number; // amount converted to INR paise
  baseTaxPaise: number; // tax converted to INR paise
  baseFeePaise: number; // fee converted to INR paise
  baseTotalPaise: number; // baseAmountPaise + baseTaxPaise (Gross including tax)
  formattedOriginal: string;
  formattedOriginalTax: string;
  formattedOriginalFee: string;
  formattedBaseAmount: string;
  formattedBaseTax: string;
  formattedBaseTotal: string;
  date: string;
  utr?: string;
  description?: string;
}

export interface MultiCurrencyReconciliationSummary {
  totalInputTransactions: number;
  matchedCount: number;
  exceptionCount: number;
  manualReviewCount: number;
  matchRatePct: number;
  totalGrossConvertedPaise: number;
  totalTaxConvertedPaise: number;
  totalNetConvertedPaise: number;
  formattedTotalGrossINR: string;
  formattedTotalTaxINR: string;
  formattedTotalNetINR: string;
  currencyBreakdown: Array<{
    currency: string;
    symbol: string;
    transactionCount: number;
    totalOriginalMinor: number;
    formattedOriginalTotal: string;
    totalConvertedPaise: number;
    formattedConvertedINR: string;
    fxRateToINR: number;
  }>;
  taxBreakdown: Array<{
    taxType: string;
    totalTaxPaise: number;
    formattedTaxINR: string;
    transactionCount: number;
  }>;
}

export interface MultiCurrencyExceptionItem {
  id: string;
  paymentId: string;
  orderId: string;
  status: string;
  confidenceScore: number;
  mismatchAmountPaise: number;
  formattedMismatchINR: string;
  matchDetails: string;
  paymentCurrency: string;
  settlementCurrency: string;
  fxVariancePaise: number;
  taxVariancePaise: number;
  rootCause: string;
  recommendedAction: string;
}

export interface MultiCurrencyReconciliationResult {
  summary: MultiCurrencyReconciliationSummary;
  convertedTransactions: ConvertedTxnDetail[];
  matchResults: MatchResult[];
  exceptions: MultiCurrencyExceptionItem[];
  reconciledAt: string;
}

/**
 * Validates multi-currency input transactions
 */
export function validateMultiCurrencyInput(txns: MultiCurrencyTxnInput[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!Array.isArray(txns) || txns.length === 0) {
    return { valid: false, errors: ["Transaction array must not be empty"] };
  }

  txns.forEach((t, i) => {
    if (!t.id) errors.push(`Row ${i + 1}: Missing transaction 'id'`);
    if (typeof t.amount !== "number" || isNaN(t.amount) || t.amount < 0) {
      errors.push(`Row ${i + 1} (${t.id || "unknown"}): 'amount' must be a non-negative integer minor unit`);
    }
    if (!t.currency || !SUPPORTED_CURRENCIES.includes(t.currency.toUpperCase())) {
      errors.push(
        `Row ${i + 1} (${t.id || "unknown"}): Unsupported currency '${t.currency}'. Supported: ${SUPPORTED_CURRENCIES.join(", ")}`
      );
    }
    if (!["payment", "settlement", "refund", "chargeback", "bank_transaction", "order"].includes(t.type)) {
      errors.push(
        `Row ${i + 1} (${t.id || "unknown"}): Invalid type '${t.type}'. Must be payment, settlement, refund, chargeback, bank_transaction, or order`
      );
    }
    if (!t.referenceId) {
      errors.push(`Row ${i + 1} (${t.id || "unknown"}): Missing 'referenceId' for linking`);
    }
    // isNaN is required, not redundant: `typeof NaN === "number"` is true and
    // `NaN < 0` is false, so a NaN tax slipped through the type+range check.
    if (t.taxAmount !== undefined && (typeof t.taxAmount !== "number" || isNaN(t.taxAmount) || t.taxAmount < 0)) {
      errors.push(`Row ${i + 1} (${t.id || "unknown"}): 'taxAmount' must be a non-negative integer`);
    }
    // feeAmount reaches conversion as Math.max(0, Math.floor(raw.feeAmount || 0)),
    // which yields NaN for a non-numeric value and poisons every converted total
    // downstream. Validated on the same terms as taxAmount.
    if (t.feeAmount !== undefined && (typeof t.feeAmount !== "number" || isNaN(t.feeAmount) || t.feeAmount < 0)) {
      errors.push(`Row ${i + 1} (${t.id || "unknown"}): 'feeAmount' must be a non-negative integer`);
    }
    if (t.taxCurrency && !SUPPORTED_CURRENCIES.includes(t.taxCurrency.toUpperCase())) {
      errors.push(`Row ${i + 1} (${t.id || "unknown"}): Unsupported taxCurrency '${t.taxCurrency}'`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Generates a realistic sample dataset of 20 to 50 multi-currency transactions
 * across USD, EUR, GBP, SGD, AED, JPY, and INR with taxes, fees, and known anomalies.
 */
export function generateSampleMultiCurrencyBatch(count: number = 30): MultiCurrencyTxnInput[] {
  const inputs: MultiCurrencyTxnInput[] = [];

  const currencies = ["USD", "EUR", "GBP", "SGD", "AED", "INR"];
  const baseDate = new Date("2026-08-25T10:00:00Z");

  // Pair counter for payments + settlements + bank txns
  const totalPairs = Math.max(5, Math.floor(count / 3));

  for (let i = 1; i <= totalPairs; i++) {
    const cur = currencies[(i - 1) % currencies.length];
    const isJpy = cur === "JPY";

    // Amounts in foreign minor units
    // e.g. USD 120.00 (12000 cents), EUR 95.50 (9550 cents), INR 15,000.00 (1500000 paise)
    const baseMinor = isJpy ? 15000 + i * 1000 : (100 + i * 25) * 100;
    const taxRate = cur === "INR" ? 0.18 : 0.2; // 18% GST or 20% VAT
    const taxMinor = Math.floor(baseMinor * taxRate);
    const feeMinor = Math.floor(baseMinor * 0.015); // 1.5% fee

    const txnDate = new Date(baseDate.getTime() + i * 3600000);
    const settleDate = new Date(txnDate.getTime() + 86400000); // T+1

    const paymentId = `PAY_FX_${cur}_${1000 + i}`;
    const orderId = `ORD_FX_${cur}_${1000 + i}`;
    const utr = `UTR_FX_${cur}_${9000 + i}`;

    // Scenario anomalies for specific items:
    // Pair 2: FX Rounding & Tax Mismatch (settlement missing VAT)
    // Pair 4: Cross-Border Partial Refund (refund issued in foreign currency)
    // Pair 5: Duplicate Bank Remittance
    const isTaxDiscrepancy = i === 2;
    const isRefundScenario = i === 4;
    const isDuplicateBankCredit = i === 5;

    // 1. Customer Payment (Gross + Tax)
    inputs.push({
      id: paymentId,
      amount: baseMinor,
      currency: cur,
      type: "payment",
      taxAmount: taxMinor,
      taxCurrency: cur,
      taxType: cur === "INR" ? "GST" : "VAT",
      feeAmount: feeMinor,
      date: txnDate.toISOString(),
      referenceId: orderId,
      description: `Cross-border checkout ${cur} ${paymentId}`,
    });

    // 2. Gateway Settlement
    const settleAmount = isTaxDiscrepancy ? baseMinor - feeMinor : baseMinor - feeMinor; // Net amount
    inputs.push({
      id: `SET_${paymentId}`,
      amount: settleAmount,
      currency: cur,
      type: "settlement",
      taxAmount: isTaxDiscrepancy ? 0 : taxMinor,
      taxCurrency: cur,
      feeAmount: feeMinor,
      date: settleDate.toISOString(),
      referenceId: paymentId,
      utr,
      description: `Gateway net settlement for ${paymentId}`,
    });

    // 3. Bank Nodal Inward Remittance
    const bankAmount = settleAmount;
    inputs.push({
      id: `BNK_${paymentId}`,
      amount: bankAmount,
      currency: cur,
      type: "bank_transaction",
      date: new Date(settleDate.getTime() + 1800000).toISOString(),
      referenceId: utr,
      utr,
      description: `Nodal bank inward credit UTR:${utr}`,
    });

    // 4. Optional Refund Scenario
    if (isRefundScenario) {
      const refundMinor = Math.floor(baseMinor * 0.3); // 30% partial refund
      inputs.push({
        id: `REF_${paymentId}`,
        amount: refundMinor,
        currency: cur,
        type: "refund",
        date: new Date(settleDate.getTime() + 7200000).toISOString(),
        referenceId: paymentId,
        description: `Partial customer refund voucher ${cur}`,
      });
    }

    // 5. Optional Duplicate Bank Credit
    if (isDuplicateBankCredit) {
      inputs.push({
        id: `BNK_DUP_${paymentId}`,
        amount: bankAmount,
        currency: cur,
        type: "bank_transaction",
        date: new Date(settleDate.getTime() + 3600000).toISOString(),
        referenceId: utr,
        utr,
        description: `Duplicate bank credit transmission UTR:${utr}`,
      });
    }
  }

  return inputs;
}
