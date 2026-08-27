/*
 * SettleMate AI — Developer Portal & OpenAPI Spec Tests
 */

import assert from "node:assert/strict";
import { OPENAPI_SPEC } from "@/lib/api/openapi-spec";
import { GET as docsGet } from "../api/docs/route";

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
  console.log(" 💻 SETTLEMATE AI — DEVELOPER PORTAL & OPENAPI SUITE");
  console.log("=========================================================================\n");

  // 1. OpenAPI Specification Structure
  await test("OPENAPI_SPEC has valid 3.0.3 structure with mandatory fields", () => {
    assert.equal(OPENAPI_SPEC.openapi, "3.0.3");
    assert.ok(OPENAPI_SPEC.info.title.includes("SettleMate AI"));
    assert.equal(OPENAPI_SPEC.info.version, "1.0.0");
    assert.ok(OPENAPI_SPEC.servers.length >= 2);
  });

  // 2. All Core Paths Defined
  await test("OPENAPI_SPEC defines all core v1 endpoints and operations", () => {
    const paths = OPENAPI_SPEC.paths as Record<string, unknown>;
    assert.ok(paths["/reconcile"]);
    assert.ok(paths["/reconcile/{jobId}"]);
    assert.ok(paths["/health"]);
    assert.ok(paths["/webhooks/register"]);
    assert.ok(paths["/webhooks/logs"]);
  });

  // 3. Security Schemes
  await test("OPENAPI_SPEC defines ApiKeyAuth and BearerAuth security schemes", () => {
    const schemes = OPENAPI_SPEC.components.securitySchemes;
    assert.equal(schemes.ApiKeyAuth.type, "apiKey");
    assert.equal(schemes.ApiKeyAuth.name, "X-API-Key");
    assert.equal(schemes.BearerAuth.type, "http");
    assert.equal(schemes.BearerAuth.scheme, "bearer");
  });

  // 4. Docs Endpoint Returns Spec
  await test("GET /api/docs serves OPENAPI_SPEC with CORS and security headers", async () => {
    const res = await docsGet();
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Content-Type"), "application/json");
    assert.equal(res.headers.get("Access-Control-Allow-Origin"), "*");
    assert.equal(res.headers.get("X-Content-Type-Options"), "nosniff");

    const json = await res.json();
    assert.equal(json.openapi, "3.0.3");
    assert.equal(json.info.title, OPENAPI_SPEC.info.title);
  });

  console.log("\ndeveloper: ALL 4 TESTS PASSED\n");
}

void main();
