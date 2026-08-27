/*
 * SettleMate AI — AI vs Deterministic Comparison Engine Unit Tests
 */

import assert from "node:assert/strict";
import { POST } from "../api/comparison/run/route";
import { NextRequest } from "next/server";

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
  console.log(" ⚖️  SETTLEMATE AI — AI VS DETERMINISTIC COMPARISON TESTS");
  console.log("=========================================================================\n");

  // 1. Test Default Scenario (Partial Refund)
  await test("Comparison 1: POST /api/comparison/run returns 3 distinct architecture outputs", async () => {
    const req = new NextRequest("http://localhost:3000/api/comparison/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioId: "partial-refund" }),
    });

    const res = await POST(req);
    assert.equal(res.status, 200);

    const json = await res.json();
    assert.equal(json.scenarioId, "partial-refund");
    assert.ok(json.architectures.rulesOnly);
    assert.ok(json.architectures.pureLlm);
    assert.ok(json.architectures.hybrid);

    assert.equal(json.architectures.rulesOnly.verdict, "BLOCKED");
    assert.equal(json.architectures.pureLlm.verdict, "UNSAFE");
    assert.equal(json.architectures.hybrid.verdict, "VERIFIED");
    assert.ok(json.architectures.hybrid.executionLatencyMs > 0);
  });

  // 2. Test Fee Discrepancy Scenario
  await test("Comparison 2: Fee Discrepancy shows Rate Overcharge detection", async () => {
    const req = new NextRequest("http://localhost:3000/api/comparison/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioId: "fee-discrepancy" }),
    });

    const res = await POST(req);
    assert.equal(res.status, 200);

    const json = await res.json();
    assert.equal(json.scenarioId, "fee-discrepancy");
    assert.ok(json.winnerSummary.title.includes("Overcharge"));
    assert.equal(json.architectures.hybrid.classification, "RATE_OVERCHARGE_RECOVERABLE");
  });

  // 3. Test All 5 Anomaly Scenarios
  await test("Comparison 3: All 5 anomaly scenarios execute cleanly", async () => {
    const scenarios = [
      "partial-refund",
      "fee-discrepancy",
      "expired-chargeback",
      "delayed-settlement",
      "duplicate-credit",
    ];

    for (const s of scenarios) {
      const req = new NextRequest("http://localhost:3000/api/comparison/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId: s }),
      });

      const res = await POST(req);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.scenarioId, s);
      assert.equal(json.architectures.hybrid.verdict, "VERIFIED");
    }
  });

  console.log("\n=========================================================================");
  console.log(" ✅ ALL AI COMPARISON TESTS PASSED");
  console.log("=========================================================================\n");
}

void main();
