/*
 * SettleMate AI — Risk Dashboard presentation smoke tests.
 *
 * Following the repo convention for page tests (self-contained logic, no DOM),
 * this locks the small pure contracts the /risk-dashboard page relies on:
 *   - the risk-score → colour indicator thresholds (must line up with the
 *     server's bandForScore bands),
 *   - the "group exceptions by risk category" invariant used to build the table
 *     (partitions are disjoint, cover every row, and counts reconcile),
 *   - the export-report filename derivation (safe, timestamped).
 * The data path itself is covered end-to-end by exposure.test.ts.
 */

import { strictEqual, ok, deepStrictEqual } from "node:assert";
import { bandForScore } from "@/lib/risk/scoring";

type RiskCategory = "HIGH" | "MEDIUM" | "LOW";
const CATEGORY_ORDER: RiskCategory[] = ["HIGH", "MEDIUM", "LOW"];

// --- Mirrors of the page's pure presentation helpers (kept in lockstep) ---

/** Colour for the score indicator — mirrors scoreArc() in page.tsx. */
function scoreColor(score: number): string {
  if (score >= 75) return "#d9776f"; // CRITICAL — red
  if (score >= 50) return "#d3a24b"; // ELEVATED — amber
  if (score >= 25) return "#a4b58a"; // MODERATE — olive
  return "#687063"; //                  LOW      — muted
}

/** Group exceptions by risk level in HIGH→MEDIUM→LOW order — mirrors the table build. */
function groupByCategory<T extends { riskLevel: RiskCategory }>(rows: T[]): Record<RiskCategory, T[]> {
  return {
    HIGH: rows.filter((r) => r.riskLevel === "HIGH"),
    MEDIUM: rows.filter((r) => r.riskLevel === "MEDIUM"),
    LOW: rows.filter((r) => r.riskLevel === "LOW"),
  };
}

/** Export filename derivation — mirrors exportReport() in page.tsx. */
function exportFilename(generatedAt: string): string {
  return `settlemate-risk-report-${generatedAt.replace(/[:.]/g, "-")}.json`;
}

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`   ✓ ${name}`);
}

function main() {
  console.log("\n=========================================================================");
  console.log(" 🧪 SETTLEMATE AI — RISK DASHBOARD PRESENTATION SMOKE TESTS");
  console.log("=========================================================================\n");

  // 1. The colour indicator must switch exactly where the server bands switch.
  test("score colour aligns with server risk bands", () => {
    const cases: Array<[number, string, string]> = [
      [0, "LOW", "#687063"],
      [24, "LOW", "#687063"],
      [25, "MODERATE", "#a4b58a"],
      [49, "MODERATE", "#a4b58a"],
      [50, "ELEVATED", "#d3a24b"],
      [74, "ELEVATED", "#d3a24b"],
      [75, "CRITICAL", "#d9776f"],
      [100, "CRITICAL", "#d9776f"],
    ];
    for (const [score, band, colour] of cases) {
      strictEqual(bandForScore(score), band, `band at ${score}`);
      strictEqual(scoreColor(score), colour, `colour at ${score}`);
    }
  });

  // 2. Grouping partitions every exception exactly once, in category order.
  test("category grouping is a disjoint, total partition", () => {
    const rows = [
      { id: "A", riskLevel: "HIGH" as const },
      { id: "B", riskLevel: "LOW" as const },
      { id: "C", riskLevel: "MEDIUM" as const },
      { id: "D", riskLevel: "HIGH" as const },
      { id: "E", riskLevel: "LOW" as const },
    ];
    const groups = groupByCategory(rows);
    strictEqual(groups.HIGH.length, 2);
    strictEqual(groups.MEDIUM.length, 1);
    strictEqual(groups.LOW.length, 2);
    // total coverage: every row lands in exactly one bucket.
    const regrouped = CATEGORY_ORDER.flatMap((c) => groups[c]).map((r) => r.id).sort();
    deepStrictEqual(regrouped, ["A", "B", "C", "D", "E"]);
  });

  // 3. Group counts reconcile with an authoritative byCategory count map.
  test("group counts reconcile with byCategory buckets", () => {
    const rows = [
      { id: "H1", riskLevel: "HIGH" as const },
      { id: "M1", riskLevel: "MEDIUM" as const },
      { id: "M2", riskLevel: "MEDIUM" as const },
      { id: "L1", riskLevel: "LOW" as const },
    ];
    const byCategory = { HIGH: { count: 1 }, MEDIUM: { count: 2 }, LOW: { count: 1 } };
    const groups = groupByCategory(rows);
    for (const cat of CATEGORY_ORDER) {
      strictEqual(groups[cat].length, byCategory[cat].count, `count mismatch for ${cat}`);
    }
  });

  // 4. Export filename is filesystem-safe (no ':' or '.' from the ISO timestamp).
  test("export filename is safe and timestamped", () => {
    const name = exportFilename("2026-08-26T12:34:56.789Z");
    strictEqual(name, "settlemate-risk-report-2026-08-26T12-34-56-789Z.json");
    ok(!name.slice(0, -5).includes(":"), "no colons outside the extension");
    ok(name.startsWith("settlemate-risk-report-"));
    ok(name.endsWith(".json"));
  });

  console.log("\n=========================================================================");
  console.log(`  ✅ ALL ${passed} RISK DASHBOARD PRESENTATION TESTS PASSED`);
  console.log("=========================================================================\n");
}

if (process.argv[1] && process.argv[1].includes("risk-dashboard.test.ts")) {
  try {
    main();
  } catch (err) {
    console.error("\n   ✗ Risk dashboard smoke test failure:", err);
    process.exit(1);
  }
}
