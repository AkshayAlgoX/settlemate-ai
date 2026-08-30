/*
 * SettleMate AI — Explicit PostgreSQL TLS resolution
 *
 * node-postgres derives its TLS settings from the connection string's `sslmode`
 * parameter, and that derivation *overrides* any `ssl` object passed alongside
 * `connectionString` (pg 8.x via pg-connection-string 2.x). Both `src/lib/db.ts`
 * and `scripts/init-postgres.ts` used to pass `ssl: { rejectUnauthorized: false }`
 * next to a connection string containing `sslmode=require`, so the option was
 * silently discarded. Two consequences, both reproduced against a live server:
 *
 *   1. A PostgreSQL whose certificate chain is not in Node's trust store
 *      (self-hosted, RDS regional CA, Supabase pooler, corporate TLS proxy)
 *      failed at connect time with a bare "self-signed certificate" and no hint
 *      about which knob controls it.
 *   2. A plaintext PostgreSQL was unreachable altogether — "The server does not
 *      support SSL connections" — which is why no local or containerised
 *      migration rehearsal was possible.
 *
 * This module makes the decision explicit and identical in both callers. It
 * deliberately never *weakens* verification: when the URL declares an `sslmode`,
 * that declaration is the single source of truth and is handed to pg untouched.
 * The only default it supplies is for a URL that declares nothing at all, where
 * it chooses plaintext rather than the previous implicit
 * verification-disabled TLS.
 */

export interface PgSslResolution {
  /**
   * Value to place in the pg pool config. `undefined` means "defer to pg's own
   * parsing of the connection string" — the correct choice whenever the URL
   * declares an sslmode, because anything we pass would be ignored anyway.
   */
  ssl: false | undefined;
  /** Effective mode, for startup logs. */
  mode: string;
  /** Where the mode came from, for startup logs. */
  source: "connection-string" | "PGSSLMODE" | "default";
}

const SSLMODE_PATTERN = /[?&]sslmode=([^&\s]+)/i;

/**
 * Resolves how a pg pool should negotiate TLS for `databaseUrl`.
 *
 * Callers must spread the returned `ssl` into the pool config verbatim:
 *
 *   const { ssl } = resolvePgSsl(url);
 *   new pg.Pool({ connectionString: url, ...(ssl === false ? { ssl: false } : {}) });
 */
export function resolvePgSsl(databaseUrl: string): PgSslResolution {
  const inUrl = SSLMODE_PATTERN.exec(databaseUrl);
  if (inUrl) {
    // The URL is authoritative — pg will parse it and ignore anything we pass.
    return { ssl: undefined, mode: inUrl[1].toLowerCase(), source: "connection-string" };
  }

  const fromEnv = process.env.PGSSLMODE;
  if (fromEnv) {
    // libpq-compatible environment override; pg honours it the same way.
    return { ssl: undefined, mode: fromEnv.toLowerCase(), source: "PGSSLMODE" };
  }

  // Nothing declared. Choose plaintext explicitly instead of the previous
  // implicit `rejectUnauthorized: false`, which would have negotiated TLS while
  // accepting any certificate — a downgrade nobody asked for and nobody saw.
  return { ssl: false, mode: "disable", source: "default" };
}

/**
 * True when the resolved mode performs certificate-chain verification, which is
 * what turns an untrusted chain into a hard connect failure.
 */
export function sslModeVerifies(mode: string): boolean {
  return mode === "require" || mode === "verify-ca" || mode === "verify-full" || mode === "prefer";
}

/**
 * Converts a pg connect failure into an actionable message. The underlying
 * errors ("self-signed certificate", "The server does not support SSL
 * connections") name a symptom but not the parameter that produces it.
 */
export function describePgConnectFailure(err: unknown, databaseUrl: string): string {
  const message = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: string } | null)?.code;
  const resolution = resolvePgSsl(databaseUrl);
  const hints: string[] = [];

  if (
    /self[- ]signed certificate/i.test(message) ||
    /unable to (verify|get) (the )?(first certificate|local issuer certificate)/i.test(message) ||
    code === "DEPTH_ZERO_SELF_SIGNED_CERT" ||
    code === "SELF_SIGNED_CERT_IN_CHAIN" ||
    code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE"
  ) {
    hints.push(
      `TLS certificate verification failed. sslmode is '${resolution.mode}' (from ${resolution.source}), which verifies the server's chain against Node's trust store.`,
      "If the server presents a private or self-signed certificate, either add its CA to NODE_EXTRA_CA_CERTS (preferred — keeps the connection verified) or set sslmode=no-verify in DATABASE_URL to encrypt without verifying."
    );
  } else if (/does not support SSL/i.test(message)) {
    hints.push(
      `The server refused a TLS handshake but sslmode is '${resolution.mode}' (from ${resolution.source}).`,
      "For a plaintext PostgreSQL, remove the sslmode parameter from DATABASE_URL or set sslmode=disable."
    );
  } else if (code === "ECONNREFUSED") {
    hints.push("Nothing is listening on that host and port. Check the host, port, and that the database is reachable from this network.");
  } else if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    hints.push("The database hostname did not resolve. Check for a typo in DATABASE_URL or a missing private-network attachment.");
  } else if (code === "28P01") {
    hints.push("Password authentication failed for the user in DATABASE_URL.");
  } else if (code === "3D000") {
    hints.push("The database named in DATABASE_URL does not exist on that server.");
  } else if (code === "ETIMEDOUT" || /timeout/i.test(message)) {
    hints.push("The connection attempt timed out — usually a firewall, security group, or missing IP allow-list entry rather than a credential problem.");
  }

  return hints.length > 0 ? `${message}\n  ${hints.join("\n  ")}` : message;
}
