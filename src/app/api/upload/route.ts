/*
 * SettleMate AI — Real Data Upload & Streaming Ingestion API
 */

import { NextRequest, NextResponse } from "next/server";
import { StreamingIngestionEngine } from "@/lib/adapters/streaming-ingestion";
import type { ProviderType } from "@/lib/adapters/types";

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    const engine = new StreamingIngestionEngine();

    let csvContent = "";
    let providerType: ProviderType | undefined;
    let batchName: string | undefined;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
      }
      csvContent = await file.text();
      providerType = (formData.get("provider") as ProviderType) || undefined;
      batchName = (formData.get("batchName") as string) || file.name;
    } else if (contentType.includes("application/json")) {
      const body = await req.json();
      csvContent = body.csvContent || "";
      providerType = body.provider;
      batchName = body.batchName;
    } else {
      csvContent = await req.text();
    }

    if (!csvContent || csvContent.trim().length === 0) {
      return NextResponse.json({ error: "CSV content is empty" }, { status: 400 });
    }

    const { dataset, validation } = await engine.ingestCsv(csvContent, providerType);

    if (!validation.valid && validation.errors.length > 0) {
      return NextResponse.json(
        {
          error: "Schema validation failed",
          detectedProvider: validation.detectedProvider,
          validationErrors: validation.errors,
          warnings: validation.warnings,
        },
        { status: 422 }
      );
    }

    const { batchId, totalRecords } = await engine.persistDatasetToBatch(
      dataset,
      batchName || `Import_${validation.detectedProvider}_${Date.now()}`
    );

    return NextResponse.json({
      success: true,
      batchId,
      detectedProvider: validation.detectedProvider,
      schemaVersion: validation.detectedVersion,
      totalRecords,
      ordersCount: dataset.orders.length,
      paymentsCount: dataset.payments.length,
      settlementsCount: dataset.settlements.length,
      bankTxnsCount: dataset.bankTxns.length,
      totalGrossAmountPaise: dataset.metadata.totalGrossAmountPaise,
      totalBankCreditsPaise: dataset.metadata.totalBankCreditsPaise,
      warnings: validation.warnings,
    });
  } catch (error) {
    console.error("Upload & Ingestion Error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Internal Ingestion Error" },
      { status: 500 }
    );
  }
}
