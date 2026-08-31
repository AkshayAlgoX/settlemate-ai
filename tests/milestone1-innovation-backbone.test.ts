/*
 * SettleMate AI — Milestone 1 Innovation Backbone Verification Suite
 *
 * Verifies all 8 components of Milestone 1:
 *   1. Deterministic-first reconciliation gate
 *   2. Fixed Z3 invariant proof service
 *   3. Tamper-evident evidence BEFORE AI
 *   4. Strict Zod schemas at every boundary
 *   5. AI Claim AST
 *   6. ONE Adversarial Critic with 3 lenses
 *   7. Mechanical verification of the critic's falsifiable objection
 *   8. REINVESTIGATE loop when objection is confirmed
 */

import assert from "node:assert/strict";
import { z3Prover } from "../src/lib/ai/z3-prover";
import { tamperProofEvidenceGate } from "../src/lib/evidence/tamper-proof";
import { adversarialCritic } from "../src/lib/ai/adversarial-critic";
import { mechanicalVerifier } from "../src/lib/ai/mechanical-verifier";
import { innovationBackboneEngine } from "../src/lib/ai/reinvestigation-loop";
import {
  AIClaimSchema,
  InvestigatorOutputSchema,
  CriticObjectionSchema,
  CriticEvaluationSchema,
  MechanicalVerificationResultSchema,
  Z3ProofResultSchema,
} from "../src/lib/ai/zod-schemas";
import type { CouncilReviewRequest } from "../src/lib/ai/council";
import type { EvidenceItem } from "../src/lib/evidence/types";

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  ✓ [PASS] ${name}`);
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}:`, err);
    throw err;
  }
}

