/*
 * SettleMate AI — Deliberate PostgreSQL Migration Runner
 *
 * The explicit, non-destructive migration mechanism for production. It never
 * runs `prisma db push`, `prisma migrate dev`, `reset` or `--force-reset`, and it
 * never drops or truncates anything.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." npm run db:migrate:prod
 *   DATABASE_URL="postgresql://..." npm run db:migrate:prod -- --verify-only
 *   DATABASE_URL="postgresql://..." npm run db:migrate:prod -- --verbose
 *
 * Exit codes:
 *   0  every migration applied (or already applied) and the schema verified
 *   1  a migration failed, or the post-migration verification gate found a
 *      structural defect — in both cases the release must be blocked
 *
 * Design notes, each traceable to a reproduced defect:
 *
 *   - Migrations are discovered from prisma/migrations/ rather than hardcoded.
 *     The previous runner listed three directories by hand, so
 *     20260831_domain_event_and_amount_at_risk would never have run.
 *
 *   - Each file is applied statement by statement inside one transaction, with a
 *     savepoint per statement. `client.query(wholeFile)` put the file in a single
 *     implicit transaction, so the first "already exists" error aborted every
 *     following statement — and the runner swallowed that error at file
 *     granularity and reported success. Applying `0_init` to a database that
 *     already had its tables therefore lost 7 unique constraints, 52 indexes and
 *     21 foreign keys, including the double settlement and audit-sequence
 *     guards, while printing "✅ POSTGRESQL MIGRATION COMPLETE" and exiting 0.
 *
 *   - Applied migrations are recorded with a checksum, so a repeat deploy is a
 *     no-op and an edit to an already-applied migration is a hard failure rather
 *     than a silent divergence between environments.
 *
 *   - A single advisory lock serialises concurrent runners, so two instances
 *     starting at once cannot interleave DDL.
 *
 *   - A structural verification gate runs afterwards and exits non-zero on any
 *     defect. Success is now defined as "the database contains every object the
 *     migrations declare", not "the runner did not throw".
 */

import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { describePgConnectFailure, resolvePgSsl } from "../src/lib/db-ssl";
import { extractDeclaredObjects, isAlreadyExistsError, splitSqlStatements } from "../src/lib/migration/sql-statements";
import { extractPrismaModels, verifyPostgresSchema, type VerificationIssue } from "../src/lib/migration/schema-verify";

/** Runner-owned bookkeeping table; excluded from application table counts. */
const MIGRATIONS_TABLE = "_settlemate_migrations";

/**
 * Fixed advisory-lock key so every deploy of this service contends on one lock.
 * Held as a string because pg sends bigint parameters as text, and because the
 * project's TypeScript target predates BigInt literals.
 */
const ADVISORY_LOCK_KEY = "7318250416283901";

const args = process.argv.slice(2);
const VERIFY_ONLY = args.includes("--verify-only");
const VERBOSE = args.includes("--verbose");

interface MigrationFile {
  name: string;
  filePath: string;
  sql: string;
  checksum: string;
}

interface AppliedRecord {
  checksum: string;
  appliedAt: string;
}

/**
 * Removes the password and any secret-bearing query parameter before logging.
 * A production deploy previously printed the full DATABASE_URL, exposing the
 * database credential in build logs.
 */
function maskDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = "***";
    for (const key of ["password", "pgpassword", "sslpassword", "token", "apikey", "api_key"]) {
      if (parsed.searchParams.has(key)) parsed.searchParams.set(key, "***");
    }
    return parsed.toString();
  } catch {
    return url.replace(/:[^:@/]+@/, ":***@");
  }
}

