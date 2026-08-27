/*
 * SettleMate AI — Risk & Exposure API integration tests.
 *
 * Exercises POST /api/risk/exposure end-to-end against the REAL reconciliation
 * engine and the REAL SQLite job store:
 *   1. Combined default dataset (no batchId) — merges the 5 Scenario Lab
 *      scenarios, runs the engine once, and scores the resulting exceptions.
 *   2. Stored-batch path — seeds a job via v1Store (SQLite round-trip) and
 *      scores its exceptions by batchId.
 *   3. Unknown batchId → 404.
 *
 * Every monetary field in the response is asserted to be an exact integer paise.
 */

// Silence the instrument() NDJSON "request completed" lines for readable output.
// resolveThreshold() is read per log call, so setting this before the first
// handler invocation is sufficient.
process.env.LOG_LEVEL = "error";

import { strictEqual, ok } from "node:assert";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { v1Store, type V1ReconciliationJob } from "@/lib/api/v1-store";

const RISK_BANDS = ["LOW", "MODERATE", "ELEVATED", "CRITICAL"];
const CATEGORIES = ["HIGH", "MEDIUM", "LOW"] as const;

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`   ✓ ${name}`);
}

function post(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/risk/exposure", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Assert a value is a finite, non-negative integer number of paise. */
function assertIntPaise(v: unknown, label: string) {
  ok(typeof v === "number" && Number.isInteger(v) && v >= 0, `${label} must be a non-negative integer paise (got ${v})`);
}

async function runTests() {
  console.log("\n=========================================================================");
  console.log(" 🧪 SETTLEMATE AI — RISK & EXPOSURE API INTEGRATION TESTS");
  console.log("=========================================================================\n");

  // ---- 1. Combined default dataset (no batchId) ----
  {
    const res = await POST(post({}));
    strictEqual(res.status, 200, "combined default should return 200");
    const json = await res.json();

    test("combined: success envelope + source + scenario count", () => {
      ok(json.success, "success must be true");
      strictEqual(json.source, "combined-scenarios");
      strictEqual(json.scenarioCount, 5);
      strictEqual(json.batchId, null);
      ok(typeof json.generatedAt === "string" && !Number.isNaN(Date.parse(json.generatedAt)), "generatedAt must be an ISO timestamp");
    });

    const report = json.report;
    test("combined: engine produced at least one unresolved exception", () => {
      ok(report.totals.unresolvedCount >= 1, `expected ≥1 exception from the merged batch, got ${report.totals.unresolvedCount}`);
      strictEqual(report.exceptions.length, report.totals.unresolvedCount);
    });

    test("combined: risk score is an integer in [0,100] with a valid band", () => {
      ok(Number.isInteger(report.riskScore) && report.riskScore >= 0 && report.riskScore <= 100, `bad score ${report.riskScore}`);
      ok(RISK_BANDS.includes(report.riskBand), `bad band ${report.riskBand}`);
      const { severity, amount, count, stacking } = report.scoreBreakdown;
      strictEqual(report.riskScore, Math.min(100, severity + amount + count + stacking), "score must equal clamped sum of its breakdown");
    });

    test("combined: category buckets reconcile with totals (count + amount)", () => {
      let sumCount = 0;
      let sumAmount = 0;
      for (const cat of CATEGORIES) {
        assertIntPaise(report.byCategory[cat].amountPaise, `byCategory.${cat}.amountPaise`);
        ok(Number.isInteger(report.byCategory[cat].count), `byCategory.${cat}.count must be integer`);
        sumCount += report.byCategory[cat].count;
        sumAmount += report.byCategory[cat].amountPaise;
      }
      strictEqual(sumCount, report.totals.unresolvedCount, "category counts must sum to the unresolved count");
      strictEqual(sumAmount, report.totals.unresolvedAmountPaise, "category amounts must sum to the unresolved amount");
    });

    test("combined: every money field is exact integer paise", () => {
      assertIntPaise(report.totals.unresolvedAmountPaise, "totals.unresolvedAmountPaise");
      assertIntPaise(report.toleranceStacking.exposurePaise, "toleranceStacking.exposurePaise");
      assertIntPaise(report.slaBreaches.amountAffectedPaise, "slaBreaches.amountAffectedPaise");
      assertIntPaise(report.duplicateCreditRisks.amountPaise, "duplicateCreditRisks.amountPaise");
      assertIntPaise(report.crossCurrencyRisks.amountPaise, "crossCurrencyRisks.amountPaise");
      for (const e of report.exceptions) assertIntPaise(e.variancePaise, `exception ${e.id} variancePaise`);
    });

    test("combined: every exception carries a root cause + action + playbook", () => {
      ok(
        report.exceptions.every(
          (e: { rootCause: string; recommendedAction: string; playbookType: string }) =>
            e.rootCause.length > 0 && e.recommendedAction.length > 0 && e.playbookType.length > 0
        ),
        "each classified exception must have non-empty guidance"
      );
    });

    console.log(
      `   → combined report: ${report.totals.unresolvedCount} exception(s), ` +
        `${report.totals.unresolvedAmountFormatted} at risk, score ${report.riskScore}/100 (${report.riskBand})`
    );
  }

  // ---- 2. Stored-batch path (real SQLite round-trip) ----
  {
    const batchId = "job_risk_exposure_test_fixture";
    const now = new Date().toISOString();
    const job: V1ReconciliationJob = {
      jobId: batchId,
      status: "COMPLETED",
      createdAt: now,
      completedAt: now,
      batchSize: 3,
      summary: { autoMatched: 1, suggested: 0, exception: 2, total: 3, matchRatePct: 33.33, discrepancyPaise: 6_050_000 },
      exceptions: [
        {
          id: "EXP_PAY_1",
          type: "AMOUNT_MISMATCH",
          description: "Settled amount ₹40,000 below expected net ₹1,00,000",
          amount: 6_000_000,
          formattedAmount: "₹60,000.00",
          paymentId: "PAY_1",
          expectedNetAmount: 10_000_000,
          actualSettledAmount: 4_000_000,
          mismatchAmount: 6_000_000, // HIGH: > ₹50,000
          cardinalityType: "1:1",
          aiSuggestionAvailable: true,
        },
        {
          id: "EXP_PAY_2",
          type: "FEE_MISMATCH",
          description: "Processor fee overcharge",
          amount: 50_000,
          formattedAmount: "₹500.00",
          paymentId: "PAY_2",
          expectedNetAmount: 1_000_000,
          actualSettledAmount: 950_000,
          mismatchAmount: 50_000, // LOW / small (₹500)
          cardinalityType: "1:1",
          aiSuggestionAvailable: true,
        },
      ],
    };
    v1Store.saveJob(job);
    // Confirm the round-trip actually persisted before scoring it.
    ok(v1Store.getJob(batchId)?.exceptions?.length === 2, "seed job must persist with 2 exceptions");

    const res = await POST(post({ batchId }));
    strictEqual(res.status, 200, "stored batch should return 200");
    const json = await res.json();
    const report = json.report;

    test("stored batch: envelope reflects the batch source", () => {
      ok(json.success);
      strictEqual(json.source, "batch");
      strictEqual(json.batchId, batchId);
    });

    test("stored batch: totals match the seeded exceptions exactly", () => {
      strictEqual(report.totals.unresolvedCount, 2);
      strictEqual(report.totals.unresolvedAmountPaise, 6_050_000);
    });

    test("stored batch: the ₹60,000 variance is categorized HIGH", () => {
      strictEqual(report.byCategory.HIGH.count, 1);
      strictEqual(report.byCategory.HIGH.amountPaise, 6_000_000);
    });

    test("stored batch: the fee exception is classified FEE_MISMATCH / LOW", () => {
      const fee = report.exceptions.find((e: { paymentId: string }) => e.paymentId === "PAY_2");
      ok(fee, "fee exception must be present");
      strictEqual(fee.family, "FEE_MISMATCH");
      strictEqual(fee.riskLevel, "LOW");
      ok(fee.recommendedAction.toLowerCase().includes("clawback"), "fee playbook should recommend a clawback");
    });
  }

  // ---- 3. Unknown batchId → 404 ----
  {
    const res = await POST(post({ batchId: "job_absolutely_not_a_real_batch" }));
    strictEqual(res.status, 404, "unknown batchId should return 404");
    const json = await res.json();
    test("unknown batchId: returns a clean 404 BATCH_NOT_FOUND", () => {
      strictEqual(json.success, false);
      strictEqual(json.error.code, "BATCH_NOT_FOUND");
    });
  }

  console.log("\n=========================================================================");
  console.log(`  ✅ ALL ${passed} RISK & EXPOSURE API TESTS PASSED`);
  console.log("=========================================================================\n");
}

if (process.argv[1] && process.argv[1].includes("exposure.test.ts")) {
  runTests().catch((err) => {
    console.error("\n   ✗ Risk exposure API test failure:", err);
    process.exit(1);
  });
}