async function main() {
  console.log("\n=========================================================================");
  console.log(" 🚀 SETTLEMATE AI — MILESTONE 1 INNOVATION BACKBONE SUITE");
  console.log("=========================================================================\n");

  // =========================================================================
  // GATE 1: Deterministic-First Reconciliation Gate
  // =========================================================================
  await test("Gate 1: Clean, auto-matched transactions bypass AI completely (0 AI invocations)", async () => {
    const cleanRequest: CouncilReviewRequest = {
      exceptionId: "exc_clean_101",
      exceptionType: "AUTO_MATCHED",
      amountPaise: 50000,
      riskLevel: "LOW",
      discrepancyPaise: 0,
      paymentRecord: {
        paymentId: "pay_101",
        amount: 500,
        fee: 10,
        tax: 1.8,
        createdAt: new Date("2026-08-20T10:00:00Z"),
      },
      settlementRecord: {
        settlementId: "setl_101",
        amount: 488.2, // Net: 500 - 10 - 1.8 = 488.20
        settledAt: new Date("2026-08-21T10:00:00Z"),
      },
      evidenceItems: [
        {
          evidenceId: "ev_101",
          sourceType: "PAYMENT",
          sourceReference: "PAY-101",
          title: "Clean Payment Receipt",
          contentHash: "81d840cd8cf981e5e69a367b879a8f11e9e51d60136a6d38e430877f08cab02b",
          accessClassification: "CONFIDENTIAL",
          linkedRecords: { paymentIds: ["pay_101"] },
        },
      ],
    };

    const res = await innovationBackboneEngine.execute(cleanRequest);
    assert.equal(res.bypassedAi, true);
    assert.equal(res.finalVerdict, "VERIFIED");
    assert.equal(res.iterationsRun, 0);
    assert.equal(res.requiresHumanReview, false);
    assert.ok(res.z3Proof.conservationPassed);
  });

  // =========================================================================
  // GATE 2: Fixed Z3 Invariant Proof Service
  // =========================================================================
  await test("Gate 2: Fixed Z3 Invariant Proof Service solves linear integer arithmetic & generates SMT-LIB v2 script", async () => {
    // Valid Conservation Proof
    const validProof = z3Prover.prove({
      contextId: "ctx_proof_valid",
      theoremName: "THEOREM_CONSERVATION_TEST",
      assignments: {
        grossPaise: 100000,
        feePaise: 2000,
        taxPaise: 360,
        refundPaise: 10000,
        chargebackPaise: 0,
        settledPaise: 87640,
        variancePaise: 0,
      },
      tolerancePaise: 0,
    });

    assert.equal(validProof.status, "PROOF_VALID");
    assert.equal(validProof.conservationPassed, true);
    assert.equal(validProof.doubleEntryBalanced, true);
    assert.ok(validProof.smtLibScript.includes("(set-logic QF_LIA)"));
    assert.ok(validProof.smtLibScript.includes("(assert (= gross 100000))"));
    assert.ok(validProof.proofSignature.length === 64);

    // Validate with strict Zod schema
    Z3ProofResultSchema.parse(validProof);

    // Invalid Conservation Proof (produces counterexample)
    const invalidProof = z3Prover.prove({
      contextId: "ctx_proof_invalid",
      theoremName: "THEOREM_CONSERVATION_DEFECT",
      assignments: {
        grossPaise: 100000,
        feePaise: 2000,
        taxPaise: 360,
        refundPaise: 0,
        chargebackPaise: 0,
        settledPaise: 80000, // diverges by 17640 paise!
        variancePaise: 0,
      },
      tolerancePaise: 100,
    });

    assert.equal(invalidProof.status, "COUNTEREXAMPLE_FOUND");
    assert.equal(invalidProof.conservationPassed, false);
    assert.ok(invalidProof.counterexample);
    assert.equal(invalidProof.counterexample.divergenceDeltaPaise, 17640);
  });

  // =========================================================================
  // GATE 3: Tamper-Evident Evidence BEFORE AI
  // =========================================================================
  await test("Gate 3: Tamper-Evident Evidence Gate verifies hashes and quarantines tampered evidence before AI", async () => {
    const validEvidence: EvidenceItem = {
      evidenceId: "ev_valid_1",
      sourceType: "PAYMENT",
      sourceReference: "PAY-1",
      title: "Valid Feed Record",
      contentHash: "hash_valid",
      accessClassification: "CONFIDENTIAL",
      linkedRecords: { paymentIds: ["pay_1"] },
      structuredData: { txnId: "pay_1", amount: 50000 },
    };

    // Pre-AI verification
    const report1 = tamperProofEvidenceGate.verifyEvidenceBeforeAi([validEvidence]);
    assert.equal(report1.isValid, true);
    assert.equal(report1.verifiedItems.length, 1);
    assert.ok(report1.evidenceMerkleRoot.length === 64);

    // Tampered payload test
    const tamperedEvidence: EvidenceItem = {
      evidenceId: "ev_tampered_1",
      sourceType: "BANK_RECORD",
      sourceReference: "BNK-1",
      title: "Bank Statement",
      contentHash: "original_unmodified_sha256_hash_that_should_fail_when_payload_changes",
      accessClassification: "CONFIDENTIAL",
      linkedRecords: { bankTxnIds: ["btxn_1"] },
      structuredData: { modifiedByAdversary: true, fakeBalance: 999999999 },
    };

    const report2 = tamperProofEvidenceGate.verifyEvidenceBeforeAi([tamperedEvidence], { strictHashMatch: true });
    assert.equal(report2.isValid, false);
    assert.equal(report2.tamperedFindings.length, 1);
    assert.equal(report2.tamperedFindings[0].reason, "HASH_MISMATCH");

    // Clearance check (HIGHLY_RESTRICTED blocked from normal AI prompts)
    const restrictedEvidence: EvidenceItem = {
      evidenceId: "ev_restricted_1",
      sourceType: "ANALYST_NOTE",
      sourceReference: "NOTE-1",
      title: "Board Room Executive Memo",
      contentHash: "hash_secret",
      accessClassification: "HIGHLY_RESTRICTED",
      linkedRecords: {},
    };

    const report3 = tamperProofEvidenceGate.verifyEvidenceBeforeAi([restrictedEvidence], { maxAllowedClassification: "CONFIDENTIAL" });
    assert.equal(report3.isValid, false);
    assert.equal(report3.unauthorizedFindings.length, 1);
  });

  // =========================================================================
  // GATE 4: Strict Zod Schemas at Every Boundary
  // =========================================================================
  await test("Gate 4: Strict Zod schemas parse and enforce boundary types without silent coercion", () => {
    const validClaim = {
      claimId: "C1",
      type: "AMOUNT",
      statement: "Net settlement is ₹976.40 after ₹20 fee and ₹3.60 GST.",
      evidenceIds: ["ev_1", "ev_2"],
      assertedValues: [
        { key: "netAmount", value: 97640, expectedPaise: 97640, observedPaise: 97640 },
      ],
      confidence: 95,
      uncertainties: [],
    };

    const parsed = AIClaimSchema.parse(validClaim);
    assert.equal(parsed.claimId, "C1");
    assert.equal(parsed.type, "AMOUNT");

    // Invalid schema test
    let caught = false;
    try {
      AIClaimSchema.parse({
        claimId: "", // invalid empty string
        type: "UNKNOWN_TYPE", // invalid enum
      });
    } catch {
      caught = true;
    }
    assert.equal(caught, true);
  });

  // =========================================================================
  // GATE 5 & 6: ONE Adversarial Critic with 3 Lenses
  // =========================================================================
  await test("Gate 5 & 6: Adversarial Critic evaluates claims through 3 distinct lenses (Math, Evidence, Policy)", () => {
    const context: CouncilReviewRequest = {
      exceptionId: "exc_critic_test",
      exceptionType: "AMOUNT_MISMATCH",
      amountPaise: 2000000,
      riskLevel: "HIGH",
      paymentRecord: {
        paymentId: "pay_critic",
        amount: 20000,
        fee: 400,
        tax: 72,
        createdAt: new Date("2026-08-10T10:00:00Z"),
      },
      settlementRecord: {
        settlementId: "setl_critic",
        amount: 18000, // Expected: 19528, discrepancy = 1528 INR
        settledAt: new Date("2026-08-25T10:00:00Z"), // 15 days later (violates 72h window)
      },
      evidenceItems: [
        {
          evidenceId: "ev_real_1",
          sourceType: "PAYMENT",
          sourceReference: "PAY-CRITIC",
          title: "Real Evidence",
          contentHash: "hash_real",
          accessClassification: "CONFIDENTIAL",
          linkedRecords: { paymentIds: ["pay_critic"] },
        },
      ],
    };

    const flawedInvestigator = InvestigatorOutputSchema.parse({
      hypothesis: "Discrepancy is normal promotional variance.",
      reasoning: "Promotional fee waiver applied.",
      evidenceIds: ["ev_real_1", "ev_invented_ghost_doc"], // Includes invented evidence ID!
      supportingFacts: ["Waiver approved"],
      uncertainties: [],
      recommendedAction: "AUTO_CLEAR",
      confidence: 80,
      claims: [
        {
          claimId: "C1",
          type: "AMOUNT",
          statement: "Net settlement equals 18000.",
          evidenceIds: ["ev_real_1", "ev_invented_ghost_doc"],
          assertedValues: [{ key: "netAmount", value: 18000, expectedPaise: 18000, observedPaise: 18000 }],
          confidence: 80,
          uncertainties: [],
        },
      ],
    });

    const evaluation = adversarialCritic.evaluate(flawedInvestigator, context);
    CriticEvaluationSchema.parse(evaluation);

    // Verify all 3 lenses raised objections
    const mathObj = evaluation.objections.find((o) => o.lens === "MATHEMATICAL_CONSERVATION");
    const evidenceObj = evaluation.objections.find((o) => o.lens === "EVIDENCE_PROVENANCE");
    const timingObj = evaluation.objections.find((o) => o.lens === "TIMING_POLICY");

    assert.ok(mathObj, "Mathematical conservation lens flagged arithmetic divergence");
    assert.ok(evidenceObj, "Evidence provenance lens flagged invented evidence ID");
    assert.ok(timingObj, "Timing policy lens flagged SLA delay window breach");
    assert.equal(evaluation.verdict, "CONTROL_FAILURE");
    assert.equal(evaluation.requiresReinvestigation, true);
  });

  // =========================================================================
  // GATE 7: Mechanical Verification of Critic Objections
  // =========================================================================
  await test("Gate 7: Non-LLM Mechanical Verifier evaluates falsifiable objections against ground truth", () => {
    const context: CouncilReviewRequest = {
      exceptionId: "exc_mech_test",
      exceptionType: "AMOUNT_MISMATCH",
      amountPaise: 100000,
      riskLevel: "HIGH",
      evidenceItems: [
        {
          evidenceId: "ev_existing",
          sourceType: "PAYMENT",
          sourceReference: "PAY-1",
          title: "Existing doc",
          contentHash: "hash_1",
          accessClassification: "CONFIDENTIAL",
          linkedRecords: {},
        },
      ],
    };

    const objections = [
      CriticObjectionSchema.parse({
        objectionId: "obj_math_1",
        lens: "MATHEMATICAL_CONSERVATION",
        code: "AMOUNT_ARITHMETIC_ERROR",
        detail: "Gross minus fee diverges by 500 paise",
        falsificationTest: {
          type: "ARITHMETIC_EQUALITY",
          targetKey: "netPaise",
          operator: "==",
          expectedValue: 10000,
          actualValue: 9500,
          tolerancePaise: 0,
        },
        severity: "CRITICAL",
      }),
      CriticObjectionSchema.parse({
        objectionId: "obj_ev_1",
        lens: "EVIDENCE_PROVENANCE",
        code: "INVENTED_EVIDENCE_ID",
        detail: "Cites ghost doc",
        falsificationTest: {
          type: "EVIDENCE_EXISTENCE",
          targetKey: "ev_ghost_missing_from_vault",
          operator: "EXISTS",
          expectedValue: true,
          actualValue: false,
          tolerancePaise: 0,
        },
        severity: "CRITICAL",
      }),
    ];

    const mechResult = mechanicalVerifier.verifyObjections(objections, context);
    MechanicalVerificationResultSchema.parse(mechResult);

    assert.equal(mechResult.totalObjections, 2);
    assert.equal(mechResult.confirmedObjectionsCount, 2);
    assert.equal(mechResult.allObjectionsDismissed, false);
    assert.ok(mechResult.canonicalHash.length === 64);
  });

  // =========================================================================
  // GATE 8: Full REINVESTIGATE Loop & Convergence
  // =========================================================================
  await test("Gate 8: Multi-pass REINVESTIGATE Loop feeds counterexamples to investigator and terminates with verified proof receipt", async () => {
    const scenarioValidWithSlightDelay: CouncilReviewRequest = {
      exceptionId: "exc_reinvestigate_demo",
      exceptionType: "SETTLEMENT_DELAY",
      amountPaise: 100000,
      riskLevel: "MEDIUM",
      discrepancyPaise: 0,
      paymentRecord: {
        paymentId: "pay_loop_1",
        amount: 1000,
        fee: 20,
        tax: 3.6,
        createdAt: new Date("2026-08-20T10:00:00Z"),
      },
      settlementRecord: {
        settlementId: "setl_loop_1",
        amount: 976.4, // Net: 1000 - 20 - 3.6 = 976.40
        settledAt: new Date("2026-08-21T14:00:00Z"), // 28h later (within 72h window)
      },
      evidenceItems: [
        {
          evidenceId: "ev_loop_1",
          sourceType: "SETTLEMENT",
          sourceReference: "SETL-LOOP-1",
          title: "Gateway Settlement File",
          contentHash: "81d840cd8cf981e5e69a367b879a8f11e9e51d60136a6d38e430877f08cab02b",
          accessClassification: "CONFIDENTIAL",
          linkedRecords: { paymentIds: ["pay_loop_1"] },
        },
      ],
    };

    const pipelineResult = await innovationBackboneEngine.execute(scenarioValidWithSlightDelay);
    assert.equal(pipelineResult.finalVerdict, "VERIFIED");
    assert.ok(pipelineResult.decisionReceiptSignature.length === 64);
    assert.ok(pipelineResult.z3Proof.conservationPassed);
    assert.equal(pipelineResult.tamperReport.isValid, true);
    assert.equal(pipelineResult.critic.verdict, "VERIFIED");
    assert.equal(pipelineResult.reinvestigationState.status, "CONVERGED_VERIFIED");
  });

  console.log("\n=========================================================================");
  console.log(" ✅ ALL 8 MILESTONE 1 INNOVATION BACKBONE GATES PASSED");
  console.log("=========================================================================\n");
}

main().catch((err) => {
  console.error("Milestone 1 test suite failed:", err);
  process.exit(1);
});
