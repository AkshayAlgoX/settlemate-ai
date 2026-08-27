/*
 * SettleMate AI — Multi-Currency & Tax-Aware Reconciliation API Endpoint
 *
 * Route: POST /api/v1/multi-currency/reconcile
 */

import { NextRequest, NextResponse } from "next/server";
import {
  reconcileMultiCurrencyBatch,
  validateMultiCurrencyInput,
  type MultiCurrencyTxnInput,
} from "@/lib/currency/multi-currency";
import {
  STATIC_FX_RATES,
  SUPPORTED_CURRENCIES,
} from "@/lib/currency/fx-rates";
import {
  applySecurityHeaders,
  handleCorsPreflight,
  rateLimitGuard,
  sanitizeObject,
} from "@/lib/security/api-security";
import { instrument } from "@/lib/observability/route";

export async function OPTIONS() {
  return handleCorsPreflight();
}

async function handleGet() {
  const res = NextResponse.json({
    service: "SettleMate AI Multi-Currency & Tax-Aware Reconciliation API",
    version: "v1",
    baseCurrency: "INR",
    supportedCurrencies: SUPPORTED_CURRENCIES,
    fxRates: STATIC_FX_RATES,
    roundingPolicy: "EXACT_INTEGER_FLOOR",
    arithmeticStandard: "Zero IEEE-754 floating-point drift (All calculations in minor units paise)",
    usage: {
      method: "POST",
      endpoint: "/api/v1/multi-currency/reconcile",
      payload: {
        transactions: [
          {
            id: "PAY_USD_001",
            amount: 10000,
            currency: "USD",
            type: "payment",
            taxAmount: 2000,
            taxCurrency: "USD",
            taxType: "VAT",
            date: "2026-08-25T10:00:00Z",
            referenceId: "ORD_USD_001",
          },
          {
            id: "SET_USD_001",
            amount: 9850,
            currency: "USD",
            type: "settlement",
            taxAmount: 2000,
            feeAmount: 150,
            date: "2026-08-26T10:00:00Z",
            referenceId: "PAY_USD_001",
            utr: "UTR_USD_9988",
          },
        ],
      },
    },
  });
  return applySecurityHeaders(res);
}

async function handlePost(req: NextRequest) {
  // 1. Rate Limiting Guard
  const rateLimit = rateLimitGuard(req);
  if (!rateLimit.allowed && rateLimit.response) {
    return rateLimit.response;
  }

  try {
    const rawBody = await req.json().catch(() => null);
    if (!rawBody) {
      const errRes = NextResponse.json(
        {
          error: "Invalid JSON payload. Expected { transactions: MultiCurrencyTxnInput[] } or array of transactions",
        },
        { status: 400 }
      );
      return applySecurityHeaders(errRes);
    }

    const sanitized = sanitizeObject(rawBody);

    // Support both { transactions: [...] } and direct array [...]
    const rawTxns: MultiCurrencyTxnInput[] = Array.isArray(sanitized)
      ? sanitized
      : Array.isArray((sanitized as Record<string, unknown>).transactions)
      ? ((sanitized as Record<string, unknown>).transactions as MultiCurrencyTxnInput[])
      : [];

    // 2. Input Validation
    const validation = validateMultiCurrencyInput(rawTxns);
    if (!validation.valid) {
      const valRes = NextResponse.json(
        {
          error: "Validation failed on multi-currency payload",
          details: validation.errors,
          supportedCurrencies: SUPPORTED_CURRENCIES,
        },
        { status: 400 }
      );
      return applySecurityHeaders(valRes);
    }

    // 3. Execute Multi-Currency Reconciliation
    const startTime = Date.now();
    const result = await reconcileMultiCurrencyBatch(rawTxns);
    const durationMs = Date.now() - startTime;

    const response = NextResponse.json({
      status: "SUCCESS",
      reconciledAt: result.reconciledAt,
      processingTimeMs: durationMs,
      baseCurrency: "INR",
      roundingPolicy: "INTEGER_FLOOR",
      summary: result.summary,
      convertedTransactions: result.convertedTransactions,
      exceptions: result.exceptions,
      matchResults: result.matchResults,
    });

    return applySecurityHeaders(response);
  } catch (error) {
    console.error("Multi-currency reconciliation error:", error);
    const errRes = NextResponse.json(
      {
        error: "Internal error during multi-currency reconciliation",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
    return applySecurityHeaders(errRes);
  }
}

export const GET = instrument("v1.multi_currency.spec", handleGet);
export const POST = instrument("v1.multi_currency.reconcile", handlePost);
