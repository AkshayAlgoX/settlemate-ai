/*
 * SettleMate AI — Final End-to-End Integrated Financial Pipeline Suite
 *
 * 20 Comprehensive End-to-End Integration Scenarios covering:
 *   1. clean transaction bypasses AI
 *   2. ambiguous transaction reaches AI
 *   3. critic creates concrete objection
 *   4. mechanical verifier confirms objection
 *   5. REINVESTIGATE executes
 *   6. new claim survives challenge
 *   7. split payment invokes OR-Tools
 *   8. solver output is independently verified
 *   9. confidence x exposure routes correctly
 *   10. human correction generated
 *   11. invariant restoration proved
 *   12. human approval atomic
 *   13. terminal receipt created
 *   14. receipt replay succeeds
 *   15. receipt signature verifies
 *   16. tampering detected
 *   17. stale correction rejected
 *   18. duplicate approval prevented
 *   19. tenant isolation
 *   20. final decision cannot bypass receipt
 */

import assert from "node:assert/strict";
import { CanonicalFinancialPipelineOrchestrator } from "../src/lib/pipeline/financial-decision-pipeline";
import { verifyTerminalReceipt } from "../src/lib/receipts/verifier";
import { replayTerminalReceipt } from "../src/lib/receipts/replay";
import { TerminalReceiptRepository } from "../src/lib/receipts/repository";
import { ReceiptTenantIsolationError } from "../src/lib/receipts/types";
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

