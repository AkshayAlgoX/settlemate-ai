/*
 * SettleMate AI — SQLite Database Initialization Script
 */

import { initDatabase, getDatabasePath, WebhookRepository } from "../src/lib/storage/sqlite-db";

async function main() {
  console.log("========================================================");
  console.log("   SETTLEMATE AI — SQLITE DATABASE INITIALIZATION");
  console.log("========================================================");

  const dbPath = getDatabasePath();
  console.log(`→ Initializing persistent SQLite database at: ${dbPath}`);

  const db = initDatabase();
  console.log("✓ Database connection established and tables verified.");

  // Verify tables
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all() as { name: string }[];

  console.log(`✓ Created tables (${tables.length}):`);
  tables.forEach((t) => console.log(`   - ${t.name}`));

  const webhooks = WebhookRepository.getAllRegistrations();
  console.log(`✓ Registered Webhook Subscriptions count: ${webhooks.length}`);

  console.log("========================================================");
  console.log(" ✅ DATABASE INITIALIZATION COMPLETE");
  console.log("========================================================\n");
}

main().catch((err) => {
  console.error("Database initialization failed:", err);
  process.exit(1);
});
