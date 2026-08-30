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
  apiKeyGuard,
  applySecurityHeaders,
  handleCorsPreflight,
  rateLimitGuard,
  safeErrorResponse,
  sanitizeObject,
  validateBodySize,
} from "@/lib/security/api-security";
import { MAX_BODY_BYTES, MAX_TXN_ROWS } from "@/lib/api/v1-schemas";
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

  // 2. API Key Authentication (handleGet stays public: it returns only FX rates
  // and usage documentation, no tenant data.)
  const auth = apiKeyGuard(req);
  if (!auth.allowed && auth.response) {
    return auth.response;
  }

  try {
    // Read as text first so the payload can be size-checked before it is parsed
    // into memory — an unbounded JSON body is a trivial memory-exhaustion vector.
    const rawText = await req.text();
    const size = validateBodySize(rawText, MAX_BODY_BYTES);
    if (!size.valid) {
      return applySecurityHeaders(
        NextResponse.json({ error: size.error }, { status: 413 })
      );
    }

    let rawBody: unknown;
    try {
      rawBody = rawText.trim() ? JSON.parse(rawText) : null;
    } catch {
      rawBody = null;
    }

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

    if (rawTxns.length > MAX_TXN_ROWS) {
      const capRes = NextResponse.json(
        {
          error: `A single request accepts at most ${MAX_TXN_ROWS} transactions (received ${rawTxns.length})`,
        },
        { status: 400 }
      );
      return applySecurityHeaders(capRes);
    }

    // 3. Input Validation
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

    // 4. Execute Multi-Currency Reconciliation
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
    // safeErrorResponse masks the message for 5xx; returning error.message
    // verbatim leaked engine internals and file paths to any caller.
    return safeErrorResponse(error, 500, "MULTI_CURRENCY_ERROR");
  }
}

export const GET = instrument("v1.multi_currency.spec", handleGet);
export const POST = instrument("v1.multi_currency.reconcile", handlePost);
