/*
 * SettleMate AI — Judge Demo: Independent Replay & Receipt Verification (Day 7)
 *
 * Demonstrates independent offline verification of a reconciliation decision:
 *   1. Generates and seals an authentic Canonical Decision Receipt
 *   2. Recomputes all arithmetic, invariants, hashes, and Merkle proofs (VERIFIED)
 *   3. Injects deliberate adversarial tampering into the receipt
 *   4. Proves offline verifier catches tampering deterministically (VERIFICATION FAILED)
 */

import { createHash } from "node:crypto";
import { createDecisionReceipt, type CanonicalDecisionReceipt } from "../src/lib/ledger/decision-receipt";
import { OfflineReceiptVerifier } from "../src/lib/ledger/receipt-verifier";

function sha256(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

function runDemo() {
  console.log("\n=========================================================================");
  console.log(" ⚖️  SETTLEMATE AI — INDEPENDENT DECISION RECEIPT & REPLAY VERIFIER");
  console.log("=========================================================================\n");

  const verifier = new OfflineReceiptVerifier();

  // Step 1: Create Authentic Canonical Decision Receipt
  const inputHash = sha256("PAY_1001:AMOUNT=2000000:SETL_882:AMOUNT=1845000:REF_8821:AMOUNT=155000");
  const policyHash = sha256("POLICY_V1_TOLERANCE_100_WINDOW_48H");
  const ledgerHash = sha256("LEDGER_TX_9001:DEBIT=2000000:CREDIT=1845000:REFUND=155000");
  const merkleRoot = sha256("MERKLE_ROOT_BATCH_DEMO_20260824");
  const claimHash = sha256("CLAIM_C17:REFUND_EXPLAINS_155000_VARIANCE");

  const baseParams: Omit<CanonicalDecisionReceipt, "receiptVersion"> = {
    receiptId: "rcpt_demo_1001",
    runId: "run_prod_882",
    recordId: "pay_1001",
    batchId: "batch_demo_2026",
    inputFingerprint: inputHash,
    engineVersion: "1.0.0",
    policyId: "standard_ecommerce",
    policyVersion: "1",
    policyHash: policyHash,
    cardinalityType: "1:1",
    matchedSourceIds: {
      paymentIds: ["pay_1001"],
      settlementIds: ["setl_882"],
      bankTxnIds: ["bank_882"],
    },
    financialAmounts: {
      grossPaise: 2000000, // ₹20,000.00
      feePaise: 0,
      taxPaise: 0,
      refundPaise: 155000, // ₹1,550.00
      chargebackPaise: 0,
      netPaise: 1845000, // ₹18,450.00
      variancePaise: 155000,
    },
    invariantResults: [
      { code: "MONEY_CONSERVATION", passed: true, message: "Gross (2000000) - Deductions (155000) == Net (1845000)" },
      { code: "TIMING_WINDOW_VALID", passed: true, message: "Settlement latency 12.0h <= 48h policy limit" },
      { code: "CARDINALITY_UNIQUE", passed: true, message: "Transaction record consumed in exactly 1 match" },
    ],
    riskDecision: "MATCHED_WITH_EVIDENCE_EXPLANATION",
    aiClaimReceipt: {
      receiptId: "claim_rcpt_demo",
      totalClaimsCount: 1,
      verifiedClaimsCount: 1,
      disputedClaimsCount: 0,
      unsupportedClaimsCount: 0,
      abstain: false,
      canonicalHash: claimHash,
    },
    makerChecker: {
      approvedBy: "finance_controller_1",
      approvedAt: "2026-08-24T18:00:00.000Z",
      actionTaken: "VERIFIED_AND_LEDGER_SEALED",
    },
    ledgerEntryId: "ledger_entry_9001",
    ledgerStateHash: ledgerHash,
    merkleRoot: merkleRoot,
    timestamp: "2026-08-24T18:00:00.000Z",
  };

  const sealedReceipt = createDecisionReceipt(baseParams);

  console.log("--- [STAGE 1] VERIFYING AUTHENTIC DECISION RECEIPT ---");
  const report = verifier.verifyReceipt(sealedReceipt);

  for (const step of report.steps) {
    const icon = step.status === "PASS" ? "✅" : step.status === "NOT_APPLICABLE" ? "⚪" : "❌";
    console.log(`  ${icon} ${step.step.padEnd(22)} : ${step.status.padEnd(6)} | ${step.detail}`);
  }

  console.log(`\n  🏆 OVERALL DECISION RECEIPT STATUS: ${report.verdict}\n`);

  // Step 2: Tamper Attack Demonstration
  console.log("--- [STAGE 2] DELIBERATE ADVERSARIAL TAMPERING ATTACK ---");
  console.log("  [Attack]: Maliciously modifying gross amount from ₹20,000 to ₹25,000...");

  const tamperedSealed = {
    ...sealedReceipt,
    receipt: {
      ...sealedReceipt.receipt,
      financialAmounts: {
        ...sealedReceipt.receipt.financialAmounts,
        grossPaise: 2500000, // ₹25,000 (tampered!)
      },
    },
  };

  const tamperedReport = verifier.verifyReceipt(tamperedSealed);

  for (const step of tamperedReport.steps) {
    const icon = step.status === "PASS" ? "✅" : step.status === "NOT_APPLICABLE" ? "⚪" : "❌";
    console.log(`  ${icon} ${step.step.padEnd(22)} : ${step.status.padEnd(6)} | ${step.detail}`);
  }

  console.log(`\n  🛡️  TAMPER ATTACK RESULT: ${tamperedReport.verdict}`);
  console.log(`  🚨 FIRST DETECTED MISMATCH: ${tamperedReport.firstMismatch}\n`);
}

runDemo();
