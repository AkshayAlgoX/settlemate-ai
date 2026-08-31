/*
 * SettleMate AI — Milestone 4: Pure Minimal Correction Calculation Engine
 *
 * Computes the minimal journal entry required to restore the double-entry invariant.
 * Pure function: zero I/O, zero database mutations, 100% deterministic.
 */

import {
  type CorrectionInput,
  type MinimalCorrectionCalculationResult,
  type JournalLine,
  CorrectionInputSchema,
} from "./types";
import { CorrectionAccountPolicy } from "./account-policy";

export function calculateMinimalCorrection(
  rawInput: CorrectionInput
): MinimalCorrectionCalculationResult {
  const parseResult = CorrectionInputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    return {
      applicable: false,
      status: "FAILED",
      correctionType: rawInput.correctionType || "UNSUPPORTED_CORRECTION",
      journalLines: [],
      totalDebitCorrectionMinor: 0,
      totalCreditCorrectionMinor: 0,
      detectedDifferenceMinor: 0,
      minimalExplanation: "Invalid correction input schema",
      reason: `Validation error: ${parseResult.error.message}`,
    };
  }

  const input = parseResult.data;

  // 1. Zero difference check: no correction needed
  if (input.detectedDifferenceMinor === 0 || input.observedDebitMinor === input.observedCreditMinor) {
    return {
      applicable: false,
      status: "PROPOSED",
      correctionType: input.correctionType,
      journalLines: [],
      totalDebitCorrectionMinor: 0,
      totalCreditCorrectionMinor: 0,
      detectedDifferenceMinor: 0,
      minimalExplanation: "No correction required: debit and credit balances are already equal",
      reason: "Zero imbalance detected",
    };
  }

  // 2. Unsupported correction classification check
  if (input.correctionType === "UNSUPPORTED_CORRECTION") {
    return {
      applicable: false,
      status: "FAILED",
      correctionType: "UNSUPPORTED_CORRECTION",
      journalLines: [],
      totalDebitCorrectionMinor: 0,
      totalCreditCorrectionMinor: 0,
      detectedDifferenceMinor: input.detectedDifferenceMinor,
      minimalExplanation: "Automated journal proposal unavailable for unclassified discrepancy",
      reason: "Manual correction required: discrepancy cannot be deterministically classified",
    };
  }

  // 3. Determine imbalance direction
  const direction: "DEBIT_IMBALANCE" | "CREDIT_IMBALANCE" | "STANDARD" =
    input.observedDebitMinor < input.observedCreditMinor
      ? "DEBIT_IMBALANCE"
      : input.observedCreditMinor < input.observedDebitMinor
      ? "CREDIT_IMBALANCE"
      : "STANDARD";

  // 4. Resolve deterministic account mapping
  const mapping = CorrectionAccountPolicy.resolveMapping(
    input.correctionType,
    direction,
    input.sourceBalances?.debitAccount,
    input.sourceBalances?.creditAccount
  );

  if (!mapping) {
    return {
      applicable: false,
      status: "FAILED",
      correctionType: input.correctionType,
      journalLines: [],
      totalDebitCorrectionMinor: 0,
      totalCreditCorrectionMinor: 0,
      detectedDifferenceMinor: input.detectedDifferenceMinor,
      minimalExplanation: "No valid account mapping policy found for correction type",
      reason: `Missing account policy for ${input.correctionType}`,
    };
  }

  const amountMinor = input.detectedDifferenceMinor;
  const currency = input.currency || "INR";

  // 5. Build minimal 1-pair journal lines
  const lineDebitId = `line_dr_${input.transactionId.slice(-8)}_${Date.now().toString(36)}`;
  const lineCreditId = `line_cr_${input.transactionId.slice(-8)}_${Date.now().toString(36)}`;

  const journalLines: JournalLine[] = [
    {
      lineId: lineDebitId,
      accountId: mapping.debitAccount.accountId,
      accountName: mapping.debitAccount.accountName,
      entryType: "DEBIT",
      amountMinor,
      currency,
      description: `Correction for ${input.correctionType}: Debit ${mapping.debitAccount.accountName} (${mapping.policyRule})`,
    },
    {
      lineId: lineCreditId,
      accountId: mapping.creditAccount.accountId,
      accountName: mapping.creditAccount.accountName,
      entryType: "CREDIT",
      amountMinor,
      currency,
      description: `Correction for ${input.correctionType}: Credit ${mapping.creditAccount.accountName} (${mapping.policyRule})`,
    },
  ];

  const formattedAmount = (amountMinor / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const minimalExplanation =
    `One balancing journal pair (Debit ${mapping.debitAccount.accountName} / Credit ${mapping.creditAccount.accountName}) ` +
    `of ${currency} ${formattedAmount} is minimal and sufficient to restore the double-entry invariant; no additional lines are necessary.`;

  return {
    applicable: true,
    status: "AWAITING_REVIEW",
    correctionType: input.correctionType,
    journalLines,
    totalDebitCorrectionMinor: amountMinor,
    totalCreditCorrectionMinor: amountMinor,
    detectedDifferenceMinor: amountMinor,
    minimalExplanation,
  };
}
