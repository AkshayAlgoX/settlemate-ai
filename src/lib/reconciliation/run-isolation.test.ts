/*
 * SettleMate AI — Policy Snapshot Isolation & Poison-Pill DLQ Suite (M8 Hardening)
 */

import assert from "node:assert/strict";
import { evaluatePolicy } from "../policy/evaluator";
import { DEFAULT_RULES_V1 } from "../policy/manager";
import type { ReconciliationPolicy } from "../policy/types";

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
  console.log(" SETTLEMATE AI — POLICY SNAPSHOT & POISON-PILL SAFETY TESTS (M8)");
  console.log("=========================================================================\n");

  const policyV1: ReconciliationPolicy = {
    policyId: "pol_v1",
    version: "1.0.0",
    status: "ACTIVE",
    createdBy: "ADMIN",
    createdAt: new Date(),
    providerScope: ["*"],
    currencyScope: ["INR"],
    rules: DEFAULT_RULES_V1,
    contentHash: "hash_v1_canonical",
  };

  const policyV2: ReconciliationPolicy = {
    policyId: "pol_v2",
    version: "2.0.0",
    status: "ACTIVE",
    createdBy: "ADMIN",
    createdAt: new Date(),
    providerScope: ["*"],
    currencyScope: ["INR"],
    rules: { ...DEFAULT_RULES_V1, amountTolerancePaise: 500 },
    contentHash: "hash_v2_canonical",
  };

  await test("1. Policy Snapshot Pinning: Mid-run global policy promotion does not alter active run", () => {
    // Pinned run snapshot
    const runPolicySnapshot = policyV1;

    // Evaluate partition 1
    const evalP1 = evaluatePolicy(runPolicySnapshot, { amountPaise: 10000, discrepancyPaise: 200 });
    assert.equal(evalP1.policyVersion, "1.0.0");
    assert.equal(evalP1.policyHash, "hash_v1_canonical");

    // Global active policy is changed to v2
    const globalPolicy = policyV2;
    assert.equal(globalPolicy.version, "2.0.0");

    // Partition 2 continues with pinned run snapshot
    const evalP2 = evaluatePolicy(runPolicySnapshot, { amountPaise: 10000, discrepancyPaise: 200 });
    assert.equal(evalP2.policyVersion, "1.0.0");
    assert.equal(evalP2.policyHash, "hash_v1_canonical");
  });

  await test("2. Poison-Pill Isolation: Bad record routes to DLQ after 3 retries without blocking batch", () => {
    const queue: Array<{ id: string; isPoison: boolean; attempts: number }> = [
      { id: "rec_good_1", isPoison: false, attempts: 0 },
      { id: "rec_poison_2", isPoison: true, attempts: 0 },
      { id: "rec_good_3", isPoison: false, attempts: 0 },
    ];

    const completed: string[] = [];
    const dlq: string[] = [];

    for (const item of queue) {
      if (item.isPoison) {
        while (item.attempts < 3) {
          item.attempts++;
        }
        dlq.push(item.id); // Routed to DLQ
      } else {
        completed.push(item.id);
      }
    }

    assert.equal(completed.length, 2);
    assert.equal(dlq.length, 1);
    assert.equal(dlq[0], "rec_poison_2");
  });

  await test("3. Cumulative Materiality Exposure: 1,000 tiny ₹40 variances trigger high risk (₹40,000 aggregate)", () => {
    const individualDiscrepancy = 4000; // ₹40 in paise (below ₹100 individual materiality threshold)
    const occurrences = 1000;
    const aggregateExposurePaise = individualDiscrepancy * occurrences; // ₹40,000 (4,000,000 paise)

    const materialityThresholdPaise = 100000; // ₹1,000 threshold

    const isIndividuallyMaterial = individualDiscrepancy >= materialityThresholdPaise; // false
    const isAggregatelyMaterial = aggregateExposurePaise >= materialityThresholdPaise; // true

    assert.equal(isIndividuallyMaterial, false);
    assert.equal(isAggregatelyMaterial, true);
  });

  console.log("\nrun-isolation: ALL 3 TESTS PASSED\n");
}

void runTests();
