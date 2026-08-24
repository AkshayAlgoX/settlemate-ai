/*
 * SettleMate AI — AI Accounting Tracker Tests (Day 1 Pass)
 */

import assert from "node:assert/strict";
import { AIAccountingTracker } from "./accounting";

async function test(name: string, fn: () => Promise<void> | void) {
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
  console.log(" SETTLEMATE AI — AI INVOCATION ACCOUNTING & GATE TESTS");
  console.log("=========================================================================\n");

  const tracker = new AIAccountingTracker();

  await test("1. Clean Auto-Matched Path: 10,000 clean matches 100% bypass AI (0% AI Invocation)", () => {
    for (let i = 0; i < 10000; i++) {
      tracker.recordDecision({
        decision: "AUTO_MATCHED",
        riskLevel: "LOW",
        aiInvoked: false,
        routedToHuman: false,
      });
    }

    const m = tracker.getMetrics();
    assert.equal(m.totalProcessedCount, 10000);
    assert.equal(m.aiBypassedCount, 10000);
    assert.equal(m.aiInvokedCount, 0);
    assert.equal(m.aiInvocationRatePct, 0);
  });

  await test("2. Ambiguous Exceptions: 200 high-risk exceptions invoke AI Council", () => {
    for (let i = 0; i < 200; i++) {
      tracker.recordDecision({
        decision: "NEEDS_MANUAL_REVIEW",
        riskLevel: "HIGH",
        aiInvoked: true,
        aiLatencyMs: 12.5,
        routedToHuman: true,
      });
    }

    const m = tracker.getMetrics();
    assert.equal(m.totalProcessedCount, 10200);
    assert.equal(m.aiInvokedCount, 200);
    assert.equal(m.aiInvocationRatePct, 1.96); // ~1.96% invocation rate
    assert.equal(m.averageAiLatencyMs, 12.5);
    assert.equal(m.routedToHumanReviewCount, 200);
  });

    await test("3. Claim-Level Accounting: Tracks verified claims, disputes, and abstentions", () => {
    tracker.recordClaimsReceipt({
      receiptId: "rcpt_1",
      councilRunId: "ccl_1",
      exceptionId: "exc_1",
      totalClaimsCount: 10,
      verifiedClaimsCount: 8,
      disputedClaimsCount: 2,
      unsupportedClaimsCount: 0,
      insufficientEvidenceCount: 0,
      abstain: false,
      claims: [],
      canonicalHash: "hash_1",
      policyVersion: "1",
      engineVersion: "1.0.0",
      timestamp: new Date(),
    }, true);

    const m = tracker.getMetrics();
    assert.equal(m.totalClaimsCount, 10);
    assert.equal(m.verifiedClaimsCount, 8);
    assert.equal(m.disputedClaimsCount, 2);
    assert.equal(m.claimVerificationRatePct, 80);
    assert.equal(m.skepticInvocationRatePct, 0.5); // 1 skeptic invocation out of 200 AI runs = 0.5%
  });

  console.log("\naccounting: ALL 3 AI ACCOUNTING TESTS PASSED\n");
}

void runTests();
