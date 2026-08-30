import "dotenv/config";
import { defineConfig } from "prisma/config";

const rawUrl = process.env.DATABASE_URL || "";
const isPostgres =
  process.env.PRISMA_TARGET_PROVIDER === "postgresql" ||
  (process.env.PRISMA_TARGET_PROVIDER !== "sqlite" &&
    (rawUrl.startsWith("postgres://") || rawUrl.startsWith("postgresql://")));

export default defineConfig({
  schema: isPostgres ? "prisma/schema.postgresql.prisma" : "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: isPostgres
      ? (rawUrl || "postgresql://placeholder:placeholder@localhost:5432/settlemate")
      : (rawUrl || "file:./dev.db"),
  },
});
