/*
 * SettleMate AI — Generic Payment Provider Adapter (Flexible Column Mapping)
 */

import { parseAmountToPaise, parseCsvLines, parseDateFlexible } from "./csv-utils";
import type { IngestedDataset, ProviderAdapter, SchemaValidationResult } from "./types";
import type {
  NormalizedBankTxn,
  NormalizedOrder,
  NormalizedPayment,
  NormalizedSettlement,
} from "../reconciliation/types";

export class GenericGatewayAdapter implements ProviderAdapter {
  readonly providerType = "GENERIC_CSV";
  readonly schemaVersion = "generic-v1";

  detectSchema(headerRow: string[]): SchemaValidationResult {
    const headers = headerRow.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
    const hasAmount = headers.some((h) => h.includes("amount") || h.includes("total") || h.includes("sum"));

    const errors: Array<{ field?: string; message: string }> = [];
    if (!hasAmount) {
      errors.push({ field: "amount", message: "Missing amount/total column in CSV" });
    }

    return {
      valid: errors.length === 0,
      detectedProvider: "GENERIC_CSV",
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
          detectedProvider: "GENERIC_CSV",
          detectedVersion: this.schemaVersion,
          rowCount: 0,
          errors: [{ message: "CSV is empty" }],
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

    const idIdx = headerLower.findIndex((h) => h.includes("id") || h.includes("ref") || h.includes("txnid"));
    const amountIdx = headerLower.findIndex((h) => h.includes("amount") || h.includes("total"));
    const feeIdx = headerLower.findIndex((h) => h.includes("fee"));
    const utrIdx = headerLower.findIndex((h) => h.includes("utr") || h.includes("rrn"));
    const dateIdx = headerLower.findIndex((h) => h.includes("date") || h.includes("time"));

    const orders: NormalizedOrder[] = [];
    const payments: NormalizedPayment[] = [];
    const settlements: NormalizedSettlement[] = [];
    const bankTxns: NormalizedBankTxn[] = [];
    let totalGross = 0;

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r]!;
      if (!row || row.length === 0 || (row.length === 1 && !row[0])) continue;

      const rawAmount = amountIdx !== -1 ? row[amountIdx] : "0";
      const amountPaise = parseAmountToPaise(rawAmount);
      const feePaise = feeIdx !== -1 ? parseAmountToPaise(row[feeIdx]) : 0;
      const date = parseDateFlexible(dateIdx !== -1 ? row[dateIdx] : "");
      const utr = (utrIdx !== -1 ? row[utrIdx]?.trim() : "") || null;
      const id = (idIdx !== -1 ? row[idIdx]?.trim() : "") || `gen_${r}`;

      orders.push({
        dbId: `db_gord_${r}`,
        orderId: `order_${id}`,
        amount: amountPaise,
        status: "paid",
        createdAt: date,
      });

      payments.push({
        dbId: `db_gpay_${r}`,
        paymentId: id,
        orderId: `order_${id}`,
        amount: amountPaise,
        fee: feePaise,
        tax: 0,
        status: "settled",
        method: "GENERIC",
        createdAt: date,
        capturedAt: date,
      });

      settlements.push({
        dbId: `db_gsetl_${r}`,
        settlementId: `setl_${id}`,
        paymentId: id,
        amount: amountPaise - feePaise,
        fee: feePaise,
        tax: 0,
        utr,
        status: "settled",
        settledAt: date,
        createdAt: date,
      });

      totalGross += amountPaise;
    }

    validation.rowCount = payments.length;

    const dataset: IngestedDataset = {
      provider: "GENERIC_CSV",
      schemaVersion: this.schemaVersion,
      orders,
      payments,
      settlements,
      bankTxns,
      refunds: [],
      chargebacks: [],
      metadata: {
        ingestedAt: new Date(),
        totalGrossAmountPaise: totalGross,
        totalBankCreditsPaise: 0,
      },
    };

    return { dataset, validation };
  }

  private emptyDataset(): IngestedDataset {
    return {
      provider: "GENERIC_CSV",
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
