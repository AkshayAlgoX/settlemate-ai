export interface ConfidenceInput {
  exactUtrMatch: boolean;
  exactIdMatch: boolean;
  exactAmountMatch: boolean;
  dateWithinWindow: boolean;
  narrationContainsId: boolean;
  singleCandidate: boolean;
  multipleCandidates: boolean;
  amountDeltaPaise: number;
  hasRefund: boolean;
  hasChargeback: boolean;
  noBankCredit: boolean;
  noSettlement: boolean;
}

export function computeConfidence(input: ConfidenceInput): number {
  let score = 0;

  // Positive signals
  if (input.exactUtrMatch) score += 40;
  if (input.exactIdMatch) score += 25;
  if (input.exactAmountMatch) score += 15;
  if (input.dateWithinWindow) score += 10;
  if (input.narrationContainsId) score += 10;
  if (input.singleCandidate) score += 5;

  // Negative signals
  if (input.multipleCandidates) score -= 30;
  if (input.noBankCredit) score -= 20;
  if (input.noSettlement) score -= 15;

  // Amount mismatch penalty (scaled)
  if (input.amountDeltaPaise > 0) {
    if (input.amountDeltaPaise <= 100) score -= 5;
    else if (input.amountDeltaPaise <= 1000) score -= 15;
    else if (input.amountDeltaPaise <= 10000) score -= 25;
    else score -= 40;
  }

  // Complexity adjustments
  if (input.hasRefund) score -= 3;
  if (input.hasChargeback) score -= 8;

  return Math.max(0, Math.min(100, score));
}

export function classifyByConfidence(
  score: number,
  currentStatus: string
): string {
  if (score >= 80 && currentStatus === "AUTO_MATCHED") {
    return "AUTO_MATCHED";
  }
  if (score < 50 && currentStatus === "AUTO_MATCHED") {
    return "NEEDS_MANUAL_REVIEW";
  }
  return currentStatus;
}