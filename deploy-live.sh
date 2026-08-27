#!/usr/bin/env bash
# =========================================================================
# SettleMate AI — 1-Command Live Public Deployment Script
# =========================================================================
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bash "$DIR/scripts/deploy-live.sh" "$@"
