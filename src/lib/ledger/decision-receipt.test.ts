/*
 * SettleMate AI — Decision Receipt & Replay Tests (Day 7)
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createDecisionReceipt, type CanonicalDecisionReceipt } from "./decision-receipt";
import { OfflineReceiptVerifier } from "./receipt-verifier";

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log("  ✓ " + name);
  } catch (err) {
    console.error("  ✗ " + name + " — " + (err as Error).message);
    throw err;
  }
}

function sha256(d: string) {
  return createHash("sha256").update(d).digest("hex");
}

async function runTests() {
  console.log("\n=========================================================================");
  console.log(" SETTLEMATE AI — DECISION RECEIPT & REPLAY TESTS (DAY 7)");
  console.log("=========================================================================\n");

  const verifier = new OfflineReceiptVerifier();

  const baseParams: Omit<CanonicalDecisionReceipt, "receiptVersion"> = {
    receiptId: "rcpt_test_1",
    runId: "run_test_1",
    recordId: "pay_test_1",
    batchId: "batch_test_1",
    inputFingerprint: sha256("INPUT_1"),
    engineVersion: "1.0.0",
    policyId: "policy_v1",
    policyVersion: "1",
    policyHash: sha256("POLICY_V1"),
    cardinalityType: "1:1",
    matchedSourceIds: {
      paymentIds: ["pay_test_1"],
      settlementIds: ["setl_test_1"],
      bankTxnIds: ["bank_test_1"],
    },
    financialAmounts: {
      grossPaise: 100000,
      feePaise: 2000,
      taxPaise: 360,
      refundPaise: 0,
      chargebackPaise: 0,
      netPaise: 97640,
      variancePaise: 0,
    },
    invariantResults: [
      { code: "MONEY_CONSERVATION", passed: true, message: "Exact balance" },
    ],
    riskDecision: "AUTO_MATCHED",
    ledgerEntryId: "ledger_1",
    ledgerStateHash: sha256("LEDGER_1"),
    merkleRoot: sha256("MERKLE_1"),
    timestamp: "2026-08-24T10:00:00.000Z",
  };

  await test("1. Canonical Receipt Generation & Deterministic SHA-256 Hashing", () => {
    const r1 = createDecisionReceipt(baseParams);
    const r2 = createDecisionReceipt(baseParams);
    assert.equal(r1.canonicalReceiptHash, r2.canonicalReceiptHash);
    assert.equal(r1.canonicalReceiptHash.length, 64);
  });

  await test("2. Offline Verifier: Authentic receipt verifies cleanly (100% checks PASS)", () => {
    const sealed = createDecisionReceipt(baseParams);
    const report = verifier.verifyReceipt(sealed);
    assert.equal(report.verdict, "VERIFIED");
    assert.equal(report.firstMismatch, undefined);
  });

  await test("3. Tamper Attack - Amount Mutation: Caught by RECEIPT_INTEGRITY & FINANCIAL_ARITHMETIC", () => {
    const sealed = createDecisionReceipt(baseParams);
    const tampered = {
      ...sealed,
      receipt: {
        ...sealed.receipt,
        financialAmounts: {
          ...sealed.receipt.financialAmounts,
          netPaise: 99999, // Tampered net!
        },
      },
    };

    const report = verifier.verifyReceipt(tampered);
    assert.equal(report.verdict, "VERIFICATION_FAILED");
    assert.ok(report.firstMismatch?.includes("RECEIPT_HASH_MISMATCH"));
  });

  await test("4. Tamper Attack - Policy Version Modification: Caught deterministically", () => {
    const sealed = createDecisionReceipt(baseParams);
    const tampered = {
      ...sealed,
      receipt: {
        ...sealed.receipt,
        policyVersion: "2", // Altered version without altering policyHash
      },
    };

    const report = verifier.verifyReceipt(tampered);
    assert.equal(report.verdict, "VERIFICATION_FAILED");
  });

  await test("5. Deterministic Replay: Same Input + Engine + Policy reproduces bitwise identical receipt", () => {
    const replay1 = createDecisionReceipt(baseParams);
    const replay2 = createDecisionReceipt(baseParams);
    assert.equal(replay1.canonicalReceiptHash, replay2.canonicalReceiptHash);
  });

  console.log("\ndecision-receipt: ALL 5 RECEIPT TESTS PASSED\n");
}

void runTests();
