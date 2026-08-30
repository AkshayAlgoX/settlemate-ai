-- =========================================================================
-- SettleMate AI — PostgreSQL Multi-Tenant Row-Level Security (RLS) Migration
-- =========================================================================

-- 1. Create Default Sandbox Tenant for Backfill & Isolation Baseline
CREATE TABLE IF NOT EXISTS "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "settings" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Tenant_slug_key" ON "Tenant"("slug");

-- Insert deterministic default sandbox tenant
INSERT INTO "Tenant" ("id", "name", "slug", "status", "settings", "createdAt", "updatedAt")
VALUES ('tenant_default_sandbox', 'Default Sandbox Tenant', 'default-sandbox', 'ACTIVE', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- 2. Create User & ApiKey Tables
CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "User_tenantId_email_key" ON "User"("tenantId", "email");
CREATE INDEX IF NOT EXISTS "User_tenantId_role_idx" ON "User"("tenantId", "role");

CREATE TABLE IF NOT EXISTS "ApiKey" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'SERVICE',
    "revokedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ApiKey_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ApiKey_keyHash_key" ON "ApiKey"("keyHash");
CREATE INDEX IF NOT EXISTS "ApiKey_tenantId_revokedAt_idx" ON "ApiKey"("tenantId", "revokedAt");

-- 3. Add tenantId column to all financial tables if missing & enforce foreign keys
DO $$
DECLARE
    tbl text;
    tables text[] := ARRAY[
        'Batch', 'Order', 'Payment', 'Settlement', 'BankTransaction',
        'Refund', 'Chargeback', 'ReconciliationResult', 'Exception',
        'GroundTruth', 'AgentTrace', 'AuditLog', 'ChatMessage',
        'FeedbackEntry', 'CardinalityLink', 'ReconciliationLedger',
        'AuditEvent', 'RunMetadata', 'ScaleRun', 'ScalePartition'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables
    LOOP
        -- Add tenantId column with default sandbox tenant
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT ''tenant_default_sandbox'';', tbl);

        -- Add foreign key constraint to Tenant table
        BEGIN
            EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;', tbl, tbl || '_tenantId_fkey');
        EXCEPTION WHEN duplicate_object THEN
            -- Constraint already exists
        END;

        -- Create tenant-scoped composite index
        EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I("tenantId");', tbl || '_tenantId_idx', tbl);
    END LOOP;
END $$;

-- 4. Create Decision Receipts, AI Logs, Webhook and Async Job Tables
CREATE TABLE IF NOT EXISTS "DecisionReceipt" (
    "receiptId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_default_sandbox',
    "jobId" TEXT,
    "batchId" TEXT,
    "rootHash" TEXT NOT NULL,
    "leafCount" INTEGER NOT NULL,
    "algorithm" TEXT NOT NULL DEFAULT 'SHA256-MERKLE-DAG',
    "timestamp" TIMESTAMP(3) NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "canonicalPayload" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DecisionReceipt_pkey" PRIMARY KEY ("receiptId"),
    CONSTRAINT "DecisionReceipt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DecisionReceipt_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "AiClaimLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_default_sandbox',
    "exceptionId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "model" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "promptSnippet" TEXT,
    "outputPayload" TEXT,
    "latencyMs" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiClaimLog_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AiClaimLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "WebhookSubscription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_default_sandbox',
    "url" TEXT NOT NULL,
    "events" TEXT NOT NULL,
    "secretEncrypted" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookSubscription_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WebhookSubscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "WebhookOutbox" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_default_sandbox',
    "subscriptionId" TEXT,
    "event" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastStatusCode" INTEGER,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "WebhookOutbox_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WebhookOutbox_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WebhookOutbox_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "WebhookSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "AsyncJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_default_sandbox',
    "idempotencyKey" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "payload" TEXT NOT NULL,
    "result" TEXT,
    "error" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "workerId" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AsyncJob_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AsyncJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AsyncJob_tenantId_idempotencyKey_key" UNIQUE ("tenantId", "idempotencyKey")
);

-- 5. Enable and Force Row-Level Security (RLS) on ALL Tenant-Owned Tables
DO $$
DECLARE
    tbl text;
    rls_tables text[] := ARRAY[
        'User', 'ApiKey', 'Batch', 'Order', 'Payment', 'Settlement',
        'BankTransaction', 'Refund', 'Chargeback', 'ReconciliationResult',
        'Exception', 'GroundTruth', 'AgentTrace', 'AuditLog', 'ChatMessage',
        'FeedbackEntry', 'CardinalityLink', 'ReconciliationLedger',
        'AuditEvent', 'RunMetadata', 'ScaleRun', 'ScalePartition',
        'DecisionReceipt', 'AiClaimLog', 'WebhookSubscription',
        'WebhookOutbox', 'AsyncJob'
    ];
BEGIN
    FOREACH tbl IN ARRAY rls_tables
    LOOP
        -- Enable RLS
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', tbl);

        -- Drop existing policy if exists
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON %I;', tbl);

        -- Create strict USING and WITH CHECK policy
        EXECUTE format('CREATE POLICY tenant_isolation_policy ON %I FOR ALL USING ("tenantId" = CURRENT_SETTING(''app.current_tenant_id'', true)) WITH CHECK ("tenantId" = CURRENT_SETTING(''app.current_tenant_id'', true));', tbl);
    END LOOP;
END $$;
