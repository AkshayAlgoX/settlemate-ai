import { NextRequest, NextResponse } from "next/server";
import { rateLimitGuard, applySecurityHeaders, safeErrorResponse } from "@/lib/security/api-security";
import { evaluatePolicy } from "@/lib/policy/evaluator";
import { computePolicyContentHash } from "@/lib/policy/hash";
import type { ReconciliationPolicy, PolicyRules } from "@/lib/policy/types";

// Curated 20-record sample dataset for interactive policy simulation
export interface PlaygroundRecord {
  id: string;
  referenceId: string;
  grossAmountPaise: number;
  settledAmountPaise: number;
  discrepancyPaise: number;
  timeDeltaHours: number;
  provider: string;
  method: string;
  description: string;
}

export const SAMPLE_PLAYGROUND_RECORDS: PlaygroundRecord[] = [
  {
    id: "REC_01",
    referenceId: "TXN_PG_1001",
    grossAmountPaise: 49900,
    settledAmountPaise: 49900,
    discrepancyPaise: 0,
    timeDeltaHours: 12,
    provider: "RAZORPAY",
    method: "UPI",
    description: "Exact 1:1 match",
  },
  {
    id: "REC_02",
    referenceId: "TXN_PG_1002",
    grossAmountPaise: 99900,
    settledAmountPaise: 99850,
    discrepancyPaise: 50, // ₹0.50 penny variance
    timeDeltaHours: 24,
    provider: "RAZORPAY",
    method: "CARD",
    description: "₹0.50 minor rounding variance",
  },
  {
    id: "REC_03",
    referenceId: "TXN_PG_1003",
    grossAmountPaise: 149900,
    settledAmountPaise: 149800,
    discrepancyPaise: 100, // ₹1.00 variance
    timeDeltaHours: 36,
    provider: "CASHFREE",
    method: "NETBANKING",
    description: "₹1.00 gateway variance",
  },
  {
    id: "REC_04",
    referenceId: "TXN_PG_1004",
    grossAmountPaise: 249900,
    settledAmountPaise: 247400,
    discrepancyPaise: 2500, // ₹25.00 variance
    timeDeltaHours: 24,
    provider: "RAZORPAY",
    method: "UPI",
    description: "₹25.00 gateway dispute",
  },
  {
    id: "REC_05",
    referenceId: "TXN_PG_1005",
    grossAmountPaise: 500000,
    settledAmountPaise: 495000,
    discrepancyPaise: 5000, // ₹50.00 variance
    timeDeltaHours: 48,
    provider: "PAYTM",
    method: "WALLET",
    description: "₹50.00 promo deduction",
  },
  {
    id: "REC_06",
    referenceId: "TXN_PG_1006",
    grossAmountPaise: 750000,
    settledAmountPaise: 750000,
    discrepancyPaise: 0,
    timeDeltaHours: 54, // 54h delay (>48h window)
    provider: "RAZORPAY",
    method: "CARD",
    description: "54h settlement delay",
  },
  {
    id: "REC_07",
    referenceId: "TXN_PG_1007",
    grossAmountPaise: 1200000,
    settledAmountPaise: 1200000,
    discrepancyPaise: 0,
    timeDeltaHours: 80, // 80h delay (>72h window)
    provider: "STRIPE",
    method: "CARD",
    description: "80h cross-border delay",
  },
  {
    id: "REC_08",
    referenceId: "TXN_PG_1008",
    grossAmountPaise: 2000000,
    settledAmountPaise: 1845000,
    discrepancyPaise: 155000, // ₹1,550.00 refund
    timeDeltaHours: 18,
    provider: "RAZORPAY",
    method: "UPI",
    description: "₹1,550 partial refund variance",
  },
  {
    id: "REC_09",
    referenceId: "TXN_PG_1009",
    grossAmountPaise: 5000000,
    settledAmountPaise: 4950000,
    discrepancyPaise: 50000, // ₹500.00 fee deviation
    timeDeltaHours: 24,
    provider: "RAZORPAY",
    method: "NETBANKING",
    description: "₹500.00 fee divergence",
  },
  {
    id: "REC_10",
    referenceId: "TXN_PG_1010",
    grossAmountPaise: 10000000,
    settledAmountPaise: 10000000,
    discrepancyPaise: 0,
    timeDeltaHours: 12,
    provider: "RAZORPAY",
    method: "CARD",
    description: "₹1,00,000 High-Value transaction",
  },
  {
    id: "REC_11",
    referenceId: "TXN_PG_1011",
    grossAmountPaise: 39900,
    settledAmountPaise: 39820,
    discrepancyPaise: 80, // ₹0.80 variance
    timeDeltaHours: 20,
    provider: "RAZORPAY",
    method: "UPI",
    description: "₹0.80 sub-rupee rounding",
  },
  {
    id: "REC_12",
    referenceId: "TXN_PG_1012",
    grossAmountPaise: 650000,
    settledAmountPaise: 647500,
    discrepancyPaise: 2500, // ₹25.00 variance
    timeDeltaHours: 60, // 60h delay
    provider: "CASHFREE",
    method: "CARD",
    description: "₹25.00 variance + 60h delay",
  },
  {
    id: "REC_13",
    referenceId: "TXN_PG_1013",
    grossAmountPaise: 1550000,
    settledAmountPaise: 1550000,
    discrepancyPaise: 0,
    timeDeltaHours: 96, // 96h delayed
    provider: "PAYTM",
    method: "WALLET",
    description: "96h weekend bank lag",
  },
  {
    id: "REC_14",
    referenceId: "TXN_PG_1014",
    grossAmountPaise: 89900,
    settledAmountPaise: 89900,
    discrepancyPaise: 0,
    timeDeltaHours: 8,
    provider: "RAZORPAY",
    method: "UPI",
    description: "Exact 1:1 match",
  },
  {
    id: "REC_15",
    referenceId: "TXN_PG_1015",
    grossAmountPaise: 450000,
    settledAmountPaise: 442500,
    discrepancyPaise: 7500, // ₹75.00 variance
    timeDeltaHours: 18,
    provider: "RAZORPAY",
    method: "CARD",
    description: "₹75.00 interchange fee dispute",
  },
  {
    id: "REC_16",
    referenceId: "TXN_PG_1016",
    grossAmountPaise: 29900,
    settledAmountPaise: 29900,
    discrepancyPaise: 0,
    timeDeltaHours: 4,
    provider: "RAZORPAY",
    method: "UPI",
    description: "Exact 1:1 instant settlement",
  },
  {
    id: "REC_17",
    referenceId: "TXN_PG_1017",
    grossAmountPaise: 850000,
    settledAmountPaise: 849500,
    discrepancyPaise: 500, // ₹5.00 variance
    timeDeltaHours: 30,
    provider: "CASHFREE",
    method: "NETBANKING",
    description: "₹5.00 fee mismatch",
  },
  {
    id: "REC_18",
    referenceId: "TXN_PG_1018",
    grossAmountPaise: 3500000,
    settledAmountPaise: 3500000,
    discrepancyPaise: 0,
    timeDeltaHours: 110, // 110h extreme delay
    provider: "STRIPE",
    method: "CARD",
    description: "110h international settlement delay",
  },
  {
    id: "REC_19",
    referenceId: "TXN_PG_1019",
    grossAmountPaise: 189900,
    settledAmountPaise: 189900,
    discrepancyPaise: 0,
    timeDeltaHours: 16,
    provider: "RAZORPAY",
    method: "UPI",
    description: "Exact 1:1 match",
  },
  {
    id: "REC_20",
    referenceId: "TXN_PG_1020",
    grossAmountPaise: 9500000,
    settledAmountPaise: 9490000,
    discrepancyPaise: 10000, // ₹100.00 variance
    timeDeltaHours: 24,
    provider: "RAZORPAY",
    method: "CARD",
    description: "₹100.00 bulk fee deduction",
  },
];

