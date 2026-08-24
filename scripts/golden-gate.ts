/*
 * SettleMate AI — Golden Regression Gate CLI (Day 1 Pass)
 *
 * Single authoritative gate that verifies all deterministic benchmarks & invariant suites:
 *   1. Official 250 Benchmark (98.1% accuracy, fingerprint 81d840cd...)
 *   2. Cardinality Solver Engine (8/8 scenarios passed)
 *   3. 16-Scenario Financial Correctness Attack Suite
 *   4. 10-Scenario Multi-Fault Adversarial Hardening Suite
 *   5. Temporal Settlement Lifecycle & False Alarm Elimination Suite
 *   6. 5,000 Property-Based Financial Invariant Fuzzing Harness
 *   7. N:M Pathological Complexity & Combinatorial Pruning Suite
 *   8. Hot-Key Concurrency & Coalesced CAS Scaling Suite
 *   9. SQLite vs PostgreSQL Differential Equivalence Suite
 *
 * Exits with code 0 on success; exits with code 1 if ANY regression is detected.
 */

import { execSync } from "node:child_process";

interface GateStage {
  name: string;
  command: string;
}

const STAGES: GateStage[] = [
  { name: "1. Official 250 Benchmark", command: "npx tsx scripts/evaluate.ts" },
  { name: "2. Cardinality 8/8 Evaluator", command: "npx tsx scripts/evaluate-cardinality.ts" },
  { name: "3. 16-Scenario Financial Attack", command: "npx tsx scripts/financial-correctness-attack.ts" },
  { name: "4. 10-Scenario Multi-Fault Suite", command: "npx tsx scripts/benchmark-multi-fault.ts" },
  { name: "5. Temporal Settlement Lifecycle", command: "npx tsx scripts/benchmark-temporal-lifecycle.ts" },
  { name: "6. Property-Based Invariant Fuzzing (5k cases)", command: "npx tsx scripts/fuzz-invariants.ts" },
  { name: "7. N:M Pathological Complexity Pruning", command: "npx tsx scripts/benchmark-nm-complexity.ts" },
  { name: "8. Hot-Key Concurrency & Coalescing", command: "npx tsx scripts/benchmark-hotkey-scale.ts" },
  { name: "9. SQLite vs PostgreSQL Differential DB", command: "npx tsx scripts/differential-db-test.ts" },
  { name: "10. Claim Verification & Fabrication Attack", command: "npx tsx scripts/benchmark-claim-verification.ts" },
  { name: "11. Meet-in-the-Middle N:M Comparison", command: "npx tsx scripts/benchmark-mitm-comparison.ts" },
  { name: "12. Aggregate Risk & Tolerance Stacking", command: "npx tsx scripts/benchmark-aggregate-risk.ts" },
  { name: "13. Cross-Partition Scale & Invariants", command: "npx tsx scripts/benchmark-cross-partition-scale.ts" },
  { name: "14. Decision Receipt Offline Verifier", command: "npx tsx scripts/verify-demo.ts" },
  { name: "15. OCR Normalization & Degraded Sources", command: "npx tsx scripts/benchmark-degraded-source.ts" },
  { name: "16. Full System Adversarial Attack", command: "npx tsx scripts/full-system-adversarial-attack.ts" },
  { name: "17. 50+ Record AI Finance-Ops Loop", command: "npx tsx scripts/benchmark-finance-ops-loop.ts" },
];

export function runGoldenGate() {
  console.log("\n=========================================================================");
  console.log(" 🛡️  SETTLEMATE AI — GOLDEN REGRESSION GATE");
  console.log("=========================================================================\n");

  const startTime = performance.now();
  let passedCount = 0;

  for (const stage of STAGES) {
    process.stdout.write(`[Gate] Running ${stage.name.padEnd(45)} ... `);
    const stageStart = performance.now();
    try {
      execSync(stage.command, { stdio: "pipe", cwd: process.cwd() });
      const elapsed = performance.now() - stageStart;
      console.log(`✅ PASSED (${elapsed.toFixed(0)}ms)`);
      passedCount++;
    } catch (err) {
      const elapsed = performance.now() - stageStart;
      console.log(`❌ FAILED (${elapsed.toFixed(0)}ms)`);
      console.error(`\nRegression detected in ${stage.name}:\n`, (err as Error).message);
      process.exit(1);
    }
  }

  const totalElapsed = ((performance.now() - startTime) / 1000).toFixed(2);

  console.log("\n=========================================================================");
  console.log(` ✅ ALL ${passedCount} / ${STAGES.length} GOLDEN REGRESSION GATES PASSED (Total: ${totalElapsed}s)`);
  console.log("=========================================================================\n");
}

if (require.main === module) {
  runGoldenGate();
}
