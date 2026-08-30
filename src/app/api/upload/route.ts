/*
 * SettleMate AI — Real Data Upload & Streaming Ingestion API
 */

import { NextRequest, NextResponse } from "next/server";
import { safeErrorResponse } from "@/lib/security/api-security";
import { StreamingIngestionEngine } from "@/lib/adapters/streaming-ingestion";
import type { ProviderType } from "@/lib/adapters/types";
import { getSession } from "@/lib/auth/session";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

export async function POST(req: NextRequest) {
  try {
    // Server-side RBAC: File upload and ingestion requires ADMIN authorization.
    const session = getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (session.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Forbidden: ADMIN role required to upload and ingest batches" },
        { status: 403 }
      );
    }

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
      if (file.size > MAX_UPLOAD_BYTES) {
        return NextResponse.json(
          { error: "Payload Too Large: File size exceeds 25MB limit" },
          { status: 413 }
        );
      }
      csvContent = await file.text();
      providerType = (formData.get("provider") as ProviderType) || undefined;
      batchName = (formData.get("batchName") as string) || file.name;
    } else if (contentType.includes("application/json")) {
      const contentLength = Number(req.headers.get("content-length") || 0);
      if (contentLength > MAX_UPLOAD_BYTES) {
        return NextResponse.json(
          { error: "Payload Too Large: Request body exceeds 25MB limit" },
          { status: 413 }
        );
      }
      const body = await req.json();
      csvContent = body.csvContent || "";
      if (typeof csvContent === "string" && Buffer.byteLength(csvContent, "utf8") > MAX_UPLOAD_BYTES) {
        return NextResponse.json(
          { error: "Payload Too Large: CSV content exceeds 25MB limit" },
          { status: 413 }
        );
      }
      providerType = body.provider;
      batchName = body.batchName;
    } else {
      const contentLength = Number(req.headers.get("content-length") || 0);
      if (contentLength > MAX_UPLOAD_BYTES) {
        return NextResponse.json(
          { error: "Payload Too Large: Request body exceeds 25MB limit" },
          { status: 413 }
        );
      }
      csvContent = await req.text();
      if (Buffer.byteLength(csvContent, "utf8") > MAX_UPLOAD_BYTES) {
        return NextResponse.json(
          { error: "Payload Too Large: CSV content exceeds 25MB limit" },
          { status: 413 }
        );
      }
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
    // safeErrorResponse masks 5xx detail. This route parses caller-supplied
    // files, so its exceptions carried both parser internals and fragments of
    // the uploaded content back to the caller.
    return safeErrorResponse(error, 500, "INGESTION_ERROR");
  }
}
