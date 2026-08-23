/*
 * End-to-end audit chain + ledger test through the FULL production path.
 *
 * Drives runReconciliation against an isolated temp SQLite DB, then proves:
 *   - the per-batch AuditEvent hash chain is valid and records every lifecycle stage in order,
 *   - the ReconciliationLedger holds the finalized financial state (gross/net/approvalState),
 *   - tampering with a canonicalPayload, a currentHash, or the ordering all cause
 *     verifyAuditChain to fail — the chain is genuinely tamper-evident, not a UI badge.
 *
 * The prisma client and engine are imported dynamically (after DATABASE_URL is set) because
 * @/lib/db reads the env at module-evaluation time. Teardown removes the temp DB.
 */

import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "@prisma/client";

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

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");

const tmpDir = mkdtempSync(path.join(tmpdir(), "sm-audit-e2e-"));
const dbPath = path.join(tmpDir, "audit-e2e.db");
const dbUrl = `file:${dbPath.replace(/\\/g, "/")}`;
process.env.DATABASE_URL = dbUrl;

let prisma: PrismaClient | undefined;

interface EventSnapshot {
  id: string;
  canonicalPayload: string;
  currentHash: string;
}

async function main() {
  try {
    execSync("npx prisma db push", {
      env: { ...process.env, DATABASE_URL: dbUrl },
      cwd: repoRoot,
      stdio: "pipe",
      timeout: 120000,
    });

    const db = await import("../../lib/db");
    prisma = db.prisma;
    const { runReconciliation } = await import("./engine");
    const { verifyAuditChain } = await import("./audit-chain");
    const p = prisma;

    // ── Build a clean batch that routes STRAIGHT_THROUGH → COMPLETED ──
    const BASE = new Date("2025-01-01T00:00:00Z");
    const AMOUNT = 100000; // ₹1000, non-material
    const UTR = "UTR_AUDIT_1";

    const batch = await p.batch.create({
      data: {
        name: "audit-chain-e2e clean",
        size: 1,
        status: "CREATED",
        source: "GENERATED",
        orders: {
          create: [
            { orderId: "order_1", amount: AMOUNT, currency: "INR", status: "captured", customerEmail: "c@example.com", description: "", createdAt: BASE },
          ],
        },
        payments: {
          create: [
            { paymentId: "pay_1", orderId: "order_1", amount: AMOUNT, currency: "INR", status: "captured", method: "upi", fee: 0, tax: 0, capturedAt: BASE, createdAt: BASE },
          ],
        },
        settlements: {
          create: [
            { settlementId: "setl_1", paymentId: "pay_1", amount: AMOUNT, fee: 0, tax: 0, utr: UTR, status: "settled", settledAt: BASE, createdAt: BASE },
          ],
        },
        bankTransactions: {
          create: [
            { txnId: "txn_1", utr: UTR, amount: AMOUNT, type: "CREDIT", narration: "RAZORPAY SETTLEMENT", balance: 100000000, txnDate: new Date("2025-01-01T02:00:00Z"), valueDate: null },
          ],
        },
        groundTruths: { create: [{ paymentId: "pay_1", expectedLabel: "AUTO_MATCHED", scenario: "clean" }] },
      },
    });

    const batchId = batch.id;

    console.log("\nAudit chain + ledger — end-to-end (runReconciliation) tests");

    // ── The clean batch finalizes straight-through ──
    await check("clean batch finalizes to COMPLETED", async () => {
      await runReconciliation(batchId);
      const b = await p.batch.findUnique({ where: { id: batchId } });
      assert.equal(b?.status, "COMPLETED");
    });

    // ── Audit chain valid + ordered lifecycle events ──
    let events: Array<{ id: string; seq: number; eventType: string; canonicalPayload: string; currentHash: string }> = [];

    await check("verifyAuditChain is valid on an untampered run", async () => {
      const v = await verifyAuditChain(batchId);
      assert.equal(v.valid, true, JSON.stringify(v));
      assert.ok(v.eventCount >= 8, `expected >=8 events, got ${v.eventCount}`);
    });

    await check("every lifecycle stage is recorded in order", async () => {
      events = await p.auditEvent.findMany({ where: { batchId }, orderBy: { seq: "asc" } });
      const types = events.map((e) => e.eventType);
      assert.deepEqual(types, [
        "INGESTION",
        "POLICY_MODEL_VERSION",
        "NORMALIZATION",
        "MATCHING",
        "CARDINALITY_RELATIONSHIP",
        "AI_ANALYSIS",
        "INVARIANT_RESULT",
        "FINALIZATION",
      ]);
      // seq is consecutive from 0.
      events.forEach((e, i) => assert.equal(e.seq, i));
    });

    // ── Ledger holds the finalized financial state ──
    await check("ledger records gross/net, decision, approval, currency", async () => {
      const rows = await p.reconciliationLedger.findMany({ where: { batchId } });
      assert.equal(rows.length, 1);
      const e = rows[0];
      assert.equal(e.approvalState, "APPROVED");
      assert.equal(e.status, "ACTIVE");
      assert.equal(e.outcome, "AUTO_MATCHED");
      assert.equal(e.grossPaise, AMOUNT);
      assert.equal(e.feePaise, 0);
      assert.equal(e.taxPaise, 0);
      assert.equal(e.netPaise, AMOUNT);
      assert.equal(e.netPaise, e.expectedNetPaise);
      assert.equal(e.currency, "INR");
      const refs = JSON.parse(e.sourceRecordIds) as Record<string, string[]>;
      assert.deepEqual(refs.settlements, ["setl_1"]);
      assert.deepEqual(refs.bankTxns, ["txn_1"]);
    });

    // ── Tamper-evidence: each corruption must fail verification ──
    const snapshot: EventSnapshot[] = events.map((e) => ({
      id: e.id,
      canonicalPayload: e.canonicalPayload,
      currentHash: e.currentHash,
    }));

    async function restore(): Promise<void> {
      for (const s of snapshot) {
        await p.auditEvent.update({
          where: { id: s.id },
          data: { canonicalPayload: s.canonicalPayload, currentHash: s.currentHash },
        });
      }
    }

    const mid = events[Math.min(1, events.length - 1)];
    const first = events[0];

    await check("tampering a canonicalPayload makes verification fail", async () => {
      await restore();
      await p.auditEvent.update({
        where: { id: mid.id },
        data: { canonicalPayload: JSON.stringify({ eventType: "MATCHING", n: 999 }) },
      });
      const v = await verifyAuditChain(batchId);
      assert.equal(v.valid, false);
      assert.equal(v.reason, "HASH_MISMATCH");
    });

    await check("tampering a currentHash makes verification fail", async () => {
      await restore();
      await p.auditEvent.update({
        where: { id: first.id },
        data: { currentHash: "f".repeat(64) },
      });
      const v = await verifyAuditChain(batchId);
      assert.equal(v.valid, false);
      assert.equal(v.reason, "HASH_MISMATCH");
    });

    await check("swapping two events' payloads (reorder) makes verification fail", async () => {
      await restore();
      const p1 = events[0].canonicalPayload;
      const p2 = events[1].canonicalPayload;
      await p.auditEvent.update({ where: { id: events[0].id }, data: { canonicalPayload: p2 } });
      await p.auditEvent.update({ where: { id: events[1].id }, data: { canonicalPayload: p1 } });
      const v = await verifyAuditChain(batchId);
      assert.equal(v.valid, false);
    });

    await check("after restoring, the chain verifies again (tamper is detectable, not permanent)", async () => {
      await restore();
      const v = await verifyAuditChain(batchId);
      assert.equal(v.valid, true);
    });

    console.log(`\naudit-e2e: ${passed} passed, ${failed} failed`);
  } catch (err) {
    failed++;
    console.error("Audit e2e test harness crashed:", err);
  } finally {
    if (prisma) {
      await prisma.$disconnect().catch(() => undefined);
    }
    rmSync(tmpDir, { recursive: true, force: true });
    process.exitCode = failed > 0 ? 1 : 0;
    console.log(`\naudit-e2e: final ${failed > 0 ? "FAILURE" : "ALL PASSED"}`);
  }
}

void main();
