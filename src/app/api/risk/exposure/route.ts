/*
 * SettleMate AI — Risk & Exposure Command Center API
 *
 * POST /api/risk/exposure
 *
 * Aggregates the unresolved financial risk across a reconciliation batch into a
 * single controller-facing exposure report (category breakdown, tolerance
 * stacking, SLA / duplicate / cross-currency risks, and a 0–100 risk score).
 *
 * Input (all optional):
 *   { "batchId": "job_..." }  — score the exceptions of a stored reconciliation
 *                               job (as returned by POST /api/v1/reconcile).
 *   {}                        — no batchId: score a pre-seeded COMBINED dataset
 *                               built by merging all five Scenario Lab scenarios
 *                               into one batch and running the real engine once.
 *
 * To analyze arbitrary transactions, POST them to /api/v1/reconcile first, then
 * pass the returned jobId here as batchId — this endpoint deliberately does not
 * re-implement CSV/transaction ingestion, keeping a single source of truth for
 * parsing and matching.
 *
 * This route is additive and isolated: it reuses the existing deterministic
 * engine (buildIndexes → matchAllRecords → applyCardinalityMatching) and the
 * exported Scenario Lab data builder WITHOUT modifying either. It changes no
 * reconciliation logic, AI validation, or financial invariant.
 */

import { NextRequest, NextResponse } from "next/server";
import { instrument } from "@/lib/observability/route";
import { safeErrorResponse } from "@/lib/security/api-security";
import { buildIndexes } from "@/lib/reconciliation/indexer";
import { matchAllRecords } from "@/lib/reconciliation/matcher";
import { applyCardinalityMatching } from "@/lib/reconciliation/apply-cardinality";
import { buildScenarioData } from "@/app/api/scenarios/run/route";
import { v1Store } from "@/lib/api/v1-store";
import { computeRiskExposure, type RiskExceptionInput } from "@/lib/risk/scoring";
import type { BatchData } from "@/lib/reconciliation/types";

/** The five deterministic Scenario Lab datasets that seed the default combined batch. */
const COMBINED_SCENARIO_IDS = [
  "partial-refund",
  "fee-discrepancy",
  "chargeback",
  "delayed-settlement",
  "duplicate-payment",
] as const;

/**
 * Merge the five Scenario Lab batches into a single BatchData. Every scenario
 * uses distinct reference ids (TXN_PR_101, TXN_FEE_201, …) so there are no id
 * collisions. Also returns a paymentId → scenario-category map used to classify
 * each resulting exception with its precise business family.
 */
function buildCombinedBatch(): { batch: BatchData; categoryByPayment: Map<string, string> } {
  const batch: BatchData = {
    orders: [],
    payments: [],
    settlements: [],
    bankTransactions: [],
    refunds: [],
    chargebacks: [],
    groundTruths: [],
  };
  const categoryByPayment = new Map<string, string>();

  for (const id of COMBINED_SCENARIO_IDS) {
    const { category, batchData } = buildScenarioData(id);
    batch.orders.push(...batchData.orders);
    batch.payments.push(...batchData.payments);
    batch.settlements.push(...batchData.settlements);
    batch.bankTransactions.push(...batchData.bankTransactions);
    batch.refunds.push(...batchData.refunds);
    batch.chargebacks.push(...batchData.chargebacks);
    for (const p of batchData.payments) categoryByPayment.set(p.paymentId, category);
  }

  return { batch, categoryByPayment };
}

/**
 * Run the deterministic reconciliation engine over a batch and project every
 * unresolved exception (anything that is neither AUTO_MATCHED nor a
 * SUGGESTED_MATCH — the same definition the v1 API and Scenario Lab use) into
 * the risk scorer's input shape. Variance is exact integer paise.
 */
async function reconcileToRiskInputs(
  batch: BatchData,
  categoryByPayment: Map<string, string>
): Promise<RiskExceptionInput[]> {
  const indexes = buildIndexes(batch);
  const results = matchAllRecords(batch, indexes);
  await applyCardinalityMatching(results, batch);

  const inputs: RiskExceptionInput[] = [];
  results.forEach((res, idx) => {
    if (res.status === "AUTO_MATCHED" || res.status === "SUGGESTED_MATCH") return;
    const mismatch = res.mismatchAmount ?? res.expectedNetAmount - (res.actualSettledAmount ?? 0);
    inputs.push({
      id: `EXP_${res.paymentId || idx + 1}`,
      type: res.status,
      paymentId: res.paymentId,
      variancePaise: Math.abs(mismatch),
      category: categoryByPayment.get(res.paymentId),
      expectedNetPaise: res.expectedNetAmount,
      actualSettledPaise: res.actualSettledAmount,
      cardinalityType: res.cardinalityType,
      description: res.matchDetails || undefined,
    });
  });
  return inputs;
}

async function handleExposure(req: NextRequest) {
  try {
    let batchId: string | null = null;
    if (req.method === "POST") {
      const body = (await req.json().catch(() => ({}))) as { batchId?: unknown };
      if (typeof body.batchId === "string" && body.batchId.trim()) {
        batchId = body.batchId.trim();
      }
    }
    if (!batchId) {
      const qBatch = req.nextUrl.searchParams.get("batchId");
      if (qBatch && qBatch.trim()) {
        batchId = qBatch.trim();
      }
    }

    let source: "batch" | "combined-scenarios";
    let datasetLabel: string;
    let exceptions: RiskExceptionInput[];

    if (batchId) {
      const job = v1Store.getJob(batchId);
      if (!job) {
        return NextResponse.json(
          { success: false, error: { code: "BATCH_NOT_FOUND", message: `No reconciliation job found for batchId '${batchId}'.` } },
          { status: 404 }
        );
      }
      source = "batch";
      datasetLabel = `Stored reconciliation job ${batchId}`;
      exceptions = (job.exceptions ?? []).map((e) => ({
        id: e.id,
        type: e.type,
        paymentId: e.paymentId,
        variancePaise: Math.abs(e.mismatchAmount ?? e.amount ?? 0),
        expectedNetPaise: e.expectedNetAmount,
        actualSettledPaise: e.actualSettledAmount,
        cardinalityType: e.cardinalityType,
        description: e.description,
      }));
    } else {
      source = "combined-scenarios";
      datasetLabel = "Combined Scenario Lab dataset (5 finance-ops scenarios)";
      const { batch, categoryByPayment } = buildCombinedBatch();
      exceptions = await reconcileToRiskInputs(batch, categoryByPayment);
    }

    const report = computeRiskExposure(exceptions);

    return NextResponse.json({
      success: true,
      source,
      batchId,
      datasetLabel,
      scenarioCount: source === "combined-scenarios" ? COMBINED_SCENARIO_IDS.length : undefined,
      generatedAt: new Date().toISOString(),
      report,
    });
  } catch (err) {
    // safeErrorResponse masks 5xx detail; the raw message leaked engine paths.
    return safeErrorResponse(err, 500, "RISK_EXPOSURE_ERROR");
  }
}

export const GET = instrument("risk.exposure", handleExposure);
export const POST = instrument("risk.exposure", handleExposure);
