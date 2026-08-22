import {
  findBankGroupForSettlement,
  findManyToManyMatch,
  findSettlementGroupForBank,
} from "../src/lib/reconciliation/cardinality";
import type {
  NormalizedBankTxn,
  NormalizedSettlement,
} from "../src/lib/reconciliation/types";

const BASE_DATE = new Date("2025-08-05T10:00:00Z");

interface ScenarioResult {
  name: string;
  expected: string;
  actual: string;
  passed: boolean;
  details: string;
}

function settlement(
  id: string,
  amount: number,
  hoursOffset = 0,
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
    settledAt: new Date(
      BASE_DATE.getTime() + hoursOffset * 3_600_000,
    ),
    createdAt: BASE_DATE,
  };
}

function bank(
  id: string,
  amount: number,
  hoursOffset = 2,
): NormalizedBankTxn {
  return {
    dbId: `db_${id}`,
    txnId: id,
    utr: null,
    amount,
    type: "CREDIT",
    narration: "TEST BANK CREDIT",
    txnDate: new Date(
      BASE_DATE.getTime() + hoursOffset * 3_600_000,
    ),
    matched: false,
  };
}

function addScenario(
  results: ScenarioResult[],
  scenario: ScenarioResult,
): void {
  results.push(scenario);

  const icon = scenario.passed ? "✓" : "✗";

  console.log(
    `${icon} ${scenario.name} — ${scenario.details}`,
  );
}

function runExactNToOne(results: ScenarioResult[]): void {
  const settlements = [
    settlement("setl_n1_01", 10000),
    settlement("setl_n1_02", 25000),
    settlement("setl_n1_03", 15000),
  ];

  const bankTxn = bank("bank_n1_01", 50000);

  const result = findSettlementGroupForBank(
    settlements,
    bankTxn,
  );

  const passed =
    result !== null &&
    result.type === "N:1" &&
    result.settlementIds.length === 3 &&
    result.bankTxnIds.length === 1 &&
    result.settlementAmount === 50000 &&
    result.bankAmount === 50000 &&
    result.differencePaise === 0;

  addScenario(results, {
    name: "Exact N:1 settlement aggregation",
    expected: "3 settlements → 1 bank credit",
    actual: result
      ? `${result.settlementIds.length} settlements → ${result.bankTxnIds.length} bank credit`
      : "no match",
    passed,
    details: result
      ? `${result.reasonCode}, confidence=${result.confidenceScore}`
      : "no deterministic aggregation found",
  });
}

function runToleranceNToOne(results: ScenarioResult[]): void {
  const settlements = [
    settlement("setl_tol_01", 10000),
    settlement("setl_tol_02", 25000),
    settlement("setl_tol_03", 15000),
  ];

  const bankTxn = bank("bank_tol_01", 50080);

  const result = findSettlementGroupForBank(
    settlements,
    bankTxn,
    {
      maxGroupSize: 8,
      maxCandidates: 24,
      tolerancePaise: 100,
      maxHours: 96,
    },
  );

  const passed =
    result !== null &&
    result.type === "N:1" &&
    result.differencePaise === 80;

  addScenario(results, {
    name: "Tolerance-aware N:1 aggregation",
    expected: "50,000 → 50,080 within 100 paise",
    actual: result
      ? `${result.settlementAmount} → ${result.bankAmount}, delta=${result.differencePaise}`
      : "no match",
    passed,
    details: result
      ? result.reasonCode
      : "candidate rejected",
  });
}

function runExactOneToN(results: ScenarioResult[]): void {
  const settlementRecord = settlement("setl_1n_01", 50000);

  const bankTxns = [
    bank("bank_1n_01", 10000),
    bank("bank_1n_02", 25000),
    bank("bank_1n_03", 15000),
  ];

  const result = findBankGroupForSettlement(
    settlementRecord,
    bankTxns,
  );

  const passed =
    result !== null &&
    result.type === "1:N" &&
    result.settlementIds.length === 1 &&
    result.bankTxnIds.length === 3 &&
    result.settlementAmount === 50000 &&
    result.bankAmount === 50000 &&
    result.differencePaise === 0;

  addScenario(results, {
    name: "Exact 1:N bank aggregation",
    expected: "1 settlement → 3 bank credits",
    actual: result
      ? `${result.settlementIds.length} settlement → ${result.bankTxnIds.length} bank credits`
      : "no match",
    passed,
    details: result
      ? `${result.reasonCode}, confidence=${result.confidenceScore}`
      : "no deterministic decomposition found",
  });
}

function runExactNToM(results: ScenarioResult[]): void {
  const settlements = [
    settlement("setl_nm_01", 30000),
    settlement("setl_nm_02", 20000),
    settlement("setl_nm_03", 70000),
  ];

  const bankTxns = [
    bank("bank_nm_01", 25000),
    bank("bank_nm_02", 25000),
    bank("bank_nm_03", 70000),
  ];

  const result = findManyToManyMatch(
    settlements,
    bankTxns,
  );

  const passed =
    result !== null &&
    result.type === "N:M" &&
    result.settlementIds.length === 2 &&
    result.bankTxnIds.length === 2 &&
    result.settlementAmount === 50000 &&
    result.bankAmount === 50000 &&
    result.differencePaise === 0;

  addScenario(results, {
    name: "Exact N:M correlation",
    expected: "2 settlements ↔ 2 bank credits",
    actual: result
      ? `${result.settlementIds.length} settlements ↔ ${result.bankTxnIds.length} bank credits`
      : "no match",
    passed,
    details: result
      ? `${result.reasonCode}, confidence=${result.confidenceScore}`
      : "no deterministic correlation found",
  });
}

