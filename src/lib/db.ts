/*
 * SettleMate AI — Enterprise Database Client & Connection Manager
 *
 * Supports dual-environment connection adapters:
 *   - Production: PostgreSQL 16 via @prisma/adapter-pg with connection pooling
 *   - Local / Development: Local SQLite via @prisma/adapter-better-sqlite3
 */

import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
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
  prisma: PrismaClient | undefined;
  pgPool: pg.Pool | undefined;
};

export function isPostgres(): boolean {
  const url = process.env.DATABASE_URL || "";
  return (
    process.env.PRISMA_TARGET_PROVIDER === "postgresql" ||
    (process.env.PRISMA_TARGET_PROVIDER !== "sqlite" &&
      (url.startsWith("postgres://") || url.startsWith("postgresql://")))
  );
}

export function createPrismaAdapter() {
  const databaseUrl = process.env.DATABASE_URL || "";
  const targetIsPostgres = isPostgres();

  if (targetIsPostgres) {
    const pgUrl =
      (databaseUrl.startsWith("postgres://") || databaseUrl.startsWith("postgresql://"))
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
          pgUrl.includes("sslmode=require") ||
          pgUrl.includes("neon.tech")
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

const adapter = createPrismaAdapter();

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

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