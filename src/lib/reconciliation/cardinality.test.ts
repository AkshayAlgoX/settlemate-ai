import {
  findSettlementGroupForBank,
  findBankGroupForSettlement,
  findManyToManyMatch,
} from "./cardinality";
import type {
  NormalizedBankTxn,
  NormalizedSettlement,
} from "./types";

const date = new Date("2025-08-05T10:00:00Z");

function settlement(
  id: string,
  amount: number,
): NormalizedSettlement {
  return {
    dbId: `db_${id}`,
    settlementId: id,
    paymentId: `pay_${id}`,
    amount,
    fee: 0,
    tax: 0,
    utr: null,
    status: "processed",
    settledAt: date,
    createdAt: date,
  };
}

function bank(
  id: string,
  amount: number,
): NormalizedBankTxn {
  return {
    dbId: `db_${id}`,
    txnId: id,
    utr: null,
    amount,
    type: "CREDIT",
    narration: "TEST BANK CREDIT",
    txnDate: date,
    matched: false,
  };
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function testNto1(): void {
  const result = findSettlementGroupForBank(
    [
      settlement("setl_1", 10000),
      settlement("setl_2", 25000),
      settlement("setl_3", 15000),
    ],
    bank("bank_1", 50000),
  );

  assert(result !== null, "N:1 should match");
  assert(result?.type === "N:1", "Expected N:1");
  assert(
    result?.settlementIds.length === 3,
    "Expected 3 settlements",
  );
  assert(
    result?.bankTxnIds.length === 1,
    "Expected 1 bank credit",
  );
  assert(
    result?.differencePaise === 0,
    "Expected exact N:1 match",
  );

  console.log("✓ N:1 aggregation");
}

function testOneToN(): void {
  const result = findBankGroupForSettlement(
    settlement("setl_4", 50000),
    [
      bank("bank_2", 10000),
      bank("bank_3", 25000),
      bank("bank_4", 15000),
    ],
  );

  assert(result !== null, "1:N should match");
  assert(result?.type === "1:N", "Expected 1:N");
  assert(
    result?.settlementIds.length === 1,
    "Expected 1 settlement",
  );
  assert(
    result?.bankTxnIds.length === 3,
    "Expected 3 bank credits",
  );
  assert(
    result?.differencePaise === 0,
    "Expected exact 1:N match",
  );

  console.log("✓ 1:N aggregation");
}

function testNtoM(): void {
  const result = findManyToManyMatch(
  [
    settlement("setl_10", 30000),
    settlement("setl_11", 20000),
    settlement("setl_12", 70000),
  ],
  [
    bank("bank_10", 25000),
    bank("bank_11", 25000),
    bank("bank_12", 70000),
  ],
);

  assert(result !== null, "N:M should match");
  assert(result?.type === "N:M", "Expected N:M");
  assert(
    result?.settlementIds.length === 2,
    "Expected 2 settlements",
  );
  assert(
    result?.bankTxnIds.length === 2,
    "Expected 2 bank credits",
  );
  assert(
    result?.differencePaise === 0,
    "Expected exact N:M match",
  );

  console.log("✓ N:M correlation");
}

function testNoFalsePositive(): void {
  const result = findSettlementGroupForBank(
    [
      settlement("setl_20", 10000),
      settlement("setl_21", 25000),
    ],
    bank("bank_20", 70000),
  );

  assert(
    result === null,
    "Must not fabricate an aggregation match",
  );

  console.log("✓ N:1 false-positive protection");
}

testNto1();
testOneToN();
testNtoM();
testNoFalsePositive();

console.log("cardinality: ALL PASSED");