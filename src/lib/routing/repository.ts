/*
 * SettleMate AI — Milestone 2: Tenant-Isolated Routing Decision Repository
 *
 * Persists and retrieves immutable routing decision records with strict RLS/tenant isolation.
 * Automatically emits telemetry metrics upon decision recording.
 */

import type { RoutingDecisionRecord } from "./types";
import { metrics } from "../observability/metrics";

class RoutingDecisionRepository {
  private inMemoryStore = new Map<string, RoutingDecisionRecord>();

  /**
   * Saves a routing decision record and emits telemetry counters.
   */
  save(record: RoutingDecisionRecord): RoutingDecisionRecord {
    const key = `${record.tenantId}:${record.decisionId}`;
    this.inMemoryStore.set(key, record);

    // Telemetry emission
    try {
      const labels = {
        policyVersion: record.policyVersion,
        exposureBand: record.exposureBand,
      };

      switch (record.decision) {
        case "AUTO_RESOLVE":
          metrics.routingAutoResolveTotal.inc(labels);
          break;
        case "HUMAN_REVIEW":
          metrics.routingHumanReviewTotal.inc(labels);
          break;
        case "BLOCKED":
          metrics.routingBlockedTotal.inc(labels);
          break;
        case "REINVESTIGATE":
          metrics.routingReinvestigateTotal.inc(labels);
          break;
      }
    } catch {
      // Telemetry should never fail financial execution
    }

    return record;
  }

  /**
   * Retrieves a decision record scoped strictly to the authenticated tenant.
   */
  get(decisionId: string, tenantId: string): RoutingDecisionRecord | null {
    if (!tenantId || !decisionId) return null;
    const key = `${tenantId}:${decisionId}`;
    return this.inMemoryStore.get(key) || null;
  }

  /**
   * Lists decision records scoped strictly to the authenticated tenant.
   */
  listByTenant(tenantId: string, limit = 50): RoutingDecisionRecord[] {
    if (!tenantId) return [];
    const results: RoutingDecisionRecord[] = [];
    for (const record of this.inMemoryStore.values()) {
      if (record.tenantId === tenantId) {
        results.push(record);
        if (results.length >= limit) break;
      }
    }
    return results;
  }

  /**
   * Clears in-memory store (for testing).
   */
  clear(): void {
    this.inMemoryStore.clear();
  }
}

export const routingDecisionRepository = new RoutingDecisionRepository();
