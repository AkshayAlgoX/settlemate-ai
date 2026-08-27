/*
 * SettleMate AI — Policy Run API & Interactive Simulation Unit Tests
 */

import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST } from "./route";

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
  console.log(" ⚙️  SETTLEMATE AI — POLICY PLAYGROUND RUN API SUITE");
  console.log("=========================================================================\n");

  // 1. Default Baseline Evaluation
  await test("POST /api/policy/run returns baseline evaluation for 20 sample records", async () => {
    const req = new NextRequest("http://localhost:3000/api/policy/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.summary.totalRecords, 20);
    assert.ok(data.summary.autoMatched >= 6);
    assert.ok(data.effectiveRules.policyContentHash);
  });

  // 2. Relaxed Amount Tolerance Override
  await test("POST /api/policy/run with relaxed tolerance reclassifies variance records to AUTO_MATCH", async () => {
    const req = new NextRequest("http://localhost:3000/api/policy/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        policyOverrides: {
          amountTolerancePaise: 3000, // ₹30.00
          toleranceWindowHours: 48,
        },
      }),
    });

    const res = await POST(req);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.summary.reclassifiedCount > 0, "Should reclassify records with variance <= ₹30.00");
    assert.ok(data.summary.autoMatched > data.summary.baselineAutoMatched, "Auto-match count must increase");
  });

  // 3. Strict 0-Tolerance Override
  await test("POST /api/policy/run with 0 tolerance excludes penny variances from AUTO_MATCH", async () => {
    const req = new NextRequest("http://localhost:3000/api/policy/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        policyOverrides: {
          amountTolerancePaise: 0, // Zero tolerance
          toleranceWindowHours: 48,
        },
      }),
    });

    const res = await POST(req);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.success, true);
    const pennyRec = data.records.find((r: { id: string }) => r.id === "REC_02"); // ₹0.50 variance
    assert.equal(pennyRec.effectiveDecision, "EXCEPTION", "₹0.50 variance must be an exception under 0 tolerance");
  });

  // 4. SLA Timing Window Expansion
  await test("POST /api/policy/run with extended SLA window (72h) allows delayed records", async () => {
    const req = new NextRequest("http://localhost:3000/api/policy/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        policyOverrides: {
          amountTolerancePaise: 100,
          toleranceWindowHours: 72, // 72h window
        },
      }),
    });

    const res = await POST(req);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.success, true);
    const delayed54h = data.records.find((r: { id: string }) => r.id === "REC_06"); // 54h delay
    assert.equal(delayed54h.effectiveDecision, "AUTO_MATCH", "54h record should be auto-matched under 72h window");
  });

  console.log("\npolicy-run: ALL 4 TESTS PASSED\n");
}

void main();
