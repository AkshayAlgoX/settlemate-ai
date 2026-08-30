/*
 * SettleMate AI — Post-migration structural verification gate
 *
 * A migration runner that exits 0 is not evidence that the schema is correct.
 * Against a database holding only the 22 `0_init` tables, the previous runner
 * reported "✅ POSTGRESQL MIGRATION COMPLETE: 30 tables verified, 27 tables under
 * RLS" and exited 0 while the schema was missing 7 unique constraints, 52
 * indexes and 21 foreign keys — the release-blocking failure the audit brief
 * requires was reported as a success.
 *
 * This module answers the only question that matters after a migration: does the
 * live database contain every object the migrations declare, plus the invariants
 * the application depends on? Any `error` issue must fail the process, which is
 * what stops a bad schema from reaching readiness.
 *
 * The specification is derived from the migration files and the Prisma schema
 * rather than hardcoded, so a new migration extends the gate automatically —
 * the failure mode where a model is declared in Prisma but no migration ever
 * creates its table (reproduced live for `DomainEvent`) is caught by
 * construction.
 */

import type { DeclaredObjects } from "./sql-statements";

export type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;

/** Canonical per-table isolation policy name installed by 20260829_tenant_rls. */
const TENANT_ISOLATION_POLICY = "tenant_isolation_policy";

export interface VerificationIssue {
  severity: "error" | "warning";
  check: string;
  detail: string;
}

export interface RequiredColumnType {
  table: string;
  column: string;
  /** information_schema.columns.data_type value, e.g. "bigint". */
  dataType: string;
  /** Why this width matters, quoted in the failure message. */
  reason: string;
}

export interface RequiredRow {
  table: string;
  column: string;
  value: string;
  label: string;
}

export interface VerifySchemaOptions {
  /** Objects named by the migration files. */
  declared: DeclaredObjects;
  /** Model names from prisma/schema.postgresql.prisma; each needs a table. */
  prismaModels: string[];
  /** Columns whose storage width is a financial correctness requirement. */
  requiredColumnTypes: RequiredColumnType[];
  /** Rows the migrations seed and the application's foreign keys depend on. */
  requiredRows: RequiredRow[];
  /** Tables the runner owns and which are intentionally not application tables. */
  internalTables: string[];
}

export interface VerificationReport {
  issues: VerificationIssue[];
  counts: {
    tables: number;
    indexes: number;
    constraints: number;
    policies: number;
    rlsEnabled: number;
    tenantScopedTables: number;
  };
}

/**
 * Runs every structural check and returns all findings. Callers decide the exit
 * code; nothing here throws on a failed check, so a single run reports the whole
 * truth instead of stopping at the first missing object.
 */
