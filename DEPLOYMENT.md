# SettleMate AI — Production Persistence & Single-Node Deployment Guide

This operations guide defines the single-node production deployment architecture for SettleMate AI, detailing persistent local volume configuration, SQLite WAL concurrency, automated database initialization, health monitoring, and disaster recovery procedures.

---

## 1. System Requirements & Architecture

- **Runtime**: Node.js `v20.x` or `v22.x` LTS (Linux Container or Host VM)
- **Memory**: Minimum 1 GB RAM (Recommended: 2–4 GB for 10k–100k scale runs)
- **CPU**: Minimum 1 vCPU (Recommended: 2 vCPUs)
- **Storage**: Persistent SSD/NVMe Block Volume mounted at `/app/data` (20–50 GB recommended)
- **Architecture Model**: **Dedicated Single-Node Control Plane** (Strictly 1 container instance per persistent disk).

```
                        ┌───────────────────────────────┐
                        │  External ERP / E-Commerce    │
                        └──────────────┬────────────────┘
                                       │ REST API / HMAC Webhooks
                                       ▼
                        ┌───────────────────────────────┐
                        │ Reverse Proxy / Ingress (TLS) │
                        └──────────────┬────────────────┘
                                       │ Port 3000
                                       ▼
            ┌────────────────────────────────────────────────────────┐
            │          SettleMate AI Container Control Plane         │
            │  - Next.js 16.3 Standalone Node Server (Port 3000)     │
            │  - Non-Root User: nextjs (UID 1001)                    │
            │  - Token Bucket Rate Limiter & Security Boundaries     │
            │  - Deterministic 3-Pass Reconciler (806 rec/s)         │
            │  - Advisory AI Council + Non-LLM Claim Verification    │
            │  - Cryptographic Merkle DAG Receipt Generator          │
            └────────────┬──────────────────────────────┬────────────┘
                         │                              │
     DATABASE_URL="file:/app/data/dev.db"  SETTLEMATE_DB_PATH="/app/data/settlemate.db"
                         │                              │
                         ▼                              ▼
            ┌────────────────────────────────────────────────────────┐
            │            Persistent Volume Mount: /app/data          │
            │  ├── dev.db (+ dev.db-wal, dev.db-shm)                │
            │  └── settlemate.db (+ settlemate.db-wal, -shm)        │
            │  └── backups/ (Automated Hot Snapshots)                │
            └────────────────────────────────────────────────────────┘
```

---

## 2. Unified Database Directory Structure

In production, all SQLite files and WAL sidecars reside under `/app/data`:

| Database File | Engine Layer | Models / Tables Managed |
| :--- | :--- | :--- |
| `/app/data/dev.db` | **Prisma ORM 7** (`@prisma/adapter-better-sqlite3`) | `Batch`, `Order`, `Payment`, `Settlement`, `BankTransaction`, `Refund`, `Chargeback`, `ReconciliationResult`, `Exception`, `AiExplanation`, `GroundTruth`, `AgentTrace`, `AuditLog`, `ChatMessage`, `FeedbackEntry`, `ReconciliationLock`, `CardinalityLink`, `ReconciliationLedger`, `AuditEvent`, `RunMetadata`, `ScaleRun`, `ScalePartition`. |
| `/app/data/settlemate.db` | **Native `better-sqlite3`** (WAL + synchronous NORMAL) | `reconciliation_jobs`, `decision_receipts`, `webhook_registrations`, `ai_claim_logs`, `audit_ledger`, `webhook_delivery_logs`, `verify_progress_jobs`. |

*Note: In local development, the databases continue to resolve to project root (`dev.db`) and (`data/settlemate.db`) by default.*

---

## 3. Production Environment Variables Reference

Copy `.env.example` to `.env.production` on the host:

