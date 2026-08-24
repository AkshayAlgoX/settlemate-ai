/*
 * SettleMate AI — Missing Source Lifecycle & Degraded-Source Resilience Engine (Day 8)
 *
 * Implements deterministic lifecycle tracking for missing/degraded third-party sources:
 *   - Gateway webhook / Bank statement outage tracking
 *   - Deterministic Evidence Completeness Score (COMPLETE, PARTIAL, MISSING_CRITICAL, CONFLICTING)
 *   - Exponential backoff retry windows with strict SLA deadlines
 *   - Idempotent recovery webhook deduplication
 *   - Safe AI abstention enforcement (zero fabricated missing facts)
 */

import { createHash } from "node:crypto";
import type { EvidenceSourceType } from "./types";

export type SourceAvailabilityStatus =
  | "AVAILABLE"
  | "SOURCE_UNAVAILABLE"
  | "PENDING_RETRY"
  | "DELAYED_SLA_BREACHED"
  | "PERMANENT_OUTAGE_EXCEPTION"
  | "CONFLICTING_DATA_RECEIVED";

export type EvidenceCompletenessState =
  | "COMPLETE"
  | "PARTIAL"
  | "MISSING_CRITICAL_SOURCE"
  | "CONFLICTING";

export interface SourceTrackerEntry {
  sourceKey: string;
  sourceType: EvidenceSourceType;
  provider: string;
  status: SourceAvailabilityStatus;
  firstSeenAt: Date;
  lastAttemptAt: Date;
  retryCount: number;
  nextRetryAt: Date;
  slaDeadline: Date;
  recoveredAt?: Date;
  receivedPayloads: Array<{ payloadHash: string; receivedAt: Date; content: unknown }>;
}

export interface CompletenessEvaluation {
  state: EvidenceCompletenessState;
  scorePct: number; // 0–100
  availableSources: EvidenceSourceType[];
  missingCriticalSources: EvidenceSourceType[];
  degradedSources: SourceTrackerEntry[];
  aiMustAbstain: boolean;
  canAutoFinalize: boolean;
  explanation: string;
}

export class SourceLifecycleManager {
  private sources = new Map<string, SourceTrackerEntry>();
  private defaultSlaHours = 48;

  constructor(options: { defaultSlaHours?: number } = {}) {
    if (options.defaultSlaHours) {
      this.defaultSlaHours = options.defaultSlaHours;
    }
  }

  /**
   * Registers a missing / unavailable external source (e.g. gateway webhook outage).
   */
  registerOutage(
    sourceKey: string,
    sourceType: EvidenceSourceType,
    provider: string,
    now: Date = new Date()
  ): SourceTrackerEntry {
    const slaDeadline = new Date(now.getTime() + this.defaultSlaHours * 3600_000);
    const entry: SourceTrackerEntry = {
      sourceKey,
      sourceType,
      provider,
      status: "SOURCE_UNAVAILABLE",
      firstSeenAt: now,
      lastAttemptAt: now,
      retryCount: 0,
      nextRetryAt: new Date(now.getTime() + 60_000), // 1 min initial retry
      slaDeadline,
      receivedPayloads: [],
    };
    this.sources.set(sourceKey, entry);
    return entry;
  }

  /**
   * Records a retry polling attempt with exponential backoff.
   */
  recordRetryAttempt(sourceKey: string, now: Date = new Date()): SourceTrackerEntry | null {
    const entry = this.sources.get(sourceKey);
    if (!entry) return null;

    entry.retryCount += 1;
    entry.lastAttemptAt = now;

    // Check if SLA deadline exceeded
    if (now > entry.slaDeadline) {
      entry.status = "DELAYED_SLA_BREACHED";
    } else {
      entry.status = "PENDING_RETRY";
    }

    // Exponential backoff: 1m, 2m, 4m, 8m ... max 4h
    const backoffMs = Math.min(60_000 * Math.pow(2, entry.retryCount), 4 * 3600_000);
    entry.nextRetryAt = new Date(now.getTime() + backoffMs);

    return entry;
  }

