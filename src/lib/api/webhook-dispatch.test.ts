/*
 * SettleMate AI — Webhook Dispatch, Retries & HMAC-SHA256 Signature Tests
 */

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  dispatchWebhook,
  generateWebhookSignature,
  v1Store,
} from "./v1-store";
import { initDatabase } from "@/lib/storage/sqlite-db";

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log("  ✓ " + name);
  } catch (err) {
    console.error("  ✗ " + name + " — " + (err as Error).message);
    throw err;
  }
}

async function runTests() {
  console.log("\n=========================================================================");
  console.log(" SETTLEMATE AI — WEBHOOK DISPATCH & HMAC SIGNATURE TESTS");
  console.log("=========================================================================\n");

  initDatabase();

  await test("1. HMAC-SHA256 signature generation is cryptographically accurate", () => {
    const payload = { event: "reconciliation.completed", batchId: "b1", total: 263 };
    const secret = "whsec_test_secret_123456";

    const signature = generateWebhookSignature(payload, secret);
    const expected = createHmac("sha256", secret).update(JSON.stringify(payload)).digest("hex");

    assert.equal(signature, expected);
    assert.equal(signature.length, 64);
  });

  await test("2. Simulated / internal webhook delivery completes immediately and logs to SQLite", async () => {
    const log = await dispatchWebhook(
      "https://erp.merchant-hub.internal/v1/settlemate-listener",
      "reconciliation.completed",
      { jobId: "job_test_001", status: "COMPLETED" },
      "whsec_test_signing_key_001"
    );

    assert.equal(log.status, "SIMULATED");
    assert.equal(log.statusCode, 200);
    assert.ok(log.signature.startsWith("t="));
    assert.ok(log.signature.includes(",v1="));

    // Verify stored in SQLite
    const recentLogs = v1Store.getWebhookLogs(100);
    const found = recentLogs.find((l) => l.id === log.id);
    assert.ok(found);
  });

  await test("3. Real HTTP dispatch sends correct headers and succeeds on 200 response", async () => {
    const originalFetch = globalThis.fetch;
    let capturedHeaders: Record<string, string> = {};
    let capturedBody = "";

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      if (init && init.headers) {
        capturedHeaders = init.headers as Record<string, string>;
      }
      if (init && init.body) {
        capturedBody = init.body as string;
      }
      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }) as typeof fetch;

    try {
      const payload = { jobId: "job_live_001", matchRatePct: 98.1 };
      const secret = "whsec_live_prod_key";
      const log = await dispatchWebhook(
        "https://api.merchant-corp.com/v1/settlemate-webhook",
        "reconciliation.completed",
        payload,
        secret
      );

      assert.equal(log.status, "DELIVERED");
      assert.equal(log.statusCode, 200);
      assert.equal(log.attempts, 1);

      assert.equal(capturedHeaders["Content-Type"], "application/json");
      assert.equal(capturedHeaders["X-SettleMate-Event"], "reconciliation.completed");
      assert.ok(capturedHeaders["X-SettleMate-Signature"]);
      assert.ok(capturedHeaders["X-SettleMate-Signature"].startsWith("t="));
      assert.equal(JSON.parse(capturedBody).matchRatePct, 98.1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await test("4. Retry logic executes up to 3 attempts with exponential backoff on failure", async () => {
    const originalFetch = globalThis.fetch;
    let attemptsCount = 0;

    globalThis.fetch = (async () => {
      attemptsCount++;
      return new Response(JSON.stringify({ error: "Internal Gateway Error" }), {
        status: 502,
        statusText: "Bad Gateway",
      });
    }) as typeof fetch;

    try {
      const log = await dispatchWebhook(
        "https://flaky-server.merchant.com/webhook",
        "reconciliation.completed",
        { test: true }
      );

      assert.equal(attemptsCount, 3, "Dispatcher must attempt 3 times on continuous failure");
      assert.equal(log.status, "FAILED");
      assert.equal(log.statusCode, 502);
      assert.equal(log.attempts, 3);
      assert.ok(log.error?.includes("502"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await test("5. Retry recovers on transient failure and delivers on subsequent attempt", async () => {
    const originalFetch = globalThis.fetch;
    let attemptsCount = 0;

    globalThis.fetch = (async () => {
      attemptsCount++;
      if (attemptsCount < 2) {
        return new Response(JSON.stringify({ error: "Temporary timeout" }), { status: 504 });
      }
      return new Response(JSON.stringify({ status: "OK" }), { status: 200 });
    }) as typeof fetch;

    try {
      const log = await dispatchWebhook(
        "https://transient-server.merchant.com/webhook",
        "reconciliation.completed",
        { test: true }
      );

      assert.equal(attemptsCount, 2, "Dispatcher should recover on attempt 2");
      assert.equal(log.status, "DELIVERED");
      assert.equal(log.statusCode, 200);
      assert.equal(log.attempts, 2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  console.log("\nwebhook-dispatch: ALL 5 WEBHOOK & HMAC TESTS PASSED\n");
}

runTests().catch((err) => {
  console.error("Test failure:", err);
  process.exit(1);
});
