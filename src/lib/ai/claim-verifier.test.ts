/*
 * SettleMate AI — Claim-Level AI Verification & Fabrication Attack Tests (Day 2–3)
 */

import assert from "node:assert/strict";
import { DeterministicClaimValidator } from "./claim-validator";
import { VerificationCouncil, type CouncilReviewRequest } from "./council";
import type { AIClaim } from "./claim-types";
import type { EvidenceItem } from "../evidence/types";

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
  console.log(" SETTLEMATE AI — CLAIM-LEVEL VERIFICATION & FABRICATION ATTACK TESTS");
  console.log("=========================================================================\n");

  const validator = new DeterministicClaimValidator();
  const council = new VerificationCouncil();
  const baseDate = new Date("2026-08-20T10:00:00Z");

  const baseEvidence: EvidenceItem[] = [
    {
      evidenceId: "ev_ref_8821",
      sourceType: "REFUND",
      sourceReference: "REFUND-8821",
      title: "Processed Refund #8821",
      contentHash: "hash_ref_8821",
      accessClassification: "CONFIDENTIAL",
      linkedRecords: { paymentIds: ["pay_1001"], refundIds: ["ref_8821"] },
      provider: "GATEWAY",
      structuredData: { paymentId: "pay_1001", refundAmountPaise: 155000 },
      createdAt: baseDate,
    },
    {
      evidenceId: "ev_setl_882",
      sourceType: "SETTLEMENT",
      sourceReference: "Settlement S882",
      title: "Bank Settlement S882",
      contentHash: "hash_setl_882",
      accessClassification: "CONFIDENTIAL",
      linkedRecords: { paymentIds: ["pay_1001"], settlementIds: ["setl_1001"] },
      provider: "BANK",
      structuredData: { paymentId: "pay_1001", settlementAmountPaise: 1845000 },
      createdAt: baseDate,
    },
  ];

  const baseRequest: CouncilReviewRequest = {
    exceptionId: "exc_1001",
    exceptionType: "AMOUNT_MISMATCH",
    amountPaise: 2000000, // ₹20,000 gross
    discrepancyPaise: 155000, // ₹1,550 variance
    riskLevel: "HIGH",
    evidenceItems: baseEvidence,
    paymentRecord: {
      paymentId: "pay_1001",
      amount: 2000000,
      fee: 0,
      tax: 0,
      createdAt: baseDate,
    },
    settlementRecord: {
      settlementId: "setl_1001",
      amount: 1845000, // ₹18,450 net
      fee: 0,
      tax: 0,
      settledAt: new Date(baseDate.getTime() + 3600_000 * 12),
      utr: "UTR_VALID_882",
    },
    refundRecord: {
      refundId: "ref_8821",
      amount: 155000, // ₹1,550 refund
      status: "processed",
      createdAt: baseDate,
    },
  };

  await test("1. Valid Claim: ₹1,550 refund explains variance -> VERIFIED (100% checks pass)", () => {
    const claim: AIClaim = {
      claimId: "C17",
      type: "FINANCIAL_EXPLANATION",
      statement: "₹1,550 refund explains the observed variance.",
      evidenceIds: ["ev_ref_8821", "ev_setl_882"],
      assertedValues: [
        { key: "refundAmount", value: 155000, expectedPaise: 155000, observedPaise: 155000 },
      ],
      confidence: 96,
      uncertainties: [],
    };

    const res = validator.validateClaim(claim, baseRequest);
    assert.equal(res.status, "VERIFIED");
    assert.equal(res.checks.every((c) => c.passed), true);
    assert.equal(res.disputeReasons.length, 0);
  });

  await test("2. Deliberate Fabrication Attack: Investigator claims ₹1,550 explains variance, but evidence is ₹1,400 -> DISPUTED", () => {
    const tamperedRequest: CouncilReviewRequest = {
      ...baseRequest,
      refundRecord: {
        refundId: "ref_8821",
        amount: 140000, // ₹1,400
        status: "processed",
        createdAt: baseDate,
      },
    };

    const claim: AIClaim = {
      claimId: "C17",
      type: "FINANCIAL_EXPLANATION",
      statement: "₹1,550 refund explains the observed variance.",
      evidenceIds: ["ev_ref_8821", "ev_setl_882"],
      assertedValues: [
        { key: "refundAmount", value: 155000, expectedPaise: 155000, observedPaise: 140000 }, // Mismatch!
      ],
      confidence: 96,
      uncertainties: [],
    };

    const res = validator.validateClaim(claim, tamperedRequest);
    assert.equal(res.status, "DISPUTED");
    assert.ok(res.disputeReasons.some((r) => r.includes("AMOUNT_MISMATCH") || r.includes("ARITHMETIC_MISMATCH")));

    // Council deliberation routes to Skeptic challenge
    const councilDecision = council.deliberate(tamperedRequest);
    assert.equal(councilDecision.outcome, "DISPUTED");
    assert.equal(councilDecision.skeptic.verdict, "DISPUTED");
    assert.ok(councilDecision.skeptic.challenges.length > 0);
  });

  await test("3. Fake Evidence ID Attack: Non-existent evidence ID rejected as INVENTED_EVIDENCE_ID", () => {
    const fakeClaim: AIClaim = {
      claimId: "C18",
      type: "IDENTITY",
      statement: "Transaction verified by bank receipt REC_INVENTED_999",
      evidenceIds: ["ev_non_existent_999"],
      assertedValues: [],
      confidence: 88,
      uncertainties: [],
    };

    const res = validator.validateClaim(fakeClaim, baseRequest);
    assert.equal(res.status, "DISPUTED");
    assert.ok(res.disputeReasons.some((r) => r.includes("INVENTED_EVIDENCE_ID")));
  });

  await test("4. Unauthorized Evidence Attack: Highly restricted evidence rejected without clearance", () => {
    const unauthEvidence: EvidenceItem[] = [
      {
        ...baseEvidence[0],
        evidenceId: "ev_restricted_1",
        accessClassification: "HIGHLY_RESTRICTED",
      },
    ];
    const unauthRequest: CouncilReviewRequest = { ...baseRequest, evidenceItems: unauthEvidence };

    const claim: AIClaim = {
      claimId: "C19",
      type: "STATUS",
      statement: "Verified by restricted document",
      evidenceIds: ["ev_restricted_1"],
      assertedValues: [],
      confidence: 90,
      uncertainties: [],
    };

    const res = validator.validateClaim(claim, unauthRequest);
    assert.equal(res.status, "DISPUTED");
    assert.ok(res.disputeReasons.some((r) => r.includes("UNAUTHORIZED_EVIDENCE")));
  });

  await test("5. Timing Violation Attack: Delayed settlement outside policy window rejected", () => {
    const delayedRequest: CouncilReviewRequest = {
      ...baseRequest,
      settlementRecord: {
        settlementId: "setl_1001",
        amount: 1845000,
        fee: 0,
        tax: 0,
        settledAt: new Date(baseDate.getTime() + 3600_000 * 96), // 96 hours later (>48h policy)
        utr: "UTR_VALID_882",
      },
    };

    const claim: AIClaim = {
      claimId: "C20",
      type: "TIMING",
      statement: "Settlement timing within policy window",
      evidenceIds: ["ev_setl_882"],
      assertedValues: [],
      confidence: 85,
      uncertainties: [],
    };

    const res = validator.validateClaim(claim, delayedRequest);
    assert.equal(res.status, "DISPUTED");
    assert.ok(res.disputeReasons.some((r) => r.includes("TIMING_WINDOW_VIOLATION")));
  });

  await test("6. AI Abstention: Zero evidence items outputs INSUFFICIENT_EVIDENCE (abstain = true)", () => {
    const noEvidenceRequest: CouncilReviewRequest = {
      ...baseRequest,
      evidenceItems: [],
    };

    const councilDecision = council.deliberate(noEvidenceRequest);
    assert.equal(councilDecision.outcome, "INSUFFICIENT_EVIDENCE");
    assert.equal(councilDecision.skeptic.verdict, "INSUFFICIENT_EVIDENCE");
    assert.equal(councilDecision.claimReceipt.abstain, true);
    assert.equal(councilDecision.requiresHumanReview, true);
  });

  await test("7. Property-Style Claim Fuzzing: 100 randomized claim assertions evaluate deterministically", () => {
    for (let i = 0; i < 100; i++) {
      const isCorrupt = i % 2 === 0;
      const testAmount = isCorrupt ? 999999 : 155000;
      const testClaim: AIClaim = {
        claimId: `C_FUZZ_${i}`,
        type: "AMOUNT",
        statement: "Automated fuzz claim",
        evidenceIds: isCorrupt ? ["ev_fake_id"] : ["ev_ref_8821"],
        assertedValues: [
          { key: "amount", value: testAmount, expectedPaise: 155000, observedPaise: testAmount },
        ],
        confidence: 90,
        uncertainties: [],
      };

      const res = validator.validateClaim(testClaim, baseRequest);
      if (isCorrupt) {
        assert.notEqual(res.status, "VERIFIED");
      } else {
        assert.equal(res.status, "VERIFIED");
      }
    }
  });

  console.log("\nclaim-verifier: ALL 7 CLAIM VERIFICATION TESTS PASSED\n");
}

void runTests();
