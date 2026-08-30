/*
 * SettleMate AI — Enterprise Object Storage & Merkle Verification Test Suite
 *
 * Covers:
 *   1. Object Storage Put, Get, and SHA-256 Checksum Integrity
 *   2. Tenant-Scoped Storage Key Isolation (tenants/{tenantId}/...)
 *   3. Non-LLM Deterministic Merkle Root Recomputation & Verification
 *   4. Standalone Offline Evidence Bundle Generation
 *   5. Decision Receipt Archival to Object Store
 *   6. Checksum Tamper Detection (Bitrot Defense)
 *   7. Container Hardening & Docker Configuration Audit
 *   8. Storage Read/Write Performance Benchmark
 */

import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import {
  LocalObjectStorageAdapter,
  buildTenantStorageKey,
} from "../src/lib/storage/object-storage";
import {
  computeMerkleRootFromLeaves,
  verifyDecisionReceipt,
  generateOfflineEvidenceBundle,
  archiveReceiptBundle,
} from "../src/lib/reconciliation/merkle-verifier";
import type { V1DecisionReceipt } from "../src/lib/api/v1-store";

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
  console.log(" 🗄️ SETTLEMATE AI — OBJECT STORAGE & MERKLE ARCHIVAL SUITE");
  console.log("=========================================================================\n");

  const storage = new LocalObjectStorageAdapter(join(process.cwd(), "data", "test_object_store"));
  storage._clearForTests();

  // ---------------------------------------------------------------------------
  // TEST 1: Object Storage Put, Get & Checksum Verification
  // ---------------------------------------------------------------------------
  await test("TEST 1: Stores artifact, records SHA-256 digest, and verifies on download", async () => {
    const key = "tenants/tenant_alpha/batches/batch_001/raw_ingest.csv";
    const payload = "orderId,amount,paymentId\nORD_01,1000,PAY_01\nORD_02,2500,PAY_02";

    const putRes = await storage.putObject(key, payload, "text/csv");
    assert.ok(putRes.contentHash.length === 64, "Must generate 64-char SHA-256 hash");
    assert.equal(putRes.sizeBytes, Buffer.byteLength(payload, "utf8"));

    const getRes = await storage.getObject(key);
    assert.ok(getRes, "Object must be retrievable");
    assert.equal(getRes.verified, true, "Checksum verification must pass");
    assert.equal(getRes.content.toString("utf8"), payload);
    assert.equal(getRes.metadata.contentHash, putRes.contentHash);
  });

  // ---------------------------------------------------------------------------
  // TEST 2: Tenant-Scoped Storage Key Isolation
  // ---------------------------------------------------------------------------
  await test("TEST 2: Canonical storage keys strictly isolate tenant data namespaces", () => {
    const keyA = buildTenantStorageKey("tenant_corp_A", "receipts", "rcpt_001", "receipt.json");
    const keyB = buildTenantStorageKey("tenant_corp_B", "receipts", "rcpt_001", "receipt.json");

    assert.ok(keyA.startsWith("tenants/tenant_corp_A/receipts/rcpt_001/"));
    assert.ok(keyB.startsWith("tenants/tenant_corp_B/receipts/rcpt_001/"));
    assert.notEqual(keyA, keyB, "Different tenants must never share the same key path");

    // Path traversal sanitization check
    const traversalKey = buildTenantStorageKey("../../etc", "receipts", "../root", "evil.json");
    assert.ok(!traversalKey.includes(".."), "Must sanitize path traversal components");
  });

  // ---------------------------------------------------------------------------
  // TEST 3: Deterministic Merkle Root Recomputation & Verification
  // ---------------------------------------------------------------------------
  await test("TEST 3: Deterministically recomputes Merkle DAG root from leaf nodes", () => {
    const leaves = [
      "1686aa88c12dfb439c29f27d42cf38a0f28e2a0f81d840cd8cf981e5e69a367b",
      "fabf2102329211f62cb55855beeb0d40aa918e6981d840cd8cf981e5e69a367b",
      "7f8a9b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a",
      "81d840cd8cf981e5e69a367b879a8f11e9e51d60136a6d38e430877f08cab02b",
    ];

    const computedRoot = computeMerkleRootFromLeaves(leaves);
    assert.ok(computedRoot.length === 64, "Merkle root must be valid SHA-256");

    const receipt: V1DecisionReceipt = {
      rootHash: computedRoot,
      leafCount: 4,
      algorithm: "SHA-256 Merkle Tree DAG",
      timestamp: new Date().toISOString(),
      fingerprint: "81d840cd8cf981e5e69a367b879a8f11e9e51d60136a6d38e430877f08cab02b",
      signature: "0x" + computedRoot.slice(0, 40) + "sig_valid_receipt_seal",
    };

    const verification = verifyDecisionReceipt(receipt, leaves);
    assert.equal(verification.verified, true, "Decision receipt must verify successfully");
    assert.equal(verification.calculatedRootHash, computedRoot);
    assert.equal(verification.signatureValid, true);
    assert.equal(verification.errors.length, 0);
  });

  // ---------------------------------------------------------------------------
  // TEST 4: Standalone Offline Evidence Bundle Generation
  // ---------------------------------------------------------------------------
  await test("TEST 4: Generates standalone offline compliance bundle with embedded verifier", () => {
    const receipt: V1DecisionReceipt = {
      rootHash: "81d840cd8cf981e5e69a367b879a8f11e9e51d60136a6d38e430877f08cab02b",
      leafCount: 1,
      algorithm: "SHA-256 Merkle Tree DAG",
      timestamp: new Date().toISOString(),
      fingerprint: "81d840cd8cf981e5",
      signature: "0xsig_verified_seal_001",
    };

    const bundle = generateOfflineEvidenceBundle(receipt, { autoMatched: 100, total: 100 }, [
      "81d840cd8cf981e5e69a367b879a8f11e9e51d60136a6d38e430877f08cab02b",
    ]);

    assert.equal(bundle.version, "1.0");
    assert.ok(bundle.offlineVerifierScript.includes("crypto"), "Must include standalone JS verifier script");
    assert.equal(bundle.receipt.rootHash, receipt.rootHash);
  });

  // ---------------------------------------------------------------------------
  // TEST 5: Decision Receipt Archival into Object Store
  // ---------------------------------------------------------------------------
  await test("TEST 5: Archives decision receipt bundle into object storage", async () => {
    const tenantId = "tenant_archival_test";
    const receipt: V1DecisionReceipt = {
      rootHash: "7f8a9b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a",
      leafCount: 2,
      algorithm: "SHA-256 Merkle Tree DAG",
      timestamp: new Date().toISOString(),
      fingerprint: "fp_archival_001",
      signature: "0xsignature_archival_verified",
    };

    const res = await archiveReceiptBundle(tenantId, receipt, { total: 50 }, [], storage);
    assert.ok(res.key.includes("tenants/tenant_archival_test/receipts/fp_archival_001/"));
    assert.ok(res.contentHash.length === 64);

    const retrieved = await storage.getObject(res.key);
    assert.ok(retrieved);
    assert.equal(retrieved.verified, true);
  });

  // ---------------------------------------------------------------------------
  // TEST 6: Checksum Tamper Detection (Bitrot Defense)
  // ---------------------------------------------------------------------------
  await test("TEST 6: Detects and rejects tampered storage artifacts", async () => {
    const key = "tenants/tenant_security/audit/report_01/tamper_test.txt";
    await storage.putObject(key, "Original financial data");

    // Manually mutate disk content behind storage's back
    const filePath = join(process.cwd(), "data", "test_object_store", key);
    await fs.writeFile(filePath, "TAMPERED financial data");

    const result = await storage.getObject(key);
    assert.ok(result);
    assert.equal(result.verified, false, "Must detect checksum mismatch when file is tampered");
  });

  // ---------------------------------------------------------------------------
  // TEST 7: Container Hardening & Docker Configuration Audit
  // ---------------------------------------------------------------------------
  await test("TEST 7: Audits Dockerfile for non-root execution and healthcheck hardening", async () => {
    const dockerfilePath = join(process.cwd(), "Dockerfile");
    const dockerContent = await fs.readFile(dockerfilePath, "utf8");

    assert.ok(dockerContent.includes("USER nextjs"), "Dockerfile must enforce non-root execution (USER nextjs)");
    assert.ok(dockerContent.includes("HEALTHCHECK"), "Dockerfile must include production HEALTHCHECK");
    assert.ok(dockerContent.includes("server.js"), "Dockerfile must run standalone Next.js server");
  });

  // ---------------------------------------------------------------------------
  // TEST 8: Storage Throughput Performance Benchmark
  // ---------------------------------------------------------------------------
  await test("TEST 8: Measures object store write and verification throughput", async () => {
    const samplePayload = Buffer.alloc(1024 * 512, "A"); // 512 KB
    const iterations = 10;

    const t0 = performance.now();
    for (let i = 0; i < iterations; i++) {
      const key = `tenants/tenant_bench/batches/b_${i}/data.bin`;
      await storage.putObject(key, samplePayload);
    }
    const writeTimeMs = performance.now() - t0;
    const totalMb = (samplePayload.byteLength * iterations) / (1024 * 1024);
    const writeThroughputMbSec = totalMb / (writeTimeMs / 1000);

    console.log(
      `     → [Write Benchmark]: ${totalMb.toFixed(2)} MB in ${writeTimeMs.toFixed(2)}ms (~${writeThroughputMbSec.toFixed(2)} MB/sec)`
    );

    const t1 = performance.now();
    for (let i = 0; i < iterations; i++) {
      const key = `tenants/tenant_bench/batches/b_${i}/data.bin`;
      const obj = await storage.getObject(key);
      assert.ok(obj && obj.verified);
    }
    const readTimeMs = performance.now() - t1;
    const readThroughputMbSec = totalMb / (readTimeMs / 1000);

    console.log(
      `     → [Read & Checksum Benchmark]: ${totalMb.toFixed(2)} MB verified in ${readTimeMs.toFixed(2)}ms (~${readThroughputMbSec.toFixed(2)} MB/sec)`
    );
  });

  console.log("\n=========================================================================");
  console.log(" ✅ ALL 8 OBJECT STORAGE & MERKLE ARCHIVAL TESTS PASSED");
  console.log("=========================================================================\n");
}

main().catch((err) => {
  console.error("Object storage test suite failed:", err);
  process.exit(1);
});
