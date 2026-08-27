/*
 * SettleMate AI — Multi-Currency API End-to-End Test Suite
 */

import assert from "node:assert/strict";
import { GET as getMultiCurrencyRoute, POST as postMultiCurrencyRoute } from "@/app/api/v1/multi-currency/reconcile/route";
import { NextRequest } from "next/server";
import { generateSampleMultiCurrencyBatch } from "@/lib/currency/multi-currency";

let passed = 0;

function check(name: string, fn: () => void | Promise<void>) {
  try {
    const res = fn();
    if (res instanceof Promise) {
      return res
        .then(() => {
          passed++;
          console.log(`   ✓ ${name}`);
        })
        .catch((err) => {
          console.error(`   ✗ ${name} — ${(err as Error).message}`);
          throw err;
        });
    }
    passed++;
    console.log(`   ✓ ${name}`);
  } catch (err) {
    console.error(`   ✗ ${name} — ${(err as Error).message}`);
    throw err;
  }
}

async function runAll() {
  console.log("\n========================================================");
  console.log("   SETTLEMATE AI — MULTI-CURRENCY API E2E TESTS         ");
  console.log("========================================================\n");

  console.log("1. Testing GET /api/v1/multi-currency/reconcile...");

  await check("GET route returns supported currencies and FX rates specification", async () => {
    const res = await getMultiCurrencyRoute();
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.baseCurrency, "INR");
    assert.ok(json.supportedCurrencies.includes("USD"));
    assert.ok(json.supportedCurrencies.includes("EUR"));
    assert.equal(json.roundingPolicy, "EXACT_INTEGER_FLOOR");
  });

  console.log("\n2. Testing POST /api/v1/multi-currency/reconcile with valid payload...");

  await check("POST route reconciles a multi-currency batch and returns conversion audit", async () => {
    const sample = generateSampleMultiCurrencyBatch(20);
    const req = new NextRequest("http://localhost:3000/api/v1/multi-currency/reconcile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactions: sample }),
    });

    const res = await postMultiCurrencyRoute(req);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.status, "SUCCESS");
    assert.equal(json.baseCurrency, "INR");
    assert.ok(json.summary.totalGrossConvertedPaise > 0);
    assert.ok(json.convertedTransactions.length > 0);
    assert.ok(json.summary.currencyBreakdown.length >= 2);
  });

  console.log("\n3. Testing POST /api/v1/multi-currency/reconcile error handling...");

  await check("POST route rejects empty payload with 400 Bad Request", async () => {
    const req = new NextRequest("http://localhost:3000/api/v1/multi-currency/reconcile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactions: [] }),
    });

    const res = await postMultiCurrencyRoute(req);
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.ok(json.error);
  });

  await check("POST route rejects unsupported currency with 400 Bad Request", async () => {
    const req = new NextRequest("http://localhost:3000/api/v1/multi-currency/reconcile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transactions: [
          {
            id: "PAY_INVALID",
            amount: 5000,
            currency: "NONEXISTENT",
            type: "payment",
            referenceId: "ORD_01",
          },
        ],
      }),
    });

    const res = await postMultiCurrencyRoute(req);
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.ok(json.details.some((d: string) => d.includes("Unsupported currency")));
  });

  console.log("\n========================================================");
  console.log(`   ALL MULTI-CURRENCY API E2E TESTS PASSED (${passed}/${passed}) `);
  console.log("========================================================\n");
}

runAll().catch((err) => {
  console.error("Fatal test failure:", err);
  process.exit(1);
});
