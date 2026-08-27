/*
 * SettleMate AI — Integration Simulator Generator & Workflow Tests
 */

import assert from "node:assert/strict";
import { generateSimulatorBatch, createPrng } from "./simulator-generator";

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
  console.log(" 🔌 SETTLEMATE AI — INTEGRATION SIMULATOR UNIT TESTS");
  console.log("=========================================================================\n");

  // 1. Deterministic PRNG
  await test("createPrng generates identical sequence for same seed", () => {
    const prng1 = createPrng(1337);
    const prng2 = createPrng(1337);

    for (let i = 0; i < 20; i++) {
      assert.equal(prng1(), prng2());
    }
  });

  // 2. Batch Generation Bounds
  await test("generateSimulatorBatch bounds row count between 50 and 200", () => {
    const minBatch = generateSimulatorBatch(10, 42); // Below 50
    assert.equal(minBatch.rowCount, 50);

    const maxBatch = generateSimulatorBatch(500, 42); // Above 200
    assert.equal(maxBatch.rowCount, 200);

    const normalBatch = generateSimulatorBatch(120, 42);
    assert.equal(normalBatch.rowCount, 120);
  });

  // 3. Batch Determinism
  await test("generateSimulatorBatch produces exact bitwise identical dataset for same seed", () => {
    const b1 = generateSimulatorBatch(80, 9999);
    const b2 = generateSimulatorBatch(80, 9999);

    assert.equal(b1.csvContent, b2.csvContent);
    assert.equal(b1.transactions.length, b2.transactions.length);
    assert.deepEqual(b1.stats, b2.stats);
  });

  // 4. Anomaly Rate Distribution
  await test("generateSimulatorBatch respects configured anomaly rates", () => {
    const highAnomaly = generateSimulatorBatch(150, 777, {
      partialRefundRate: 0.30,
      feeMismatchRate: 0.20,
      duplicateRate: 0.15,
      delayedSettlementRate: 0.10,
      orphanCreditRate: 0.10,
    });

    assert.ok(highAnomaly.stats.partialRefundCount > 25);
    assert.ok(highAnomaly.stats.feeMismatchCount > 15);
    assert.ok(highAnomaly.stats.duplicateCount > 10);
    assert.ok(highAnomaly.transactions.length > 150);
  });

  // 5. CSV Structure Validity
  await test("generateSimulatorBatch outputs valid CSV header and non-empty rows", () => {
    const batch = generateSimulatorBatch(60, 101);
    const lines = batch.csvContent.split("\n").filter(Boolean);

    assert.ok(lines.length > 60);
    assert.equal(lines[0], "source,amount,currency,date,reference_id,utr,fee,tax,anomalyTag");
    assert.ok(lines[1].includes("INR"));
  });

  console.log("\nsimulator: ALL 5 TESTS PASSED\n");
}

void main();
