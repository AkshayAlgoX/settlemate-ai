/*
 * SettleMate AI — Object Storage & Large File Staging Unit Tests (M7)
 */

import assert from "node:assert/strict";
import { FileSystemObjectStorageAdapter, S3CompatibleObjectStorageAdapter } from "./object-storage";
import path from "node:path";
import { writeFileSync } from "node:fs";

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log("  ✓ " + name);
  } catch (err) {
    console.error("  ✗ " + name + " — " + (err as Error).message);
    throw err;
  }
}

async function runTests() {
  console.log("\n=========================================================================");
  console.log(" SETTLEMATE AI — OBJECT STORAGE & LARGE FILE STAGING TESTS (M7)");
  console.log("=========================================================================\n");

  const storage = new FileSystemObjectStorageAdapter();

  await test("1. Upload object, compute SHA-256 hash, and persist metadata", async () => {
    const meta = await storage.putObject("test-bucket", "evidence-1.json", '{"paymentId":"pay_101","amount":50000}', {
      contentType: "application/json",
      classification: "CONFIDENTIAL",
    });

    assert.equal(meta.bucket, "test-bucket");
    assert.equal(meta.key, "evidence-1.json");
    assert.equal(meta.classification, "CONFIDENTIAL");
    assert.ok(meta.contentHash.length === 64);
  });

  await test("2. Read object and verify cryptographic integrity on read", async () => {
    const { data, metadata } = await storage.getObject("test-bucket", "evidence-1.json");
    assert.equal(metadata.contentType, "application/json");
    assert.equal(JSON.parse(data.toString("utf8")).paymentId, "pay_101");
  });

  await test("3. Detect corrupted object bytes and reject read with integrity failure", async () => {
    // Tamper with the raw disk file
    const targetFile = path.join(process.cwd(), ".storage_vault", "test-bucket", encodeURIComponent("evidence-1.json"));
    writeFileSync(targetFile, '{"tampered":true}', "utf8");

    await assert.rejects(
      async () => await storage.getObject("test-bucket", "evidence-1.json"),
      /Object storage integrity check failed/
    );
  });

  await test("4. List objects by bucket and prefix", async () => {
    await storage.putObject("test-bucket", "audit-1.log", "log1");
    await storage.putObject("test-bucket", "audit-2.log", "log2");

    const list = await storage.listObjects("test-bucket", "audit");
    assert.equal(list.length, 2);
  });

  await test("5. Delete object and confirm eviction", async () => {
    const deleted = await storage.deleteObject("test-bucket", "audit-1.log");
    assert.equal(deleted, true);
  });

  await test("6. S3-Compatible Production Adapter Contract Fallback Verification", async () => {
    const s3 = new S3CompatibleObjectStorageAdapter("http://localhost:9000", "minioadmin", "minioadmin");
    const meta = await s3.putObject("s3-bucket", "s3-file.txt", "S3_PAYLOAD_TEST");
    assert.equal(meta.bucket, "s3-bucket");

    const read = await s3.getObject("s3-bucket", "s3-file.txt");
    assert.equal(read.data.toString("utf8"), "S3_PAYLOAD_TEST");
  });

  console.log("\nobject-storage: ALL 6 TESTS PASSED\n");
}

void runTests();