```ini
# Production Server Settings
NODE_ENV=production
PORT=3000
HOSTNAME=0.0.0.0

# Session & JWT Cryptographic Secret (Required min 32 chars)
AUTH_SECRET=sk_live_replace_with_a_real_32_char_cryptographic_secret

# Unified Persistent Storage Locations
DATABASE_URL="file:/app/data/dev.db"
SETTLEMATE_DB_PATH="/app/data/settlemate.db"

# Webhook Cryptographic Signing Secrets
WEBHOOK_SECRET=whsec_live_replace_with_webhook_signing_secret
WEBHOOK_SHARED_SECRET=whsec_settlemate_live_signing_key_001

# Telemetry Token (Optional)
METRICS_TOKEN=

# Advisory AI Model Integrations (Optional)
GEMINI_API_KEY=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
```

---

## 4. Production Deployment

### 1-Command Production Start (Docker Compose)

```bash
# 1. Clone repository on server
git clone https://github.com/AkshayAlgoX/settlemate-ai.git
cd settlemate-ai

# 2. Configure production environment
cp .env.example .env.production
# Edit .env.production with your AUTH_SECRET

# 3. Launch container with persistent volume
docker-compose --env-file .env.production up -d --build

# 4. Verify container status and logs
docker-compose ps
docker-compose logs -f
```

### Container Verification & Health Probe

```bash
# Verify health endpoint returns 200 OK with database check
curl -f http://127.0.0.1:3000/api/v1/health

# Verify API documentation
curl -s http://127.0.0.1:3000/api/docs | grep "openapi"
```

---

## 5. Startup & Database Initialization Lifecycle

When the container launches:
1. `/app/docker-entrypoint.sh` executes as non-root user `nextjs`.
2. Verifies that `/app/data` is mounted and writable.
3. Runs `scripts/init-db.ts` to idempotently push Prisma schema to `dev.db` and initialize direct SQLite tables in `settlemate.db`.
4. `src/instrumentation.ts` registers server shutdown hooks (`SIGTERM`/`SIGINT`).
5. Next.js standalone server starts and binds to `0.0.0.0:3000`.

---

## 6. Graceful Shutdown & WAL Checkpoint

On container stop or orchestrator rolling restart (`docker-compose stop` or `docker stop`):
1. Process receives `SIGTERM`.
2. `src/lib/observability/graceful-shutdown.ts` executes `wal_checkpoint(TRUNCATE)` on `settlemate.db`.
3. Flushes all in-flight WAL transactions to the main database file.
4. Closes database handles cleanly and exits with code 0 in < 1 second.
5. No committed transactions remain stranded in the `-wal` sidecar.

---

## 7. Hot Backup & Disaster Recovery Procedures

### 1. Execute Hot Snapshot (Non-Blocking)
Execute a consistent live backup of both databases without interrupting traffic:

```bash
# Host command executing inside container
docker exec settlemate-control-plane npm run backup

# Or standalone CLI
npm run backup
```
Backups are saved to `/app/data/backups/backup_<timestamp>/` with SHA-256 checksums and SQLite `integrity_check` validation recorded in `backup-manifest.json`.

### 2. Restore From Snapshot
To restore from a backup snapshot:

```bash
# Stop application traffic
docker-compose stop

# Run verified restore utility
docker exec settlemate-control-plane npm run restore

# Restart application
docker-compose start
```
The restore utility automatically validates backup checksums, creates a pre-restore safety snapshot of the existing live database, replaces live files, cleans stale WAL/SHM sidecars, and validates post-restore SQLite integrity.

---

## 8. Single-Node Architecture Boundaries

1. **Strictly Single-Node Instance**: SettleMate AI uses SQLite in WAL mode for maximum in-process throughput (800–1,240 records/sec) and zero network overhead. Multiple container replicas must NOT mount the same physical SQLite file concurrently.
2. **Horizontal Scaling Path**: If horizontal multi-region scale is required in the future, tenant routing or partition worker nodes should process decoupled batch partitions via message queue with centralized state aggregation.
