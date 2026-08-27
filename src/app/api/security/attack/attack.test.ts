/*
 * SettleMate AI — Security & Adversarial Defense Lab Contract & Unit Tests
 */

import { strictEqual, ok } from "node:assert";
import { POST } from "./route";
import { NextRequest } from "next/server";

const ALL_VECTORS = [
  "ai-injection",
  "dense-cardinality",
  "receipt-tamper",
  "tolerance-stacking",
  "ocr-corruption",
  "source-outage",
  "cas-race",
  "temporal-boundary",
  "partition-invariance",
  "streaming-chaos",
];

async function runAttackTests() {
  console.log("\n=========================================================================");
  console.log(" 🛡️  SETTLEMATE AI — SECURITY & ADVERSARIAL ATTACK API TESTS");
  console.log("=========================================================================\n");

  // 1. Test Each Attack Vector Individually
  for (let i = 0; i < ALL_VECTORS.length; i++) {
    const vec = ALL_VECTORS[i];
    console.log(` [${i + 1}/11] Testing attack vector simulation: ${vec}...`);

    const req = new NextRequest("http://localhost:3000/api/security/attack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attackId: vec }),
    });

    const res = await POST(req);
    strictEqual(res.status, 200, "Should return 200 OK");
    const json = await res.json();
    ok(json.success, "Response should be success");
    strictEqual(json.attack.blocked, true, `Attack ${vec} MUST be blocked`);
    ok(json.attack.defenseMechanism.length > 0, "Defense mechanism must be reported");
    ok(json.attack.evidenceSnippet.length > 0, "Evidence snippet must be reported");
    console.log(`   ✓ Vector #${json.attack.vectorNumber} (${vec}): BLOCKED via ${json.attack.defenseMechanism}`);
  }

  // 2. Test Batch All Attacks Execution
  {
    console.log(" [11/11] Testing batch simulation of all 10 attack vectors...");
    const req = new NextRequest("http://localhost:3000/api/security/attack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attackId: "all" }),
    });

    const res = await POST(req);
    strictEqual(res.status, 200, "Should return 200 OK for batch simulation");
    const json = await res.json();
    strictEqual(json.totalVectorsTested, 10, "Should test 10 vectors");
    strictEqual(json.totalVectorsDefended, 10, "Should defend 10/10 vectors");
    strictEqual(json.allBlocked, true, "All attacks must be blocked");
    console.log("   ✓ Batch execution: 10/10 attack vectors neutralized successfully");
  }

  console.log("\n=========================================================================");
  console.log(" ✅ ALL 11 SECURITY & ADVERSARIAL ATTACK TESTS PASSED");
  console.log("=========================================================================\n");
}

if (process.argv[1] && process.argv[1].includes("attack.test.ts")) {
  runAttackTests().catch((err) => {
    console.error("Attack test failure:", err);
    process.exit(1);
  });
}
