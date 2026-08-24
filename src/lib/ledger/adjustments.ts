/*
 * SettleMate AI — Post-Finalization Late Event & Append-Only Adjustment Ledger (Day 1 Pass)
 *
 * Handles late financial events arriving AFTER batch finalization (e.g. late refunds, late chargebacks, late bank clawbacks):
 *   - Historical finalized ledger entry remains 100% IMMUTABLE
 *   - Emits an append-only Linked Adjustment Record pointing to the historical entry
 *   - Executes deterministic recalculation and invariant verification before committing
 *   - Idempotent: duplicate late event delivery produces identical adjustment entry
 */

import { createHash } from "node:crypto";

export interface FinalizedLedgerRecord {
  ledgerEntryId: string;
  batchId: string;
  paymentId: string;
  grossAmountPaise: number;
  feePaise: number;
  taxPaise: number;
  netSettledPaise: number;
  status: "FINALIZED";
  finalizedAt: Date;
  contentHash: string;
}

export type LateEventType = "LATE_REFUND" | "LATE_CHARGEBACK" | "LATE_BANK_ADJUSTMENT";

export interface LateFinancialEvent {
  eventId: string;
  originalLedgerEntryId: string;
  paymentId: string;
  eventType: LateEventType;
  adjustmentAmountPaise: number; // e.g. -1550 paise for refund
  reason: string;
  observedAt: Date;
  idempotencyKey: string;
}

export interface LinkedAdjustmentRecord {
  adjustmentEntryId: string;
  parentLedgerEntryId: string;
  paymentId: string;
  eventType: LateEventType;
  originalNetPaise: number;
  adjustmentAmountPaise: number;
  newEffectiveNetPaise: number;
  idempotencyKey: string;
  invariantStatus: "PASSED" | "CONTROL_FAILURE";
  createdAt: Date;
  adjustmentHash: string;
}

export class AdjustmentLedgerManager {
  private finalizedLedger = new Map<string, FinalizedLedgerRecord>();
  private adjustments = new Map<string, LinkedAdjustmentRecord>();
  private idempotencyRegistry = new Map<string, string>();

  registerFinalizedEntry(entry: FinalizedLedgerRecord) {
    this.finalizedLedger.set(entry.ledgerEntryId, Object.freeze({ ...entry }));
  }

  getFinalizedEntry(ledgerEntryId: string): FinalizedLedgerRecord | undefined {
    return this.finalizedLedger.get(ledgerEntryId);
  }

  getAdjustmentsForEntry(parentLedgerEntryId: string): LinkedAdjustmentRecord[] {
    return Array.from(this.adjustments.values()).filter(
      (a) => a.parentLedgerEntryId === parentLedgerEntryId
    );
  }

  processLateEvent(event: LateFinancialEvent): {
    success: boolean;
    adjustmentRecord?: LinkedAdjustmentRecord;
    isDuplicate: boolean;
    error?: string;
  } {
    // 1. Check idempotency
    const existingAdjId = this.idempotencyRegistry.get(event.idempotencyKey);
    if (existingAdjId) {
      const existing = this.adjustments.get(existingAdjId);
      return { success: true, adjustmentRecord: existing, isDuplicate: true };
    }

    // 2. Fetch immutable parent entry
    const parent = this.finalizedLedger.get(event.originalLedgerEntryId);
    if (!parent) {
      return { success: false, isDuplicate: false, error: "PARENT_LEDGER_ENTRY_NOT_FOUND" };
    }

    // 3. Deterministic Recalculation
    const originalNet = parent.netSettledPaise;
    const newEffectiveNet = originalNet + event.adjustmentAmountPaise;

    // 4. Invariant check: Effective net must not be negative or exceed gross
    const isInvariantValid = newEffectiveNet >= 0 && newEffectiveNet <= parent.grossAmountPaise;
    if (!isInvariantValid) {
      return {
        success: false,
        isDuplicate: false,
        error: `INVARIANT_BREACH: Effective net (${newEffectiveNet}) violates financial boundaries`,
      };
    }

    // 5. Generate deterministic adjustment hash
    const hashPayload = `${parent.ledgerEntryId}|${event.eventId}|${event.adjustmentAmountPaise}|${event.idempotencyKey}`;
    const adjustmentHash = createHash("sha256").update(hashPayload).digest("hex");
    const adjustmentEntryId = "adj_" + adjustmentHash.slice(0, 16);

    const record: LinkedAdjustmentRecord = {
      adjustmentEntryId,
      parentLedgerEntryId: parent.ledgerEntryId,
      paymentId: parent.paymentId,
      eventType: event.eventType,
      originalNetPaise: originalNet,
      adjustmentAmountPaise: event.adjustmentAmountPaise,
      newEffectiveNetPaise: newEffectiveNet,
      idempotencyKey: event.idempotencyKey,
      invariantStatus: "PASSED",
      createdAt: new Date(),
      adjustmentHash,
    };

    this.adjustments.set(adjustmentEntryId, Object.freeze(record));
    this.idempotencyRegistry.set(event.idempotencyKey, adjustmentEntryId);

    return { success: true, adjustmentRecord: record, isDuplicate: false };
  }
}
