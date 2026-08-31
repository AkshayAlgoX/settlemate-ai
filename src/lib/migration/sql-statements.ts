/*
 * SettleMate AI — PostgreSQL migration SQL tokenizer & declaration extractor
 *
 * The production migration runner used to hand each whole migration file to
 * `client.query(sql)`. node-postgres wraps a multi-statement string in an
 * implicit transaction, so the *first* error aborted every statement that
 * followed. Combined with the runner's file-level tolerance of "already exists"
 * errors, applying `0_init` to a database that already had its 22 tables printed
 * a success message while silently skipping 52 indexes, 7 unique constraints and
 * 21 foreign keys — including `ReconciliationLock_batchId_key` (the double
 * settlement guard) and `AuditEvent_batchId_seq_key` (audit tamper-evidence).
 *
 * Splitting the file lets the runner apply each statement inside its own
 * savepoint, so "already exists" can be tolerated per statement instead of
 * discarding the rest of the file.
 *
 * The declaration extractor gives the post-migration verification gate its
 * specification: every object the migrations name must exist in the database
 * afterwards, or the release is blocked.
 */

export interface SqlStatement {
  /** Statement text including any leading comments, trimmed. */
  sql: string;
  /** 1-based line number of the statement's first executable character. */
  line: number;
}

export interface DeclaredConstraint {
  table: string;
  name: string;
}

export interface DeclaredPolicy {
  table: string;
  name: string;
}

export interface DeclaredObjects {
  tables: string[];
  indexes: string[];
  constraints: DeclaredConstraint[];
  policies: DeclaredPolicy[];
}

const DOLLAR_TAG = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/;

function lineAt(source: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset; i++) {
    if (source.charCodeAt(i) === 10) line++;
  }
  return line;
}

/**
 * Removes comments so declaration matching cannot be fooled by prose. Used only
 * for analysis — the statement handed to PostgreSQL keeps its comments.
 */
