/*
 * SettleMate AI — API Security, Rate Limiting & Header Tests
 */

import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import {
  TokenBucketRateLimiter,
  getCorsHeaders,
  getSecurityHeaders,
  handleCorsPreflight,
  validateApiKey,
  sanitizeInputString,
  sanitizeObject,
  rateLimitGuard,
} from "./api-security";

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
  console.log(" 🛡️  SETTLEMATE AI — API SECURITY & RATE LIMITING SUITE");
  console.log("=========================================================================\n");

  // 1. Token Bucket Rate Limiter
  await test("TokenBucketRateLimiter allows 100 requests and blocks the 101st with 429 parameters", () => {
    const limiter = new TokenBucketRateLimiter({ maxTokens: 100, refillWindowMs: 60_000 });
    const client = "test_merchant_client_1";
    const now = 1000000;

    for (let i = 0; i < 100; i++) {
      const res = limiter.check(client, now);
      assert.equal(res.allowed, true, `Request ${i + 1} should be allowed`);
      assert.equal(res.remaining, 99 - i);
    }

    const blocked = limiter.check(client, now);
    assert.equal(blocked.allowed, false, "101st request must be blocked");
    assert.equal(blocked.remaining, 0);
    assert.ok(blocked.retryAfterSeconds > 0, "retryAfterSeconds should be positive");
    assert.equal(blocked.retryAfterSeconds, 60);
  });

  await test("TokenBucketRateLimiter refills tokens over time", () => {
    const limiter = new TokenBucketRateLimiter({ maxTokens: 10, refillWindowMs: 10_000 });
    const client = "test_merchant_client_2";
    let now = 1000000;

    // Exhaust tokens
    for (let i = 0; i < 10; i++) {
      limiter.check(client, now);
    }
    assert.equal(limiter.check(client, now).allowed, false);

    // Advance 50% of window (5s) -> should have ~5 tokens refilled
    now += 5_000;
    const partial = limiter.check(client, now);
    assert.equal(partial.allowed, true);

    // Advance full window (10s) -> fully refilled
    now += 10_000;
    const full = limiter.check(client, now);
    assert.equal(full.allowed, true);
    assert.equal(full.remaining, 9);
  });

  // 2. Security Headers
  await test("getSecurityHeaders returns all mandatory security headers", () => {
    const headers = getSecurityHeaders();
    assert.equal(headers["X-Content-Type-Options"], "nosniff");
    assert.equal(headers["X-Frame-Options"], "DENY");
    assert.equal(headers["Content-Security-Policy"], "default-src 'none'");
    assert.equal(headers["X-XSS-Protection"], "1; mode=block");
    assert.equal(headers["Referrer-Policy"], "strict-origin-when-cross-origin");
  });

  // 3. CORS Headers
  await test("getCorsHeaders & handleCorsPreflight return valid CORS headers", () => {
    const headers = getCorsHeaders();
    assert.equal(headers["Access-Control-Allow-Origin"], "*");
    assert.ok(headers["Access-Control-Allow-Methods"].includes("POST"));

    const preflight = handleCorsPreflight();
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), "*");
    assert.equal(preflight.headers.get("X-Content-Type-Options"), "nosniff");
  });

  // 4. API Key Validation
  await test("validateApiKey validates 'sk_' prefix and length > 20", () => {
    // Valid keys
    const valid1 = validateApiKey("sk_live_12345678901234567890");
    assert.equal(valid1.valid, true);
    assert.equal(valid1.key, "sk_live_12345678901234567890");

    const validBearer = validateApiKey("Bearer sk_live_12345678901234567890");
    assert.equal(validBearer.valid, true);

    // Invalid keys
    assert.equal(validateApiKey("").valid, false);
    assert.equal(validateApiKey(null).valid, false);
    assert.equal(validateApiKey("pk_live_12345678901234567890").valid, false); // Wrong prefix
    assert.equal(validateApiKey("sk_short_key").valid, false); // Length <= 20
  });

  // 5. Input Sanitization
  await test("sanitizeInputString strips control characters and truncates length", () => {
    const malicious = "Hello\x00World\x1F\x7F!";
    const cleaned = sanitizeInputString(malicious);
    assert.equal(cleaned, "HelloWorld!");

    const longStr = "a".repeat(100);
    assert.equal(sanitizeInputString(longStr, 10).length, 10);
  });

  await test("sanitizeObject recursively cleans strings and defends against prototype pollution", () => {
    const input = {
      name: "Acme\x00 Corp",
      nested: {
        description: "Payment\x08 gateway",
      },
      tags: ["tag\x071", "tag2"],
    };

    const cleaned = sanitizeObject(input);
    assert.equal(cleaned.name, "Acme Corp");
    assert.equal(cleaned.nested.description, "Payment gateway");
    assert.equal(cleaned.tags[0], "tag1");

    // Guard prototype pollution
    const unsafeJson = JSON.parse('{"__proto__": {"polluted": true}, "safeKey": "value"}');
    const safeOutput = sanitizeObject(unsafeJson);
    assert.equal(safeOutput.safeKey, "value");
    assert.equal((Object.prototype as Record<string, unknown>).polluted, undefined);
  });

  // 6. rateLimitGuard Next.js Route Integration
  await test("rateLimitGuard enforces 429 when client quota exhausted", () => {
    const testLimiter = new TokenBucketRateLimiter({ maxTokens: 2, refillWindowMs: 60_000 });
    const req = new NextRequest("http://localhost:3000/api/v1/reconcile", {
      headers: { "x-api-key": "sk_test_client_guard_token_12345" },
    });

    const g1 = rateLimitGuard(req, testLimiter);
    assert.equal(g1.allowed, true);

    const g2 = rateLimitGuard(req, testLimiter);
    assert.equal(g2.allowed, true);

    const g3 = rateLimitGuard(req, testLimiter);
    assert.equal(g3.allowed, false);
    assert.ok(g3.response);
    assert.equal(g3.response.status, 429);
    assert.equal(g3.response.headers.get("Retry-After"), "60");
    assert.equal(g3.response.headers.get("X-RateLimit-Remaining"), "0");
    assert.equal(g3.response.headers.get("X-Content-Type-Options"), "nosniff");
  });

  console.log("\napi-security: ALL 7 TESTS PASSED\n");
}

void main();
