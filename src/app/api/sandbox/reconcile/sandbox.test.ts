/*
 * SettleMate AI — Interactive Sandbox API Unit & Contract Tests
 */

import { strictEqual, ok } from "node:assert";
import { POST } from "./route";
import { NextRequest } from "next/server";

const VALID_CSV = `source,amount,currency,date,reference_id
PAYMENT,5000,INR,2026-08-20,TXN_101
SETTLEMENT,5000,INR,2026-08-21,TXN_101
BANK_TXN,5000,INR,2026-08-21,TXN_101
PAYMENT,12000,INR,2026-08-20,TXN_102
SETTLEMENT,12000,INR,2026-08-21,TXN_102
BANK_TXN,12000,INR,2026-08-21,TXN_102
PAYMENT,20000,INR,2026-08-20,TXN_103
SETTLEMENT,18450,INR,2026-08-21,TXN_103
REFUND,1550,INR,2026-08-21,TXN_103
PAYMENT,7500,INR,2026-08-20,TXN_104`;

async function runSandboxTests() {
  console.log("\n=========================================================================");
  console.log(" 🧪 SETTLEMATE AI — INTERACTIVE SANDBOX RECONCILIATION TESTS");
  console.log("=========================================================================\n");

  // 1. Test Valid CSV Upload & Minor Unit Conversion
  {
    console.log(" [1/5] Testing valid CSV reconciliation & summary aggregation...");
    const req = new NextRequest("http://localhost:3000/api/sandbox/reconcile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csvContent: VALID_CSV }),
    });

    const res = await POST(req);
    strictEqual(res.status, 200, "Should return 200 OK for valid CSV");

    const json = await res.json();
    ok(json.success, "Response should be marked success");
    strictEqual(json.summary.total, 4, "Should process 4 distinct payment contexts");
    ok(json.summary.autoMatched >= 2, "Should auto-match clean 1:1 records");
    ok(json.exceptions.length >= 1, "Should isolate TXN_104 or unresolved items as exceptions");
    console.log("   ✓ Processed 4 payments: " + json.summary.autoMatched + " matched, " + json.exceptions.length + " exceptions");
  }

  // 2. Test Missing Required Columns
  {
    console.log(" [2/5] Testing schema validation (missing required columns)...");
    const INVALID_CSV = `source,amount,date
PAYMENT,5000,2026-08-20`;

    const req = new NextRequest("http://localhost:3000/api/sandbox/reconcile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csvContent: INVALID_CSV }),
    });

    const res = await POST(req);
    strictEqual(res.status, 400, "Should reject missing columns with 400 Bad Request");
    const json = await res.json();
    ok(json.error.includes("Missing required CSV column"), "Error should cite missing columns");
    console.log("   ✓ Correctly rejected missing columns: " + json.error);
  }

  // 3. Test Row Count Limit (>100 Rows)
  {
    console.log(" [3/5] Testing row count limit enforcement (>100 rows)...");
    let HUGE_CSV = "source,amount,currency,date,reference_id\n";
    for (let i = 1; i <= 105; i++) {
      HUGE_CSV += `PAYMENT,100,INR,2026-08-20,TXN_${i}\n`;
    }

    const req = new NextRequest("http://localhost:3000/api/sandbox/reconcile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csvContent: HUGE_CSV }),
    });

    const res = await POST(req);
    strictEqual(res.status, 400, "Should reject >100 rows with 400 Bad Request");
    const json = await res.json();
    ok(json.error.includes("exceeds 100 row maximum limit"), "Error should cite 100 row maximum limit");
    console.log("   ✓ Correctly bounded row count: " + json.error);
  }

  // 4. Test Empty CSV Handling
  {
    console.log(" [4/5] Testing empty CSV handling...");
    const req = new NextRequest("http://localhost:3000/api/sandbox/reconcile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csvContent: "   " }),
    });

    const res = await POST(req);
    strictEqual(res.status, 400, "Should reject empty CSV with 400 Bad Request");
    console.log("   ✓ Correctly rejected empty payload");
  }

  // 5. Test Multipart Form-Data Simulation
  {
    console.log(" [5/5] Testing raw text payload fallback...");
    const req = new NextRequest("http://localhost:3000/api/sandbox/reconcile", {
      method: "POST",
      headers: { "Content-Type": "text/csv" },
      body: VALID_CSV,
    });

    const res = await POST(req);
    strictEqual(res.status, 200, "Should accept text/csv Content-Type");
    const json = await res.json();
    ok(json.success, "Raw text parsing should succeed");
    console.log("   ✓ Successfully processed text/csv payload");
  }

  console.log("\n=========================================================================");
  console.log(" ✅ ALL 5 SANDBOX API RECONCILIATION TESTS PASSED");
  console.log("=========================================================================\n");
}

if (process.argv[1] && process.argv[1].includes("sandbox.test.ts")) {
  runSandboxTests().catch((err) => {
    console.error("Sandbox test failure:", err);
    process.exit(1);
  });
}
