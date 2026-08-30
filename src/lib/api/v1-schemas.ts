/*
 * SettleMate AI — Request Schemas for the Public v1 API
 *
 * Every externally reachable v1 endpoint validates its body here before a single
 * paise is parsed. This exists because coercion at the boundary was silently
 * manufacturing financial data:
 *
 *   Number("abc")             -> NaN -> `isNaN ? 0` -> a real ₹0 transaction
 *   rupeesToPaise(Number("x")) -> NaN paise, which poisons every downstream sum
 *                                 and turns confident output into arithmetic noise
 *   currency: "USD"            -> silently reconciled as INR
 *   date: "not-a-date"         -> silently replaced with Date.now()
 *   source: "PAYMNET" (typo)   -> row silently dropped, still reported as success
 *
 * A reconciliation system that reports 98.1% accuracy over data it invented is
 * worse than one that refuses the request. These schemas fail loudly with a
 * field-level 400 instead.
 */

import { z } from "zod";

/** Transaction sources the v1 ingest can normalise. */
export const TXN_SOURCES = [
  "PAYMENT",
  "ORDER",
  "SETTLEMENT",
  "BANK",
  "BANK_TXN",
  "REFUND",
  "CHARGEBACK",
] as const;

/**
 * Per-transaction ceiling of ₹10 crore, chosen to keep paise arithmetic exact.
 *
 * All money is held as integer paise in IEEE-754 doubles, which are exact only
 * below Number.MAX_SAFE_INTEGER (~9.007e15). At this cap a maximal 100,000-row
 * batch totals 1e5 × 1e8 × 100 = 1e15 paise — comfortably inside that range, so
 * no batch of any accepted size can silently lose precision while summing.
 */
export const MAX_TXN_AMOUNT_RUPEES = 100_000_000;

/**
 * Row ceiling per request. Matches measured throughput rather than an aspiration:
 * the matcher evaluates a batch as a whole, so beyond this a single request stops
 * being interactive. Larger volumes belong in the async/durable scale path.
 */
export const MAX_TXN_ROWS = 25_000;

/** Maximum accepted JSON body: 8 MB, comfortably above a 25k-row batch. */
export const MAX_BODY_BYTES = 8 * 1024 * 1024;

/**
 * Money field accepting a JSON number or a numeric string.
 *
 * The string branch is not laxness — CSV ingest yields every field as a string,
 * so rejecting strings would break every CSV upload. What it does reject is the
 * non-numeric input that used to become NaN or 0.
 */
function monetaryField(label: string, opts: { min: number }) {
  return z
    .union([z.number(), z.string().trim().min(1, `${label} must not be blank`)])
    .transform((v) => (typeof v === "number" ? v : Number(v)))
    .refine((n) => Number.isFinite(n), {
      message: `${label} must be a finite number (received a value that is not numeric, or is NaN/Infinity)`,
    })
    .refine((n) => n >= opts.min, {
      message: `${label} must be greater than or equal to ${opts.min}`,
    })
    .refine((n) => n <= MAX_TXN_AMOUNT_RUPEES, {
      message: `${label} exceeds the maximum of ${MAX_TXN_AMOUNT_RUPEES} (₹10 crore) per transaction`,
    });
}

/**
 * A date that must actually parse.
 *
 * `amount` is allowed to be 0 — an explicit zero is a caller's auditable choice
 * and reconciliation is entitled to flag it. What is never allowed is a zero this
 * layer invented from unparseable input.
 */
const IsoDateField = z
  .string()
  .trim()
  .min(1, "date must not be blank")
  .refine((s) => !Number.isNaN(new Date(s).getTime()), {
    message: "date is not a parseable timestamp (expected ISO 8601, e.g. 2026-08-25T10:00:00Z)",
  });

const IdentifierField = z
  .string()
  .trim()
  .min(1)
  .max(128, "identifier must be 128 characters or fewer");

export const TransactionInputSchema = z
  .object({
    source: z
      .string()
      .trim()
      .transform((s) => s.toUpperCase())
      .refine((s) => (TXN_SOURCES as readonly string[]).includes(s), {
        // The old code silently dropped unrecognised sources and still returned
        // 200, so a typo lost rows without telling anybody.
        message: `source must be one of: ${TXN_SOURCES.join(", ")}`,
      })
      .optional(),

    amount: monetaryField("amount", { min: 0 }),

    // Single-currency endpoint: this route normalises nothing and would treat a
    // USD amount as INR. Point the caller at the endpoint that actually converts.
    currency: z
      .string()
      .trim()
      .transform((s) => s.toUpperCase())
      .refine((s) => s === "INR", {
        message:
          "POST /api/v1/reconcile settles in INR only. Use POST /api/v1/multi-currency/reconcile for foreign-currency batches.",
      })
      .optional(),

    date: IsoDateField.optional(),
    reference_id: IdentifierField.optional(),
    referenceId: IdentifierField.optional(),
    utr: IdentifierField.optional(),

    fee: monetaryField("fee", { min: 0 }).optional(),
    tax: monetaryField("tax", { min: 0 }).optional(),
  })
  // Unknown keys pass through: CSV uploads carry merchant-specific columns that
  // the normaliser ignores, and rejecting them would break real integrations.
  .passthrough();

export type ValidatedTransactionInput = z.infer<typeof TransactionInputSchema>;

/** A webhook target must be an absolute http(s) URL; the SSRF guard vets the host at dispatch. */
const WebhookUrlField = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine(
    (s) => {
      try {
        const u = new URL(s);
        return u.protocol === "http:" || u.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "webhookUrl must be an absolute http:// or https:// URL" }
  );

export const ReconcileRequestSchema = z
  .object({
    webhookUrl: WebhookUrlField.optional(),
    csvContent: z.string().max(MAX_BODY_BYTES).optional(),
    transactions: z
      .array(TransactionInputSchema)
      .max(MAX_TXN_ROWS, `a single request accepts at most ${MAX_TXN_ROWS} transactions`)
      .optional(),
  })
  .refine((b) => Boolean(b.csvContent?.trim()) || (b.transactions?.length ?? 0) > 0, {
    message: "Request body must contain a non-empty 'transactions' array or a 'csvContent' string",
  });

export const WebhookRegisterSchema = z.object({
  url: WebhookUrlField,
  events: z.array(z.string().trim().min(1).max(128)).max(32).optional(),
  secret: z.string().trim().min(8).max(256).optional(),
});

export const LoginRequestSchema = z.object({
  username: z.string().trim().min(1, "username is required").max(256),
  // Not .min(8): this validates request SHAPE, not password strength. Rejecting a
  // short password here would tell an attacker their guess was too short to be
  // any account's real password — an oracle the generic 401 exists to deny.
  password: z.string().min(1, "password is required").max(1024),
});

/** Field-level detail for a 400, e.g. `transactions.3.amount: amount must be ...`. */
export function formatZodIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}

/**
 * Validate a body against a schema, returning either the parsed value or a
 * ready-to-serialise error payload. Keeps route handlers free of zod plumbing.
 */
export function parseRequest<T extends z.ZodType>(
  schema: T,
  body: unknown
):
  | { ok: true; data: z.infer<T> }
  | { ok: false; code: string; message: string; details: string[] } {
  const result = schema.safeParse(body);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  return {
    ok: false,
    code: "VALIDATION_ERROR",
    message: "Request failed schema validation. No data was processed.",
    details: formatZodIssues(result.error),
  };
}
