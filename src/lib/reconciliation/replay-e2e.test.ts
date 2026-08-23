/*
 * Replay / versioning — end-to-end through the full production path.
 *
 * Drives runReconciliation against an isolated temp SQLite DB, then proves:
 *   - version capture: a RunMetadata row records runId, inputFingerprint, outcomeFingerprint,
 *     all 8 pipeline versions, outcomeStatus, and a timestamp;
 *   - replay identity + deterministic reproduction: re-running the same batch yields the same
 *     inputFingerprint, the same version set, and the same outcomeFingerprint;
 *   - changed version detection: verifyReplayForRun flags a run whose stored version drifted.
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

const tmpDir = mkdtempSync(path.join(tmpdir(), "sm-replay-e2e-"));
const dbPath = path.join(tmpDir, "replay-e2e.db");
const dbUrl = `file:${dbPath.replace(/\\/g, "/")}`;
process.env.DATABASE_URL = dbUrl;

let prisma: PrismaClient | undefined;

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
    const { verifyReplayForRun } = await import("./run-metadata");
    const p = prisma;

    // ── A clean batch that routes STRAIGHT_THROUGH → COMPLETED ──
    const BASE = new Date("2025-01-01T00:00:00Z");
    const AMOUNT = 100000;
    const UTR = "UTR_REPLAY_1";

    async function createBatch(name: string) {
      return p.batch.create({
        data: {
          name,
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
    }

    console.log("\nReplay / versioning — end-to-end (runReconciliation) tests");

    // ── Version capture ──
    const batch = await createBatch("replay-e2e batch");
    const batchId = batch.id;

    let runId = "";
    let storedInputFingerprint = "";
    let storedOutcomeFingerprint = "";

    await check("run captures runId, versions, fingerprints, status, and a timestamp", async () => {
      await runReconciliation(batchId);

      const runs = await p.runMetadata.findMany({ where: { batchId } });
      assert.equal(runs.length, 1);
      const r = runs[0];
      runId = r.runId;
      assert.ok(runId.length > 0, "runId is captured");
      assert.equal(r.outcomeStatus, "COMPLETED");
      assert.ok(r.createdAt instanceof Date, "timestamp is captured");

      // All 8 pipeline versions are captured.
      for (const [key, val] of Object.entries({
        providerSchemaVersion: r.providerSchemaVersion,
        normalizerVersion: r.normalizerVersion,
        matcherVersion: r.matcherVersion,
        cardinalityVersion: r.cardinalityVersion,
        rulesetVersion: r.rulesetVersion,
        policyVersion: r.policyVersion,
        modelVersion: r.modelVersion,
        engineVersion: r.engineVersion,
      })) {
        assert.ok(typeof val === "string" && val.length > 0, `${key} is captured`);
      }

      storedInputFingerprint = r.inputFingerprint;
      storedOutcomeFingerprint = r.outcomeFingerprint ?? "";
      assert.ok(storedInputFingerprint.length === 64, "inputFingerprint is a sha256 hex");
      assert.ok(storedOutcomeFingerprint.length === 64, "outcomeFingerprint is a sha256 hex");
    });

    // ── Replay identity + deterministic reproduction ──
    await check("re-running the same batch reproduces input + versions + outcome", async () => {
      await runReconciliation(batchId);

      const runs = await p.runMetadata.findMany({ where: { batchId }, orderBy: { createdAt: "asc" } });
      assert.equal(runs.length, 2, "a second run adds a second RunMetadata row");
      const second = runs[1];
      assert.notEqual(second.runId, runId, "each run has a unique runId");
      assert.equal(second.inputFingerprint, storedInputFingerprint, "same input → same inputFingerprint");
      assert.equal(second.outcomeFingerprint, storedOutcomeFingerprint, "same input + versions → same outcome");
      assert.equal(second.matcherVersion, runs[0].matcherVersion, "same matcher version across runs");
      assert.equal(second.engineVersion, runs[0].engineVersion);
    });

    // ── Changed version detection ──
    await check("verifyReplayForRun reports a run as replayable against current versions", async () => {
      const v = await verifyReplayForRun(runId);
      assert.equal(v.replayable, true);
      assert.deepEqual(v.changedLayers, []);
      assert.equal(v.run?.inputFingerprint, storedInputFingerprint);
    });

    await check("verifyReplayForRun flags a drifted stored version", async () => {
      // Simulate a pipeline change: bump the stored run's matcher version.
      await p.runMetadata.update({
        where: { runId },
        data: { matcherVersion: "0.9" },
      });
      const v = await verifyReplayForRun(runId);
      assert.equal(v.replayable, false);
      assert.deepEqual(v.changedLayers, ["matcher"]);
    });

    console.log(`\nreplay-e2e: ${passed} passed, ${failed} failed`);
  } catch (err) {
    failed++;
    console.error("Replay e2e test harness crashed:", err);
  } finally {
    if (prisma) {
      await prisma.$disconnect().catch(() => undefined);
    }
    rmSync(tmpDir, { recursive: true, force: true });
    process.exitCode = failed > 0 ? 1 : 0;
    console.log(`\nreplay-e2e: final ${failed > 0 ? "FAILURE" : "ALL PASSED"}`);
  }
}

void main();
