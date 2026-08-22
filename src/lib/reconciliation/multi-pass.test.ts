import assert from "node:assert/strict";
import { prisma } from "../../lib/db";
import {
  readMultiPassSnapshot,
  runMultiPassIdempotent,
  writeMultiPassSnapshot,
  type MultiPassResult,
} from "./multi-pass";

let passed = 0;
let failed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name} — ${(err as Error).message}`);
  }
}

const createdBatchIds: string[] = [];

function fakeSnapshot() {
  return {
    totalDurationMs: 1,
    aiStatus: { totalCalls: 0, maxCalls: 10, circuitTripped: false },
    passes: [],
    adversarial: { totalTests: 10, detected: 9, detectionRate: 90, tests: [] },
    calibration: [],
  };
}

function fakeResult(batchId: string): MultiPassResult {
  const s = fakeSnapshot();
  return {
    batchId,
    passes: s.passes,
    aiStatus: { ...s.aiStatus, fallbackUsed: true },
    adversarial: s.adversarial,
    calibration: s.calibration,
    totalDurationMs: s.totalDurationMs,
  };
}

async function makeBatch(): Promise<string> {
  const batch = await prisma.batch.create({ data: { name: "multi-pass-test", size: 1 } });
  createdBatchIds.push(batch.id);
  return batch.id;
}

async function countCompleted(batchId: string): Promise<number> {
  return prisma.auditLog.count({
    where: { batchId, action: "MULTI_PASS_COMPLETED" },
  });
}

async function run() {
  console.log("\nMulti-pass reconciliation — idempotent POST tests");

  await check("first run executes and persists a snapshot", async () => {
    const batchId = await makeBatch();
    let calls = 0;
    const outcome = await runMultiPassIdempotent(batchId, async (id) => {
      calls++;
      await writeMultiPassSnapshot(id, fakeSnapshot(), 0);
      return fakeResult(id);
    });
    assert.equal(outcome.executed, true);
    assert.equal(outcome.idempotent, false);
    assert.equal(calls, 1, "the runner ran exactly once");
    const snap = await readMultiPassSnapshot(batchId);
    assert.equal(snap.persisted, true);
    assert.equal(await countCompleted(batchId), 1);
  });

  await check("second run on a completed batch is idempotent (no re-run)", async () => {
    const batchId = createdBatchIds[0];
    let calls = 0;
    const outcome = await runMultiPassIdempotent(batchId, async (id) => {
      calls++;
      await writeMultiPassSnapshot(id, fakeSnapshot(), 0);
      return fakeResult(id);
    });
    assert.equal(outcome.executed, false, "did not execute again");
    assert.equal(outcome.idempotent, true);
    assert.equal(calls, 0, "runner was not invoked");
    assert.equal(await countCompleted(batchId), 1, "no duplicate audit row");
  });

  await check("duplicate request does not duplicate audit/agent-trace/result rows", async () => {
    const batchId = await makeBatch();
    for (let i = 0; i < 3; i++) {
      await runMultiPassIdempotent(batchId, async (id) => {
        await writeMultiPassSnapshot(id, fakeSnapshot(), 0);
        return fakeResult(id);
      });
    }
    assert.equal(await countCompleted(batchId), 1, "only one MULTI_PASS_COMPLETED row");
  });

  await check("concurrent same-batch calls do not both execute the workflow", async () => {
    const batchId = await makeBatch();
    let calls = 0;
    const runStub = async (id: string) => {
      calls++;
      // Hold the lock briefly so both calls are genuinely in flight.
      await new Promise((r) => setTimeout(r, 20));
      await writeMultiPassSnapshot(id, fakeSnapshot(), 0);
      return fakeResult(id);
    };
    const [a, b] = await Promise.all([
      runMultiPassIdempotent(batchId, runStub),
      runMultiPassIdempotent(batchId, runStub),
    ]);
    assert.equal(calls, 1, "the workflow executed exactly once across both calls");
    const executed = [a, b].filter((r) => r.executed).length;
    assert.equal(executed, 1, "at most one call executed the workflow");
    assert.equal(await countCompleted(batchId), 1, "single persisted snapshot");
  });

  console.log(`\nmulti-pass: ${passed} passed, ${failed} failed`);
}

async function cleanup() {
  for (const id of createdBatchIds) {
    await prisma.reconciliationLock.deleteMany({ where: { batchId: id } });
    await prisma.auditLog.deleteMany({ where: { batchId: id } });
    await prisma.batch.delete({ where: { id } });
  }
}

run()
  .then(cleanup)
  .then(() => {
    process.exitCode = failed > 0 ? 1 : 0;
    console.log(`\nmulti-pass: final ${failed > 0 ? "FAILURE" : "ALL PASSED"}`);
  })
  .catch(async (err) => {
    console.error("Multi-pass test harness crashed:", err);
    await cleanup();
    process.exitCode = 1;
  });
