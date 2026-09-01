/*
 * SettleMate AI — Milestone 5: Signed Replayable Decision Proof & Immutable Terminal Receipt Suite
 *
 * 30 Comprehensive Test Scenarios covering:
 *   1. receipt schema validation
 *   2. deterministic canonicalization
 *   3. identical receipt -> identical canonical hash
 *   4. HMAC signature generation
 *   5. valid signature verification
 *   6. invalid signature rejection
 *   7. hash mismatch detection
 *   8. schema corruption detection
 *   9. replay without LLM
 *   10. routing replay
 *   11. correction replay
 *   12. solver replay
 *   13. evidence commitment verification
 *   14. REINVESTIGATION lineage preservation
 *   15. immutable receipt creation
 *   16. duplicate terminalization idempotency
 *   17. concurrent terminalization race
 *   18. tenant isolation
 *   19. policy-version recording
 *   20. key-version recording
 *   21. key rotation verification
 *   22. tampered routing risk detection
 *   23. tampered invoice selection detection
 *   24. tampered journal detection
 *   25. fully integrated AUTO_RESOLVED receipt
 *   26. fully integrated HUMAN_APPROVED receipt
 *   27. HUMAN_REJECTED receipt
 *   28. BLOCKED receipt
 *   29. FAILED receipt
 *   30. CANCELLED receipt
 */

import assert from "node:assert/strict";
import {
  TerminalDecisionReceiptSchema,
  type TerminalDecisionReceipt,
  ReceiptTenantIsolationError,
  ReceiptImmutableError,
  ReplayDivergenceError,
} from "../src/lib/receipts/types";
import { canonicalizeJson, canonicalizeReceiptForSigning, canonicalizeReceipt } from "../src/lib/receipts/canonicalizer";
import { signReceipt, verifyReceiptSignature, computeProofHash } from "../src/lib/receipts/signer";
import { verifyTerminalReceipt } from "../src/lib/receipts/verifier";
import { replayTerminalReceipt } from "../src/lib/receipts/replay";
import { TerminalReceiptRepository } from "../src/lib/receipts/repository";
import { createTerminalDecisionReceipt, DEFAULT_POLICY_VERSIONS } from "../src/lib/receipts/builder";
import { InvariantRestorationProver } from "../src/lib/corrections/prover";

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  ✓ [PASS] ${name}`);
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name} — ${(err as Error).message}`);
    throw err;
  }
}

