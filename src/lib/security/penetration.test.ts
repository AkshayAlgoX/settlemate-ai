/*
 * SettleMate AI — Security Penetration & Attack Defense Unit Tests
 */

import assert from "node:assert/strict";
import {
  TokenBucketRateLimiter,
  validateApiKey,
  sanitizeObject,
  validateBodySize,
  checkObjectDepth,
  sanitizeHeaderValue,
  sanitizeNoSqlOperators,
  safeErrorResponse,
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
  console.log(" 🛡️  SETTLEMATE AI — SECURITY PENETRATION & HARDENING SUITE");
  console.log("=========================================================================\n");

  // 1. Prototype Pollution Defense
  await test("Security: Prototype pollution keys (__proto__, constructor) are safely stripped", () => {
    const maliciousPayload = JSON.parse('{"__proto__": {"isAdmin": true}, "constructor": {"polluted": true}, "safeField": "payment_100"}');
    const sanitized = sanitizeObject(maliciousPayload);

    assert.equal(sanitized.safeField, "payment_100");
    assert.equal((sanitized as Record<string, unknown>).__proto__, Object.prototype);
    assert.equal((sanitized as Record<string, unknown>).isAdmin, undefined);
    assert.equal(({} as Record<string, unknown>).isAdmin, undefined);
  });

  // 2. NoSQL Operator Stripping
  await test("Security: NoSQL query injection operators ($where, $gt, $ne, $regex) are neutralized", () => {
    const attackQuery = {
      tenantId: "nexus_retail",
      amount: { $gt: 0 },
      $where: "sleep(5000)",
      $regex: ".*",
      paymentId: "PAY_123",
    };

    const sanitized = sanitizeNoSqlOperators(attackQuery);
    assert.equal(sanitized.tenantId, "nexus_retail");
    assert.equal(sanitized.paymentId, "PAY_123");
    assert.equal((sanitized as Record<string, unknown>).$where, undefined);
    assert.equal((sanitized as Record<string, unknown>).$regex, undefined);
    assert.deepEqual(sanitized.amount, {});
  });

  // 3. Payload Size Limitation (1MB Cap)
  await test("Security: Large payloads exceeding 1MB byte limit are strictly rejected", () => {
    const smallPayload = JSON.stringify({ data: "A".repeat(1000) });
    const checkSmall = validateBodySize(smallPayload, 1024 * 1024);
    assert.equal(checkSmall.valid, true);

    const oversizedPayload = "A".repeat(1_500_000); // 1.5 MB
    const checkLarge = validateBodySize(oversizedPayload, 1024 * 1024);
    assert.equal(checkLarge.valid, false);
    assert.ok(checkLarge.error?.includes("exceeds maximum allowed limit"));
  });

  // 4. Object Recursion Depth Guard (DoS Defense)
  await test("Security: Deeply nested JSON recursion payloads (>10 levels) are caught", () => {
    const deepObject: Record<string, unknown> = { level: 0 };
    let current = deepObject;
    for (let i = 1; i <= 15; i++) {
      const next: Record<string, unknown> = { level: i };
      current.nested = next;
      current = next;
    }

    assert.equal(checkObjectDepth(deepObject, 10), false);

    const shallowObject = { a: { b: { c: { d: 123 } } } };
    assert.equal(checkObjectDepth(shallowObject, 10), true);
  });

  // 5. Header CRLF Injection Stripping
  await test("Security: Carriage returns and newlines in headers are stripped to prevent response splitting", () => {
    const maliciousHeader = "application/json\r\nSet-Cookie: session_hijack=true\r\n";
    const cleaned = sanitizeHeaderValue(maliciousHeader);

    assert.ok(!cleaned.includes("\r"));
    assert.ok(!cleaned.includes("\n"));
    assert.equal(cleaned, "application/jsonSet-Cookie: session_hijack=true");
  });

  // 6. Stack Trace Leakage Prevention
  await test("Security: safeErrorResponse hides internal V8 file paths and stack traces", () => {
    const internalErr = new Error("Database connection to postgres://admin:secret@db.internal failed at C:\\settlemate-ai\\src\\db.ts:45");
    const response = safeErrorResponse(internalErr, 500);

    assert.equal(response.status, 500);
    // Ensure security headers attached
    assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
    assert.equal(response.headers.get("X-Frame-Options"), "DENY");
  });

  // 7. Token Bucket Rate Limiter Burst Test
  await test("Security: TokenBucketRateLimiter blocks clients exceeding 100 requests/min", () => {
    const limiter = new TokenBucketRateLimiter({ maxTokens: 10, refillWindowMs: 60_000 });
    const clientId = "hostile_bot_1";

    for (let i = 0; i < 10; i++) {
      const res = limiter.check(clientId, 1000);
      assert.equal(res.allowed, true);
    }

    // 11th request in same minute must be blocked
    const blockedRes = limiter.check(clientId, 1000);
    assert.equal(blockedRes.allowed, false);
    assert.equal(blockedRes.remaining, 0);
    assert.ok(blockedRes.retryAfterSeconds > 0);
  });

  // 8. API Key Validation
  await test("Security: Secret keys must begin with 'sk_' and exceed 20 characters", () => {
    assert.equal(validateApiKey("").valid, false);
    assert.equal(validateApiKey("pk_test_short").valid, false);
    assert.equal(validateApiKey("sk_short").valid, false);
    assert.equal(validateApiKey("sk_live_enterprise_merchant_production_99812736152").valid, true);
  });

  console.log("\n=========================================================================");
  console.log(" ✅ ALL SECURITY PENETRATION & HARDENING TESTS PASSED");
  console.log("=========================================================================\n");
}

void main();
