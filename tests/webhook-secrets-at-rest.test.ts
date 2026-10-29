/*
 * Webhook subscription secrets at rest.
 *
 * Before this change the Postgres column was named secretEncrypted but
 * received the plaintext secret, SQLite stored it in plaintext, and
 * encryptWebhookSecret was never called by application code. Registrations
 * are now encrypted whenever WEBHOOK_ENCRYPTION_KEY is set; legacy plaintext
 * rows stay readable.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";

const dir = mkdtempSync(path.join(tmpdir(), "sm-whsec-"));
process.env.SETTLEMATE_DB_PATH = path.join(dir, "settlemate.db");
process.env.WEBHOOK_ENCRYPTION_KEY = randomBytes(32).toString("hex");

async function main() {
  const { v1Store } = await import("../src/lib/api/v1-store");
  const native = await import("../src/lib/storage/sqlite-db");
  const { UnifiedWebhookRepository } = await import("../src/lib/storage/unified-store");
  const { decryptWebhookSecret, isSealedWebhookSecret } = await import("../src/lib/webhooks/webhook-secrets");
  native.initDatabase();

  let passed = 0;
  const test = (name: string, fn: () => void) => {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  };

  test("a registered secret is stored as AES-256-GCM ciphertext and read back as plaintext", () => {
    const sub = v1Store.registerWebhook("https://hooks.example.test/a", ["reconciliation.completed"], "whsec_at_rest_check_0001");
    const raw = native.WebhookRepository.getRegistration(sub.id)!;
    assert.match(raw.secret, /^enc:v1:/);
    assert.ok(!raw.secret.includes("whsec_at_rest_check_0001"));
    assert.equal(v1Store.getWebhook(sub.id)!.secret, "whsec_at_rest_check_0001");
    assert.ok(v1Store.getWebhooks().some((w) => w.id === sub.id && w.secret === "whsec_at_rest_check_0001"));
  });

  test("a generated secret (no secret supplied) is also encrypted", () => {
    const sub = v1Store.registerWebhook("https://hooks.example.test/b");
    assert.match(sub.secret, /^whsec_[0-9a-f]{32}$/);
    assert.ok(isSealedWebhookSecret(native.WebhookRepository.getRegistration(sub.id)!.secret));
  });

  test("legacy plaintext rows written before this change stay readable", () => {
    const now = new Date().toISOString();
    native.WebhookRepository.saveRegistration({
      id: "wh_legacy_plain",
      url: "https://hooks.example.test/legacy",
      events: "[]",
      secret: "whsec_legacy:with:colons",
      status: "ACTIVE",
      registeredAt: now,
      updatedAt: now,
    });
    assert.equal(UnifiedWebhookRepository.getRegistration("wh_legacy_plain")!.secret, "whsec_legacy:with:colons");
  });

  test("ciphertext under a different key fails loudly instead of signing with garbage", () => {
    const sub = v1Store.registerWebhook("https://hooks.example.test/c", [], "whsec_other_key_check_0002");
    const raw = native.WebhookRepository.getRegistration(sub.id)!.secret;
    assert.throws(
      () => decryptWebhookSecret(raw, { WEBHOOK_ENCRYPTION_KEY: randomBytes(32).toString("hex") } as unknown as NodeJS.ProcessEnv),
      /could not be decrypted/
    );
  });

  test("without WEBHOOK_ENCRYPTION_KEY (development) secrets are stored as before", () => {
    const key = process.env.WEBHOOK_ENCRYPTION_KEY;
    delete process.env.WEBHOOK_ENCRYPTION_KEY;
    try {
      const sub = v1Store.registerWebhook("https://hooks.example.test/d", [], "whsec_dev_plain_0003");
      assert.equal(native.WebhookRepository.getRegistration(sub.id)!.secret, "whsec_dev_plain_0003");
    } finally {
      process.env.WEBHOOK_ENCRYPTION_KEY = key;
    }
  });

  console.log(`\nwebhook secrets at rest: ALL ${passed} PASSED`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => rmSync(dir, { recursive: true, force: true }));
