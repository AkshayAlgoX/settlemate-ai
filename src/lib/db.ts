/*
 * SettleMate AI — Enterprise Database Client & Connection Manager
 *
 * Supports dual-environment connection adapters:
 *   - Production & PostgreSQL Tests: PostgreSQL 16 via @prisma/adapter-pg with connection pooling
 *   - Local / Development & SQLite Tests: Local SQLite via @prisma/adapter-better-sqlite3
 */

import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient as DefaultPrismaClient } from "@prisma/client";
import pg from "pg";

// Enable seamless JSON serialization for BigInt database values (e.g. BankTransaction.balance)
if (typeof (BigInt.prototype as { toJSON?: unknown }).toJSON !== "function") {
  Object.defineProperty(BigInt.prototype, "toJSON", {
    value: function (this: bigint) {
      const num = Number(this);
      return Number.isSafeInteger(num) ? num : this.toString();
    },
    writable: true,
    configurable: true,
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma: DefaultPrismaClient | undefined;
  sqliteClient: DefaultPrismaClient | undefined;
  postgresClient: DefaultPrismaClient | undefined;
  pgPool: pg.Pool | undefined;
};

export function isPostgres(): boolean {
  const url = process.env.DATABASE_URL || "";
  return (
    process.env.DATABASE_PROVIDER === "postgresql" ||
    process.env.PRISMA_TARGET_PROVIDER === "postgresql" ||
    (process.env.DATABASE_PROVIDER !== "sqlite" &&
      process.env.PRISMA_TARGET_PROVIDER !== "sqlite" &&
      (url.startsWith("postgres://") || url.startsWith("postgresql://")))
  );
}

export function createPrismaAdapter(customDatabaseUrl?: string) {
  const databaseUrl = customDatabaseUrl || process.env.DATABASE_URL || "";
  const targetIsPostgres =
    process.env.DATABASE_PROVIDER === "postgresql" ||
    process.env.PRISMA_TARGET_PROVIDER === "postgresql" ||
    (process.env.DATABASE_PROVIDER !== "sqlite" &&
      process.env.PRISMA_TARGET_PROVIDER !== "sqlite" &&
      (databaseUrl.startsWith("postgres://") || databaseUrl.startsWith("postgresql://")));

  if (targetIsPostgres) {
    const pgUrl =
      databaseUrl.startsWith("postgres://") || databaseUrl.startsWith("postgresql://")
        ? databaseUrl
        : "postgresql://placeholder:placeholder@localhost:5432/settlemate";

    const pool =
      globalForPrisma.pgPool ??
      new pg.Pool({
        connectionString: pgUrl,
        max: Number(process.env.PG_MAX_POOL_SIZE || 20),
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
        ssl:
          pgUrl.includes("sslmode=require") || pgUrl.includes("neon.tech")
            ? { rejectUnauthorized: false }
            : undefined,
      });

    if (process.env.NODE_ENV !== "production") {
      globalForPrisma.pgPool = pool;
    }

    return new PrismaPg(pool);
  }

  // Fallback to local SQLite adapter for deterministic local development
  return new PrismaBetterSqlite3({
    url: databaseUrl || "file:./dev.db",
  });
}

function getPostgresPrismaClass() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaClient } = require("@prisma-client-postgres");
    return PrismaClient;
  } catch {
    return DefaultPrismaClient;
  }
}

export function createPrismaClient(customDatabaseUrl?: string): DefaultPrismaClient {
  const targetIsPostgres = isPostgres();

  if (targetIsPostgres) {
    const PostgresPrismaClient = getPostgresPrismaClass();
    const adapter = createPrismaAdapter(customDatabaseUrl);
    return new PostgresPrismaClient({ adapter });
  }

  const adapter = createPrismaAdapter(customDatabaseUrl);
  return new DefaultPrismaClient({ adapter });
}

export function getActivePrisma(): DefaultPrismaClient {
  if (isPostgres()) {
    if (!globalForPrisma.postgresClient) {
      globalForPrisma.postgresClient = createPrismaClient();
    }
    return globalForPrisma.postgresClient;
  }

  if (!globalForPrisma.sqliteClient) {
    globalForPrisma.sqliteClient = createPrismaClient();
  }
  return globalForPrisma.sqliteClient;
}

export const prisma: DefaultPrismaClient = new Proxy({} as DefaultPrismaClient, {
  get(_target, prop) {
    const client = getActivePrisma();
    const val = (client as unknown as Record<string, unknown>)[prop as string];
    if (typeof val === "function") {
      return val.bind(client);
    }
    return val;
  },
});

export async function checkDatabaseConnection(): Promise<{
  provider: string;
  status: "up" | "down";
  latencyMs: number;
}> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      provider: isPostgres() ? "postgres" : "sqlite",
      status: "up",
      latencyMs: Date.now() - start,
    };
  } catch (err: unknown) {
    const rawMessage = err instanceof Error ? err.message : String(err);
    const sanitized = rawMessage.replace(/:[^:@\s]+@/, ":***@");
    console.error("[Database Health] Connection check failed:", sanitized);
    return {
      provider: isPostgres() ? "postgres" : "sqlite",
      status: "down",
      latencyMs: Date.now() - start,
    };
  }
}