/*
 * SettleMate AI — Reconciliation Error Handling & 422 INCOMPLETE_INPUT Tests
 */

import { strictEqual, ok } from "node:assert";
import { ControlFailureError, type InvariantReport } from "../src/lib/reconciliation/invariants";
import {
  buildControlFailureResponse,
  buildIncompleteRecordsError,
} from "../src/lib/reconciliation/control-error";
import { POST as sandboxReconcilePost } from "../src/app/api/sandbox/reconcile/route";
import { NextRequest } from "next/server";

async function runReconciliationErrorTests() {
  console.log("\n=========================================================================");
  console.log(" 🧪 SETTLEMATE AI — RECONCILIATION ERROR HANDLING & INVARIANT TESTS");
  console.log("=========================================================================\n");

  // 1. Test buildIncompleteRecordsError
  {
    console.log(" [1/4] Testing buildIncompleteRecordsError payload format...");
    const missing = ["bankCredits", "bankDebits"];
    const errPayload = buildIncompleteRecordsError(missing);

    strictEqual(errPayload.error.code, "INCOMPLETE_INPUT", "Error code must be INCOMPLETE_INPUT");
    ok(
      errPayload.error.message.includes("The uploaded file does not contain all required record types"),
      "Message must describe missing record requirement"
    );
    ok(
      errPayload.error.message.includes("Missing: bankCredits, bankDebits."),
      "Message must enumerate missing types"
    );
    console.log("   ✓ Formatted incomplete records error: " + errPayload.error.message);
  }

  // 2. Test buildControlFailureResponse with missing payments & bank credits
  {
    console.log(" [2/4] Testing buildControlFailureResponse with zero bank credits...");
    const mockReport: InvariantReport = {
      passed: false,
      failures: [
        {
          code: "INVARIANT_INPUT_COMPLETE",
          reason: "Bank credits missing in batch input",
          expected: 1,
          actual: 0,
          tolerance: 0,
        },
      ],
      checkedCounts: {
        payments: 10,
        results: 0,
        capturedPayments: 10,
        refunds: 0,
        chargebacks: 1,
        bankCredits: 0,
        bankDebits: 0,
        relationships: 0,
      },
      checkedAmounts: {
        expectedNetTotal: 50000,
        capturedAmount: 50000,
        refundTotal: 0,
        chargebackTotal: 1000,
        creditTotal: 0,
        debitTotal: 0,
        unexplainedCredit: 0,
        unexplainedDebit: 1000,
      },
    };

    const ctrlErr = new ControlFailureError(mockReport);
    const response = buildControlFailureResponse(ctrlErr);

    strictEqual(response.error.code, "INCOMPLETE_INPUT");
    ok(response.error.message.includes("bankCredits"), "Identifies missing bankCredits");
    ok(response.error.message.includes("bankDebits"), "Identifies missing bankDebits for chargebacks");
    console.log("   ✓ Generated error response: " + response.error.message);
  }

  // 3. Test buildControlFailureResponse fallback when specific counts are absent
  {
    console.log(" [3/4] Testing buildControlFailureResponse general fallback guidance...");
    const mockReport: InvariantReport = {
      passed: false,
      failures: [
        {
          code: "INVARIANT_INPUT_COMPLETE",
          reason: "Input batch is incomplete",
          expected: 1,
          actual: 0,
          tolerance: 0,
        },
      ],
      checkedCounts: {},
      checkedAmounts: {},
    };

    const ctrlErr = new ControlFailureError(mockReport);
    const response = buildControlFailureResponse(ctrlErr);

    strictEqual(response.error.code, "INCOMPLETE_INPUT");
    ok(response.error.message.includes("payments"), "Identifies missing payments from failure code");
    console.log("   ✓ Fallback message: " + response.error.message);
  }

  // 4. Test Sandbox reconciliation with incomplete CSV (missing bank credits/debits)
  {
    console.log(" [4/4] Testing sandbox reconciliation handling with valid multi-record vs incomplete CSV...");
    const INCOMPLETE_CSV = `source,amount,currency,date,reference_id
PAYMENT,5000,INR,2026-08-20,TXN_INCOMPLETE_1`;

    const req = new NextRequest("http://localhost:3000/api/sandbox/reconcile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csvContent: INCOMPLETE_CSV }),
    });

    const res = await sandboxReconcilePost(req);
    // Sandbox either runs and marks exception, or returns error code
    const data = await res.json();
    if (res.status === 422) {
      strictEqual(data.error.code, "INCOMPLETE_INPUT");
      console.log("   ✓ Sandbox returned 422 INCOMPLETE_INPUT as expected");
    } else {
      strictEqual(res.status, 200);
      ok(data.summary.total === 1 && data.summary.exception === 1, "Single payment without settlement/bank is flagged exception");
      console.log("   ✓ Sandbox isolated missing counterpart as reconciliation exception");
    }
  }

  console.log("\n=========================================================================");
  console.log(" ✅ ALL 4 RECONCILIATION ERROR HANDLING TESTS PASSED");
  console.log("=========================================================================\n");
}

runReconciliationErrorTests().catch((err) => {
  console.error("Reconciliation error test failure:", err);
  process.exit(1);
});
