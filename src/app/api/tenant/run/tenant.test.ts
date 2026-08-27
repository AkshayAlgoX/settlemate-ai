/*
 * SettleMate AI — Multi-Tenant Run API & Partition Isolation Unit Tests
 */

import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST } from "./route";

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
  console.log(" 🏢 SETTLEMATE AI — MULTI-TENANT SIMULATION & PARTITION ISOLATION SUITE");
  console.log("=========================================================================\n");

  // 1. Parallel Multi-Tenant Reconciliation
  await test("POST /api/tenant/run executes independent reconciliation across 4 enterprise tenants", async () => {
    const req = new NextRequest("http://localhost:3000/api/tenant/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.tenants.length, 4);
    assert.equal(data.crossTenantReport.totalTenantsProcessed, 4);
    assert.equal(data.crossTenantReport.crossTalkMatches, 0);
  });

  // 2. Mathematical Balance Conservation Invariant
  await test("Cross-tenant global balance conservation verified (Net ₹0.00 drift across partitions)", async () => {
    const req = new NextRequest("http://localhost:3000/api/tenant/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    const data = await res.json();

    assert.equal(data.crossTenantReport.balanceConservationVerified, true);
    assert.equal(data.crossTenantReport.partitionIsolation, "100% ISOLATED");
  });

  // 3. Independent Cryptographic Merkle Roots
  await test("Each tenant produces a distinct SHA-256 partition Merkle root", async () => {
    const req = new NextRequest("http://localhost:3000/api/tenant/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    const data = await res.json();

    const roots = new Set(data.tenants.map((t: { partitionMerkleRoot: string }) => t.partitionMerkleRoot));
    assert.equal(roots.size, 4, "All 4 tenants must produce unique cryptographic Merkle roots");
  });

  // 4. Cross-Tenant Attack Interception
  await test("Simulated cross-tenant fraud attempt is blocked by non-LLM partition boundary", async () => {
    const req = new NextRequest("http://localhost:3000/api/tenant/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ simulateCrossTenantAttack: true }),
    });

    const res = await POST(req);
    const data = await res.json();

    assert.equal(data.crossTenantReport.crossTenantAttackDefense.attackAttempted, true);
    assert.equal(data.crossTenantReport.crossTenantAttackDefense.status, "DEFENDED");
    assert.equal(data.crossTenantReport.crossTenantAttackDefense.blocked, true);
  });

  console.log("\ntenant-run: ALL 4 TESTS PASSED\n");
}

void main();
