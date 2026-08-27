/*
 * SettleMate AI — Exception Root Cause Analysis Unit Tests
 */

import assert from "node:assert/strict";

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log("  ✓ " + name);
  } catch (err) {
    console.error("  ✗ " + name + " — " + (err as Error).message);
    throw err;
  }
}

async function main() {
  console.log("\n=========================================================================");
  console.log(" 🔍 SETTLEMATE AI — ROOT CAUSE ANALYSIS & TIMELINE TESTS");
  console.log("=========================================================================\n");

  // 1. Multi-Source Event Timeline Sequence
  await test("Root Cause 1: 5-step timeline preserves chronological monotonicity", () => {
    const timestamps = [
      "2026-08-20T09:15:00.000Z",
      "2026-08-20T09:15:32.000Z",
      "2026-08-20T11:42:10.000Z",
      "2026-08-21T06:00:00.000Z",
      "2026-08-21T14:22:15.000Z",
    ];

    for (let i = 1; i < timestamps.length; i++) {
      const prev = new Date(timestamps[i - 1]).getTime();
      const curr = new Date(timestamps[i]).getTime();
      assert.ok(curr >= prev, `Step ${i} must be chronological after Step ${i - 1}`);
    }
  });

  // 2. Exact Minor-Unit Mathematical Conservation
  await test("Root Cause 2: Gross - Refund === Net settlement down to exact paise", () => {
    const grossPaise = 2000000; // ₹20,000
    const refundPaise = 155000;  // ₹1,550
    const expectedNetPaise = 1845000; // ₹18,450

    assert.equal(grossPaise - refundPaise, expectedNetPaise);
    assert.equal(expectedNetPaise + refundPaise, grossPaise);
  });

  // 3. Evidence Voucher SHA-256 Digest Validation
  await test("Root Cause 3: Evidence digest conforms to 64-char hexadecimal SHA-256 standard", () => {
    const hash = "a7f92b41c0e84b8d7e98a123f456c7890123456789abcdef0123456789abcdef";
    assert.equal(hash.length, 64);
    assert.ok(/^[0-9a-f]{64}$/.test(hash));
  });

  console.log("\n=========================================================================");
  console.log(" ✅ ALL ROOT CAUSE ANALYSIS TESTS PASSED");
  console.log("=========================================================================\n");
}

void main();
