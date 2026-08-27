# SettleMate AI — Production Deployment Runbook & Operations Guide

This runbook outlines the steps for deploying, securing, operating, and monitoring SettleMate AI across cloud VMs, container clusters (AWS ECS, Google Cloud Run), and on-premise infrastructure.

---

## 1. System Requirements & Architecture

- **Node.js**: `v20.x` or `v22.x` LTS
- **Memory**: Minimum 1 GB RAM (Recommended: 2–4 GB for high throughput scale runs)
- **CPU**: Minimum 1 vCPU (Recommended: 2–4 vCPUs for parallel worker clusters)
- **Storage**: SSD for local SQLite persistence / cold columnar TSV snapshots
- **Network**: Port `3000` (or reverse proxy port `443` with TLS termination)

```
                       ┌───────────────────────────────┐
                       │  External ERP / E-Commerce    │
                       └──────────────┬────────────────┘
                                      │ REST API / HMAC Webhooks
                                      ▼
                      ┌─────────────────────────────────┐
                      │  Reverse Proxy / Ingress (TLS)  │
                      └──────────────┬──────────────────┘
                                      │
            ┌─────────────────────────┴─────────────────────────┐
            │             SettleMate Control Plane              │
            │  - Token Bucket Rate Limiter (100 req/min)        │
            │  - Input Sanitization & CSP / CORS Headers        │
            │  - Multi-Pass Deterministic Reconciler            │
            │  - Non-LLM Claim Grounding & Verification Council  │
            │  - Cryptographic Merkle DAG Receipt Generator     │
            └───────────────────────────────────────────────────┘
```

---

## 2. Environment Variables Reference

| Variable Name | Required | Default / Example | Purpose |
| :--- | :---: | :--- | :--- |
| `NODE_ENV` | Yes | `production` | Enables production optimizations & security policies |
| `PORT` | No | `3000` | HTTP port binding |
| `HOSTNAME` | No | `0.0.0.0` | Network interface binding |
| `AUTH_SECRET` | Yes (Prod) | `sk_live_...` (min 32 chars) | Session token and JWT signing secret |
| `GEMINI_API_KEY` | Optional | `AIzaSy...` | Optional LLM integration for natural language queries |
| `DATABASE_URL` | Yes | `file:./dev.db` | Prisma SQLite database connection string |

---

## 3. Deployment Options

### Option 0: Vercel Serverless (Recommended for Instant Live Demo)

SettleMate AI includes a native `vercel.json` and zero-config automated deployment pipeline:

1. **Automated 1-Command Deploy Script:**
   ```bash
   # Linux / macOS
   bash scripts/deploy-live.sh

   # Windows (PowerShell)
   .\scripts\deploy-live.ps1
   ```

2. **Manual Vercel CLI Deployment:**
   ```bash
   npx vercel --prod
   ```

3. **Vercel Dashboard (Git Import):**
   - Push repository to GitHub.
   - Import into Vercel Dashboard.
   - Build Command: `prisma generate && next build`
   - Output Directory: `.next`
   - Install Command: `npm install`
   - Add Environment Variable: `AUTH_SECRET=your_32_character_cryptographic_secret`

---

### Option A: Docker Compose (Recommended for Standalone VM)

1. Clone repository to server:
   ```bash
   git clone https://github.com/AkshayAlgoX/settlemate-ai.git
   cd settlemate-ai
   ```
2. Configure `.env.production`:
   ```bash
   NODE_ENV=production
   AUTH_SECRET=your_32_character_cryptographic_secret
   GEMINI_API_KEY=your_optional_gemini_api_key
   ```
3. Start container in detached mode:
   ```bash
   docker-compose up -d --build
   ```
4. Verify container status:
   ```bash
   docker-compose ps
   curl http://localhost:3000/api/v1/health
   ```

---

### Option B: Google Cloud Run (Serverless Container)

1. Build & tag container using Google Cloud Build:
   ```bash
   gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/settlemate-ai:latest
   ```
2. Deploy to Cloud Run with 2 GB RAM:
   ```bash
   gcloud run deploy settlemate-ai \
     --image gcr.io/YOUR_PROJECT_ID/settlemate-ai:latest \
     --platform managed \
     --region us-central1 \
     --allow-unauthenticated \
     --port 3000 \
     --memory 2Gi \
     --set-env-vars NODE_ENV=production,AUTH_SECRET=your_secret_key
   ```

---

### Option C: AWS ECS / Fargate (Container Task)

1. Authenticate Docker to AWS ECR:
   ```bash
   aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin YOUR_AWS_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com
   ```
2. Build & push image:
   ```bash
   docker build -t settlemate-ai .
   docker tag settlemate-ai:latest YOUR_AWS_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/settlemate-ai:latest
   docker push YOUR_AWS_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/settlemate-ai:latest
   ```
3. Create ECS Task Definition with 1 vCPU, 2 GB Memory, port mapping `3000:3000`, and health check `/api/v1/health`.

---

### Option D: Bare Metal / Linux Systemd Service

1. Install dependencies & build:
   ```bash
   npm ci
   npx prisma generate
   npm run build
   ```
2. Create Systemd Service File `/etc/systemd/system/settlemate.service`:
   ```ini
   [Unit]
   Description=SettleMate AI Finance Control Plane
   After=network.target

   [Service]
   Type=simple
   User=www-data
   WorkingDirectory=/var/www/settlemate-ai
   ExecStart=/usr/bin/node server.js
   Restart=always
   RestartSec=5
   Environment=NODE_ENV=production
   Environment=PORT=3000
   Environment=AUTH_SECRET=your_secure_32_character_token

   [Install]
   WantedBy=multi-user.target
   ```
3. Enable and start service:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable settlemate
   sudo systemctl start settlemate
   ```

---

## 4. Pre-Deployment Verification Gate

Before deploying to production, execute the automated pre-flight deployment audit script:

```bash
bash scripts/deploy-check.sh
```

This verifies:
1. Node.js runtime and dependency integrity
2. 35 Unit and Contract Test Suites pass 100%
3. Code formatting and ESLint rules
4. Next.js standalone build compilation
5. Official benchmark fingerprint `81d840cd8cf981e5e69a367b879a8f11e9e51d60136a6d38e430877f08cab02b` reproducibility

---

## 5. Health Monitoring & Observability

- **Health Check Endpoint**: `GET /api/v1/health`
  - Returns `200 OK` with uptime, version, rate limiting, and engine status.
- **OpenAPI 3.0 Documentation**: `GET /api/docs`
- **Interactive Verification Progress**: `GET /api/verify/progress/:jobId`
- **Webhook Delivery Event Stream**: `GET /api/v1/webhooks/logs`

---

## 6. Disaster Recovery & Rollback

1. **Deterministic Recovery**: SettleMate stores no hidden state. Every decision receipt is verifiable offline using `npm run verify:demo`.
2. **Policy Rollback**: Use Policy-as-Code versioning to rollback active matching tolerances with separation-of-duties governance.
3. **Database Backup**: Periodic snapshot of `dev.db` using standard SQLite backup / WAL archiving.