function runNToMWithUnrelatedNoise(
  results: ScenarioResult[],
): void {
  const settlements = [
    settlement("setl_noise_01", 40000),
    settlement("setl_noise_02", 35000),
    settlement("setl_noise_03", 25000),
    settlement("setl_noise_04", 90000),
  ];

  const bankTxns = [
    bank("bank_noise_01", 20000),
    bank("bank_noise_02", 55000),
    bank("bank_noise_03", 25000),
    bank("bank_noise_04", 12345),
    bank("bank_noise_05", 90000),
  ];

  const result = findManyToManyMatch(
    settlements,
    bankTxns,
  );

  const passed =
    result !== null &&
    result.type === "N:M" &&
    result.differencePaise === 0;

  addScenario(results, {
    name: "N:M with unrelated candidate noise",
    expected: "deterministic exact correlation despite extra records",
    actual: result
      ? `${result.settlementIds.join(",")} ↔ ${result.bankTxnIds.join(",")}`
      : "no match",
    passed,
    details: result
      ? `resolved ${result.settlementAmount} against ${result.bankAmount}`
      : "no valid correlation",
  });
}

function runFalsePositiveProtection(
  results: ScenarioResult[],
): void {
  const settlements = [
    settlement("setl_false_01", 10000),
    settlement("setl_false_02", 25000),
  ];

  const bankTxn = bank("bank_false_01", 70000);

  const result = findSettlementGroupForBank(
    settlements,
    bankTxn,
  );

  const passed = result === null;

  addScenario(results, {
    name: "False-positive protection",
    expected: "no aggregation for unmatched amount",
    actual: result
      ? `incorrectly matched ${result.settlementAmount}`
      : "null / no match",
    passed,
    details: passed
      ? "no fabricated relationship"
      : "solver incorrectly created a relationship",
  });
}

function runDuplicateCandidateProtection(
  results: ScenarioResult[],
): void {
  const settlements = [
    settlement("setl_dup_01", 25000),
    settlement("setl_dup_02", 25000),
    settlement("setl_dup_03", 30000),
  ];

  const bankTxn = bank("bank_dup_01", 50000);

  const result = findSettlementGroupForBank(
    settlements,
    bankTxn,
  );

  const passed =
    result !== null &&
    result.settlementIds.length === 2 &&
    result.settlementIds.includes("setl_dup_01") &&
    result.settlementIds.includes("setl_dup_02") &&
    !result.settlementIds.includes("setl_dup_03");

  addScenario(results, {
    name: "Deterministic duplicate-candidate handling",
    expected: "choose exact 25k + 25k pair",
    actual: result
      ? result.settlementIds.join(" + ")
      : "no match",
    passed,
    details: passed
      ? "stable deterministic selection"
      : "unexpected candidate selection",
  });
}

function runTimingProtection(
  results: ScenarioResult[],
): void {
  const settlementRecord = settlement(
    "setl_time_01",
    50000,
    0,
  );

  const lateBank = bank(
    "bank_time_01",
    50000,
    200,
  );

  const result = findBankGroupForSettlement(
    settlementRecord,
    [lateBank],
    {
      maxGroupSize: 8,
      maxCandidates: 24,
      tolerancePaise: 100,
      maxHours: 96,
    },
  );

  const passed = result === null;

  addScenario(results, {
    name: "Timing-window protection",
    expected: "ignore bank credit outside configured window",
    actual: result
      ? "incorrectly matched late bank credit"
      : "late credit rejected",
    passed,
    details: passed
      ? "candidate excluded by timing policy"
      : "timing filter failed",
  });
}

function printSummary(results: ScenarioResult[]): void {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  const percentage =
    results.length > 0
      ? Math.round((passed / results.length) * 10000) / 100
      : 0;

  console.log("\n========================================================");
  console.log(" SETTLEMATE AI — CARDINALITY ENGINE EVALUATOR");
  console.log("========================================================");
  console.log(` Scenarios:       ${results.length}`);
  console.log(` Passed:          ${passed}`);
  console.log(` Failed:          ${failed}`);
  console.log(` Score:           ${percentage}%`);
  console.log("========================================================");

  if (failed > 0) {
    console.error("\n❌ CARDINALITY EVALUATION FAILED");

    for (const result of results.filter((r) => !r.passed)) {
      console.error(
        ` - ${result.name}: expected=${result.expected}, actual=${result.actual}`,
      );
    }

    process.exitCode = 1;
    return;
  }

  console.log("\n✅ CARDINALITY EVALUATION PASSED");
}

async function main(): Promise<void> {
  const results: ScenarioResult[] = [];

  console.log("\nStarting cardinality evaluation...\n");

  runExactNToOne(results);
  runToleranceNToOne(results);
  runExactOneToN(results);
  runExactNToM(results);
  runNToMWithUnrelatedNoise(results);
  runFalsePositiveProtection(results);
  runDuplicateCandidateProtection(results);
  runTimingProtection(results);

  printSummary(results);
}

void main().catch((error) => {
  console.error("\n❌ Cardinality evaluator crashed");
  console.error(error);
  process.exitCode = 1;
});