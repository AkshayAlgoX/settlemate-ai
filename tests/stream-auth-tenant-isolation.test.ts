/*
 * SettleMate AI — Streaming Surface Authentication & Tenant Isolation Suite
 *
 * Regression coverage for the machine-API streaming boundary.
 *
 * `src/proxy.ts` deliberately lets every `/api/v1/*` request through without a
 * session so the per-route API-key check can run instead. That makes the guard
 * inside each v1 route the ONLY authentication boundary for the machine surface.
 * These tests pin that contract for the two streaming routes, plus the tenant
 * scoping of the durable domain-event store they read from.
 *
 * Covers:
 *   1. POST /api/v1/stream/ingest rejects unauthenticated callers
 *   2. GET  /api/v1/stream/events rejects unauthenticated callers
 *   3. Neither route lets a client pick its own tenant via `x-tenant-id`
 *   4. UnifiedDomainEventRepository never leaks events across tenants
 *   5. The default sandbox tenant is not a wildcard
 */

import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST as ingestPost } from "../src/app/api/v1/stream/ingest/route";
import { GET as eventsGet } from "../src/app/api/v1/stream/events/route";
import { UnifiedDomainEventRepository, UnifiedJobRepository } from "../src/lib/storage/unified-store";

const VALID_API_KEY = "sk_test_stream_isolation_key_1122334455";
const TENANT_A = "tenant_alpha_corp";
const TENANT_B = "tenant_beta_industries";
const DEFAULT_TENANT = "tenant_default_sandbox";

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log("  ✓ " + name);
  } catch (err) {
    failed++;
    console.error("  ✗ " + name + " — " + (err as Error).message);
  }
}

function ingestRequest(headers: Record<string, string>, body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/v1/stream/ingest", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function eventsRequest(headers: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost:3000/api/v1/stream/events", {
    method: "GET",
    headers,
  });
}

const SAMPLE_RECORDS = [
  { paymentId: "pay_iso_1", amount: 1000, fee: 20, tax: 4, source: "PAYMENT" as const },
  { paymentId: "pay_iso_1", amount: 976, utr: "UTR_ISO_1", source: "SETTLEMENT" as const },
];

/** Drains only the first SSE frame so the test never blocks on the keepalive loop. */
async function readFirstFrame(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  try {
    const { value } = await reader.read();
    return new TextDecoder().decode(value ?? new Uint8Array());
  } finally {
    await reader.cancel().catch(() => {});
  }
}

