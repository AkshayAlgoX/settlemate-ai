#!/usr/bin/env bash
# =========================================================================
# SettleMate AI — 1-Command Live Public Deployment Script
# =========================================================================
set -e

echo "========================================================================="
echo " 🚀 SETTLEMATE AI — 1-COMMAND LIVE PUBLIC DEPLOYMENT"
echo "========================================================================="

# 1. Check Node.js and NPM
echo "→ [1/6] Checking runtime environment..."
node -v
npm -v

# 2. Install dependencies & initialize SQLite database
echo "→ [2/6] Initializing persistent SQLite database..."
npm ci --silent || npm install
npx prisma generate
npx prisma db push --skip-generate
npx tsx scripts/init-db.ts

# 3. Run full verification suite before deployment
echo "→ [3/6] Running pre-deployment verification suite..."
npm test

# 4. Benchmark evaluation check
echo "→ [4/6] Verifying official benchmark accuracy and fingerprint..."
npm run evaluate

# 5. Build Next.js production bundle
echo "→ [5/6] Building optimized Next.js production bundle..."
npm run build

# 6. Deploy to Vercel
echo "→ [6/6] Initiating Vercel deployment..."
if [ -n "$VERCEL_TOKEN" ]; then
    echo "Found VERCEL_TOKEN. Deploying to production..."
    npx vercel --prod --yes --token "$VERCEL_TOKEN"
elif command -v vercel &> /dev/null; then
    echo "Found Vercel CLI. Attempting deployment..."
    vercel --prod --yes || {
        echo "⚠️  Vercel deployment requires authentication. Run 'npx vercel login' or set VERCEL_TOKEN environment variable."
    }
else
    echo "Deploying via npx vercel..."
    npx vercel --prod --yes || {
        echo "⚠️  Vercel deployment requires authentication. Run 'npx vercel login' or set VERCEL_TOKEN environment variable."
    }
fi

echo "========================================================================="
echo " ✅ DEPLOYMENT WORKFLOW COMPLETED"
echo "========================================================================="
