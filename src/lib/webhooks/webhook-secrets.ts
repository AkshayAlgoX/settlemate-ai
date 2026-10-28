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

import { randomBytes } from "node:crypto";

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
