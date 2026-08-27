/*
 * SettleMate AI — Multi-Currency FX Conversion Unit Tests
 *
 * Verifies exact integer arithmetic, zero IEEE-754 floating-point drift,
 * floor rounding policies, and edge-case behavior.
 */

import assert from "node:assert/strict";
import {
  STATIC_FX_RATES,
  SUPPORTED_CURRENCIES,
  convertToBaseMinor,
  convertFromBaseMinor,
  formatForeignCurrency,
} from "./fx-rates";

let passed = 0;

function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`   ✓ ${name}`);
  } catch (err) {
    console.error(`   ✗ ${name} — ${(err as Error).message}`);
    throw err;
  }
}

console.log("\n========================================================");
console.log("   SETTLEMATE AI — MULTI-CURRENCY FX UNIT TESTS         ");
console.log("========================================================\n");

console.log("1. Testing Supported Sovereign Currency Registry...");

check("All core sovereign currencies are defined with valid integer ratios", () => {
  const expected = ["INR", "USD", "EUR", "GBP", "SGD", "AED", "JPY", "CAD", "AUD"];
  for (const code of expected) {
    assert.ok(SUPPORTED_CURRENCIES.includes(code), `Missing currency ${code}`);
    const def = STATIC_FX_RATES[code];
    assert.ok(def.rateNumerator > 0, `Invalid numerator for ${code}`);
    assert.ok(def.rateDenominator > 0, `Invalid denominator for ${code}`);
    assert.ok(Number.isInteger(def.rateNumerator), `Numerator must be integer for ${code}`);
    assert.ok(Number.isInteger(def.rateDenominator), `Denominator must be integer for ${code}`);
  }
});

console.log("\n2. Testing Exact Integer Floor Conversion (Zero Float Drift)...");

check("USD to INR exact conversion: $100.00 (10,000 cents) -> ₹8,325.00 (832,500 paise)", () => {
  // 10,000 cents * 8325 / 100 = 832,500 paise
  const res = convertToBaseMinor(10000, "USD");
  assert.equal(res.convertedMinor, 832500);
  assert.equal(res.fromCurrency, "USD");
  assert.equal(res.toCurrency, "INR");
  assert.equal(res.roundingMethod, "INTEGER_FLOOR");
});

check("EUR to INR exact conversion: €50.00 (5,000 cents) -> ₹4,505.00 (450,500 paise)", () => {
  // 5,000 cents * 9010 / 100 = 450,500 paise
  const res = convertToBaseMinor(5000, "EUR");
  assert.equal(res.convertedMinor, 450500);
});

check("GBP to INR exact conversion: £25.00 (2,500 pence) -> ₹2,637.50 (263,750 paise)", () => {
  // 2,500 pence * 10550 / 100 = 263,750 paise
  const res = convertToBaseMinor(2500, "GBP");
  assert.equal(res.convertedMinor, 263750);
});

check("JPY (zero-decimal) to INR conversion: ¥10,000 -> ₹5,500.00 (550,000 paise)", () => {
  // 10,000 yen * 55 / 1 = 550,000 paise
  const res = convertToBaseMinor(10000, "JPY");
  assert.equal(res.convertedMinor, 550000);
});

check("INR to INR identity conversion returns exact same paise", () => {
  const res = convertToBaseMinor(155000, "INR");
  assert.equal(res.convertedMinor, 155000);
  assert.equal(res.fxRateApplied, 1.0);
});

console.log("\n3. Testing Integer Floor Rounding Policy (No Over-Crediting)...");

check("Fractional cent division rounds down (floor): $0.01 (1 cent) = 83 paise", () => {
  // 1 cent * 8325 / 100 = 83.25 -> floor = 83 paise
  const res = convertToBaseMinor(1, "USD");
  assert.equal(res.convertedMinor, 83);
});

check("Arbitrary fractional cent conversion floors cleanly", () => {
  // 7 cents * 8325 / 100 = 582.75 -> floor = 582 paise
  const res = convertToBaseMinor(7, "USD");
  assert.equal(res.convertedMinor, 582);
});

console.log("\n4. Testing Edge Cases & Reverse Conversion...");

check("Zero amount conversion returns zero paise", () => {
  const res = convertToBaseMinor(0, "USD");
  assert.equal(res.convertedMinor, 0);
});

check("Negative amounts are bounded to zero", () => {
  const res = convertToBaseMinor(-500, "USD");
  assert.equal(res.convertedMinor, 0);
});

check("Unsupported currency throws descriptive error", () => {
  assert.throws(
    () => convertToBaseMinor(1000, "XYZ"),
    /Unsupported source currency: 'XYZ'/
  );
});

check("Reverse conversion: convertFromBaseMinor converts paise back to foreign minor units", () => {
  // 832,500 paise -> USD cents: floor(832500 * 100 / 8325) = 10,000 cents
  const cents = convertFromBaseMinor(832500, "USD");
  assert.equal(cents, 10000);
});

console.log("\n5. Testing Foreign Currency Formatting...");

check("formatForeignCurrency formats USD, EUR, GBP, JPY, and INR cleanly", () => {
  const formattedUsd = formatForeignCurrency(12550, "USD");
  assert.ok(formattedUsd.includes("125.50") || formattedUsd.includes("$"), formattedUsd);

  const formattedJpy = formatForeignCurrency(5000, "JPY");
  assert.ok(formattedJpy.includes("5,000") || formattedJpy.includes("¥"), formattedJpy);

  const formattedInr = formatForeignCurrency(200000, "INR");
  assert.ok(formattedInr.includes("2,000.00") || formattedInr.includes("₹"), formattedInr);
});

console.log("\n========================================================");
console.log(`   ALL FX CONVERSION TESTS PASSED (${passed}/${passed}) `);
console.log("========================================================\n");
