/*
 * SettleMate AI — Provider Adapter Abstraction & Ingestion Types
 */

import type {
  NormalizedBankTxn,
  NormalizedChargeback,
  NormalizedOrder,
  NormalizedPayment,
  NormalizedRefund,
  NormalizedSettlement,
} from "../reconciliation/types";

export type ProviderType = "RAZORPAY" | "STRIPE" | "BANK_STATEMENT" | "GENERIC_CSV" | "CUSTOM_WEBHOOK";

export interface SchemaValidationResult {
  valid: boolean;
  detectedProvider: ProviderType;
  detectedVersion: string;
  rowCount: number;
  errors: Array<{ row?: number; field?: string; message: string }>;
  warnings: Array<{ row?: number; field?: string; message: string }>;
}

export interface IngestedDataset {
  provider: ProviderType;
  schemaVersion: string;
  orders: NormalizedOrder[];
  payments: NormalizedPayment[];
  settlements: NormalizedSettlement[];
  bankTxns: NormalizedBankTxn[];
  refunds: NormalizedRefund[];
  chargebacks: NormalizedChargeback[];
  metadata: {
    ingestedAt: Date;
    sourceFilename?: string;
    totalGrossAmountPaise: number;
    totalBankCreditsPaise: number;
  };
}

export interface ProviderAdapter {
  readonly providerType: ProviderType;
  readonly schemaVersion: string;

  detectSchema(headerRow: string[], sampleRows: string[][]): SchemaValidationResult;

  parseCsvStream(
    csvContent: string,
    options?: { batchId?: string; strict?: boolean }
  ): Promise<{ dataset: IngestedDataset; validation: SchemaValidationResult }>;
}
