/*
 * SettleMate AI — Razorpay Gateway Adapter (Payments, Settlements, Refunds, Transfers)
 */

import { parseAmountToPaise, parseCsvLines, parseDateFlexible } from "./csv-utils";
import type { IngestedDataset, ProviderAdapter, SchemaValidationResult } from "./types";
import type {
  NormalizedChargeback,
  NormalizedOrder,
  NormalizedPayment,
  NormalizedRefund,
  NormalizedSettlement,
} from "../reconciliation/types";

export class RazorpayGatewayAdapter implements ProviderAdapter {
  readonly providerType = "RAZORPAY";
  readonly schemaVersion = "razorpay-v2";

  detectSchema(headerRow: string[]): SchemaValidationResult {
    const headers = headerRow.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
    const hasPaymentId = headers.some((h) => h.includes("paymentid") || h.includes("payid") || h === "id");
    const hasAmount = headers.some((h) => h.includes("amount"));
    const hasSettlement = headers.some((h) => h.includes("settlement") || h.includes("utr") || h.includes("settledat"));

    const errors: Array<{ field?: string; message: string }> = [];
    if (!hasPaymentId && !hasSettlement) {
      errors.push({ field: "paymentId", message: "Missing Razorpay payment_id or settlement_id column" });
    }
    if (!hasAmount) {
      errors.push({ field: "amount", message: "Missing amount column" });
    }

    return {
      valid: errors.length === 0,
      detectedProvider: "RAZORPAY",
      detectedVersion: this.schemaVersion,
      rowCount: 0,
      errors,
      warnings: [],
    };
  }

  async parseCsvStream(
    csvContent: string,
    options?: { batchId?: string; strict?: boolean }
  ): Promise<{ dataset: IngestedDataset; validation: SchemaValidationResult }> {
    const rows = parseCsvLines(csvContent);
    if (rows.length < 2) {
      return {
        dataset: this.emptyDataset(),
        validation: {
          valid: false,
          detectedProvider: "RAZORPAY",
          detectedVersion: this.schemaVersion,
          rowCount: 0,
          errors: [{ message: "CSV file is empty or missing headers" }],
          warnings: [],
        },
      };
    }

    const header = rows[0]!;
    const validation = this.detectSchema(header);
    if (!validation.valid && options?.strict) {
      return { dataset: this.emptyDataset(), validation };
    }

    const headerLower = header.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
    const payIdIdx = headerLower.findIndex((h) => h.includes("paymentid") || h.includes("payid") || h === "id");
    const orderIdIdx = headerLower.findIndex((h) => h.includes("orderid"));
    const setlIdIdx = headerLower.findIndex((h) => h.includes("settlementid") || h.includes("setlid"));
    const amountIdx = headerLower.findIndex((h) => h.includes("amount") && !h.includes("fee") && !h.includes("tax"));
    const feeIdx = headerLower.findIndex((h) => h.includes("fee"));
    const taxIdx = headerLower.findIndex((h) => h.includes("tax"));
    const utrIdx = headerLower.findIndex((h) => h.includes("utr") || h.includes("rrn"));
    const dateIdx = headerLower.findIndex((h) => h.includes("createdat") || h.includes("settledat") || h.includes("date"));
    const statusIdx = headerLower.findIndex((h) => h.includes("status") || h.includes("state"));
    const methodIdx = headerLower.findIndex((h) => h.includes("method") || h.includes("channel"));

    const payments: NormalizedPayment[] = [];
    const settlements: NormalizedSettlement[] = [];
    const orders: NormalizedOrder[] = [];
    const refunds: NormalizedRefund[] = [];
    const chargebacks: NormalizedChargeback[] = [];

    let totalGross = 0;

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r]!;
      if (row.length === 0 || (row.length === 1 && !row[0])) continue;

      const rawAmount = amountIdx !== -1 ? row[amountIdx] : "0";
      const amountPaise = parseAmountToPaise(rawAmount);
      const feePaise = feeIdx !== -1 ? parseAmountToPaise(row[feeIdx]) : 0;
      const taxPaise = taxIdx !== -1 ? parseAmountToPaise(row[taxIdx]) : 0;
      const date = parseDateFlexible(dateIdx !== -1 ? row[dateIdx] : "");

      const payId = (payIdIdx !== -1 ? row[payIdIdx]?.trim() : "") || `pay_rzp_${r}`;
      const orderId = (orderIdIdx !== -1 ? row[orderIdIdx]?.trim() : "") || `order_${payId}`;
      const setlId = (setlIdIdx !== -1 ? row[setlIdIdx]?.trim() : "") || `setl_${payId}`;
      const utr = (utrIdx !== -1 ? row[utrIdx]?.trim() : "") || null;
      const status = (statusIdx !== -1 ? row[statusIdx]?.trim().toLowerCase() : "captured") || "captured";
      const method = (methodIdx !== -1 ? row[methodIdx]?.trim().toUpperCase() : "UPI") || "UPI";

      orders.push({
        dbId: `db_ord_${r}`,
        orderId,
        amount: amountPaise,
        status: "paid",
        createdAt: date,
      });

      payments.push({
        dbId: `db_pay_${r}`,
        paymentId: payId,
        orderId,
        amount: amountPaise,
        fee: feePaise,
        tax: taxPaise,
        status,
        method,
        createdAt: date,
        capturedAt: date,
      });

      settlements.push({
        dbId: `db_setl_${r}`,
        settlementId: setlId,
        paymentId: payId,
        amount: amountPaise - feePaise - taxPaise,
        fee: feePaise,
        tax: taxPaise,
        utr,
        status: "settled",
        settledAt: date,
        createdAt: date,
      });

      totalGross += amountPaise;
    }

    validation.rowCount = payments.length;

    const dataset: IngestedDataset = {
      provider: "RAZORPAY",
      schemaVersion: this.schemaVersion,
      orders,
      payments,
      settlements,
      bankTxns: [],
      refunds,
      chargebacks,
      metadata: {
        ingestedAt: new Date(),
        sourceFilename: options?.batchId ? `razorpay_${options.batchId}.csv` : undefined,
        totalGrossAmountPaise: totalGross,
        totalBankCreditsPaise: 0,
      },
    };

    return { dataset, validation };
  }

  private emptyDataset(): IngestedDataset {
    return {
      provider: "RAZORPAY",
      schemaVersion: this.schemaVersion,
      orders: [],
      payments: [],
      settlements: [],
      bankTxns: [],
      refunds: [],
      chargebacks: [],
      metadata: {
        ingestedAt: new Date(),
        totalGrossAmountPaise: 0,
        totalBankCreditsPaise: 0,
      },
    };
  }
}
