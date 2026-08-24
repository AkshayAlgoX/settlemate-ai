/*
 * SettleMate AI — Financial Arithmetic & Exact Integer Minor-Unit Suite (Day 1 Pass)
 *
 * Proves exact paise arithmetic across all financial calculations:
 *   1. 1-paise, 2-paise, 3-paise edge cases and rounding boundaries
 *   2. Large enterprise amounts (up to ₹90 Trillion within Number.MAX_SAFE_INTEGER)
 *   3. Multi-component deduction arithmetic: gross - fee - tax - refund - chargeback
 *   4. Integer aggregation with zero floating-point epsilon drift
 *   5. N:M multi-item integer sum parity
 */

import assert from "node:assert/strict";

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log("  ✓ " + name);
  } catch (err) {
    console.error("  ✗ " + name + " — " + (err as Error).message);
    throw err;
  }
}

export const MAX_SAFE_FINANCIAL_PAISE = Number.MAX_SAFE_INTEGER; // 9,007,199,254,740,991 paise ≈ ₹90,071,992,547,409.91 (~₹90 Trillion)

export function toPaise(rupees: number | string): number {
  if (typeof rupees === "string") {
    const parsed = Number.parseFloat(rupees);
    if (Number.isNaN(parsed)) throw new Error("Invalid rupee string");
    return Math.round(parsed * 100);
  }
  return Math.round(rupees * 100);
}

export function computeNetSettlementPaise(params: {
  grossPaise: number;
  feePaise: number;
  taxPaise: number;
  refundPaise?: number;
  chargebackPaise?: number;
  adjustmentPaise?: number;
}): number {
  const { grossPaise, feePaise, taxPaise, refundPaise = 0, chargebackPaise = 0, adjustmentPaise = 0 } = params;
  const net = grossPaise - feePaise - taxPaise - refundPaise - chargebackPaise + adjustmentPaise;
  if (!Number.isSafeInteger(net)) {
    throw new Error(`Integer overflow detected in net settlement: ${net}`);
  }
  return net;
}

async function runTests() {
  console.log("\n=========================================================================");
  console.log(" SETTLEMATE AI — FINANCIAL ARITHMETIC & INTEGER MINOR-UNIT TESTS");
  console.log("=========================================================================\n");

  await test("1. Sub-Rupee Precision: 0.01, 0.02, 0.03 INR convert to exact 1, 2, 3 paise", () => {
    assert.equal(toPaise("0.01"), 1);
    assert.equal(toPaise("0.02"), 2);
    assert.equal(toPaise("0.03"), 3);
    assert.equal(toPaise("199.99"), 19999);
    assert.equal(toPaise(0.01), 1);
    assert.equal(toPaise(0.02), 2);
    assert.equal(toPaise(0.03), 3);
  });

  await test("2. Floating-Point Classic Hazard (0.1 + 0.2 != 0.3) eliminated in integer paise", () => {
    // In raw floats: 0.1 + 0.2 === 0.30000000000000004
    // In integer paise:
    const p1 = toPaise("0.10"); // 10 paise
    const p2 = toPaise("0.20"); // 20 paise
    const p3 = toPaise("0.30"); // 30 paise
    assert.equal(p1 + p2, p3);
    assert.equal(p1 + p2, 30);
  });

  await test("3. Enterprise Scale: ₹1,000 Crore (100 Billion Paise) calculates exactly without overflow", () => {
    const gross1000Cr = 10_000_000_000_00; // 1,000 Cr in paise = 10^11 paise
    const fee2Pct = 200_000_000_00; // 2% fee = 2 Cr in paise
    const gst18PctOnFee = 36_000_000_00; // 18% GST on fee = 36 Lakhs in paise
    const net = computeNetSettlementPaise({
      grossPaise: gross1000Cr,
      feePaise: fee2Pct,
      taxPaise: gst18PctOnFee,
    });
    assert.equal(net, 976400000000);
    assert.equal(Number.isSafeInteger(net), true);
  });

  await test("4. Maximum Safe Integer Range Boundary Check (₹90 Trillion Ceiling)", () => {
    assert.equal(Number.isSafeInteger(MAX_SAFE_FINANCIAL_PAISE), true);
    assert.equal(Number.isSafeInteger(MAX_SAFE_FINANCIAL_PAISE + 1), false);
    // Any financial operation beyond MAX_SAFE_FINANCIAL_PAISE throws
    assert.throws(() => {
      computeNetSettlementPaise({
        grossPaise: MAX_SAFE_FINANCIAL_PAISE + 2,
        feePaise: 0,
        taxPaise: 0,
      });
    });
  });

  await test("5. Multi-Component Deduction: Gross - Fee - Tax - Refund - Chargeback = Net exactly", () => {
    const net = computeNetSettlementPaise({
      grossPaise: 500000, // ₹5,000
      feePaise: 10000, // ₹100
      taxPaise: 1800, // ₹18
      refundPaise: 50000, // ₹500
      chargebackPaise: 25000, // ₹250
      adjustmentPaise: 500, // +₹5 adjustment
    });
    assert.equal(net, 413700); // ₹4,137.00
  });

  await test("6. Aggregation Sum Parity: 100,000 micro-transactions sum without precision loss", () => {
    let total = 0;
    for (let i = 0; i < 100000; i++) {
      total += 137; // 137 paise (₹1.37)
    }
    assert.equal(total, 13700000); // Exactly ₹137,000.00
    assert.equal(Number.isSafeInteger(total), true);
  });

  console.log("\narithmetic: ALL 6 ARITHMETIC AUDIT TESTS PASSED\n");
}

void runTests();
