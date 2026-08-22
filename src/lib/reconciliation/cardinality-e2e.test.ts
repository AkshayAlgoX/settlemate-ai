/*
 * End-to-end cardinality reconciliation test.
 *
 * Unlike cardinality.test.ts (which calls the solver functions in memory), this test
 * drives the FULL production path for each cardinality scenario:
 *   cardinality-generator → prisma.batch.create → runReconciliation
 *   → matcher → applyCardinalityMatching → ReconciliationResult → CardinalityLink
 *
 * It runs against an isolated temp SQLite database (schema pushed via `prisma db
 * push`), so test data can never pollute dev.db. Teardown deletes the temp DB.
 *
 * The prisma client and engine are imported DYNAMICALLY (inside main, after
 * DATABASE_URL is set) because @/lib/db reads the env at module-evaluation time.
 */

import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "@prisma/client";

// Pure generator — no DB import, safe to statically import.
import {
  generateCardinalityBatch,
  type CardinalityScenarioKind,
} from "../synthetic/cardinality-generator";

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

const tmpDir = mkdtempSync(path.join(tmpdir(), "sm-card-e2e-"));
const dbPath = path.join(tmpDir, "cardinality-e2e.db");
const dbUrl = `file:${dbPath.replace(/\\/g, "/")}`;

// Must be set before the prisma client is imported inside main().
process.env.DATABASE_URL = dbUrl;

// Assigned inside main() once the isolated client is available.
let prisma: PrismaClient | undefined;

interface CardinalityLinkRow {
  relationshipType: string;
  sourceIds: string;
  targetIds: string;
  amount: number;
  differencePaise: number;
  confidenceScore: number;
  reasonCode: string;
}

interface ResultRow {
  paymentId: string;
  cardinalityType: string;
  cardinalityReason: string | null;
  relationshipScore: number | null;
}

interface ScenarioOutcome {
  links: CardinalityLinkRow[];
  results: ResultRow[];
}

function singleLink(outcome: ScenarioOutcome): CardinalityLinkRow {
  if (outcome.links.length !== 1) {
    throw new Error(
      `expected exactly one CardinalityLink, got ${outcome.links.length}`,
    );
  }
  const link = outcome.links[0];
  if (!link) throw new Error("expected a CardinalityLink");
  return link;
}

function resultFor(outcome: ScenarioOutcome, paymentId: string): ResultRow {
  const r = outcome.results.find((x) => x.paymentId === paymentId);
  if (!r) {
    throw new Error(`expected a ReconciliationResult for ${paymentId}`);
  }
  return r;
}

function parseIds(json: string): string[] {
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed)) {
    throw new Error(`expected a JSON array of ids, got: ${json}`);
  }
  return parsed.filter((x): x is string => typeof x === "string");
}

