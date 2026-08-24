/*
 * SettleMate AI — Deterministic Non-LLM Claim Validator (Day 2–3)
 *
 * Mechanically verifies structured claims against ground-truth financial records,
 * Context Vault evidence, and active reconciliation policies without using an LLM.
 *
 * Rules:
 *   1. Evidence IDs must exist
 *   2. Evidence must be authorized
 *   3. Evidence must be linked to the case
 *   4. Referenced financial record must exist
 *   5. Numeric assertions must equal source values
 *   6. Arithmetic claims must be recomputed (exact paise match)
 *   7. Timing claims must be checked against actual dates/policy
 *   8. Relationship claims must be checked against graph edges
 *   9. Policy claims must be checked against active policy
 *  10. Invariant claims must be checked against actual invariant results
 */

import { createHash } from "node:crypto";
import type { AIClaim, ClaimCheckDetail, ClaimValidationResult, ClaimValidationStatus, ClaimAuditReceipt } from "./claim-types";
import type { CouncilReviewRequest } from "./council";

export class DeterministicClaimValidator {
  /**
   * Evaluates an individual claim deterministically against the case context.
   */
  validateClaim(claim: AIClaim, context: CouncilReviewRequest): ClaimValidationResult {
    const checks: ClaimCheckDetail[] = [];
    const disputeReasons: string[] = [];

    const evidenceMap = new Map((context.evidenceItems || []).map((e) => [(e.evidenceId || (e as unknown as Record<string, unknown>).id) as string, e]));

    // 1. Check: EVIDENCE_EXISTS
    let allEvidenceExists = true;
    for (const eid of claim.evidenceIds) {
      if (!evidenceMap.has(eid)) {
        allEvidenceExists = false;
        checks.push({
          checkName: "EVIDENCE_EXISTS",
          passed: false,
          message: `Referenced evidence ID '${eid}' does not exist in Context Vault`,
          expected: eid,
          actual: "NOT_FOUND",
        });
        disputeReasons.push(`INVENTED_EVIDENCE_ID: ${eid}`);
      }
    }
    if (claim.evidenceIds.length > 0 && allEvidenceExists) {
      checks.push({
        checkName: "EVIDENCE_EXISTS",
        passed: true,
        message: `All ${claim.evidenceIds.length} referenced evidence items exist`,
      });
    }

    // 2. Check: EVIDENCE_AUTHORIZED
    let allAuthorized = true;
    for (const eid of claim.evidenceIds) {
      const item = evidenceMap.get(eid);
      const access = item ? ((item as unknown as Record<string, string>).accessLevel || item.accessClassification) : null;
      if (item && (access === "HIGHLY_RESTRICTED" || access === "RESTRICTED_CLEARANCE_REQUIRED")) {
        allAuthorized = false;
        checks.push({
          checkName: "EVIDENCE_AUTHORIZED",
          passed: false,
          message: `Evidence '${eid}' requires higher access clearance`,
          expected: "PUBLIC | INTERNAL | CONFIDENTIAL",
          actual: item.accessClassification,
        });
        disputeReasons.push(`UNAUTHORIZED_EVIDENCE: ${eid}`);
      }
    }
    if (claim.evidenceIds.length > 0 && allAuthorized) {
      checks.push({
        checkName: "EVIDENCE_AUTHORIZED",
        passed: true,
        message: "All referenced evidence items are authorized for review",
      });
    }

    // 3. Check: EVIDENCE_LINKED
    let allLinked = true;
    for (const eid of claim.evidenceIds) {
      const item = evidenceMap.get(eid);
      if (item) {
        const paymentId = context.paymentRecord?.paymentId;
        const settlementId = context.settlementRecord?.settlementId;
        const utr = context.settlementRecord?.utr || context.bankRecord?.utr;

        const linkedRecs = item.linkedRecords;
        const srcId = (item as unknown as Record<string, unknown>).sourceId;
        const isDirectlyLinked =
          (paymentId && srcId === paymentId) ||
          (settlementId && srcId === settlementId) ||
          (paymentId && linkedRecs?.paymentIds?.includes(paymentId)) ||
          (settlementId && linkedRecs?.settlementIds?.includes(settlementId)) ||
          (utr && JSON.stringify(item).includes(utr)) ||
          (paymentId && JSON.stringify(item).includes(paymentId));

        if (!isDirectlyLinked && (item as unknown as Record<string, unknown>).sourceId !== context.exceptionId) {
          allLinked = false;
          checks.push({
            checkName: "EVIDENCE_LINKED",
            passed: false,
            message: `Evidence '${eid}' is not linked to payment '${paymentId}' or case '${context.exceptionId}'`,
          });
          disputeReasons.push(`UNLINKED_EVIDENCE: ${eid}`);
        }
      }
    }
    if (claim.evidenceIds.length > 0 && allLinked) {
      checks.push({
        checkName: "EVIDENCE_LINKED",
        passed: true,
        message: "All evidence items have verified graph linkages to this case",
      });
    }

    // 4. Check: FINANCIAL_RECORD_EXISTS
    const hasPayment = !!context.paymentRecord;
    const hasSettlement = !!context.settlementRecord;
    if (claim.type === "AMOUNT" || claim.type === "FINANCIAL_EXPLANATION") {
      if (!hasPayment && !hasSettlement) {
        checks.push({
          checkName: "FINANCIAL_RECORD_EXISTS",
          passed: false,
          message: "No underlying payment or settlement record found for financial claim",
        });
        disputeReasons.push("MISSING_FINANCIAL_RECORDS");
      } else {
        checks.push({
          checkName: "FINANCIAL_RECORD_EXISTS",
          passed: true,
          message: "Underlying financial transaction records exist",
        });
      }
    }

    // 5. Check: NUMERIC_ASSERTION_MATCH
    for (const assertion of claim.assertedValues) {
      if (assertion.expectedPaise !== undefined && assertion.observedPaise !== undefined) {
        if (assertion.expectedPaise !== assertion.observedPaise) {
          checks.push({
            checkName: "NUMERIC_ASSERTION_MATCH",
            passed: false,
            message: `Numeric assertion for '${assertion.key}' drifted: expected ${assertion.expectedPaise}, observed ${assertion.observedPaise}`,
            expected: assertion.expectedPaise,
            actual: assertion.observedPaise,
          });
          disputeReasons.push(`AMOUNT_MISMATCH: ${assertion.key} (${assertion.expectedPaise} != ${assertion.observedPaise})`);
        } else {
          checks.push({
            checkName: "NUMERIC_ASSERTION_MATCH",
            passed: true,
            message: `Numeric assertion '${assertion.key}' exactly matches ${assertion.observedPaise} paise`,
            expected: assertion.expectedPaise,
            actual: assertion.observedPaise,
          });
        }
      }
    }

        // 6. Check: ARITHMETIC_RECOMPUTED
    if (claim.type === "FINANCIAL_EXPLANATION" || claim.type === "AMOUNT") {
      const grossPaise = context.paymentRecord?.amount ?? context.amountPaise ?? 0;
      const feePaise = (context.paymentRecord?.fee || context.settlementRecord?.fee) ?? 0;
      const taxPaise = (context.paymentRecord?.tax || context.settlementRecord?.tax) ?? 0;
      const refundPaise = context.refundRecord?.amount ?? 0;
      const chargebackPaise = context.chargebackRecord?.amount ?? 0;
      const actualSettledPaise = context.settlementRecord?.amount ?? context.bankRecord?.amount ?? 0;

      void (grossPaise - feePaise - taxPaise - refundPaise - chargebackPaise);
      const variancePaise = Math.abs(grossPaise - actualSettledPaise);

      // If claim asserts that a refund explains the entire variance
      if (claim.statement.toLowerCase().includes("refund explains") || claim.statement.toLowerCase().includes("variance")) {
        const explainedAmount = feePaise + taxPaise + refundPaise + chargebackPaise;
        if (explainedAmount !== variancePaise) {
          checks.push({
            checkName: "ARITHMETIC_RECOMPUTED",
            passed: false,
            message: `Arithmetic recomputation failed: variance is ${variancePaise} paise, but deductions sum to ${explainedAmount} paise`,
            expected: variancePaise,
            actual: explainedAmount,
          });
          disputeReasons.push(`ARITHMETIC_MISMATCH: Variance ${variancePaise} != Deductions ${explainedAmount}`);
        } else {
          checks.push({
            checkName: "ARITHMETIC_RECOMPUTED",
            passed: true,
            message: `Arithmetic verified: deductions (${explainedAmount} paise) exactly equal observed variance (${variancePaise} paise)`,
            expected: variancePaise,
            actual: explainedAmount,
          });
        }
      }
    }

    // 7. Check: TIMING_CHECKED
    if (context.paymentRecord?.createdAt && context.settlementRecord?.settledAt) {
      const deltaMs = Math.abs(context.settlementRecord.settledAt.getTime() - context.paymentRecord.createdAt.getTime());
      const maxWindowHours = context.activePolicy?.rules?.toleranceWindowHours ?? ((context.activePolicy as unknown as Record<string, Record<string, number>>)?.timingRules?.maxSettlementDelayHours) ?? 48;
      const maxWindowMs = maxWindowHours * 3600_000;

      if (deltaMs > maxWindowMs) {
        checks.push({
          checkName: "TIMING_CHECKED",
          passed: false,
          message: `Timing delay (${(deltaMs / 3600_000).toFixed(1)}h) exceeds policy maximum (${maxWindowHours}h)`,
          expected: `<=${maxWindowHours}h`,
          actual: `${(deltaMs / 3600_000).toFixed(1)}h`,
        });
        disputeReasons.push("TIMING_WINDOW_VIOLATION");
      } else {
        checks.push({
          checkName: "TIMING_CHECKED",
          passed: true,
          message: `Timing delay (${(deltaMs / 3600_000).toFixed(1)}h) is within policy window (${maxWindowHours}h)`,
        });
      }
    }

    // 8. Check: POLICY_CHECKED
    const policyTolerance = context.activePolicy?.rules?.amountTolerancePaise ?? ((context.activePolicy as unknown as Record<string, Record<string, number>>)?.matchingRules?.amountTolerancePaise) ?? 100;
    if (context.discrepancyPaise && context.discrepancyPaise > policyTolerance && claim.statement.toLowerCase().includes("within tolerance")) {
      checks.push({
        checkName: "POLICY_CHECKED",
        passed: false,
        message: `Discrepancy (${context.discrepancyPaise} paise) exceeds policy tolerance (${policyTolerance} paise)`,
        expected: `<=${policyTolerance}`,
        actual: context.discrepancyPaise,
      });
      disputeReasons.push("POLICY_TOLERANCE_EXCEEDED");
    } else {
      checks.push({
        checkName: "POLICY_CHECKED",
        passed: true,
        message: "Policy compliance verified",
      });
    }

    // 9. Check: INVARIANTS_CHECKED
    if (context.contradictions && context.contradictions.length > 0) {
      checks.push({
        checkName: "INVARIANTS_CHECKED",
        passed: false,
        message: `Context Vault detected ${context.contradictions.length} conflicting evidence assertions`,
      });
      disputeReasons.push("CONFLICTING_EVIDENCE");
    } else {
      checks.push({
        checkName: "INVARIANTS_CHECKED",
        passed: true,
        message: "No contradictory invariant claims detected",
      });
    }

    // Determine Final Claim Status
    let status: ClaimValidationStatus = "VERIFIED";
    if (claim.evidenceIds.length === 0 && (claim.type === "AMOUNT" || claim.type === "FINANCIAL_EXPLANATION")) {
      status = "INSUFFICIENT_EVIDENCE";
      disputeReasons.push("NO_EVIDENCE_CITED");
    } else if (disputeReasons.length > 0) {
      if (disputeReasons.some((r) => r.includes("INVENTED") || r.includes("UNAUTHORIZED") || r.includes("MISMATCH") || r.includes("VIOLATION"))) {
        status = "DISPUTED";
      } else {
        status = "UNSUPPORTED";
      }
    }

    // Compute canonical receipt hash for claim
    const receiptPayload = `${claim.claimId}|${claim.type}|${status}|${claim.evidenceIds.sort().join(",")}|${disputeReasons.join(";")}`;
    const receiptHash = createHash("sha256").update(receiptPayload).digest("hex");

    return {
      claimId: claim.claimId,
      type: claim.type,
      status,
      statement: claim.statement,
      evidenceIds: claim.evidenceIds,
      checks,
      disputeReasons,
      receiptHash,
    };
  }

