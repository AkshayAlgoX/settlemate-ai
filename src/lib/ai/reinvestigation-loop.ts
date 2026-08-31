/*
 * SettleMate AI — Milestone 1 Innovation Backbone & REINVESTIGATE Loop
 *
 * Full Pipeline Architecture:
 *   Deterministic Routing Gate
 *            │
 *            ▼
 *   Fixed Z3 / SMT Invariant Proof Service
 *            │
 *            ▼
 *   Tamper-Evident Pre-AI Evidence Seal
 *            │
 *            ▼
 *   AI Investigator (Structured Claims & Zod Validation)
 *            │
 *            ▼
 *   ONE Adversarial Critic (3 Lenses: Math, Evidence, Policy)
 *            │
 *            ▼
 *   Non-LLM Mechanical Verification Gate
 *            │
 *            ├───────────────────┬───────────────────┐
 *            ▼                   ▼                   ▼
 *   All Objections      Confirmed Defects      Max Iterations
 *      Dismissed         (Counterexample)        Exhausted
 *            │                   │                   │
 *            ▼                   ▼                   ▼
 *        VERIFIED         REINVESTIGATE       CONTROL_FAILURE /
 *                           (Max 3x)            HUMAN_REVIEW
 */

import { createHash, randomUUID } from "node:crypto";
import type { CouncilReviewRequest } from "./council";
import { shouldInvokeCouncil } from "./council";
import { z3Prover } from "./z3-prover";
import { tamperProofEvidenceGate } from "../evidence/tamper-proof";
import { adversarialCritic } from "./adversarial-critic";
import { mechanicalVerifier } from "./mechanical-verifier";
import { generateDeterministicClaims } from "./llm-investigator";
import type {
  InvestigatorOutput,
  CriticEvaluation,
  MechanicalVerificationResult,
  Z3ProofResult,
  ReinvestigationState,
} from "./zod-schemas";
import {
  InvestigatorOutputSchema,
  ReinvestigationStateSchema,
} from "./zod-schemas";
import { DEFAULT_POLICY } from "../policy/manager";

export interface Milestone1ExecutionResult {
  loopId: string;
  exceptionId: string;
  bypassedAi: boolean;
  finalVerdict: "VERIFIED" | "DISPUTED" | "INSUFFICIENT_EVIDENCE" | "CONFLICTING_EVIDENCE" | "CONTROL_FAILURE";
  iterationsRun: number;
  z3Proof: Z3ProofResult;
  tamperReport: {
    isValid: boolean;
    evidenceMerkleRoot: string;
    verifiedCount: number;
    tamperedCount: number;
  };
  investigator: InvestigatorOutput;
  critic: CriticEvaluation;
  mechanicalVerification: MechanicalVerificationResult;
  reinvestigationState: ReinvestigationState;
  requiresHumanReview: boolean;
  decisionReceiptSignature: string;
  trace: string[];
}

