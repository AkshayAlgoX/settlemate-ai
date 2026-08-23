/*
 * Distributed Reconciliation — Queue & Lease Abstraction
 *
 * Implements:
 *   1. InMemoryDistributedQueue: Full lease-based, visibility-timeout queue with:
 *      - At-least-once delivery semantics
 *      - Visibility timeouts & worker crash recovery
 *      - Lease heartbeating / extension
 *      - Exponential retry backoff & Dead-Letter Queue (DLQ)
 *      - Idempotent deduplication
 *   2. RedisKafkaQueueAdapter: Production schema mapping to Redis Streams (XREADGROUP) / Kafka partitions
 */

import type {
  PartitionLease,
  PartitionMessage,
  QueueAdapter,
  QueueMetrics,
} from "./types";

interface StoredMessage {
  message: PartitionMessage;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "DEAD_LETTER";
  leaseId?: string;
  workerId?: string;
  leaseExpiresAt?: number;
  retryCount: number;
  nextAvailableAt: number;
  lastError?: string;
}

export class InMemoryDistributedQueue implements QueueAdapter {
  private messages = new Map<string, StoredMessage>();
  private pendingQueue: string[] = [];
  private pendingReadIndex = 0;
  private activeLeases = new Map<string, StoredMessage>();
  private leaseSequence = 0;
  private maxRetries: number;
  private deadLetterCounter = 0;
  private retryCounter = 0;
  private completedCounter = 0;

  constructor(options?: { maxRetries?: number }) {
    this.maxRetries = options?.maxRetries ?? 3;
  }

  async enqueueBatch(messages: PartitionMessage[]): Promise<number> {
    let added = 0;
    for (const msg of messages) {
      if (!this.messages.has(msg.messageId)) {
        const item: StoredMessage = {
          message: msg,
          status: "PENDING",
          retryCount: msg.attempt,
          nextAvailableAt: msg.enqueuedAt,
        };
        this.messages.set(msg.messageId, item);
        this.pendingQueue.push(msg.messageId);
        added++;
      }
    }
    return added;
  }

  async claimLeases(
    workerId: string,
    maxLeases: number,
    leaseDurationMs: number,
    now: number = Date.now(),
  ): Promise<PartitionLease[]> {
    const claimed: PartitionLease[] = [];

    // 1. Fast path: index-based pop from pendingQueue (O(1) per claim)
    while (this.pendingReadIndex < this.pendingQueue.length && claimed.length < maxLeases) {
      const msgId = this.pendingQueue[this.pendingReadIndex++];
      if (!msgId) break;
      const item = this.messages.get(msgId);
      if (!item || item.status !== "PENDING" || item.nextAvailableAt > now) {
        continue;
      }

      const leaseId = `lease_${++this.leaseSequence}_${workerId}`;
      const expiresAt = now + leaseDurationMs;
      item.status = "RUNNING";
      item.leaseId = leaseId;
      item.workerId = workerId;
      item.leaseExpiresAt = expiresAt;

      this.activeLeases.set(msgId, item);

      claimed.push({
        leaseId,
        workerId,
        message: { ...item.message, attempt: item.retryCount },
        acquiredAt: now,
        expiresAt,
        token: `${leaseId}:${workerId}`,
      });
    }

    // Periodic compaction of pendingQueue when read index grows
    if (this.pendingReadIndex > 20000 && this.pendingReadIndex >= this.pendingQueue.length / 2) {
      this.pendingQueue = this.pendingQueue.slice(this.pendingReadIndex);
      this.pendingReadIndex = 0;
    }

    // 2. Slow path: check expired leases in activeLeases (worker crash detection)
    if (claimed.length < maxLeases && this.activeLeases.size > 0) {
      for (const [msgId, item] of this.activeLeases.entries()) {
        if (claimed.length >= maxLeases) break;
        if (item.status === "RUNNING" && (item.leaseExpiresAt ?? 0) <= now) {
          const attempt = item.retryCount + 1;
          if (attempt > this.maxRetries) {
            item.status = "DEAD_LETTER";
            this.deadLetterCounter++;
            this.activeLeases.delete(msgId);
            continue;
          }

          const leaseId = `lease_${++this.leaseSequence}_${workerId}`;
          const expiresAt = now + leaseDurationMs;
          item.status = "RUNNING";
          item.leaseId = leaseId;
          item.workerId = workerId;
          item.leaseExpiresAt = expiresAt;
          item.retryCount = attempt;
          this.retryCounter++;

          claimed.push({
            leaseId,
            workerId,
            message: { ...item.message, attempt },
            acquiredAt: now,
            expiresAt,
            token: `${leaseId}:${workerId}`,
          });
        }
      }
    }

    return claimed;
  }

