/*
 * SettleMate AI — Streaming Multi-Provider Ingestion Engine
 */

import { BankStatementCsvAdapter } from "./bank-statement-csv";
import { parseCsvLines } from "./csv-utils";
import { RazorpayGatewayAdapter } from "./gateway-razorpay";
import { GenericGatewayAdapter } from "./generic-gateway";
import type { IngestedDataset, ProviderAdapter, ProviderType, SchemaValidationResult } from "./types";
import { prisma } from "../db";

export class StreamingIngestionEngine {
  private adapters: Map<ProviderType, ProviderAdapter> = new Map();

  constructor() {
    this.registerAdapter(new RazorpayGatewayAdapter());
    this.registerAdapter(new BankStatementCsvAdapter());
    this.registerAdapter(new GenericGatewayAdapter());
  }

  registerAdapter(adapter: ProviderAdapter): void {
    this.adapters.set(adapter.providerType, adapter);
  }

  /**
   * Auto-detect the provider type based on CSV header keywords and structure.
   */
  detectProvider(csvContent: string): ProviderType {
    const rows = parseCsvLines(csvContent);
    if (rows.length === 0 || !rows[0]) return "GENERIC_CSV";

    const header = rows[0].map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
    const headerStr = header.join(" ");

    if (headerStr.includes("razorpay") || (headerStr.includes("paymentid") && headerStr.includes("settlementid"))) {
      return "RAZORPAY";
    }
    if (headerStr.includes("narration") || headerStr.includes("valuedate") || (headerStr.includes("credit") && headerStr.includes("balance"))) {
      return "BANK_STATEMENT";
    }
    return "GENERIC_CSV";
  }

  /**
   * Ingest and validate a raw CSV stream, returning the normalized dataset.
   */
  async ingestCsv(
    csvContent: string,
    forcedProvider?: ProviderType,
    options?: { batchId?: string; strict?: boolean }
  ): Promise<{ dataset: IngestedDataset; validation: SchemaValidationResult }> {
    const provider = forcedProvider ?? this.detectProvider(csvContent);
    const adapter = this.adapters.get(provider) ?? this.adapters.get("GENERIC_CSV")!;
    return adapter.parseCsvStream(csvContent, options);
  }

  /**
   * Persist an ingested dataset into Prisma Batch records atomically.
   */
  async persistDatasetToBatch(
    dataset: IngestedDataset,
    batchName: string = `Ingestion_${new Date().toISOString()}`
  ): Promise<{ batchId: string; totalRecords: number }> {
    const totalRecords =
      dataset.orders.length +
      dataset.payments.length +
      dataset.settlements.length +
      dataset.bankTxns.length +
      dataset.refunds.length +
      dataset.chargebacks.length;

    const batch = await prisma.batch.create({
      data: {
        name: batchName,
        size: totalRecords,
        status: "UPLOADED",
        totalRecords,
        orders: {
          create: dataset.orders.map((o) => ({
            orderId: o.orderId,
            amount: o.amount,
            status: o.status,
            createdAt: o.createdAt,
          })),
        },
        payments: {
          create: dataset.payments.map((p) => ({
            paymentId: p.paymentId,
            orderId: p.orderId,
            amount: p.amount,
            fee: p.fee,
            tax: p.tax,
            status: p.status,
            method: p.method,
            createdAt: p.createdAt,
          })),
        },
        settlements: {
          create: dataset.settlements.map((s) => ({
            settlementId: s.settlementId,
            paymentId: s.paymentId,
            amount: s.amount,
            fee: s.fee,
            tax: s.tax,
            utr: s.utr,
            status: s.status,
            settledAt: s.settledAt,
            createdAt: s.createdAt,
          })),
        },
        bankTransactions: {
          create: dataset.bankTxns.map((b) => ({
            txnId: b.txnId,
            utr: b.utr,
            amount: b.amount,
            type: b.type,
            narration: b.narration,
            txnDate: b.txnDate,
          })),
        },
      },
    });

    return { batchId: batch.id, totalRecords };
  }
}