export async function verifyPostgresSchema(query: QueryFn, opts: VerifySchemaOptions): Promise<VerificationReport> {
  const issues: VerificationIssue[] = [];

  const tableRows = await query(`
    SELECT c.relname AS name, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname;
  `);
  const tables = new Map(
    tableRows.rows.map((r) => [
      String(r.name),
      { rlsEnabled: r.rls_enabled === true, rlsForced: r.rls_forced === true },
    ])
  );

  const indexRows = await query(`SELECT indexname AS name FROM pg_indexes WHERE schemaname = 'public';`);
  const indexes = new Set(indexRows.rows.map((r) => String(r.name)));

  // Tables that have at least one index whose *leading* column is tenantId. Any
  // such index serves a tenant-scoped scan, so this is checked semantically
  // rather than by index name: several tables satisfy it with a composite index
  // like "User_tenantId_role_idx".
  const leadingColumnRows = await query(`
    SELECT c.relname AS table_name, a.attname AS leading_column
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = i.indkey[0]
    WHERE n.nspname = 'public';
  `);
  const tenantIndexedTables = new Set(
    leadingColumnRows.rows.filter((r) => r.leading_column === "tenantId").map((r) => String(r.table_name))
  );

  const constraintRows = await query(`
    SELECT con.conname AS name, rel.relname AS table_name, con.contype AS kind
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public'
      -- PostgreSQL 18 materialises NOT NULL as pg_constraint rows; counting them
      -- would inflate the reported total by hundreds and hide a real regression.
      AND con.contype IN ('p', 'u', 'f', 'c');
  `);
  const constraints = new Set(constraintRows.rows.map((r) => `${r.table_name}.${r.name}`));
  const primaryKeyTables = new Set(
    constraintRows.rows.filter((r) => r.kind === "p").map((r) => String(r.table_name))
  );

  const policyRows = await query(`SELECT tablename AS table_name, policyname AS name FROM pg_policies WHERE schemaname = 'public';`);
  const policies = new Set(policyRows.rows.map((r) => `${r.table_name}.${r.name}`));

  const columnRows = await query(`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public';
  `);
  const columnTypes = new Map(columnRows.rows.map((r) => [`${r.table_name}.${r.column_name}`, String(r.data_type)]));
  const tenantScopedTables = columnRows.rows
    .filter((r) => r.column_name === "tenantId")
    .map((r) => String(r.table_name));

  const internal = new Set(opts.internalTables);

  // 1. Every table declared by a migration, and every Prisma model, must exist.
  //    The second half catches a model whose table no migration ever creates.
  const expectedTables = new Set([...opts.declared.tables, ...opts.prismaModels]);
  for (const name of [...expectedTables].sort()) {
    if (!tables.has(name)) {
      const declaredByMigration = opts.declared.tables.includes(name);
      issues.push({
        severity: "error",
        check: "table_exists",
        detail: declaredByMigration
          ? `Table "${name}" is created by a migration but is absent from the database.`
          : `Table "${name}" is declared as a Prisma model in prisma/schema.postgresql.prisma but no migration creates it — every write to it will fail at runtime.`,
      });
    }
  }

  // 2. Every index the migrations declare must exist. This is the check that
  //    catches the silent-skip corruption: unique indexes are the double
  //    settlement, idempotency and audit-sequence guards.
  for (const name of opts.declared.indexes) {
    if (!indexes.has(name)) {
      issues.push({
        severity: "error",
        check: "index_exists",
        detail: `Index "${name}" is created by a migration but is absent from the database.`,
      });
    }
  }

  // 3. Every named constraint (foreign keys, unique constraints) must exist.
  for (const c of opts.declared.constraints) {
    if (!constraints.has(`${c.table}.${c.name}`)) {
      issues.push({
        severity: "error",
        check: "constraint_exists",
        detail: `Constraint "${c.name}" on "${c.table}" is created by a migration but is absent from the database.`,
      });
    }
  }

  // 4. Every literally-named RLS policy must exist.
  for (const p of opts.declared.policies) {
    if (!policies.has(`${p.table}.${p.name}`)) {
      issues.push({
        severity: "error",
        check: "policy_exists",
        detail: `Row-Level Security policy "${p.name}" on "${p.table}" is created by a migration but is absent from the database.`,
      });
    }
  }

  // 5. Tenant isolation invariant: a table carrying tenantId must have RLS
  //    enabled and forced, otherwise a table owner or a missed ENABLE statement
  //    silently removes the database-level isolation boundary.
  for (const name of tenantScopedTables.sort()) {
    if (internal.has(name)) continue;
    const t = tables.get(name);
    if (!t) continue;
    if (!t.rlsEnabled) {
      issues.push({
        severity: "error",
        check: "rls_enabled",
        detail: `Table "${name}" has a tenantId column but Row-Level Security is not enabled — cross-tenant reads are not blocked at the database layer.`,
      });
    } else if (!t.rlsForced) {
      issues.push({
        severity: "error",
        check: "rls_forced",
        detail: `Table "${name}" has Row-Level Security enabled but not FORCED — the table owner bypasses every tenant policy.`,
      });
    }
    // RLS with no policy denies everything, which fails closed but takes the
    // application down; RLS with the wrong policy fails open. Require the
    // canonical policy by name on every tenant-scoped table, including tables
    // added after the 20260829 loop was written.
    if (!policies.has(`${name}.${TENANT_ISOLATION_POLICY}`)) {
      issues.push({
        severity: "error",
        check: "tenant_isolation_policy",
        detail: `Table "${name}" has a tenantId column but no "${TENANT_ISOLATION_POLICY}" policy — its migration must install the policy alongside ENABLE ROW LEVEL SECURITY.`,
      });
    }
    // An index whose leading column is tenantId is what keeps a tenant-scoped
    // read off a sequential scan; any composite index starting with tenantId
    // satisfies it. Reported as a warning rather than a release blocker because
    // no Postgres read path currently filters these tables by tenantId alone —
    // four of them (AiClaimLog, DecisionReceipt, WebhookOutbox,
    // WebhookSubscription) are write-only today. Adding indexes for a query that
    // does not exist would be a speculative change; the warning is here so the
    // gate flags it the moment such a query is introduced.
    if (!tenantIndexedTables.has(name)) {
      issues.push({
        severity: "warning",
        check: "tenant_index",
        detail: `Table "${name}" has a tenantId column but no index with tenantId as its leading column — any tenant-scoped read of it will sequentially scan.`,
      });
    }
  }

  // 6. Financial column widths. A 32-bit money column is an outage waiting for a
  //    large enough batch; both of these overflowed in production reproduction.
  for (const req of opts.requiredColumnTypes) {
    const actual = columnTypes.get(`${req.table}.${req.column}`);
    if (!actual) {
      issues.push({
        severity: "error",
        check: "column_exists",
        detail: `Column "${req.table}"."${req.column}" is missing.`,
      });
    } else if (actual !== req.dataType) {
      issues.push({
        severity: "error",
        check: "column_type",
        detail: `Column "${req.table}"."${req.column}" is ${actual}, expected ${req.dataType}. ${req.reason}`,
      });
    }
  }

  // 7. Every application table needs a primary key — Prisma requires one for
  //    update/delete and a table without one cannot be reasoned about.
  for (const [name] of [...tables].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (internal.has(name)) continue;
    if (!primaryKeyTables.has(name)) {
      issues.push({
        severity: "error",
        check: "primary_key",
        detail: `Table "${name}" has no primary key.`,
      });
    }
  }

  // 8. Seed rows the migrations insert and the schema's foreign keys depend on.
  for (const row of opts.requiredRows) {
    if (!tables.has(row.table)) continue; // already reported as a missing table
    const found = await query(
      `SELECT 1 FROM "${row.table}" WHERE "${row.column}" = $1 LIMIT 1;`,
      [row.value]
    );
    if (found.rows.length === 0) {
      issues.push({
        severity: "error",
        check: "seed_row",
        detail: `${row.label}: no row in "${row.table}" with ${row.column} = '${row.value}'. Foreign keys defaulting to it will reject every insert.`,
      });
    }
  }

  // 9. Drift: a public table that no migration declares and no model maps to is
  //    either a leftover from a hand-run statement or an undocumented
  //    dependency. Reported, not fatal — it does not break the application.
  for (const [name] of tables) {
    if (internal.has(name)) continue;
    if (!expectedTables.has(name)) {
      issues.push({
        severity: "warning",
        check: "undeclared_table",
        detail: `Table "${name}" exists in the database but is declared by no migration and no Prisma model.`,
      });
    }
  }

  return {
    issues,
    counts: {
      tables: [...tables.keys()].filter((t) => !internal.has(t)).length,
      indexes: indexes.size,
      constraints: constraints.size,
      policies: policies.size,
      rlsEnabled: [...tables].filter(([n, t]) => !internal.has(n) && t.rlsEnabled).length,
      tenantScopedTables: tenantScopedTables.filter((t) => !internal.has(t)).length,
    },
  };
}

/**
 * Reads model names out of a Prisma schema file's text. Table names equal model
 * names because the SettleMate schemas use no `@@map`; a `@@map` would need to
 * be honoured here and the gate asserts that below.
 */
export function extractPrismaModels(schemaSource: string): string[] {
  if (/@@map\s*\(/.test(schemaSource)) {
    throw new Error(
      "prisma/schema.postgresql.prisma now uses @@map. extractPrismaModels() maps model names directly to table names and must be taught the mapping before the verification gate can be trusted."
    );
  }
  return [...schemaSource.matchAll(/^model\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/gm)].map((m) => m[1]).sort();
}
