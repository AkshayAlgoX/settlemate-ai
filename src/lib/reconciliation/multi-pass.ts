import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { runReconciliation } from "./engine";
import { runAnomalyAgent } from "./anomaly-agent";
import { runResolverAgent } from "./resolver-agent";
import { runAdversarialTest } from "./adversarial";
import { computeCalibration } from "./calibration";
import { createAIContext } from "@/lib/ai/context";

// A completed multi-pass run is signalled by a single MULTI_PASS_COMPLETED
// audit row whose metadata holds the persisted snapshot. The dashboard reads
// this snapshot (GET) instead of re-running reconciliation, and the POST guard
// uses it to make repeated runs idempotent.
const MULTI_PASS_COMPLETED = "MULTI_PASS_COMPLETED";

// A lock held longer than this (e.g. the process crashed mid-run) is treated
// as stale and reclaimable by the next POST, so a crashed run never permanently
// blocks re-running a batch.
const LOCK_STALE_MS = 60_000;

export interface MultiPassSnapshotBody {
  passes: Array<{
    passNumber: number;
    name: string;
    accuracy: number;
    exceptions: number;
    autoMatched: number;
    unresolved: number;
    durationMs: number;
    details: string;
    aiUsed: boolean;
    aiCallsMade: number;
  }>;
  aiStatus: {
    totalCalls: number;
    maxCalls: number;
    circuitTripped: boolean;
  };
  adversarial: {
    totalTests: number;
    detected: number;
    detectionRate: number;
    tests: Array<{ testName: string; detected: boolean; detectedAs: string | null }>;
  };
  calibration: Array<{ range: string; total: number; correct: number; accuracy: number }>;
  totalDurationMs: number;
}

export interface MultiPassResult extends MultiPassSnapshotBody {
  batchId: string;
  aiStatus: {
    totalCalls: number;
    maxCalls: number;
    circuitTripped: boolean;
    fallbackUsed: boolean;
  };
}

/** Read the latest persisted multi-pass snapshot for a batch, if any. */
export async function readMultiPassSnapshot(
  batchId: string
): Promise<{ persisted: boolean } & Partial<MultiPassSnapshotBody>> {
  const lastRun = await prisma.auditLog.findFirst({
    where: { batchId, action: MULTI_PASS_COMPLETED },
    orderBy: { timestamp: "desc" },
    select: { metadata: true },
  });

  const snapshot = lastRun?.metadata
    ? (JSON.parse(lastRun.metadata) as Record<string, unknown> | null)
    : null;

  if (!snapshot) {
    return { persisted: false };
  }

  // New snapshots nest AI status under `aiStatus`; older ones kept flat keys
  // (`aiCalls` / `circuitTripped`). Read both so already-persisted rows remain
  // readable.
  const nestedAI = snapshot.aiStatus as
    | { totalCalls?: number; circuitTripped?: boolean }
    | undefined;

  return {
    persisted: true,
    passes: (snapshot.passes as MultiPassSnapshotBody["passes"]) ?? [],
    aiStatus: {
      totalCalls:
        (nestedAI?.totalCalls as number) ?? (snapshot.aiCalls as number) ?? 0,
      maxCalls: 10,
      circuitTripped:
        (nestedAI?.circuitTripped as boolean) ??
        (snapshot.circuitTripped as boolean) ??
        false,
    },
    adversarial: snapshot.adversarial as MultiPassSnapshotBody["adversarial"],
    calibration: snapshot.calibration as MultiPassSnapshotBody["calibration"],
    totalDurationMs: (snapshot.totalDurationMs as number) ?? 0,
  };
}

/**
 * Atomically persist the final multi-pass outcome: mark the batch COMPLETED and
 * write the snapshot audit row in a single transaction so a crash can never
 * leave a COMPLETED batch with no persisted snapshot (or vice versa).
 */
export async function writeMultiPassSnapshot(
  batchId: string,
  snapshot: MultiPassSnapshotBody,
  throughputRps: number
): Promise<void> {
  await prisma.$transaction([
    prisma.batch.update({
      where: { id: batchId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        processingTimeMs: snapshot.totalDurationMs,
        throughputRps,
      },
    }),
    prisma.auditLog.create({
      data: {
        batchId,
        actor: "SYSTEM",
        action: MULTI_PASS_COMPLETED,
        entityType: "batch",
        entityId: batchId,
        reason: `3-pass complete in ${snapshot.totalDurationMs}ms. AI calls: ${snapshot.aiStatus.totalCalls}/10. Adversarial: ${snapshot.adversarial.detectionRate}%.`,
        metadata: JSON.stringify(snapshot),
      },
    }),
  ]);
}

/** Acquire the per-batch reconciliation lock; reclaim a stale lock if present. */
async function claimMultiPassLock(
  batchId: string
): Promise<{ claimed: boolean; token: string }> {
  const token = randomUUID();
  try {
    await prisma.reconciliationLock.create({ data: { batchId, token } });
    return { claimed: true, token };
  } catch {
    // Another holder exists. Reclaim only if it is stale (crashed holder).
    const lock = await prisma.reconciliationLock.findUnique({ where: { batchId } });
    const stale = lock && Date.now() - lock.lockedAt.getTime() > LOCK_STALE_MS;
    if (stale) {
      await prisma.reconciliationLock.deleteMany({
        where: { batchId, token: lock!.token },
      });
      try {
        await prisma.reconciliationLock.create({ data: { batchId, token } });
        return { claimed: true, token };
      } catch {
        // Lost the reclaim race to another caller; someone else is active.
      }
    }
    return { claimed: false, token };
  }
}