async function main() {
  console.log("\n=========================================================================");
  console.log(" 🔐 SETTLEMATE AI — STREAMING AUTH & TENANT ISOLATION");
  console.log("=========================================================================\n");

  console.log("1. Ingestion endpoint authentication");

  await test("POST /api/v1/stream/ingest rejects a request with no API key", async () => {
    const res = await ingestPost(ingestRequest({}, { records: SAMPLE_RECORDS }));
    assert.equal(res.status, 401, `expected 401 for unauthenticated ingest, got ${res.status}`);
    const json = await res.json();
    assert.equal(json.error.code, "UNAUTHORIZED");
  });

  await test("POST /api/v1/stream/ingest rejects a malformed API key", async () => {
    const res = await ingestPost(
      ingestRequest({ "x-api-key": "not-a-real-key" }, { records: SAMPLE_RECORDS })
    );
    assert.equal(res.status, 401, `expected 401 for invalid key, got ${res.status}`);
  });

  await test("POST /api/v1/stream/ingest does not persist anything when unauthenticated", async () => {
    const idempotencyKey = `unauth_probe_${Date.now()}`;
    const res = await ingestPost(
      ingestRequest({}, { idempotencyKey, records: SAMPLE_RECORDS })
    );
    assert.equal(res.status, 401);
    assert.equal(
      UnifiedJobRepository.get(idempotencyKey),
      null,
      "an unauthenticated ingest must not create a reconciliation job"
    );
  });

  console.log("\n2. Ingestion endpoint tenant scoping");

  await test("POST /api/v1/stream/ingest ignores or rejects a client-supplied x-tenant-id", async () => {
    const idempotencyKey = `tenant_spoof_${Date.now()}`;
    const res = await ingestPost(
      ingestRequest(
        { "x-api-key": VALID_API_KEY, "x-tenant-id": TENANT_B },
        { idempotencyKey, records: SAMPLE_RECORDS }
      )
    );

    // Either the header is refused outright (403) or it is ignored entirely.
    // What must never happen is a job committed under the attacker-named tenant.
    if (res.status === 200) {
      const job = UnifiedJobRepository.get(idempotencyKey);
      assert.ok(job, "authenticated ingest should have persisted a job");
      assert.notEqual(
        job!.tenantId,
        TENANT_B,
        "x-tenant-id must not be able to place a job in another tenant"
      );
    } else {
      assert.equal(res.status, 403, `expected 403 or 200-with-ignored-header, got ${res.status}`);
    }
  });

  console.log("\n3. SSE endpoint authentication");

  await test("GET /api/v1/stream/events rejects a request with no API key", async () => {
    const res = await eventsGet(eventsRequest({}));
    assert.equal(res.status, 401, `expected 401 for unauthenticated SSE, got ${res.status}`);
  });

  await test("GET /api/v1/stream/events rejects a malformed API key", async () => {
    const res = await eventsGet(eventsRequest({ "x-api-key": "sk_short" }));
    assert.equal(res.status, 401, `expected 401 for invalid key, got ${res.status}`);
  });

  await test("GET /api/v1/stream/events does not stream a client-named foreign tenant", async () => {
    const res = await eventsGet(
      eventsRequest({ "x-api-key": VALID_API_KEY, "x-tenant-id": TENANT_B })
    );

    if (res.status === 200) {
      const frame = await readFirstFrame(res);
      assert.ok(
        !frame.includes(TENANT_B),
        `SSE stream echoed the attacker-supplied tenant back as its scope: ${frame.slice(0, 200)}`
      );
    } else {
      assert.equal(res.status, 403, `expected 403 or 200-scoped-to-own-tenant, got ${res.status}`);
    }
  });

  console.log("\n4. Durable domain-event tenant scoping");

  await test("listSince never returns another tenant's events", async () => {
    UnifiedDomainEventRepository._clearForTests();
    UnifiedDomainEventRepository.save({
      id: "evt_a_1",
      tenantId: TENANT_A,
      eventType: "RECONCILIATION_COMPLETED",
      entityId: "job_a",
      payload: JSON.stringify({ secret: "alpha_financials" }),
    });
    UnifiedDomainEventRepository.save({
      id: "evt_b_1",
      tenantId: TENANT_B,
      eventType: "RECONCILIATION_COMPLETED",
      entityId: "job_b",
      payload: JSON.stringify({ secret: "beta_financials" }),
    });

    const forA = UnifiedDomainEventRepository.listSince(TENANT_A, 0, 100);
    assert.deepEqual(
      forA.map((e) => e.id),
      ["evt_a_1"],
      "tenant A must only see its own events"
    );
  });

  await test("the default sandbox tenant is not a cross-tenant wildcard", async () => {
    UnifiedDomainEventRepository._clearForTests();
    UnifiedDomainEventRepository.save({
      id: "evt_default_1",
      tenantId: DEFAULT_TENANT,
      eventType: "HEARTBEAT",
      entityId: "system",
      payload: "{}",
    });
    UnifiedDomainEventRepository.save({
      id: "evt_victim_1",
      tenantId: TENANT_B,
      eventType: "EXCEPTION_DETECTED",
      entityId: "job_victim",
      payload: JSON.stringify({ amountAtRisk: 99_00_00_000 }),
    });

    const asDefault = UnifiedDomainEventRepository.listSince(DEFAULT_TENANT, 0, 100);
    assert.ok(
      !asDefault.some((e) => e.tenantId === TENANT_B),
      `default sandbox tenant leaked ${asDefault.filter((e) => e.tenantId === TENANT_B).length} foreign event(s)`
    );
  });

  await test("getByEntityId is scoped to the requesting tenant", async () => {
    UnifiedDomainEventRepository._clearForTests();
    UnifiedDomainEventRepository.save({
      id: "evt_shared_id_b",
      tenantId: TENANT_B,
      eventType: "EXCEPTION_DETECTED",
      entityId: "shared_entity",
      payload: JSON.stringify({ secret: "beta_only" }),
    });

    const asDefault = UnifiedDomainEventRepository.getByEntityId(DEFAULT_TENANT, "shared_entity");
    assert.equal(
      asDefault.length,
      0,
      "default sandbox tenant must not read another tenant's events by entity id"
    );

    const asA = UnifiedDomainEventRepository.getByEntityId(TENANT_A, "shared_entity");
    assert.equal(asA.length, 0, "tenant A must not read tenant B's events by entity id");
  });

  console.log("\n=========================================================================");
  console.log(`  stream-auth-tenant-isolation: ${passed} passed, ${failed} failed`);
  console.log("=========================================================================\n");

  if (failed > 0) {
    console.error("stream-auth-tenant-isolation: FAILURES DETECTED");
    process.exit(1);
  }
  console.log("stream-auth-tenant-isolation: final ALL PASSED");
}

main().catch((err) => {
  console.error("stream-auth-tenant-isolation: fatal", err);
  process.exit(1);
});
