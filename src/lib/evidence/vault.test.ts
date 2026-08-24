/*
 * SettleMate AI — Context Vault & Evidence Graph Unit Tests
 */

import assert from "node:assert/strict";
import { ContextVault } from "./vault";
import { ContextIngestionAdapter } from "./adapter";
import { GroundedAiVerifier } from "./grounded-ai";
import { generateDeterministicEvidenceId } from "./types";

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
  console.log(" SETTLEMATE AI — CONTEXT VAULT & EVIDENCE GRAPH TESTS");
  console.log("=========================================================================\n");

  const vault = new ContextVault();
  const adapter = new ContextIngestionAdapter();
  const aiVerifier = new GroundedAiVerifier();

  await test("1. Deterministic evidence IDs and canonical SHA-256 hashing", () => {
    const id1 = generateDeterministicEvidenceId("INVOICE", "INV-2026-901");
    const id2 = generateDeterministicEvidenceId("INVOICE", "INV-2026-901");
    assert.equal(id1, id2);
    assert.ok(id1.startsWith("ev_invoice_inv-2026-901_") || id1.startsWith("ev_invoice_inv_2026_901_"));

    const invoice = adapter.ingestInvoice({
      title: "Commercial Invoice #901",
      text: "Invoice total: INR 20,000 for SaaS services",
      sourceReference: "INV-2026-901",
      linkedRecords: { orderIds: ["ord_101"], paymentIds: ["pay_101"] },
      structuredData: { amountPaise: 2000000, currency: "INR" },
    });

    assert.equal(invoice.contentHash.length, 64);
    assert.equal(invoice.hashAlgorithm, "SHA-256");
    assert.ok((invoice.byteLength || 0) > 0);

    vault.addEvidence(invoice);
    assert.equal(vault.verifyEvidence(invoice.evidenceId), "VALID");
  });

  await test("2. Tamper detection on modified evidence content", () => {
    const email = adapter.ingestEmail({
      sender: "support@merchant.com",
      subject: "Refund Authorization #881",
      body: "Authorized partial refund of INR 1,550 for order ord_101",
      messageId: "MSG-881-REFUND",
      linkedRecords: { paymentIds: ["pay_101"], refundIds: ["ref_881"] },
    });

    const registered = vault.addEvidence(email);
    assert.equal(vault.verifyEvidence(registered.evidenceId), "VALID");

    // Tamper with registered item content in memory
    const tampered = vault.getById(registered.evidenceId)!;
    const originalText = tampered.rawText;
    tampered.rawText = "TAMPERED BODY: Refund of INR 50,000";
    assert.equal(vault.verifyEvidence(registered.evidenceId), "TAMPER_DETECTED");

    // Restore
    tampered.rawText = originalText;
    assert.equal(vault.verifyEvidence(registered.evidenceId), "VALID");
  });

  await test("3. Access classification boundaries (PUBLIC -> HIGHLY_RESTRICTED)", () => {
    const publicNote = adapter.ingestAnalystNote({
      author: "Analyst A",
      text: "Public reconciliation summary",
      noteId: "NOTE-PUB-01",
      classification: "PUBLIC",
      linkedRecords: { paymentIds: ["pay_101"] },
    });

    const restrictedNote = adapter.ingestAnalystNote({
      author: "Senior Auditor",
      text: "Restricted fraud investigation note",
      noteId: "NOTE-REST-01",
      classification: "RESTRICTED",
      linkedRecords: { paymentIds: ["pay_101"] },
    });

    vault.addEvidence(publicNote);
    vault.addEvidence(restrictedNote);

    // Public user should only see public evidence
    const publicView = vault.getEvidenceForRecord("pay_101", { maxClassification: "PUBLIC" });
    assert.equal(publicView.length, 1);
    assert.equal(publicView[0]!.evidenceId, publicNote.evidenceId);

    // Restricted user sees public, confidential, and restricted
    const restrictedView = vault.getEvidenceForRecord("pay_101", { maxClassification: "RESTRICTED" });
    assert.ok(restrictedView.length >= 2);
  });

  await test("4. Relationship graph construction & bounded BFS extraction", () => {
    const graph = vault.getGraph();
    const invoiceId = generateDeterministicEvidenceId("INVOICE", "INV-2026-901");
    const invoiceNode = graph.getNode(invoiceId);
    assert.ok(invoiceNode != null);
    assert.equal(invoiceNode.type, "CONTEXTUAL_EVIDENCE");

    const subgraph = graph.getSubgraph("pay_101", 2, "HIGHLY_RESTRICTED");
    assert.ok(subgraph.nodes.length >= 2);
    assert.ok(subgraph.edges.length >= 2);
  });

  await test("5. Contradiction detection across amount, currency, and status claims", () => {
    const vaultContradict = new ContextVault();

    vaultContradict.addEvidence({
      evidenceId: "ev_bank_credit",
      sourceType: "BANK_RECORD",
      sourceReference: "CMS-101",
      title: "Bank Statement Credit",
      createdAt: new Date(),
      observedAt: new Date(),
      accessClassification: "CONFIDENTIAL",
      linkedRecords: { paymentIds: ["pay_dispute"] },
      provider: "HDFC",
      structuredData: { amountPaise: 1845000, currency: "INR", status: "settled" },
    });

    vaultContradict.addEvidence({
      evidenceId: "ev_settlement",
      sourceType: "SETTLEMENT",
      sourceReference: "SETL-101",
      title: "Gateway Settlement Report",
      createdAt: new Date(),
      observedAt: new Date(),
      accessClassification: "CONFIDENTIAL",
      linkedRecords: { paymentIds: ["pay_dispute"] },
      provider: "RAZORPAY",
      structuredData: { amountPaise: 1800000, currency: "INR", status: "settled" },
    });

    const conflicts = vaultContradict.detectContradictions("pay_dispute");
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0]!.type, "AMOUNT_MISMATCH");
    assert.equal(conflicts[0]!.valueA, 1845000);
    assert.equal(conflicts[0]!.valueB, 1800000);
    assert.equal(conflicts[0]!.recommendedReviewLevel, "MAKER_CHECKER_REQUIRED");
  });

  await test("6. Grounded AI verifier: rejects nonexistent and unauthorized evidence IDs", () => {
    const allowed = vault.getEvidenceForRecord("pay_101");
    const result = aiVerifier.verifyAndSanitizeDecision({
      rawSummary: "Hypothesis: Payment matches invoice",
      rawReason: "Citing invoice and external fabricated reference",
      citedEvidenceIds: ["ev_invoice_inv_2026_901_nonexistent", "ev_fake_id"],
      recommendedAction: "Auto-approve settlement",
      confidence: 95,
      allowedEvidence: allowed,
      contradictions: [],
    });

    assert.equal(result.decisionOutcome, "DISPUTED_HYPOTHESIS");
    assert.equal(result.confidence, 0);
    assert.equal(result.authorityNotice, "AI_READ_ONLY_SUGGESTION_CANNOT_WRITE_LEDGER");
  });

  await test("7. DEMO CASE A: Refund explains difference (Payment 20,000 - Settlement 18,450 = Refund 1,550)", () => {
    const vaultCaseA = new ContextVault();
    const emailCaseA = adapter.ingestEmail({
      sender: "support@merchant.com",
      subject: "Refund Confirmation for ord_case_a",
      body: "Partial refund of INR 1,550 processed due to damaged packaging.",
      messageId: "MSG-CASE-A-REFUND",
      linkedRecords: { paymentIds: ["pay_case_a"] },
    });
    vaultCaseA.addEvidence(emailCaseA);

    const allowed = vaultCaseA.getEvidenceForRecord("pay_case_a");
    assert.equal(allowed.length, 1);

    const aiResult = aiVerifier.verifyAndSanitizeDecision({
      rawSummary: "The ₹1,550 shortfall between payment ₹20,000 and settlement ₹18,450 is fully explained by partial refund MSG-CASE-A-REFUND.",
      rawReason: "Customer support confirmed partial refund of ₹1,550 with matching order reference.",
      citedEvidenceIds: [emailCaseA.evidenceId],
      recommendedAction: "Confirm partial refund adjustment and clear exception.",
      confidence: 96,
      allowedEvidence: allowed,
      contradictions: [],
    });

    assert.equal(aiResult.decisionOutcome, "AGREED_SUGGESTION");
    assert.equal(aiResult.confidence, 96);
    assert.equal(aiResult.evidenceIds[0], emailCaseA.evidenceId);
  });

  await test("8. DEMO CASE B: Contradictory evidence escalates to Maker/Checker", () => {
    const vaultCaseB = new ContextVault();
    vaultCaseB.addEvidence({
      evidenceId: "ev_bank_case_b",
      sourceType: "BANK_RECORD",
      sourceReference: "BANK-TXN-B",
      title: "Bank Statement",
      createdAt: new Date(),
      observedAt: new Date(),
      accessClassification: "CONFIDENTIAL",
      linkedRecords: { paymentIds: ["pay_case_b"] },
      provider: "BANK",
      structuredData: { amountPaise: 1845000 },
    });
    vaultCaseB.addEvidence({
      evidenceId: "ev_setl_case_b",
      sourceType: "SETTLEMENT",
      sourceReference: "SETL-TXN-B",
      title: "Gateway Settlement",
      createdAt: new Date(),
      observedAt: new Date(),
      accessClassification: "CONFIDENTIAL",
      linkedRecords: { paymentIds: ["pay_case_b"] },
      provider: "GATEWAY",
      structuredData: { amountPaise: 1800000 },
    });

    const conflicts = vaultCaseB.detectContradictions("pay_case_b");
    assert.equal(conflicts.length, 1);

    const aiResult = aiVerifier.verifyAndSanitizeDecision({
      rawSummary: "Attempted match",
      rawReason: "Conflicting amounts reported",
      citedEvidenceIds: ["ev_bank_case_b", "ev_setl_case_b"],
      recommendedAction: "Auto-approve",
      confidence: 90,
      allowedEvidence: vaultCaseB.getEvidenceForRecord("pay_case_b"),
      contradictions: conflicts,
    });

    assert.equal(aiResult.decisionOutcome, "CONFLICTING_EVIDENCE");
    assert.ok(aiResult.confidence <= 45);
    assert.ok(aiResult.recommendedAction.includes("Maker/Checker"));
  });

  await test("9. DEMO CASE C: Missing context returns INSUFFICIENT_EVIDENCE", () => {
    const vaultCaseC = new ContextVault();
    const allowed = vaultCaseC.getEvidenceForRecord("pay_unknown");
    assert.equal(allowed.length, 0);

    const aiResult = aiVerifier.verifyAndSanitizeDecision({
      rawSummary: "Fabricated explanation",
      rawReason: "No evidence in vault",
      citedEvidenceIds: [],
      recommendedAction: "Approve blindly",
      confidence: 80,
      allowedEvidence: allowed,
      contradictions: [],
    });

    assert.equal(aiResult.decisionOutcome, "INSUFFICIENT_EVIDENCE");
    assert.equal(aiResult.evidenceIds.length, 0);
  });

  await test("10. DEMO CASE D: Tampered evidence triggers TAMPER_DETECTED", () => {
    const vaultCaseD = new ContextVault();
    const note = adapter.ingestAnalystNote({
      author: "Analyst D",
      text: "Authentic adjustment approval",
      noteId: "NOTE-D-01",
      linkedRecords: { paymentIds: ["pay_case_d"] },
    });

    const registered = vaultCaseD.addEvidence(note);
    assert.equal(vaultCaseD.verifyEvidence(registered.evidenceId), "VALID");

    // Alter text directly
    registered.rawText = "MODIFIED TEXT: Unauthorized override";
    assert.equal(vaultCaseD.verifyEvidence(registered.evidenceId), "TAMPER_DETECTED");
  });

  console.log("\nevidence-vault: ALL 10 PASSED\n");
}

void runTests();
