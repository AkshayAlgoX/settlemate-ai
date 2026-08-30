/*
 * SettleMate AI — End-to-End (E2E) System Workflow Test Suite
 *
 * Exercises all 6 critical user journeys end-to-end:
 * 1. Judge Mode 7-Step Tour & Hostile Injection Defenses
 * 2. Sandbox CSV Ingestion & Schema Guards
 * 3. Security Lab 10-Vector Adversarial Attacks
 * 4. Verification Hub Async Live Progress Engine
 * 5. Developer API Console & OpenAPI Contract
 * 6. External ERP Integration Simulator & Webhook Stream
 */

import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST as sandboxPost } from "@/app/api/sandbox/reconcile/route";
import { POST as securityAttackPost } from "@/app/api/security/attack/route";
import { POST as verifyRunPost } from "@/app/api/verify/run/route";
import { GET as verifyProgressGet } from "@/app/api/verify/progress/[jobId]/route";
import { GET as healthGet } from "@/app/api/v1/health/route";
import { GET as docsGet } from "@/app/api/docs/route";
import { POST as v1ReconcilePost } from "@/app/api/v1/reconcile/route";
import { GET as webhookLogsGet } from "@/app/api/v1/webhooks/logs/route";
import { generateSimulatorBatch } from "@/lib/simulator/simulator-generator";

const TEST_API_KEY = "sk_live_e2e_system_test_token_88997766";

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log("  ✓ " + name);
  } catch (err) {
    console.error("  ✗ " + name + " — " + (err as Error).message);
    throw err;
  }
}

