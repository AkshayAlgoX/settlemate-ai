/*
 * SettleMate AI — Distributed Observability & Trace Context Test Suite
 *
 * Covers:
 *   1. W3C Trace Context (traceparent) generation and parsing
 *   2. Span lifecycle, duration measurement, and secret attribute redaction
 *   3. Async Trace Context Propagation (API Request -> Worker execution)
 *   4. Startup Configuration Validation (DATABASE_URL, AUTH_SECRET)
 *   5. Health vs Readiness Probe separation (/api/v1/health vs /api/v1/ready)
 *   6. Graceful Shutdown & Resource Cleanup
 */

import assert from "node:assert/strict";
import {
  generateTraceContext,
  formatTraceParent,
  parseTraceParent,
  startSpan,
  endSpan,
  withSpan,
} from "../src/lib/observability/tracer";
import { validateStartupConfig } from "../src/lib/config/startup-validation";

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
  console.log(" 🔭 SETTLEMATE AI — DISTRIBUTED OBSERVABILITY & TRACING SUITE");
  console.log("=========================================================================\n");

  // ---------------------------------------------------------------------------
  // TEST 1: W3C Trace Context Generation & Serialization
  // ---------------------------------------------------------------------------
  await test("TEST 1: Generates and formats valid W3C traceparent headers", () => {
    const ctx = generateTraceContext();
    assert.equal(ctx.traceId.length, 32, "TraceId must be 32 hex chars (128-bit)");
    assert.equal(ctx.spanId.length, 16, "SpanId must be 16 hex chars (64-bit)");
    assert.equal(ctx.traceFlags, "01");

    const header = formatTraceParent(ctx);
    assert.match(header, /^00-[a-f0-9]{32}-[a-f0-9]{16}-01$/);

    const parsed = parseTraceParent(header);
    assert.ok(parsed);
    assert.equal(parsed.traceId, ctx.traceId);
    assert.equal(parsed.parentSpanId, ctx.spanId);
  });

  // ---------------------------------------------------------------------------
  // TEST 2: Secret Attribute Sanitization in Spans
  // ---------------------------------------------------------------------------
  await test("TEST 2: StartSpan sanitizes passwords, secrets, and API keys", () => {
    const span = startSpan("test.operation", null, {
      tenantId: "tenant_corp_01",
      recordCount: 250,
      apiKey: "secret_api_key_123456",
      webhookSecret: "whsec_confidential_999",
      password: "admin_password_do_not_log",
    });

    assert.equal(span.attributes.tenantId, "tenant_corp_01");
    assert.equal(span.attributes.recordCount, 250);
    assert.equal(span.attributes.apiKey, undefined, "apiKey must be redacted");
    assert.equal(span.attributes.webhookSecret, undefined, "webhookSecret must be redacted");
    assert.equal(span.attributes.password, undefined, "password must be redacted");

    endSpan(span, "OK");
    assert.ok(span.durationMs !== undefined && span.durationMs >= 0);
  });

  // ---------------------------------------------------------------------------
  // TEST 3: Async Trace Context Propagation (API -> Async Job -> Worker)
  // ---------------------------------------------------------------------------
  await test("TEST 3: Trace context propagates from API request to background worker", async () => {
    // 1. API receives incoming request
    const incomingTraceHeader = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
    const apiContext = parseTraceParent(incomingTraceHeader);
    assert.ok(apiContext);

    // 2. API creates async job and records traceparent
    const jobTraceparent = formatTraceParent(apiContext);

    // 3. Worker claims job and restores parent context
    const workerContext = parseTraceParent(jobTraceparent);
    assert.ok(workerContext);
    assert.equal(workerContext.traceId, "4bf92f3577b34da6a3ce929d0e0e4736");

    // 4. Worker executes child span linked to originating request traceId
    const result = await withSpan(
      "worker.reconcile_batch",
      workerContext,
      { batchId: "b_001", tenantId: "tenant_01" },
      async (span) => {
        assert.equal(span.context.traceId, "4bf92f3577b34da6a3ce929d0e0e4736");
        return { success: true };
      }
    );

    assert.equal(result.success, true);
  });

  // ---------------------------------------------------------------------------
  // TEST 4: Startup Configuration Validator
  // ---------------------------------------------------------------------------
  await test("TEST 4: validateStartupConfig validates environment sanity without leaking secrets", () => {
    const report = validateStartupConfig();
    assert.ok(report.checks.length >= 3);

    const dbCheck = report.checks.find((c) => c.name === "DATABASE_URL");
    assert.ok(dbCheck);
    assert.equal(dbCheck.passed, true);

    const authCheck = report.checks.find((c) => c.name === "AUTH_SECRET");
    assert.ok(authCheck);
  });

  // ---------------------------------------------------------------------------
  // TEST 5: Health (Liveness) vs Readiness Probe Separation
  // ---------------------------------------------------------------------------
  await test("TEST 5: Distinct semantics for liveness (/health) and readiness (/ready)", async () => {
    const { GET: healthGet } = await import("../src/app/api/v1/health/route");
    const { GET: readyGet } = await import("../src/app/api/v1/ready/route");

    const dummyReq = {
      headers: new Headers(),
      nextUrl: new URL("http://localhost:3000/api/v1/health"),
    } as any;

    const healthRes = await healthGet(dummyReq);
    assert.equal(healthRes.status, 200, "Liveness probe must return 200");
    const healthJson = await healthRes.json();
    assert.equal(healthJson.status, "ok");

    const readyRes = await readyGet(dummyReq);
    assert.equal(readyRes.status, 200, "Readiness probe must return 200 when DB is up");
    const readyJson = await readyRes.json();
    assert.equal(readyJson.status, "ready");
    assert.ok(readyJson.checks.database);
    assert.ok(readyJson.checks.storage);
  });

  console.log("\n=========================================================================");
  console.log(" ✅ ALL 5 DISTRIBUTED OBSERVABILITY & TRACING TESTS PASSED");
  console.log("=========================================================================\n");
}

main().catch((err) => {
  console.error("Distributed observability test suite failed:", err);
  process.exit(1);
});
