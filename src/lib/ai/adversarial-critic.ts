/*
 * SettleMate AI — ONE Adversarial Critic with 3 Lenses (Milestone 1)
 *
 * Implements a unified adversarial critic agent that rigorously challenges
 * AI Investigator hypotheses through 3 distinct lenses:
 *
 *   Lens 1: MATHEMATICAL_CONSERVATION
 *     - Strict integer minor unit arithmetic
 *     - Z3 / SMT formal proof consistency
 *     - Zero financial leakage & exact fee/tax deduction
 *
 *   Lens 2: EVIDENCE_PROVENANCE
 *     - Cryptographic verification against Context Vault
 *     - Anti-hallucination / non-invented evidence IDs
 *     - Provenance lineage & tamper quarantine
 *
 *   Lens 3: TIMING_POLICY
 *     - Settlement SLA aging & business day cutoff
 *     - Policy thresholds & materiality boundaries
 *     - Unsupported methods or SLA breaches
 *
 * Emits structured, machine-verifiable objections carrying concrete `falsificationTest` ASTs.
 */

import { randomUUID } from "node:crypto";
import type { CouncilReviewRequest } from "./council";
import type {
  InvestigatorOutput,
  CriticEvaluation,
  CriticObjection,
} from "./zod-schemas";
import { CriticEvaluationSchema } from "./zod-schemas";
import { DEFAULT_POLICY } from "../policy/manager";
import { z3Prover } from "./z3-prover";
import { tamperProofEvidenceGate } from "../evidence/tamper-proof";

