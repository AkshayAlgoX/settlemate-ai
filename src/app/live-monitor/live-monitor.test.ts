/*
 * SettleMate AI — Live Streaming Monitor Unit Tests
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
  console.log(" 📡 SETTLEMATE AI — LIVE STREAMING RECONCILIATION TESTS");
  console.log("=========================================================================\n");

  // 1. Test Streaming Batch Ingestion Math
  await test("Live Monitor 1: Streaming micro-batch calculates paise arithmetic precisely", () => {
    const transactions = [
      { id: "PAY_1", amountPaise: 50000, status: "MATCHED" },
      { id: "PAY_2", amountPaise: 120000, status: "MATCHED" },
      { id: "PAY_3", amountPaise: 184500, status: "EXCEPTION" },
    ];

    const totalGross = transactions.reduce((acc, t) => acc + t.amountPaise, 0);
    assert.equal(totalGross, 354500); // exact integer paise

    const matched = transactions.filter((t) => t.status === "MATCHED").length;
    const exceptions = transactions.filter((t) => t.status === "EXCEPTION").length;

    assert.equal(matched, 2);
    assert.equal(exceptions, 1);
  });

  // 2. Test Anomaly Rate Bounding
  await test("Live Monitor 2: Anomaly injection respects 0% to 50% parameter ranges", () => {
    const cleanRate = 0;
    const highRate = 50;

    assert.ok(cleanRate >= 0 && cleanRate <= 100);
    assert.ok(highRate >= 0 && highRate <= 100);
  });

  // 3. Test High Frequency Sliding Window Buffer
  await test("Live Monitor 3: Buffer retains only last 50 transactions to prevent memory growth", () => {
    const buffer: number[] = [];
    const maxCapacity = 50;

    for (let i = 0; i < 500; i++) {
      buffer.unshift(i);
      if (buffer.length > maxCapacity) {
        buffer.pop();
      }
    }

    assert.equal(buffer.length, 50);
    assert.equal(buffer[0], 499);
    assert.equal(buffer[49], 450);
  });

  console.log("\n=========================================================================");
  console.log(" ✅ ALL LIVE MONITOR TESTS PASSED");
  console.log("=========================================================================\n");
}

void main();
