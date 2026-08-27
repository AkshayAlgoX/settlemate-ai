/*
 * SettleMate AI — REST API v1 Batch Reconciliation Endpoint
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import Papa from "papaparse";
import { rupeesToPaise, formatCurrency } from "@/lib/format";
import { buildIndexes } from "@/lib/reconciliation/indexer";
import { matchAllRecords } from "@/lib/reconciliation/matcher";
import { applyCardinalityMatching } from "@/lib/reconciliation/apply-cardinality";
import {
  applySecurityHeaders,
  handleCorsPreflight,
  rateLimitGuard,
  validateApiKey,
  sanitizeObject,
} from "@/lib/security/api-security";
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

interface RawTxnInput {
  source?: string;
  amount?: number | string;
  currency?: string;
  date?: string;
  reference_id?: string;
  referenceId?: string;
  utr?: string;
  fee?: number | string;
  tax?: number | string;
  [key: string]: unknown;
}

async function handlePost(req: NextRequest) {
  // 1. Rate Limit Enforcement
  const rateLimit = rateLimitGuard(req);
  if (!rateLimit.allowed && rateLimit.response) {
    return rateLimit.response;
  }

  // 2. API Key Authentication
  const apiKey = req.headers.get("x-api-key") || req.headers.get("authorization");
  const auth = validateApiKey(apiKey);
  if (!auth.valid) {
    return applySecurityHeaders(
      NextResponse.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: auth.error || "Valid API key starting with 'sk_' (length > 20) required",
          },
        },
        { status: 401 }
      )
    );
  }

  const jobId = `job_${randomUUID().slice(0, 10)}`;
  const now = new Date();

  try {
    const contentType = req.headers.get("content-type") || "";
    let webhookUrl: string | undefined;
    const orders: NormalizedOrder[] = [];
    const payments: NormalizedPayment[] = [];
    const settlements: NormalizedSettlement[] = [];
    const bankTransactions: NormalizedBankTxn[] = [];
    const refunds: NormalizedRefund[] = [];
    const chargebacks: NormalizedChargeback[] = [];

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      webhookUrl = (formData.get("webhookUrl") as string) || undefined;

      if (!file) {
        return applySecurityHeaders(
          NextResponse.json(
            { error: { code: "BAD_REQUEST", message: "No CSV file uploaded in multipart request" } },
            { status: 400 }
          )
        );
      }
      const csvText = await file.text();
      parseCsvIntoBatches(csvText, orders, payments, settlements, bankTransactions, refunds, chargebacks);
    } else if (contentType.includes("application/json")) {
      const rawBody = await req.json().catch(() => ({}));
      const body = sanitizeObject(rawBody) as {
        webhookUrl?: string;
        transactions?: RawTxnInput[];
        csvContent?: string;
      };

      webhookUrl = typeof body.webhookUrl === "string" && body.webhookUrl.trim() ? body.webhookUrl.trim() : undefined;

      if (body.csvContent && typeof body.csvContent === "string") {
        parseCsvIntoBatches(body.csvContent, orders, payments, settlements, bankTransactions, refunds, chargebacks);
      } else if (Array.isArray(body.transactions) && body.transactions.length > 0) {
        parseTxnsArrayIntoBatches(body.transactions, orders, payments, settlements, bankTransactions, refunds, chargebacks);
      } else {
        return applySecurityHeaders(
          NextResponse.json(
            {
              error: {
                code: "BAD_REQUEST",
                message: "Request body must contain 'transactions' array or 'csvContent' string",
              },
            },
            { status: 400 }
          )
        );
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
      parseCsvIntoBatches(csvText, orders, payments, settlements, bankTransactions, refunds, chargebacks);
    }

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
    return applySecurityHeaders(
      NextResponse.json(
        {
          error: {
            code: "RECONCILIATION_ERROR",
            message: (err as Error).message || "Internal Reconciliation Failure",
          },
        },
        { status: 500 }
      )
    );
  }
}

function parseTxnsArrayIntoBatches(
  txns: RawTxnInput[],
  orders: NormalizedOrder[],
  payments: NormalizedPayment[],
  settlements: NormalizedSettlement[],
  bankTransactions: NormalizedBankTxn[],
  refunds: NormalizedRefund[],
  chargebacks: NormalizedChargeback[]
) {
  const now = new Date();

  txns.forEach((row, index) => {
    const source = String(row.source || "PAYMENT").trim().toUpperCase();
    const rawAmount = Number(row.amount);
    const amountPaise = isNaN(rawAmount) ? 0 : rupeesToPaise(rawAmount);
    const refId = String(row.reference_id || row.referenceId || `TXN_${index + 1}`).trim();
    const rowDate = row.date ? new Date(String(row.date)) : now;
    const validDate = isNaN(rowDate.getTime()) ? now : rowDate;
    const feePaise = row.fee ? rupeesToPaise(Number(row.fee)) : 0;
    const taxPaise = row.tax ? rupeesToPaise(Number(row.tax)) : 0;

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

function parseCsvIntoBatches(
  csvContent: string,
  orders: NormalizedOrder[],
  payments: NormalizedPayment[],
  settlements: NormalizedSettlement[],
  bankTransactions: NormalizedBankTxn[],
  refunds: NormalizedRefund[],
  chargebacks: NormalizedChargeback[]
) {
  const parsed = Papa.parse<RawTxnInput>(csvContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
  });

  parseTxnsArrayIntoBatches(parsed.data, orders, payments, settlements, bankTransactions, refunds, chargebacks);
}

export const POST = instrument("v1.reconcile", handlePost);