/** Release the reconciliation lock (no-op if it was already reclaimed). */
async function releaseMultiPassLock(batchId: string, token: string): Promise<void> {
  await prisma.reconciliationLock.deleteMany({ where: { batchId, token } });
}

export interface MultiPassIdempotentResult {
  executed: boolean;
  inProgress: boolean;
  idempotent: boolean;
  body: Partial<MultiPassSnapshotBody>;
}

/**
 * Idempotent + concurrency-safe entry point for the multi-pass POST.
 *
 * - If a run already persisted its snapshot, return it without re-running.
 * - Otherwise claim the per-batch lock; the winner runs, the loser observes
 *   either the freshly-persisted snapshot or an in-progress state.
 * - The runner releases the lock when done (also on error).
 *
 * `run` is injectable for tests; production uses runMultiPassReconciliation.
 */
export async function runMultiPassIdempotent(
  batchId: string,
  run: (batchId: string) => Promise<MultiPassResult> = runMultiPassReconciliation
): Promise<MultiPassIdempotentResult> {
  const existing = await readMultiPassSnapshot(batchId);
  if (existing.persisted) {
    return { executed: false, inProgress: false, idempotent: true, body: existing };
  }

  const claim = await claimMultiPassLock(batchId);
  if (!claim.claimed) {
    // Another caller holds the lock. If it finished between our snapshot read
    // and our claim attempt, return the now-persisted result; otherwise report
    // in-progress so the client knows to retry rather than double-run.
    const nowExisting = await readMultiPassSnapshot(batchId);
    if (nowExisting.persisted) {
      return { executed: false, inProgress: false, idempotent: true, body: nowExisting };
    }
    return { executed: false, inProgress: true, idempotent: false, body: {} };
  }

  try {
    const result = await run(batchId);
    return {
      executed: true,
      inProgress: false,
      idempotent: false,
      body: {
        passes: result.passes,
        aiStatus: result.aiStatus,
        adversarial: result.adversarial,
        calibration: result.calibration,
        totalDurationMs: result.totalDurationMs,
      },
    };
  } finally {
    await releaseMultiPassLock(batchId, claim.token);
  }
}

async function computeAccuracy(batchId: string): Promise<{
  accuracy: number;
  autoMatched: number;
  exceptions: number;
  unresolved: number;
  total: number;
}> {
  const results = await prisma.reconciliationResult.findMany({ where: { batchId } });
  const groundTruths = await prisma.groundTruth.findMany({ where: { batchId } });
  const gtMap = new Map(
    groundTruths.map((g) => [
      g.paymentId,
      g.expectedLabel === "ORPHAN_BANK_CREDIT" ? "AUTO_MATCHED" : g.expectedLabel,
    ])
  );

  let correct = 0;
  let evaluated = 0;
  for (const r of results) {
    if (r.paymentId.startsWith("orphan_")) continue;
    const gt = gtMap.get(r.paymentId);
    if (!gt) continue;
    evaluated++;
    if (r.status === gt) correct++;
  }

  const autoMatched = results.filter((r) => r.status === "AUTO_MATCHED").length;
  const unresolved = results.filter((r) => r.status === "NEEDS_MANUAL_REVIEW").length;

  return {
    accuracy: evaluated > 0 ? Math.round((correct / evaluated) * 10000) / 100 : 0,
    autoMatched,
    exceptions: results.length - autoMatched,
    unresolved,
    total: results.length,
  };
}

