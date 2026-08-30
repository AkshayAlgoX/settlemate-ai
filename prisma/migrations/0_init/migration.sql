-- =========================================================================
-- SettleMate AI — PostgreSQL Production Baseline Migration (0_init)
-- =========================================================================

-- CreateTable
CREATE TABLE "Batch" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "source" TEXT NOT NULL DEFAULT 'GENERATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "totalRecords" INTEGER,
    "autoMatched" INTEGER,
    "exceptionsFound" INTEGER,
    "unresolvedCount" INTEGER,
    "accuracy" DOUBLE PRECISION,
    "precision" DOUBLE PRECISION,
    "recall" DOUBLE PRECISION,
    "throughputRps" DOUBLE PRECISION,
    "processingTimeMs" INTEGER,
    "pass1Accuracy" DOUBLE PRECISION,
    "pass2Accuracy" DOUBLE PRECISION,
    "pass3Accuracy" DOUBLE PRECISION,
    "adversarialScore" DOUBLE PRECISION,
    "amountAtRisk" INTEGER,

    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL,
    "customerEmail" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "fee" INTEGER NOT NULL DEFAULT 0,
    "tax" INTEGER NOT NULL DEFAULT 0,
    "capturedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settlement" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "fee" INTEGER NOT NULL DEFAULT 0,
    "tax" INTEGER NOT NULL DEFAULT 0,
    "utr" TEXT,
    "status" TEXT NOT NULL,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankTransaction" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "txnId" TEXT NOT NULL,
    "utr" TEXT,
    "amount" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "narration" TEXT,
    "balance" INTEGER,
    "txnDate" TIMESTAMP(3) NOT NULL,
    "valueDate" TIMESTAMP(3),

    CONSTRAINT "BankTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "refundId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chargeback" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "chargebackId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Chargeback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationResult" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "settlementId" TEXT,
    "bankTxnId" TEXT,
    "refundIds" TEXT,
    "chargebackIds" TEXT,
    "orderAmount" INTEGER NOT NULL,
    "paymentAmount" INTEGER NOT NULL,
    "paymentFee" INTEGER NOT NULL,
    "paymentTax" INTEGER NOT NULL,
    "refundAmount" INTEGER NOT NULL DEFAULT 0,
    "chargebackAmount" INTEGER NOT NULL DEFAULT 0,
    "expectedNetAmount" INTEGER NOT NULL,
    "actualSettledAmount" INTEGER,
    "bankCreditedAmount" INTEGER,
    "mismatchAmount" INTEGER,
    "status" TEXT NOT NULL,
    "confidenceScore" INTEGER NOT NULL,
    "matchMethod" TEXT,
    "matchDetails" TEXT,
    "cardinalityType" TEXT NOT NULL DEFAULT '1:1',
    "cardinalityReason" TEXT,
    "relationshipScore" INTEGER,
    "passNumber" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReconciliationResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exception" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "reconResultId" TEXT,
    "exceptionType" TEXT NOT NULL,
    "paymentId" TEXT,
    "orderId" TEXT,
    "settlementId" TEXT,
    "bankTxnId" TEXT,
    "utr" TEXT,
    "amount" INTEGER NOT NULL,
    "mismatchAmount" INTEGER,
    "confidenceScore" INTEGER NOT NULL,
    "riskLevel" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "suggestedAction" TEXT,
    "resolution" TEXT,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exception_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiExplanation" (
    "id" TEXT NOT NULL,
    "exceptionId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "recommendedAction" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "needsManualReview" BOOLEAN NOT NULL,
    "model" TEXT NOT NULL,
    "tokensUsed" INTEGER,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiExplanation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroundTruth" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "expectedLabel" TEXT NOT NULL,
    "scenario" TEXT NOT NULL,

    CONSTRAINT "GroundTruth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentTrace" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "exceptionId" TEXT,
    "agentName" TEXT NOT NULL,
    "passNumber" INTEGER NOT NULL,
    "stepNumber" INTEGER NOT NULL,
    "stepLabel" TEXT NOT NULL,
    "stepDetail" TEXT NOT NULL,
    "input" TEXT,
    "output" TEXT,
    "confidenceBefore" INTEGER,
    "confidenceAfter" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentTrace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "batchId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "beforeState" TEXT,
    "afterState" TEXT,
    "reason" TEXT,
    "metadata" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "evidence" TEXT,
    "model" TEXT,
    "tokensUsed" INTEGER,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackEntry" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "exceptionId" TEXT,
    "originalStatus" TEXT NOT NULL,
    "newStatus" TEXT NOT NULL,
    "confidenceBefore" INTEGER NOT NULL,
    "confidenceAfter" INTEGER NOT NULL,
    "adjustedFactor" TEXT,
    "adjustedDelta" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationLock" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReconciliationLock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardinalityLink" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "relationshipType" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceIds" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetIds" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "differencePaise" INTEGER NOT NULL DEFAULT 0,
    "confidenceScore" INTEGER NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "matchMethod" TEXT,
    "runId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardinalityLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationLedger" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "runId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "outcome" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "matchStrategy" TEXT NOT NULL,
    "approvalState" TEXT NOT NULL,
    "sourceRecordIds" TEXT NOT NULL,
    "grossPaise" INTEGER NOT NULL,
    "feePaise" INTEGER NOT NULL,
    "taxPaise" INTEGER NOT NULL,
    "refundPaise" INTEGER NOT NULL,
    "chargebackPaise" INTEGER NOT NULL,
    "netPaise" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "expectedNetPaise" INTEGER NOT NULL,
    "actualSettledPaise" INTEGER,
    "bankCreditedPaise" INTEGER,
    "mismatchPaise" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReconciliationLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "entityId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canonicalPayload" TEXT NOT NULL,
    "previousHash" TEXT NOT NULL,
    "currentHash" TEXT NOT NULL,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunMetadata" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "inputFingerprint" TEXT NOT NULL,
    "outcomeFingerprint" TEXT,
    "providerSchemaVersion" TEXT NOT NULL,
    "normalizerVersion" TEXT NOT NULL,
    "matcherVersion" TEXT NOT NULL,
    "cardinalityVersion" TEXT NOT NULL,
    "rulesetVersion" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "outcomeStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RunMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScaleRun" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "progressPct" INTEGER NOT NULL DEFAULT 0,
    "totalPartitions" INTEGER NOT NULL DEFAULT 0,
    "completedPartitions" INTEGER NOT NULL DEFAULT 0,
    "checkpoint" TEXT,
    "lastError" TEXT,
    "nextRetryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScaleRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScalePartition" (
    "id" TEXT NOT NULL,
    "scaleRunId" TEXT NOT NULL,
    "partitionId" TEXT NOT NULL,
    "bucketKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT NOT NULL,
    "matchedCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextRetryAt" TIMESTAMP(3),
    "checkpoint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScalePartition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Order_batchId_idx" ON "Order"("batchId");
CREATE INDEX "Order_orderId_idx" ON "Order"("orderId");

-- CreateIndex
CREATE INDEX "Payment_batchId_idx" ON "Payment"("batchId");
CREATE INDEX "Payment_paymentId_idx" ON "Payment"("paymentId");
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- CreateIndex
CREATE INDEX "Settlement_batchId_idx" ON "Settlement"("batchId");
CREATE INDEX "Settlement_settlementId_idx" ON "Settlement"("settlementId");
CREATE INDEX "Settlement_paymentId_idx" ON "Settlement"("paymentId");
CREATE INDEX "Settlement_utr_idx" ON "Settlement"("utr");

-- CreateIndex
CREATE INDEX "BankTransaction_batchId_idx" ON "BankTransaction"("batchId");
CREATE INDEX "BankTransaction_utr_idx" ON "BankTransaction"("utr");
CREATE INDEX "BankTransaction_txnId_idx" ON "BankTransaction"("txnId");

-- CreateIndex
CREATE INDEX "Refund_batchId_idx" ON "Refund"("batchId");
CREATE INDEX "Refund_paymentId_idx" ON "Refund"("paymentId");
CREATE INDEX "Refund_refundId_idx" ON "Refund"("refundId");

-- CreateIndex
CREATE INDEX "Chargeback_batchId_idx" ON "Chargeback"("batchId");
CREATE INDEX "Chargeback_paymentId_idx" ON "Chargeback"("paymentId");
CREATE INDEX "Chargeback_chargebackId_idx" ON "Chargeback"("chargebackId");

-- CreateIndex
CREATE INDEX "ReconciliationResult_batchId_idx" ON "ReconciliationResult"("batchId");
CREATE INDEX "ReconciliationResult_paymentId_idx" ON "ReconciliationResult"("paymentId");
CREATE INDEX "ReconciliationResult_status_idx" ON "ReconciliationResult"("status");

-- CreateIndex
CREATE INDEX "Exception_batchId_idx" ON "Exception"("batchId");
CREATE INDEX "Exception_exceptionType_idx" ON "Exception"("exceptionType");
CREATE INDEX "Exception_status_idx" ON "Exception"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AiExplanation_exceptionId_key" ON "AiExplanation"("exceptionId");

-- CreateIndex
CREATE INDEX "GroundTruth_batchId_idx" ON "GroundTruth"("batchId");
CREATE INDEX "GroundTruth_paymentId_idx" ON "GroundTruth"("paymentId");

-- CreateIndex
CREATE INDEX "AgentTrace_batchId_idx" ON "AgentTrace"("batchId");
CREATE INDEX "AgentTrace_exceptionId_idx" ON "AgentTrace"("exceptionId");

-- CreateIndex
CREATE INDEX "AuditLog_batchId_idx" ON "AuditLog"("batchId");
CREATE INDEX "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");