function discoverMigrations(migrationsDir: string): MigrationFile[] {
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found: ${migrationsDir}`);
  }

  const entries = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    // Lexicographic order is the applied order: "0_init" sorts before every
    // date-prefixed migration, and date prefixes sort chronologically.
    .sort((a, b) => a.localeCompare(b, "en"));

  const migrations: MigrationFile[] = [];
  for (const name of entries) {
    const filePath = path.join(migrationsDir, name, "migration.sql");
    if (!fs.existsSync(filePath)) {
      throw new Error(
        `prisma/migrations/${name}/ has no migration.sql. Every migration directory must contain one, or the runner cannot know what to apply.`
      );
    }
    const sql = fs.readFileSync(filePath, "utf8");
    migrations.push({
      name,
      filePath,
      sql,
      checksum: crypto.createHash("sha256").update(sql, "utf8").digest("hex"),
    });
  }

  if (migrations.length === 0) {
    throw new Error(`No migrations found in ${migrationsDir}.`);
  }
  return migrations;
}

async function ensureMigrationsTable(client: pg.PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS "${MIGRATIONS_TABLE}" (
      "name" TEXT NOT NULL PRIMARY KEY,
      "checksum" TEXT NOT NULL,
      "statements_total" INTEGER NOT NULL,
      "statements_applied" INTEGER NOT NULL,
      "statements_skipped" INTEGER NOT NULL,
      "duration_ms" INTEGER NOT NULL,
      "applied_at" TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function readAppliedMigrations(client: pg.PoolClient): Promise<Map<string, AppliedRecord>> {
  const res = await client.query(`SELECT "name", "checksum", "applied_at" FROM "${MIGRATIONS_TABLE}";`);
  return new Map(
    res.rows.map((r: { name: string; checksum: string; applied_at: Date }) => [
      r.name,
      { checksum: r.checksum, appliedAt: new Date(r.applied_at).toISOString() },
    ])
  );
}

interface ApplyOutcome {
  applied: number;
  skipped: number;
  durationMs: number;
}

/**
 * Applies one migration file inside a single transaction, one statement at a
 * time. An "already exists" error rolls back only that statement's savepoint so
 * the remaining statements still run — that is what lets this heal a database
 * that was left partially migrated. Any other error rolls back the whole file
 * and propagates, so a partial migration is never committed.
 */
async function applyMigration(client: pg.PoolClient, migration: MigrationFile): Promise<ApplyOutcome> {
  const statements = splitSqlStatements(migration.sql);
  if (statements.length === 0) {
    throw new Error(`${migration.name}/migration.sql contains no executable statements.`);
  }

  const startedAt = Date.now();
  let applied = 0;
  const skipped: string[] = [];

  await client.query("BEGIN");
  try {
    for (const [index, statement] of statements.entries()) {
      const savepoint = `sm_stmt_${index}`;
      await client.query(`SAVEPOINT ${savepoint}`);
      try {
        await client.query(statement.sql);
        await client.query(`RELEASE SAVEPOINT ${savepoint}`);
        applied++;
      } catch (err) {
        await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        await client.query(`RELEASE SAVEPOINT ${savepoint}`);
        if (isAlreadyExistsError(err)) {
          skipped.push(`line ${statement.line}: ${summarise(statement.sql)} — ${(err as Error).message}`);
          continue;
        }
        const code = (err as { code?: string }).code ?? "unknown";
        throw new Error(
          `${migration.name}/migration.sql line ${statement.line} failed [${code}]: ${(err as Error).message}\n  Statement: ${summarise(statement.sql, 200)}`
        );
      }
    }

    await client.query(
      `INSERT INTO "${MIGRATIONS_TABLE}"
         ("name", "checksum", "statements_total", "statements_applied", "statements_skipped", "duration_ms")
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT ("name") DO UPDATE SET
         "checksum" = EXCLUDED."checksum",
         "statements_total" = EXCLUDED."statements_total",
         "statements_applied" = EXCLUDED."statements_applied",
         "statements_skipped" = EXCLUDED."statements_skipped",
         "duration_ms" = EXCLUDED."duration_ms",
         "applied_at" = now();`,
      [migration.name, migration.checksum, statements.length, applied, skipped.length, Date.now() - startedAt]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  }

  // Skips are expected when healing a partially applied database, but they are
  // never hidden: every one is reported, in full under --verbose.
  if (skipped.length > 0) {
    const shown = VERBOSE ? skipped : skipped.slice(0, 5);
    console.log(`  ℹ ${skipped.length} statement(s) already satisfied and skipped:`);
    for (const line of shown) console.log(`      - ${line}`);
    if (shown.length < skipped.length) {
      console.log(`      … ${skipped.length - shown.length} more (re-run with --verbose to list all)`);
    }
  }

  return { applied, skipped: skipped.length, durationMs: Date.now() - startedAt };
}

function summarise(sql: string, max = 90): string {
  const flat = sql.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/**
 * Serialises concurrent runners. A blocked runner reports the wait instead of
 * hanging a deploy silently, and gives up with a diagnosable error.
 */
async function acquireAdvisoryLock(client: pg.PoolClient, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let announced = false;
  for (;;) {
    const res = await client.query("SELECT pg_try_advisory_lock($1) AS locked;", [ADVISORY_LOCK_KEY]);
    if (res.rows[0]?.locked === true) return;
    if (!announced) {
      console.log("→ Another migration runner holds the schema lock; waiting…");
      announced = true;
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `Timed out after ${Math.round(timeoutMs / 1000)}s waiting for the migration advisory lock. Another deploy is migrating this database, or a previous runner died holding the lock — check pg_locks for locktype='advisory'.`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

function reportIssues(issues: VerificationIssue[]): { errors: number; warnings: number } {
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  if (warnings.length > 0) {
    console.log(`\n⚠ ${warnings.length} schema warning(s):`);
    for (const w of warnings) console.log(`   [${w.check}] ${w.detail}`);
  }
  if (errors.length > 0) {
    console.error(`\n✗ ${errors.length} structural defect(s) — the schema is NOT safe to serve traffic:`);
    for (const e of errors) console.error(`   [${e.check}] ${e.detail}`);
  }
  return { errors: errors.length, warnings: warnings.length };
}

async function main() {
  console.log("=========================================================================");
  console.log(" 🐘 SETTLEMATE AI — DELIBERATE POSTGRESQL MIGRATION RUNNER");
  console.log("=========================================================================");

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || (!databaseUrl.startsWith("postgres://") && !databaseUrl.startsWith("postgresql://"))) {
    console.error("✗ ERROR: DATABASE_URL environment variable must start with postgresql:// or postgres://");
    console.error('  Example: DATABASE_URL="postgresql://user:pass@host/settlemate?sslmode=require" npm run db:migrate:prod\n');
    process.exit(1);
  }

  const sslResolution = resolvePgSsl(databaseUrl);
  console.log(`→ Target Database: ${maskDatabaseUrl(databaseUrl)}`);
  console.log(`→ TLS: sslmode=${sslResolution.mode} (from ${sslResolution.source})`);
  if (VERIFY_ONLY) console.log("→ Mode: --verify-only (no statement will be executed)");

  const migrationsDir = path.join(process.cwd(), "prisma", "migrations");
  const migrations = discoverMigrations(migrationsDir);
  console.log(`→ Discovered ${migrations.length} migration(s): ${migrations.map((m) => m.name).join(", ")}`);

  const pool = new pg.Pool({
    connectionString: databaseUrl,
    // `ssl` is only set when the URL declares no sslmode; otherwise pg's own
    // connection-string parsing is authoritative and anything passed here is
    // discarded. See src/lib/db-ssl.ts.
    ...(sslResolution.ssl === false ? { ssl: false } : {}),
    connectionTimeoutMillis: 15000,
    max: 2,
  });

  let client: pg.PoolClient | undefined;
  let lockHeld = false;

  try {
    console.log("→ Testing PostgreSQL connectivity...");
    try {
      client = await pool.connect();
    } catch (err) {
      throw new Error(describePgConnectFailure(err, databaseUrl));
    }

    const info = await client.query("SELECT version(), current_database(), current_user;");
    console.log(`✓ Connected to database: ${info.rows[0].current_database} (User: ${info.rows[0].current_user})`);
    console.log(`  Engine: ${String(info.rows[0].version).split(" on ")[0]}`);

    // A migration that blocks forever on someone else's lock hangs the deploy
    // with no diagnosis. Fail fast and retryably instead.
    const lockTimeout = process.env.SETTLEMATE_MIGRATION_LOCK_TIMEOUT ?? "15s";
    await client.query(`SET lock_timeout = '${lockTimeout.replace(/'/g, "")}';`);
    if (process.env.SETTLEMATE_MIGRATION_STATEMENT_TIMEOUT) {
      await client.query(`SET statement_timeout = '${process.env.SETTLEMATE_MIGRATION_STATEMENT_TIMEOUT.replace(/'/g, "")}';`);
    }

    if (!VERIFY_ONLY) {
      const lockWaitMs = Number(process.env.SETTLEMATE_MIGRATION_LOCK_WAIT_MS ?? 120_000);
      await acquireAdvisoryLock(client, Number.isFinite(lockWaitMs) && lockWaitMs > 0 ? lockWaitMs : 120_000);
      lockHeld = true;

      await ensureMigrationsTable(client);
      const applied = await readAppliedMigrations(client);

      let appliedCount = 0;
      for (const migration of migrations) {
        const record = applied.get(migration.name);

        if (record && record.checksum === migration.checksum) {
          console.log(`\n→ ${migration.name}: already applied at ${record.appliedAt} (checksum match) — skipping.`);
          continue;
        }

        if (record && record.checksum !== migration.checksum) {
          throw new Error(
            `${migration.name} was applied at ${record.appliedAt} but its migration.sql has changed since ` +
              `(recorded ${record.checksum.slice(0, 12)}…, on disk ${migration.checksum.slice(0, 12)}…).\n` +
              `  An applied migration must never be edited: the databases that already ran it would diverge silently from the ones that run the new text.\n` +
              `  Add a new migration directory with the corrective statements instead.`
          );
        }

        console.log(`\n→ Applying ${migration.name} (${path.basename(migration.filePath)})…`);
        const outcome = await applyMigration(client, migration);
        console.log(
          `✓ Applied ${migration.name}: ${outcome.applied} statement(s) executed, ${outcome.skipped} already satisfied, ${outcome.durationMs}ms`
        );
        appliedCount++;
      }

      console.log(
        appliedCount === 0
          ? "\n✓ Schema already at the latest migration — nothing to apply."
          : `\n✓ ${appliedCount} migration(s) applied.`
      );
    }

    // ---------------------------------------------------------------------
    // Post-migration structural verification gate
    // ---------------------------------------------------------------------
    console.log("\n→ Verifying schema against the migrations and the Prisma model set…");

    const declared = extractDeclaredObjects(migrations.map((m) => m.sql));
    const prismaSchemaPath = path.join(process.cwd(), "prisma", "schema.postgresql.prisma");
    if (!fs.existsSync(prismaSchemaPath)) {
      throw new Error(`Prisma PostgreSQL schema not found at ${prismaSchemaPath}; cannot verify model coverage.`);
    }
    const prismaModels = extractPrismaModels(fs.readFileSync(prismaSchemaPath, "utf8"));

    const activeClient = client;
    const report = await verifyPostgresSchema(
      (sql, params) => activeClient.query(sql, params as unknown[] | undefined),
      {
        declared,
        prismaModels,
        internalTables: [MIGRATIONS_TABLE],
        requiredColumnTypes: [
          {
            table: "BankTransaction",
            column: "balance",
            dataType: "bigint",
            reason: "A running bank balance in paise exceeds INT32 at ₹2.15 crore; widened by 20260830.",
          },
          {
            table: "Batch",
            column: "amountAtRisk",
            dataType: "bigint",
            reason: "The sum of exception amounts in paise exceeds INT32 at ₹2.15 crore; widened by 20260831.",
          },
        ],
        requiredRows: [
          {
            table: "Tenant",
            column: "id",
            value: "tenant_default_sandbox",
            label: "Default sandbox tenant",
          },
        ],
      }
    );

    console.log(
      `  Declared by migrations: ${declared.tables.length} tables, ${declared.indexes.length} indexes, ${declared.constraints.length} named constraints, ${declared.policies.length} literal policies`
    );
    console.log(`  Prisma models: ${prismaModels.length}`);
    console.log(
      `  Present in database: ${report.counts.tables} tables, ${report.counts.indexes} indexes, ${report.counts.constraints} constraints, ${report.counts.policies} policies`
    );
    console.log(
      `  Tenant isolation: ${report.counts.rlsEnabled}/${report.counts.tenantScopedTables} tenant-scoped tables under RLS`
    );

    const { errors, warnings } = reportIssues(report.issues);

    if (errors > 0) {
      console.error("\n=========================================================================");
      console.error(` ✗ MIGRATION VERIFICATION FAILED: ${errors} structural defect(s).`);
      console.error("   Release blocked. The application must not serve traffic on this schema.");
      console.error("=========================================================================\n");
      process.exitCode = 1;
      return;
    }

    console.log("\n=========================================================================");
    console.log(
      ` ✅ SCHEMA VERIFIED: ${report.counts.tables} tables, ${report.counts.indexes} indexes, ${report.counts.constraints} constraints, ${report.counts.rlsEnabled} under RLS${warnings > 0 ? `, ${warnings} warning(s)` : ""}.`
    );
    console.log("    Existing data preserved. No destructive resets performed.");
    console.log("=========================================================================\n");
  } catch (err) {
    console.error("\n✗ PostgreSQL Migration Failed:", (err as Error).message);
    console.error("  Release blocked. No partial migration was committed.");
    process.exitCode = 1;
  } finally {
    if (client) {
      if (lockHeld) {
        await client.query("SELECT pg_advisory_unlock($1);", [ADVISORY_LOCK_KEY]).catch(() => undefined);
      }
      client.release();
    }
    await pool.end().catch(() => undefined);
  }
}

main().catch((err) => {
  console.error("Migration runner uncaught error:", err);
  process.exit(1);
});
