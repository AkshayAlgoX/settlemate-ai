/*
 * SettleMate AI — Real-Time Streaming Ingestion Endpoint
 *
 * POST /api/v1/stream/ingest
 *
 * Implements:
 *   1. Authenticated Ingestion with Strict Tenant Isolation
 *   2. PostgreSQL-Backed Idempotency & Duplicate Prevention
 *   3. Deterministic Reconciliation Core Execution
 *   4. Multi-Node Real-Time Telemetry Event Publication
 *   5. Merkle DAG Cryptographic Receipt Commitment
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  applySecurityHeaders,
  handleCorsPreflight,
  rateLimitGuard,
  safeErrorResponse,
  sessionOrApiKeyGuard,
} from "@/lib/security/api-security";
import { eventBroker } from "@/lib/events/event-broker";
import { metrics } from "@/lib/observability/metrics";
import { buildIndexes } from "@/lib/reconciliation/indexer";
import { matchAllRecords } from "@/lib/reconciliation/matcher";
import { applyCardinalityMatching } from "@/lib/reconciliation/apply-cardinality";
import type {
  BatchData,
  NormalizedOrder,
  NormalizedPayment,
  NormalizedSettlement,
  NormalizedBankTxn,
  NormalizedRefund,
  NormalizedChargeback,
} from "@/lib/reconciliation/types";
import { generateDecisionReceipt, type V1ExceptionItem } from "@/lib/api/v1-store";
import { UnifiedJobRepository, UnifiedReceiptRepository } from "@/lib/storage/unified-store";
import { formatCurrency, rupeesToPaise } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return handleCorsPreflight();
}

interface IngestRecordInput {
  paymentId?: string;
  orderId?: string;
  referenceId?: string;
  amount: number;
  fee?: number;
  tax?: number;
  utr?: string;
  source?: "PAYMENT" | "SETTLEMENT" | "BANK" | "BANK_TXN" | "REFUND" | "CHARGEBACK";
  date?: string;
}

export async function POST(req: NextRequest) {
  const guard = rateLimitGuard(req);
  if (!guard.allowed && guard.response) {
    metrics.ingestionEventsRejected?.inc({ reason: "rate_limited" });
    return guard.response;
  }

  // 1. Authenticate caller and resolve tenant server-side. A client-supplied
  //    `x-tenant-id` is refused, never honoured — see sessionOrApiKeyGuard.
  const auth = sessionOrApiKeyGuard(req);
  if (!auth.allowed && auth.response) {
    metrics.ingestionEventsRejected?.inc({ reason: "unauthorized" });
    return auth.response;
  }
  const tenantId = auth.tenantId;

  try {
    const body = await req.json();
    const idempotencyKey = body.idempotencyKey || `stream_ingest_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const records: IngestRecordInput[] = Array.isArray(body.records) ? body.records : [];

    if (records.length === 0) {
      metrics.ingestionEventsRejected?.inc({ reason: "empty_payload" });
      return applySecurityHeaders(
        NextResponse.json(
          { error: "Invalid stream payload. 'records' must be a non-empty array." },
          { status: 400 }
        )
      );
    }

    metrics.ingestionEventsReceived?.inc({}, records.length);

    // 2. Check Idempotency
    const existingJob = UnifiedJobRepository.get(idempotencyKey);
    if (existingJob && existingJob.status === "COMPLETED") {
      metrics.ingestionDuplicateEvents?.inc();
      return applySecurityHeaders(
        NextResponse.json({
          success: true,
          jobId: existingJob.jobId,
          status: "COMPLETED",
          deduplicated: true,
          batchSize: existingJob.batchSize,
          summary: existingJob.summary ? JSON.parse(existingJob.summary) : undefined,
          receipt: existingJob.receipt ? JSON.parse(existingJob.receipt) : undefined,
        })
      );
    }

    const jobId = idempotencyKey;
    const now = new Date();

    // 3. Publish INGESTION_RECEIVED event
    await eventBroker.publish({
      tenantId,
      eventType: "INGESTION_RECEIVED",
      entityId: jobId,
      payload: {
        jobId,
        recordCount: records.length,
        idempotencyKey,
        timestamp: now.toISOString(),
      },
    });

    // 4. Normalize records into in-memory batch
    const orders: NormalizedOrder[] = [];
    const payments: NormalizedPayment[] = [];
    const settlements: NormalizedSettlement[] = [];
    const bankTransactions: NormalizedBankTxn[] = [];
    const refunds: NormalizedRefund[] = [];
    const chargebacks: NormalizedChargeback[] = [];

    records.forEach((row, idx) => {
      const source = row.source || "PAYMENT";
      const amountPaise = rupeesToPaise(row.amount);
      const refId = row.referenceId || row.paymentId || `TXN_${idx + 1}`;
      const validDate = row.date ? new Date(row.date) : now;
      const feePaise = row.fee !== undefined ? rupeesToPaise(row.fee) : 0;
      const taxPaise = row.tax !== undefined ? rupeesToPaise(row.tax) : 0;

      if (source === "PAYMENT") {
        payments.push({
          dbId: `pay_${idx}_${refId}`,
          paymentId: refId,
          orderId: row.orderId || refId,
          amount: amountPaise,
          fee: feePaise,
          tax: taxPaise,
          method: "card",
          status: "captured",
          capturedAt: validDate,
          createdAt: validDate,
        });
        orders.push({
          dbId: `ord_${idx}_${refId}`,
          orderId: row.orderId || refId,
          amount: amountPaise,
          status: "paid",
          createdAt: validDate,
        });
      } else if (source === "SETTLEMENT") {
        settlements.push({
          dbId: `set_${idx}_${refId}`,
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
          dbId: `bnk_${idx}_${refId}`,
          txnId: `bnk_${refId}`,
          utr: String(row.utr || `UTR_${refId}`),
          amount: amountPaise,
          type: "CREDIT",
          narration: `Stream Settlement ${refId}`,
          txnDate: validDate,
          matched: false,
        });
      } else if (source === "REFUND") {
        refunds.push({
          dbId: `ref_${idx}_${refId}`,
          refundId: `ref_${refId}`,
          paymentId: refId,
          amount: amountPaise,
          status: "processed",
        });
      } else if (source === "CHARGEBACK") {
        chargebacks.push({
          dbId: `cb_${idx}_${refId}`,
          chargebackId: `cb_${refId}`,
          paymentId: refId,
          amount: amountPaise,
          status: "opened",
        });
      }
    });

    // 5. Publish RECONCILIATION_STARTED event
    await eventBroker.publish({
      tenantId,
      eventType: "RECONCILIATION_STARTED",
      entityId: jobId,
      payload: {
        jobId,
        paymentsCount: payments.length,
        settlementsCount: settlements.length,
        bankTxnCount: bankTransactions.length,
      },
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

    // 6. Execute Deterministic Multi-Pass Matching Engine
    const indexes = buildIndexes(batchData);
    const results = matchAllRecords(batchData, indexes);
    await applyCardinalityMatching(results, batchData);

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
          cardinalityType: res.cardinalityType || "1:1",
          aiSuggestionAvailable: true,
        });
      }
    });

    const total = results.length;
    const matchRatePct = total > 0 ? Number(((autoMatched / total) * 100).toFixed(1)) : 100;

    const summary = {
      autoMatched,
      suggested,
      exception,
      total,
      matchRatePct,
      discrepancyPaise: totalDiscrepancyPaise,
    };

    const receipt = generateDecisionReceipt(summary, exceptionList);

    // 7. Commit results to Unified Store
    UnifiedJobRepository.save({
      jobId,
      tenantId,
      status: "COMPLETED",
      createdAt: now.toISOString(),
      completedAt: new Date().toISOString(),
      batchSize: total,
      summary: JSON.stringify(summary),
      exceptions: JSON.stringify(exceptionList),
      receipt: JSON.stringify(receipt),
    });

    UnifiedReceiptRepository.save({
      receiptId: `rcpt_${receipt.fingerprint}`,
      tenantId,
      jobId,
      rootHash: receipt.rootHash,
      leafCount: receipt.leafCount,
      algorithm: receipt.algorithm,
      timestamp: receipt.timestamp,
      fingerprint: receipt.fingerprint,
      signature: receipt.signature,
      createdAt: new Date().toISOString(),
    });

    // 8. Publish final RECONCILIATION_COMPLETED event
    await eventBroker.publish({
      tenantId,
      eventType: exception > 0 ? "EXCEPTION_DETECTED" : "RECONCILIATION_COMPLETED",
      entityId: jobId,
      payload: {
        jobId,
        summary,
        receiptFingerprint: receipt.fingerprint,
        matchRatePct,
        completedAt: new Date().toISOString(),
      },
    });

    return applySecurityHeaders(
      NextResponse.json({
        success: true,
        jobId,
        status: "COMPLETED",
        batchSize: total,
        summary,
        receipt,
        processedAt: new Date().toISOString(),
      })
    );
  } catch (err) {
    console.error("[StreamIngest Error]:", err);
    return safeErrorResponse(err, 500, "STREAM_INGESTION_ERROR");
  }
}
