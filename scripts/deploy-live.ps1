# SettleMate AI — 1-Command Live Public Deployment Script (PowerShell)
$ErrorActionPreference = "Stop"

Write-Host "=========================================================================" -ForegroundColor Cyan
Write-Host " 🚀 SETTLEMATE AI — 1-COMMAND LIVE PUBLIC DEPLOYMENT" -ForegroundColor Cyan
Write-Host "=========================================================================" -ForegroundColor Cyan

# 1. Environment check
Write-Host "→ [1/6] Checking runtime environment..." -ForegroundColor Yellow
node -v
npm -v

# 2. Database & dependencies
Write-Host "→ [2/6] Generating Prisma Client and initializing persistent SQLite database..." -ForegroundColor Yellow
npx prisma generate
npx prisma db push
npx tsx scripts/init-db.ts

# 3. Test verification
Write-Host "→ [3/6] Running pre-deployment verification suite..." -ForegroundColor Yellow
npm test

# 4. Benchmark evaluation check
Write-Host "→ [4/6] Verifying official benchmark accuracy and fingerprint..." -ForegroundColor Yellow
npm run evaluate

# 5. Production build
Write-Host "→ [5/6] Building optimized Next.js production bundle..." -ForegroundColor Yellow
npm run build

# 6. Vercel deployment
Write-Host "→ [6/6] Initiating Vercel deployment..." -ForegroundColor Yellow
try {
    if ($env:VERCEL_TOKEN) {
        npx vercel --prod --yes --token $env:VERCEL_TOKEN
    } else {
        npx vercel --prod --yes
    }
} catch {
    Write-Host "⚠️  Vercel deployment requires authentication. Run 'npx vercel login' or set VERCEL_TOKEN environment variable." -ForegroundColor Yellow
}

Write-Host "=========================================================================" -ForegroundColor Green
Write-Host " ✅ DEPLOYMENT WORKFLOW COMPLETED" -ForegroundColor Green
Write-Host "=========================================================================" -ForegroundColor Green
