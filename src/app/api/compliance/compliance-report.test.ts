/*
 * SettleMate AI — Compliance Report Route Test Suite
 */

import assert from "node:assert/strict";
import { GET } from "./report/route";
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
  console.log(" 📄 SETTLEMATE AI — COMPLIANCE REPORT ROUTE SUITE");
  console.log("=========================================================================\n");

  await test("Compliance 1: GET /api/compliance/report returns valid printable HTML", async () => {
    const req = new NextRequest("http://localhost:3000/api/compliance/report");
    const res = await GET(req);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get("content-type")?.includes("text/html"));

    const html = await res.text();
    assert.ok(html.includes("Track 04 Official Compliance Binder"));
    assert.ok(html.includes("81d840cd8cf981e5e69a367b879a8f11e9e51d60136a6d38e430877f08cab02b"));
    assert.ok(html.includes("98.1%"));
    assert.ok(html.includes("806.75 rec/sec"));
  });

  await test("Compliance 2: GET /api/compliance/report?format=json returns structured JSON", async () => {
    const req = new NextRequest("http://localhost:3000/api/compliance/report?format=json");
    const res = await GET(req);
    assert.equal(res.status, 200);

    const json = await res.json();
    assert.equal(json.complianceStatus, "VERIFIED_COMPLIANT");
    assert.equal(json.criteriaPassed, 8);
    assert.equal(json.metrics.accuracy, "98.1%");
  });

  console.log("\n=========================================================================");
  console.log(" ✅ ALL COMPLIANCE REPORT TESTS PASSED");
  console.log("=========================================================================\n");
}

void main();
