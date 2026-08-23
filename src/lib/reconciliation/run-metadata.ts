/*
 * Run metadata — the reusable representation of a reconciliation run, and deterministic replay.
 *
 * Every run captures (persisted to RunMetadata): runId, inputFingerprint, the eight pipeline
 * versions (providerSchema, normalizer, matcher, cardinality, ruleset, policy, model, engine),
 * outcomeFingerprint, outcomeStatus, and a timestamp.
 *
 * Replay identity is (inputFingerprint, version set): the same input hashed identically + the same
 * versions ⇒ the same deterministic outcome. outcomeFingerprint is a deterministic hash of the
 * reconciliation outcome that EXCLUDES wall-clock timing (processingTimeMs / throughputRps /
 * phaseTimings), so two identical runs hash equal. verifyReplay detects when a stored run's version
 * set differs from the current pipeline, flagging it as no longer reproducible.
 *
 * The pure core has no I/O and is independently testable. The DB wrapper persists/fetches rows.
 */

import { prisma } from "@/lib/db";
import type { MatchResult, BatchData, ReconciliationMetrics } from "./types";
import { PIPELINE_VERSIONS, type PipelineVersions } from "./versions";
import { canonicalize, sha256Hex } from "./audit-chain";

/** A full set of pipeline versions as plain strings (DB rows) or literal versions (PIPELINE_VERSIONS). */
export type VersionSet = Record<keyof PipelineVersions, string>;

/** Deterministic hash of the normalized input the run consumed. */
export function buildInputFingerprint(data: BatchData): string {
  return sha256Hex(canonicalize(data));
}

/**
 * Deterministic hash of the reconciliation outcome. Projects only reproducible fields — the
 * per-result classification and the deterministic metric counts — and deliberately EXCLUDES
 * processingTimeMs / throughputRps / phaseTimings so two identical runs hash equal.
 */
export function buildOutcomeFingerprint(
  results: MatchResult[],
  metrics: ReconciliationMetrics,
): string {
  const projection = {
    results: results.map((r) => ({
      paymentId: r.paymentId,
      status: r.status,
      matchMethod: r.matchMethod,
      expectedNetAmount: r.expectedNetAmount,
      bankCreditedAmount: r.bankCreditedAmount,
      mismatchAmount: r.mismatchAmount,
      confidenceScore: r.confidenceScore,
      cardinalityType: r.cardinalityType,
      cardinalityReason: r.cardinalityReason,
      settlementIds: r.settlementIds,
      bankTxnIds: r.bankTxnIds,
      refundIds: r.refundIds,
      chargebackIds: r.chargebackIds,
    })),
    metrics: {
      totalRecords: metrics.totalRecords,
      autoMatched: metrics.autoMatched,
      exceptionsFound: metrics.exceptionsFound,
      unresolvedCount: metrics.unresolvedCount,
      accuracy: metrics.accuracy,
      precision: metrics.precision,
      recall: metrics.recall,
      grossOrderAmount: metrics.grossOrderAmount,
      capturedPayments: metrics.capturedPayments,
      expectedSettlement: metrics.expectedSettlement,
      actualBankCredits: metrics.actualBankCredits,
      totalRefunds: metrics.totalRefunds,
      totalChargebacks: metrics.totalChargebacks,
      amountAtRisk: metrics.amountAtRisk,
      perTypeMetrics: metrics.perTypeMetrics,
      exceptionsByType: metrics.exceptionsByType,
    },
  };
  return sha256Hex(canonicalize(projection));
}

/** The replay identity: same input fingerprint + same versions ⇒ same identity ⇒ same outcome. */
export function runIdentity(inputFingerprint: string, versions: VersionSet): string {
  return sha256Hex(canonicalize({ inputFingerprint, versions }));
}

export interface ReplayVerification {
  replayable: boolean;
  /** Version layers whose stored value differs from the current pipeline, when not replayable. */
  changedLayers: string[];
}

/**
 * Diff a stored run's versions against the current pipeline. replayable is true iff no layer differs;
 * otherwise changedLayers lists the differing keys (changed version detection).
 */
