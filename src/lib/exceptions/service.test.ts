import assert from "node:assert/strict";
import { prisma } from "../../lib/db";
import { transitionException } from "./service";
import {
  ExceptionNotFoundError,
  InvalidWorkflowStateError,
} from "./service";
import { InvalidTransitionError } from "./state-machine";

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

async function countAudit(batchId: string, action = "WORKFLOW_TRANSITION") {
  return prisma.auditLog.count({ where: { batchId, action } });
}

let testBatchId: string | null = null;

async function run() {
  // ── Set up a disposable batch + exception in dev.db ──
  const batch = await prisma.batch.create({
    data: { name: "workflow-test", size: 1 },
  });
  testBatchId = batch.id;

  const exception = await prisma.exception.create({
    data: {
      batchId: batch.id,
      exceptionType: "AMOUNT_MISMATCH",
      amount: 100,
      confidenceScore: 50,
      status: "OPEN",
    },
  });
  const exId = exception.id;
  const getStatus = async () =>
    (await prisma.exception.findUnique({ where: { id: exId } }))?.status;

  console.log("\nException Workflow Service — DB-backed tests");

  await check("rejects an unknown target state", async () => {
    await assert.rejects(
      transitionException({ exceptionId: exId, toState: "MANUAL_REVIEW", actor: "USER" }),
      (e: unknown) => e instanceof InvalidWorkflowStateError
    );
  });

  await check("throws ExceptionNotFoundError for a missing exception", async () => {
    await assert.rejects(
      transitionException({ exceptionId: "does-not-exist", toState: "OPEN", actor: "USER" }),
      (e: unknown) => e instanceof ExceptionNotFoundError
    );
  });

  await check("invalid OPEN -> RESOLVED rejected and does not mutate", async () => {
    const auditsBefore = await countAudit(batch.id);
    await assert.rejects(
      transitionException({ exceptionId: exId, toState: "RESOLVED", actor: "USER" }),
      (e: unknown) => e instanceof InvalidTransitionError
    );
    assert.equal(await getStatus(), "OPEN");
    assert.equal(await countAudit(batch.id), auditsBefore);
  });

  await check("valid OPEN -> INVESTIGATING succeeds and writes audit", async () => {
    const res = await transitionException({
      exceptionId: exId,
      toState: "INVESTIGATING",
      actor: "USER",
      reason: "Manual investigation started",
    });
    assert.equal(res.success, true);
    assert.equal(res.idempotent, false);
    assert.equal(res.fromState, "OPEN");
    assert.equal(res.toState, "INVESTIGATING");
    assert.equal(res.exception?.status, "INVESTIGATING");
    const audit = await prisma.auditLog.findFirst({
      where: { batchId: batch.id, action: "WORKFLOW_TRANSITION", entityId: exId },
      orderBy: { timestamp: "desc" },
    });
    assert.ok(audit, "audit log created");
    assert.equal(audit.actor, "USER");
    assert.equal(audit.batchId, batch.id);
    assert.ok(audit.beforeState);
    assert.ok(audit.afterState);
    assert.equal(JSON.parse(audit.beforeState).status, "OPEN");
    assert.equal(JSON.parse(audit.afterState).status, "INVESTIGATING");
    assert.equal(audit.reason, "Manual investigation started");
  });

  await check("same-state INVESTIGATING -> INVESTIGATING is idempotent (no dup audit)", async () => {
    const auditsBefore = await countAudit(batch.id);
    const res = await transitionException({
      exceptionId: exId,
      toState: "INVESTIGATING",
      actor: "USER",
    });
    assert.equal(res.idempotent, true);
    assert.equal(res.exception, null);
    assert.equal(await countAudit(batch.id), auditsBefore);
  });

  await check("INVESTIGATING -> PENDING_APPROVAL -> REJECTED -> INVESTIGATING", async () => {
    await transitionException({ exceptionId: exId, toState: "PENDING_APPROVAL", actor: "USER", reason: "AI recommendation reviewed" });
    assert.equal(await getStatus(), "PENDING_APPROVAL");
    await transitionException({ exceptionId: exId, toState: "REJECTED", actor: "USER", reason: "Rejected after review" });
    assert.equal(await getStatus(), "REJECTED");
    await transitionException({ exceptionId: exId, toState: "INVESTIGATING", actor: "USER" });
    assert.equal(await getStatus(), "INVESTIGATING");
  });

  await check("RESOLVED transition sets resolution/resolvedBy/resolvedAt", async () => {
    await transitionException({ exceptionId: exId, toState: "PENDING_APPROVAL", actor: "USER" });
    const res = await transitionException({
      exceptionId: exId,
      toState: "RESOLVED",
      actor: "USER",
      reason: "Approved after evidence review",
      resolution: "Fee correction applied",
    });
    assert.equal(res.exception?.status, "RESOLVED");
    assert.equal(res.exception?.resolution, "Fee correction applied");
    assert.equal(res.exception?.resolvedBy, "USER");
    assert.ok(res.exception?.resolvedAt instanceof Date);
    const fb = await prisma.feedbackEntry.count({ where: { batchId: batch.id, exceptionId: exId } });
    assert.equal(fb, 1);
  });

  await check("RESOLVED -> REOPENED clears resolution fields", async () => {
    const res = await transitionException({ exceptionId: exId, toState: "REOPENED", actor: "USER" });
    assert.equal(res.exception?.status, "REOPENED");
    assert.equal(res.exception?.resolution, null);
    assert.equal(res.exception?.resolvedBy, null);
    assert.equal(res.exception?.resolvedAt, null);
  });

  await check("AI cannot directly resolve (OPEN has no RESOLVED exit)", async () => {
    await assert.rejects(
      transitionException({ exceptionId: exId, toState: "RESOLVED", actor: "AI" }),
      (e: unknown) => e instanceof InvalidTransitionError
    );
  });

  await check("CAS guard rejects a stale concurrent write", async () => {
    const cur = await prisma.exception.findUnique({ where: { id: exId } });
    assert.equal(cur?.status, "REOPENED");
    await transitionException({ exceptionId: exId, toState: "INVESTIGATING", actor: "USER" });
    const staleWrite = await prisma.exception.updateMany({
      where: { id: exId, status: "REOPENED" }, // request B's stale expected state
      data: { status: "ESCALATED" },
    });
    assert.equal(staleWrite.count, 0, "stale CAS write affected 0 rows");
    assert.equal(await getStatus(), "INVESTIGATING");
  });

  await check("failed transition does not mutate and writes no audit", async () => {
    const auditsBefore = await countAudit(batch.id);
    await assert.rejects(
      transitionException({ exceptionId: exId, toState: "REJECTED", actor: "USER" }), // INVESTIGATING -> REJECTED invalid
      (e: unknown) => e instanceof InvalidTransitionError
    );
    assert.equal(await getStatus(), "INVESTIGATING");
    assert.equal(await countAudit(batch.id), auditsBefore);
  });

  console.log(`\nservice: ${passed} passed, ${failed} failed`);
}

async function cleanup() {
  if (testBatchId) {
    await prisma.auditLog.deleteMany({ where: { batchId: testBatchId } });
    await prisma.feedbackEntry.deleteMany({ where: { batchId: testBatchId } });
    await prisma.exception.deleteMany({ where: { batchId: testBatchId } });
    await prisma.batch.delete({ where: { id: testBatchId } });
  }
}

run()
  .then(cleanup)
  .then(() => {
    process.exitCode = failed > 0 ? 1 : 0;
    console.log(`\nservice: final ${failed > 0 ? "FAILURE" : "ALL PASSED"}`);
  })
  .catch(async (err) => {
    console.error("Service test harness crashed:", err);
    await cleanup();
    process.exitCode = 1;
  });