async function main() {
  try {
    process.env.DATABASE_URL = dbUrl;

    execSync("npx prisma db push", {
      env: { ...process.env, DATABASE_URL: dbUrl },
      cwd: repoRoot,
      stdio: "pipe",
      timeout: 120000,
    });

    const db = await import("../../lib/db");
    prisma = db.prisma;
    const { runReconciliation } = await import("./engine");
    const p = prisma;

    async function runScenario(
      kind: CardinalityScenarioKind,
    ): Promise<ScenarioOutcome> {
      const record = generateCardinalityBatch(kind);
      const batch = await p.batch.create({
        data: {
          name: `cardinality-e2e ${kind}`,
          size: record.settlements.length,
          status: "CREATED",
          source: "GENERATED",
          orders: { create: record.orders },
          payments: { create: record.payments },
          settlements: { create: record.settlements },
          bankTransactions: { create: record.bankTransactions },
          refunds: { create: [] },
          chargebacks: { create: [] },
          groundTruths: { create: record.groundTruths },
        },
      });

      await runReconciliation(batch.id);

      const links = await p.cardinalityLink.findMany({
        where: { batchId: batch.id },
      });
      const results = await p.reconciliationResult.findMany({
        where: { batchId: batch.id },
      });

      return {
        links: links.map((l) => ({
          relationshipType: l.relationshipType,
          sourceIds: l.sourceIds,
          targetIds: l.targetIds,
          amount: l.amount,
          differencePaise: l.differencePaise,
          confidenceScore: l.confidenceScore,
          reasonCode: l.reasonCode,
        })),
        results: results.map((r) => ({
          paymentId: r.paymentId,
          cardinalityType: r.cardinalityType,
          cardinalityReason: r.cardinalityReason,
          relationshipScore: r.relationshipScore,
        })),
      };
    }

    console.log("\nCardinality reconciliation — end-to-end (runReconciliation) tests");

    await check("exact N:1 persists one CardinalityLink + N:1 result fields", async () => {
      const o = await runScenario("exactNto1");
      const link = singleLink(o);
      assert.equal(link.relationshipType, "N:1");
      assert.deepEqual(parseIds(link.sourceIds), ["setl_1", "setl_2"]);
      assert.deepEqual(parseIds(link.targetIds), ["txn_b1"]);
      assert.equal(link.amount, 35000);
      assert.equal(link.differencePaise, 0);
      assert.equal(link.confidenceScore, 96);
      assert.equal(link.reasonCode, "EXACT_MANY_TO_ONE_AGGREGATION");
      for (const pay of ["pay_1", "pay_2"]) {
        const r = resultFor(o, pay);
        assert.equal(r.cardinalityType, "N:1");
        assert.equal(r.cardinalityReason, "EXACT_MANY_TO_ONE_AGGREGATION");
        assert.equal(r.relationshipScore, 96);
      }
    });

    await check("exact 1:N persists one CardinalityLink + 1:N result fields", async () => {
      const o = await runScenario("exactOneToN");
      const link = singleLink(o);
      assert.equal(link.relationshipType, "1:N");
      assert.deepEqual(parseIds(link.sourceIds), ["setl_1"]);
      assert.deepEqual(parseIds(link.targetIds), ["txn_c1", "txn_c2", "txn_c3"]);
      assert.equal(link.amount, 50000);
      assert.equal(link.differencePaise, 0);
      assert.equal(link.confidenceScore, 96);
      assert.equal(link.reasonCode, "EXACT_ONE_TO_MANY_AGGREGATION");
      const r = resultFor(o, "pay_1");
      assert.equal(r.cardinalityType, "1:N");
      assert.equal(r.cardinalityReason, "EXACT_ONE_TO_MANY_AGGREGATION");
      assert.equal(r.relationshipScore, 96);
    });

    await check("exact N:M persists one CardinalityLink + N:M result fields", async () => {
      const o = await runScenario("exactNtoM");
      const link = singleLink(o);
      assert.equal(link.relationshipType, "N:M");
      assert.deepEqual(parseIds(link.sourceIds), ["setl_1", "setl_2"]);
      assert.deepEqual(parseIds(link.targetIds), ["txn_b1", "txn_b2"]);
      assert.equal(link.amount, 50000);
      assert.equal(link.differencePaise, 0);
      assert.equal(link.confidenceScore, 94);
      assert.equal(link.reasonCode, "EXACT_MANY_TO_MANY_CORRELATION");
      for (const pay of ["pay_1", "pay_2"]) {
        const r = resultFor(o, pay);
        assert.equal(r.cardinalityType, "N:M");
        assert.equal(r.cardinalityReason, "EXACT_MANY_TO_MANY_CORRELATION");
        assert.equal(r.relationshipScore, 94);
      }
    });

    await check("N:M with unrelated noise excludes noise from the resolved group", async () => {
      const o = await runScenario("nToMWithNoise");
      const link = singleLink(o);
      assert.equal(link.relationshipType, "N:M");
      assert.deepEqual(parseIds(link.sourceIds), ["setl_1", "setl_2"]);
      assert.deepEqual(parseIds(link.targetIds), ["txn_real1", "txn_real2"]);
      assert.equal(link.amount, 50000);
      assert.equal(link.differencePaise, 0);
      assert.equal(link.confidenceScore, 94);
      assert.equal(link.reasonCode, "EXACT_MANY_TO_MANY_CORRELATION");
      for (const pay of ["pay_1", "pay_2"]) {
        assert.equal(resultFor(o, pay).cardinalityType, "N:M");
      }
      // Noise settlement S3 must NOT be swept into the N:M.
      const noise = resultFor(o, "pay_3");
      assert.equal(noise.cardinalityType, "1:1");
      assert.equal(noise.relationshipScore, null);
    });

    await check("ambiguous N:M stays unresolved — no link, no fabricated N:M", async () => {
      const o = await runScenario("ambiguousNtoM");
      assert.equal(o.links.length, 0, "no CardinalityLink may be created");
      for (const pay of ["pay_1", "pay_2"]) {
        const r = resultFor(o, pay);
        assert.equal(r.cardinalityType, "1:1", `${pay} must not be relabelled`);
        assert.equal(r.cardinalityReason, null);
        assert.equal(r.relationshipScore, null);
      }
    });

    await check("tolerance boundary (delta == 100) is tolerated and persisted", async () => {
      const o = await runScenario("toleranceBoundary");
      const link = singleLink(o);
      assert.equal(link.relationshipType, "N:1");
      assert.deepEqual(parseIds(link.sourceIds), ["setl_1", "setl_2"]);
      assert.equal(link.amount, 34900);
      assert.equal(link.differencePaise, 100);
      assert.equal(link.confidenceScore, 90);
      assert.equal(link.reasonCode, "TOLERATED_MANY_TO_ONE_AGGREGATION");
      for (const pay of ["pay_1", "pay_2"]) {
        const r = resultFor(o, pay);
        assert.equal(r.cardinalityType, "N:1");
        assert.equal(r.relationshipScore, 90);
      }
    });

    await check("outside tolerance (delta == 101) produces no link", async () => {
      const o = await runScenario("outsideTolerance");
      assert.equal(o.links.length, 0, "no CardinalityLink beyond tolerance");
      for (const pay of ["pay_1", "pay_2"]) {
        assert.equal(resultFor(o, pay).cardinalityType, "1:1");
      }
    });

    await check("duplicate-candidate protection keeps both equal settlements, one link", async () => {
      const o = await runScenario("duplicateCandidates");
      const link = singleLink(o);
      assert.equal(link.relationshipType, "N:1");
      // Both equal-amount (30000) settlements participate; the 20000/10000 do not.
      assert.deepEqual(parseIds(link.sourceIds), ["setl_1", "setl_2"]);
      assert.deepEqual(parseIds(link.targetIds), ["txn_b1"]);
      assert.equal(link.amount, 60000);
      assert.equal(link.differencePaise, 0);
      assert.equal(link.confidenceScore, 96);
      assert.equal(link.reasonCode, "EXACT_MANY_TO_ONE_AGGREGATION");
      for (const pay of ["pay_1", "pay_2"]) {
        const r = resultFor(o, pay);
        assert.equal(r.cardinalityType, "N:1");
        assert.equal(r.relationshipScore, 96);
      }
      for (const pay of ["pay_3", "pay_4"]) {
        assert.equal(resultFor(o, pay).cardinalityType, "1:1");
      }
    });

    console.log(`\ncardinality-e2e: ${passed} passed, ${failed} failed`);
  } catch (err) {
    failed++;
    console.error("Cardinality e2e test harness crashed:", err);
  } finally {
    if (prisma) {
      await prisma.$disconnect().catch(() => undefined);
    }
    // Release file locks (SQLite) before removing the temp directory.
    rmSync(tmpDir, { recursive: true, force: true });
    process.exitCode = failed > 0 ? 1 : 0;
    console.log(`\ncardinality-e2e: final ${failed > 0 ? "FAILURE" : "ALL PASSED"}`);
  }
}

void main();
