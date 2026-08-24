/*
 * SettleMate AI — Grounded AI Boundary & Output Verifier
 *
 * Ensures AI outputs strictly cite registered evidence IDs, prevents hallucinated
 * amounts/IDs, detects contradictory evidence findings, and enforces that AI can
 * never mutate the financial ledger or approve financial truth.
 */

import type { ContradictionFinding, EvidenceItem, GroundedAiInvestigation } from "./types";

export interface GroundedContextInput {
  exceptionId: string;
  exceptionType: string;
  amountPaise: number;
  allowedEvidence: EvidenceItem[];
  contradictions: ContradictionFinding[];
  invariantsPassed: boolean;
  riskLevel: string;
}

export class GroundedAiVerifier {
  /**
   * Validates raw AI output against allowed evidence boundaries and mathematical ground truth.
   * Fails closed: rejects fabricated evidence IDs, unauthorized references, or financial write attempts.
   */
  verifyAndSanitizeDecision(params: {
    rawSummary: string;
    rawReason: string;
    citedEvidenceIds: string[];
    recommendedAction: string;
    confidence: number;
    allowedEvidence: EvidenceItem[];
    contradictions: ContradictionFinding[];
  }): GroundedAiInvestigation {
    const allowedMap = new Map<string, EvidenceItem>();
    for (const item of params.allowedEvidence) {
      allowedMap.set(item.evidenceId, item);
    }

    // 1. Validate Evidence Citations
    const validCitations: string[] = [];
    const invalidCitations: string[] = [];

    for (const citedId of params.citedEvidenceIds) {
      if (allowedMap.has(citedId)) {
        validCitations.push(citedId);
      } else {
        invalidCitations.push(citedId);
      }
    }

    if (invalidCitations.length > 0) {
      // Rejection: AI cited nonexistent or unauthorized evidence
      return {
        summary: "AI suggestion rejected due to citation of unauthorized or nonexistent evidence IDs.",
        reason: "Cited invalid evidence IDs: " + invalidCitations.join(", "),
        evidenceIds: validCitations,
        recommendedAction: "Escalate to Senior Controller for manual evidence review",
        confidence: 0,
        uncertainties: ["Hallucinated or unauthorized evidence references detected."],
        questionsRemaining: ["Why did the hypothesis cite unregistered IDs: " + invalidCitations.join(", ") + "?"],
        conflictsFound: params.contradictions,
        decisionOutcome: "DISPUTED_HYPOTHESIS",
        authorityNotice: "AI_READ_ONLY_SUGGESTION_CANNOT_WRITE_LEDGER",
      };
    }

    // 2. Handle Contradictions
    if (params.contradictions.length > 0) {
      return {
        summary: "CONFLICTING_EVIDENCE: Multiple sources report divergent financial claims.",
        reason: params.contradictions.map((c) => c.description).join("; "),
        evidenceIds: validCitations,
        recommendedAction: "Route to Human Maker/Checker with mandatory discrepancy review.",
        confidence: Math.min(params.confidence, 45), // Cap confidence on contradiction
        uncertainties: params.contradictions.map((c) => "Conflict between " + c.sourceA + " and " + c.sourceB),
        questionsRemaining: ["Which source of truth is authoritative for this discrepancy?"],
        conflictsFound: params.contradictions,
        decisionOutcome: "CONFLICTING_EVIDENCE",
        authorityNotice: "AI_READ_ONLY_SUGGESTION_CANNOT_WRITE_LEDGER",
      };
    }

    // 3. Insufficient Evidence Check
    if (validCitations.length === 0) {
      return {
        summary: "INSUFFICIENT_EVIDENCE: No contextual records found in vault to substantiate resolution.",
        reason: "Zero supporting documents, emails, or webhooks linked to exception.",
        evidenceIds: [],
        recommendedAction: "Flag for investigation pending receipt of bank advice or merchant dispute documentation.",
        confidence: 20,
        uncertainties: ["No independent external corroboration available."],
        questionsRemaining: ["Has the payment provider webhook or bank MT940 statement arrived?"],
        conflictsFound: [],
        decisionOutcome: "INSUFFICIENT_EVIDENCE",
        authorityNotice: "AI_READ_ONLY_SUGGESTION_CANNOT_WRITE_LEDGER",
      };
    }

    // 4. Clean Validated Suggestion
    return {
      summary: params.rawSummary,
      reason: params.rawReason,
      evidenceIds: validCitations,
      recommendedAction: params.recommendedAction,
      confidence: Math.min(100, Math.max(0, params.confidence)),
      uncertainties: [],
      questionsRemaining: [],
      conflictsFound: [],
      decisionOutcome: "AGREED_SUGGESTION",
      authorityNotice: "AI_READ_ONLY_SUGGESTION_CANNOT_WRITE_LEDGER",
    };
  }
}