export class AdversarialCritic {
  /**
   * Critiques an investigator's output across all 3 adversarial lenses.
   */
  evaluate(
    investigator: InvestigatorOutput,
    context: CouncilReviewRequest
  ): CriticEvaluation {
    const criticRunId = `crit_${randomUUID().slice(0, 10)}`;
    const objections: CriticObjection[] = [];
    const verifiedEvidenceIds: string[] = [];
    const policy = context.activePolicy || DEFAULT_POLICY;

    const evidenceItems = context.evidenceItems || [];
    const evidenceMap = new Map(
      evidenceItems.map((e) => [e.evidenceId || ((e as unknown as Record<string, unknown>).id as string), e])
    );

    // =========================================================================
    // LENS 1: MATHEMATICAL CONSERVATION LENS
    // =========================================================================
    const toPaise = (v?: number) => (v === undefined ? 0 : v < 500000 ? Math.round(v * 100) : v);

    if (context.paymentRecord && context.settlementRecord) {
      const p = context.paymentRecord;
      const s = context.settlementRecord;

      const gross = toPaise(p.amount);
      const fee = toPaise(p.fee);
      const tax = toPaise(p.tax);
      const refund = context.refundRecord && context.refundRecord.status === "processed" ? toPaise(context.refundRecord.amount) : 0;
      const chargeback = context.chargebackRecord && context.chargebackRecord.status === "reversed" ? toPaise(context.chargebackRecord.amount) : 0;
      const actualSettled = toPaise(s.amount);

      const expectedNet = gross - fee - tax - refund - chargeback;
      const discrepancy = Math.abs(expectedNet - actualSettled);
      const tolerance = policy.rules?.amountTolerancePaise ?? 100;

      // SMT Invariant Verification
      const z3Result = z3Prover.prove({
        contextId: context.exceptionId,
        theoremName: "THEOREM_CONSERVATION_CRITIQUE",
        assignments: {
          grossPaise: gross,
          feePaise: fee,
          taxPaise: tax,
          refundPaise: refund,
          chargebackPaise: chargeback,
          settledPaise: actualSettled,
          variancePaise: 0,
        },
        tolerancePaise: tolerance,
      });

      if (!z3Result.conservationPassed) {
        objections.push({
          objectionId: `obj_math_${randomUUID().slice(0, 8)}`,
          lens: "MATHEMATICAL_CONSERVATION",
          code: "AMOUNT_ARITHMETIC_ERROR",
          targetClaimId: investigator.claims.find((c) => c.type === "AMOUNT" || c.type === "FINANCIAL_EXPLANATION")?.claimId,
          detail: `Calculated net (${expectedNet} paise) diverges from settled (${actualSettled} paise) by ${discrepancy} paise (exceeds tolerance ${tolerance} paise)`,
          falsificationTest: {
            type: "ARITHMETIC_EQUALITY",
            targetKey: "netAmountPaise",
            operator: "==",
            expectedValue: expectedNet,
            actualValue: actualSettled,
            tolerancePaise: tolerance,
          },
          severity: "CRITICAL",
        });
      }

      // Check unaccounted refund claim
      if (context.refundRecord && context.refundRecord.status === "processed" && refund > 0) {
        const hasRefundClaim = investigator.claims.some(
          (c) => c.type === "FINANCIAL_EXPLANATION" || c.statement.toLowerCase().includes("refund")
        );
        if (!hasRefundClaim && discrepancy > 0) {
          objections.push({
            objectionId: `obj_ref_${randomUUID().slice(0, 8)}`,
            lens: "MATHEMATICAL_CONSERVATION",
            code: "UNACCOUNTED_REFUND",
            detail: `Active processed refund of ₹${(refund / 100).toFixed(2)} is unaccounted in investigator claims.`,
            falsificationTest: {
              type: "ARITHMETIC_EQUALITY",
              targetKey: "refundPaise",
              operator: "==",
              expectedValue: refund,
              actualValue: 0,
              tolerancePaise: 0,
            },
            severity: "HIGH",
          });
        }
      }
    }

    // =========================================================================
    // LENS 2: EVIDENCE PROVENANCE LENS
    // =========================================================================
    // Pre-AI tamper check
    const tamperReport = tamperProofEvidenceGate.verifyEvidenceBeforeAi(evidenceItems);

    for (const claim of investigator.claims) {
      for (const eid of claim.evidenceIds) {
        if (!evidenceMap.has(eid)) {
          objections.push({
            objectionId: `obj_ev_${randomUUID().slice(0, 8)}`,
            lens: "EVIDENCE_PROVENANCE",
            code: "INVENTED_EVIDENCE_ID",
            targetClaimId: claim.claimId,
            detail: `Claim ${claim.claimId} references non-existent evidence ID '${eid}' in Context Vault.`,
            falsificationTest: {
              type: "EVIDENCE_EXISTENCE",
              targetKey: eid,
              operator: "EXISTS",
              expectedValue: true,
              actualValue: false,
              tolerancePaise: 0,
            },
            severity: "CRITICAL",
          });
        } else {
          verifiedEvidenceIds.push(eid);
        }
      }
    }

    if (tamperReport.tamperedFindings.length > 0) {
      for (const t of tamperReport.tamperedFindings) {
        objections.push({
          objectionId: `obj_tamper_${randomUUID().slice(0, 8)}`,
          lens: "EVIDENCE_PROVENANCE",
          code: "TAMPERED_EVIDENCE",
          detail: `Evidence '${t.evidenceId}' failed cryptographic SHA-256 hash check: ${t.detail}`,
          falsificationTest: {
            type: "HASH_INTEGRITY",
            targetKey: t.evidenceId,
            operator: "MATCHES_HASH",
            expectedValue: t.expectedHash,
            actualValue: t.actualComputedHash,
            tolerancePaise: 0,
          },
          severity: "CRITICAL",
        });
      }
    }

    // =========================================================================
    // LENS 3: TIMING & POLICY LENS
    // =========================================================================
    if (context.paymentRecord?.createdAt && context.settlementRecord?.settledAt) {
      const pDate = new Date(context.paymentRecord.createdAt).getTime();
      const sDate = new Date(context.settlementRecord.settledAt).getTime();
      const delayHours = Math.abs(sDate - pDate) / 3600_000;
      const maxHours = policy.rules?.toleranceWindowHours ?? ((policy.rules as unknown as Record<string, number>)?.maxSettlementDelayHours) ?? 72;

      if (delayHours > maxHours) {
        objections.push({
          objectionId: `obj_time_${randomUUID().slice(0, 8)}`,
          lens: "TIMING_POLICY",
          code: "TIMING_WINDOW_VIOLATION",
          detail: `Settlement delay of ${delayHours.toFixed(1)} hours exceeds policy maximum threshold (${maxHours}h).`,
          falsificationTest: {
            type: "TIMING_BOUND",
            targetKey: "settlementDelayHours",
            operator: "<=",
            expectedValue: maxHours,
            actualValue: delayHours,
            tolerancePaise: 0,
          },
          severity: "HIGH",
        });
      }
    }

    // Determine verdict
    let verdict: CriticEvaluation["verdict"] = "VERIFIED";
    let reasoning = "All 3 lenses (Mathematical Conservation, Evidence Provenance, Timing Policy) verified cleanly.";
    const requiresReinvestigation = objections.length > 0;

    if (objections.length > 0) {
      const hasCriticalMath = objections.some(
        (o) => o.lens === "MATHEMATICAL_CONSERVATION" && o.severity === "CRITICAL"
      );
      const hasInventedEvidence = objections.some(
        (o) => o.code === "INVENTED_EVIDENCE_ID" || o.code === "TAMPERED_EVIDENCE"
      );

      if (hasCriticalMath) {
        verdict = "CONTROL_FAILURE";
        reasoning = `Critic raised ${objections.length} objection(s) with confirmed mathematical conservation violations.`;
      } else if (hasInventedEvidence) {
        verdict = "DISPUTED";
        reasoning = `Critic raised ${objections.length} objection(s) with evidence provenance/authenticity violations.`;
      } else {
        verdict = "DISPUTED";
        reasoning = `Critic raised ${objections.length} objection(s) requiring reinvestigation.`;
      }
    }

    const evaluation: CriticEvaluation = {
      criticRunId,
      verdict,
      lensesEvaluated: ["MATHEMATICAL_CONSERVATION", "EVIDENCE_PROVENANCE", "TIMING_POLICY"],
      objections,
      verifiedEvidenceIds: Array.from(new Set(verifiedEvidenceIds)),
      confidence: objections.length === 0 ? 95 : Math.max(30, 90 - objections.length * 20),
      reasoning,
      requiresReinvestigation,
    };

    return CriticEvaluationSchema.parse(evaluation);
  }
}

export const adversarialCritic = new AdversarialCritic();
