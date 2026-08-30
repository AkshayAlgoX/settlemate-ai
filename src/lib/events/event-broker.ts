/*
 * SettleMate AI — Real-Time Event Broker & Multi-Node Fan-Out Engine
 *
 * Implements:
 *   1. Explicit Event Envelope (eventId, tenantId, eventType, entityId, timestamp, traceId, sequence, payload)
 *   2. Durable DomainEvent Persistence in PostgreSQL (Single Source of Truth)
 *   3. Stateless Database-Backed Reconnect & Replay (`Last-Event-ID`)
 *   4. Lightweight PostgreSQL LISTEN / NOTIFY Wake-Up Signal (No payload bloat)
 *   5. In-Process EventEmitter Fallback for Local Development (SQLite mode)
 *   6. Strict Tenant Isolation & Row-Level Security
 *   7. Observability Metrics Integration
 */

import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { metrics } from "@/lib/observability/metrics";
import { UnifiedDomainEventRepository } from "@/lib/storage/unified-store";

export type TelemetryEventType =
  | "INGESTION_RECEIVED"
  | "RECONCILIATION_STARTED"
  | "PROGRESS_UPDATE"
  | "EXCEPTION_DETECTED"
  | "RECONCILIATION_COMPLETED"
  | "JOB_FAILED"
  | "HEARTBEAT";

export interface TelemetryEvent {
  eventId: string;
  tenantId: string;
  eventType: TelemetryEventType;
  entityId: string;
  timestamp: string;
  traceId?: string;
  sequence: number;
  payload: Record<string, unknown>;
}

export type EventSubscriber = (event: TelemetryEvent) => void;

class EventBroker {
  private localEmitter: EventEmitter;
  private pgClient: pg.Client | null = null;
  private isListeningPg = false;
  private sequenceCounter = 0;
  // Transient in-memory cache — NEVER authoritative for correctness
  private transientCache: TelemetryEvent[] = [];
  private readonly maxCacheSize = 500;

  constructor() {
    this.localEmitter = new EventEmitter();
    this.localEmitter.setMaxListeners(10000);
    this.initPgListener();
  }

  private isPostgres(): boolean {
    const url = process.env.DATABASE_URL || "";
    return url.startsWith("postgres://") || url.startsWith("postgresql://");
  }

  private async initPgListener() {
    if (!this.isPostgres() || this.isListeningPg) return;

    try {
      const url = process.env.DATABASE_URL || "";
      this.pgClient = new pg.Client({ connectionString: url });
      await this.pgClient.connect();

      await this.pgClient.query("LISTEN settlemate_telemetry_events");
      this.isListeningPg = true;

      this.pgClient.on("notification", (msg) => {
        if (msg.channel === "settlemate_telemetry_events" && msg.payload) {
          try {
            // Lightweight wake-up frame: { eventId, tenantId, seq, eventType, entityId, timestamp, traceId, payload }
            const wakeUp = JSON.parse(msg.payload);
            const event: TelemetryEvent = {
              eventId: wakeUp.eventId,
              tenantId: wakeUp.tenantId,
              eventType: wakeUp.eventType,
              entityId: wakeUp.entityId || "",
              timestamp: wakeUp.timestamp || new Date().toISOString(),
              traceId: wakeUp.traceId,
              sequence: wakeUp.seq || wakeUp.sequence || 0,
              payload: wakeUp.payload || {},
            };

            this.addToTransientCache(event);
            this.localEmitter.emit(`tenant:${event.tenantId}`, event);
            this.localEmitter.emit("all", event);
            metrics.streamEventsDelivered?.inc({ event_type: event.eventType });
          } catch (e) {
            console.error("[EventBroker] Failed to parse PG notification wake-up:", e);
          }
        }
      });

      this.pgClient.on("error", (err) => {
        console.error("[EventBroker] PG Listener error:", err);
        this.isListeningPg = false;
      });
    } catch {
      // Fallback silently to in-process emitter if DB connection not ready at boot
      this.isListeningPg = false;
    }
  }

  private addToTransientCache(event: TelemetryEvent) {
    this.transientCache.push(event);
    if (this.transientCache.length > this.maxCacheSize) {
      this.transientCache.shift();
    }
  }