export async function runMultiPassReconciliation(
  batchId: string
): Promise<MultiPassResult> {
  const totalStart = performance.now();
  const passes: MultiPassResult["passes"] = [];

  // Create exactly one isolated AI execution context for this reconciliation.
  // Concurrent batches each get their own context (own counter, own circuit),
  // while the shared account quota protection stays global in client.ts.
  const ai = createAIContext();

  // ── PASS 1: Deterministic Rules (NO AI) ──
  const pass1Start = performance.now();
  await runReconciliation(batchId);
  const pass1Duration = Math.round(performance.now() - pass1Start);
  const pass1Stats = await computeAccuracy(batchId);

  passes.push({
    passNumber: 1,
    name: "Deterministic Rules",
    accuracy: pass1Stats.accuracy,
    exceptions: pass1Stats.exceptions,
    autoMatched: pass1Stats.autoMatched,
    unresolved: pass1Stats.unresolved,
    durationMs: pass1Duration,
    details: `UTR + ID + fuzzy matching. ${pass1Stats.total} records. No AI used.`,
    aiUsed: false,
    aiCallsMade: 0,
  });

  await prisma.batch.update({
    where: { id: batchId },
    data: {
      pass1Accuracy: pass1Stats.accuracy,
      accuracy: pass1Stats.accuracy,
      autoMatched: pass1Stats.autoMatched,
      exceptionsFound: pass1Stats.exceptions,
      unresolvedCount: pass1Stats.unresolved,
    },
  });

  // ── PASS 2: Anomaly Detection Agent (AI, max 1 batched call) ──
  const pass2Start = performance.now();
  const aiStatusBeforePass2 = ai.getStatus();
  const anomalyResults = aiStatusBeforePass2.available
    ? await runAnomalyAgent(batchId, ai)
    : [];
  const pass2Duration = Math.round(performance.now() - pass2Start);
  const pass2Stats = await computeAccuracy(batchId);
  const aiCallsPass2 = ai.getStatus().totalCalls - aiStatusBeforePass2.totalCalls;

  const reclassified = anomalyResults.filter((r) => r.shouldReclassify).length;

  passes.push({
    passNumber: 2,
    name: "Anomaly Detection Agent",
    accuracy: pass2Stats.accuracy,
    exceptions: pass2Stats.exceptions,
    autoMatched: pass2Stats.autoMatched,
    unresolved: pass2Stats.unresolved,
    durationMs: pass2Duration,
    details: aiStatusBeforePass2.available
      ? `Reviewed ${anomalyResults.length} cases. Reclassified ${reclassified}. ${aiCallsPass2} AI calls.`
      : `AI unavailable (${aiStatusBeforePass2.reason}). Skipped.`,
    aiUsed: aiCallsPass2 > 0,
    aiCallsMade: aiCallsPass2,
  });

  await prisma.batch.update({
    where: { id: batchId },
    data: {
      pass2Accuracy: pass2Stats.accuracy,
      accuracy: pass2Stats.accuracy,
      autoMatched: pass2Stats.autoMatched,
      exceptionsFound: pass2Stats.exceptions,
      unresolvedCount: pass2Stats.unresolved,
    },
  });

  // ── PASS 3: Resolver Agent (AI, max 1 batched call) ──
  const pass3Start = performance.now();
  const aiStatusBeforePass3 = ai.getStatus();
  const resolverResults = aiStatusBeforePass3.available
    ? await runResolverAgent(batchId, ai)
    : [];
  const pass3Duration = Math.round(performance.now() - pass3Start);
  const pass3Stats = await computeAccuracy(batchId);
  const aiCallsPass3 = ai.getStatus().totalCalls - aiStatusBeforePass3.totalCalls;

  const fixable = resolverResults.filter((r) => r.canAutoFix).length;
  const ticketNeeded = resolverResults.filter((r) => r.razorpayTicketNeeded).length;

  passes.push({
    passNumber: 3,
    name: "Resolver Agent",
    accuracy: pass3Stats.accuracy,
    exceptions: pass3Stats.exceptions,
    autoMatched: pass3Stats.autoMatched,
    unresolved: pass3Stats.unresolved,
    durationMs: pass3Duration,
    details: aiStatusBeforePass3.available
      ? `${resolverResults.length} proposals. ${fixable} auto-fixable. ${ticketNeeded} tickets. ${aiCallsPass3} AI calls.`
      : `AI unavailable (${aiStatusBeforePass3.reason}). Skipped.`,
    aiUsed: aiCallsPass3 > 0,
    aiCallsMade: aiCallsPass3,
  });

  await prisma.batch.update({
    where: { id: batchId },
    data: { pass3Accuracy: pass3Stats.accuracy },
  });

  // ── ADVERSARIAL + CALIBRATION ──
  const adversarial = await runAdversarialTest(batchId);
  const calibration = await computeCalibration(batchId);

  const totalDuration = Math.round(performance.now() - totalStart);
  const finalAIStatus = ai.getStatus();

  const throughputRps = Math.round((pass1Stats.total / (totalDuration / 1000)) * 100) / 100;

  // The full multi-pass snapshot is persisted in the audit metadata so the
  // dashboard can READ it (GET) instead of re-running reconciliation on every
  // view. The COMPLETED status and the snapshot audit row are written in one
  // transaction so a crash cannot leave a torn final state.
  const snapshot: MultiPassSnapshotBody = {
    totalDurationMs: totalDuration,
    aiStatus: {
      totalCalls: finalAIStatus.totalCalls,
      maxCalls: 10,
      circuitTripped: finalAIStatus.circuitOpen,
    },
    passes,
    adversarial: {
      totalTests: adversarial.totalTests,
      detected: adversarial.detected,
      detectionRate: adversarial.detectionRate,
      tests: adversarial.tests.map((t) => ({
        testName: t.testName,
        detected: t.detected,
        detectedAs: t.detectedAs,
      })),
    },
    calibration,
  };

  await writeMultiPassSnapshot(batchId, snapshot, throughputRps);

  return {
    batchId,
    passes,
    aiStatus: {
      totalCalls: finalAIStatus.totalCalls,
      maxCalls: 10,
      circuitTripped: finalAIStatus.circuitOpen,
      fallbackUsed: !finalAIStatus.available,
    },
    adversarial: snapshot.adversarial,
    calibration,
    totalDurationMs: totalDuration,
  };
}