export function verifyReplay(
  stored: VersionSet,
  current: VersionSet,
): ReplayVerification {
  const changedLayers = (Object.keys(current) as (keyof PipelineVersions)[]).filter(
    (k) => current[k] !== stored[k],
  );
  return { replayable: changedLayers.length === 0, changedLayers };
}

export interface PersistRunMetadataInput {
  runId: string;
  batchId: string;
  inputFingerprint: string;
  outcomeFingerprint: string | null;
  outcomeStatus: string;
  versions?: PipelineVersions;
}

/** Persist (upsert by runId) a run's metadata row. */
export async function persistRunMetadata(
  input: PersistRunMetadataInput,
): Promise<void> {
  const versions = input.versions ?? PIPELINE_VERSIONS;
  await prisma.runMetadata.upsert({
    where: { runId: input.runId },
    create: {
      runId: input.runId,
      batchId: input.batchId,
      inputFingerprint: input.inputFingerprint,
      outcomeFingerprint: input.outcomeFingerprint,
      providerSchemaVersion: versions.providerSchema,
      normalizerVersion: versions.normalizer,
      matcherVersion: versions.matcher,
      cardinalityVersion: versions.cardinality,
      rulesetVersion: versions.ruleset,
      policyVersion: versions.policy,
      modelVersion: versions.model,
      engineVersion: versions.engine,
      outcomeStatus: input.outcomeStatus,
    },
    update: {
      batchId: input.batchId,
      inputFingerprint: input.inputFingerprint,
      outcomeFingerprint: input.outcomeFingerprint,
      providerSchemaVersion: versions.providerSchema,
      normalizerVersion: versions.normalizer,
      matcherVersion: versions.matcher,
      cardinalityVersion: versions.cardinality,
      rulesetVersion: versions.ruleset,
      policyVersion: versions.policy,
      modelVersion: versions.model,
      engineVersion: versions.engine,
      outcomeStatus: input.outcomeStatus,
    },
  });
}

/** A stored run's versions, reconstructed from a DB row. */
export interface StoredVersions {
  providerSchema: string;
  normalizer: string;
  matcher: string;
  cardinality: string;
  ruleset: string;
  policy: string;
  model: string;
  engine: string;
}

export interface RunMetadataRow extends StoredVersions {
  id: string;
  runId: string;
  batchId: string;
  inputFingerprint: string;
  outcomeFingerprint: string | null;
  outcomeStatus: string | null;
  createdAt: Date;
}

/** Fetch one stored run's metadata. Returns null when the runId is unknown. */
export async function getRunMetadata(runId: string): Promise<RunMetadataRow | null> {
  const row = await prisma.runMetadata.findUnique({ where: { runId } });
  if (!row) return null;
  return {
    id: row.id,
    runId: row.runId,
    batchId: row.batchId,
    inputFingerprint: row.inputFingerprint,
    outcomeFingerprint: row.outcomeFingerprint,
    outcomeStatus: row.outcomeStatus,
    createdAt: row.createdAt,
    providerSchema: row.providerSchemaVersion,
    normalizer: row.normalizerVersion,
    matcher: row.matcherVersion,
    cardinality: row.cardinalityVersion,
    ruleset: row.rulesetVersion,
    policy: row.policyVersion,
    model: row.modelVersion,
    engine: row.engineVersion,
  };
}

/**
 * Verify a stored run is reproducible against the current pipeline: its version set must match
 * PIPELINE_VERSIONS. Returns replayable + the changed layers if a version has drifted.
 */
export async function verifyReplayForRun(runId: string): Promise<
  ReplayVerification & {
    run: RunMetadataRow | null;
  }
> {
  const run = await getRunMetadata(runId);
  if (!run) {
    return { replayable: false, changedLayers: ["run-not-found"], run: null };
  }
  const verdict = verifyReplay(
    {
      providerSchema: run.providerSchema,
      normalizer: run.normalizer,
      matcher: run.matcher,
      cardinality: run.cardinality,
      ruleset: run.ruleset,
      policy: run.policy,
      model: run.model,
      engine: run.engine,
    },
    PIPELINE_VERSIONS,
  );
  return { ...verdict, run };
}