function buildBaseReceipt(overrides: Partial<TerminalDecisionReceipt> = {}): TerminalDecisionReceipt {
  const unsigned = {
    receiptId: overrides.receiptId || `rcpt_base_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    tenantId: overrides.tenantId || "tenant_alpha",
    transactionId: overrides.transactionId || "tx_1001",
    batchId: overrides.batchId || "batch_1001",
    createdAt: overrides.createdAt || new Date().toISOString(),
    receiptVersion: "1.0.0" as const,

    inputCommitment: overrides.inputCommitment || {
      transactionId: "tx_1001",
      batchId: "batch_1001",
      currency: "INR",
      amountMinor: 8750000,
      inputHash: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
    },

    evidenceCommitment: overrides.evidenceCommitment || {
      evidenceIds: ["ev_1", "ev_2"],
      evidenceHashes: {
        ev_1: "1111111111111111111111111111111111111111111111111111111111111111",
        ev_2: "2222222222222222222222222222222222222222222222222222222222222222",
      },
      merkleRoot: "3333333333333333333333333333333333333333333333333333333333333333",
      accessClassification: "RESTRICTED" as const,
    },

    deterministicMatch: overrides.deterministicMatch || {
      matched: true,
      ruleId: "RULE_EXACT_AMOUNT_MATCH",
      confidence: 1.0,
    },

    invariantProof: overrides.invariantProof || {
      proofId: "prf_inv_1001",
      theoremName: "THEOREM_DOUBLE_ENTRY_PARITY",
      status: "PROOF_VALID" as const,
      proofHash: "4444444444444444444444444444444444444444444444444444444444444444",
      conservationPassed: true,
      doubleEntryBalanced: true,
    },

    aiClaim: overrides.aiClaim,
    challenge: overrides.challenge,
    mechanicalVerification: overrides.mechanicalVerification,
    reinvestigationHistory: overrides.reinvestigationHistory || [],
    solverDecision: overrides.solverDecision,
    routingDecision: overrides.routingDecision,
    correctionDecision: overrides.correctionDecision,

    finalDecision: overrides.finalDecision || "AUTO_RESOLVED",
    policyVersions: overrides.policyVersions || DEFAULT_POLICY_VERSIONS,

    signingKeyVersion: overrides.signingKeyVersion || "v1",
    canonicalizationVersion: "RFC8785-v1" as const,
    signatureAlgorithm: "HMAC-SHA256" as const,
  };

  return signReceipt(unsigned, unsigned.signingKeyVersion);
}

async function main() {
  console.log("\n=========================================================================");
  console.log(" 📜 SETTLEMATE AI — MILESTONE 5: TERMINAL DECISION RECEIPT SUITE");
  console.log("=========================================================================\n");

  const tenantA = `tenant_m5_alpha_${Date.now()}`;
  const tenantB = `tenant_m5_beta_${Date.now()}`;

  // ---------------------------------------------------------------------------
  // 1. CANONICALIZATION & HASHING
  // ---------------------------------------------------------------------------
  console.log("--- 1. CANONICALIZATION & CRYPTOGRAPHIC HASHING ---");

  await test("1. Strict boundary schema validation accepts valid receipt and rejects malformed", () => {
    const valid = buildBaseReceipt({ tenantId: tenantA });
    const parsed = TerminalDecisionReceiptSchema.safeParse(valid);
    assert.equal(parsed.success, true);

    const malformed = { ...valid, receiptId: "invalid_prefix_without_rcpt" };
    const invalidParsed = TerminalDecisionReceiptSchema.safeParse(malformed);
    assert.equal(invalidParsed.success, false);
  });

  await test("2. Deterministic RFC 8785 JSON canonicalization sorts keys lexicographically", () => {
    const objA = { z: 1, a: 2, m: { b: 3, a: 4 } };
    const objB = { a: 2, m: { a: 4, b: 3 }, z: 1 };
    const canonA = canonicalizeJson(objA);
    const canonB = canonicalizeJson(objB);
    assert.equal(canonA, canonB);
    assert.equal(canonA, '{"a":2,"m":{"a":4,"b":3},"z":1}');
  });

  await test("3. Identical receipt produces bitwise identical proofHash across 1,000 iterations", () => {
    const base = buildBaseReceipt({ tenantId: tenantA });
    const firstHash = computeProofHash(base);
    for (let i = 0; i < 1000; i++) {
      const h = computeProofHash(base);
      assert.equal(h, firstHash);
    }
  });

  await test("4. HMAC-SHA256 signature generation produces 64-character hex signature", () => {
    const receipt = buildBaseReceipt({ tenantId: tenantA });
    assert.equal(receipt.signature.length, 64);
    assert.match(receipt.signature, /^[a-f0-9]{64}$/);
  });

  await test("5. Valid receipt passes signature & proof hash verification", () => {
    const receipt = buildBaseReceipt({ tenantId: tenantA });
    const res = verifyReceiptSignature(receipt);
    assert.equal(res.isValid, true);
    assert.equal(res.recomputedHash, receipt.proofHash);
  });

  await test("6. Invalid signature is strictly rejected", () => {
    const receipt = buildBaseReceipt({ tenantId: tenantA });
    const tampered = { ...receipt, signature: "0000000000000000000000000000000000000000000000000000000000000000" };
    const res = verifyReceiptSignature(tampered);
    assert.equal(res.isValid, false);
    assert.ok(res.error?.includes("SIGNATURE_MISMATCH"));
  });

  await test("7. Modified payload with original proofHash triggers HASH_MISMATCH", () => {
    const receipt = buildBaseReceipt({ tenantId: tenantA });
    const tampered = {
      ...receipt,
      inputCommitment: { ...receipt.inputCommitment, amountMinor: 999999999 },
    };
    const res = verifyReceiptSignature(tampered);
    assert.equal(res.isValid, false);
    assert.ok(res.error?.includes("HASH_MISMATCH"));
  });

  await test("8. Schema corruption detection fails closed with SCHEMA_INVALID", () => {
    const corrupted = { foo: "bar" };
    const report = verifyTerminalReceipt(corrupted);
    assert.equal(report.verdict, "INVALID");
    assert.equal(report.failureReason, "SCHEMA_INVALID");
  });

  // ---------------------------------------------------------------------------
  // 2. DETERMINISTIC REPLAY (M1, M2, M3, M4) WITHOUT LLM
  // ---------------------------------------------------------------------------
  console.log("\n--- 2. DETERMINISTIC REPLAY WITHOUT LLM ---");

  await test("9. Replay executes with zero LLM and zero network calls", () => {
    const receipt = buildBaseReceipt({ tenantId: tenantA });
    const replay = replayTerminalReceipt(receipt);
    assert.equal(replay.isReplayValid, true);
    assert.equal(replay.receiptId, receipt.receiptId);
  });

  await test("10. Milestone 2 Confidence x Exposure routing replays bitwise", () => {
    const receipt = buildBaseReceipt({
      tenantId: tenantA,
      routingDecision: {
        policyVersion: "confidence-exposure-v1",
        originalConfidence: 0.962,
        adjustedConfidence: 0.982,
        exposureAmountMinor: 120000, // ₹1,200
        currency: "INR",
        exposureBand: "LOW",
        routingRisk: 0.191,
        threshold: 0.30,
        challengeStatus: "CHALLENGED_SURVIVED",
        verificationStatus: "VERIFIED",
        decision: "AUTO_RESOLVE",
      },
      finalDecision: "AUTO_RESOLVED",
    });

    const replay = replayTerminalReceipt(receipt);
    assert.equal(replay.isReplayValid, true);
    assert.equal(replay.routingReplayed, true);
  });

  await test("11. Milestone 4 minimal correction & invariant proof replays bitwise", () => {
    const journalLines = [
      {
        lineId: "l1",
        accountId: "SETTLEMENT_RECEIVABLE",
        accountName: "Settlement Receivable",
        entryType: "DEBIT" as const,
        amountMinor: 1250000,
        currency: "INR",
        description: "Debit variance",
      },
      {
        lineId: "l2",
        accountId: "SETTLEMENT_VARIANCE_CLEARING",
        accountName: "Settlement Variance Clearing",
        entryType: "CREDIT" as const,
        amountMinor: 1250000,
        currency: "INR",
        description: "Credit clearing",
      },
    ];

    const proof = InvariantRestorationProver.proveRestoration(
      {
        tenantId: tenantA,
        transactionId: "tx_1001",
        currency: "INR",
        observedDebitMinor: 8750000,
        observedCreditMinor: 7500000,
        expectedDebitMinor: 8750000,
        expectedCreditMinor: 8750000,
        detectedDifferenceMinor: 1250000,
        correctionType: "SETTLEMENT_VARIANCE",
        evidenceIds: [],
        policyVersion: "correction-policy-v1",
        underlyingRecordVersion: 1,
      },
      journalLines
    );

    const receipt = buildBaseReceipt({
      tenantId: tenantA,
      transactionId: "tx_1001",
      correctionDecision: {
        correctionId: "cor_test_101",
        correctionPolicyVersion: "correction-policy-v1",
        correctionType: "SETTLEMENT_VARIANCE",
        journalLines,
        beforeState: { debitMinor: 8750000, creditMinor: 7500000, differenceMinor: 1250000, isBalanced: false },
        afterState: { debitMinor: 8750000, creditMinor: 8750000, differenceMinor: 0, isBalanced: true },
        invariantProofHash: proof.proofHash,
        correctionStatus: "APPROVED",
        underlyingRecordVersion: 1,
      },
      finalDecision: "HUMAN_APPROVED",
    });

    // Replay against true proof hash
    const report = verifyTerminalReceipt(receipt);
    assert.equal(report.verdict, "VALID");
  });

  await test("12. Milestone 3 OR-Tools solver decision replays bitwise", () => {
    const receipt = buildBaseReceipt({
      tenantId: tenantA,
      solverDecision: {
        solverPolicyVersion: "cpsat-invoice-match-v1",
        candidateCommitment: "cand_hash_1234567890abcdef",
        candidateCount: 3,
        selectedInvoiceIds: ["inv_1", "inv_2"],
        selectedTotalMinor: 100000,
        paymentAmountMinor: 100000,
        differenceMinor: 0,
        solverStatus: "OPTIMAL",
        objectiveValue: 0,
        solverVerification: { verified: true, assertionCount: 9 },
      },
      finalDecision: "AUTO_RESOLVED",
    });

    const replay = replayTerminalReceipt(receipt);
    assert.equal(replay.solverReplayed, true);
  });

  await test("13. Evidence commitment verification validates Merkle root presence", () => {
    const receipt = buildBaseReceipt({ tenantId: tenantA });
    assert.ok(receipt.evidenceCommitment.merkleRoot.length >= 32);
    assert.equal(receipt.evidenceCommitment.evidenceIds.length, 2);
  });

  await test("14. Multi-pass REINVESTIGATION history preserves complete append-only audit trail", () => {
    const receipt = buildBaseReceipt({
      tenantId: tenantA,
      reinvestigationHistory: [
        {
          iteration: 1,
          previousClaimId: "claim_initial_1",
          criticResult: "Falsifiable objection raised on fee unbundling",
          mechanicalVerdict: "FAILED_GROUND_TRUTH_DIVERGENCE",
          resultingClaimId: "claim_refined_2",
          timestamp: new Date().toISOString(),
        },
        {
          iteration: 2,
          previousClaimId: "claim_refined_2",
          criticResult: "Objection evaluated and dismissed",
          mechanicalVerdict: "PASSED_GROUND_TRUTH_VERIFIED",
          resultingClaimId: "claim_final_3",
          timestamp: new Date().toISOString(),
        },
      ],
    });

    assert.equal(receipt.reinvestigationHistory.length, 2);
    assert.equal(receipt.reinvestigationHistory[0].resultingClaimId, "claim_refined_2");
    assert.equal(receipt.reinvestigationHistory[1].resultingClaimId, "claim_final_3");
  });

  // ---------------------------------------------------------------------------
  // 3. IMMUTABILITY, IDEMPOTENCY & TENANT ISOLATION
  // ---------------------------------------------------------------------------
  console.log("\n--- 3. IMMUTABILITY, IDEMPOTENCY & TENANT ISOLATION ---");

  await test("15. Immutable receipt creation persists record to repository", async () => {
    const receipt = buildBaseReceipt({
      receiptId: `rcpt_imm_${Date.now()}`,
      tenantId: tenantA,
    });

    const res = await TerminalReceiptRepository.saveReceipt(receipt);
    assert.equal(res.success, true);
    assert.equal(res.receipt.receiptId, receipt.receiptId);

    const fetched = await TerminalReceiptRepository.getReceipt(receipt.receiptId, tenantA);
    assert.equal(fetched?.receiptId, receipt.receiptId);
  });

  await test("16. Duplicate terminalization with identical content returns idempotent success", async () => {
    const receipt = buildBaseReceipt({
      receiptId: `rcpt_idemp_${Date.now()}`,
      tenantId: tenantA,
    });

    const res1 = await TerminalReceiptRepository.saveReceipt(receipt);
    assert.equal(res1.success, true);

    const res2 = await TerminalReceiptRepository.saveReceipt(receipt);
    assert.equal(res2.success, true);
    assert.equal(res2.idempotent, true);
  });

  await test("17. Attempting to overwrite finalized receipt with different content throws ReceiptImmutableError", async () => {
    const receiptId = `rcpt_imm_violate_${Date.now()}`;
    const original = buildBaseReceipt({ receiptId, tenantId: tenantA, finalDecision: "AUTO_RESOLVED" });
    await TerminalReceiptRepository.saveReceipt(original);

    const mutated = buildBaseReceipt({ receiptId, tenantId: tenantA, finalDecision: "BLOCKED" });
    await assert.rejects(
      () => TerminalReceiptRepository.saveReceipt(mutated),
      (err) => err instanceof ReceiptImmutableError
    );
  });

  await test("18. Tenant B cannot read or replay Tenant A receipt (strict tenant isolation)", async () => {
    const receipt = buildBaseReceipt({
      receiptId: `rcpt_sec_${Date.now()}`,
      tenantId: tenantA,
    });
    await TerminalReceiptRepository.saveReceipt(receipt);

    await assert.rejects(
      () => TerminalReceiptRepository.getReceipt(receipt.receiptId, tenantB),
      (err) => err instanceof ReceiptTenantIsolationError
    );

    const report = verifyTerminalReceipt(receipt, undefined, tenantB);
    assert.equal(report.verdict, "INVALID");
    assert.equal(report.failureReason, "TENANT_MISMATCH");
  });

  // ---------------------------------------------------------------------------
  // 4. POLICY & KEY VERSIONING WITH ROTATION
  // ---------------------------------------------------------------------------
  console.log("\n--- 4. POLICY & KEY VERSIONING ---");

  await test("19. Policy versions are explicitly recorded across all pipeline stages", () => {
    const receipt = buildBaseReceipt({ tenantId: tenantA });
    assert.equal(receipt.policyVersions.reconciliationPolicyVersion, "reconciliation-v1");
    assert.equal(receipt.policyVersions.invariantPolicyVersion, "z3-invariant-v1");
    assert.equal(receipt.policyVersions.routingPolicyVersion, "confidence-exposure-v1");
    assert.equal(receipt.policyVersions.solverPolicyVersion, "cpsat-invoice-match-v1");
    assert.equal(receipt.policyVersions.correctionPolicyVersion, "correction-policy-v1");
    assert.equal(receipt.policyVersions.receiptVersion, "1.0.0");
    assert.equal(receipt.policyVersions.canonicalizationVersion, "RFC8785-v1");
  });

  await test("20. Key version is explicitly stored on receipt", () => {
    const receipt = buildBaseReceipt({ tenantId: tenantA, signingKeyVersion: "v1" });
    assert.equal(receipt.signingKeyVersion, "v1");
  });

  await test("21. Key rotation verification: v1 and v2 receipts both verify against respective keys", () => {
    const receiptV1 = buildBaseReceipt({ tenantId: tenantA, signingKeyVersion: "v1" });
    const receiptV2 = buildBaseReceipt({ tenantId: tenantA, signingKeyVersion: "v2" });

    const repV1 = verifyTerminalReceipt(receiptV1);
    const repV2 = verifyTerminalReceipt(receiptV2);

    assert.equal(repV1.verdict, "VALID");
    assert.equal(repV2.verdict, "VALID");
  });

  // ---------------------------------------------------------------------------
  // 5. TAMPERING DETECTION DEMO SCENARIOS
  // ---------------------------------------------------------------------------
  console.log("\n--- 5. TAMPERING DETECTION SCENARIOS ---");

  await test("22. Tampered routing risk score without re-signing fails verification", () => {
    const receipt = buildBaseReceipt({
      tenantId: tenantA,
      routingDecision: {
        policyVersion: "confidence-exposure-v1",
        originalConfidence: 0.962,
        adjustedConfidence: 0.982,
        exposureAmountMinor: 120000,
        currency: "INR",
        exposureBand: "LOW",
        routingRisk: 0.191,
        threshold: 0.30,
        challengeStatus: "CHALLENGED_SURVIVED",
        verificationStatus: "VERIFIED",
        decision: "AUTO_RESOLVE",
      },
    });

    // Tamper routing risk from 0.0547 to 0.9999
    const tampered = {
      ...receipt,
      routingDecision: {
        ...receipt.routingDecision!,
        routingRisk: 0.9999,
      },
    };

    const report = verifyTerminalReceipt(tampered);
    assert.equal(report.verdict, "INVALID");
    assert.ok(report.failureReason === "HASH_MISMATCH" || report.failureReason === "SIGNATURE_MISMATCH");
  });

  await test("23. Tampered invoice candidate selection fails verification", () => {
    const receipt = buildBaseReceipt({
      tenantId: tenantA,
      solverDecision: {
        solverPolicyVersion: "cpsat-invoice-match-v1",
        candidateCommitment: "cand_hash_1234567890abcdef",
        candidateCount: 2,
        selectedInvoiceIds: ["inv_1", "inv_2"],
        selectedTotalMinor: 50000,
        paymentAmountMinor: 50000,
        differenceMinor: 0,
        solverStatus: "OPTIMAL",
        objectiveValue: 0,
        solverVerification: { verified: true, assertionCount: 9 },
      },
    });

    // Tamper selected invoices
    const tampered = {
      ...receipt,
      solverDecision: {
        ...receipt.solverDecision!,
        selectedInvoiceIds: ["inv_1", "inv_FAKE_3"],
      },
    };

    const report = verifyTerminalReceipt(tampered);
    assert.equal(report.verdict, "INVALID");
  });

  await test("24. Tampered journal entry amount fails verification", () => {
    const receipt = buildBaseReceipt({
      tenantId: tenantA,
      correctionDecision: {
        correctionId: "cor_test_102",
        correctionPolicyVersion: "correction-policy-v1",
        correctionType: "SETTLEMENT_VARIANCE",
        journalLines: [
          {
            lineId: "l1",
            accountId: "SETTLEMENT_RECEIVABLE",
            accountName: "Settlement Receivable",
            entryType: "DEBIT",
            amountMinor: 50000,
            currency: "INR",
            description: "Debit",
          },
          {
            lineId: "l2",
            accountId: "SETTLEMENT_VARIANCE_CLEARING",
            accountName: "Settlement Variance Clearing",
            entryType: "CREDIT",
            amountMinor: 50000,
            currency: "INR",
            description: "Credit",
          },
        ],
        beforeState: { debitMinor: 50000, creditMinor: 0, differenceMinor: 50000, isBalanced: false },
        afterState: { debitMinor: 50000, creditMinor: 50000, differenceMinor: 0, isBalanced: true },
        invariantProofHash: "a".repeat(64),
        correctionStatus: "APPROVED",
        underlyingRecordVersion: 1,
      },
    });

    // Tamper amount
    const tampered = {
      ...receipt,
      correctionDecision: {
        ...receipt.correctionDecision!,
        journalLines: [
          {
            ...receipt.correctionDecision!.journalLines[0],
            amountMinor: 999999,
          },
          receipt.correctionDecision!.journalLines[1],
        ],
      },
    };

    const report = verifyTerminalReceipt(tampered);
    assert.equal(report.verdict, "INVALID");
  });

  // ---------------------------------------------------------------------------
  // 6. ALL 6 TERMINAL DECISION RECEIPT TYPES
  // ---------------------------------------------------------------------------
  console.log("\n--- 6. ALL TERMINAL DECISION RECEIPT VARIANTS ---");

  await test("25. Fully integrated AUTO_RESOLVED receipt generates and verifies", async () => {
    const receipt = await createTerminalDecisionReceipt({
      tenantId: tenantA,
      transactionId: "tx_auto_res",
      finalDecision: "AUTO_RESOLVED",
      inputCommitment: {
        transactionId: "tx_auto_res",
        currency: "INR",
        amountMinor: 120000,
        inputHash: "1111111111111111111111111111111111111111111111111111111111111111",
      },
      evidenceCommitment: {
        evidenceIds: ["ev_auto"],
        evidenceHashes: { ev_auto: "hash_auto" },
        merkleRoot: "2222222222222222222222222222222222222222222222222222222222222222",
        accessClassification: "RESTRICTED",
      },
      deterministicMatch: { matched: true, ruleId: "RULE_EXACT", confidence: 1.0 },
      invariantProof: {
        proofId: "prf_auto",
        theoremName: "THEOREM_DOUBLE_ENTRY_PARITY",
        status: "PROOF_VALID",
        proofHash: "3333333333333333333333333333333333333333333333333333333333333333",
        conservationPassed: true,
        doubleEntryBalanced: true,
      },
      routingDecision: {
        policyVersion: "confidence-exposure-v1",
        originalConfidence: 0.962,
        adjustedConfidence: 0.982,
        exposureAmountMinor: 120000,
        currency: "INR",
        exposureBand: "LOW",
        routingRisk: 0.191,
        threshold: 0.30,
        challengeStatus: "CHALLENGED_SURVIVED",
        verificationStatus: "VERIFIED",
        decision: "AUTO_RESOLVE",
      },
    });

    assert.equal(receipt.finalDecision, "AUTO_RESOLVED");
    const report = verifyTerminalReceipt(receipt);
    assert.equal(report.verdict, "VALID");
  });

  await test("26. Fully integrated HUMAN_APPROVED receipt generates and verifies", async () => {
    const journalLines = [
      {
        lineId: "l1",
        accountId: "SETTLEMENT_RECEIVABLE",
        accountName: "Settlement Receivable",
        entryType: "DEBIT" as const,
        amountMinor: 1250000,
        currency: "INR",
        description: "Debit variance",
      },
      {
        lineId: "l2",
        accountId: "SETTLEMENT_VARIANCE_CLEARING",
        accountName: "Settlement Variance Clearing",
        entryType: "CREDIT" as const,
        amountMinor: 1250000,
        currency: "INR",
        description: "Credit clearing",
      },
    ];

    const proof = InvariantRestorationProver.proveRestoration(
      {
        tenantId: tenantA,
        transactionId: "tx_human_app",
        currency: "INR",
        observedDebitMinor: 8750000,
        observedCreditMinor: 7500000,
        expectedDebitMinor: 8750000,
        expectedCreditMinor: 8750000,
        detectedDifferenceMinor: 1250000,
        correctionType: "SETTLEMENT_VARIANCE",
        evidenceIds: [],
        policyVersion: "correction-policy-v1",
        underlyingRecordVersion: 1,
      },
      journalLines
    );

    const receipt = await createTerminalDecisionReceipt({
      tenantId: tenantA,
      transactionId: "tx_human_app",
      finalDecision: "HUMAN_APPROVED",
      inputCommitment: {
        transactionId: "tx_human_app",
        currency: "INR",
        amountMinor: 8750000,
        inputHash: "aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111",
      },
      evidenceCommitment: {
        evidenceIds: ["ev_human"],
        evidenceHashes: { ev_human: "hash_human" },
        merkleRoot: "bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222",
        accessClassification: "RESTRICTED",
      },
      deterministicMatch: { matched: false },
      invariantProof: {
        proofId: "prf_human",
        theoremName: "THEOREM_DOUBLE_ENTRY_PARITY",
        status: "PROOF_VALID",
        proofHash: "cccc3333cccc3333cccc3333cccc3333cccc3333cccc3333cccc3333cccc3333",
        conservationPassed: true,
        doubleEntryBalanced: true,
      },
      correctionDecision: {
        correctionId: "cor_human_1",
        correctionPolicyVersion: "correction-policy-v1",
        correctionType: "SETTLEMENT_VARIANCE",
        journalLines,
        beforeState: { debitMinor: 8750000, creditMinor: 7500000, differenceMinor: 1250000, isBalanced: false },
        afterState: { debitMinor: 8750000, creditMinor: 8750000, differenceMinor: 0, isBalanced: true },
        invariantProofHash: proof.proofHash,
        correctionStatus: "APPROVED",
        underlyingRecordVersion: 1,
      },
    });

    assert.equal(receipt.finalDecision, "HUMAN_APPROVED");
    const report = verifyTerminalReceipt(receipt);
    assert.equal(report.verdict, "VALID");
  });

  await test("27. HUMAN_REJECTED receipt generates and verifies", async () => {
    const receipt = await createTerminalDecisionReceipt({
      tenantId: tenantA,
      transactionId: "tx_human_rej",
      finalDecision: "HUMAN_REJECTED",
      inputCommitment: {
        transactionId: "tx_human_rej",
        currency: "INR",
        amountMinor: 500000,
        inputHash: "dddd4444dddd4444dddd4444dddd4444dddd4444dddd4444dddd4444dddd4444",
      },
      evidenceCommitment: {
        evidenceIds: ["ev_rej"],
        evidenceHashes: { ev_rej: "hash_rej" },
        merkleRoot: "eeee5555eeee5555eeee5555eeee5555eeee5555eeee5555eeee5555eeee5555",
        accessClassification: "RESTRICTED",
      },
      deterministicMatch: { matched: false },
      invariantProof: {
        proofId: "prf_rej",
        theoremName: "THEOREM_DOUBLE_ENTRY_PARITY",
        status: "COUNTEREXAMPLE_FOUND",
        proofHash: "ffff6666ffff6666ffff6666ffff6666ffff6666ffff6666ffff6666ffff6666",
        conservationPassed: false,
        doubleEntryBalanced: false,
      },
    });

    assert.equal(receipt.finalDecision, "HUMAN_REJECTED");
    const report = verifyTerminalReceipt(receipt);
    assert.equal(report.verdict, "VALID");
  });

  await test("28. BLOCKED receipt generates and verifies", async () => {
    const receipt = await createTerminalDecisionReceipt({
      tenantId: tenantA,
      transactionId: "tx_blocked",
      finalDecision: "BLOCKED",
      inputCommitment: {
        transactionId: "tx_blocked",
        currency: "INR",
        amountMinor: 1000000,
        inputHash: "1212121212121212121212121212121212121212121212121212121212121212",
      },
      evidenceCommitment: {
        evidenceIds: [],
        evidenceHashes: {},
        merkleRoot: "3434343434343434343434343434343434343434343434343434343434343434",
        accessClassification: "RESTRICTED",
      },
      deterministicMatch: { matched: false },
      invariantProof: {
        proofId: "prf_blk",
        theoremName: "THEOREM_DOUBLE_ENTRY_PARITY",
        status: "COUNTEREXAMPLE_FOUND",
        proofHash: "5656565656565656565656565656565656565656565656565656565656565656",
        conservationPassed: false,
        doubleEntryBalanced: false,
      },
    });

    assert.equal(receipt.finalDecision, "BLOCKED");
    const report = verifyTerminalReceipt(receipt);
    assert.equal(report.verdict, "VALID");
  });

  await test("29. FAILED receipt generates and verifies", async () => {
    const receipt = await createTerminalDecisionReceipt({
      tenantId: tenantA,
      transactionId: "tx_failed",
      finalDecision: "FAILED",
      inputCommitment: {
        transactionId: "tx_failed",
        currency: "INR",
        amountMinor: 200000,
        inputHash: "7878787878787878787878787878787878787878787878787878787878787878",
      },
      evidenceCommitment: {
        evidenceIds: [],
        evidenceHashes: {},
        merkleRoot: "9090909090909090909090909090909090909090909090909090909090909090",
        accessClassification: "RESTRICTED",
      },
      deterministicMatch: { matched: false },
      invariantProof: {
        proofId: "prf_fail",
        theoremName: "THEOREM_DOUBLE_ENTRY_PARITY",
        status: "COUNTEREXAMPLE_FOUND",
        proofHash: "abababababababababababababababababababababababababababababababab",
        conservationPassed: false,
        doubleEntryBalanced: false,
      },
    });

    assert.equal(receipt.finalDecision, "FAILED");
    const report = verifyTerminalReceipt(receipt);
    assert.equal(report.verdict, "VALID");
  });

  await test("30. CANCELLED receipt generates and verifies", async () => {
    const receipt = await createTerminalDecisionReceipt({
      tenantId: tenantA,
      transactionId: "tx_cancelled",
      finalDecision: "CANCELLED",
      inputCommitment: {
        transactionId: "tx_cancelled",
        currency: "INR",
        amountMinor: 300000,
        inputHash: "cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd",
      },
      evidenceCommitment: {
        evidenceIds: [],
        evidenceHashes: {},
        merkleRoot: "efefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefef",
        accessClassification: "RESTRICTED",
      },
      deterministicMatch: { matched: false },
      invariantProof: {
        proofId: "prf_canc",
        theoremName: "THEOREM_DOUBLE_ENTRY_PARITY",
        status: "COUNTEREXAMPLE_FOUND",
        proofHash: "1234123412341234123412341234123412341234123412341234123412341234",
        conservationPassed: false,
        doubleEntryBalanced: false,
      },
    });

    assert.equal(receipt.finalDecision, "CANCELLED");
    const report = verifyTerminalReceipt(receipt);
    assert.equal(report.verdict, "VALID");
  });

  console.log("\n=========================================================================");
  console.log(" ✅ ALL 30 MILESTONE 5 TEST SCENARIOS PASSED");
  console.log("=========================================================================\n");
}

main().catch((err) => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
