/*
 * SettleMate AI — Rate Limiter & Auth Security Tests
 */

import assert from "node:assert/strict";
import { RateLimiter } from "./rate-limiter";

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
  console.log(" SETTLEMATE AI — RATE LIMITER & AUTH SECURITY TESTS");
  console.log("=========================================================================");

  await test("RateLimiter allows requests up to maxRequests and blocks subsequent ones", () => {
    const rl = new RateLimiter({ windowMs: 1000, maxRequests: 3 });
    const r1 = rl.check("user_1");
    assert.equal(r1.allowed, true);
    assert.equal(r1.remaining, 2);

    const r2 = rl.check("user_1");
    assert.equal(r2.allowed, true);
    assert.equal(r2.remaining, 1);

    const r3 = rl.check("user_1");
    assert.equal(r3.allowed, true);
    assert.equal(r3.remaining, 0);

    const r4 = rl.check("user_1");
    assert.equal(r4.allowed, false);
    assert.equal(r4.remaining, 0);
  });

  await test("RateLimiter automatically resets when window expires", () => {
    const rl = new RateLimiter({ windowMs: 500, maxRequests: 2 });
    rl.check("user_2", 1000);
    rl.check("user_2", 1000);
    const blocked = rl.check("user_2", 1000);
    assert.equal(blocked.allowed, false);

    // After 600ms (window elapsed)
    const fresh = rl.check("user_2", 1600);
    assert.equal(fresh.allowed, true);
    assert.equal(fresh.remaining, 1);
  });

  console.log("\nrate-limiter: ALL 2 PASSED\n");
}

void main();
