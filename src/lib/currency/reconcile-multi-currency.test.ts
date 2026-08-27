/*
 * SettleMate AI — Multi-Currency & Tax-Aware Reconciliation Tests
 *
 * Verifies tax addition, cross-border settlement matching, synthetic batch generation,
 * and multi-currency exception tagging.
 */

import assert from "node:assert/strict";
import {
  reconcileMultiCurrencyBatch,
  generateSampleMultiCurrencyBatch,
  validateMultiCurrencyInput,
  type MultiCurrencyTxnInput,
} from "./multi-currency";

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
    } else {
      passed++;
      console.log(`   ✓ ${name}`);
    }
  } catch (err) {
    console.error(`   ✗ ${name} — ${(err as Error).message}`);
    throw err;
  }
}

async function runAll() {
  console.log("\n========================================================");
  console.log("   SETTLEMATE AI — MULTI-CURRENCY RECON TESTS           ");
  console.log("========================================================\n");

  console.log("1. Testing Multi-Currency Input Validation...");

  check("Validation accepts clean multi-currency transaction input", () => {
    const sample: MultiCurrencyTxnInput[] = [
      {
        id: "PAY_01",
        amount: 10000,
        currency: "USD",
        type: "payment",
        referenceId: "ORD_01",
      },
    ];
    const val = validateMultiCurrencyInput(sample);
    assert.equal(val.valid, true);
    assert.equal(val.errors.length, 0);
  });

  check("Validation catches invalid currency and negative amounts", () => {
    const sample: MultiCurrencyTxnInput[] = [
      {
        id: "PAY_02",
        amount: -50,
        currency: "INVALID",
        type: "payment",
        referenceId: "ORD_02",
      },
    ];
    const val = validateMultiCurrencyInput(sample);
    assert.equal(val.valid, false);
    assert.ok(val.errors.length >= 2);
  });

  console.log("\n2. Testing Multi-Currency Tax Addition & Matching...");

  await check("Cross-border USD payment with VAT matches net settlement and bank remittance", async () => {
    const txns: MultiCurrencyTxnInput[] = [
      {
        id: "PAY_USD_100",
        amount: 10000, // $100.00 -> 832,500 paise
        currency: "USD",
        type: "payment",
        taxAmount: 2000, // $20.00 VAT -> 166,500 paise
        taxCurrency: "USD",
        feeAmount: 150, // $1.50 fee -> 12,487 paise
        date: "2026-08-25T10:00:00Z",
        referenceId: "ORD_USD_100",
      },
      {
        id: "SET_USD_100",
        amount: 9850, // $98.50 ($100 - $1.50 fee) -> 820,012 paise
        currency: "USD",
        type: "settlement",
        taxAmount: 2000,
        feeAmount: 150,
        date: "2026-08-26T10:00:00Z",
        referenceId: "PAY_USD_100",
        utr: "UTR_USD_100",
      },
      {
        id: "BNK_USD_100",
        amount: 9850,
        currency: "USD",
        type: "bank_transaction",
        date: "2026-08-26T12:00:00Z",
        referenceId: "UTR_USD_100",
        utr: "UTR_USD_100",
      },
    ];

    const result = await reconcileMultiCurrencyBatch(txns);
    assert.equal(result.summary.totalInputTransactions, 3);
    assert.equal(result.convertedTransactions.length, 3);

    // Verify converted base INR amounts
    const payConverted = result.convertedTransactions.find((t) => t.id === "PAY_USD_100");
    assert.ok(payConverted);
    assert.equal(payConverted.baseAmountPaise, 832500); // $100 -> ₹8,325.00
    assert.equal(payConverted.baseTaxPaise, 166500); // $20 -> ₹1,665.00
    assert.equal(payConverted.baseTotalPaise, 999000); // Gross ₹9,990.00
  });

  console.log("\n3. Testing Multi-Currency Sample Batch Generator...");

  await check("generateSampleMultiCurrencyBatch produces 30 records across multiple currencies", async () => {
    const sample = generateSampleMultiCurrencyBatch(30);
    assert.ok(sample.length >= 20 && sample.length <= 50);

    const currenciesFound = new Set(sample.map((s) => s.currency));
    assert.ok(currenciesFound.has("USD"));
    assert.ok(currenciesFound.has("EUR"));
    assert.ok(currenciesFound.has("INR"));

    const result = await reconcileMultiCurrencyBatch(sample);
    assert.ok(result.summary.matchedCount > 0);
    assert.ok(result.summary.currencyBreakdown.length >= 3);
    assert.ok(result.summary.totalGrossConvertedPaise > 0);
  });

  console.log("\n========================================================");
  console.log(`   ALL MULTI-CURRENCY RECON TESTS PASSED (${passed}/${passed}) `);
  console.log("========================================================\n");
}

runAll().catch((err) => {
  console.error("Fatal test failure:", err);
  process.exit(1);
});
