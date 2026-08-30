/*
 * SettleMate AI — Migration Runner Safety Suite
 *
 * Regression coverage for the defects found while auditing the production
 * PostgreSQL migration path. Every test here pins a failure that was reproduced
 * against a live PostgreSQL 18.4 server, and every one of them is hermetic: the
 * suite parses the real migration files and the real Prisma schemas but opens no
 * database connection, so `npm test` stays runnable without PostgreSQL.
 *
 * Defects covered:
 *
 *   1. `client.query(wholeFileOfSql)` puts the file in one implicit transaction,
 *      so the first "already exists" error aborts every following statement.
 *      Applying 0_init to a database that already had its tables therefore lost
 *      52 indexes, 7 unique constraints and 21 foreign keys — including the
 *      double-settlement and audit-sequence guards — while the runner printed
 *      success and exited 0. Fixed by splitting into statements; tests 1–6 pin
 *      the splitter, including the `DO $$ … $$` bodies it must not cut.
 *
 *   2. The verification gate's declaration extractor captured the literal word
 *      "IF" as an index name when a migration used
 *      `CREATE INDEX IF NOT EXISTS %I` inside `EXECUTE format(...)`, producing a
 *      false release block. Test 7.
 *
 *   3. `DomainEvent` was declared as a Prisma model that no migration created,
 *      so every write to it failed in production. Test 11 catches that class of
 *      defect statically, before a deploy.
 *
 *   4. `Batch.amountAtRisk` and `BankTransaction.balance` were INT32, which
 *      overflows at ₹2.15 crore — reachable by a single 250-record batch.
 *      Tests 12–13.
 *
 *   5. `ssl: { rejectUnauthorized: false }` passed next to a connection string
 *      containing `sslmode=require` was silently discarded by pg. Tests 14–17.
 *
 *   6. A migration runner that exits 0 is not evidence of a correct schema.
 *      Tests 18–22 drive the verification gate against synthetic databases that
 *      reproduce each corruption shape.
 *
 *   7. The brief forbids `prisma db push`, `migrate dev`, `reset`,
 *      `--force-reset` and destructive startup mutation in production. Test 23
 *      asserts the runner contains none of them.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { resolvePgSsl, sslModeVerifies, describePgConnectFailure } from "../src/lib/db-ssl";
import {
  extractDeclaredObjects,
  isAlreadyExistsError,
  splitSqlStatements,
  stripSqlComments,
} from "../src/lib/migration/sql-statements";
import { extractPrismaModels, verifyPostgresSchema, type QueryFn } from "../src/lib/migration/schema-verify";

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log("  ✓ " + name);
  } catch (err) {
    failed++;
    console.error("  ✗ " + name + " — " + (err as Error).message);
  }
}

const REPO_ROOT = path.join(__dirname, "..");
const MIGRATIONS_DIR = path.join(REPO_ROOT, "prisma", "migrations");

function readMigrationFiles(): { name: string; sql: string }[] {
  return fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, "en"))
    .map((name) => ({ name, sql: fs.readFileSync(path.join(MIGRATIONS_DIR, name, "migration.sql"), "utf8") }));
}

// ---------------------------------------------------------------------------
// Synthetic database for the verification gate
// ---------------------------------------------------------------------------

interface FakeTable {
  name: string;
  rlsEnabled?: boolean;
  rlsForced?: boolean;
  hasPrimaryKey?: boolean;
  columns?: Record<string, string>;
  /** Index names on this table, in creation order. */
  indexes?: string[];
  /** Index names whose leading column is tenantId. */
  tenantLeadingIndexes?: string[];
  constraints?: { name: string; kind: string }[];
  policies?: string[];
}

/**
 * Builds a QueryFn that answers the gate's catalogue queries from a plain
 * description of a database. This lets each corruption shape the audit
 * reproduced live be replayed as a unit test.
 */
