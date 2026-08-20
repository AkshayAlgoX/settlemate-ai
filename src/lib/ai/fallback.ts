import { formatCurrency } from "@/lib/format";

interface ExceptionContext {
  exceptionType: string;
  paymentId: string;
  orderId: string;
  settlementId: string | null;
  bankTxnId: string | null;
  paymentAmount: number;
  fee: number;
  tax: number;
  refundAmount: number;
  chargebackAmount: number;
  expectedNet: number;
  actualSettled: number | null;
  bankCredited: number | null;
  mismatch: number | null;
  confidence: number;
  matchMethod: string;
  matchDetails: string;
}

interface AIExplanation {
  summary: string;
  reason: string;
  evidence: string[];
  recommended_action: string;
  risk_level: string;
  needs_manual_review: boolean;
}

export function generateFallbackExplanation(ctx: ExceptionContext): AIExplanation {
  const templates: Record<string, () => AIExplanation> = {
    PENDING_SETTLEMENT: () => ({
      summary: `Payment ${ctx.paymentId} is captured but settlement has not yet been processed.`,
      reason: `Payment of ${formatCurrency(ctx.paymentAmount)} was captured but the T+2 settlement window has not elapsed. This is normal behavior and requires no action.`,
      evidence: [
        `payment_id=${ctx.paymentId} captured ${formatCurrency(ctx.paymentAmount)}`,
        `no settlement record found for this payment`,
        `expected settlement within T+2 business days`,
      ],
      recommended_action: "No action needed. Settlement will be processed automatically within the T+2 window.",
      risk_level: "LOW",
      needs_manual_review: false,
    }),

    MISSING_BANK_CREDIT: () => ({
      summary: `Settlement ${ctx.settlementId} was processed but no matching bank credit found.`,
      reason: `Settlement ${ctx.settlementId} for ${formatCurrency(ctx.actualSettled || 0)} was marked as processed, but no bank transaction with matching UTR was found in the bank statement. This indicates the funds have not yet been credited to the merchant's bank account.`,
      evidence: [
        `settlement_id=${ctx.settlementId} processed`,
        `expected_credit=${formatCurrency(ctx.actualSettled || 0)}`,
        `bank_statement=no matching credit found`,
      ],
      recommended_action: "Contact Razorpay support with settlement ID. Verify UTR with your bank. If delay exceeds 72 hours, escalate.",
      risk_level: "HIGH",
      needs_manual_review: true,
    }),

    AMOUNT_MISMATCH: () => ({
      summary: `Settlement amount for ${ctx.paymentId} differs from expected by ${formatCurrency(ctx.mismatch || 0)}.`,
      reason: `Expected net settlement was ${formatCurrency(ctx.expectedNet)} (payment ${formatCurrency(ctx.paymentAmount)} minus fee ${formatCurrency(ctx.fee)} minus tax ${formatCurrency(ctx.tax)} minus refunds ${formatCurrency(ctx.refundAmount)} minus chargebacks ${formatCurrency(ctx.chargebackAmount)}), but actual settlement was ${formatCurrency(ctx.actualSettled || 0)}.`,
      evidence: [
        `payment_id=${ctx.paymentId} amount=${formatCurrency(ctx.paymentAmount)}`,
        `fee=${formatCurrency(ctx.fee)} tax=${formatCurrency(ctx.tax)}`,
        `expected=${formatCurrency(ctx.expectedNet)} actual=${formatCurrency(ctx.actualSettled || 0)}`,
        `mismatch=${formatCurrency(ctx.mismatch || 0)}`,
      ],
      recommended_action: "Verify fee structure with Razorpay dashboard. Check if additional charges (convenience fee, international markup) were applied.",
      risk_level: (ctx.mismatch || 0) > 10000 ? "HIGH" : "MEDIUM",
      needs_manual_review: true,
    }),

    DUPLICATE_SETTLEMENT: () => ({
      summary: `Payment ${ctx.paymentId} appears in multiple settlements.`,
      reason: `The same payment was included in more than one settlement batch, potentially resulting in duplicate credit to the merchant's bank account.`,
      evidence: [
        `payment_id=${ctx.paymentId}`,
        `multiple_settlements=${ctx.matchDetails}`,
      ],
      recommended_action: "Contact Razorpay support immediately with all settlement IDs. Verify bank credits to confirm if duplicate payment was received.",
      risk_level: "HIGH",
      needs_manual_review: true,
    }),

    ORPHAN_BANK_CREDIT: () => ({
      summary: `Bank credit of ${formatCurrency(ctx.bankCredited || 0)} has no matching settlement record.`,
      reason: `A credit transaction was found in the bank statement but no corresponding settlement or payment record exists in the system. This could be a settlement from a previous batch, a different merchant account, or an erroneous credit.`,
      evidence: [
        `bank_txn=${ctx.bankTxnId} credit=${formatCurrency(ctx.bankCredited || 0)}`,
        `no_matching_settlement=true`,
        `narration=${ctx.matchDetails}`,
      ],
      recommended_action: "Identify the source of this credit. Check if it belongs to a different batch or merchant account. Do not assume it is Razorpay-related without verification.",
      risk_level: "MEDIUM",
      needs_manual_review: true,
    }),

    REFUND_MISMATCH: () => ({
      summary: `Refund of ${formatCurrency(ctx.refundAmount)} was not correctly reflected in settlement.`,
      reason: `A processed refund exists for this payment but the settlement amount does not account for the refund deduction. Expected settlement should have been ${formatCurrency(ctx.expectedNet)} but was ${formatCurrency(ctx.actualSettled || 0)}.`,
      evidence: [
        `payment_id=${ctx.paymentId}`,
        `refund_amount=${formatCurrency(ctx.refundAmount)}`,
        `expected_with_refund=${formatCurrency(ctx.expectedNet)}`,
        `actual_settled=${formatCurrency(ctx.actualSettled || 0)}`,
      ],
      recommended_action: "Verify if the refund was processed after the settlement was generated. If so, the adjustment will appear in the next settlement cycle.",
      risk_level: "MEDIUM",
      needs_manual_review: true,
    }),

    CHARGEBACK_ADJUSTMENT: () => ({
      summary: `Chargeback of ${formatCurrency(ctx.chargebackAmount)} raised on previously settled payment.`,
      reason: `Payment ${ctx.paymentId} was already settled but a chargeback has been raised, clawing back ${formatCurrency(ctx.chargebackAmount)} from the merchant's account.`,
      evidence: [
        `payment_id=${ctx.paymentId}`,
        `chargeback_amount=${formatCurrency(ctx.chargebackAmount)}`,
        `original_settlement=${formatCurrency(ctx.actualSettled || 0)}`,
      ],
      recommended_action: "Review the chargeback reason. Prepare evidence for dispute if the chargeback is fraudulent. Monitor for additional chargebacks on this payment.",
      risk_level: "HIGH",
      needs_manual_review: true,
    }),

    DELAYED_BANK_CREDIT: () => ({
      summary: `Bank credit for settlement ${ctx.settlementId} arrived outside the expected window.`,
      reason: `Settlement was processed on time but the bank credit appeared later than the expected T+2 window. ${ctx.matchDetails}`,
      evidence: [
        `settlement_id=${ctx.settlementId}`,
        `bank_txn=${ctx.bankTxnId}`,
        `delay_details=${ctx.matchDetails}`,
      ],
      recommended_action: "Monitor for recurring delays with this bank. If pattern persists, consider switching settlement bank account.",
      risk_level: "LOW",
      needs_manual_review: false,
    }),

    NEEDS_MANUAL_REVIEW: () => ({
      summary: `Ambiguous match for payment ${ctx.paymentId} requires human verification.`,
      reason: `Multiple potential matches exist and the system cannot determine the correct one with sufficient confidence. ${ctx.matchDetails}`,
      evidence: [
        `payment_id=${ctx.paymentId}`,
        `confidence=${ctx.confidence}/100`,
        `details=${ctx.matchDetails}`,
      ],
      recommended_action: "Manually verify the payment against bank statement and settlement report. Cross-reference UTR and narration.",
      risk_level: "MEDIUM",
      needs_manual_review: true,
    }),
  };

  const generator = templates[ctx.exceptionType];
  if (generator) return generator();

  return {
    summary: `Exception detected for payment ${ctx.paymentId}: ${ctx.exceptionType}`,
    reason: `The reconciliation engine detected an anomaly. ${ctx.matchDetails}`,
    evidence: [`payment_id=${ctx.paymentId}`, `status=${ctx.exceptionType}`],
    recommended_action: "Review exception details and take appropriate action.",
    risk_level: "MEDIUM",
    needs_manual_review: true,
  };
}