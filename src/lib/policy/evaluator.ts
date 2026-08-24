/*
 * SettleMate AI — Deterministic Policy Evaluation Engine
 */

import type { PolicyEvaluationContext, PolicyEvaluationResult, ReconciliationPolicy } from "./types";

export function evaluatePolicy(
  policy: ReconciliationPolicy,
  context: PolicyEvaluationContext
): PolicyEvaluationResult {
  const matchedRules: string[] = [];
  const reasons: string[] = [];
  const rules = policy.rules;

  let baseConfidence = 100;
  let riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "LOW";
  let decision: "AUTO_MATCH" | "SUGGESTED_MATCH" | "EXCEPTION" = "AUTO_MATCH";
  let requiresMakerChecker = false;
  let requiresEscalation = false;

  const discrepancy = Math.abs(context.discrepancyPaise || 0);
  const timeDelta = Math.abs(context.timeDeltaHours || 0);

  // 1. Amount Tolerance Evaluation
  if (discrepancy > 0) {
    if (discrepancy <= rules.amountTolerancePaise) {
      matchedRules.push("RULE_TOLERATED_AMOUNT_VARIANCE");
      reasons.push("Discrepancy " + discrepancy + " paise within policy tolerance " + rules.amountTolerancePaise + " paise");
      baseConfidence -= 5;
    } else {
      matchedRules.push("RULE_EXCEEDED_AMOUNT_TOLERANCE");
      reasons.push("Discrepancy " + discrepancy + " paise exceeds tolerance " + rules.amountTolerancePaise + " paise");
      baseConfidence -= 35;
      decision = "EXCEPTION";
      riskLevel = "MEDIUM";
    }
  }

  // 2. Timing Window Evaluation
  if (timeDelta > rules.toleranceWindowHours) {
    matchedRules.push("RULE_EXCEEDED_TIMING_WINDOW");
    reasons.push("Delay " + timeDelta + "h exceeds settlement window " + rules.toleranceWindowHours + "h");
    baseConfidence -= 25;
    decision = "EXCEPTION";
    if (riskLevel === "LOW") riskLevel = "MEDIUM";
  }

  // 3. Provider-Specific Rules
  if (context.provider && rules.providerRules[context.provider]) {
    const provRule = rules.providerRules[context.provider]!;
    if (context.paymentMethod && !provRule.allowedMethods.includes(context.paymentMethod)) {
      matchedRules.push("RULE_UNSUPPORTED_PAYMENT_METHOD");
      reasons.push("Method " + context.paymentMethod + " not in allowed list for " + context.provider);
      baseConfidence -= 20;
    }
  }

  // 4. Materiality & High Risk Escalation
  if (discrepancy >= rules.materialityThresholdPaise) {
    matchedRules.push("RULE_MATERIAL_DISCREPANCY");
    reasons.push("Material discrepancy exceeds threshold ₹" + (rules.materialityThresholdPaise / 100));
    riskLevel = "HIGH";
    decision = "EXCEPTION";
  }

  // 5. Maker/Checker Threshold
  if (context.amountPaise >= rules.makerCheckerThresholdPaise || discrepancy >= (rules.makerCheckerThresholdPaise / 2)) {
    matchedRules.push("RULE_MAKER_CHECKER_TRIGGER");
    requiresMakerChecker = true;
  }

  // 6. Controller Escalation Threshold
  if (context.amountPaise >= rules.exceptionEscalationThresholdPaise || (discrepancy >= rules.materialityThresholdPaise * 2)) {
    matchedRules.push("RULE_CONTROLLER_ESCALATION_TRIGGER");
    requiresEscalation = true;
    riskLevel = "CRITICAL";
  }

  // 7. Decision Mapping from Confidence
  if (decision === "AUTO_MATCH" && baseConfidence < rules.confidenceThresholds.autoMatchMin) {
    decision = baseConfidence >= rules.confidenceThresholds.suggestedMatchMin ? "SUGGESTED_MATCH" : "EXCEPTION";
  }

  return {
    policyId: policy.policyId,
    policyVersion: policy.version,
    policyHash: policy.contentHash,
    matchedRules,
    confidenceScore: Math.max(0, Math.min(100, baseConfidence)),
    riskLevel,
    decision,
    requiresMakerChecker,
    requiresEscalation,
    reasons,
  };
}