-- CreateIndex
CREATE INDEX "ChatMessage_batchId_idx" ON "ChatMessage"("batchId");

-- CreateIndex
CREATE INDEX "FeedbackEntry_batchId_idx" ON "FeedbackEntry"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "ReconciliationLock_batchId_key" ON "ReconciliationLock"("batchId");

-- CreateIndex
CREATE INDEX "CardinalityLink_batchId_idx" ON "CardinalityLink"("batchId");
CREATE INDEX "CardinalityLink_relationshipType_idx" ON "CardinalityLink"("relationshipType");
CREATE INDEX "CardinalityLink_sourceType_idx" ON "CardinalityLink"("sourceType");
CREATE INDEX "CardinalityLink_targetType_idx" ON "CardinalityLink"("targetType");

-- CreateIndex
CREATE INDEX "ReconciliationLedger_batchId_idx" ON "ReconciliationLedger"("batchId");
CREATE INDEX "ReconciliationLedger_paymentId_idx" ON "ReconciliationLedger"("paymentId");
CREATE INDEX "ReconciliationLedger_status_idx" ON "ReconciliationLedger"("status");

-- CreateIndex
CREATE INDEX "AuditEvent_batchId_idx" ON "AuditEvent"("batchId");
CREATE UNIQUE INDEX "AuditEvent_batchId_seq_key" ON "AuditEvent"("batchId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "RunMetadata_runId_key" ON "RunMetadata"("runId");
CREATE INDEX "RunMetadata_batchId_idx" ON "RunMetadata"("batchId");
CREATE INDEX "RunMetadata_inputFingerprint_idx" ON "RunMetadata"("inputFingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "ScaleRun_idempotencyKey_key" ON "ScaleRun"("idempotencyKey");
CREATE INDEX "ScaleRun_batchId_idx" ON "ScaleRun"("batchId");
CREATE INDEX "ScaleRun_status_idx" ON "ScaleRun"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ScalePartition_idempotencyKey_key" ON "ScalePartition"("idempotencyKey");
CREATE INDEX "ScalePartition_status_idx" ON "ScalePartition"("status");
CREATE UNIQUE INDEX "ScalePartition_scaleRunId_partitionId_key" ON "ScalePartition"("scaleRunId", "partitionId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Chargeback" ADD CONSTRAINT "Chargeback_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReconciliationResult" ADD CONSTRAINT "ReconciliationResult_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Exception" ADD CONSTRAINT "Exception_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiExplanation" ADD CONSTRAINT "AiExplanation_exceptionId_fkey" FOREIGN KEY ("exceptionId") REFERENCES "Exception"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroundTruth" ADD CONSTRAINT "GroundTruth_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentTrace" ADD CONSTRAINT "AgentTrace_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentTrace" ADD CONSTRAINT "AgentTrace_exceptionId_fkey" FOREIGN KEY ("exceptionId") REFERENCES "Exception"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeedbackEntry" ADD CONSTRAINT "FeedbackEntry_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CardinalityLink" ADD CONSTRAINT "CardinalityLink_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReconciliationLedger" ADD CONSTRAINT "ReconciliationLedger_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RunMetadata" ADD CONSTRAINT "RunMetadata_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScaleRun" ADD CONSTRAINT "ScaleRun_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScalePartition" ADD CONSTRAINT "ScalePartition_scaleRunId_fkey" FOREIGN KEY ("scaleRunId") REFERENCES "ScaleRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
