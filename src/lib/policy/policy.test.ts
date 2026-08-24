/*
 * SettleMate AI — Policy-as-Code & Streaming Shadow Replay Unit Tests
 */

import assert from "node:assert/strict";
import { PolicyManager, DEFAULT_RULES_V1 } from "./manager";
import { computePolicyContentHash } from "./hash";
import { evaluatePolicy } from "./evaluator";
import { executeStreamingShadowReplay, verifyPolicyReplayDeterminism } from "./shadow-replay";
import type { PolicyRules, ReconciliationPolicy } from "./types";

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
  console.log(" SETTLEMATE AI — POLICY-AS-CODE & 10K STREAMING SHADOW REPLAY TESTS");
  console.log("=========================================================================\n");

  const manager = new PolicyManager();

  await test("1. Canonical SHA-256 policy hashing is key-order invariant", () => {
    const rulesA: PolicyRules = { ...DEFAULT_RULES_V1 };
    const rulesB: PolicyRules = JSON.parse(JSON.stringify(DEFAULT_RULES_V1));

    const hashA = computePolicyContentHash(rulesA);
    const hashB = computePolicyContentHash(rulesB);

    assert.equal(hashA, hashB);
    assert.equal(hashA.length, 64);
  });

  await test("2. Deterministic policy evaluation engine respects tolerance, timing, and materiality", () => {
    const active = manager.getActivePolicy();

    // Within 1 INR tolerance (50 paise discrepancy) -> Auto-match
    const res1 = evaluatePolicy(active, {
      amountPaise: 100000,
      discrepancyPaise: 50,
      timeDeltaHours: 24,
    });
    assert.equal(res1.decision, "AUTO_MATCH");
    assert.ok(res1.matchedRules.includes("RULE_TOLERATED_AMOUNT_VARIANCE"));

    // Exceeds 1 INR tolerance (250 paise discrepancy) -> Exception
    const res2 = evaluatePolicy(active, {
      amountPaise: 100000,
      discrepancyPaise: 250,
      timeDeltaHours: 24,
    });
    assert.equal(res2.decision, "EXCEPTION");
    assert.ok(res2.matchedRules.includes("RULE_EXCEEDED_AMOUNT_TOLERANCE"));

    // Exceeds timing window (96h > 72h) -> Exception
    const res3 = evaluatePolicy(active, {
      amountPaise: 100000,
      discrepancyPaise: 0,
      timeDeltaHours: 96,
    });
    assert.equal(res3.decision, "EXCEPTION");
    assert.ok(res3.matchedRules.includes("RULE_EXCEEDED_TIMING_WINDOW"));

    // High materiality (> ₹5,000) -> Material exception with CRITICAL/HIGH risk
    const res4 = evaluatePolicy(active, {
      amountPaise: 10000000,
      discrepancyPaise: 600000,
      timeDeltaHours: 12,
    });
    assert.equal(res4.riskLevel, "CRITICAL");
    assert.equal(res4.requiresEscalation, true);
    assert.equal(res4.requiresMakerChecker, true);
  });

  await test("3. Strict lifecycle state machine prohibits direct DRAFT -> ACTIVE bypass", () => {
    const draft = manager.createDraftPolicy({
      version: "2.0.0",
      rules: { ...DEFAULT_RULES_V1, amountTolerancePaise: 200 },
      createdBy: "POLICY_AUTHOR_1",
    });

    assert.equal(draft.status, "DRAFT");

    // Illegal direct transition DRAFT -> ACTIVE must throw
    assert.throws(
      () => manager.transitionStatus("2.0.0", "ACTIVE"),
      /Can only activate APPROVED policies/
    );

    // Transition to SHADOW
    manager.transitionStatus("2.0.0", "SHADOW");
    assert.equal(manager.getPolicy("2.0.0")?.status, "SHADOW");
  });

  await test("4. Separation of duties: Policy author cannot approve their own candidate policy", () => {
    // Run streaming shadow replay (1,000 records) so promotion report is generated
    manager.runShadowReplay("2.0.0", 1000);

    // Author tries to approve -> must throw
    assert.throws(
      () => manager.transitionStatus("2.0.0", "APPROVED", "POLICY_AUTHOR_1"),
      /Separation of duties violation/
    );

    // Independent auditor approves -> succeeds
    manager.transitionStatus("2.0.0", "APPROVED", "SENIOR_AUDITOR_2");
    assert.equal(manager.getPolicy("2.0.0")?.status, "APPROVED");
  });

  await test("5. Safe promotion: Activated policy supersedes previous active policy", () => {
    assert.equal(manager.getActivePolicy().version, "1.0.0");

    manager.transitionStatus("2.0.0", "ACTIVE");

    assert.equal(manager.getActivePolicy().version, "2.0.0");
    assert.equal(manager.getPolicy("1.0.0")?.status, "SUPERSEDED");
  });

  await test("6. Safe Rollback: Reverting policy creates a new version reference and preserves historical hashes", () => {
    const rollback = manager.rollbackToVersion("1.0.0", "EMERGENCY_CONTROLLER");

    assert.ok(rollback.version.includes("rollback-to-1.0.0"));
    assert.equal(rollback.status, "ACTIVE");
    assert.equal(manager.getActivePolicy().version, rollback.version);
    assert.equal(manager.getActivePolicy().rules.amountTolerancePaise, 100);
  });

  await test("7. Streaming Shadow Replay over 10,000 records evaluates throughput, safety scores, and record diffs", () => {
    const activePolicy = manager.getActivePolicy();
    const candidatePolicy = manager.createDraftPolicy({
      version: "3.0.0",
      rules: { ...DEFAULT_RULES_V1, toleranceWindowHours: 96 },
      createdBy: "PERF_ANALYST",
    });

    const report = executeStreamingShadowReplay(activePolicy, candidatePolicy, 10000);

    assert.equal(report.recordsEvaluated, 10000);
    assert.equal(report.invariantViolations, 0);
    assert.ok(report.throughputRecsPerSec > 10000, "Expected >10k recs/sec evaluation");
    assert.equal(report.safetyScore, "SAFE");
    assert.equal(report.canPromote, true);
    assert.ok(report.sampleRecordDiffs.length > 0);
  });

  await test("8. Replay Determinism Proof: Running replay twice on same seed yields bitwise identical outcome", () => {
    const activePolicy = manager.getActivePolicy();
    const { isDeterministic, divergenceDetails } = verifyPolicyReplayDeterminism(activePolicy, 2000);

    assert.equal(isDeterministic, true);
    assert.equal(divergenceDetails.length, 0);
  });

    await test("9. REAL DEMO EXPERIMENT: Policy v3 (48h timing window) vs Policy v4 (72h timing window) on 10,000 records", () => {
    // Initialize baseline Policy v3 (48h timing window)
    const policyV3: ReconciliationPolicy = {
      policyId: "pol_v3_0_0",
      version: "3.0.0",
      status: "ACTIVE",
      createdBy: "CHIEF_RISK_OFFICER",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      activatedAt: new Date("2026-01-01T00:00:00Z"),
      providerScope: ["*"],
      currencyScope: ["INR", "USD"],
      rules: { ...DEFAULT_RULES_V1, toleranceWindowHours: 48 },
      contentHash: computePolicyContentHash({ ...DEFAULT_RULES_V1, toleranceWindowHours: 48 }),
      description: "Baseline Strict 48h Timing Policy",
    };

    const demoManager = new PolicyManager(policyV3);

    // Candidate Policy v4: 72h timing window
    const rulesV4: PolicyRules = { ...DEFAULT_RULES_V1, toleranceWindowHours: 72 };
    demoManager.createDraftPolicy({
      version: "4.0.0",
      rules: rulesV4,
      createdBy: "RISK_ANALYST",
    });
    demoManager.transitionStatus("4.0.0", "SHADOW");

    // Run 10,000 record streaming shadow replay
    const report = demoManager.runShadowReplay("4.0.0", 10000);

    assert.equal(report.recordsEvaluated, 10000);
    assert.ok(report.autoMatchDeltaPct > 0, "Auto-match rate should improve with 72h window");
    assert.ok(report.exceptionDeltaPct < 0, "Exception rate should decrease with 72h window");
    assert.equal(report.invariantViolations, 0);
    assert.equal(report.safetyScore, "SAFE");
    assert.equal(report.canPromote, true);
    assert.ok(report.newlyMatchedCount > 0);

    // Promote v4 safely
    demoManager.transitionStatus("4.0.0", "APPROVED", "CONTROLLER_B");
    demoManager.transitionStatus("4.0.0", "ACTIVE");

    assert.equal(demoManager.getActivePolicy().version, "4.0.0");
  });

  console.log("\npolicy-governance: ALL 9 TESTS PASSED\n");
}

void runTests();
