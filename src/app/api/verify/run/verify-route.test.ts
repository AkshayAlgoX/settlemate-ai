/*
 * SettleMate AI — Live Verification Hub Route Contract & Unit Tests
 */

import { strictEqual, ok } from "node:assert";
import { POST } from "./route";
import { NextRequest } from "next/server";

async function runVerifyRouteTests() {
  console.log("\n=========================================================================");
  console.log(" 🛡️  SETTLEMATE AI — VERIFICATION HUB API ROUTE TESTS");
  console.log("=========================================================================\n");

  // 1. Test Single Suite Execution (Decision Receipt Verifier)
  {
    console.log(" [1/3] Testing single suite on-demand execution (receipt)...");
    const req = new NextRequest("http://localhost:3000/api/verify/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suites: ["receipt"] }),
    });

    const res = await POST(req);
    strictEqual(res.status, 200, "Should return 200 OK");

    const json = await res.json();
    ok(json.success, "Response should indicate success");
    strictEqual(json.totalSuitesExecuted, 1, "Should execute exactly 1 suite");
    strictEqual(json.allPassed, true, "All executed suites should pass");
    ok(json.results.receipt, "Should include receipt suite result");
    strictEqual(json.results.receipt.status, "PASS", "Receipt suite should PASS");
    strictEqual(json.results.receipt.metrics.offlineVerdict, "VERIFIED", "Verdict should be VERIFIED");
    console.log("   ✓ Receipt verifier executed cleanly in " + json.results.receipt.durationMs + "ms");
  }

  // 2. Test Combinatorial Cardinality Suite Execution
  {
    console.log(" [2/3] Testing cardinality solver suite execution...");
    const req = new NextRequest("http://localhost:3000/api/verify/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suites: ["cardinality"] }),
    });

    const res = await POST(req);
    strictEqual(res.status, 200, "Should return 200 OK");

    const json = await res.json();
    ok(json.success, "Response should indicate success");
    strictEqual(json.results.cardinality.status, "PASS", "Cardinality suite should PASS");
    strictEqual(json.results.cardinality.metrics.topologiesPassed, "8/8", "Topologies should be 8/8");
    console.log("   ✓ Cardinality suite passed 8/8 topologies in " + json.results.cardinality.durationMs + "ms");
  }

  // 3. Test Response Metadata & Invariants
  {
    console.log(" [3/3] Testing timestamp, durations, and response contract...");
    const req = new NextRequest("http://localhost:3000/api/verify/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suites: ["claim-validator"] }),
    });

    const res = await POST(req);
    const json = await res.json();
    ok(json.timestamp, "Should include ISO timestamp");
    ok(typeof json.totalDurationMs === "number", "Should include total duration");
    ok(json.results["claim-validator"].metrics.throughput, "Should include throughput metric");
    console.log("   ✓ Response contract conforms to VerificationHubResponse");
  }

  console.log("\n=========================================================================");
  console.log(" ✅ ALL 3 VERIFICATION HUB API ROUTE TESTS PASSED");
  console.log("=========================================================================\n");
}

if (process.argv[1] && process.argv[1].includes("verify-route.test.ts")) {
  runVerifyRouteTests().catch((err) => {
    console.error("Verification Hub route test failure:", err);
    process.exit(1);
  });
}