function fakeDatabase(tables: FakeTable[], seededRows: Record<string, string[]> = {}): QueryFn {
  return async (sql: string, params?: unknown[]) => {
    const rows: Record<string, unknown>[] = [];

    if (sql.includes("relrowsecurity")) {
      for (const t of tables) {
        rows.push({ name: t.name, rls_enabled: t.rlsEnabled === true, rls_forced: t.rlsForced === true });
      }
    } else if (sql.includes("FROM pg_indexes")) {
      for (const t of tables) for (const i of t.indexes ?? []) rows.push({ name: i });
    } else if (sql.includes("indkey[0]")) {
      for (const t of tables) {
        for (const i of t.tenantLeadingIndexes ?? []) {
          rows.push({ table_name: t.name, leading_column: "tenantId", index_name: i });
        }
      }
    } else if (sql.includes("FROM pg_constraint")) {
      for (const t of tables) {
        if (t.hasPrimaryKey !== false) rows.push({ name: `${t.name}_pkey`, table_name: t.name, kind: "p" });
        for (const c of t.constraints ?? []) rows.push({ name: c.name, table_name: t.name, kind: c.kind });
      }
    } else if (sql.includes("FROM pg_policies")) {
      for (const t of tables) for (const p of t.policies ?? []) rows.push({ table_name: t.name, name: p });
    } else if (sql.includes("information_schema.columns")) {
      for (const t of tables) {
        for (const [column, dataType] of Object.entries(t.columns ?? {})) {
          rows.push({ table_name: t.name, column_name: column, data_type: dataType });
        }
      }
    } else {
      // Seed-row probe: SELECT 1 FROM "<table>" WHERE "<col>" = $1 LIMIT 1
      const table = /FROM "([^"]+)"/.exec(sql)?.[1] ?? "";
      const wanted = String(params?.[0] ?? "");
      if ((seededRows[table] ?? []).includes(wanted)) rows.push({ "?column?": 1 });
    }

    return { rows };
  };
}

const NO_REQUIREMENTS = { requiredColumnTypes: [], requiredRows: [], internalTables: [] as string[] };

function issuesOf(report: { issues: { severity: string; check: string; detail: string }[] }, check: string) {
  return report.issues.filter((i) => i.check === check);
}

