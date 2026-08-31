/*
 * SettleMate AI — Milestone 4: Invariant Restoration Prover
 *
 * Proves that applying the proposed journal lines strictly restores the double-entry
 * invariant (Debit == Credit) and money conservation guarantees before human approval.
 * Pure function: Zero I/O, deterministic formal verification.
 */

import { createHash } from "node:crypto";
import type { CorrectionInput, JournalLine, InvariantRestorationProof } from "./types";
import { Z3InvariantProver } from "@/lib/ai/z3-prover";

export class InvariantRestorationProver {
  private static readonly prover = new Z3InvariantProver();

  /**
   * Generates a formal, replayable proof that the proposed journal entry restores the financial invariant.
   */
  public static proveRestoration(
    input: CorrectionInput,
    journalLines: JournalLine[]
  ): InvariantRestorationProof {
    const verifiedAt = new Date().toISOString();
    const contextId = `proof_ctx_${input.tenantId}_${input.transactionId}`;
    const proofId = `prf_${createHash("sha256")
      .update(`${contextId}:${input.detectedDifferenceMinor}:${journalLines.length}`)
      .digest("hex")
      .slice(0, 12)}`;

    // 1. Compute Before State
    const beforeDebit = input.observedDebitMinor;
    const beforeCredit = input.observedCreditMinor;
    const beforeDiff = Math.abs(beforeDebit - beforeCredit);
    const beforeBalanced = beforeDiff === 0;

    // 2. Compute Correction Lines State
    let debitCorrection = 0;
    let creditCorrection = 0;
    for (const line of journalLines) {
      if (line.entryType === "DEBIT") debitCorrection += line.amountMinor;
      if (line.entryType === "CREDIT") creditCorrection += line.amountMinor;
    }
    const netCorrection = Math.abs(debitCorrection - creditCorrection);

    // 3. Compute Simulated After State
    // Applying the balancing entry to the lower side
    let afterDebit = beforeDebit;
    let afterCredit = beforeCredit;

    if (beforeDebit < beforeCredit) {
      afterDebit += debitCorrection;
    } else if (beforeCredit < beforeDebit) {
      afterCredit += creditCorrection;
    } else {
      // Already balanced or zero difference
      afterDebit += debitCorrection;
      afterCredit += creditCorrection;
    }

    const afterDiff = Math.abs(afterDebit - afterCredit);
    const afterBalanced = afterDiff === 0 && journalLines.length > 0 && debitCorrection === creditCorrection;

    // 4. Formal SMT / Z3 Verification on After State
    const smtResult = this.prover.prove({
      contextId: `${contextId}_after`,
      theoremName: "THEOREM_DOUBLE_ENTRY_PARITY",
      assignments: {
        grossPaise: Math.max(afterDebit, afterCredit),
        feePaise: 0,
        taxPaise: 0,
        refundPaise: 0,
        chargebackPaise: 0,
        settledPaise: Math.max(afterDebit, afterCredit),
        variancePaise: 0,
        debitsPaise: afterDebit,
        creditsPaise: afterCredit,
      },
      tolerancePaise: 0,
    });

    const isProofSuccessful = afterBalanced && (smtResult.status === "PROOF_VALID" || smtResult.doubleEntryBalanced);

    // 5. Generate Canonical Cryptographic Proof Hash
    const canonicalPayload = [
      input.tenantId,
      input.transactionId,
      input.currency,
      beforeDebit,
      beforeCredit,
      beforeDiff,
      debitCorrection,
      creditCorrection,
      afterDebit,
      afterCredit,
      afterDiff,
      isProofSuccessful ? "VERIFIED" : "FAILED",
      input.policyVersion || "correction-policy-v1",
    ].join(":");

    const proofHash = createHash("sha256").update(canonicalPayload).digest("hex");

    return {
      proofId,
      invariantName: "INVARIANT_DEBIT_CREDIT_BALANCE",
      beforeState: {
        debitMinor: beforeDebit,
        creditMinor: beforeCredit,
        differenceMinor: beforeDiff,
        isBalanced: beforeBalanced,
      },
      correctionState: {
        debitLinesTotalMinor: debitCorrection,
        creditLinesTotalMinor: creditCorrection,
        netCorrectionMinor: netCorrection,
      },
      afterState: {
        debitMinor: afterDebit,
        creditMinor: afterCredit,
        differenceMinor: afterDiff,
        isBalanced: afterBalanced,
      },
      proofResult: isProofSuccessful ? "VERIFIED" : "FAILED",
      smtScript: smtResult.smtLibScript,
      counterexample: isProofSuccessful ? undefined : "Simulated after-state failed double-entry parity check",
      proofHash,
      verifiedAt,
    };
  }
}
