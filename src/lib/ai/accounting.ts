/*
 * SettleMate AI — AI Invocation & Claim-Level Accounting Gate (Day 2–3)
 *
 * Tracks AI invocation & claim-level validation metrics with mathematical precision:
 *   - Auto-matched low-risk records 100% bypass AI (0 unnecessary LLM calls)
 *   - Only ambiguous or high-materiality exceptions invoke the Verification Council
 *   - Tracks claim counts, verification rates, disputes, abstentions, and skeptic invocations
 */

import type { ClaimAuditReceipt } from "./claim-types";

export interface AIAccountingMetrics {
  totalProcessedCount: number;
  aiBypassedCount: number;
  aiInvokedCount: number;
  aiInvocationRatePct: number;
  totalAiLatencyMs: number;
  averageAiLatencyMs: number;
  routedToHumanReviewCount: number;
  routedStraightThroughCount: number;
  // Claim-level metrics
  totalClaimsCount: number;
  verifiedClaimsCount: number;
  disputedClaimsCount: number;
  unsupportedClaimsCount: number;
  abstentionCount: number;
  claimVerificationRatePct: number;
  skepticInvocationRatePct: number;
}

export class AIAccountingTracker {
  private total = 0;
  private bypassed = 0;
  private invoked = 0;
  private totalLatencyMs = 0;
  private humanReviewCount = 0;
  private straightThroughCount = 0;

  // Claim tracking
  private totalClaims = 0;
  private verifiedClaims = 0;
  private disputedClaims = 0;
  private unsupportedClaims = 0;
  private abstentions = 0;
  private skepticInvocations = 0;

  recordDecision(params: {
    decision: "AUTO_MATCHED" | "NEEDS_MANUAL_REVIEW" | "SUGGESTED_MATCH" | "EXCEPTION";
    riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    aiInvoked: boolean;
    aiLatencyMs?: number;
    routedToHuman: boolean;
  }) {
    this.total++;
    if (params.aiInvoked) {
      this.invoked++;
      this.totalLatencyMs += params.aiLatencyMs || 0;
    } else {
      this.bypassed++;
    }

    if (params.routedToHuman) {
      this.humanReviewCount++;
    } else {
      this.straightThroughCount++;
    }
  }

  recordClaimsReceipt(receipt: ClaimAuditReceipt, skepticInvoked = false) {
    this.totalClaims += receipt.totalClaimsCount;
    this.verifiedClaims += receipt.verifiedClaimsCount;
    this.disputedClaims += receipt.disputedClaimsCount;
    this.unsupportedClaims += receipt.unsupportedClaimsCount;
    if (receipt.abstain) {
      this.abstentions++;
    }
    if (skepticInvoked || receipt.disputedClaimsCount > 0) {
      this.skepticInvocations++;
    }
  }

  getMetrics(): AIAccountingMetrics {
    const rate = this.total > 0 ? (this.invoked / this.total) * 100 : 0;
    const avgLatency = this.invoked > 0 ? this.totalLatencyMs / this.invoked : 0;
    const claimVerifRate = this.totalClaims > 0 ? (this.verifiedClaims / this.totalClaims) * 100 : 0;
    const skepticRate = this.invoked > 0 ? (this.skepticInvocations / this.invoked) * 100 : 0;

    return {
      totalProcessedCount: this.total,
      aiBypassedCount: this.bypassed,
      aiInvokedCount: this.invoked,
      aiInvocationRatePct: Number(rate.toFixed(2)),
      totalAiLatencyMs: Number(this.totalLatencyMs.toFixed(2)),
      averageAiLatencyMs: Number(avgLatency.toFixed(2)),
      routedToHumanReviewCount: this.humanReviewCount,
      routedStraightThroughCount: this.straightThroughCount,
      totalClaimsCount: this.totalClaims,
      verifiedClaimsCount: this.verifiedClaims,
      disputedClaimsCount: this.disputedClaims,
      unsupportedClaimsCount: this.unsupportedClaims,
      abstentionCount: this.abstentions,
      claimVerificationRatePct: Number(claimVerifRate.toFixed(2)),
      skepticInvocationRatePct: Number(skepticRate.toFixed(2)),
    };
  }

  reset() {
    this.total = 0;
    this.bypassed = 0;
    this.invoked = 0;
    this.totalLatencyMs = 0;
    this.humanReviewCount = 0;
    this.straightThroughCount = 0;
    this.totalClaims = 0;
    this.verifiedClaims = 0;
    this.disputedClaims = 0;
    this.unsupportedClaims = 0;
    this.abstentions = 0;
    this.skepticInvocations = 0;
  }
}