async function main() {
  console.log("\n=========================================================================");
  console.log("  MIGRATION RUNNER SAFETY SUITE");
  console.log("=========================================================================\n");

  console.log("── SQL statement splitting (defect 1: implicit whole-file transaction) ──");

  await test("1. splits on top-level semicolons and reports 1-based line numbers", () => {
    const statements = splitSqlStatements('CREATE TABLE "A" ("id" TEXT);\n\nCREATE TABLE "B" ("id" TEXT);\n');
    assert.equal(statements.length, 2, "expected two statements");
    assert.equal(statements[0].line, 1);
    assert.equal(statements[1].line, 3, "second statement starts on line 3");
  });

  await test("2. never cuts a DO $$ … $$ block at its internal semicolons", () => {
    const sql = [
      "DO $$",
      "DECLARE tbl TEXT;",
      "BEGIN",
      "  FOREACH tbl IN ARRAY ARRAY['A','B'] LOOP",
      "    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);",
      "  END LOOP;",
      "END $$;",
      'CREATE INDEX "after_the_block" ON "A"("id");',
    ].join("\n");
    const statements = splitSqlStatements(sql);
    assert.equal(statements.length, 2, `expected 2 statements, got ${statements.length}`);
    assert.ok(statements[0].sql.includes("END LOOP"), "the DO block must survive intact");
    assert.ok(statements[1].sql.includes("after_the_block"), "the statement after the block must be separate");
  });

  await test("3. ignores semicolons inside string literals and quoted identifiers", () => {
    const sql = `INSERT INTO "T" ("v") VALUES ('a;b;c');\nCREATE TABLE "weird;name" ("id" TEXT);`;
    const statements = splitSqlStatements(sql);
    assert.equal(statements.length, 2, `expected 2 statements, got ${statements.length}`);
    assert.ok(statements[0].sql.includes("'a;b;c'"), "the literal must not be split");
  });

  await test("4. drops comment-only and empty chunks rather than executing them", () => {
    const sql = "-- a leading note\n\n/* block */\n;\nSELECT 1;\n-- trailing note\n";
    const statements = splitSqlStatements(sql);
    assert.equal(statements.length, 1, `expected 1 executable statement, got ${statements.length}`);
    assert.ok(statements[0].sql.includes("SELECT 1"));
  });

  await test("5. handles nested block comments without losing the rest of the file", () => {
    const sql = "/* outer /* inner */ still comment */\nSELECT 1;\nSELECT 2;";
    const statements = splitSqlStatements(sql);
    assert.equal(statements.length, 2, `expected 2 statements, got ${statements.length}`);
  });

  await test("6. every real migration file splits into executable statements", () => {
    for (const { name, sql } of readMigrationFiles()) {
      const statements = splitSqlStatements(sql);
      assert.ok(statements.length > 0, `${name} produced no statements`);
      for (const s of statements) {
        assert.ok(s.sql.trim().length > 0, `${name} produced an empty statement`);
        assert.ok(s.line >= 1, `${name} produced a non-positive line number`);
      }
    }
  });

  console.log("\n── Declaration extraction (defect 2: 'IF' captured as an object name) ──");

  await test("7. CREATE INDEX IF NOT EXISTS never yields the literal name 'IF'", () => {
    const sql = [
      "CREATE INDEX IF NOT EXISTS \"Batch_tenantId_idx\" ON \"Batch\"(\"tenantId\");",
      "CREATE UNIQUE INDEX IF NOT EXISTS \"Lock_batchId_key\" ON \"Lock\"(\"batchId\");",
      "DO $$ BEGIN EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(\"tenantId\");', 'x_idx', 'X'); END $$;",
      "CREATE TABLE IF NOT EXISTS \"DomainEvent\" (\"id\" TEXT NOT NULL);",
    ].join("\n");
    const declared = extractDeclaredObjects([sql]);
    assert.ok(!declared.indexes.includes("IF"), `extracted a bogus index named "IF": ${declared.indexes.join(", ")}`);
    assert.ok(!declared.tables.includes("IF"), `extracted a bogus table named "IF"`);
    assert.ok(declared.indexes.includes("Batch_tenantId_idx"), "missed a real index");
    assert.ok(declared.indexes.includes("Lock_batchId_key"), "missed a real unique index");
    assert.ok(declared.tables.includes("DomainEvent"), "missed a real table");
  });

  await test("8. declarations are not mined out of comments", () => {
    const sql = [
      '-- CREATE TABLE "GhostFromLineComment" ("id" TEXT);',
      '/* CREATE INDEX "ghost_from_block_idx" ON "X"("id"); */',
      'CREATE TABLE "Real" ("id" TEXT);',
    ].join("\n");
    const declared = extractDeclaredObjects([sql]);
    assert.deepEqual(declared.tables, ["Real"], `mined a declaration out of a comment: ${declared.tables.join(", ")}`);
    assert.deepEqual(declared.indexes, [], "mined an index out of a comment");
    assert.ok(stripSqlComments(sql).includes("Real"), "stripSqlComments dropped real SQL");
  });

  await test("9. constraints and policies are extracted with their owning table", () => {
    const sql = [
      'ALTER TABLE "Exception" ADD CONSTRAINT "Exception_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id");',
      'CREATE POLICY tenant_isolation_policy ON "Batch" USING (true);',
    ].join("\n");
    const declared = extractDeclaredObjects([sql]);
    assert.deepEqual(declared.constraints, [{ table: "Exception", name: "Exception_batchId_fkey" }]);
    assert.deepEqual(declared.policies, [{ table: "Batch", name: "tenant_isolation_policy" }]);
  });

  await test("10. the real migrations declare the guards that the silent-skip bug destroyed", () => {
    const declared = extractDeclaredObjects(readMigrationFiles().map((m) => m.sql));
    assert.ok(!declared.indexes.includes("IF"), "the 'IF' extraction bug has regressed");
    for (const required of [
      "ReconciliationLock_batchId_key", // double-settlement guard
      "AuditEvent_batchId_seq_key", // audit tamper-evidence
      "ScaleRun_idempotencyKey_key", // durable-run idempotency
      "ScalePartition_idempotencyKey_key",
      "RunMetadata_runId_key",
    ]) {
      assert.ok(declared.indexes.includes(required), `migrations no longer declare "${required}"`);
    }
    assert.ok(declared.tables.includes("DomainEvent"), "no migration creates DomainEvent");
    assert.ok(declared.constraints.length >= 20, `expected ≥20 named constraints, got ${declared.constraints.length}`);
  });

  console.log("\n── Prisma ↔ migration parity (defect 3: model with no table) ──");

  await test("11. every Prisma PostgreSQL model has a table created by a migration", () => {
    const schemaPath = path.join(REPO_ROOT, "prisma", "schema.postgresql.prisma");
    const models = extractPrismaModels(fs.readFileSync(schemaPath, "utf8"));
    const declared = new Set(extractDeclaredObjects(readMigrationFiles().map((m) => m.sql)).tables);
    const orphans = models.filter((m) => !declared.has(m));
    assert.deepEqual(
      orphans,
      [],
      `these models are declared in Prisma but no migration creates their table, so every write to them fails at runtime: ${orphans.join(", ")}`
    );
    assert.ok(models.length >= 31, `expected ≥31 models, got ${models.length}`);
  });

  await test("12. extractPrismaModels refuses to guess when @@map appears", () => {
    assert.deepEqual(extractPrismaModels("model Alpha {\n  id String @id\n}\nmodel Beta {\n}\n"), ["Alpha", "Beta"]);
    assert.throws(
      () => extractPrismaModels('model Alpha {\n  id String @id\n  @@map("alpha_table")\n}\n'),
      /@@map/,
      "a @@map must invalidate the model→table assumption instead of being ignored"
    );
  });

  console.log("\n── Financial column widths (defect 4: INT32 money overflow) ──");

  await test("13. both Prisma schemas keep the money columns at 64 bits", () => {
    for (const file of ["schema.prisma", "schema.postgresql.prisma"]) {
      const source = fs.readFileSync(path.join(REPO_ROOT, "prisma", file), "utf8");
      assert.match(
        source,
        /amountAtRisk\s+BigInt\?/,
        `${file}: Batch.amountAtRisk must be BigInt — as Int it overflows at ₹2.15 crore, which one 250-record batch reaches`
      );
      assert.match(
        source,
        /balance\s+BigInt\?/,
        `${file}: BankTransaction.balance must be BigInt — a running balance in paise exceeds INT32`
      );
    }
  });

  await test("14. a migration widens both money columns to BIGINT", () => {
    const allSql = readMigrationFiles()
      .map((m) => m.sql)
      .join("\n");
    assert.match(allSql, /ALTER\s+TABLE\s+"BankTransaction"\s+ALTER\s+COLUMN\s+"balance"\s+TYPE\s+BIGINT/i);
    assert.match(allSql, /ALTER\s+TABLE\s+"Batch"\s+ALTER\s+COLUMN\s+"amountAtRisk"\s+TYPE\s+BIGINT/i);
  });

  console.log("\n── PostgreSQL TLS resolution (defect 5: discarded ssl option) ──");

  await test("15. an sslmode in the URL is authoritative and pg is left to parse it", () => {
    const saved = process.env.PGSSLMODE;
    delete process.env.PGSSLMODE;
    try {
      for (const mode of ["require", "no-verify", "verify-full", "disable"]) {
        const r = resolvePgSsl(`postgresql://u:p@h:5432/db?sslmode=${mode}`);
        assert.equal(r.mode, mode);
        assert.equal(r.source, "connection-string");
        assert.equal(r.ssl, undefined, `sslmode=${mode} must defer to pg, not pass an ssl object it would discard`);
      }
    } finally {
      if (saved === undefined) delete process.env.PGSSLMODE;
      else process.env.PGSSLMODE = saved;
    }
  });

  await test("16. PGSSLMODE is honoured, and a URL declaring nothing defaults to plaintext", () => {
    const saved = process.env.PGSSLMODE;
    try {
      process.env.PGSSLMODE = "REQUIRE";
      const fromEnv = resolvePgSsl("postgresql://u:p@h:5432/db");
      assert.equal(fromEnv.source, "PGSSLMODE");
      assert.equal(fromEnv.mode, "require", "PGSSLMODE must be lowercased for comparison");
      assert.equal(fromEnv.ssl, undefined);

      delete process.env.PGSSLMODE;
      const bare = resolvePgSsl("postgresql://u:p@h:5432/db");
      assert.equal(bare.source, "default");
      assert.equal(bare.mode, "disable");
      assert.equal(bare.ssl, false, "the default must be explicit plaintext, never verification-disabled TLS");
    } finally {
      if (saved === undefined) delete process.env.PGSSLMODE;
      else process.env.PGSSLMODE = saved;
    }
  });

  await test("17. resolvePgSsl never returns an object that disables certificate verification", () => {
    const saved = process.env.PGSSLMODE;
    delete process.env.PGSSLMODE;
    try {
      for (const url of [
        "postgresql://u:p@h/db",
        "postgresql://u:p@h/db?sslmode=require",
        "postgresql://u:p@h/db?application_name=x&sslmode=verify-full",
      ]) {
        const { ssl } = resolvePgSsl(url);
        assert.ok(
          ssl === false || ssl === undefined,
          "the resolver must not reintroduce rejectUnauthorized:false, which silently downgrades every deployment"
        );
      }
      assert.equal(sslModeVerifies("require"), true);
      assert.equal(sslModeVerifies("verify-full"), true);
      assert.equal(sslModeVerifies("no-verify"), false);
      assert.equal(sslModeVerifies("disable"), false);
    } finally {
      if (saved === undefined) delete process.env.PGSSLMODE;
      else process.env.PGSSLMODE = saved;
    }
  });

  await test("18. connect failures are explained without echoing the password", () => {
    const url = "postgresql://svc:sup3rs3cret@db.internal:5432/settlemate?sslmode=require";

    const selfSigned = describePgConnectFailure(
      Object.assign(new Error("self-signed certificate"), { code: "DEPTH_ZERO_SELF_SIGNED_CERT" }),
      url
    );
    assert.match(selfSigned, /NODE_EXTRA_CA_CERTS/, "must name the knob that fixes an untrusted chain");
    assert.match(selfSigned, /sslmode=no-verify/, "must offer the encrypt-without-verify escape hatch");

    const noSsl = describePgConnectFailure(new Error("The server does not support SSL connections"), url);
    assert.match(noSsl, /sslmode=disable|remove the sslmode/i, "must explain a plaintext server");

    for (const [code, pattern] of [
      ["ECONNREFUSED", /Nothing is listening/i],
      ["ENOTFOUND", /did not resolve/i],
      ["28P01", /authentication failed/i],
      ["3D000", /does not exist/i],
      ["ETIMEDOUT", /timed out/i],
    ] as [string, RegExp][]) {
      const described = describePgConnectFailure(Object.assign(new Error("boom"), { code }), url);
      assert.match(described, pattern, `code ${code} produced no actionable hint`);
    }

    for (const message of [selfSigned, noSsl]) {
      assert.ok(!message.includes("sup3rs3cret"), "a connect diagnostic must never echo the database password");
    }
  });

  console.log("\n── Already-exists tolerance (per statement, never per file) ──");

  await test("19. only genuine duplicate-object codes are tolerated", () => {
    for (const code of ["42P07", "42710", "42701", "42P06", "42723"]) {
      assert.equal(isAlreadyExistsError({ code }), true, `${code} should be tolerated as already-satisfied`);
    }
    for (const code of ["42703", "23505", "42P01", "23503", "40P01", "57014"]) {
      assert.equal(
        isAlreadyExistsError({ code }),
        false,
        `${code} must abort the migration — swallowing it is how a partial schema shipped`
      );
    }
    assert.equal(isAlreadyExistsError(new Error("no code")), false);
    assert.equal(isAlreadyExistsError(null), false);
    assert.equal(isAlreadyExistsError(undefined), false);
  });

  console.log("\n── Verification gate (defect 6: exit 0 is not evidence) ──");

  const HEALTHY: FakeTable[] = [
    {
      name: "Batch",
      rlsEnabled: true,
      rlsForced: true,
      columns: { id: "text", tenantId: "text", amountAtRisk: "bigint" },
      indexes: ["Batch_pkey", "Batch_tenantId_idx"],
      tenantLeadingIndexes: ["Batch_tenantId_idx"],
      policies: ["tenant_isolation_policy"],
    },
    {
      name: "ReconciliationLock",
      columns: { id: "text", batchId: "text" },
      indexes: ["ReconciliationLock_pkey", "ReconciliationLock_batchId_key"],
      constraints: [{ name: "ReconciliationLock_batchId_fkey", kind: "f" }],
    },
  ];

  const HEALTHY_DECLARED = {
    tables: ["Batch", "ReconciliationLock"],
    indexes: ["Batch_tenantId_idx", "ReconciliationLock_batchId_key"],
    constraints: [{ table: "ReconciliationLock", name: "ReconciliationLock_batchId_fkey" }],
    policies: [{ table: "Batch", name: "tenant_isolation_policy" }],
  };

  await test("20. a fully-migrated database produces no errors", async () => {
    const report = await verifyPostgresSchema(fakeDatabase(HEALTHY, { Tenant: [] }), {
      declared: HEALTHY_DECLARED,
      prismaModels: ["Batch", "ReconciliationLock"],
      ...NO_REQUIREMENTS,
    });
    const errors = report.issues.filter((i) => i.severity === "error");
    assert.deepEqual(errors, [], `healthy schema reported errors: ${errors.map((e) => e.detail).join(" | ")}`);
  });

  await test("21. a missing unique index is an error, not a warning", async () => {
    const corrupt = structuredClone(HEALTHY);
    corrupt[1].indexes = ["ReconciliationLock_pkey"]; // the silent-skip corruption
    const report = await verifyPostgresSchema(fakeDatabase(corrupt), {
      declared: HEALTHY_DECLARED,
      prismaModels: ["Batch", "ReconciliationLock"],
      ...NO_REQUIREMENTS,
    });
    const found = issuesOf(report, "index_exists");
    assert.equal(found.length, 1, "the missing double-settlement guard was not reported");
    assert.equal(found[0].severity, "error");
    assert.match(found[0].detail, /ReconciliationLock_batchId_key/);
  });

  await test("22. a missing foreign key and a missing policy are both errors", async () => {
    const corrupt = structuredClone(HEALTHY);
    corrupt[1].constraints = [];
    corrupt[0].policies = [];
    const report = await verifyPostgresSchema(fakeDatabase(corrupt), {
      declared: HEALTHY_DECLARED,
      prismaModels: ["Batch", "ReconciliationLock"],
      ...NO_REQUIREMENTS,
    });
    assert.equal(issuesOf(report, "constraint_exists").length, 1, "a dropped foreign key must block the release");
    assert.ok(
      issuesOf(report, "policy_exists").length + issuesOf(report, "tenant_isolation_policy").length >= 1,
      "a missing tenant isolation policy must block the release"
    );
  });

  await test("23. a Prisma model whose table no migration creates is named explicitly", async () => {
    const report = await verifyPostgresSchema(fakeDatabase(HEALTHY), {
      declared: HEALTHY_DECLARED,
      prismaModels: ["Batch", "ReconciliationLock", "DomainEvent"],
      ...NO_REQUIREMENTS,
    });
    const found = issuesOf(report, "table_exists");
    assert.equal(found.length, 1);
    assert.equal(found[0].severity, "error");
    assert.match(found[0].detail, /DomainEvent/);
    assert.match(found[0].detail, /no migration creates it/, "the message must say why, not just that it is absent");
  });

  await test("24. RLS enabled but not FORCED is an error (the owner bypasses every policy)", async () => {
    const corrupt = structuredClone(HEALTHY);
    corrupt[0].rlsForced = false;
    const forced = await verifyPostgresSchema(fakeDatabase(corrupt), {
      declared: HEALTHY_DECLARED,
      prismaModels: ["Batch", "ReconciliationLock"],
      ...NO_REQUIREMENTS,
    });
    assert.equal(issuesOf(forced, "rls_forced").length, 1, "FORCE ROW LEVEL SECURITY is part of the boundary");

    corrupt[0].rlsEnabled = false;
    const disabled = await verifyPostgresSchema(fakeDatabase(corrupt), {
      declared: HEALTHY_DECLARED,
      prismaModels: ["Batch", "ReconciliationLock"],
      ...NO_REQUIREMENTS,
    });
    assert.equal(issuesOf(disabled, "rls_enabled").length, 1, "a tenantId table without RLS must block the release");
  });

  await test("25. an INT32 money column and a missing seed row are errors", async () => {
    const corrupt = structuredClone(HEALTHY);
    corrupt[0].columns!.amountAtRisk = "integer";
    corrupt.push({ name: "Tenant", columns: { id: "text" }, indexes: ["Tenant_pkey"] });
    const report = await verifyPostgresSchema(fakeDatabase(corrupt, { Tenant: ["some_other_tenant"] }), {
      declared: { ...HEALTHY_DECLARED, tables: [...HEALTHY_DECLARED.tables, "Tenant"] },
      prismaModels: ["Batch", "ReconciliationLock", "Tenant"],
      requiredColumnTypes: [
        { table: "Batch", column: "amountAtRisk", dataType: "bigint", reason: "INT32 overflows at ₹2.15 crore." },
      ],
      requiredRows: [
        { table: "Tenant", column: "id", value: "tenant_default_sandbox", label: "Default sandbox tenant" },
      ],
      internalTables: [],
    });
    const typeIssues = issuesOf(report, "column_type");
    assert.equal(typeIssues.length, 1, "an INT32 money column must block the release");
    assert.match(typeIssues[0].detail, /integer, expected bigint/);
    assert.match(typeIssues[0].detail, /₹2\.15 crore/, "the reason must be quoted so the operator knows the impact");
    assert.equal(issuesOf(report, "seed_row").length, 1, "a missing seeded tenant must block the release");
  });

  await test("26. a table with no primary key is an error; the runner's own table is exempt", async () => {
    const corrupt = structuredClone(HEALTHY);
    corrupt[1].hasPrimaryKey = false;
    corrupt.push({ name: "_settlemate_migrations", hasPrimaryKey: false, columns: { name: "text" } });
    const report = await verifyPostgresSchema(fakeDatabase(corrupt), {
      declared: HEALTHY_DECLARED,
      prismaModels: ["Batch", "ReconciliationLock"],
      requiredColumnTypes: [],
      requiredRows: [],
      internalTables: ["_settlemate_migrations"],
    });
    const found = issuesOf(report, "primary_key");
    assert.equal(found.length, 1, "exactly the application table must be reported");
    assert.match(found[0].detail, /ReconciliationLock/);
    assert.equal(
      issuesOf(report, "undeclared_table").filter((i) => i.detail.includes("_settlemate_migrations")).length,
      0,
      "the runner's bookkeeping table must not be reported as drift"
    );
  });

  await test("27. every check reports without throwing, so one run shows the whole truth", async () => {
    // A database that is wrong in six different ways at once.
    const report = await verifyPostgresSchema(fakeDatabase([]), {
      declared: HEALTHY_DECLARED,
      prismaModels: ["Batch", "ReconciliationLock", "DomainEvent"],
      requiredColumnTypes: [
        { table: "Batch", column: "amountAtRisk", dataType: "bigint", reason: "INT32 overflows." },
      ],
      requiredRows: [{ table: "Tenant", column: "id", value: "tenant_default_sandbox", label: "Default tenant" }],
      internalTables: [],
    });
    assert.ok(issuesOf(report, "table_exists").length >= 3, "all missing tables must be listed, not just the first");
    assert.ok(issuesOf(report, "index_exists").length >= 2);
    assert.ok(issuesOf(report, "constraint_exists").length >= 1);
    assert.ok(issuesOf(report, "column_exists").length >= 1);
    assert.equal(report.counts.tables, 0);
  });

  console.log("\n── Runner discipline (defect 7: destructive production shortcuts) ──");

  await test("28. the production runner contains no destructive or implicit-schema commands", () => {
    const runner = fs.readFileSync(path.join(REPO_ROOT, "scripts", "init-postgres.ts"), "utf8");
    // Comments legitimately name these as forbidden, so scan executable lines only.
    const code = stripSqlComments(runner)
      .split("\n")
      .filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//"))
      .join("\n");
    for (const forbidden of [
      /\bdb\s+push\b/i,
      /\bmigrate\s+dev\b/i,
      /\bmigrate\s+reset\b/i,
      /--force-reset/i,
      /\bDROP\s+DATABASE\b/i,
      /\bDROP\s+SCHEMA\b/i,
      /\bTRUNCATE\b/i,
      /\bDROP\s+TABLE\b/i,
    ]) {
      assert.ok(
        !forbidden.test(code),
        `scripts/init-postgres.ts must not contain ${forbidden} — production migration must never mutate destructively`
      );
    }
    assert.match(code, /pg_try_advisory_lock/, "concurrent runners must be serialised by an advisory lock");
    assert.match(code, /SAVEPOINT/, "statements must be applied under per-statement savepoints");
    assert.match(code, /process\.exitCode = 1/, "a verification failure must exit non-zero to block the release");
    assert.match(code, /--verify-only/, "readiness needs a verify-only mode that executes nothing");
  });

  await test("29. package.json's production migration script is the deliberate runner", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const prod = pkg.scripts["db:migrate:prod"];
    assert.ok(prod, "db:migrate:prod must exist");
    assert.match(prod, /scripts\/init-postgres\.ts/, `db:migrate:prod must run the explicit runner, got: ${prod}`);
    assert.ok(!/db\s+push|migrate\s+dev|migrate\s+reset|force-reset/i.test(prod), `db:migrate:prod is destructive: ${prod}`);
  });

  console.log("\n=========================================================================");
  console.log(`  migration-runner-safety: ${passed} passed, ${failed} failed`);
  console.log("=========================================================================\n");

  if (failed > 0) {
    console.error("migration-runner-safety: FAILURES DETECTED");
    process.exit(1);
  }
  console.log("migration-runner-safety: final ALL PASSED");
}

main().catch((err) => {
  console.error("migration-runner-safety: fatal", err);
  process.exit(1);
});
