/*
 * SettleMate AI — Bank Statement CSV Adapter (HDFC / ICICI / SBI / Axis / Standard)
 */

import { parseAmountToPaise, parseCsvLines, parseDateFlexible } from "./csv-utils";
import type { IngestedDataset, ProviderAdapter, SchemaValidationResult } from "./types";
import type { NormalizedBankTxn } from "../reconciliation/types";

export class BankStatementCsvAdapter implements ProviderAdapter {
  readonly providerType = "BANK_STATEMENT";
  readonly schemaVersion = "bank-statement-v2";

  detectSchema(headerRow: string[]): SchemaValidationResult {
    const headers = headerRow.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
    const hasDate = headers.some((h) => h.includes("date") || h.includes("txndate") || h.includes("valuedate"));
    const hasAmount = headers.some((h) => h.includes("amount") || h.includes("credit") || h.includes("cr") || h.includes("deposit"));
    const hasNarration = headers.some((h) => h.includes("narration") || h.includes("description") || h.includes("particulars") || h.includes("remarks"));

    const errors: Array<{ field?: string; message: string }> = [];
    if (!hasDate) errors.push({ field: "date", message: "Missing transaction date column" });
    if (!hasAmount) errors.push({ field: "amount", message: "Missing credit/amount column" });

    return {
      valid: errors.length === 0,
      detectedProvider: "BANK_STATEMENT",
      detectedVersion: this.schemaVersion,
      rowCount: 0,
      errors,
      warnings: hasNarration ? [] : [{ field: "narration", message: "No narration column detected; UTR extraction will be limited" }],
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
          detectedProvider: "BANK_STATEMENT",
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
    const dateIdx = headerLower.findIndex((h) => h.includes("date") || h.includes("valuedate"));
    const txnIdIdx = headerLower.findIndex((h) => h.includes("ref") || h.includes("chq") || h.includes("txnid") || h === "id");
    const creditIdx = headerLower.findIndex((h) => (h.includes("credit") || h === "cr" || h.startsWith("cr_") || h.includes("deposit")) && !h.includes("description") && !h.includes("particulars"));
    const amountIdx = creditIdx !== -1 ? creditIdx : headerLower.findIndex((h) => h.includes("amount"));
    const narrationIdx = headerLower.findIndex((h) => h.includes("narration") || h.includes("description") || h.includes("particulars"));
    const utrIdx = headerLower.findIndex((h) => h.includes("utr") || h.includes("rrn") || h.includes("urn"));

    const bankTxns: NormalizedBankTxn[] = [];
    let totalCredits = 0;

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r]!;
      if (row.length === 0 || (row.length === 1 && !row[0])) continue;

      const rawAmount = amountIdx !== -1 ? row[amountIdx] : "0";
      const amountPaise = parseAmountToPaise(rawAmount);
      if (amountPaise <= 0) continue; // Only process positive credit deposits

      const rawDate = dateIdx !== -1 ? row[dateIdx] : "";
      const date = parseDateFlexible(rawDate);
      const narration = narrationIdx !== -1 ? (row[narrationIdx] ?? "") : "";
      
      // Extract UTR from explicit column or regex in narration
      let utr = utrIdx !== -1 ? row[utrIdx]?.trim() : "";
      if (!utr && narration) {
        const utrMatch = narration.match(/\b(UTR[0-9A-Z_]+|[0-9]{12}|[A-Z]{4}[0-9]{8,12}|CMS[0-9]+)\b/i);
        if (utrMatch) {
          utr = utrMatch[0];
        }
      }

      const txnId = (txnIdIdx !== -1 ? row[txnIdIdx]?.trim() : "") || `bank_txn_${r}_${Date.now()}`;

      bankTxns.push({
        dbId: `db_btxn_${r}`,
        txnId,
        amount: amountPaise,
        utr: utr || null,
        type: "CREDIT",
        narration: narration || "BANK CREDIT",
        txnDate: date,
        matched: false,
      });

      totalCredits += amountPaise;
    }

    validation.rowCount = bankTxns.length;

    const dataset: IngestedDataset = {
      provider: "BANK_STATEMENT",
      schemaVersion: this.schemaVersion,
      orders: [],
      payments: [],
      settlements: [],
      bankTxns,
      refunds: [],
      chargebacks: [],
      metadata: {
        ingestedAt: new Date(),
        sourceFilename: options?.batchId ? `statement_${options.batchId}.csv` : undefined,
        totalGrossAmountPaise: 0,
        totalBankCreditsPaise: totalCredits,
      },
    };

    return { dataset, validation };
  }

  private emptyDataset(): IngestedDataset {
    return {
      provider: "BANK_STATEMENT",
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
