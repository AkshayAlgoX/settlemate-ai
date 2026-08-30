/*
 * SettleMate AI — v1 Reconcile Input Validation Test Suite
 *
 * Every case here is a data-integrity hole that used to return HTTP 200 with a
 * confident reconciliation over values the API had invented for itself.
 */

import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST as reconcilePost } from "./route";
import {
  MAX_TXN_AMOUNT_RUPEES,
  MAX_TXN_ROWS,
  ReconcileRequestSchema,
  TransactionInputSchema,
  parseRequest,
} from "@/lib/api/v1-schemas";

const API_KEY = "sk_test_validation_key_112233445566778899";

let passed = 0;
let failed = 0;

async function check(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name} — ${(err as Error).message}`);
  }
}

function jsonPost(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/v1/reconcile", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": API_KEY },
    body: JSON.stringify(body),
  });
}

/** A minimal well-formed pair that reconciles cleanly. */
function validPair(refId = "TXN_OK_1") {
  return [
    { source: "PAYMENT", amount: 100.0, currency: "INR", date: "2026-08-25T00:00:00Z", reference_id: refId },
    { source: "SETTLEMENT", amount: 100.0, currency: "INR", date: "2026-08-25T00:00:00Z", reference_id: refId },
  ];
}

async function expect400(body: unknown, detailPattern: RegExp): Promise<void> {
  const res = await reconcilePost(jsonPost(body));
  assert.equal(res.status, 400, `expected 400, got ${res.status}`);
  const json = await res.json();
  assert.equal(json.error.code, "VALIDATION_ERROR");
  const details = (json.error.details as string[]).join(" | ");
  assert.match(details, detailPattern);
}

async function run() {
  console.log("\n=========================================================================");
  console.log(" 🛡️  SETTLEMATE AI — v1 RECONCILE INPUT VALIDATION");
  console.log("=========================================================================");

  console.log("\n1. Silent numeric coercion is rejected, not invented");

  await check("a non-numeric amount is rejected instead of becoming a ₹0 transaction", async () => {
    // Old behaviour: Number("abc") -> NaN -> `isNaN ? 0` -> a real ₹0 row that
    // reconciled successfully and counted toward the match rate.
    await expect400(
      { transactions: [{ source: "PAYMENT", amount: "abc", reference_id: "TXN_1" }] },
      /amount.*finite number/i
    );
  });

  await check("a null, boolean or object amount is rejected", async () => {
    for (const bad of [null, true, {}, []]) {
      const res = await reconcilePost(
        jsonPost({ transactions: [{ source: "PAYMENT", amount: bad, reference_id: "TXN_1" }] })
      );
      assert.equal(res.status, 400, `amount=${JSON.stringify(bad)} should be rejected`);
    }
  });

  await check("a non-numeric fee is rejected instead of producing NaN paise", async () => {
    // This was the worst of the three: rupeesToPaise(Number("abc")) is NaN, and
    // NaN paise propagated into expectedNetAmount, so every comparison downstream
    // became NaN and the whole batch reported as exceptions with NaN amounts.
    await expect400(
      { transactions: [{ source: "PAYMENT", amount: 100, fee: "abc", reference_id: "TXN_1" }] },
      /fee.*finite number/i
    );
  });

  await check("NaN and Infinity are rejected explicitly", async () => {
    for (const bad of ["NaN", "Infinity", "-Infinity"]) {
      const res = await reconcilePost(
        jsonPost({ transactions: [{ source: "PAYMENT", amount: bad, reference_id: "TXN_1" }] })
      );
      assert.equal(res.status, 400, `amount="${bad}" should be rejected`);
    }
  });

  await check("numeric strings are still accepted, because every CSV field is one", async () => {
    const res = await reconcilePost(
      jsonPost({
        transactions: [
          { source: "PAYMENT", amount: "100.00", currency: "INR", reference_id: "TXN_STR" },
          { source: "SETTLEMENT", amount: "100.00", currency: "INR", reference_id: "TXN_STR" },
        ],
      })
    );
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.summary.total, 1);
  });

  console.log("\n2. Range and scale limits");

  await check("a negative amount is rejected", async () => {
    await expect400(
      { transactions: [{ source: "PAYMENT", amount: -500, reference_id: "TXN_NEG" }] },
      /amount.*greater than or equal to 0/i
    );
  });

  await check("an amount above the per-transaction ceiling is rejected", async () => {
    // The ceiling keeps integer-paise sums inside IEEE-754's exact range for any
    // batch size the API will accept.
    await expect400(
      { transactions: [{ source: "PAYMENT", amount: MAX_TXN_AMOUNT_RUPEES + 1, reference_id: "TXN_BIG" }] },
      /exceeds the maximum/i
    );
  });

  await check("a batch beyond the row cap is rejected by schema, not by timeout", async () => {
    const rows = Array.from({ length: MAX_TXN_ROWS + 1 }, (_, i) => ({
      source: "PAYMENT",
      amount: 10,
      reference_id: `TXN_${i}`,
    }));
    const result = parseRequest(ReconcileRequestSchema, { transactions: rows });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.details.join(" "), /at most 25000 transactions/i);
    }
  });

  console.log("\n3. Fields that used to be silently ignored");

  await check("a foreign currency is rejected and points at the multi-currency endpoint", async () => {
    // This endpoint performs no FX conversion whatsoever, so a USD amount was
    // previously settled as though it were INR.
    await expect400(
      {
        transactions: [
          { source: "PAYMENT", amount: 100, currency: "USD", reference_id: "TXN_USD" },
        ],
      },
      /multi-currency/i
    );
  });

  await check("an unparseable date is rejected instead of being backdated to now", async () => {
    await expect400(
      { transactions: [{ source: "PAYMENT", amount: 100, date: "not-a-date", reference_id: "TXN_D" }] },
      /date is not a parseable timestamp/i
    );
  });

  await check("an unrecognised source is rejected instead of silently dropping the row", async () => {
    // "PAYMNET" matched no branch of the normaliser, so the row vanished and the
    // response still said success — a typo silently lost money from the batch.
    await expect400(
      { transactions: [{ source: "PAYMNET", amount: 100, reference_id: "TXN_TYPO" }] },
      /source must be one of/i
    );
  });

  await check("a relative or non-http webhookUrl is rejected", async () => {
    for (const bad of ["/callback", "ftp://host/x", "javascript:alert(1)", "not a url"]) {
      const res = await reconcilePost(jsonPost({ webhookUrl: bad, transactions: validPair() }));
      assert.equal(res.status, 400, `webhookUrl="${bad}" should be rejected`);
    }
  });

  console.log("\n4. Error shape and reporting");

  await check("validation errors name the offending row and field", async () => {
    const res = await reconcilePost(
      jsonPost({
        transactions: [
          ...validPair("TXN_GOOD"),
          { source: "PAYMENT", amount: "junk", reference_id: "TXN_BAD" },
        ],
      })
    );
    assert.equal(res.status, 400);
    const json = await res.json();
    // Index 2 is the bad row; the path makes it actionable rather than a blanket
    // "invalid request".
    assert.match(json.error.details.join(" "), /transactions\.2\.amount/);
    assert.match(json.error.message, /No data was processed/i);
  });

  await check("a malformed JSON body returns 400 INVALID_JSON, not a 500", async () => {
    const res = await reconcilePost(
      new NextRequest("http://localhost:3000/api/v1/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": API_KEY },
        body: "{ this is not json",
      })
    );
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.error.code, "INVALID_JSON");
  });

  await check("an empty transactions array is rejected with a clear message", async () => {
    const res = await reconcilePost(jsonPost({ transactions: [] }));
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.match(json.error.details.join(" "), /non-empty 'transactions'|csvContent/i);
  });

  console.log("\n5. CSV ingest regressions");

  await check("blank optional CSV cells are treated as absent, not as empty strings", async () => {
    // Papa emits "" for every empty cell. Without stripping blanks, an optional
    // column left empty would fail a min-length check and 400 a valid upload.
    const csv = [
      "source,amount,currency,date,reference_id,utr,fee,tax",
      "PAYMENT,100.00,INR,2026-08-25T00:00:00Z,TXN_CSV_1,,,",
      "SETTLEMENT,100.00,INR,2026-08-25T00:00:00Z,TXN_CSV_1,,,",
    ].join("\n");

    const res = await reconcilePost(jsonPost({ csvContent: csv }));
    assert.equal(res.status, 200, "a CSV with blank optional columns must be accepted");
    const json = await res.json();
    assert.equal(json.summary.total, 1);
  });

  await check("a csvContent payload over 5,000 chars is processed in full", async () => {
    // Regression guard: the JSON branch ran the body through sanitizeObject, whose
    // sanitizeInputString truncates every string at 5,000 characters. Any larger
    // CSV was silently cut mid-row and the surviving fragment reconciled as if it
    // were the whole batch.
    const header = "source,amount,currency,date,reference_id";
    const lines = [header];
    const pairs = 120; // ~10 KB of CSV, comfortably past the old 5,000-char cut
    for (let i = 0; i < pairs; i++) {
      lines.push(`PAYMENT,100.00,INR,2026-08-25T00:00:00Z,TXN_BIG_${i}`);
      lines.push(`SETTLEMENT,100.00,INR,2026-08-25T00:00:00Z,TXN_BIG_${i}`);
    }
    const csv = lines.join("\n");
    assert.ok(csv.length > 5000, `fixture must exceed the old truncation point (${csv.length} chars)`);

    const res = await reconcilePost(jsonPost({ csvContent: csv }));
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.summary.total, pairs, "every row survives the round trip");
  });

  await check("a CSV row with a blank required amount is rejected", async () => {
    const csv = [
      "source,amount,currency,reference_id",
      "PAYMENT,,INR,TXN_BLANK",
    ].join("\n");
    const res = await reconcilePost(jsonPost({ csvContent: csv }));
    assert.equal(res.status, 400);
  });

  console.log("\n6. Schema unit behaviour");

  await check("TransactionInputSchema normalises source case and passes unknown columns", async () => {
    const parsed = TransactionInputSchema.safeParse({
      source: "payment",
      amount: "250.50",
      merchant_internal_ref: "keep-me",
    });
    assert.ok(parsed.success, "lowercase source and numeric string parse");
    assert.equal(parsed.data.source, "PAYMENT");
    assert.equal(parsed.data.amount, 250.5);
    // Merchant-specific CSV columns must survive: rejecting unknown keys would
    // break real integrations that carry extra fields.
    assert.equal((parsed.data as Record<string, unknown>).merchant_internal_ref, "keep-me");
  });

  await check("an explicit zero amount is allowed; an invented one is not", async () => {
    // A caller-supplied 0 is auditable and reconciliation may legitimately flag
    // it. The bug was manufacturing 0 from unparseable input.
    assert.ok(TransactionInputSchema.safeParse({ source: "PAYMENT", amount: 0 }).success);
    assert.ok(!TransactionInputSchema.safeParse({ source: "PAYMENT", amount: "" }).success);
    assert.ok(!TransactionInputSchema.safeParse({ source: "PAYMENT" }).success);
  });

  console.log(`\nv1-validation: ${passed} passed, ${failed} failed`);
}

run()
  .then(() => {
    process.exitCode = failed > 0 ? 1 : 0;
    console.log(`v1-validation: final ${failed > 0 ? "FAILURE" : "ALL PASSED"}\n`);
  })
  .catch((err) => {
    console.error("v1 validation test harness crashed:", err);
    process.exitCode = 1;
  });
