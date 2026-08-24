/*
 * SettleMate AI — Meet-in-the-Middle Exact N:M Cardinality Tests (Day 4–5)
 */

import assert from "node:assert/strict";
import { solveManyToManyMeetInMiddle, generateSubsetSums } from "./meet-in-middle";
import { findManyToManyMatch } from "./cardinality";
import type { NormalizedBankTxn, NormalizedSettlement } from "./types";

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log("  ✓ " + name);
  } catch (err) {
    console.error("  ✗ " + name + " — " + (err as Error).message);
    throw err;
  }
}

function makeSettlement(id: string, amount: number): NormalizedSettlement {
  const d = new Date("2026-08-20T10:00:00Z");
  return {
    dbId: `db_${id}`,
    settlementId: id,
    paymentId: `p_${id}`,
    amount,
    fee: 0,
    tax: 0,
    utr: `UTR_${id}`,
    status: "settled",
    settledAt: d,
    createdAt: d,
  };
}

function makeCredit(id: string, amount: number): NormalizedBankTxn {
  const d = new Date("2026-08-20T10:00:00Z");
  return {
    dbId: `db_${id}`,
    txnId: id,
    utr: `UTR_${id}`,
    amount,
    type: "CREDIT",
    narration: "BULK",
    txnDate: d,
    matched: false,
  };
}

async function runTests() {
  console.log("\n=========================================================================");
  console.log(" SETTLEMATE AI — MEET-IN-THE-MIDDLE N:M CARDINALITY TESTS");
  console.log("=========================================================================\n");

  const defaultConfig = {
    maxGroupSize: 6,
    maxCandidates: 24,
    tolerancePaise: 100,
    maxHours: 96,
  };

  await test("1. Subset Sum Generator: Generates all subsets within max count", () => {
    const items = [10, 20, 30];
    const subsets = generateSubsetSums(items, (x) => x, 2);
    // Subsets of sizes 0, 1, 2:
    // [] (0), [10] (10), [20] (20), [30] (30), [10,20] (30), [10,30] (40), [20,30] (50)
    assert.equal(subsets.length, 7);
  });

  await test("2. Exact N:M Match Equivalence: MITM resolves 3:2 aggregation identically to core solver", () => {
    // 3 settlements: 10000 + 20000 + 30000 = 60000 paise (₹600)
    // 2 credits: 25000 + 35000 = 60000 paise (₹600)
    const setls = [makeSettlement("s1", 10000), makeSettlement("s2", 20000), makeSettlement("s3", 30000)];
    const credits = [makeCredit("c1", 25000), makeCredit("c2", 35000)];

    const mitmMatch = solveManyToManyMeetInMiddle(setls, credits, defaultConfig);
    const directMatch = findManyToManyMatch(setls, credits, defaultConfig);

    assert.ok(mitmMatch);
    assert.ok(directMatch);
    assert.equal(mitmMatch.settlementAmount, 60000);
    assert.equal(mitmMatch.bankAmount, 60000);
    assert.equal(mitmMatch.differencePaise, 0);
    assert.deepEqual(mitmMatch.settlementIds, directMatch.settlementIds);
    assert.deepEqual(mitmMatch.bankTxnIds, directMatch.bankTxnIds);
  });

  await test("3. No-Match / Impossible Prime Cluster: MITM returns null (0 fabricated links)", () => {
    const primesS = [10007, 10009, 10037, 10039];
    const primesC = [50021, 50023, 50047];

    const setls = primesS.map((p, i) => makeSettlement(`sp_${i}`, p));
    const credits = primesC.map((p, i) => makeCredit(`cp_${i}`, p));

    const zeroTolConfig = { ...defaultConfig, tolerancePaise: 0 };
    const match = solveManyToManyMeetInMiddle(setls, credits, zeroTolConfig);
    assert.equal(match, null);
  });

  await test("4. Multiple Valid Solutions: Deterministic selection picks lowest difference and fewest items", () => {
    // Solution A: 2 items = 50000 (diff 0)
    // Solution B: 3 items = 50000 (diff 0)
    const setls = [
      makeSettlement("s1", 25000),
      makeSettlement("s2", 25000),
      makeSettlement("s3", 10000),
      makeSettlement("s4", 20000),
      makeSettlement("s5", 20000),
    ];
    const credits = [makeCredit("c1", 25000), makeCredit("c2", 25000)];

    const match = solveManyToManyMeetInMiddle(setls, credits, defaultConfig);
    assert.ok(match);
    assert.equal(match.settlementAmount, 50000);
    // Should prefer the 2-item settlement solution over the 3-item solution
    assert.equal(match.settlementIds.length, 2);
  });

  await test("5. Tolerance Boundary Edge: Matches when variance is exactly within tolerance", () => {
    const setls = [makeSettlement("s1", 25050), makeSettlement("s2", 25000)]; // 50050 paise
    const credits = [makeCredit("c1", 25000), makeCredit("c2", 25000)]; // 50000 paise (diff = 50 paise <= 100 paise tolerance)

    const match = solveManyToManyMeetInMiddle(setls, credits, defaultConfig);
    assert.ok(match);
    assert.equal(match.differencePaise, 50);
    assert.equal(match.reasonCode, "TOLERATED_MANY_TO_MANY_CORRELATION");
  });

  console.log("\nmeet-in-middle: ALL 5 N:M MITM TESTS PASSED\n");
}

void runTests();
