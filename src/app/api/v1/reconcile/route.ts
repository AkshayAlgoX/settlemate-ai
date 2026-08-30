/*
 * SettleMate AI — REST API v1 Batch Reconciliation Endpoint
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import Papa from "papaparse";
import { z } from "zod";
import { rupeesToPaise, formatCurrency } from "@/lib/format";
import { buildIndexes } from "@/lib/reconciliation/indexer";
import { matchAllRecords } from "@/lib/reconciliation/matcher";
import { applyCardinalityMatching } from "@/lib/reconciliation/apply-cardinality";
import {
  apiKeyGuard,
  applySecurityHeaders,
  handleCorsPreflight,
  rateLimitGuard,
  safeErrorResponse,
  validateBodySize,
} from "@/lib/security/api-security";
import {
  MAX_BODY_BYTES,
  MAX_TXN_ROWS,
  ReconcileRequestSchema,
  TransactionInputSchema,
  parseRequest,
  type ValidatedTransactionInput,
} from "@/lib/api/v1-schemas";
import { instrument } from "@/lib/observability/route";
import { metrics } from "@/lib/observability/metrics";
import {
  v1Store,
  generateDecisionReceipt,
  dispatchWebhook,
  type V1ExceptionItem,
  type V1ReconciliationSummary,
  type V1ReconciliationJob,
} from "@/lib/api/v1-store";
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

/** 400 carrying field-level detail, e.g. `2.amount: amount must be a finite number`. */
function validationErrorResponse(code: string, message: string, details: string[]) {
  return applySecurityHeaders(
    NextResponse.json({ error: { code, message, details } }, { status: 400 })
  );
}

const TxnRowsSchema = z
  .array(TransactionInputSchema)
  .max(MAX_TXN_ROWS, `a single request accepts at most ${MAX_TXN_ROWS} transactions`);

/**
 * A blank CSV cell means "absent", not "empty string".
 *
 * Papa emits `""` for every empty cell, which would fail the min-length check on
 * genuinely optional columns (utr, fee, tax, date). Dropping blanks keeps optional
 * fields optional while still rejecting a blank *required* amount.
 */
function stripBlankFields(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === "string" && value.trim() === "") continue;
    if (value === null || value === undefined) continue;
    out[key] = value;
  }
  return out;
}

/** Parse CSV text and validate every row against the shared transaction schema. */
function csvToValidatedRows(csvContent: string) {
  const parsed = Papa.parse<Record<string, unknown>>(csvContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
  });

  return parseRequest(TxnRowsSchema, parsed.data.map(stripBlankFields));
}

