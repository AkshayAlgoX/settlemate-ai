/*
 * SettleMate AI — Entity Resolver & Verification Gate Tests (Frontier 5)
 */

import assert from "node:assert/strict";
import { resolveEntityEdge } from "./entity-resolver";

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
  console.log(" SETTLEMATE AI — ENTITY RESOLVER & DETERMINISTIC GATE TESTS (F5)");
  console.log("=========================================================================\n");

  await test("1. Exact UTR match -> Promoted immediately to VERIFIED_EDGE (Ledger Eligible)", () => {
    const res = resolveEntityEdge(
      { entityId: "e1", name: "Acme Corp", utr: "UTR_MATCH_101" },
      { entityId: "e2", name: "Acme Enterprises", utr: "UTR_MATCH_101" }
    );
    assert.equal(res.edgeType, "VERIFIED_EDGE");
    assert.equal(res.isLedgerEligible, true);
    assert.equal(res.verificationReason, "EXACT_UTR_MATCH");
  });

  await test("2. Spelling variation with no shared ID -> AI_SUGGESTED_EDGE (NOT Ledger Eligible)", () => {
    const res = resolveEntityEdge(
      { entityId: "e1", name: "Zomato Media Private Limited" },
      { entityId: "e2", name: "Zomato Media Pvt Ltd" }
    );
    assert.equal(res.edgeType, "AI_SUGGESTED_EDGE");
    assert.equal(res.isLedgerEligible, false); // Strict AI safety boundary
    assert.ok(res.similarityScore >= 0.75);
  });

  await test("3. Vague or conflicting entities -> AMBIGUOUS_ENTITY (Fail-closed)", () => {
    const res = resolveEntityEdge(
      { entityId: "e1", name: "Payment Gateway Payout" },
      { entityId: "e2", name: "Hotel Booking Services" }
    );
    assert.equal(res.edgeType, "AMBIGUOUS_ENTITY");
    assert.equal(res.isLedgerEligible, false);
  });

  await test("4. Precision Guarantee: 100 noisy candidate pairs yield 0 false ledger links", () => {
    let falseLedgerLinks = 0;
    for (let i = 0; i < 100; i++) {
      const res = resolveEntityEdge(
        { entityId: `src_${i}`, name: `Merchant A_${i}` },
        { entityId: `tgt_${i}`, name: `Merchant B_${i}` }
      );
      if (res.isLedgerEligible) falseLedgerLinks++;
    }
    assert.equal(falseLedgerLinks, 0);
  });

  console.log("\nentity-resolver: ALL 4 ENTITY RESOLUTION TESTS PASSED\n");
}

void runTests();
