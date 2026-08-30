#!/bin/sh
set -e

# =========================================================================
# SettleMate AI — Production Container Startup Entrypoint
# =========================================================================

echo "========================================================================="
echo " 🚀 SETTLEMATE AI — PRODUCTION PERSISTENT CONTROL PLANE STARTUP"
echo "========================================================================="

# 1. Verify runtime environment configuration safely without exposing credentials
if [ -n "$DATABASE_URL" ]; then
  case "$DATABASE_URL" in
    postgresql://*|postgres://*)
      echo "✓ Authoritative PostgreSQL connection configured (credentials masked)."
      ;;
    *)
      echo "✓ Database connection configured (credentials masked)."
      ;;
  esac
else
  echo "⚠️ Notice: DATABASE_URL not set in container environment."
fi

# 2. Launch SettleMate AI Standalone Node Server
echo "✓ Launching SettleMate AI Standalone Node Server on ${HOSTNAME:-0.0.0.0}:${PORT:-3000}..."
echo "========================================================================="

exec "$@"
