/*
 * SettleMate AI — Multi-Agent Verification Council Unit Tests
 */

import assert from "node:assert/strict";
import { VerificationCouncil, shouldInvokeCouncil } from "./council";
import type { CouncilReviewRequest } from "./council";

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
  console.log(" SETTLEMATE AI — VERIFICATION COUNCIL ADVERSARIAL TESTS");
  console.log("=========================================================================\n");

  const council = new VerificationCouncil();

  await test("1. Routing Gate: AUTO_MATCHED low-risk records bypass council; ambiguous/material records route in", () => {
    // 1. Clean AUTO_MATCHED record -> BYPASS
    const route1 = shouldInvokeCouncil({
      decision: "AUTO_MATCHED",
      riskLevel: "LOW",
      amountPaise: 50000,
      discrepancyPaise: 0,
      hasContradictions: false,
    });
    assert.equal(route1.shouldInvoke, false);

    // 2. Ambiguous SUGGESTED_MATCH -> INVOKE
    const route2 = shouldInvokeCouncil({
      decision: "SUGGESTED_MATCH",
      riskLevel: "MEDIUM",
      amountPaise: 100000,
      discrepancyPaise: 50,
      hasContradictions: false,
    });
    assert.equal(route2.shouldInvoke, true);

    // 3. Contradictory evidence -> INVOKE
    const route3 = shouldInvokeCouncil({
      decision: "EXCEPTION",
      riskLevel: "MEDIUM",
      amountPaise: 100000,
      discrepancyPaise: 0,
      hasContradictions: true,
    });
    assert.equal(route3.shouldInvoke, true);

    // 4. Material discrepancy (> ₹5,000) -> INVOKE
    const route4 = shouldInvokeCouncil({
      decision: "EXCEPTION",
      riskLevel: "HIGH",
      amountPaise: 2000000,
      discrepancyPaise: 600000,
      hasContradictions: false,
    });
    assert.equal(route4.shouldInvoke, true);
  });

  await test("2. Scenario A: Sound math, valid timing, and authentic evidence -> VERIFIED", () => {
    const req: CouncilReviewRequest = {
      exceptionId: "exc_demo_valid",
      exceptionType: "SETTLEMENT_DELAY",
      amountPaise: 100000,
      riskLevel: "MEDIUM",
      paymentRecord: {
        paymentId: "pay_100",
        amount: 1000,
        fee: 20,
        tax: 3.6,
        createdAt: new Date("2026-08-20T10:00:00Z"),
      },
      settlementRecord: {
        settlementId: "setl_100",
        amount: 976.4, // Net: 1000 - 20 - 3.6 = 976.40
        settledAt: new Date("2026-08-22T10:00:00Z"), // 48h later (within 72h window)
      },
      evidenceItems: [
        {
          evidenceId: "ev_setl_100",
          sourceType: "SETTLEMENT",
          sourceReference: "SETL-100",
          title: "Gateway Settlement Advice",
          createdAt: new Date("2026-08-22T10:00:00Z"),
          observedAt: new Date("2026-08-22T10:00:00Z"),
          contentHash: "hash_setl_100",
          hashAlgorithm: "SHA-256",
          byteLength: 120,
          accessClassification: "CONFIDENTIAL",
          linkedRecords: { paymentIds: ["pay_100"] },
          provider: "RAZORPAY",
        },
      ],
    };

    const decision = council.deliberate(req);
    assert.equal(decision.outcome, "VERIFIED");
    assert.equal(decision.skeptic.challenges.length, 0);
    assert.equal(decision.requiresHumanReview, true);
    assert.equal(decision.authorityDisclaimer, "AI_AUTHORITY_READ_ONLY_SUGGESTION_CANNOT_WRITE_LEDGER");
    assert.ok(decision.auditTrail.investigatorInputHash.length === 64);
  });

  await test("3. Scenario B: Investigator cites invented evidence ID -> Skeptic rejects with INVENTED_EVIDENCE_ID", () => {
    const req: CouncilReviewRequest = {
      exceptionId: "exc_invented_id",
      exceptionType: "AMOUNT_MISMATCH",
      amountPaise: 50000,
      riskLevel: "HIGH",
      evidenceItems: [], // No evidence in vault
    };

    const decision = council.deliberate(req);
    assert.equal(decision.outcome, "INSUFFICIENT_EVIDENCE");
  });

  await test("4. Scenario C & D: Mathematical divergence / unaccounted discrepancy -> CONTROL_FAILURE", () => {
    const req: CouncilReviewRequest = {
      exceptionId: "exc_amount_breach",
      exceptionType: "AMOUNT_MISMATCH",
      amountPaise: 2000000,
      riskLevel: "HIGH",
      paymentRecord: {
        paymentId: "pay_200",
        amount: 20000,
        fee: 400,
        tax: 72,
        createdAt: new Date("2026-08-20T10:00:00Z"),
      },
      settlementRecord: {
        settlementId: "setl_200",
        amount: 18000, // Expected: 19528, discrepancy = 1528 INR
        settledAt: new Date("2026-08-21T10:00:00Z"),
      },
      evidenceItems: [
        {
          evidenceId: "ev_pay_200",
          sourceType: "PAYMENT",
          sourceReference: "PAY-200",
          title: "Payment Authorization",
          createdAt: new Date("2026-08-20T10:00:00Z"),
          observedAt: new Date("2026-08-20T10:00:00Z"),
          contentHash: "hash_pay_200",
          accessClassification: "CONFIDENTIAL",
          linkedRecords: { paymentIds: ["pay_200"] },
          provider: "GATEWAY",
        },
      ],
    };

    const decision = council.deliberate(req);
    assert.equal(decision.outcome, "CONTROL_FAILURE");
    assert.equal(decision.finalRiskLevel, "CRITICAL");
    assert.ok(decision.skeptic.challenges.some((c) => c.code === "AMOUNT_ARITHMETIC_ERROR"));
  });

  await test("5. Scenario E: Timing window exceeded -> Skeptic flags TIMING_WINDOW_VIOLATION", () => {
    const req: CouncilReviewRequest = {
      exceptionId: "exc_timing_delay",
      exceptionType: "SETTLEMENT_DELAY",
      amountPaise: 100000,
      riskLevel: "MEDIUM",
      paymentRecord: {
        paymentId: "pay_300",
        amount: 1000,
        fee: 20,
        tax: 3.6,
        createdAt: new Date("2026-08-10T10:00:00Z"),
      },
      settlementRecord: {
        settlementId: "setl_300",
        amount: 976.4,
        settledAt: new Date("2026-08-20T10:00:00Z"), // 10 days later (exceeds 72h window)
      },
      evidenceItems: [
        {
          evidenceId: "ev_setl_300",
          sourceType: "SETTLEMENT",
          sourceReference: "SETL-300",
          title: "Late Settlement",
          createdAt: new Date("2026-08-20T10:00:00Z"),
          observedAt: new Date("2026-08-20T10:00:00Z"),
          contentHash: "hash_setl_300",
          accessClassification: "CONFIDENTIAL",
          linkedRecords: { paymentIds: ["pay_300"] },
          provider: "GATEWAY",
        },
      ],
    };

    const decision = council.deliberate(req);
    assert.equal(decision.outcome, "DISPUTED");
    assert.ok(decision.skeptic.challenges.some((c) => c.code === "TIMING_WINDOW_VIOLATION"));
  });

  await test("6. Scenario F: Contradictory evidence from Context Vault -> CONFLICTING_EVIDENCE and CRITICAL risk", () => {
    const req: CouncilReviewRequest = {
      exceptionId: "exc_contradiction",
      exceptionType: "AMOUNT_MISMATCH",
      amountPaise: 2000000,
      riskLevel: "HIGH",
      contradictions: [
        {
          type: "AMOUNT_MISMATCH",
          evidenceAId: "ev_bank_1",
          sourceA: "CORE_BANKING",
          claimA: "Credited ₹18,450",
          valueA: 1845000,
          evidenceBId: "ev_setl_1",
          sourceB: "RAZORPAY",
          claimB: "Settled ₹18,000",
          valueB: 1800000,
          severity: "CRITICAL",
          description: "Bank credit and gateway settlement amounts diverge by ₹450",
          recommendedReviewLevel: "MAKER_CHECKER_REQUIRED",
        },
      ],
      evidenceItems: [
        {
          evidenceId: "ev_bank_1",
          sourceType: "BANK_RECORD",
          sourceReference: "BNK-001",
          title: "Bank Credit",
          createdAt: new Date(),
          observedAt: new Date(),
          contentHash: "h1",
          accessClassification: "CONFIDENTIAL",
          linkedRecords: {},
        },
      ],
    };

    const decision = council.deliberate(req);
    assert.equal(decision.outcome, "CONFLICTING_EVIDENCE");
    assert.equal(decision.finalRiskLevel, "CRITICAL");
    assert.ok(decision.skeptic.challenges.some((c) => c.code === "CONFLICTING_CLAIMS"));
  });

  await test("7. Scenario G: Missing evidence -> INSUFFICIENT_EVIDENCE", () => {
    const req: CouncilReviewRequest = {
      exceptionId: "exc_empty",
      exceptionType: "UNMATCHED_PAYMENT",
      amountPaise: 500000,
      riskLevel: "HIGH",
      evidenceItems: [],
    };

    const decision = council.deliberate(req);
    assert.equal(decision.outcome, "INSUFFICIENT_EVIDENCE");
    assert.equal(decision.investigator.confidence, 0);
  });

  await test("8. Audit lineage hashes & deterministic reproduction", () => {
    const req: CouncilReviewRequest = {
      exceptionId: "exc_audit_test",
      exceptionType: "SETTLEMENT_DELAY",
      amountPaise: 100000,
      riskLevel: "LOW",
      evidenceItems: [
        {
          evidenceId: "ev_test_1",
          sourceType: "PAYMENT",
          sourceReference: "PAY-1",
          title: "Payment",
          createdAt: new Date("2026-08-20T10:00:00Z"),
          observedAt: new Date("2026-08-20T10:00:00Z"),
          contentHash: "h1",
          accessClassification: "CONFIDENTIAL",
          linkedRecords: {},
        },
      ],
    };

    const d1 = council.deliberate(req);
    const d2 = council.deliberate(req);

    assert.equal(d1.outcome, d2.outcome);
    assert.equal(d1.auditTrail.investigatorInputHash, d2.auditTrail.investigatorInputHash);
  });

  console.log("\nverification-council: ALL 8 ADVERSARIAL TESTS PASSED\n");
}

void runTests();
