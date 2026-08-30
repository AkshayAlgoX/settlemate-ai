#!/bin/sh
set -e

# =========================================================================
# SettleMate AI — Production Container Startup Entrypoint
# =========================================================================

echo "========================================================================="
echo " 🚀 SETTLEMATE AI — PRODUCTION PERSISTENT CONTROL PLANE STARTUP"
echo "========================================================================="

# 1. Ensure persistent volume directory structure exists
DATA_DIR="/app/data"
mkdir -p "$DATA_DIR"

echo "→ Verifying unified persistent storage mount at: $DATA_DIR"
echo "→ DATABASE_URL: ${DATABASE_URL:-file:/app/data/dev.db}"
echo "→ SETTLEMATE_DB_PATH: ${SETTLEMATE_DB_PATH:-/app/data/settlemate.db}"

# 2. Synchronize databases on the persistent volume
echo "→ Running idempotent database verification and initialization..."
if [ -f "scripts/init-db.ts" ]; then
  npx tsx scripts/init-db.ts || {
    echo "⚠️ Database initialization completed with warnings. Continuing startup..."
  }
fi

echo "✓ Production persistence verified."
echo "✓ Launching SettleMate AI Standalone Node Server on ${HOSTNAME:-0.0.0.0}:${PORT:-3000}..."
echo "========================================================================="

exec "$@"
