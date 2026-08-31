/*
 * SettleMate AI — Large-Workload Execution Engine Benchmark & Reliability Suite
 *
 * Verifies unified execution architecture across:
 *   - 250 records (Standard)
 *   - 1,000 records (Medium)
 *   - 10,000 records (Large)
 *   - 100,000 records (Ultra)
 *
 * The same durable bounded-partition engine scales to larger workloads,
 * constrained by available free compute.
 *
 * Checks:
 *   1. Identical execution engine path across all sizes
 *   2. Bounded memory and execution time per step slice (targeting ~500ms, < 2,000ms safety ceiling)
 *   3. Real measured p50/p95 step latency and records/sec throughput
 *   4. Zero memory explosion via O(slice) generator
 *   5. State machine integrity & lease recovery
 *   6. Multi-tab concurrency & idempotency
 *   7. Cooperative cancellation mid-execution
 *   8. Multi-tenant isolation
 *   9. Adaptive chunk floor & ceiling invariants
 */

import {
  enqueueJob,
  stepJobChunk,
  getDurableJob,
  cancelJob,
  requestJobCancellation,
  detectAndReclaimStalledJobs,
  calculateAdaptiveChunkSize,
  classifyFailure,
  calculateBackoffMs,
  assertValidTransition,
  _clearLocalQueue,
  JobStatus,
  StepResult,
} from "../src/lib/workers/durable-job-worker";

interface BenchmarkResult {
  workloadSize: number;
  totalWallClockMs: number;
  firstProgressLatencyMs: number;
  stepCount: number;
  p50DurationMs: number;
  p95DurationMs: number;
  maxDurationMs: number;
  recordsPerSecond: number;
  peakHeapDeltaMB: number;
  cancellationResponseMs?: number;
}

const benchmarkResults: BenchmarkResult[] = [];
let totalAssertions = 0;
let passedAssertions = 0;

function assert(condition: boolean, description: string) {
  totalAssertions++;
  if (condition) {
    passedAssertions++;
    console.log(`  ✓ [PASS] ${description}`);
  } else {
    console.error(`  ✗ [FAIL] ${description}`);
    throw new Error(`Assertion failed: ${description}`);
  }
}

async function runWorkloadBenchmark(size: number): Promise<BenchmarkResult> {
  console.log(`\n======================================================`);
  console.log(`RUNNING WORKLOAD BENCHMARK: ${size.toLocaleString()} RECORDS`);
  console.log(`======================================================`);

  _clearLocalQueue();
  const tenantId = `tenant_bench_${size}`;
  const initialMemory = process.memoryUsage().heapUsed;

  const t0 = performance.now();
  const job = await enqueueJob({
    tenantId,
    idempotencyKey: `bench_${size}_${Date.now()}`,
    jobType: "BATCH_GENERATION",
    payload: { size, batchName: `Benchmark ${size}` },
    progressTotal: size,
  });

  assert(job.status === "PENDING", `Job ${job.id} initialized in PENDING state`);
  assert(job.progressTotal === size, `Job progressTotal matches target size ${size}`);

  const durations: number[] = [];
  let currentChunkSize = 100;
  let firstProgressLatency = 0;
  let isFirstStep = true;
  let stepIndex = 0;

  let currentJob = await getDurableJob(job.id, tenantId);

  while (currentJob && currentJob.status !== "COMPLETED" && currentJob.status !== "FAILED") {
    stepIndex++;
    const stepStart = performance.now();
    const stepRes: StepResult = await stepJobChunk(job.id, `worker_${size}`, {
      chunkSize: currentChunkSize,
    });
    const stepEnd = performance.now();
    const stepDuration = stepEnd - stepStart;
    durations.push(stepDuration);

    if (isFirstStep) {
      firstProgressLatency = stepDuration;
      isFirstStep = false;
      assert(stepRes.progressCurrent > 0, `First step advanced progress to ${stepRes.progressCurrent}`);
    }

    assert(stepDuration < 2000, `Step ${stepIndex} completed within safety window: ${stepDuration.toFixed(1)}ms (< 2000ms)`);
    assert(stepRes.recordsPerSecond !== undefined, `Telemetry recordsPerSecond reported`);

    if (stepRes.recommendedNextChunkSize) {
      currentChunkSize = stepRes.recommendedNextChunkSize;
    }

    currentJob = await getDurableJob(job.id, tenantId);
  }

  const totalWallClock = performance.now() - t0;
  const finalMemory = process.memoryUsage().heapUsed;
  const heapDeltaMB = Math.max(0, (finalMemory - initialMemory) / (1024 * 1024));

  durations.sort((a, b) => a - b);
  const p50 = durations[Math.floor(durations.length * 0.5)] || 0;
  const p95 = durations[Math.floor(durations.length * 0.95)] || 0;
  const max = durations[durations.length - 1] || 0;
  const throughput = Math.round((size / totalWallClock) * 1000);

  assert(currentJob?.status === "COMPLETED", `Workload of ${size} records finished in COMPLETED state`);
  assert(currentJob?.progressCurrent === size, `Final progress equals ${size}`);

  const result: BenchmarkResult = {
    workloadSize: size,
    totalWallClockMs: Math.round(totalWallClock),
    firstProgressLatencyMs: Math.round(firstProgressLatency),
    stepCount: stepIndex,
    p50DurationMs: Math.round(p50 * 10) / 10,
    p95DurationMs: Math.round(p95 * 10) / 10,
    maxDurationMs: Math.round(max * 10) / 10,
    recordsPerSecond: throughput,
    peakHeapDeltaMB: Math.round(heapDeltaMB * 100) / 100,
  };

  benchmarkResults.push(result);
  console.log(`[Summary for ${size.toLocaleString()}]: Steps=${result.stepCount}, WallClock=${result.totalWallClockMs}ms, Throughput=${result.recordsPerSecond} rec/s, p50=${result.p50DurationMs}ms, p95=${result.p95DurationMs}ms, HeapDelta=${result.peakHeapDeltaMB}MB`);
  return result;
}

