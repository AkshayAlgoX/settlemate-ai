import { prisma } from "@/lib/db";
import { runReconciliation } from "./engine";
import { runAnomalyAgent } from "./anomaly-agent";
import { runResolverAgent } from "./resolver-agent";
import { runAdversarialTest } from "./adversarial";
import { computeCalibration } from "./calibration";
import { resetAICounter, getAIStatus } from "@/lib/ai/client";

export interface MultiPassResult {
  batchId: string;
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
    fallbackUsed: boolean;
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

  // Reset AI counter for this batch
  resetAICounter();

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
  const aiStatusBeforePass2 = getAIStatus();
  const anomalyResults = aiStatusBeforePass2.available
    ? await runAnomalyAgent(batchId)
    : [];
  const pass2Duration = Math.round(performance.now() - pass2Start);
  const pass2Stats = await computeAccuracy(batchId);
  const aiCallsPass2 = getAIStatus().totalCalls - aiStatusBeforePass2.totalCalls;

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
  const aiStatusBeforePass3 = getAIStatus();
  const resolverResults = aiStatusBeforePass3.available
    ? await runResolverAgent(batchId)
    : [];
  const pass3Duration = Math.round(performance.now() - pass3Start);
  const pass3Stats = await computeAccuracy(batchId);
  const aiCallsPass3 = getAIStatus().totalCalls - aiStatusBeforePass3.totalCalls;

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
  const finalAIStatus = getAIStatus();

  await prisma.batch.update({
    where: { id: batchId },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      processingTimeMs: totalDuration,
      throughputRps: Math.round((pass1Stats.total / (totalDuration / 1000)) * 100) / 100,
    },
  });

  await prisma.auditLog.create({
    data: {
      batchId,
      actor: "SYSTEM",
      action: "MULTI_PASS_COMPLETED",
      entityType: "batch",
      entityId: batchId,
      reason: `3-pass complete in ${totalDuration}ms. AI calls: ${finalAIStatus.totalCalls}/10. Adversarial: ${adversarial.detectionRate}%.`,
      metadata: JSON.stringify({
        totalDurationMs: totalDuration,
        aiCalls: finalAIStatus.totalCalls,
        circuitTripped: finalAIStatus.circuitOpen,
      }),
    },
  });

  return {
    batchId,
    passes,
    aiStatus: {
      totalCalls: finalAIStatus.totalCalls,
      maxCalls: 10,
      circuitTripped: finalAIStatus.circuitOpen,
      fallbackUsed: !finalAIStatus.available,
    },
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
    totalDurationMs: totalDuration,
  };
}