function getBaselineRules(): PolicyRules {
  return {
    amountTolerancePaise: 100, // ₹1.00
    toleranceWindowHours: 48, // 48h
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
      RAZORPAY: { maxDelayedDays: 2, allowedMethods: ["UPI", "CARD", "NETBANKING"] },
      CASHFREE: { maxDelayedDays: 2, allowedMethods: ["UPI", "CARD", "NETBANKING"] },
      PAYTM: { maxDelayedDays: 3, allowedMethods: ["WALLET", "UPI", "CARD"] },
      STRIPE: { maxDelayedDays: 5, allowedMethods: ["CARD"] },
    },
    cardinalityConstraints: {
      allowManyToOne: true,
      allowOneToMany: true,
      allowManyToMany: true,
      maxGroupSize: 10,
    },
  };
}

export async function POST(req: NextRequest) {
  const rateLimit = rateLimitGuard(req);
  if (!rateLimit.allowed && rateLimit.response) {
    return rateLimit.response;
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      policyOverrides?: {
        amountTolerancePaise?: number;
        toleranceWindowHours?: number;
        materialityThresholdPaise?: number;
        makerCheckerThresholdPaise?: number;
      };
    };

    const overrides = body.policyOverrides || {};

    const baselineRules = getBaselineRules();
    const effectiveRules: PolicyRules = {
      ...baselineRules,
      amountTolerancePaise:
        typeof overrides.amountTolerancePaise === "number"
          ? Math.max(0, Math.min(100000, overrides.amountTolerancePaise))
          : baselineRules.amountTolerancePaise,
      toleranceWindowHours:
        typeof overrides.toleranceWindowHours === "number"
          ? Math.max(1, Math.min(720, overrides.toleranceWindowHours))
          : baselineRules.toleranceWindowHours,
      materialityThresholdPaise:
        typeof overrides.materialityThresholdPaise === "number"
          ? Math.max(100, overrides.materialityThresholdPaise)
          : baselineRules.materialityThresholdPaise,
      makerCheckerThresholdPaise:
        typeof overrides.makerCheckerThresholdPaise === "number"
          ? Math.max(1000, overrides.makerCheckerThresholdPaise)
          : baselineRules.makerCheckerThresholdPaise,
    };

    const baselinePolicy: ReconciliationPolicy = {
      policyId: "policy_standard_baseline",
      version: "1.0.0",
      status: "ACTIVE",
      createdBy: "system_default",
      createdAt: new Date("2026-01-01"),
      providerScope: ["*"],
      currencyScope: ["INR"],
      rules: baselineRules,
      contentHash: computePolicyContentHash(baselineRules),
    };

    const effectivePolicy: ReconciliationPolicy = {
      policyId: "policy_simulated_override",
      version: "1.1.0-sim",
      status: "SHADOW",
      createdBy: "policy_playground_user",
      createdAt: new Date(),
      providerScope: ["*"],
      currencyScope: ["INR"],
      rules: effectiveRules,
      contentHash: computePolicyContentHash(effectiveRules),
    };

    const evaluatedRecords = SAMPLE_PLAYGROUND_RECORDS.map((rec) => {
      const baseResult = evaluatePolicy(baselinePolicy, {
        amountPaise: rec.grossAmountPaise,
        discrepancyPaise: rec.discrepancyPaise,
        timeDeltaHours: rec.timeDeltaHours,
        provider: rec.provider,
        paymentMethod: rec.method,
      });

      const effectiveResult = evaluatePolicy(effectivePolicy, {
        amountPaise: rec.grossAmountPaise,
        discrepancyPaise: rec.discrepancyPaise,
        timeDeltaHours: rec.timeDeltaHours,
        provider: rec.provider,
        paymentMethod: rec.method,
      });

      const statusChanged = baseResult.decision !== effectiveResult.decision;

      return {
        ...rec,
        baselineDecision: baseResult.decision,
        baselineRisk: baseResult.riskLevel,
        effectiveDecision: effectiveResult.decision,
        effectiveRisk: effectiveResult.riskLevel,
        effectiveConfidence: effectiveResult.confidenceScore,
        requiresMakerChecker: effectiveResult.requiresMakerChecker,
        statusChanged,
        matchedRules: effectiveResult.matchedRules,
        reasons: effectiveResult.reasons,
      };
    });

    const total = evaluatedRecords.length;
    const autoMatched = evaluatedRecords.filter((r) => r.effectiveDecision === "AUTO_MATCH").length;
    const suggested = evaluatedRecords.filter((r) => r.effectiveDecision === "SUGGESTED_MATCH").length;
    const exceptions = evaluatedRecords.filter((r) => r.effectiveDecision === "EXCEPTION").length;
    const reclassifiedCount = evaluatedRecords.filter((r) => r.statusChanged).length;

    const baseAutoMatched = evaluatedRecords.filter((r) => r.baselineDecision === "AUTO_MATCH").length;
    const baseExceptions = evaluatedRecords.filter((r) => r.baselineDecision === "EXCEPTION").length;

    const responsePayload = {
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        totalRecords: total,
        autoMatched,
        suggestedMatches: suggested,
        exceptions,
        matchRatePct: Number(((autoMatched / total) * 100).toFixed(1)),
        reclassifiedCount,
        baselineAutoMatched: baseAutoMatched,
        baselineExceptions: baseExceptions,
        netMatchRateDeltaPct: Number((((autoMatched - baseAutoMatched) / total) * 100).toFixed(1)),
      },
      effectiveRules: {
        amountTolerancePaise: effectiveRules.amountTolerancePaise,
        amountToleranceFormatted: `₹${(effectiveRules.amountTolerancePaise / 100).toFixed(2)}`,
        toleranceWindowHours: effectiveRules.toleranceWindowHours,
        materialityThresholdPaise: effectiveRules.materialityThresholdPaise,
        makerCheckerThresholdPaise: effectiveRules.makerCheckerThresholdPaise,
        policyContentHash: effectivePolicy.contentHash,
      },
      records: evaluatedRecords,
    };

    const res = NextResponse.json(responsePayload, { status: 200 });
    return applySecurityHeaders(res);
  } catch (err) {
    // safeErrorResponse masks 5xx detail; the raw message leaked policy-evaluator
    // internals to the caller.
    return safeErrorResponse(err, 500, "POLICY_RUN_ERROR");
  }
}