  /**
   * Handles an incoming recovery webhook with idempotent duplicate detection.
   */
  handleRecoveryWebhook(
    sourceKey: string,
    content: Record<string, unknown>,
    now: Date = new Date()
  ): { status: "RECOVERED_NEW" | "IDEMPOTENT_DUPLICATE" | "CONFLICTING_PAYLOAD"; entry: SourceTrackerEntry } {
    let entry = this.sources.get(sourceKey);
    if (!entry) {
      entry = {
        sourceKey,
        sourceType: "WEBHOOK",
        provider: "EXTERNAL",
        status: "AVAILABLE",
        firstSeenAt: now,
        lastAttemptAt: now,
        retryCount: 0,
        nextRetryAt: now,
        slaDeadline: new Date(now.getTime() + this.defaultSlaHours * 3600_000),
        receivedPayloads: [],
      };
      this.sources.set(sourceKey, entry);
    }

    const payloadHash = createHash("sha256").update(JSON.stringify(content)).digest("hex");

    // Check for exact duplicate
    const existing = entry.receivedPayloads.find((p) => p.payloadHash === payloadHash);
    if (existing) {
      return { status: "IDEMPOTENT_DUPLICATE", entry };
    }

    // Check for conflicting payload on same source key
    if (entry.receivedPayloads.length > 0) {
      entry.status = "CONFLICTING_DATA_RECEIVED";
      entry.receivedPayloads.push({ payloadHash, receivedAt: now, content });
      return { status: "CONFLICTING_PAYLOAD", entry };
    }

    // First authentic recovery
    entry.status = "AVAILABLE";
    entry.recoveredAt = now;
    entry.receivedPayloads.push({ payloadHash, receivedAt: now, content });
    return { status: "RECOVERED_NEW", entry };
  }

  /**
   * Deterministically evaluates the Evidence Completeness Score for an exception.
   */
  evaluateCompleteness(availableTypes: EvidenceSourceType[]): CompletenessEvaluation {
    const hasPayment = availableTypes.includes("PAYMENT");
    const hasBankOrSettlement = availableTypes.includes("SETTLEMENT") || availableTypes.includes("BANK_RECORD");
    const hasContext = availableTypes.includes("INVOICE") || availableTypes.includes("REFUND") || availableTypes.includes("DOCUMENT");

    const degraded = Array.from(this.sources.values()).filter(
      (s) => s.status === "SOURCE_UNAVAILABLE" || s.status === "PENDING_RETRY" || s.status === "DELAYED_SLA_BREACHED"
    );

    const hasConflict = Array.from(this.sources.values()).some((s) => s.status === "CONFLICTING_DATA_RECEIVED");

    if (hasConflict) {
      return {
        state: "CONFLICTING",
        scorePct: 30,
        availableSources: availableTypes,
        missingCriticalSources: [],
        degradedSources: degraded,
        aiMustAbstain: true,
        canAutoFinalize: false,
        explanation: "Contradictory source webhooks received. Silent auto-finalization blocked; Maker/Checker required.",
      };
    }

    const missingCritical: EvidenceSourceType[] = [];
    if (!hasPayment) missingCritical.push("PAYMENT");
    if (!hasBankOrSettlement) missingCritical.push("BANK_RECORD");

    if (missingCritical.length > 0) {
      return {
        state: "MISSING_CRITICAL_SOURCE",
        scorePct: availableTypes.length === 0 ? 0 : 25,
        availableSources: availableTypes,
        missingCriticalSources: missingCritical,
        degradedSources: degraded,
        aiMustAbstain: true,
        canAutoFinalize: false,
        explanation: `Missing critical financial source(s): ${missingCritical.join(", ")}. AI prohibited from inferring missing facts; awaiting recovery or SLA expiration.`,
      };
    }

    if (!hasContext && availableTypes.length < 3) {
      return {
        state: "PARTIAL",
        scorePct: 75,
        availableSources: availableTypes,
        missingCriticalSources: [],
        degradedSources: degraded,
        aiMustAbstain: false,
        canAutoFinalize: true,
        explanation: "Core financial records present; supplemental invoice/document context absent but non-blocking.",
      };
    }

    return {
      state: "COMPLETE",
      scorePct: 100,
      availableSources: availableTypes,
      missingCriticalSources: [],
      degradedSources: degraded,
      aiMustAbstain: false,
      canAutoFinalize: true,
      explanation: "All required primary and contextual evidence sources verified.",
    };
  }
}
