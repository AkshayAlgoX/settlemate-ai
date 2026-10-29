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

  const { validateStartupConfig } = await import("../src/lib/config/startup-validation");
  const withEnv = (vars: Record<string, string | undefined>, fn: () => void) => {
    const saved: Record<string, string | undefined> = {};
    for (const k of Object.keys(vars)) {
      saved[k] = process.env[k];
      if (vars[k] === undefined) delete process.env[k];
      else process.env[k] = vars[k];
    }
    try {
      fn();
    } finally {
      for (const k of Object.keys(saved)) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
  };
  const webhookCheck = () => validateStartupConfig().checks.find((c) => c.name === "WEBHOOK_SECRETS")!;

  test("readiness reports missing webhook secrets in production without printing values", () => {
    withEnv({ NODE_ENV: "production", WEBHOOK_SECRET: undefined, WEBHOOK_SHARED_SECRET: undefined }, () => {
      const check = webhookCheck();
      assert.equal(check.passed, false);
      assert.match(check.error!, /WEBHOOK_SECRET/);
    });
    withEnv({ NODE_ENV: "production", WEBHOOK_SECRET: randomBytes(32).toString("hex"), WEBHOOK_ENCRYPTION_KEY: "0123456789abcdef".repeat(4) }, () => {
      const check = webhookCheck();
      assert.equal(check.passed, false);
      assert.match(check.error!, /publicly known/);
      assert.ok(!check.error!.includes("0123456789abcdef"));
    });
    withEnv({ NODE_ENV: "production", WEBHOOK_SECRET: randomBytes(32).toString("hex"), WEBHOOK_ENCRYPTION_KEY: randomBytes(32).toString("hex") }, () => {
      assert.equal(webhookCheck().passed, true);
    });
  });

  const { webhookSubscriptionUpsertArgs } = await import("../src/lib/storage/unified-store");
  const { WebhookSecretConfigError } = await import("../src/lib/webhooks/webhook-secrets");
  const registration = (id: string, secret: string) => {
    const now = new Date().toISOString();
    return { id, url: "https://hooks.example.test/r", events: "[]", secret, status: "ACTIVE" as const, registeredAt: now, updatedAt: now };
  };

  test("production without WEBHOOK_ENCRYPTION_KEY refuses to persist a secret (fail closed)", () => {
    withEnv({ NODE_ENV: "production", WEBHOOK_ENCRYPTION_KEY: undefined }, () => {
      assert.throws(
        () => UnifiedWebhookRepository.saveRegistration(registration("wh_prod_nokey", "whsec_must_not_be_stored_0004")),
        (err: unknown) => err instanceof WebhookSecretConfigError
      );
      assert.throws(() => v1Store.registerWebhook("https://hooks.example.test/p", [], "whsec_must_not_be_stored_0005"));
    });
    // Nothing reached the store, so no plaintext secret was persisted.
    assert.equal(native.WebhookRepository.getRegistration("wh_prod_nokey"), null);
    const rows = native.WebhookRepository.getAllRegistrations();
    assert.ok(!rows.some((r) => r.secret.includes("whsec_must_not_be_stored")));
  });

  test("production with a valid key stores ciphertext", () => {
    withEnv({ NODE_ENV: "production", WEBHOOK_ENCRYPTION_KEY: randomBytes(32).toString("hex") }, () => {
      UnifiedWebhookRepository.saveRegistration(registration("wh_prod_key", "whsec_prod_with_key_0006"));
      assert.match(native.WebhookRepository.getRegistration("wh_prod_key")!.secret, /^enc:v1:/);
      assert.equal(UnifiedWebhookRepository.getRegistration("wh_prod_key")!.secret, "whsec_prod_with_key_0006");
    });
  });

  test("re-saving an existing registration rotates its secret in both stores", () => {
    UnifiedWebhookRepository.saveRegistration(registration("wh_rotate", "whsec_rotate_old_0007"));
    const rotated = { ...registration("wh_rotate", "whsec_rotate_new_0008"), url: "https://hooks.example.test/rotated" };
    UnifiedWebhookRepository.saveRegistration(rotated);

    // SQLite (the read path): the new secret, still encrypted at rest.
    const raw = native.WebhookRepository.getRegistration("wh_rotate")!;
    assert.match(raw.secret, /^enc:v1:/);
    assert.equal(UnifiedWebhookRepository.getRegistration("wh_rotate")!.secret, "whsec_rotate_new_0008");

    // Postgres mirror: the update path now carries the (sealed) secret, and
    // leaves tenantId, id and registeredAt to the create path only.
    const args = webhookSubscriptionUpsertArgs({ ...rotated, secret: raw.secret }, "tenant_a");
    assert.equal(args.update.secretEncrypted, raw.secret);
    assert.equal(args.create.secretEncrypted, raw.secret);
    assert.equal(args.update.url, "https://hooks.example.test/rotated");
    assert.deepEqual(Object.keys(args.update).sort(), ["events", "secretEncrypted", "status", "updatedAt", "url"]);
  });

  console.log(`\nwebhook secrets at rest: ALL ${passed} PASSED`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => rmSync(dir, { recursive: true, force: true }));
