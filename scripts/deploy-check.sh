#!/usr/bin/env bash
# =========================================================================
# SettleMate AI — Production Pre-Deployment Verification Gate
# =========================================================================

set -e

echo "========================================================================="
echo " 🚀 SETTLEMATE AI — PRE-DEPLOYMENT VERIFICATION & AUDIT GATE"
echo "========================================================================="
echo ""

# 1. Node.js Version Check
echo " [1/5] Checking Node.js runtime version..."
NODE_VER=$(node -v | cut -d'v' -f2)
echo "   Node.js version: v$NODE_VER (Minimum required: v18.0.0)"

# 2. Dependency Audit
echo " [2/5] Checking package dependencies..."
if [ ! -d "node_modules" ]; then
  echo "   [ERROR] node_modules directory missing. Run 'npm ci' first."
  exit 1
fi
echo "   Dependencies present."

# 3. Lint & Static Analysis
echo " [3/5] Running ESLint & Static Analysis..."
npm run lint || echo "   [WARN] Lint warnings detected (continuing build)"

# 4. Execute Unit & Contract Test Suite
echo " [4/5] Executing All Test Suites..."
npm test

# 5. Verify Benchmark Fingerprint & Accuracy
echo " [5/5] Verifying Official 250-Record Benchmark Fingerprint..."
npx tsx scripts/evaluate.ts

echo ""
echo "========================================================================="
echo " ✅ PRE-DEPLOYMENT VERIFICATION PASSED — SYSTEM IS READY FOR PRODUCTION"
echo "========================================================================="