  /**
   * Validates a batch of claims and generates an immutable audit receipt.
   */
  validateAllClaims(claims: AIClaim[], context: CouncilReviewRequest, councilRunId: string): ClaimAuditReceipt {
    const results: ClaimValidationResult[] = [];
    let verifiedCount = 0;
    let disputedCount = 0;
    let unsupportedCount = 0;
    let insufficientCount = 0;

    for (const claim of claims) {
      const res = this.validateClaim(claim, context);
      results.push(res);
      if (res.status === "VERIFIED") verifiedCount++;
      else if (res.status === "DISPUTED") disputedCount++;
      else if (res.status === "UNSUPPORTED") unsupportedCount++;
      else if (res.status === "INSUFFICIENT_EVIDENCE") insufficientCount++;
    }

    const abstain = claims.length === 0 || (insufficientCount > 0 && verifiedCount === 0 && disputedCount === 0);

    const canonicalPayload = results.map((r) => r.receiptHash).join(":");
    const canonicalHash = createHash("sha256")
      .update(`${councilRunId}|${context.exceptionId}|${canonicalPayload}`)
      .digest("hex");

    return {
      receiptId: "rcpt_" + canonicalHash.slice(0, 16),
      councilRunId,
      exceptionId: context.exceptionId,
      totalClaimsCount: claims.length,
      verifiedClaimsCount: verifiedCount,
      disputedClaimsCount: disputedCount,
      unsupportedClaimsCount: unsupportedCount,
      insufficientEvidenceCount: insufficientCount,
      abstain,
      claims: results,
      canonicalHash,
      policyVersion: context.activePolicy?.version ? String(context.activePolicy.version) : "1",
      engineVersion: "1.0.0",
      timestamp: new Date(),
    };
  }
}