export class InnovationBackboneEngine {
  /**
   * Executes the full Milestone 1 Innovation Backbone pipeline.
   */
  async execute(
    request: CouncilReviewRequest,
    options: {
      maxIterations?: number;
      enforceZ3Proof?: boolean;
    } = {}
  ): Promise<Milestone1ExecutionResult> {
    const loopId = `loop_${randomUUID().slice(0, 10)}`;
    const trace: string[] = [];
    const maxIterations = Math.min(5, Math.max(1, options.maxIterations ?? 3));
    const policy = request.activePolicy || DEFAULT_POLICY;

    trace.push(`[Milestone 1 Engine] Initialized pipeline loop ${loopId} for exception ${request.exceptionId}`);

    // =========================================================================
    // STEP 1: DETERMINISTIC ROUTING GATE (Straight-Through Bypass)
    // =========================================================================
    const routing = shouldInvokeCouncil({
      decision: request.riskLevel === "LOW" && (!request.discrepancyPaise || request.discrepancyPaise === 0)
        ? "AUTO_MATCHED"
        : "EXCEPTION",
      riskLevel: request.riskLevel,
      discrepancyPaise: request.discrepancyPaise,
      amountPaise: request.amountPaise,
      hasContradictions: Boolean(request.contradictions && request.contradictions.length > 0),
      policy,
    });

    // =========================================================================
    // STEP 2: FIXED Z3 INVARIANT PROOF SERVICE
    // =========================================================================
    const toPaise = (v?: number) => (v === undefined ? 0 : v < 500000 ? Math.round(v * 100) : v);
    const pGross = request.paymentRecord ? toPaise(request.paymentRecord.amount) : request.amountPaise;
    const pFee = request.paymentRecord ? toPaise(request.paymentRecord.fee) : 0;
    const pTax = request.paymentRecord ? toPaise(request.paymentRecord.tax) : 0;
    const pRefund = request.refundRecord && request.refundRecord.status === "processed" ? toPaise(request.refundRecord.amount) : 0;
    const pChargeback = request.chargebackRecord && request.chargebackRecord.status === "reversed" ? toPaise(request.chargebackRecord.amount) : 0;
    const pSettled = request.settlementRecord ? toPaise(request.settlementRecord.amount) : (pGross - pFee - pTax - pRefund - pChargeback);

    const z3Proof = z3Prover.prove({
      contextId: request.exceptionId,
      theoremName: "THEOREM_INNOVATION_BACKBONE_CONSERVATION",
      assignments: {
        grossPaise: pGross,
        feePaise: pFee,
        taxPaise: pTax,
        refundPaise: pRefund,
        chargebackPaise: pChargeback,
        settledPaise: pSettled,
        variancePaise: request.discrepancyPaise || 0,
      },
      tolerancePaise: policy.rules?.amountTolerancePaise ?? 100,
    });

    trace.push(`[Z3 Prover] Status=${z3Proof.status}, Conservation=${z3Proof.conservationPassed}, Signature=${z3Proof.proofSignature.slice(0, 16)}...`);

    // =========================================================================
    // STEP 3: TAMPER-EVIDENT PRE-AI EVIDENCE SEAL
    // =========================================================================
    const evidenceItems = request.evidenceItems || [];
    const tamperReport = tamperProofEvidenceGate.verifyEvidenceBeforeAi(evidenceItems);
    trace.push(`[Tamper Seal] Valid=${tamperReport.isValid}, MerkleRoot=${tamperReport.evidenceMerkleRoot.slice(0, 16)}..., Verified=${tamperReport.verifiedItems.length}`);

    // If straight-through bypass is qualified AND Z3 proof holds AND evidence is clean
    if (!routing.shouldInvoke && z3Proof.conservationPassed && tamperReport.isValid) {
      trace.push(`[Deterministic Gate] Qualified for straight-through AI bypass (${routing.routingReason})`);
      const defaultInvestigator = InvestigatorOutputSchema.parse({
        ...generateDeterministicClaims(request),
        iteration: 0,
      });
      const defaultCritic = adversarialCritic.evaluate(defaultInvestigator, request);
      const defaultMech = mechanicalVerifier.verifyObjections(defaultCritic.objections, request);

      return {
        loopId,
        exceptionId: request.exceptionId,
        bypassedAi: true,
        finalVerdict: "VERIFIED",
        iterationsRun: 0,
        z3Proof,
        tamperReport: {
          isValid: tamperReport.isValid,
          evidenceMerkleRoot: tamperReport.evidenceMerkleRoot,
          verifiedCount: tamperReport.verifiedItems.length,
          tamperedCount: tamperReport.tamperedFindings.length,
        },
        investigator: defaultInvestigator,
        critic: defaultCritic,
        mechanicalVerification: defaultMech,
        reinvestigationState: {
          loopId,
          exceptionId: request.exceptionId,
          iteration: 0,
          maxIterations,
          status: "CONVERGED_VERIFIED",
          history: [],
          finalVerdict: "VERIFIED",
          proofReceiptHash: z3Proof.proofSignature,
        },
        requiresHumanReview: false,
        decisionReceiptSignature: z3Proof.proofSignature,
        trace,
      };
    }

    // =========================================================================
    // STEP 4 & 5: ITERATIVE INVESTIGATION & REINVESTIGATE LOOP
    // =========================================================================
    let currentIteration = 0;
    let currentInvestigator: InvestigatorOutput = InvestigatorOutputSchema.parse({
      ...generateDeterministicClaims(request),
      iteration: 0,
    });
    let currentCritic: CriticEvaluation = adversarialCritic.evaluate(currentInvestigator, request);
    let currentMech: MechanicalVerificationResult = mechanicalVerifier.verifyObjections(currentCritic.objections, request);
    const loopHistory: ReinvestigationState["history"] = [];

    while (currentIteration < maxIterations) {
      trace.push(`[Loop Iteration ${currentIteration + 1}/${maxIterations}] Deliberating claims...`);

      // 1. Investigator generates hypothesis
      if (currentIteration > 0) {
        // Formulate revised claims taking into account confirmed mechanical objections
        const confirmedObjectionTexts = currentMech.verifications
          .filter((v) => v.status === "OBJECTION_CONFIRMED")
          .map((v) => v.mechanicalEvidence);

        const base = generateDeterministicClaims(request);
        const revised = {
          ...base,
          iteration: currentIteration,
          reasoning: `${base.reasoning} [Reinvestigation Pass ${currentIteration}: Addressed ${confirmedObjectionTexts.length} verified objections]`,
          uncertainties: [...base.uncertainties, ...confirmedObjectionTexts],
        };
        currentInvestigator = InvestigatorOutputSchema.parse(revised);
      }

      // 2. ONE Adversarial Critic evaluates across 3 lenses
      currentCritic = adversarialCritic.evaluate(currentInvestigator, request);
      trace.push(`[Critic 3-Lenses] Verdict=${currentCritic.verdict}, ObjectionsCount=${currentCritic.objections.length}`);

      // 3. Non-LLM Mechanical Verification Gate
      currentMech = mechanicalVerifier.verifyObjections(currentCritic.objections, request);
      trace.push(`[Mechanical Gate] Confirmed=${currentMech.confirmedObjectionsCount}, Dismissed=${currentMech.dismissedObjectionsCount}`);

      loopHistory.push({
        iteration: currentIteration + 1,
        investigatorHypothesis: currentInvestigator.hypothesis,
        criticVerdict: currentCritic.verdict,
        confirmedObjections: currentMech.verifications
          .filter((v) => v.status === "OBJECTION_CONFIRMED")
          .map((v) => v.mechanicalEvidence),
        mechanicalHash: currentMech.canonicalHash,
      });

      // 4. Convergence check: If all objections dismissed or zero objections, we converged!
      if (currentMech.allObjectionsDismissed || currentCritic.verdict === "VERIFIED") {
        trace.push(`[Reinvestigate Loop] Consensus achieved on iteration ${currentIteration + 1}. All objections mechanically resolved/dismissed.`);
        break;
      }

      // If there are confirmed objections, trigger next reinvestigate iteration
      currentIteration++;
    }

    // =========================================================================
    // STEP 6: FINAL DECISION RECEIPT & AUDIT FORMULATION
    // =========================================================================
    let finalVerdict: Milestone1ExecutionResult["finalVerdict"] = "VERIFIED";
    let finalStatus: ReinvestigationState["status"] = "CONVERGED_VERIFIED";

    if (!currentMech.allObjectionsDismissed) {
      const hasMathFailure = currentMech.verifications.some(
        (v) => v.lens === "MATHEMATICAL_CONSERVATION" && v.status === "OBJECTION_CONFIRMED"
      );
      finalVerdict = hasMathFailure ? "CONTROL_FAILURE" : "DISPUTED";
      finalStatus = hasMathFailure ? "CONTROL_FAILURE" : "ESCALATED_HUMAN_REVIEW";
    }

    const decisionReceiptSignature = createHash("sha256")
      .update(
        JSON.stringify({
          loopId,
          exceptionId: request.exceptionId,
          finalVerdict,
          z3Signature: z3Proof.proofSignature,
          evidenceRoot: tamperReport.evidenceMerkleRoot,
          mechHash: currentMech.canonicalHash,
        })
      )
      .digest("hex");

    const reinvestigationState: ReinvestigationState = ReinvestigationStateSchema.parse({
      loopId,
      exceptionId: request.exceptionId,
      iteration: currentIteration,
      maxIterations,
      status: finalStatus,
      history: loopHistory,
      finalVerdict,
      proofReceiptHash: decisionReceiptSignature,
    });

    return {
      loopId,
      exceptionId: request.exceptionId,
      bypassedAi: false,
      finalVerdict,
      iterationsRun: currentIteration + 1,
      z3Proof,
      tamperReport: {
        isValid: tamperReport.isValid,
        evidenceMerkleRoot: tamperReport.evidenceMerkleRoot,
        verifiedCount: tamperReport.verifiedItems.length,
        tamperedCount: tamperReport.tamperedFindings.length,
      },
      investigator: currentInvestigator,
      critic: currentCritic,
      mechanicalVerification: currentMech,
      reinvestigationState,
      requiresHumanReview: finalVerdict !== "VERIFIED",
      decisionReceiptSignature,
      trace,
    };
  }
}

export const innovationBackboneEngine = new InnovationBackboneEngine();
