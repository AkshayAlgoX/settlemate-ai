import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { rupeesToPaise, formatCurrency } from "@/lib/format";
import { buildIndexes } from "@/lib/reconciliation/indexer";
import { matchAllRecords } from "@/lib/reconciliation/matcher";
import { applyCardinalityMatching } from "@/lib/reconciliation/apply-cardinality";
import {
  applySecurityHeaders,
  handleCorsPreflight,
  rateLimitGuard,
  sanitizeObject,
} from "@/lib/security/api-security";
import type {
  BatchData,
  NormalizedPayment,
  NormalizedSettlement,
  NormalizedBankTxn,
  NormalizedRefund,
  NormalizedChargeback,
  NormalizedOrder,
} from "@/lib/reconciliation/types";

export async function OPTIONS() {
  return handleCorsPreflight();
}

interface CsvRow {
  source?: string;
  amount?: string | number;
  currency?: string;
  date?: string;
  reference_id?: string;
  [key: string]: unknown;
}

export async function POST(req: NextRequest) {
  const rateLimit = rateLimitGuard(req);
  if (!rateLimit.allowed && rateLimit.response) {
    return rateLimit.response;
  }

  try {
    const contentType = req.headers.get("content-type") || "";
    let csvContent = "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return applySecurityHeaders(
          NextResponse.json({ error: "No file uploaded" }, { status: 400 })
        );
      }

      // 1. File size validation (max 1 MB)
      if (file.size > 1024 * 1024) {
        return applySecurityHeaders(
          NextResponse.json(
            { error: "File size exceeds 1 MB limit" },
            { status: 400 }
          )
        );
      }

      csvContent = await file.text();
    } else if (contentType.includes("application/json")) {
      const body = sanitizeObject(await req.json());
      csvContent = body.csvContent || "";
    } else {
      csvContent = await req.text();
    }

    if (!csvContent || csvContent.trim().length === 0) {
      return applySecurityHeaders(
        NextResponse.json({ error: "CSV content is empty" }, { status: 400 })
      );
    }

    // 2. Parse CSV
    const parsed = Papa.parse<CsvRow>(csvContent, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
    });

    if (parsed.errors.length > 0 && parsed.data.length === 0) {
      return applySecurityHeaders(
        NextResponse.json(
          { error: "Failed to parse CSV file: " + parsed.errors[0]?.message },
          { status: 400 }
        )
      );
    }

    const rows = parsed.data;

    // 3. Row count validation (max 100)
    if (rows.length === 0) {
      return applySecurityHeaders(
        NextResponse.json(
          { error: "CSV contains no data rows" },
          { status: 400 }
        )
      );
    }

    if (rows.length > 100) {
      return applySecurityHeaders(
        NextResponse.json(
          { error: `Row count (${rows.length}) exceeds 100 row maximum limit` },
          { status: 400 }
        )
      );
    }

    // 4. Required columns validation: source, amount, currency, date, reference_id
    const requiredColumns = ["source", "amount", "currency", "date", "reference_id"];
    const headers = Object.keys(rows[0] || {});
    const missingColumns = requiredColumns.filter((col) => !headers.includes(col));

    if (missingColumns.length > 0) {
      return applySecurityHeaders(
        NextResponse.json(
          {
            error: `Missing required CSV column(s): ${missingColumns.join(", ")}. Required schema: source, amount, currency, date, reference_id`,
          },
          { status: 400 }
        )
      );
    }

    // 5. Map CSV rows into normalized BatchData structures
    const orders: NormalizedOrder[] = [];
    const payments: NormalizedPayment[] = [];
    const settlements: NormalizedSettlement[] = [];
    const bankTransactions: NormalizedBankTxn[] = [];
    const refunds: NormalizedRefund[] = [];
    const chargebacks: NormalizedChargeback[] = [];

    const now = new Date();

    rows.forEach((row, index) => {
      const source = String(row.source || "").trim().toUpperCase();
      const rawAmount = Number(row.amount);
      const amountPaise = isNaN(rawAmount) ? 0 : rupeesToPaise(rawAmount);
      const refId = String(row.reference_id || `REF_${index + 1}`).trim();
      const rowDate = row.date ? new Date(String(row.date)) : now;
      const validDate = isNaN(rowDate.getTime()) ? now : rowDate;

      if (source === "PAYMENT" || source === "ORDER") {
        payments.push({
          dbId: `pay_${index}_${refId}`,
          paymentId: refId,
          orderId: refId,
          amount: amountPaise,
          fee: 0,
          tax: 0,
          method: "card",
          status: "captured",
          capturedAt: validDate,
          createdAt: validDate,
        });
        orders.push({
          dbId: `ord_${index}_${refId}`,
          orderId: refId,
          amount: amountPaise,
          status: "paid",
          createdAt: validDate,
        });
      } else if (source === "SETTLEMENT") {
        settlements.push({
          dbId: `set_${index}_${refId}`,
          settlementId: `set_${refId}`,
          paymentId: refId,
          amount: amountPaise,
          fee: 0,
          tax: 0,
          utr: `UTR_${refId}`,
          status: "settled",
          settledAt: validDate,
          createdAt: validDate,
        });
      } else if (source === "BANK" || source === "BANK_TXN" || source === "BANK_RECORD") {
        bankTransactions.push({
          dbId: `bnk_${index}_${refId}`,
          txnId: `bnk_${refId}`,
          utr: `UTR_${refId}`,
          amount: amountPaise,
          type: "CREDIT",
          narration: `Bank Settlement ${refId}`,
          txnDate: validDate,
          matched: false,
        });
      } else if (source === "REFUND") {
        refunds.push({
          dbId: `ref_${index}_${refId}`,
          refundId: `ref_${refId}`,
          paymentId: refId,
          amount: amountPaise,
          status: "processed",
        });
      } else if (source === "CHARGEBACK") {
        chargebacks.push({
          dbId: `cb_${index}_${refId}`,
          chargebackId: `cb_${refId}`,
          paymentId: refId,
          amount: amountPaise,
          status: "opened",
        });
      } else {
        // Generic row fallback: treats as payment with implicit settlement for matching
        payments.push({
          dbId: `pay_${index}_${refId}`,
          paymentId: refId,
          orderId: refId,
          amount: amountPaise,
          fee: 0,
          tax: 0,
          method: "card",
          status: "captured",
          capturedAt: validDate,
          createdAt: validDate,
        });
      }
    });

    const batchData: BatchData = {
      orders,
      payments,
      settlements,
      bankTransactions,
      refunds,
      chargebacks,
      groundTruths: [],
    };

    // 6. Execute Deterministic Reconciliation
    const indexes = buildIndexes(batchData);
    const results = matchAllRecords(batchData, indexes);
    await applyCardinalityMatching(results, batchData);

    // 7. Aggregate Summary & Exceptions
    let autoMatched = 0;
    let suggested = 0;
    let exception = 0;

    const exceptionList: Array<{
      id: string;
      type: string;
      description: string;
      amount: number;
      formattedAmount: string;
      paymentId: string;
      expectedNetAmount: number;
      actualSettledAmount: number | null;
      mismatchAmount: number | null;
      cardinalityType: string;
      aiSuggestionAvailable: boolean;
    }> = [];

    results.forEach((res, idx) => {
      if (res.status === "AUTO_MATCHED") {
        autoMatched++;
      } else if (res.status === "SUGGESTED_MATCH") {
        suggested++;
      } else {
        exception++;
        const mismatch = res.mismatchAmount ?? (res.expectedNetAmount - (res.actualSettledAmount ?? 0));
        exceptionList.push({
          id: `EXP_${res.paymentId || idx + 1}`,
          type: res.status,
          description: res.matchDetails || `Discrepancy detected for reference ${res.paymentId}`,
          amount: Math.abs(mismatch),
          formattedAmount: formatCurrency(Math.abs(mismatch)),
          paymentId: res.paymentId,
          expectedNetAmount: res.expectedNetAmount,
          actualSettledAmount: res.actualSettledAmount,
          mismatchAmount: res.mismatchAmount,
          cardinalityType: res.cardinalityType,
          aiSuggestionAvailable: true,
        });
      }
    });

    const total = results.length;

    return applySecurityHeaders(
      NextResponse.json({
        success: true,
        summary: {
          autoMatched,
          suggested,
          exception,
          total,
        },
        exceptions: exceptionList,
        processedAt: new Date().toISOString(),
      })
    );
  } catch (err) {
    return applySecurityHeaders(
      NextResponse.json(
        { error: (err as Error).message || "Internal Reconciliation Error" },
        { status: 500 }
      )
    );
  }
}
