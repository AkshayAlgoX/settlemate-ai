/*
 * Reconciliation Ledger — the finalized financial state, one row per reconciled payment.
 *
 * Each entry traces back to: the batch/run, the Decision Engine decision (outcome, riskLevel,
 * reasonCode, matchStrategy), the source records it consumed (settlements, bank transactions,
 * refunds, chargebacks), and the gross / fee / tax / refund / chargeback / net breakdown in
 * integer paise, plus currency. `approvalState` records how the batch was routed
 * (APPROVED straight-through / PENDING_REVIEW / PENDING_APPROVAL).
 *
 * buildLedgerEntries is pure and deterministic. persistLedger writes to the DB and keeps version
 * history: an existing ACTIVE entry set for the batch is marked SUPERSEDED and a new ACTIVE set is
 * written at version+1, so re-runs never destroy the prior finalized state.
 */

import { prisma } from "@/lib/db";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { MatchResult } from "./types";
import type { DecisionReport } from "./decision";

export type LedgerApprovalState = "APPROVED" | "PENDING_REVIEW" | "PENDING_APPROVAL";

/** Values written into ReconciliationLedger (id/createdAt are DB-generated). */
export interface LedgerEntry {
  paymentId: string;
  orderId: string;
  runId: string | null;
  outcome: string;
  riskLevel: string;
  reasonCode: string;
  matchStrategy: string;
  approvalState: LedgerApprovalState;
  sourceRecordIds: string;
  grossPaise: number;
  feePaise: number;
  taxPaise: number;
  refundPaise: number;
  chargebackPaise: number;
  netPaise: number;
  currency: string;
  expectedNetPaise: number;
  actualSettledPaise: number | null;
  bankCreditedPaise: number | null;
  mismatchPaise: number | null;
}

export type PrismaLike = PrismaClient | Prisma.TransactionClient;

/**
 * The platform is INR-only: every amount is integer paise and every payment is priced in INR.
 * Exposed so ledger entries carry the actual currency rather than a fabricated field.
 */
export const LEDGER_CURRENCY = "INR";

export interface BuildLedgerEntriesInput {
  results: MatchResult[];
  decisionReport: DecisionReport;
  approvalState: LedgerApprovalState;
  runId?: string | null;
}

function sourceRecordIdsFor(result: MatchResult): string {
  return JSON.stringify({
    settlements: result.settlementIds,
    bankTxns: result.bankTxnIds,
    refunds: result.refundIds,
    chargebacks: result.chargebackIds,
  });
}

/** Deterministically build one ledger entry per reconciliation result. */
export function buildLedgerEntries(
  input: BuildLedgerEntriesInput,
): LedgerEntry[] {
  const decisionByPaymentId = new Map(
    input.decisionReport.decisions.map((d) => [d.paymentId, d]),
  );

  return input.results.map((r) => {
    const decision = decisionByPaymentId.get(r.paymentId);
    const netPaise =
      r.paymentAmount - r.paymentFee - r.paymentTax - r.refundAmount - r.chargebackAmount;
    return {
      paymentId: r.paymentId,
      orderId: r.orderId,
      runId: input.runId ?? null,
      outcome: decision?.outcome ?? "EXCEPTION",
      riskLevel: decision?.riskLevel ?? "MEDIUM",
      reasonCode: decision?.reasonCode ?? "EXCEPTION_UNCLASSIFIED",
      matchStrategy: decision?.matchStrategy ?? "UNRESOLVED",
      approvalState: input.approvalState,
      sourceRecordIds: sourceRecordIdsFor(r),
      grossPaise: r.paymentAmount,
      feePaise: r.paymentFee,
      taxPaise: r.paymentTax,
      refundPaise: r.refundAmount,
      chargebackPaise: r.chargebackAmount,
      netPaise,
      currency: LEDGER_CURRENCY,
      expectedNetPaise: r.expectedNetAmount,
      actualSettledPaise: r.actualSettledAmount,
      bankCreditedPaise: r.bankCreditedAmount,
      mismatchPaise: r.mismatchAmount,
    };
  });
}

/**
 * Persist a ledger set for a batch, SUPERSEDING the prior ACTIVE set and writing a new ACTIVE set
 * at version+1 (version history preserved across re-runs). Returns the number of rows written.
 */
export async function persistLedger(
  batchId: string,
  entries: LedgerEntry[],
  client?: PrismaLike,
): Promise<number> {
  const db = client ?? prisma;

  const prior = await db.reconciliationLedger.aggregate({
    where: { batchId },
    _max: { version: true },
  });
  const version = (prior._max.version ?? 0) + 1;

  await db.reconciliationLedger.updateMany({
    where: { batchId, status: "ACTIVE" },
    data: { status: "SUPERSEDED" },
  });

  const data: Prisma.ReconciliationLedgerCreateManyInput[] = entries.map((e) => ({
    ...e,
    batchId,
    version,
    status: "ACTIVE",
  }));

  if (data.length > 0) {
    const CHUNK = 2000;
    for (let i = 0; i < data.length; i += CHUNK) {
      await db.reconciliationLedger.createMany({ data: data.slice(i, i + CHUNK) });
    }
  }
  return data.length;
}