async function main() {
  console.log("\n=========================================================================");
  console.log(" 🌐 SETTLEMATE AI — END-TO-END (E2E) SYSTEM WORKFLOW SUITE");
  console.log("=========================================================================\n");

  // =========================================================================
  // WORKFLOW 1: Judge Mode Tour & Invariant Flow
  // =========================================================================
  await test("E2E Journey 1: Judge Mode 7-step evaluation & hostile claim dispute", async () => {
    // Step 1 & 2: Validate official benchmark dataset & fingerprint
    const evalRes = await verifyRunPost(
      new NextRequest("http://localhost:3000/api/verify/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suites: ["benchmark", "receipt"] }),
      })
    );
    assert.equal(evalRes.status, 200);
    const evalJson = await evalRes.json();
    assert.equal(evalJson.success, true);
    assert.equal(evalJson.results.benchmark.status, "PASS");
    assert.equal(evalJson.results.receipt.metrics.offlineVerdict, "VERIFIED");

    // Step 4 & 5: Adversarial Fake Claim Neutralization
    const attackRes = await securityAttackPost(
      new NextRequest("http://localhost:3000/api/security/attack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attackId: "ai-injection" }),
      })
    );
    assert.equal(attackRes.status, 200);
    const attackJson = await attackRes.json();
    assert.equal(attackJson.success, true);
    assert.equal(attackJson.attack.blocked, true);
    assert.equal(attackJson.attack.attackId, "ai-injection");
  });

  // =========================================================================
  // WORKFLOW 2: Sandbox CSV Upload & Minor-Unit Matching
  // =========================================================================
  await test("E2E Journey 2: Interactive Sandbox CSV ingestion & schema validation", async () => {
    const validCsv = [
      "source,amount,currency,date,reference_id",
      "PAYMENT,200.00,INR,2026-08-25,TXN_SANDBOX_1",
      "SETTLEMENT,200.00,INR,2026-08-25,TXN_SANDBOX_1",
      "BANK_TXN,200.00,INR,2026-08-25,TXN_SANDBOX_1",
      "PAYMENT,100.00,INR,2026-08-25,TXN_SANDBOX_2",
      "SETTLEMENT,100.00,INR,2026-08-25,TXN_SANDBOX_2",
      "BANK_TXN,100.00,INR,2026-08-25,TXN_SANDBOX_2",
    ].join("\n");

    const req = new NextRequest("http://localhost:3000/api/sandbox/reconcile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csvContent: validCsv }),
    });

    const res = await sandboxPost(req);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.summary.total, 2);
    assert.equal(json.summary.autoMatched, 2);
  });

  // =========================================================================
  // WORKFLOW 3: Security Lab 10-Vector Adversarial Attacks
  // =========================================================================
  await test("E2E Journey 3: Security Lab full 10-vector adversarial neutralization", async () => {
    const req = new NextRequest("http://localhost:3000/api/security/attack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attackId: "all" }),
    });

    const res = await securityAttackPost(req);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.allBlocked, true);
    assert.equal(json.totalVectorsTested, 10);
    assert.equal(json.totalVectorsDefended, 10);
    assert.equal(json.attacks.length, 10);
    assert.ok(json.attacks.every((a: { blocked: boolean }) => a.blocked));
  });

  // =========================================================================
  // WORKFLOW 4: Verification Hub Async Live Progress Engine
  // =========================================================================
  await test("E2E Journey 4: Verification Hub async execution & real-time polling", async () => {
    const runReq = new NextRequest("http://localhost:3000/api/verify/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suites: ["receipt"], async: true }),
    });

    const runRes = await verifyRunPost(runReq);
    assert.equal(runRes.status, 202);
    const runJson = await runRes.json();
    assert.ok(runJson.jobId);

    const jobId = runJson.jobId;

    let pollCount = 0;
    let isCompleted = false;
    while (pollCount < 30) {
      pollCount++;
      const pollReq = new NextRequest(`http://localhost:3000/api/verify/progress/${jobId}`);
      const pollRes = await verifyProgressGet(pollReq, { params: Promise.resolve({ jobId }) });
      assert.equal(pollRes.status, 200);
      const pollJson = await pollRes.json();

      if (pollJson.job.status === "COMPLETED") {
        isCompleted = true;
        assert.equal(pollJson.job.allPassed, true);
        assert.equal(pollJson.job.overallProgressPct, 100);
        assert.ok(pollJson.job.results.receipt);
        assert.equal(pollJson.job.results.receipt.status, "PASS");
        break;
      }
      await new Promise((r) => setTimeout(r, 400));
    }

    assert.equal(isCompleted, true, "Verification stream should complete");
  });

  // =========================================================================
  // WORKFLOW 5: Developer API Console & OpenAPI Contract
  // =========================================================================
  await test("E2E Journey 5: Developer API health check, OpenAPI spec & batch reconcile", async () => {
    // Health Check
    const hRes = await healthGet(new NextRequest("http://localhost:3000/api/v1/health"));
    assert.equal(hRes.status, 200);
    assert.equal(hRes.headers.get("X-Content-Type-Options"), "nosniff");
    assert.equal(hRes.headers.get("Content-Security-Policy"), "default-src 'none'");

    // OpenAPI Spec
    const dRes = await docsGet();
    assert.equal(dRes.status, 200);
    const dJson = await dRes.json();
    assert.equal(dJson.openapi, "3.0.3");

    // V1 Batch Reconcile
    const recReq = new NextRequest("http://localhost:3000/api/v1/reconcile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": TEST_API_KEY,
      },
      body: JSON.stringify({
        transactions: [
          { source: "PAYMENT", amount: 5000, currency: "INR", date: "2026-08-25T00:00:00Z", reference_id: "TXN_DEV_1" },
          { source: "SETTLEMENT", amount: 5000, currency: "INR", date: "2026-08-25T00:00:00Z", reference_id: "TXN_DEV_1" },
          { source: "BANK", amount: 5000, currency: "INR", date: "2026-08-25T00:00:00Z", reference_id: "TXN_DEV_1" },
        ],
      }),
    });

    const recRes = await v1ReconcilePost(recReq);
    assert.equal(recRes.status, 200);
    const recJson = await recRes.json();
    assert.equal(recJson.success, true);
    assert.equal(recJson.status, "COMPLETED");
    assert.equal(recJson.summary.autoMatched, 1);
    assert.ok(recJson.receipt.rootHash);
  });

  // =========================================================================
  // WORKFLOW 6: External Integration Simulator & Webhook Stream
  // =========================================================================
  await test("E2E Journey 6: Synthetic batch generation, async ingestion & HMAC webhook callback", async () => {
    // 1. Generate Deterministic Synthetic Batch (75 rows)
    const batch = generateSimulatorBatch(75, 42);
    assert.ok(batch.transactions.length >= 75);
    assert.ok(batch.stats.cleanTxnCount > 0);

    // 2. Submit to API with Async Webhook URL
    const targetWebhookUrl = "https://erp.merchant-hub.internal/v1/settlemate-listener";
    const simReq = new NextRequest("http://localhost:3000/api/v1/reconcile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": TEST_API_KEY,
      },
      body: JSON.stringify({
        transactions: batch.transactions,
        webhookUrl: targetWebhookUrl,
      }),
    });

    const simRes = await v1ReconcilePost(simReq);
    assert.equal(simRes.status, 202);
    const simJson = await simRes.json();
    assert.equal(simJson.status, "ACCEPTED");
    assert.equal(simJson.webhookUrl, targetWebhookUrl);

    // 3. Wait for async webhook callback & check logs
    await new Promise((r) => setTimeout(r, 200));

    const logsRes = await webhookLogsGet(
      new NextRequest("http://localhost:3000/api/v1/webhooks/logs", {
        headers: { "X-API-Key": TEST_API_KEY },
      })
    );
    assert.equal(logsRes.status, 200);
    const logsJson = await logsRes.json();
    assert.ok(Array.isArray(logsJson.logs));
    assert.ok(logsJson.logs.length > 0);

    const latestLog = logsJson.logs[0];
    assert.ok(latestLog.signature.includes("v1="));
    assert.equal(latestLog.event, "reconciliation.completed");
  });

  console.log("\ne2e-workflows: ALL 6 CRITICAL USER JOURNEYS PASSED\n");
}

void main();
