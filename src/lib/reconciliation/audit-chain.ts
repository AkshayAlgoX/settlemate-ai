/*
 * Tamper-evident audit chain — an append-only, per-batch lineage.
 *
 * Each event links to the previous event in the batch via a hash chain:
 *   currentHash = sha256(previousHash + canonicalPayload)
 * where canonicalPayload is a deterministic serialization of the event. The first event in a
 * batch chains off GENESIS_HASH. seq is consecutive per batch (enforced in the DB by
 * @@unique([batchId, seq])).
 *
 * verifyAuditChain(batchId) recomputes every link from the stored canonicalPayload and
 * previousHash; if any row was altered, deleted, or reordered, a link breaks and verification
 * fails. This makes the chain tamper-EVIDENT — it proves linkage, order, and internal
 * consistency, but it is not cryptographically immutable (a reader who rewrites every
 * subsequent row is out of scope; we state exactly what we prove).
 *
 * The pure core (canonicalize, hashChainLink, verifyChainFromRows) has no I/O and is
 * independently unit-testable. The thin DB wrapper (appendAuditEvent, verifyAuditChain)
 * accepts an optional Prisma client so it can run inside an existing transaction (client: tx).
 */

import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import type { Prisma, PrismaClient } from "@prisma/client";

/** Previous-hash of the first event in a batch (a sentinel, not a real digest). */
export const GENESIS_HASH = "0".repeat(64);

/** The lifecycle events the audit chain records. */
export const AUDIT_EVENT_TYPES = [
  "INGESTION",
  "NORMALIZATION",
  "MATCHING",
  "CARDINALITY_RELATIONSHIP",
  "AI_ANALYSIS",
  "HUMAN_ACTION",
  "INVARIANT_RESULT",
  "FINALIZATION",
  "POLICY_MODEL_VERSION",
] as const;
export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

/** The fields verifyChainFromRows needs from a stored row. */
export interface AuditEventRow {
  seq: number;
  previousHash: string;
  currentHash: string;
  canonicalPayload: string;
}

export type PrismaLike = PrismaClient | Prisma.TransactionClient;

/** Hex SHA-256 digest of a UTF-8 string. */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function canonicalize(payload: object): string {
  function stringify(value: unknown): string {
    if (value instanceof Date) return JSON.stringify(value.toISOString());
    if (value === undefined || value === null) return "null";
    if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") {
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
      let res = "[";
      for (let i = 0; i < value.length; i++) {
        if (i > 0) res += ",";
        res += stringify(value[i]);
      }
      return res + "]";
    }
    if (typeof value === "object") {
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record).sort();
      let res = "{";
      let first = true;
      for (const key of keys) {
        const v = record[key];
        if (v === undefined) continue;
        if (!first) res += ",";
        first = false;
        res += JSON.stringify(key) + ":" + stringify(v);
      }
      return res + "}";
    }
    return JSON.stringify(value);
  }
  return stringify(payload);
}

/** Hash one link of the chain: sha256(previousHash + canonicalPayload). */
export function hashChainLink(previousHash: string, canonicalPayload: string): string {
  return sha256Hex(previousHash + canonicalPayload);
}

export interface ChainVerification {
  valid: boolean;
  /** Short reason when invalid, e.g. "HASH_MISMATCH" or "LINK_BROKEN". */
  reason?: string;
  /** The seq of the row that failed, when invalid. */
  seq?: number;
  eventCount: number;
}

/**
 * Verify a chain from its rows. Rows may arrive in any order; they are sorted by seq.
 * An empty chain is valid. Never silently passes — returns a reason + seq on any failure.
 */
export function verifyChainFromRows(rows: AuditEventRow[]): ChainVerification {
  const sorted = [...rows].sort((a, b) => a.seq - b.seq);
  const eventCount = sorted.length;
  if (eventCount === 0) return { valid: true, eventCount: 0 };

  if (sorted[0] && sorted[0].previousHash !== GENESIS_HASH) {
    return { valid: false, reason: "BAD_GENESIS", seq: sorted[0].seq, eventCount };
  }

  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i];
    // Consecutive, gapless ordering — a deletion or skip breaks this.
    if (row.seq !== i) {
      return { valid: false, reason: "SEQ_GAP_OR_REORDER", seq: row.seq, eventCount };
    }
    // Internal consistency of the row's own link.
    if (row.currentHash !== hashChainLink(row.previousHash, row.canonicalPayload)) {
      return { valid: false, reason: "HASH_MISMATCH", seq: row.seq, eventCount };
    }
    // Linkage to the previous row — catches reordering and payload swaps.
    if (i > 0) {
      const prev = sorted[i - 1];
      if (prev && row.previousHash !== prev.currentHash) {
        return { valid: false, reason: "LINK_BROKEN", seq: row.seq, eventCount };
      }
    }
  }
  return { valid: true, eventCount };
}

export interface AppendAuditEventInput {
  batchId: string;
  eventType: string;
  actor: string;
  entityId?: string | null;
  /** Event-specific fields; eventType/actor/entityId/occurredAt are merged in and hashed. */
  payload: Record<string, unknown>;
  occurredAt?: Date;
  client?: PrismaLike;
}

export interface AppendAuditEventResult {
  seq: number;
  previousHash: string;
  currentHash: string;
}

/**
 * Append one event to a batch's chain and return its seq + hashes. The previous hash is read
 * from the batch's last event (or GENESIS_HASH for the first). Pass client: tx to append inside
 * an existing transaction so the event is atomic with the caller's write.
 */
export async function appendAuditEvent(
  input: AppendAuditEventInput,
): Promise<AppendAuditEventResult> {
  const db = input.client ?? prisma;
  const occurredAt = input.occurredAt ?? new Date();

  const last = await db.auditEvent.findFirst({
    where: { batchId: input.batchId },
    orderBy: { seq: "desc" },
    select: { seq: true, currentHash: true },
  });

  const previousHash = last ? last.currentHash : GENESIS_HASH;
  const seq = last ? last.seq + 1 : 0;
  const canonicalPayload = canonicalize({
    ...input.payload,
    eventType: input.eventType,
    actor: input.actor,
    entityId: input.entityId ?? null,
    occurredAt: occurredAt.toISOString(),
  });
  const currentHash = hashChainLink(previousHash, canonicalPayload);

  await db.auditEvent.create({
    data: {
      batchId: input.batchId,
      seq,
      eventType: input.eventType,
      actor: input.actor,
      entityId: input.entityId ?? null,
      occurredAt,
      canonicalPayload,
      previousHash,
      currentHash,
    },
  });

  return { seq, previousHash, currentHash };
}

/**
 * Verify the full chain for a batch. Returns { valid, reason?, seq?, eventCount }. This is the
 * tamper check — a caller (route, test, report) surfaces a non-valid result; it never passes
 * silently.
 */
export async function verifyAuditChain(
  batchId: string,
  client?: PrismaLike,
): Promise<ChainVerification> {
  const db = client ?? prisma;
  const rows = await db.auditEvent.findMany({
    where: { batchId },
    orderBy: { seq: "asc" },
    select: { seq: true, previousHash: true, currentHash: true, canonicalPayload: true },
  });
  return verifyChainFromRows(rows);
}