async function handlePost(req: NextRequest) {
  // 1. Rate Limit Enforcement
  const rateLimit = rateLimitGuard(req);
  if (!rateLimit.allowed && rateLimit.response) {
    return rateLimit.response;
  }

  // 2. API Key Authentication
  const auth = apiKeyGuard(req);
  if (!auth.allowed && auth.response) {
    return auth.response;
  }

  const jobId = `job_${randomUUID().slice(0, 10)}`;
  const now = new Date();

  try {
    const contentType = req.headers.get("content-type") || "";
    let webhookUrl: string | undefined;
    let rows: ValidatedTransactionInput[] = [];

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      const rawWebhook = formData.get("webhookUrl");

      if (!file) {
        return applySecurityHeaders(
          NextResponse.json(
            { error: { code: "BAD_REQUEST", message: "No CSV file uploaded in multipart request" } },
            { status: 400 }
          )
        );
      }

      const csvText = await file.text();
      const size = validateBodySize(csvText, MAX_BODY_BYTES);
      if (!size.valid) {
        return validationErrorResponse("PAYLOAD_TOO_LARGE", size.error!, []);
      }

      // Validate the webhook target through the same schema as the JSON path.
      if (typeof rawWebhook === "string" && rawWebhook.trim()) {
        const wh = parseRequest(ReconcileRequestSchema, {
          webhookUrl: rawWebhook.trim(),
          csvContent: csvText,
        });
        if (!wh.ok) {
          return validationErrorResponse(wh.code, wh.message, wh.details);
        }
        webhookUrl = wh.data.webhookUrl;
      }

      const validated = csvToValidatedRows(csvText);
      if (!validated.ok) {
        return validationErrorResponse(validated.code, validated.message, validated.details);
      }
      rows = validated.data;
    } else if (contentType.includes("application/json")) {
      // Read the body as text first so its size can be checked before parsing,
      // and so csvContent is taken from the RAW body: sanitizeInputString
      // truncates every string at 5,000 chars, which silently ate any CSV
      // payload larger than that and reconciled the surviving fragment.
      const rawText = await req.text();
      const size = validateBodySize(rawText, MAX_BODY_BYTES);
      if (!size.valid) {
        return validationErrorResponse("PAYLOAD_TOO_LARGE", size.error!, []);
      }

      let rawBody: unknown;
      try {
        rawBody = JSON.parse(rawText || "{}");
      } catch {
        return validationErrorResponse("INVALID_JSON", "Request body is not valid JSON", []);
      }

      const parsedBody = parseRequest(ReconcileRequestSchema, rawBody);
      if (!parsedBody.ok) {
        return validationErrorResponse(parsedBody.code, parsedBody.message, parsedBody.details);
      }

      webhookUrl = parsedBody.data.webhookUrl;

      if (parsedBody.data.csvContent?.trim()) {
        const validated = csvToValidatedRows(parsedBody.data.csvContent);
        if (!validated.ok) {
          return validationErrorResponse(validated.code, validated.message, validated.details);
        }
        rows = validated.data;
      } else {
        // Already validated element-by-element by ReconcileRequestSchema.
        rows = parsedBody.data.transactions ?? [];
      }
    } else {
      // Plain text CSV
      const csvText = await req.text();
      if (!csvText || csvText.trim().length === 0) {
        return applySecurityHeaders(
          NextResponse.json(
            { error: { code: "BAD_REQUEST", message: "Request body is empty" } },
            { status: 400 }
          )
        );
      }

      const size = validateBodySize(csvText, MAX_BODY_BYTES);
      if (!size.valid) {
        return validationErrorResponse("PAYLOAD_TOO_LARGE", size.error!, []);
      }

      const validated = csvToValidatedRows(csvText);
      if (!validated.ok) {
        return validationErrorResponse(validated.code, validated.message, validated.details);
      }
      rows = validated.data;
    }

    const orders: NormalizedOrder[] = [];
    const payments: NormalizedPayment[] = [];
    const settlements: NormalizedSettlement[] = [];
    const bankTransactions: NormalizedBankTxn[] = [];
    const refunds: NormalizedRefund[] = [];
    const chargebacks: NormalizedChargeback[] = [];

    normalizeRowsIntoBatches(rows, orders, payments, settlements, bankTransactions, refunds, chargebacks);

    const batchData: BatchData = {
      orders,
      payments,
      settlements,
      bankTransactions,
      refunds,
      chargebacks,
      groundTruths: [],
    };

    const batchSize = Math.max(payments.length, settlements.length, bankTransactions.length);
    if (batchSize === 0) {
      return applySecurityHeaders(
        NextResponse.json(
          {
            error: {
              code: "NO_DATA",
              message: "No valid transaction or payment records found in payload",
            },
          },
          { status: 400 }
        )
      );
    }

    // 3. Execute Deterministic Multi-Pass Reconciliation
    const indexes = buildIndexes(batchData);
    const results = matchAllRecords(batchData, indexes);
    await applyCardinalityMatching(results, batchData);

    // 4. Aggregate Metrics & Exception Categorization
    let autoMatched = 0;
    let suggested = 0;
    let exception = 0;
    let totalDiscrepancyPaise = 0;
    const exceptionList: V1ExceptionItem[] = [];

    results.forEach((res, idx) => {
      if (res.status === "AUTO_MATCHED") {
        autoMatched++;
      } else if (res.status === "SUGGESTED_MATCH") {
        suggested++;
      } else {
        exception++;
        const mismatch = res.mismatchAmount ?? (res.expectedNetAmount - (res.actualSettledAmount ?? 0));
        const absMismatch = Math.abs(mismatch);
        totalDiscrepancyPaise += absMismatch;

        exceptionList.push({
          id: `EXP_${res.paymentId || idx + 1}`,
          type: res.status,
          description: res.matchDetails || `Discrepancy detected for transaction ${res.paymentId}`,
          amount: absMismatch,
          formattedAmount: formatCurrency(absMismatch),
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
    const matchRatePct = total > 0 ? Number(((autoMatched / total) * 100).toFixed(1)) : 100;

    const summary: V1ReconciliationSummary = {
      autoMatched,
      suggested,
      exception,
      total,
      matchRatePct,
      discrepancyPaise: totalDiscrepancyPaise,
    };

    const receipt = generateDecisionReceipt(summary, exceptionList);

    try {
      metrics.reconciliationRuns.inc({ outcome: "completed" });
      if (exception > 0) metrics.reconciliationExceptions.inc({}, exception);
    } catch {
      /* metrics must never break reconciliation */
    }

    const jobRecord: V1ReconciliationJob = {
      jobId,
      status: "COMPLETED",
      createdAt: now.toISOString(),
      completedAt: new Date().toISOString(),
      webhookUrl,
      batchSize: total,
      summary,
      exceptions: exceptionList,
      receipt,
    };

    v1Store.saveJob(jobRecord);

    // 5. Asynchronous Webhook Workflow
    if (webhookUrl) {
      // Simulate/Trigger asynchronous webhook callback
      setTimeout(() => {
        dispatchWebhook(webhookUrl as string, "reconciliation.completed", {
          jobId,
          status: "COMPLETED",
          summary,
          exceptionsCount: exceptionList.length,
          receipt,
          completedAt: jobRecord.completedAt,
        }).catch(() => {});
      }, 50);

      return applySecurityHeaders(
        NextResponse.json(
          {
            success: true,
            jobId,
            status: "ACCEPTED",
            message: "Reconciliation batch accepted for asynchronous processing. Result will be posted to webhook URL.",
            webhookUrl,
            batchSize: total,
            createdAt: jobRecord.createdAt,
          },
          { status: 202 }
        )
      );
    }

    // 6. Synchronous Response
    return applySecurityHeaders(
      NextResponse.json({
        success: true,
        jobId,
        status: "COMPLETED",
        summary,
        exceptions: exceptionList,
        receipt,
        processedAt: jobRecord.completedAt,
      })
    );
  } catch (err) {
    // safeErrorResponse masks the message for 5xx. The previous version returned
    // `(err as Error).message` verbatim, which leaked internal paths and engine
    // internals to any caller who could trigger a failure.
    return safeErrorResponse(err, 500, "RECONCILIATION_ERROR");
  }
}

/**
 * Normalise validated rows into the engine's batch shape.
 *
 * Every field is already schema-checked, so this function performs no coercion
 * and has no fallbacks for bad values. It used to contain three:
 *   `isNaN(rawAmount) ? 0`     — invented a ₹0 transaction from junk input
 *   `rupeesToPaise(Number(fee))` — produced NaN paise that poisoned every sum
 *   `isNaN(rowDate) ? now`     — silently backdated unparseable timestamps
 * Those are now 400s at the boundary, which is the only honest answer.
 */
function normalizeRowsIntoBatches(
  txns: ValidatedTransactionInput[],
  orders: NormalizedOrder[],
  payments: NormalizedPayment[],
  settlements: NormalizedSettlement[],
  bankTransactions: NormalizedBankTxn[],
  refunds: NormalizedRefund[],
  chargebacks: NormalizedChargeback[]
) {
  const now = new Date();

  txns.forEach((row, index) => {
    const source = row.source || "PAYMENT";
    const amountPaise = rupeesToPaise(row.amount);
    const refId = row.reference_id || row.referenceId || `TXN_${index + 1}`;
    const validDate = row.date ? new Date(row.date) : now;
    const feePaise = row.fee !== undefined ? rupeesToPaise(row.fee) : 0;
    const taxPaise = row.tax !== undefined ? rupeesToPaise(row.tax) : 0;

    if (source === "PAYMENT" || source === "ORDER") {
      payments.push({
        dbId: `pay_${index}_${refId}`,
        paymentId: refId,
        orderId: refId,
        amount: amountPaise,
        fee: feePaise,
        tax: taxPaise,
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
        fee: feePaise,
        tax: taxPaise,
        utr: String(row.utr || `UTR_${refId}`),
        status: "settled",
        settledAt: validDate,
        createdAt: validDate,
      });
    } else if (source === "BANK" || source === "BANK_TXN") {
      bankTransactions.push({
        dbId: `bnk_${index}_${refId}`,
        txnId: `bnk_${refId}`,
        utr: String(row.utr || `UTR_${refId}`),
        amount: amountPaise,
        type: "CREDIT",
        narration: `Settlement ${refId}`,
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
    }
  });
}

export const POST = instrument("v1.reconcile", handlePost);