  async renewLease(
    lease: PartitionLease,
    extensionMs: number,
    now: number = Date.now(),
  ): Promise<boolean> {
    const item = this.messages.get(lease.message.messageId);
    if (!item) return false;
    if (item.status !== "RUNNING" || item.leaseId !== lease.leaseId) {
      return false;
    }
    item.leaseExpiresAt = now + extensionMs;
    lease.expiresAt = item.leaseExpiresAt;
    return true;
  }

  async ackLease(lease: PartitionLease): Promise<boolean> {
    const item = this.messages.get(lease.message.messageId);
    if (!item) return false;
    if (item.status === "COMPLETED") return true; // Idempotent ack
    if (item.leaseId !== lease.leaseId && item.status === "RUNNING") {
      return false; // Lease was stolen / expired
    }
    item.status = "COMPLETED";
    item.leaseId = undefined;
    item.workerId = undefined;
    item.leaseExpiresAt = undefined;
    item.message.payloadInline = undefined; // Immediately free payload memory for V8 GC
    this.activeLeases.delete(lease.message.messageId);
    this.completedCounter++;
    return true;
  }

  async nackLease(
    lease: PartitionLease,
    error: string,
    backoffMs: number,
    now: number = Date.now(),
  ): Promise<boolean> {
    const item = this.messages.get(lease.message.messageId);
    if (!item) return false;
    if (item.status === "COMPLETED") return true;

    item.retryCount++;
    item.lastError = error;
    this.retryCounter++;
    this.activeLeases.delete(lease.message.messageId);

    if (item.retryCount >= this.maxRetries) {
      item.status = "DEAD_LETTER";
      this.deadLetterCounter++;
    } else {
      item.status = "PENDING";
      item.nextAvailableAt = now + backoffMs;
      this.pendingQueue.push(lease.message.messageId);
    }

    item.leaseId = undefined;
    item.workerId = undefined;
    item.leaseExpiresAt = undefined;
    return true;
  }

  async getMetrics(): Promise<QueueMetrics> {
    let pending = 0;
    let running = 0;
    let completed = 0;
    let deadLetter = 0;

    for (const item of this.messages.values()) {
      if (item.status === "PENDING") pending++;
      else if (item.status === "RUNNING") running++;
      else if (item.status === "COMPLETED") completed++;
      else if (item.status === "DEAD_LETTER") deadLetter++;
    }

    return {
      pendingCount: pending,
      runningLeases: running,
      completedCount: completed,
      deadLetterCount: deadLetter,
      retryCount: this.retryCounter,
    };
  }

  clear(): void {
    this.messages.clear();
    this.pendingQueue = [];
    this.pendingReadIndex = 0;
    this.activeLeases.clear();
    this.deadLetterCounter = 0;
    this.retryCounter = 0;
    this.completedCounter = 0;
  }
}

/**
 * Redis Streams / Kafka Queue Adapter Blueprint
 * Demonstrates the production protocol mappings:
 *   - Redis: XADD -> XREADGROUP (BLOCK) -> XACK -> XCLAIM / XAUTOCLAIM
 *   - Kafka: Partition key by bucketKey -> Consumer Group manual offset commit
 */
export class RedisKafkaQueueAdapter {
  constructor(
    private readonly endpointUrl: string,
    private readonly streamTopic: string,
  ) {}

  getStreamConfiguration() {
    return {
      endpoint: this.endpointUrl,
      topic: this.streamTopic,
      consumerGroup: "settlemate-reconcilers",
      visibilityTimeoutMs: 30000,
      maxDeliveryAttempts: 3,
    };
  }
}
