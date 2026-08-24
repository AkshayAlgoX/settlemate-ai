/*
 * SettleMate AI — CLI Offline Receipt Verifier
 *
 * Usage: npm run verify:receipt -- <receipt-file.json>
 */

import fs from "node:fs";
import { OfflineReceiptVerifier } from "../src/lib/ledger/receipt-verifier";
import type { SealedDecisionReceipt } from "../src/lib/ledger/decision-receipt";

function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: npm run verify:receipt -- <path-to-receipt.json>");
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error("Receipt file not found:", filePath);
    process.exit(1);
  }

  const raw = fs.readFileSync(filePath, "utf8");
  let sealed: SealedDecisionReceipt;
  try {
    sealed = JSON.parse(raw);
  } catch (err) {
    console.error("Invalid JSON format in receipt file:", (err as Error).message);
    process.exit(1);
  }

  const verifier = new OfflineReceiptVerifier();
  const report = verifier.verifyReceipt(sealed);

  console.log("\n=========================================================================");
  console.log(" ⚖️  SETTLEMATE AI — OFFLINE RECEIPT VERIFICATION REPORT");
  console.log("=========================================================================\n");
  console.log("Receipt ID:  ", report.receiptId);
  console.log("Record ID:   ", report.recordId);
  console.log("Expected:    ", report.expectedHash);
  console.log("Recomputed:  ", report.recomputedHash);
  console.log("\nVerification Steps:");

  for (const s of report.steps) {
    const icon = s.status === "PASS" ? "✅" : s.status === "NOT_APPLICABLE" ? "⚪" : "❌";
    console.log(`  ${icon} ${s.step.padEnd(22)} : ${s.status.padEnd(6)} | ${s.detail}`);
  }

  console.log(`\nVERDICT: ${report.verdict}`);
  if (report.firstMismatch) {
    console.log("FIRST MISMATCH:", report.firstMismatch);
    process.exit(1);
  }
}

main();
