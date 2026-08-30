import "dotenv/config";
import { defineConfig } from "prisma/config";

const rawUrl = process.env.DATABASE_URL || "";
const isPostgres = rawUrl.startsWith("postgres://") || rawUrl.startsWith("postgresql://");

export default defineConfig({
  schema: isPostgres ? "prisma/schema.postgresql.prisma" : "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: rawUrl || "file:./dev.db",
  },
});