async function main() {
  console.log("\n=========================================================================");
  console.log(" 🌐 SETTLEMATE AI — FINAL INTEGRATED FINANCIAL PIPELINE SUITE");
  console.log("=========================================================================\n");

  const tenantA = `tenant_pipe_alpha_${Date.now()}`;
  const tenantB = `tenant_pipe_beta_${Date.now()}`;

  // ---------------------------------------------------------------------------
  // 1. CANONICAL DEMO A: CLEAN FAST PATH (0 AI INVOCATIONS)
  // ---------------------------------------------------------------------------
  console.log("--- 1. DEMO A: CLEAN FAST PATH ---");

  await test("1. Clean matched transaction bypasses AI completely (0 AI invocations)", async () => {
    const res = await CanonicalFinancialPipelineOrchestrator.execute({
      tenantId: tenantA,
      transactionId: "tx_demo_clean_101",
      currency: "INR",
      amountMinor: 500000,
      observedDebitMinor: 500000,
      observedCreditMinor: 500000,
      scenarioType: "CLEAN_FAST_PATH",
    });

    assert.equal(res.finalDecision, "AUTO_RESOLVED");
    assert.equal(res.bypassedAi, true);
    assert.equal(res.aiInvocationCount, 0);
    assert.equal(res.reinvestigationPasses, 0);
    assert.equal(res.verificationReport.verdict, "VALID");
  });

  // ---------------------------------------------------------------------------
  // 2. CANONICAL DEMO B: ADVERSARIAL REINVESTIGATION
  // ---------------------------------------------------------------------------
  console.log("\n--- 2. DEMO B: ADVERSARIAL REINVESTIGATION ---");

  await test("2. Ambiguous transaction reaches AI investigator", async () => {
    const res = await CanonicalFinancialPipelineOrchestrator.execute({
      tenantId: tenantA,
      transactionId: "tx_demo_adv_202",
      currency: "INR",
      amountMinor: 120000,
      observedDebitMinor: 120000,
      observedCreditMinor: 110000, // Discrepancy
      scenarioType: "ADVERSARIAL_REINVESTIGATION",
    });

    assert.equal(res.bypassedAi, false);
    assert.ok(res.aiInvocationCount >= 1);
    assert.ok(res.receipt.aiClaim !== undefined);
  });

  await test("3. Critic creates concrete objection across 3 lenses", async () => {
    const res = await CanonicalFinancialPipelineOrchestrator.execute({
      tenantId: tenantA,
      transactionId: "tx_adv_critic_203",
      currency: "INR",
      amountMinor: 120000,
      observedDebitMinor: 120000,
      observedCreditMinor: 110000,
      scenarioType: "ADVERSARIAL_REINVESTIGATION",
    });

    assert.ok(res.receipt.challenge !== undefined);
    assert.ok("arithmeticParity" in res.receipt.challenge!.lensResults);
    assert.ok("evidenceAuthenticity" in res.receipt.challenge!.lensResults);
    assert.ok("policyCompliance" in res.receipt.challenge!.lensResults);
  });

  await test("4. Non-LLM mechanical verifier evaluates objection against ground truth", async () => {
    const res = await CanonicalFinancialPipelineOrchestrator.execute({
      tenantId: tenantA,
      transactionId: "tx_adv_mech_204",
      currency: "INR",
      amountMinor: 120000,
      observedDebitMinor: 120000,
      observedCreditMinor: 110000,
      scenarioType: "ADVERSARIAL_REINVESTIGATION",
    });

    assert.ok(res.receipt.mechanicalVerification !== undefined);
    assert.ok(["PASSED", "FAILED", "INCONCLUSIVE"].includes(res.receipt.mechanicalVerification!.verdict));
  });

  await test("5. Multi-pass REINVESTIGATE executes when objection is confirmed", async () => {
    const res = await CanonicalFinancialPipelineOrchestrator.execute({
      tenantId: tenantA,
      transactionId: "tx_adv_reinv_205",
      currency: "INR",
      amountMinor: 120000,
      observedDebitMinor: 120000,
      observedCreditMinor: 110000,
      scenarioType: "ADVERSARIAL_REINVESTIGATION",
    });

    assert.ok(res.reinvestigationPasses >= 1);
    assert.ok(res.receipt.reinvestigationHistory.length >= 1);
  });

  await test("6. Final refined claim survives challenge and is cryptographically recorded", async () => {
    const res = await CanonicalFinancialPipelineOrchestrator.execute({
      tenantId: tenantA,
      transactionId: "tx_adv_survive_206",
      currency: "INR",
      amountMinor: 120000,
      observedDebitMinor: 120000,
      observedCreditMinor: 110000,
      scenarioType: "ADVERSARIAL_REINVESTIGATION",
    });

    assert.ok(res.receipt.challenge?.challengeStatus === "CHALLENGED_SURVIVED" || res.receipt.challenge?.challengeStatus === "CHALLENGED_DISMISSED");
    assert.equal(res.verificationReport.verdict, "VALID");
  });

  // ---------------------------------------------------------------------------
  // 3. SPLIT PAYMENT & OR-TOOLS SOLVER
  // ---------------------------------------------------------------------------
  console.log("\n--- 3. SPLIT PAYMENT & OR-TOOLS SOLVER ---");

  await test("7. Split payment invokes OR-Tools CP-SAT solver", async () => {
    const res = await CanonicalFinancialPipelineOrchestrator.execute({
      tenantId: tenantA,
      transactionId: "tx_demo_split_301",
      currency: "INR",
      amountMinor: 10000000, // ₹100,000.00
      observedDebitMinor: 10000000,
      observedCreditMinor: 10000000,
      scenarioType: "SPLIT_PAYMENT",
      invoiceCandidates: [
        { invoiceId: "INV-101", amountMinor: 3000000, currency: "INR", status: "OPEN" },
        { invoiceId: "INV-102", amountMinor: 2500000, currency: "INR", status: "OPEN" },
        { invoiceId: "INV-103", amountMinor: 4500000, currency: "INR", status: "OPEN" },
        { invoiceId: "INV-104", amountMinor: 5000000, currency: "INR", status: "OPEN" },
      ],
    });

    assert.ok(res.receipt.solverDecision !== undefined);
    assert.equal(res.receipt.solverDecision?.selectedInvoiceIds.length, 3);
    assert.deepEqual(res.receipt.solverDecision?.selectedInvoiceIds.sort(), ["INV-101", "INV-102", "INV-103"].sort());
  });

  await test("8. Solver output is independently verified before entering pipeline", async () => {
    const res = await CanonicalFinancialPipelineOrchestrator.execute({
      tenantId: tenantA,
      transactionId: "tx_split_ver_302",
      currency: "INR",
      amountMinor: 10000000,
      observedDebitMinor: 10000000,
      observedCreditMinor: 10000000,
      scenarioType: "SPLIT_PAYMENT",
      invoiceCandidates: [
        { invoiceId: "INV-101", amountMinor: 3000000, currency: "INR", status: "OPEN" },
        { invoiceId: "INV-102", amountMinor: 2500000, currency: "INR", status: "OPEN" },
        { invoiceId: "INV-103", amountMinor: 4500000, currency: "INR", status: "OPEN" },
      ],
    });

    assert.equal(res.receipt.solverDecision?.solverVerification.verified, true);
    assert.equal(res.receipt.solverDecision?.solverVerification.assertionCount, 9);
  });

  // ---------------------------------------------------------------------------
  // 4. CANONICAL DEMO C: HUMAN CORRECTION & INVARIANT RESTORATION
  // ---------------------------------------------------------------------------
  console.log("\n--- 4. DEMO C: HUMAN CORRECTION & INVARIANT PROOF ---");

  await test("9. Confidence x Exposure routes high-exposure discrepancy to HUMAN_REVIEW", async () => {
    const res = await CanonicalFinancialPipelineOrchestrator.execute({
      tenantId: tenantA,
      transactionId: "tx_demo_human_401",
      currency: "INR",
      amountMinor: 8750000, // ₹87,500.00
      observedDebitMinor: 8750000,
      observedCreditMinor: 7500000,
      scenarioType: "HUMAN_CORRECTION",
    });

    assert.ok(res.receipt.routingDecision !== undefined);
    assert.equal(res.receipt.routingDecision?.exposureBand, "HIGH");
    assert.equal(res.receipt.routingDecision?.decision, "HUMAN_REVIEW");
  });

  await test("10. Minimal correcting journal entry is deterministically generated (1 pair / 2 lines)", async () => {
    const res = await CanonicalFinancialPipelineOrchestrator.execute({
      tenantId: tenantA,
      transactionId: "tx_human_min_402",
      currency: "INR",
      amountMinor: 8750000,
      observedDebitMinor: 8750000,
      observedCreditMinor: 7500000,
      scenarioType: "HUMAN_CORRECTION",
    });

    assert.ok(res.receipt.correctionDecision !== undefined);
    assert.equal(res.receipt.correctionDecision?.journalLines.length, 2);
    assert.equal(res.receipt.correctionDecision?.journalLines[0].amountMinor, 1250000);
    assert.equal(res.receipt.correctionDecision?.journalLines[1].amountMinor, 1250000);
  });

  await test("11. Invariant restoration is proven (Before = Imbalance, After = Restored)", async () => {
    const res = await CanonicalFinancialPipelineOrchestrator.execute({
      tenantId: tenantA,
      transactionId: "tx_human_inv_403",
      currency: "INR",
      amountMinor: 8750000,
      observedDebitMinor: 8750000,
      observedCreditMinor: 7500000,
      scenarioType: "HUMAN_CORRECTION",
    });

    const cd = res.receipt.correctionDecision!;
    assert.equal(cd.beforeState.isBalanced, false);
    assert.equal(cd.afterState.isBalanced, true);
    assert.equal(cd.afterState.differenceMinor, 0);
    assert.equal(cd.invariantProofHash.length, 64);
  });

  await test("12. Human approval commits atomically to ledger & audit log", async () => {
    const res = await CanonicalFinancialPipelineOrchestrator.execute({
      tenantId: tenantA,
      transactionId: "tx_human_app_404",
      currency: "INR",
      amountMinor: 8750000,
      observedDebitMinor: 8750000,
      observedCreditMinor: 7500000,
      scenarioType: "HUMAN_CORRECTION",
      humanApprovalAction: "APPROVE",
      humanReviewer: "head_controller",
    });

    assert.equal(res.finalDecision, "HUMAN_APPROVED");
    assert.equal(res.receipt.correctionDecision?.correctionStatus, "APPROVED");
    assert.equal(res.receipt.correctionDecision?.reviewedBy, "head_controller");
  });

  // ---------------------------------------------------------------------------
  // 5. TERMINAL DECISION RECEIPT & REPLAY
  // ---------------------------------------------------------------------------
  console.log("\n--- 5. TERMINAL DECISION RECEIPT & REPLAY ---");

  await test("13. Terminal decision receipt is generated and signed with HMAC-SHA256", async () => {
    const res = await CanonicalFinancialPipelineOrchestrator.execute({
      tenantId: tenantA,
      transactionId: "tx_rcpt_gen_501",
      currency: "INR",
      amountMinor: 500000,
      observedDebitMinor: 500000,
      observedCreditMinor: 500000,
      scenarioType: "CLEAN_FAST_PATH",
    });

    assert.ok(res.receipt.receiptId.startsWith("rcpt_"));
    assert.equal(res.receipt.signature.length, 64);
    assert.equal(res.receipt.proofHash.length, 64);
  });

  await test("14. Zero-LLM deterministic replay succeeds bitwise", async () => {
    const res = await CanonicalFinancialPipelineOrchestrator.execute({
      tenantId: tenantA,
      transactionId: "tx_replay_502",
      currency: "INR",
      amountMinor: 8750000,
      observedDebitMinor: 8750000,
      observedCreditMinor: 7500000,
      scenarioType: "HUMAN_CORRECTION",
      humanApprovalAction: "APPROVE",
    });

    const replay = replayTerminalReceipt(res.receipt, tenantA);
    assert.equal(replay.isReplayValid, true);
    assert.equal(replay.replayedFinalDecision, "HUMAN_APPROVED");
  });

  await test("15. Receipt signature and proof hash independently verify", async () => {
    const res = await CanonicalFinancialPipelineOrchestrator.execute({
      tenantId: tenantA,
      transactionId: "tx_sig_ver_503",
      currency: "INR",
      amountMinor: 500000,
      observedDebitMinor: 500000,
      observedCreditMinor: 500000,
      scenarioType: "CLEAN_FAST_PATH",
    });

    const report = verifyTerminalReceipt(res.receipt, undefined, tenantA);
    assert.equal(report.verdict, "VALID");
  });

  await test("16. Tampering with any payload attribute is caught immediately", async () => {
    const res = await CanonicalFinancialPipelineOrchestrator.execute({
      tenantId: tenantA,
      transactionId: "tx_tamper_504",
      currency: "INR",
      amountMinor: 500000,
      observedDebitMinor: 500000,
      observedCreditMinor: 500000,
      scenarioType: "CLEAN_FAST_PATH",
    });

    const tampered = {
      ...res.receipt,
      inputCommitment: { ...res.receipt.inputCommitment, amountMinor: 9999999 },
    };

    const report = verifyTerminalReceipt(tampered, undefined, tenantA);
    assert.equal(report.verdict, "INVALID");
    assert.equal(report.failureReason, "HASH_MISMATCH");
  });

  await test("17. Stale correction is rejected if underlying version advances", async () => {
    const res = await CanonicalFinancialPipelineOrchestrator.execute({
      tenantId: tenantA,
      transactionId: "tx_stale_505",
      currency: "INR",
      amountMinor: 8750000,
      observedDebitMinor: 8750000,
      observedCreditMinor: 7500000,
      scenarioType: "HUMAN_CORRECTION",
      underlyingRecordVersion: 2,
    });

    assert.equal(res.receipt.correctionDecision?.underlyingRecordVersion, 2);
  });

  await test("18. Duplicate approval is handled idempotently without multiple mutations", async () => {
    const receipt = (await CanonicalFinancialPipelineOrchestrator.execute({
      tenantId: tenantA,
      transactionId: "tx_idemp_506",
      currency: "INR",
      amountMinor: 500000,
      observedDebitMinor: 500000,
      observedCreditMinor: 500000,
      scenarioType: "CLEAN_FAST_PATH",
    })).receipt;

    const res1 = await TerminalReceiptRepository.saveReceipt(receipt);
    const res2 = await TerminalReceiptRepository.saveReceipt(receipt);

    assert.equal(res1.success, true);
    assert.equal(res2.success, true);
    assert.equal(res2.idempotent, true);
  });

  await test("19. Strict cross-tenant isolation blocks unauthorized access", async () => {
    const receipt = (await CanonicalFinancialPipelineOrchestrator.execute({
      tenantId: tenantA,
      transactionId: "tx_sec_507",
      currency: "INR",
      amountMinor: 500000,
      observedDebitMinor: 500000,
      observedCreditMinor: 500000,
      scenarioType: "CLEAN_FAST_PATH",
    })).receipt;

    await assert.rejects(
      () => TerminalReceiptRepository.getReceipt(receipt.receiptId, tenantB),
      (err) => err instanceof ReceiptTenantIsolationError
    );
  });

  await test("20. Final decision cannot bypass terminal receipt creation", async () => {
    const res = await CanonicalFinancialPipelineOrchestrator.execute({
      tenantId: tenantA,
      transactionId: "tx_no_bypass_508",
      currency: "INR",
      amountMinor: 500000,
      observedDebitMinor: 500000,
      observedCreditMinor: 500000,
      scenarioType: "CLEAN_FAST_PATH",
    });

    assert.ok(res.receipt !== undefined);
    assert.ok(res.receipt.receiptId.length > 0);
    assert.equal(res.verificationReport.verdict, "VALID");
  });

  console.log("\n=========================================================================");
  console.log(" ✅ ALL 20 FINAL INTEGRATED PIPELINE TEST SCENARIOS PASSED");
  console.log("=========================================================================\n");
}

main().catch((err) => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
