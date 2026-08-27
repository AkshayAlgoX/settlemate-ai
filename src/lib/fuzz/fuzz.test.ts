/*
 * SettleMate AI — Fuzz Regression & Robustness Unit Tests
 */

import assert from "node:assert/strict";
import { runFuzzCampaign } from "./fuzzer";
import { canonicalizeJson } from "../ledger/decision-receipt";
import { DeterministicClaimValidator } from "../ai/claim-validator";

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
  console.log(" 🧪 SETTLEMATE AI — FUZZ REGRESSION & ROBUSTNESS SUITE");
  console.log("=========================================================================\n");

  await test("Fuzz Suite: 5,000 randomised extreme batches run with zero crashes", async () => {
    const stats = await runFuzzCampaign(5000);
    assert.equal(stats.crashes, 0, `Expected 0 crashes, got ${stats.crashes}`);
    assert.equal(stats.memoryLeaks, 0, "Memory leak detected during fuzz run");
    assert.equal(stats.matcherFuzzed, 5000);
    assert.equal(stats.receiptFuzzed, 5000);
    assert.equal(stats.claimsFuzzed, 5000);
  });

  await test("Circular Reference Defense: canonicalizeJson handles cyclic objects safely", () => {
    const cyclicObj: Record<string, unknown> = { name: "test_cyclic", val: 123 };
    cyclicObj.self = cyclicObj;

    const result = canonicalizeJson(cyclicObj);
    assert.ok(result.includes('"[Circular]"'));
  });

  await test("Edge Type Safety: canonicalizeJson handles undefined, BigInt, and NaN", () => {
    const edgeObj = {
      definedVal: "hello",
      undefinedVal: undefined,
      nanVal: NaN,
      bigintVal: BigInt(9007199254740991),
    };

    const result = canonicalizeJson(edgeObj);
    assert.ok(!result.includes("undefined"));
    assert.ok(result.includes('"nanVal":null'));
    assert.ok(result.includes('"bigintVal":9007199254740991'));
  });

  await test("Adversarial Claim Defense: Malformed claim with null/missing arrays safely evaluated", () => {
    const validator = new DeterministicClaimValidator();
    const malformedClaim = {
      claimId: "MALFORMED_01",
      statement: null,
      evidenceIds: null,
      assertedValues: undefined,
    } as unknown as Parameters<typeof validator.validateClaim>[0];

    const outcome = validator.validateClaim(malformedClaim, {
      exceptionId: "EXP_01",
      exceptionType: "UNKNOWN",
      amountPaise: 1000,
      riskLevel: "LOW",
      evidenceItems: [],
    });

    assert.equal(outcome.claimId, "MALFORMED_01");
    assert.ok(outcome.status === "INSUFFICIENT_EVIDENCE" || outcome.status === "UNSUPPORTED" || outcome.status === "DISPUTED");
    assert.ok(outcome.receiptHash.length === 64);
  });

  console.log("\n=========================================================================");
  console.log(" ✅ ALL FUZZ REGRESSION TESTS PASSED");
  console.log("=========================================================================\n");
}

void main();
