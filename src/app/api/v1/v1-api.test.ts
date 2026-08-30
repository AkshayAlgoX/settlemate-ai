/*
 * SettleMate AI — REST API v1 Integration Test Suite
 */

import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET as healthGet } from "./health/route";
import { GET as docsGet } from "../docs/route";
import { POST as reconcilePost } from "./reconcile/route";
import { GET as jobGet } from "./reconcile/[jobId]/route";
import { POST as webhookRegisterPost, GET as webhooksGet } from "./webhooks/register/route";
import { GET as webhookLogsGet } from "./webhooks/logs/route";

const VALID_API_KEY = "sk_test_integration_key_9988776655443322";

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
  console.log(" 🚀 SETTLEMATE AI — REST API v1 CORE INTEGRATION TESTS");
  console.log("=========================================================================\n");

  // 1. Health Endpoint
  await test("GET /api/v1/health returns system status and rate limiter info", async () => {
    const req = new NextRequest("http://localhost:3000/api/v1/health");
    const res = await healthGet(req);
    assert.equal(res.status, 200);

    const json = await res.json();
    assert.equal(json.status, "ok");
    assert.equal(json.version, "v1.0.0");
    assert.equal(json.engine, "deterministic-settlemate-v1");
    assert.equal(json.security.rateLimiter, "enforced");
    assert.equal(res.headers.get("X-Content-Type-Options"), "nosniff");
  });

  // 2. OpenAPI Documentation
  await test("GET /api/docs returns OpenAPI 3.0.3 specification", async () => {
    const res = await docsGet();
    assert.equal(res.status, 200);

    const json = await res.json();
    assert.equal(json.openapi, "3.0.3");
    assert.ok(json.paths["/reconcile"]);
    assert.ok(json.components.schemas.ReconciliationRequest);
    assert.equal(res.headers.get("Access-Control-Allow-Origin"), "*");
  });

  // 3. Authentication Enforcement
  await test("POST /api/v1/reconcile rejects requests with missing or invalid API keys", async () => {
    // Missing Key
    const reqNoKey = new NextRequest("http://localhost:3000/api/v1/reconcile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactions: [] }),
    });
    const resNoKey = await reconcilePost(reqNoKey);
    assert.equal(resNoKey.status, 401);

    // Invalid Key prefix
    const reqBadPrefix = new NextRequest("http://localhost:3000/api/v1/reconcile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": "pk_test_12345678901234567890",
      },
      body: JSON.stringify({ transactions: [] }),
    });
    const resBadPrefix = await reconcilePost(reqBadPrefix);
    assert.equal(resBadPrefix.status, 401);

    // Short Key
    const reqShortKey = new NextRequest("http://localhost:3000/api/v1/reconcile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": "sk_short",
      },
      body: JSON.stringify({ transactions: [] }),
    });
    const resShortKey = await reconcilePost(reqShortKey);
    assert.equal(resShortKey.status, 401);
  });

  // 4. Synchronous Reconciliation Run
  let testJobId = "";
  await test("POST /api/v1/reconcile executes batch reconciliation and generates Merkle receipt", async () => {
    const payload = {
      transactions: [
        { source: "PAYMENT", amount: 100.0, currency: "INR", date: "2026-08-25T00:00:00Z", reference_id: "TXN_001" },
        { source: "SETTLEMENT", amount: 100.0, currency: "INR", date: "2026-08-25T00:00:00Z", reference_id: "TXN_001" },
        { source: "BANK", amount: 100.0, currency: "INR", date: "2026-08-25T00:00:00Z", reference_id: "TXN_001" },
        { source: "PAYMENT", amount: 200.0, currency: "INR", date: "2026-08-25T00:00:00Z", reference_id: "TXN_002" },
        { source: "SETTLEMENT", amount: 184.5, currency: "INR", date: "2026-08-25T00:00:00Z", reference_id: "TXN_002" },
        { source: "REFUND", amount: 15.5, currency: "INR", date: "2026-08-25T00:00:00Z", reference_id: "TXN_002" },
      ],
    };

    const req = new NextRequest("http://localhost:3000/api/v1/reconcile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": VALID_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    const res = await reconcilePost(req);
    assert.equal(res.status, 200);

    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.jobId.startsWith("job_"));
    testJobId = json.jobId;
    assert.equal(json.status, "COMPLETED");
    assert.equal(json.summary.total, 2);
    assert.ok(json.summary.autoMatched >= 1);
    assert.ok(json.receipt.rootHash.length === 64);
    assert.equal(json.receipt.algorithm, "SHA256-MERKLE-DAG");
  });

  // 5. Retrieve Job by ID
  await test("GET /api/v1/reconcile/[jobId] retrieves stored job result", async () => {
    const req = new NextRequest(`http://localhost:3000/api/v1/reconcile/${testJobId}`, {
      headers: { "X-API-Key": VALID_API_KEY },
    });

    const res = await jobGet(req, { params: Promise.resolve({ jobId: testJobId }) });
    assert.equal(res.status, 200);

    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.job.jobId, testJobId);
    assert.equal(json.job.status, "COMPLETED");
  });

  // 6. Asynchronous Reconciliation with Webhook
  await test("POST /api/v1/reconcile with webhookUrl returns 202 Accepted", async () => {
    const payload = {
      webhookUrl: "https://erp.merchant-hub.internal/v1/settlemate-listener",
      transactions: [
        { source: "PAYMENT", amount: 500.0, currency: "INR", date: "2026-08-25T00:00:00Z", reference_id: "TXN_ASYNC_1" },
        { source: "SETTLEMENT", amount: 500.0, currency: "INR", date: "2026-08-25T00:00:00Z", reference_id: "TXN_ASYNC_1" },
      ],
    };

    const req = new NextRequest("http://localhost:3000/api/v1/reconcile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": VALID_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    const res = await reconcilePost(req);
    assert.equal(res.status, 202);

    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.status, "ACCEPTED");
    assert.ok(json.jobId);
    assert.equal(json.webhookUrl, "https://erp.merchant-hub.internal/v1/settlemate-listener");
  });

  // 7. Webhook Registration & Logs
  await test("POST /api/v1/webhooks/register creates subscription and GET /logs lists dispatches", async () => {
    const regReq = new NextRequest("http://localhost:3000/api/v1/webhooks/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": VALID_API_KEY,
      },
      body: JSON.stringify({
        url: "https://accounting.example.com/api/webhooks",
        events: ["reconciliation.completed"],
      }),
    });

    const regRes = await webhookRegisterPost(regReq);
    assert.equal(regRes.status, 201);

    const regJson = await regRes.json();
    assert.equal(regJson.success, true);
    assert.ok(regJson.webhook.id.startsWith("wh_"));
    assert.ok(regJson.webhook.secret.startsWith("whsec_"));

    const listReq = new NextRequest("http://localhost:3000/api/v1/webhooks/register", {
      headers: { "X-API-Key": VALID_API_KEY },
    });
    const listRes = await webhooksGet(listReq);
    const listJson = await listRes.json();
    assert.ok(listJson.count >= 2);

    const logsReq = new NextRequest("http://localhost:3000/api/v1/webhooks/logs", {
      headers: { "X-API-Key": VALID_API_KEY },
    });
    const logsRes = await webhookLogsGet(logsReq);
    const logsJson = await logsRes.json();
    assert.equal(logsRes.status, 200);
    assert.ok(Array.isArray(logsJson.logs));
  });

  // The v1 surface is a machine API: proxy.ts lets /api/v1/* past the session
  // boundary precisely so each route's own sk_ key check is the gate. An
  // unauthenticated read of tenant data must therefore be rejected here, not
  // upstream. Regression guard for the auth-boundary unification.
  await test("v1 tenant-data reads reject an anonymous caller with 401", async () => {
    const anonLogs = await webhookLogsGet(
      new NextRequest("http://localhost:3000/api/v1/webhooks/logs")
    );
    assert.equal(anonLogs.status, 401);
    const anonLogsJson = await anonLogs.json();
    assert.equal(anonLogsJson.error.code, "UNAUTHORIZED");

    const anonList = await webhooksGet(
      new NextRequest("http://localhost:3000/api/v1/webhooks/register")
    );
    assert.equal(anonList.status, 401);
  });

  console.log("\nv1-api: ALL 8 TESTS PASSED\n");
}

void main();
