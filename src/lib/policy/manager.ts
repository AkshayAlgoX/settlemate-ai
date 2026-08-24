/*
 * SettleMate AI — Policy Lifecycle & Shadow Replay Governance Manager
 */

import { computePolicyContentHash } from "./hash";
import { executeStreamingShadowReplay } from "./shadow-replay";
import type {
  PolicyRules,
  PolicyStatus,
  ReconciliationPolicy,
  ShadowReplayReport,
} from "./types";

export const DEFAULT_RULES_V1: PolicyRules = {
  amountTolerancePaise: 100, // 1 INR tolerance
  toleranceWindowHours: 72, // 72 hours T+3 window
  materialityThresholdPaise: 500000, // ₹5,000
  confidenceThresholds: {
    autoMatchMin: 90,
    suggestedMatchMin: 70,
  },
  riskThresholds: {
    highRiskScoreMin: 70,
    mediumRiskScoreMin: 40,
  },
  makerCheckerThresholdPaise: 1000000, // ₹10,000
  exceptionEscalationThresholdPaise: 5000000, // ₹50,000
  retryAttemptLimit: 3,
  providerRules: {
    RAZORPAY: { maxDelayedDays: 3, allowedMethods: ["UPI", "CARD", "NETBANKING", "WALLET"] },
    STRIPE: { maxDelayedDays: 5, allowedMethods: ["CARD"] },
  },
  cardinalityConstraints: {
    allowManyToOne: true,
    allowOneToMany: true,
    allowManyToMany: true,
    maxGroupSize: 50,
  },
};

export const DEFAULT_POLICY: ReconciliationPolicy = {
  policyId: "pol_v1_0_0",
  version: "1.0.0",
  status: "ACTIVE",
  createdBy: "SYSTEM_CONTROLLER",
  approvedBy: "CHIEF_RISK_OFFICER",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  activatedAt: new Date("2026-01-01T00:00:00Z"),
  providerScope: ["*"],
  currencyScope: ["INR", "USD"],
  rules: DEFAULT_RULES_V1,
  contentHash: computePolicyContentHash(DEFAULT_RULES_V1),
  description: "Default Production Financial Reconciliation Policy v1.0.0",
};

export class PolicyManager {
  private policies = new Map<string, ReconciliationPolicy>(); // version -> policy
  private activeVersion: string = DEFAULT_POLICY.version;
  private latestReplayReports = new Map<string, ShadowReplayReport>(); // version -> report

  constructor(initialPolicy?: ReconciliationPolicy) {
    const init = initialPolicy || DEFAULT_POLICY;
    this.policies.set(init.version, { ...init });
    this.activeVersion = init.version;
  }

  /**
   * Create a new draft policy version.
   */
  createDraftPolicy(params: {
    version: string;
    rules: PolicyRules;
    createdBy: string;
    description?: string;
    parentVersion?: string;
  }): ReconciliationPolicy {
    if (this.policies.has(params.version)) {
      throw new Error("Policy version " + params.version + " already exists");
    }

    const contentHash = computePolicyContentHash(params.rules);

    const draft: ReconciliationPolicy = {
      policyId: "pol_v" + params.version.replace(/\./g, "_"),
      version: params.version,
      status: "DRAFT",
      createdBy: params.createdBy,
      createdAt: new Date(),
      providerScope: ["*"],
      currencyScope: ["INR", "USD"],
      rules: params.rules,
      parentVersion: params.parentVersion || this.activeVersion,
      contentHash,
      description: params.description || "Draft Policy " + params.version,
    };

    this.policies.set(draft.version, draft);
    return draft;
  }

  /**
   * Transition policy lifecycle state with strict safety gates.
   */
  transitionStatus(version: string, newStatus: PolicyStatus, actorId?: string): ReconciliationPolicy {
    const policy = this.policies.get(version);
    if (!policy) throw new Error("Policy version " + version + " not found");

    if (newStatus === "SHADOW") {
      if (policy.status !== "DRAFT") throw new Error("Can only move to SHADOW from DRAFT");
      policy.status = "SHADOW";
    } else if (newStatus === "APPROVED") {
      if (policy.status !== "SHADOW") throw new Error("Can only APPROVE policies in SHADOW mode");
      if (!actorId) throw new Error("Approval requires authorized actorId");

      // Separation of Duties: Author cannot approve their own policy
      if (actorId === policy.createdBy) {
        throw new Error("Separation of duties violation: policy author cannot approve candidate policy");
      }

      // Must have passed shadow replay
      const replayReport = this.latestReplayReports.get(version);
      if (!replayReport || !replayReport.canPromote) {
        throw new Error("Cannot approve policy without successful shadow replay passing all promotion gates");
      }

      policy.status = "APPROVED";
      policy.approvedBy = actorId;
    } else if (newStatus === "ACTIVE") {
      if (policy.status !== "APPROVED") {
        throw new Error("Can only activate APPROVED policies (direct DRAFT/SHADOW -> ACTIVE forbidden)");
      }

      // Supersede current active policy
      const currentActive = this.policies.get(this.activeVersion);
      if (currentActive) {
        currentActive.status = "SUPERSEDED";
        currentActive.supersededAt = new Date();
      }

      policy.status = "ACTIVE";
      policy.activatedAt = new Date();
      this.activeVersion = policy.version;
    } else if (newStatus === "SUPERSEDED") {
      policy.status = "SUPERSEDED";
      policy.supersededAt = new Date();
    }

    return policy;
  }

  /**
   * Execute streaming shadow replay over historical baseline dataset.
   * Supports 250, 1,000, 10,000, 100,000+ records in bounded O(chunk) memory.
   */
  runShadowReplay(candidateVersion: string, sampleSize: number = 10000): ShadowReplayReport {
    const candidate = this.policies.get(candidateVersion);
    if (!candidate) throw new Error("Candidate policy " + candidateVersion + " not found");

    const activePolicy = this.getActivePolicy();
    const report = executeStreamingShadowReplay(activePolicy, candidate, sampleSize);

    this.latestReplayReports.set(candidateVersion, report);
    return report;
  }

  /**
   * Revert / Rollback to a previous active policy version safely.
   */
  rollbackToVersion(targetVersion: string, actorId: string): ReconciliationPolicy {
    const targetPolicy = this.policies.get(targetVersion);
    if (!targetPolicy) throw new Error("Target policy version " + targetVersion + " does not exist");

    const currentActive = this.getActivePolicy();
    const rollbackVersion = currentActive.version + "-rollback-to-" + targetVersion;

    const rollbackPolicy = this.createDraftPolicy({
      version: rollbackVersion,
      rules: targetPolicy.rules,
      createdBy: actorId,
      description: "Emergency rollback to " + targetVersion + " rules",
      parentVersion: currentActive.version,
    });

    // Move to SHADOW, execute streaming shadow validation, approve, and activate
    this.transitionStatus(rollbackPolicy.version, "SHADOW");
    this.runShadowReplay(rollbackPolicy.version, 1000);

    this.transitionStatus(rollbackPolicy.version, "APPROVED", "CONTROLLER_OVERRIDE");
    this.transitionStatus(rollbackPolicy.version, "ACTIVE");

    return rollbackPolicy;
  }

  getActivePolicy(): ReconciliationPolicy {
    return this.policies.get(this.activeVersion)!;
  }

  getPolicy(version: string): ReconciliationPolicy | undefined {
    return this.policies.get(version);
  }

  getAllPolicies(): ReconciliationPolicy[] {
    return Array.from(this.policies.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  getLatestReplayReport(version: string): ShadowReplayReport | undefined {
    return this.latestReplayReports.get(version);
  }
}
