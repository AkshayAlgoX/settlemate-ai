/*
 * SettleMate AI — OpenAPI 3.0.3 Spec & API Docs Test Suite
 */

import assert from "node:assert/strict";
import { OPENAPI_SPEC } from "@/lib/api/openapi-spec";
import { GET } from "../api/docs/route";

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
  console.log(" 📜 SETTLEMATE AI — OPENAPI SPEC & DOCS SUITE");
  console.log("=========================================================================\n");

  await test("OpenAPI Spec 1: Root spec schema is valid 3.0.3", () => {
    assert.equal(OPENAPI_SPEC.openapi, "3.0.3");
    assert.ok(OPENAPI_SPEC.info.title.includes("SettleMate AI"));
    assert.equal(OPENAPI_SPEC.info.version, "1.0.0");
  });

  await test("OpenAPI Spec 2: Key routes are documented", () => {
    const paths = Object.keys(OPENAPI_SPEC.paths);
    assert.ok(paths.includes("/reconcile"));
    assert.ok(paths.includes("/reconcile/{jobId}"));
    assert.ok(paths.includes("/multi-currency/reconcile"));
    assert.ok(paths.includes("/webhooks/register"));
    assert.ok(paths.includes("/webhooks/logs"));
    assert.ok(paths.includes("/health"));
  });

  await test("OpenAPI Spec 3: Security schemes are defined", () => {
    assert.ok(OPENAPI_SPEC.components.securitySchemes.ApiKeyAuth);
    assert.ok(OPENAPI_SPEC.components.securitySchemes.BearerAuth);
  });

  await test("OpenAPI Route 4: GET /api/docs returns JSON with security headers", async () => {
    const res = await GET();
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "application/json");
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.equal(res.headers.get("x-frame-options"), "DENY");

    const json = await res.json();
    assert.equal(json.openapi, "3.0.3");
    assert.ok(json.paths["/reconcile"]);
  });

  console.log("\n=========================================================================");
  console.log(" ✅ ALL OPENAPI SPEC & DOCS TESTS PASSED");
  console.log("=========================================================================\n");
}

void main();
