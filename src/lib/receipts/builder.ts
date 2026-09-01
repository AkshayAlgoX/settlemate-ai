/*
 * SettleMate AI — Milestone 5: Terminal Decision Receipt Builder
 *
 * Assembles and cryptographically seals the terminal decision receipt
 * across all pipeline stages (M1 -> M2 -> M3 -> M4 -> M5).
 */

import { createHash } from "node:crypto";
import type {
  TerminalDecisionReceipt,
  FinalDecision,
  InputCommitment,
  EvidenceCommitment,
  DeterministicMatchCommitment,
  InvariantProofCommitment,
  AiClaimCommitment,
  ChallengeCommitment,
  MechanicalVerificationCommitment,
  ReinvestigationHistoryItem,
  SolverDecisionCommitment,
  RoutingDecisionCommitment,
  CorrectionDecisionCommitment,
  PolicyVersions,
} from "./types";
import { signReceipt, CURRENT_SIGNING_KEY_VERSION } from "./signer";
import { TerminalReceiptRepository } from "./repository";

export interface BuildTerminalReceiptParams {
  tenantId: string;
  transactionId: string;
  batchId?: string;
  finalDecision: FinalDecision;
  inputCommitment: InputCommitment;
  evidenceCommitment: EvidenceCommitment;
  deterministicMatch: DeterministicMatchCommitment;
  invariantProof: InvariantProofCommitment;
  aiClaim?: AiClaimCommitment;
  challenge?: ChallengeCommitment;
  mechanicalVerification?: MechanicalVerificationCommitment;
  reinvestigationHistory?: ReinvestigationHistoryItem[];
  solverDecision?: SolverDecisionCommitment;
  routingDecision?: RoutingDecisionCommitment;
  correctionDecision?: CorrectionDecisionCommitment;
  policyVersions?: Partial<PolicyVersions>;
  signingKeyVersion?: string;
  persist?: boolean;
}

export const DEFAULT_POLICY_VERSIONS: PolicyVersions = {
  reconciliationPolicyVersion: "reconciliation-v1",
  invariantPolicyVersion: "z3-invariant-v1",
  criticPolicyVersion: "adversarial-critic-v1",
  routingPolicyVersion: "confidence-exposure-v1",
  solverPolicyVersion: "cpsat-invoice-match-v1",
  correctionPolicyVersion: "correction-policy-v1",
  receiptVersion: "1.0.0",
  canonicalizationVersion: "RFC8785-v1",
};

export async function createTerminalDecisionReceipt(
  params: BuildTerminalReceiptParams
): Promise<TerminalDecisionReceipt> {
  const now = new Date().toISOString();
  const keyVersion = params.signingKeyVersion || CURRENT_SIGNING_KEY_VERSION;

  const policyVersions: PolicyVersions = {
    ...DEFAULT_POLICY_VERSIONS,
    ...(params.policyVersions || {}),
  };

  const receiptSeed = `${params.tenantId}:${params.transactionId}:${params.finalDecision}:${policyVersions.receiptVersion}`;
  const receiptId = `rcpt_${createHash("sha256").update(receiptSeed).digest("hex").slice(0, 16)}`;

  const unsignedReceipt: Omit<TerminalDecisionReceipt, "proofHash" | "signature"> = {
    receiptId,
    tenantId: params.tenantId,
    transactionId: params.transactionId,
    batchId: params.batchId || `batch_${params.transactionId}`,
    createdAt: now,
    receiptVersion: "1.0.0",

    inputCommitment: params.inputCommitment,
    evidenceCommitment: params.evidenceCommitment,
    deterministicMatch: params.deterministicMatch,
    invariantProof: params.invariantProof,

    aiClaim: params.aiClaim,
    challenge: params.challenge,
    mechanicalVerification: params.mechanicalVerification,
    reinvestigationHistory: params.reinvestigationHistory || [],
    solverDecision: params.solverDecision,
    routingDecision: params.routingDecision,
    correctionDecision: params.correctionDecision,

    finalDecision: params.finalDecision,
    policyVersions,

    signingKeyVersion: keyVersion,
    canonicalizationVersion: "RFC8785-v1",
    signatureAlgorithm: "HMAC-SHA256",
  };

  const signed = signReceipt(unsignedReceipt, keyVersion);

  if (params.persist !== false) {
    await TerminalReceiptRepository.saveReceipt(signed);
  }

  return signed;
}
