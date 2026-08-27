/*
 * SettleMate AI — Audit Report Generation Unit Tests
 */

import assert from "node:assert/strict";
import { GET } from "./route";
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
  console.log(" 📄 SETTLEMATE AI — AUDIT REPORT GENERATION TESTS");
  console.log("=========================================================================\n");

  // 1. HTML Format Generation
  await test("Report 1: GET /api/report/generate returns valid printable HTML", async () => {
    const req = new NextRequest("http://localhost:3000/api/report/generate");
    const res = await GET(req);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get("content-type")?.includes("text/html"));

    const html = await res.text();
    assert.ok(html.includes("SettleMate AI"));
    assert.ok(html.includes("Track 04 Official Audit Report"));
    assert.ok(html.includes("81d840cd8cf981e5e69a367b879a8f11e9e51d60136a6d38e430877f08cab02b"));
    assert.ok(html.includes("98.1%"));
    assert.ok(html.includes("806.75 rec/sec"));
  });

  // 2. JSON Format Generation
  await test("Report 2: GET /api/report/generate?format=json returns structured payload", async () => {
    const req = new NextRequest("http://localhost:3000/api/report/generate?format=json&batchId=TEST_BATCH_101");
    const res = await GET(req);
    assert.equal(res.status, 200);

    const json = await res.json();
    assert.equal(json.batchId, "TEST_BATCH_101");
    assert.equal(json.complianceStatus, "CERTIFIED_VERIFIED");
    assert.equal(json.metrics.overallAccuracy, "98.1%");
    assert.equal(json.metrics.falseFinancialWrites, 0);
  });

  // 3. Security Headers Attached
  await test("Report 3: Response contains X-Content-Type-Options and X-Frame-Options", async () => {
    const req = new NextRequest("http://localhost:3000/api/report/generate");
    const res = await GET(req);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.equal(res.headers.get("x-frame-options"), "DENY");
  });

  console.log("\n=========================================================================");
  console.log(" ✅ ALL AUDIT REPORT TESTS PASSED");
  console.log("=========================================================================\n");
}

void main();
