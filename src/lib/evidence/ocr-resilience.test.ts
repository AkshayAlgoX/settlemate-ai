/*
 * SettleMate AI — OCR Normalization & Degraded-Source Resilience Tests (Day 8)
 */

import assert from "node:assert/strict";
import {
  normalizeOcrIdentifier,
  extractCandidateEntities,
  resolveEntityLink,
} from "./ocr-normalizer";
import { SourceLifecycleManager } from "./source-lifecycle";

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
  console.log(" SETTLEMATE AI — OCR NORMALIZATION & SOURCE RESILIENCE TESTS (DAY 8)");
  console.log("=========================================================================\n");

  await test("1. OCR Token Normalization: Resolves O/0, I/1, and punctuation garbage", () => {
    assert.equal(normalizeOcrIdentifier("INV-O023"), "INV-0023");
    assert.equal(normalizeOcrIdentifier("#PAY-l001:"), "PAY-1001");
    assert.equal(normalizeOcrIdentifier("UTR_CMS-O882"), "UTR-CMS-0882");

    const raw = "Commercial Invoice # INV-O023\nAmount: ₹ 20,000.00 Ref: PAY#1001";
    const entities = extractCandidateEntities(raw);

    const inv = entities.find((e) => e.type === "INVOICE_ID");
    const pay = entities.find((e) => e.type === "PAYMENT_ID");
    const amt = entities.find((e) => e.type === "AMOUNT_PAISE");

    assert.ok(inv);
    assert.equal(inv.normalizedValue, "INV-0023");
    assert.ok(pay);
    assert.equal(pay.normalizedValue, "pay_1001");
    assert.ok(amt);
    assert.equal(amt.normalizedValue, "2000000"); // 20,000.00 INR = 2,000,000 paise
  });

  await test("2. Fuzzy Entity Resolution with Ambiguity Defense", () => {
    const knownIds = ["INV-2026-001", "INV-2026-002", "INV-2026-999"];

    // A. Single near match -> VERIFIED
    const resA = resolveEntityLink("INV-2026-O01", knownIds);
    assert.equal(resA.status, "VERIFIED_FUZZY_NORMALIZED");
    assert.equal(resA.matchedId, "INV-2026-001");

    // B. Ambiguous match -> AMBIGUOUS_MULTIPLE_CANDIDATES (Do NOT guess!)
    const resB = resolveEntityLink("INV-2026-00", knownIds);
    assert.equal(resB.status, "AMBIGUOUS_MULTIPLE_CANDIDATES");
    assert.equal(resB.competingMatches.length, 2); // Matches both 001 and 002

    // C. Nonexistent target -> UNRESOLVED_NO_MATCH
    const resC = resolveEntityLink("INV-XYZ-999", knownIds);
    assert.equal(resC.status, "UNRESOLVED_NO_MATCH");
  });

  await test("3. Source Outage Lifecycle & Exponential Backoff Tracking", () => {
    const mgr = new SourceLifecycleManager({ defaultSlaHours: 48 });
    const now = new Date("2026-08-20T10:00:00Z");

    const entry = mgr.registerOutage("src_razorpay_webhook", "WEBHOOK", "RAZORPAY", now);
    assert.equal(entry.status, "SOURCE_UNAVAILABLE");
    assert.equal(entry.retryCount, 0);

    // Attempt 1: 1 min later
    const att1 = mgr.recordRetryAttempt("src_razorpay_webhook", new Date(now.getTime() + 60_000));
    assert.equal(att1?.status, "PENDING_RETRY");
    assert.equal(att1?.retryCount, 1);

    // Past SLA deadline (50h later) -> DELAYED_SLA_BREACHED
    const attLate = mgr.recordRetryAttempt("src_razorpay_webhook", new Date(now.getTime() + 50 * 3600_000));
    assert.equal(attLate?.status, "DELAYED_SLA_BREACHED");
  });

  await test("4. Idempotent Recovery Webhook Delivery & Conflict Detection", () => {
    const mgr = new SourceLifecycleManager();
    const now = new Date("2026-08-20T10:00:00Z");
    mgr.registerOutage("src_bank_feed", "BANK_RECORD", "HDFC", now);

    const payloadA = { txnId: "bank_882", amount: 1845000, utr: "UTR_882" };
    const payloadB = { txnId: "bank_882", amount: 1200000, utr: "UTR_882" }; // Conflicting amount!

    // First delivery -> RECOVERED_NEW
    const rec1 = mgr.handleRecoveryWebhook("src_bank_feed", payloadA, now);
    assert.equal(rec1.status, "RECOVERED_NEW");
    assert.equal(rec1.entry.status, "AVAILABLE");

    // Exact duplicate delivery -> IDEMPOTENT_DUPLICATE
    const recDup = mgr.handleRecoveryWebhook("src_bank_feed", payloadA, new Date(now.getTime() + 1000));
    assert.equal(recDup.status, "IDEMPOTENT_DUPLICATE");

    // Conflicting delivery -> CONFLICTING_PAYLOAD
    const recConf = mgr.handleRecoveryWebhook("src_bank_feed", payloadB, new Date(now.getTime() + 2000));
    assert.equal(recConf.status, "CONFLICTING_PAYLOAD");
    assert.equal(recConf.entry.status, "CONFLICTING_DATA_RECEIVED");
  });

  await test("5. Deterministic Evidence Completeness Score & AI Abstention Gate", () => {
    const mgr = new SourceLifecycleManager();

    // Complete: Payment + Bank + Invoice
    const comp1 = mgr.evaluateCompleteness(["PAYMENT", "BANK_RECORD", "INVOICE"]);
    assert.equal(comp1.state, "COMPLETE");
    assert.equal(comp1.scorePct, 100);
    assert.equal(comp1.aiMustAbstain, false);
    assert.equal(comp1.canAutoFinalize, true);

    // Missing Critical: Payment only (Missing Bank record)
    const comp2 = mgr.evaluateCompleteness(["PAYMENT"]);
    assert.equal(comp2.state, "MISSING_CRITICAL_SOURCE");
    assert.equal(comp2.aiMustAbstain, true); // AI MUST ABSTAIN!
    assert.equal(comp2.canAutoFinalize, false);
  });

  console.log("\nocr-resilience: ALL 5 OCR & SOURCE RESILIENCE TESTS PASSED\n");
}

void runTests();