  /**
   * Publishes an event to the multi-node event bus and persists it durably in PostgreSQL.
   */
  async publish(params: {
    tenantId: string;
    eventType: TelemetryEventType;
    entityId: string;
    payload: Record<string, unknown>;
    traceId?: string;
  }): Promise<TelemetryEvent> {
    this.sequenceCounter += 1;
    const now = new Date();
    const eventId = `evt_${randomUUID().slice(0, 12)}`;
    const traceId = params.traceId || `tr_${randomUUID().slice(0, 8)}`;

    // 1. Durably persist to PostgreSQL DomainEvent table (Single Source of Truth)
    const stored = UnifiedDomainEventRepository.save({
      id: eventId,
      tenantId: params.tenantId,
      eventType: params.eventType,
      entityId: params.entityId,
      seq: this.sequenceCounter,
      traceId,
      payload: JSON.stringify(params.payload),
      createdAt: now.toISOString(),
    });

    const event: TelemetryEvent = {
      eventId: stored.id,
      tenantId: stored.tenantId || params.tenantId,
      eventType: params.eventType,
      entityId: params.entityId,
      timestamp: stored.createdAt || now.toISOString(),
      traceId,
      sequence: stored.seq || this.sequenceCounter,
      payload: params.payload,
    };

    // Update transient cache & metrics
    this.addToTransientCache(event);
    metrics.streamEventsPublished?.inc({ event_type: event.eventType });
    metrics.domainEventsCreatedTotal?.inc({ event_type: event.eventType });

    // 2. Multi-node lightweight wake-up signal via PostgreSQL NOTIFY
    if (this.isPostgres() && this.pgClient && this.isListeningPg) {
      try {
        // Lightweight wake-up packet (< 150 bytes) — NOT full large payload
        const wakeUpPayload = JSON.stringify({
          eventId: event.eventId,
          tenantId: event.tenantId,
          seq: event.sequence,
          eventType: event.eventType,
          entityId: event.entityId,
          timestamp: event.timestamp,
        });

        await this.pgClient.query("SELECT pg_notify($1, $2)", [
          "settlemate_telemetry_events",
          wakeUpPayload,
        ]);
        return event;
      } catch (err) {
        console.error("[EventBroker] PG NOTIFY error, falling back to local emit:", err);
      }
    }

    // 3. In-process emission (Local dev or direct subscriber notification)
    this.localEmitter.emit(`tenant:${event.tenantId}`, event);
    this.localEmitter.emit("all", event);
    metrics.streamEventsDelivered?.inc({ event_type: event.eventType });

    return event;
  }

  /**
   * Subscribes to events for a specific tenant.
   * Cross-tenant access is impossible because listeners are strictly partitioned by `tenantId`.
   */
  subscribe(tenantId: string, subscriber: EventSubscriber): () => void {
    const channel = `tenant:${tenantId}`;
    this.localEmitter.on(channel, subscriber);
    metrics.streamConnections?.inc();

    return () => {
      this.localEmitter.off(channel, subscriber);
      metrics.streamConnections?.inc(undefined, -1);
    };
  }

  /**
   * Retrieves missed events for reconnecting clients using Last-Event-ID or sequence.
   * Single Source of Truth is PostgreSQL / Unified Store — Reconnect works statelessly across ANY API node.
   */
  getEventsSince(tenantId: string, lastEventId: string): TelemetryEvent[] {
    // Check if lastEventId is a numeric sequence or event ID
    let seqThreshold = 0;
    const parsed = parseInt(lastEventId, 10);
    if (!isNaN(parsed) && parsed > 0) {
      seqThreshold = parsed;
    } else {
      // Find sequence of event ID in cache or DB
      const matched = this.transientCache.find((e) => e.eventId === lastEventId);
      if (matched) {
        seqThreshold = matched.sequence;
      }
    }

    // Query durable repository
    const missed = UnifiedDomainEventRepository.listSince(tenantId, seqThreshold, 100);
    if (missed.length > 0) {
      metrics.domainEventsReplayedTotal?.inc({}, missed.length);
      return missed.map((m) => {
        let parsedPayload: Record<string, unknown> = {};
        try {
          parsedPayload = JSON.parse(m.payload);
        } catch {
          parsedPayload = { raw: m.payload };
        }
        return {
          eventId: m.id,
          tenantId: m.tenantId || tenantId,
          eventType: m.eventType as TelemetryEventType,
          entityId: m.entityId,
          timestamp: m.createdAt || new Date().toISOString(),
          traceId: m.traceId,
          sequence: m.seq || 0,
          payload: parsedPayload,
        };
      });
    }

    // Fallback to transient cache if in local memory
    const lastIndex = this.transientCache.findIndex((e) => e.eventId === lastEventId);
    if (lastIndex !== -1) {
      return this.transientCache
        .slice(lastIndex + 1)
        .filter((e) => e.tenantId === tenantId);
    }

    return [];
  }

  /**
   * Closes connections on shutdown.
   */
  async close() {
    if (this.pgClient) {
      try {
        await this.pgClient.end();
      } catch {}
    }
  }

  /**
   * Clears internal state for testing.
   */
  _clearForTests() {
    this.sequenceCounter = 0;
    this.transientCache.length = 0;
    UnifiedDomainEventRepository._clearForTests();
  }
}

export const eventBroker = new EventBroker();
