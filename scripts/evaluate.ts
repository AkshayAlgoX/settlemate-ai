import { createHash } from "node:crypto";
import { generateSyntheticBatch } from "../src/lib/synthetic/generator";
import { runReconciliation } from "../src/lib/reconciliation/engine";
import { runAdversarialTest } from "../src/lib/reconciliation/adversarial";
import { computeCalibration } from "../src/lib/reconciliation/calibration";
import { prisma } from "../src/lib/db";

const BENCHMARK_VERSION = "v1";
const DEFAULT_SEED = 20260821;
const DEFAULT_SIZE = 250;

function getArg(name: string, fallback: number): number {
  const idx = process.argv.indexOf(name);
  const val = idx !== -1 ? process.argv[idx + 1] : undefined;
  return val ? Number(val) : fallback;
}

function stableId(record: Record<string, unknown>): string {
  return String(
    record.orderId ??
      record.paymentId ??
      record.settlementId ??
      record.txnId ??
      record.refundId ??
      record.chargebackId ??
      ""
  );
}

function sortRecords<T extends Record<string, unknown>>(records: T[]): T[] {
  return [...records].sort((a, b) =>
    stableId(a).localeCompare(stableId(b), "en", { numeric: true })
  );
}

function computeDatasetFingerprint(
  data: ReturnType<typeof generateSyntheticBatch>
): string {
  const sections = {
    orders: sortRecords(data.orders),
    payments: sortRecords(data.payments),
    settlements: sortRecords(data.settlements),
    bankTransactions: sortRecords(data.bankTransactions),
    refunds: sortRecords(data.refunds),
    chargebacks: sortRecords(data.chargebacks),
    groundTruths: sortRecords(data.groundTruths),
  };

  const canonical = JSON.stringify(sections, (_key, value) => {
    if (value instanceof Date) return value.toISOString();
    return value;
  });

  return createHash("sha256").update(canonical).digest("hex");
}

async function runEvaluationBenchmark() {
  console.log("\n========================================================");
  console.log("   SETTLEMATE AI — AUTOMATED BENCHMARK EVALUATOR");
  console.log("========================================================\n");

  const seed = getArg("--seed", DEFAULT_SEED);
  const size = getArg("--size", DEFAULT_SIZE);

  console.log(`[1/5] Generating deterministic synthetic batch...`);
  const data = generateSyntheticBatch(size, seed);

  const fingerprint = computeDatasetFingerprint(data);

  console.log(`       Benchmark version: ${BENCHMARK_VERSION}`);
  console.log(`       Seed:              ${seed}`);
  console.log(`       Records requested: ${size}`);
  console.log(`       Deterministic:     YES`);
  console.log(`       Dataset fingerprint: ${fingerprint}\n`);

  const batch = await prisma.batch.create({
    data: {
      name: `Benchmark Eval ${BENCHMARK_VERSION} seed=${seed} size=${size}`,
      size,
      status: "CREATED",
      source: "GENERATED",
      orders: { create: data.orders },
      payments: { create: data.payments },
      settlements: { create: data.settlements },
      bankTransactions: { create: data.bankTransactions },
      refunds: { create: data.refunds },
      chargebacks: { create: data.chargebacks },
      groundTruths: { create: data.groundTruths },
    },
  });

  console.log(` -> Batch created: ${batch.id}`);

  console.log("\n[2/5] Executing deterministic core reconciliation (AI disabled)...");
  const startTime = Date.now();
  const metrics = await runReconciliation(batch.id);
  const totalDurationMs = Date.now() - startTime;

  console.log(` -> Completed in ${totalDurationMs}ms (${metrics.throughputRps} records/sec)`);

  console.log("\n[3/5] Running adversarial test suite on sandbox clone...");
  const adversarial = await runAdversarialTest(batch.id);
  console.log(
    ` -> Detection Rate: ${adversarial.detectionRate}% (${adversarial.detected}/${adversarial.totalTests})`
  );

  console.log("\n[4/5] Computing confidence calibration buckets...");
  const calibration = await computeCalibration(batch.id);

  console.log("\n========================================================");
  console.log("                  EVALUATION REPORT                     ");
  console.log("========================================================");
  console.log(` Bench version:       ${BENCHMARK_VERSION}`);
  console.log(` Seed:                ${seed}`);
  console.log(` Dataset fingerprint: ${fingerprint}`);
  console.log(` Batch ID:            ${batch.id}`);
  console.log(` Total Records:       ${metrics.totalRecords}`);
  console.log(` Auto-Matched:        ${metrics.autoMatched}`);
  console.log(` Exceptions Found:    ${metrics.exceptionsFound}`);
  console.log(` Manual Review Count: ${metrics.unresolvedCount}`);
  console.log("--------------------------------------------------------");
  console.log(` Overall Accuracy:    ${metrics.accuracy}%   [Target: >85%]`);
  console.log(` Precision:           ${metrics.precision}%`);
  console.log(` Recall:              ${metrics.recall}%`);
  console.log(` Throughput:          ${metrics.throughputRps} rec/sec`);
  console.log(` Total Duration:      ${totalDurationMs}ms`);
  console.log("--------------------------------------------------------");
  console.log(` Adversarial Score:   ${adversarial.detectionRate}%   [Target: >80%]`);
  console.log(` Adversarial Tests:   ${adversarial.detected}/${adversarial.totalTests} detected`);
  console.log("--------------------------------------------------------");
  console.log(" Calibration Buckets:");
  calibration.forEach((c) => {
    console.log(
      `   Confidence ${c.range.padEnd(7)}: ${c.accuracy}% accuracy (${c.correct}/${c.total} items)`
    );
  });
  console.log("========================================================\n");

  console.log("Cleaning up benchmark database records...");
  await prisma.auditLog.deleteMany({ where: { batchId: batch.id } });
  await prisma.batch.delete({ where: { id: batch.id } });
  console.log("Cleanup complete.\n");

  const passedAccuracy = metrics.accuracy >= 85;
  const passedAdversarial = adversarial.detectionRate >= 80;

  if (passedAccuracy && passedAdversarial) {
    console.log("✅ EVALUATION PASSED: All metrics met competition criteria!\n");
    process.exit(0);
  } else {
    console.error("❌ EVALUATION FAILED: Metrics did not meet thresholds.\n");
    process.exit(1);
  }
}

runEvaluationBenchmark().catch((err) => {
  console.error("Evaluation script error:", err);
  process.exit(1);
});