import { prisma } from "@/lib/db";
import { runReconciliation } from "./engine";
import { runAnomalyAgent } from "./anomaly-agent";
import { runResolverAgent } from "./resolver-agent";
import { runAdversarialTest } from "./adversarial";
import { computeCalibration } from "./calibration";

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
  }>;
  adversarial: {
    totalTests: number;
    detected: number;
    detectionRate: number;
    tests: Array<{
      testName: string;
      detected: boolean;
      detectedAs: string | null;
    }>;
  };
  calibration: Array<{
    range: string;
    total: number;
    correct: number;
    accuracy: number;
  }>;
  totalDurationMs: number;
}

export async function runMultiPassReconciliation(
  batchId: string
): Promise<MultiPassResult> {
  const totalStart = performance.now();
  const passes: MultiPassResult["passes"] = [];

  // ── PASS 1: Deterministic Rules ──
  const pass1Start = performance.now();
  const pass1Metrics = await runReconciliation(batchId);
  const pass1Duration = Math.round(performance.now() - pass1Start);

  passes.push({
    passNumber: 1,
    name: "Deterministic Rules",
    accuracy: pass1Metrics.accuracy,
    exceptions: pass1Metrics.exceptionsFound,
    autoMatched: pass1Metrics.autoMatched,
    unresolved: pass1Metrics.unresolvedCount,
    durationMs: pass1Duration,
    details: `UTR matching, ID matching, fuzzy matching. ${pass1Metrics.totalRecords} records processed.`,
  });

  // Update batch with pass 1 accuracy
  await prisma.batch.update({
    where: { id: batchId },
    data: { pass1Accuracy: pass1Metrics.accuracy },
  });

  // ── PASS 2: Anomaly Detection Agent ──
  const pass2Start = performance.now();
  const anomalyResults = await runAnomalyAgent(batchId);
  const pass2Duration = Math.round(performance.now() - pass2Start);

  // Recount after anomaly agent
  const pass2Stats = await prisma.reconciliationResult.groupBy({
    by: ["status"],
    where: { batchId },
    _count: { status: true },
  });

  const pass2AutoMatched = pass2Stats.find((s) => s.status === "AUTO_MATCHED")?._count.status || 0;
  const pass2Total = pass2Stats.reduce((sum, s) => sum + s._count.status, 0);
  const pass2Exceptions = pass2Total - pass2AutoMatched;
  const pass2Unresolved = pass2Stats.find((s) => s.status === "NEEDS_MANUAL_REVIEW")?._count.status || 0;

  // Compute pass 2 accuracy
  const pass2Results = await prisma.reconciliationResult.findMany({ where: { batchId } });
  const pass2GroundTruths = await prisma.groundTruth.findMany({ where: { batchId } });
  const gtMap = new Map(pass2GroundTruths.map((g) => {
    const effective = g.expectedLabel === "ORPHAN_BANK_CREDIT" ? "AUTO_MATCHED" : g.expectedLabel;
    return [g.paymentId, effective];
  }));

  let pass2Correct = 0;
  let pass2Evaluated = 0;
  for (const r of pass2Results) {
    if (r.paymentId.startsWith("orphan_")) continue;
    const gt = gtMap.get(r.paymentId);
    if (!gt) continue;
    pass2Evaluated++;
    if (r.status === gt) pass2Correct++;
  }
  const pass2Accuracy = pass2Evaluated > 0 ? Math.round((pass2Correct / pass2Evaluated) * 10000) / 100 : 0;

  const reclassified = anomalyResults.filter((r) => r.shouldReclassify).length;

  passes.push({
    passNumber: 2,
    name: "Anomaly Detection Agent",
    accuracy: pass2Accuracy,
    exceptions: pass2Exceptions,
    autoMatched: pass2AutoMatched,
    unresolved: pass2Unresolved,
    durationMs: pass2Duration,
    details: `Reviewed ${anomalyResults.length} low-confidence matches. Reclassified ${reclassified}. AI model: gemini-1.5-flash.`,
  });

  await prisma.batch.update({
    where: { id: batchId },
    data: {
      pass2Accuracy,
      accuracy: pass2Accuracy,
      autoMatched: pass2AutoMatched,
      exceptionsFound: pass2Exceptions,
      unresolvedCount: pass2Unresolved,
    },
  });

  // ── PASS 3: Resolver Agent ──
  const pass3Start = performance.now();
  const resolverResults = await runResolverAgent(batchId);
  const pass3Duration = Math.round(performance.now() - pass3Start);

  const fixable = resolverResults.filter((r) => r.canAutoFix).length;
  const ticketNeeded = resolverResults.filter((r) => r.razorpayTicketNeeded).length;

  passes.push({
    passNumber: 3,
    name: "Resolver Agent",
    accuracy: pass2Accuracy, // Accuracy doesn't change until fixes are applied
    exceptions: pass2Exceptions,
    autoMatched: pass2AutoMatched,
    unresolved: pass2Unresolved,
    durationMs: pass3Duration,
    details: `Proposed fixes for ${resolverResults.length} exceptions. ${fixable} auto-fixable. ${ticketNeeded} need Razorpay support ticket.`,
  });

  await prisma.batch.update({
    where: { id: batchId },
    data: { pass3Accuracy: pass2Accuracy },
  });

  // ── ADVERSARIAL SELF-TEST ──
  const adversarial = await runAdversarialTest(batchId);

  // ── CALIBRATION ──
  const calibration = await computeCalibration(batchId);

  const totalDuration = Math.round(performance.now() - totalStart);

  await prisma.auditLog.create({
    data: {
      batchId,
      actor: "SYSTEM",
      action: "MULTI_PASS_COMPLETED",
      entityType: "batch",
      entityId: batchId,
      reason: `3-pass reconciliation complete. Pass 1: ${pass1Metrics.accuracy}%, Pass 2: ${pass2Accuracy}%. Adversarial: ${adversarial.detectionRate}%.`,
      metadata: JSON.stringify({ totalDurationMs: totalDuration, passes: passes.length }),
    },
  });

  return {
    batchId,
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
    totalDurationMs: totalDuration,
  };
}