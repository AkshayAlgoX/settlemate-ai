/*
 * SettleMate AI — Webhook secret resolution
 *
 * One place that decides which secret signs outbound webhooks and which key
 * encrypts stored webhook secrets. Values that were committed to this
 * repository as defaults are public and are never used.
 *
 *   - Production (NODE_ENV=production): a missing or invalid value throws.
 *   - Elsewhere: a missing value is replaced by a random value that exists
 *     only for the current process; a value that is set but invalid still
 *     throws, so misconfiguration is not hidden in development.
 *
 * Length and format checks catch configuration mistakes; they cannot prove a
 * value is random. Generate values with `openssl rand -hex 32`.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** Former hard-coded defaults. Public in git history; rejected everywhere. */
export const KNOWN_PUBLIC_WEBHOOK_VALUES: ReadonlySet<string> = new Set([
  "whsec_settlemate_live_signing_key_001",
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
]);

const MIN_SIGNING_SECRET_BYTES = 32;
const PLACEHOLDER_PATTERN = /change[-_ ]?me|replace|placeholder|example|your[-_ ]?(secret|key)|<.*>/i;
const HEX_256 = /^[0-9a-fA-F]{64}$/;

export class WebhookSecretConfigError extends Error {
  constructor(message: string) {
    super(`[SettleMate webhook secrets] ${message}`);
    this.name = "WebhookSecretConfigError";
  }
}

function isProduction(env: NodeJS.ProcessEnv): boolean {
  return env.NODE_ENV === "production";
}

let ephemeralSigningSecret: string | null = null;
let ephemeralEncryptionKey: Buffer | null = null;

/**
 * Secret for signing outbound webhooks when no per-subscription secret is
 * given: WEBHOOK_SECRET, else WEBHOOK_SHARED_SECRET.
 */
export function getDefaultWebhookSigningSecret(env: NodeJS.ProcessEnv = process.env): string {
  const name = env.WEBHOOK_SECRET ? "WEBHOOK_SECRET" : "WEBHOOK_SHARED_SECRET";
  const value = env.WEBHOOK_SECRET || env.WEBHOOK_SHARED_SECRET;

  if (value) {
    if (KNOWN_PUBLIC_WEBHOOK_VALUES.has(value)) throw new WebhookSecretConfigError(`${name} is a publicly known default`);
    if (Buffer.byteLength(value, "utf8") < MIN_SIGNING_SECRET_BYTES) {
      throw new WebhookSecretConfigError(`${name} must be at least ${MIN_SIGNING_SECRET_BYTES} bytes`);
    }
    if (PLACEHOLDER_PATTERN.test(value)) throw new WebhookSecretConfigError(`${name} looks like a placeholder value`);
    return value;
  }

  if (isProduction(env)) {
    throw new WebhookSecretConfigError("WEBHOOK_SECRET (or WEBHOOK_SHARED_SECRET) must be set in production");
  }
  ephemeralSigningSecret ??= `whsec_dev_${randomBytes(32).toString("hex")}`;
  return ephemeralSigningSecret;
}

/** AES-256-GCM key for webhook secrets at rest: WEBHOOK_ENCRYPTION_KEY, 64 hex characters. */
export function getWebhookEncryptionKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const value = env.WEBHOOK_ENCRYPTION_KEY;

  if (value) {
    if (KNOWN_PUBLIC_WEBHOOK_VALUES.has(value)) {
      throw new WebhookSecretConfigError("WEBHOOK_ENCRYPTION_KEY is a publicly known default");
    }
    if (!HEX_256.test(value)) {
      throw new WebhookSecretConfigError("WEBHOOK_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)");
    }
    return Buffer.from(value, "hex");
  }

  if (isProduction(env)) {
    throw new WebhookSecretConfigError("WEBHOOK_ENCRYPTION_KEY must be set in production");
  }
  ephemeralEncryptionKey ??= randomBytes(32);
  return ephemeralEncryptionKey;
}

/** Test hook: forget ephemeral development values. */
export function resetEphemeralWebhookSecretsForTests(): void {
  ephemeralSigningSecret = null;
  ephemeralEncryptionKey = null;
}

/* ---------- secrets at rest ---------- */

const SEALED_PREFIX = "enc:v1:";
// iv:tag:data without the prefix, as produced before the prefix existed.
const UNPREFIXED_SEALED = /^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]*$/i;

/** Encrypts a webhook secret with AES-256-GCM: enc:v1:<iv>:<tag>:<data> (hex). */
export function encryptWebhookSecret(secret: string, env: NodeJS.ProcessEnv = process.env): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getWebhookEncryptionKey(env), iv);
  const data = cipher.update(secret, "utf8", "hex") + cipher.final("hex");
  return `${SEALED_PREFIX}${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${data}`;
}

/** True when a stored value is ciphertext rather than a legacy plaintext secret. */
export function isSealedWebhookSecret(stored: string): boolean {
  return stored.startsWith(SEALED_PREFIX) || UNPREFIXED_SEALED.test(stored);
}

/**
 * Decrypts a stored webhook secret. A value that is not ciphertext is a
 * legacy plaintext secret and is returned unchanged. Ciphertext that fails
 * authentication (wrong key or tampering) throws: falling back to the stored
 * string would silently sign webhooks with the wrong secret.
 */
export function decryptWebhookSecret(stored: string, env: NodeJS.ProcessEnv = process.env): string {
  if (!isSealedWebhookSecret(stored)) return stored;
  const body = stored.startsWith(SEALED_PREFIX) ? stored.slice(SEALED_PREFIX.length) : stored;
  const [ivHex, tagHex, dataHex] = body.split(":");
  try {
    const decipher = createDecipheriv("aes-256-gcm", getWebhookEncryptionKey(env), Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return decipher.update(dataHex, "hex", "utf8") + decipher.final("utf8");
  } catch (err) {
    if (err instanceof WebhookSecretConfigError) throw err;
    throw new Error("Stored webhook secret could not be decrypted (wrong WEBHOOK_ENCRYPTION_KEY or tampered value)");
  }
}

/**
 * Value to persist for a subscription secret.
 *
 * - WEBHOOK_ENCRYPTION_KEY set: always encrypted.
 * - Production without a valid key: throws WebhookSecretConfigError, so no
 *   plaintext secret is ever written there (fail closed; the readiness check
 *   reports the same condition).
 * - Development without the key: stored as before, because a per-process
 *   ephemeral key would make stored secrets unreadable after a restart.
 */
export function sealWebhookSecretForStorage(secret: string, env: NodeJS.ProcessEnv = process.env): string {
  if (isSealedWebhookSecret(secret)) return secret;
  if (env.WEBHOOK_ENCRYPTION_KEY || isProduction(env)) {
    // getWebhookEncryptionKey throws in production when the key is missing or invalid.
    return encryptWebhookSecret(secret, env);
  }
  return secret;
}