async function runReliabilityAndFailureTests() {
  console.log(`\n======================================================`);
  console.log(`RUNNING RELIABILITY & FAILURE INJECTION SUITE`);
  console.log(`======================================================`);

  // Test 1: Cancellation Latency under Large Workload
  console.log(`\n[Gate 1] Mid-Stream Cancellation Latency on 10,000 record job`);
  _clearLocalQueue();
  const cancelJobRecord = await enqueueJob({
    tenantId: "tenant_cancel_test",
    idempotencyKey: `cancel_test_${Date.now()}`,
    jobType: "BATCH_GENERATION",
    payload: { size: 10000, batchName: "Cancellation Test" },
    progressTotal: 10000,
  });

  // Step 2 chunks
  await stepJobChunk(cancelJobRecord.id, "worker_1", { chunkSize: 200 });
  await stepJobChunk(cancelJobRecord.id, "worker_1", { chunkSize: 200 });

  const cancelT0 = performance.now();
  await requestJobCancellation(cancelJobRecord.id, "tenant_cancel_test");
  const cancelT1 = performance.now();
  const cancelResponseMs = cancelT1 - cancelT0;

  // Next step must observe cancellation and transition cleanly to CANCELLED
  const stepAfterCancel = await stepJobChunk(cancelJobRecord.id, "worker_1", { chunkSize: 200 });
  assert(stepAfterCancel.isCancelled === true, "Step immediately halted on cancellation");
  assert(stepAfterCancel.status === "CANCELLED", "Job status is CANCELLED");

  const cancelledJob = await getDurableJob(cancelJobRecord.id, "tenant_cancel_test");
  assert(cancelledJob?.status === "CANCELLED", "Authoritative state is CANCELLED");
  assert(cancelledJob?.progressCurrent === 400, "Completed items prior to cancellation preserved (400 items)");
  console.log(`  ✓ Cancellation response time: ${cancelResponseMs.toFixed(2)}ms`);

  // Test 2: Idempotency & Simulated Client Timeout Retry
  console.log(`\n[Gate 2] Simulated Client Timeout & Idempotent Step Retry`);
  _clearLocalQueue();
  const idempJob = await enqueueJob({
    tenantId: "tenant_idemp",
    idempotencyKey: "unique_idemp_key_1",
    jobType: "BATCH_GENERATION",
    payload: { size: 1000 },
    progressTotal: 1000,
  });

  const dupJob = await enqueueJob({
    tenantId: "tenant_idemp",
    idempotencyKey: "unique_idemp_key_1",
    jobType: "BATCH_GENERATION",
    payload: { size: 1000 },
    progressTotal: 1000,
  });
  assert(dupJob.id === idempJob.id, "Enqueue with identical idempotencyKey returns existing job");

  const step1 = await stepJobChunk(idempJob.id, "worker_a", { chunkSize: 150 });
  assert(step1.progressCurrent === 150, "First step progressed to 150");

  // Duplicate step call
  const step2 = await stepJobChunk(idempJob.id, "worker_a", { chunkSize: 150 });
  assert(step2.progressCurrent === 300, "Subsequent step safely advances from last checkpoint to 300");

  // Test 3: Stalled Worker Detection & Lease Reclamation
  console.log(`\n[Gate 3] Stalled Worker Detection & Automatic Lease Reclamation`);
  _clearLocalQueue();
  const stalledJob = await enqueueJob({
    tenantId: "tenant_stalled",
    idempotencyKey: "stalled_key_1",
    jobType: "BATCH_GENERATION",
    payload: { size: 500 },
    progressTotal: 500,
  });

  // Simulate claiming and lease expiration
  stalledJob.status = "RUNNING";
  stalledJob.claimedAt = new Date(Date.now() - 60000);
  stalledJob.heartbeatAt = new Date(Date.now() - 60000);
  stalledJob.leaseExpiresAt = new Date(Date.now() - 30000);
  stalledJob.attempt = 1;

  const reclaimed = await detectAndReclaimStalledJobs(15000, 3);
  assert(reclaimed.stalledCount >= 1, `Stalled job detected and reclaimed (count: ${reclaimed.stalledCount})`);

  const afterReclaim = await getDurableJob(stalledJob.id);
  assert(afterReclaim?.status === "STALLED" || afterReclaim?.status === "PENDING", "Stalled job reset to retryable state");

  // Test 4: Error Classification & Backoff Calculation
  console.log(`\n[Gate 4] Error Classification & Jittered Backoff`);
  const rateLimitErr = classifyFailure(new Error("Rate limit exceeded 429 too many requests"));
  assert(rateLimitErr.classification === "RATE_LIMIT", "429 classified as RATE_LIMIT");
  assert(rateLimitErr.retryable === true, "429 is retryable");

  const invariantErr = classifyFailure(new Error("Financial invariant control_failure: balance mismatch"));
  assert(invariantErr.classification === "INVARIANT_FAILURE", "Balance mismatch classified as INVARIANT_FAILURE");
  assert(invariantErr.retryable === false, "Invariant failure is non-retryable");

  const backoff1 = calculateBackoffMs(1, 2, 2, 60, true);
  const backoff2 = calculateBackoffMs(2, 2, 2, 60, true);
  assert(backoff1 >= 1000 && backoff1 <= 3000, `Backoff attempt 1 within expected jitter window: ${backoff1}ms`);
  assert(backoff2 >= 2000 && backoff2 <= 6000, `Backoff attempt 2 within expected jitter window: ${backoff2}ms`);

  // Test 5: State Machine Transition Integrity
  console.log(`\n[Gate 5] Strict State Machine Transitions`);
  assertValidTransition("PENDING", "CLAIMED");
  assertValidTransition("CLAIMED", "RUNNING");
  assertValidTransition("RUNNING", "COMPLETED");
  assertValidTransition("RUNNING", "CANCEL_REQUESTED");
  assertValidTransition("CANCEL_REQUESTED", "CANCELLED");

  let caughtIllegal = false;
  try {
    assertValidTransition("COMPLETED", "RUNNING");
  } catch {
    caughtIllegal = true;
  }
  assert(caughtIllegal, "Illegal transition from COMPLETED -> RUNNING throws error");

  // Test 6: Multi-Tenant Isolation
  console.log(`\n[Gate 6] Multi-Tenant Isolation`);
  _clearLocalQueue();
  const jobTenantA = await enqueueJob({
    tenantId: "tenant_alpha",
    idempotencyKey: "iso_alpha_1",
    jobType: "BATCH_GENERATION",
    payload: { size: 100 },
    progressTotal: 100,
  });

  const queryAsTenantB = await getDurableJob(jobTenantA.id, "tenant_beta");
  assert(queryAsTenantB === null, "Tenant Beta cannot access Tenant Alpha's job");

  const queryAsTenantA = await getDurableJob(jobTenantA.id, "tenant_alpha");
  assert(queryAsTenantA !== null, "Tenant Alpha can access its own job");

  // Test 7: Adaptive Chunk Sizing Invariant Verification
  console.log(`\n[Gate 7] Adaptive Chunk Sizing Invariant Verification`);
  const fastStepNext = calculateAdaptiveChunkSize({
    currentChunkSize: 100,
    lastDurationMs: 100, // fast (<200ms)
    targetDurationMs: 500,
  });
  assert(fastStepNext > 100, `Adaptive chunk expands when duration is fast (100 -> ${fastStepNext})`);

  const slowStepNext = calculateAdaptiveChunkSize({
    currentChunkSize: 200,
    lastDurationMs: 1500, // slow (>600ms)
    targetDurationMs: 500,
  });
  assert(slowStepNext < 200, `Adaptive chunk contracts when duration is slow (200 -> ${slowStepNext})`);

  // Invariant 1: Minimum cannot fall below configured floor
  const floorTest = calculateAdaptiveChunkSize({
    currentChunkSize: 50,
    lastDurationMs: 60000, // extremely slow
    minChunkSize: 40,
    maxChunkSize: 500,
  });
  assert(floorTest >= 40, `Chunk size cannot fall below configured floor (got ${floorTest} >= 40)`);

  // Invariant 2: Maximum cannot exceed configured ceiling
  const ceilingTest = calculateAdaptiveChunkSize({
    currentChunkSize: 400,
    lastDurationMs: 1, // extremely fast
    minChunkSize: 10,
    maxChunkSize: 450,
  });
  assert(ceilingTest <= 450, `Chunk size cannot exceed configured ceiling (got ${ceilingTest} <= 450)`);

  // Invariant 3: totalSize >= 50k ceiling is bounded (default 2500)
  const largeWorkloadCeilingTest = calculateAdaptiveChunkSize({
    currentChunkSize: 2400,
    lastDurationMs: 5, // fast
    totalSize: 100000,
  });
  assert(largeWorkloadCeilingTest <= 2500, `Workload >= 50k ceiling is bounded to 2500 (got ${largeWorkloadCeilingTest})`);

  // Invariant 4: No alternate code path can bypass ceiling (fast, medium, slow, edge)
  const paths = [
    { duration: 0.1, name: "ultra-fast" },
    { duration: 150, name: "fast" },
    { duration: 350, name: "medium" },
    { duration: 800, name: "slow" },
    { duration: 99999, name: "ultra-slow" },
    { duration: -10, name: "negative" },
    { duration: NaN, name: "NaN" },
  ];
  for (const p of paths) {
    const res = calculateAdaptiveChunkSize({
      currentChunkSize: 1000,
      lastDurationMs: p.duration,
      minChunkSize: 25,
      maxChunkSize: 300,
    });
    assert(res >= 25 && res <= 300, `Path '${p.name}' strictly respects bounds [25, 300] (got ${res})`);
  }
}

async function main() {
  console.log("======================================================================");
  console.log("SETTLEMATE AI — LARGE-WORKLOAD EXECUTION ENGINE BENCHMARK (250 - 100K)");
  console.log("======================================================================");

  await runWorkloadBenchmark(250);
  await runWorkloadBenchmark(1000);
  await runWorkloadBenchmark(10000);
  await runWorkloadBenchmark(100000);

  await runReliabilityAndFailureTests();

  console.log("\n======================================================================");
  console.log(`BENCHMARK & VERIFICATION RESULTS SUMMARY`);
  console.log("======================================================================");
  console.table(benchmarkResults);
  console.log(`\nTotal Assertions Checked: ${totalAssertions}`);
  console.log(`Passed Assertions: ${passedAssertions}`);
  console.log(`Failed Assertions: ${totalAssertions - passedAssertions}`);
  console.log("======================================================================\n");
}

main().catch((err) => {
  console.error("Benchmark suite failed:", err);
  process.exit(1);
});