export function stripSqlComments(source: string): string {
  let out = "";
  let i = 0;
  const n = source.length;

  while (i < n) {
    const ch = source[i];

    if (ch === "-" && source[i + 1] === "-") {
      while (i < n && source[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && source[i + 1] === "*") {
      i += 2;
      let depth = 1;
      while (i < n && depth > 0) {
        if (source[i] === "/" && source[i + 1] === "*") {
          depth++;
          i += 2;
        } else if (source[i] === "*" && source[i + 1] === "/") {
          depth--;
          i += 2;
        } else {
          i++;
        }
      }
      out += " ";
      continue;
    }
    if (ch === "'" || ch === '"') {
      const quote = ch;
      out += source[i++];
      while (i < n) {
        if (source[i] === quote) {
          if (source[i + 1] === quote) {
            out += source[i] + source[i + 1];
            i += 2;
            continue;
          }
          out += source[i++];
          break;
        }
        out += source[i++];
      }
      continue;
    }
    if (ch === "$") {
      const tag = DOLLAR_TAG.exec(source.slice(i))?.[0];
      if (tag) {
        const close = source.indexOf(tag, i + tag.length);
        const end = close === -1 ? n : close + tag.length;
        out += source.slice(i, end);
        i = end;
        continue;
      }
    }
    out += source[i++];
  }

  return out;
}

/**
 * Splits a migration file into individually executable statements.
 *
 * Correctly skips over line comments, block comments, single-quoted literals,
 * quoted identifiers and dollar-quoted blocks, so the `DO $$ ... $$` bodies used
 * by the RLS migration survive intact rather than being cut at their internal
 * semicolons.
 */
export function splitSqlStatements(source: string): SqlStatement[] {
  const statements: SqlStatement[] = [];
  let cursor = 0;
  let i = 0;
  const n = source.length;

  const emit = (endExclusive: number) => {
    const chunk = source.slice(cursor, endExclusive);
    cursor = endExclusive;
    const executable = stripSqlComments(chunk).trim();
    // A chunk of nothing but comments and whitespace, or a bare `;`, is not a
    // statement. Anything that still has a word in it is.
    if (executable.replace(/;/g, "").trim().length === 0) return;
    const leadingWhitespace = chunk.length - chunk.trimStart().length;
    statements.push({ sql: chunk.trim(), line: lineAt(source, cursor - chunk.length + leadingWhitespace) });
  };

  while (i < n) {
    const ch = source[i];

    if (ch === "-" && source[i + 1] === "-") {
      while (i < n && source[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && source[i + 1] === "*") {
      i += 2;
      let depth = 1;
      while (i < n && depth > 0) {
        if (source[i] === "/" && source[i + 1] === "*") {
          depth++;
          i += 2;
        } else if (source[i] === "*" && source[i + 1] === "/") {
          depth--;
          i += 2;
        } else {
          i++;
        }
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      const quote = ch;
      i++;
      while (i < n) {
        if (source[i] === quote) {
          if (source[i + 1] === quote) {
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (ch === "$") {
      const tag = DOLLAR_TAG.exec(source.slice(i))?.[0];
      if (tag) {
        const close = source.indexOf(tag, i + tag.length);
        i = close === -1 ? n : close + tag.length;
        continue;
      }
      i++;
      continue;
    }
    if (ch === ";") {
      emit(i + 1);
      i++;
      continue;
    }
    i++;
  }

  emit(n);
  return statements;
}

// The `(?!IF\s+NOT\s+EXISTS\b)` guards stop the regex engine from backtracking
// past an `IF NOT EXISTS` clause and capturing the literal word "IF" as an
// object name. That happens when the real name is a `%I` placeholder inside an
// `EXECUTE format(...)` string, as in the per-table loops of 20260829_tenant_rls.
// Such dynamically-named objects cannot be extracted statically and are covered
// instead by the tenant-scoped-table invariants in the verification gate.
const CREATE_TABLE = /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?!IF\s+NOT\s+EXISTS\b)"?([A-Za-z_][A-Za-z0-9_]*)"?/gi;
const CREATE_INDEX = /\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(?!IF\s+NOT\s+EXISTS\b)"?([A-Za-z_][A-Za-z0-9_]*)"?/gi;
const ADD_CONSTRAINT = /\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?"?([A-Za-z_][A-Za-z0-9_]*)"?[^;]*?\bADD\s+CONSTRAINT\s+"?([A-Za-z_][A-Za-z0-9_]*)"?/gi;

const CREATE_POLICY = /\bCREATE\s+POLICY\s+"?([A-Za-z_][A-Za-z0-9_]*)"?\s+ON\s+"?([A-Za-z_][A-Za-z0-9_]*)"?/gi;

/**
 * Extracts the schema objects a set of migration files declares by name.
 *
 * Objects created through `EXECUTE format(...)` with `%I` placeholders — the
 * table loop in 20260829_tenant_rls — cannot be extracted this way and are
 * covered instead by the "every tenant-scoped table has RLS" invariant in the
 * verification gate.
 */
export function extractDeclaredObjects(sources: string[]): DeclaredObjects {
  const tables = new Set<string>();
  const indexes = new Set<string>();
  const constraints = new Map<string, DeclaredConstraint>();
  const policies = new Map<string, DeclaredPolicy>();

  for (const raw of sources) {
    // Comments are prose and must not be mined for declarations; string
    // literals are kept because 20260831 creates its RLS policy via EXECUTE.
    const sql = stripSqlComments(raw);

    for (const m of sql.matchAll(CREATE_TABLE)) tables.add(m[1]);
    for (const m of sql.matchAll(CREATE_INDEX)) indexes.add(m[1]);
    for (const m of sql.matchAll(ADD_CONSTRAINT)) {
      constraints.set(`${m[1]}.${m[2]}`, { table: m[1], name: m[2] });
    }
    for (const m of sql.matchAll(CREATE_POLICY)) {
      policies.set(`${m[2]}.${m[1]}`, { table: m[2], name: m[1] });
    }
  }

  return {
    tables: [...tables].sort(),
    indexes: [...indexes].sort(),
    constraints: [...constraints.values()].sort((a, b) => `${a.table}.${a.name}`.localeCompare(`${b.table}.${b.name}`)),
    policies: [...policies.values()].sort((a, b) => `${a.table}.${a.name}`.localeCompare(`${b.table}.${b.name}`)),
  };
}

/**
 * PostgreSQL error codes that mean "this object is already in the desired
 * state". Tolerated per statement so a migration can heal a partially applied
 * database; every other code aborts the migration and the release.
 */
const ALREADY_EXISTS_CODES = new Set([
  "42P07", // duplicate_table (covers tables and indexes)
  "42710", // duplicate_object (constraints, policies, types)
  "42701", // duplicate_column
  "42P06", // duplicate_schema
  "42723", // duplicate_function
]);

export function isAlreadyExistsError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return typeof code === "string" && ALREADY_EXISTS_CODES.has(code);
}
