-- =========================================================================
-- SettleMate AI — Phase 1 Durable Job Model & Job Items Migration
-- =========================================================================
--
-- 1. Additive columns for AsyncJob (worker claiming, heartbeats, progress, retries):
--    - claimedAt (claimed_at)
--    - heartbeatAt (heartbeat_at)
--    - nextRetryAt (next_retry_at)
--    - cancelRequestedAt (cancel_requested_at)
--    - progressCurrent (progress_current)
--    - progressTotal (progress_total)
--
-- 2. New JobItem table for item-level tracking and bounded concurrency execution:
--    - id
--    - jobId
--    - tenantId
--    - idempotencyKey
--    - status
--    - error
--    - completedAt
--    - Unique constraint: (jobId, idempotencyKey)
--
-- 3. Row-Level Security (RLS) and Tenant Isolation Policy for JobItem.
--

-- -------------------------------------------------------------------------
-- 1. Additive columns on AsyncJob
-- -------------------------------------------------------------------------
ALTER TABLE "AsyncJob" ADD COLUMN IF NOT EXISTS "claimedAt" TIMESTAMP(3);
ALTER TABLE "AsyncJob" ADD COLUMN IF NOT EXISTS "heartbeatAt" TIMESTAMP(3);
ALTER TABLE "AsyncJob" ADD COLUMN IF NOT EXISTS "nextRetryAt" TIMESTAMP(3);
ALTER TABLE "AsyncJob" ADD COLUMN IF NOT EXISTS "cancelRequestedAt" TIMESTAMP(3);
ALTER TABLE "AsyncJob" ADD COLUMN IF NOT EXISTS "progressCurrent" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AsyncJob" ADD COLUMN IF NOT EXISTS "progressTotal" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "AsyncJob_status_nextRetryAt_idx" ON "AsyncJob"("status", "nextRetryAt");
CREATE INDEX IF NOT EXISTS "AsyncJob_tenantId_createdAt_idx" ON "AsyncJob"("tenantId", "createdAt");

-- -------------------------------------------------------------------------
-- 2. Create JobItem table
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "JobItem" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_default_sandbox',
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobItem_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
    ALTER TABLE "JobItem"
        ADD CONSTRAINT "JobItem_jobId_fkey"
        FOREIGN KEY ("jobId") REFERENCES "AsyncJob"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN
    -- Constraint already present
END $$;

DO $$
BEGIN
    ALTER TABLE "JobItem"
        ADD CONSTRAINT "JobItem_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN
    -- Constraint already present
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "JobItem_jobId_idempotencyKey_key" ON "JobItem"("jobId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "JobItem_tenantId_status_idx" ON "JobItem"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "JobItem_jobId_status_idx" ON "JobItem"("jobId", "status");
CREATE INDEX IF NOT EXISTS "JobItem_tenantId_createdAt_idx" ON "JobItem"("tenantId", "createdAt");

-- -------------------------------------------------------------------------
-- 3. Row-Level Security on JobItem
-- -------------------------------------------------------------------------
ALTER TABLE "JobItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "JobItem" FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
    EXECUTE 'CREATE POLICY tenant_isolation_policy ON "JobItem" FOR ALL USING ("tenantId" = CURRENT_SETTING(''app.current_tenant_id'', true)) WITH CHECK ("tenantId" = CURRENT_SETTING(''app.current_tenant_id'', true));';
EXCEPTION WHEN duplicate_object THEN
    -- Policy already present
END $$;
