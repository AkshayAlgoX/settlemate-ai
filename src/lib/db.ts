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

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pgPool: pg.Pool | undefined;
};

export function createPrismaAdapter() {
  const databaseUrl = process.env.DATABASE_URL || "file:./dev.db";

  if (databaseUrl.startsWith("postgres://") || databaseUrl.startsWith("postgresql://")) {
    const pool =
      globalForPrisma.pgPool ??
      new pg.Pool({
        connectionString: databaseUrl,
        max: Number(process.env.PG_MAX_POOL_SIZE || 20),
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });

    if (process.env.NODE_ENV !== "production") {
      globalForPrisma.pgPool = pool;
    }

    return new PrismaPg(pool);
  }

  // Fallback to local SQLite adapter for deterministic local development
  return new PrismaBetterSqlite3({
    url: databaseUrl,
  });
}

const adapter = createPrismaAdapter();

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export function isPostgres(): boolean {
  const url = process.env.DATABASE_URL || "";
  return url.startsWith("postgres://") || url.startsWith("postgresql://");
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
      provider: (adapter as { provider?: string }).provider || "database",
      status: "up",
      latencyMs: Date.now() - start,
    };
  } catch {
    return {
      provider: (adapter as { provider?: string }).provider || "database",
      status: "down",
      latencyMs: Date.now() - start,
    };
  }
}