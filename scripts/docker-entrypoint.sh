#!/bin/sh
set -e

# =========================================================================
# SettleMate AI — Production Container Startup Entrypoint
# =========================================================================

echo "========================================================================="
echo " 🚀 SETTLEMATE AI — PRODUCTION PERSISTENT CONTROL PLANE STARTUP"
echo "========================================================================="

# 1. Authoritative PostgreSQL Migration & Verification
if [ -n "$DATABASE_URL" ]; then
  case "$DATABASE_URL" in
    postgresql://*|postgres://*)
      echo "✓ Authoritative PostgreSQL connection configured."
      echo "→ Running compiled migration runner & schema verification gate..."
      if [ -f "/app/scripts/init-postgres.js" ]; then
        node /app/scripts/init-postgres.js
      elif [ -f "./scripts/init-postgres.js" ]; then
        node ./scripts/init-postgres.js
      else
        echo "✗ Fatal: Compiled migration runner (init-postgres.js) not found!"
        exit 1
      fi
      echo "✓ Production PostgreSQL schema verified. Proceeding to startup."
      ;;
    *)
      echo "✓ Non-PostgreSQL database configured (${DATABASE_URL%%:*}:***). Skipping PostgreSQL migrations."
      ;;
  esac
else
  echo "⚠️ Notice: DATABASE_URL not set in container environment."
fi

# 2. Launch SettleMate AI Standalone Node Server
echo "✓ Launching SettleMate AI Standalone Node Server on ${HOSTNAME:-0.0.0.0}:${PORT:-3000}..."
echo "========================================================================="

exec "$@"
