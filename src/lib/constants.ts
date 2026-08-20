export const EXCEPTION_TYPES = [
  "AUTO_MATCHED",
  "PENDING_SETTLEMENT",
  "MISSING_BANK_CREDIT",
  "AMOUNT_MISMATCH",
  "DUPLICATE_SETTLEMENT",
  "ORPHAN_BANK_CREDIT",
  "REFUND_MISMATCH",
  "CHARGEBACK_ADJUSTMENT",
  "DELAYED_BANK_CREDIT",
  "NEEDS_MANUAL_REVIEW",
] as const;

export type ExceptionType = (typeof EXCEPTION_TYPES)[number];

export const EXCEPTION_LABELS: Record<ExceptionType, string> = {
  AUTO_MATCHED: "Auto Matched",
  PENDING_SETTLEMENT: "Pending Settlement",
  MISSING_BANK_CREDIT: "Missing Bank Credit",
  AMOUNT_MISMATCH: "Amount Mismatch",
  DUPLICATE_SETTLEMENT: "Duplicate Settlement",
  ORPHAN_BANK_CREDIT: "Orphan Bank Credit",
  REFUND_MISMATCH: "Refund Mismatch",
  CHARGEBACK_ADJUSTMENT: "Chargeback Adjustment",
  DELAYED_BANK_CREDIT: "Delayed Bank Credit",
  NEEDS_MANUAL_REVIEW: "Needs Manual Review",
};

export const EXCEPTION_COLORS: Record<ExceptionType, string> = {
  AUTO_MATCHED: "bg-green-500",
  PENDING_SETTLEMENT: "bg-yellow-500",
  MISSING_BANK_CREDIT: "bg-red-500",
  AMOUNT_MISMATCH: "bg-orange-500",
  DUPLICATE_SETTLEMENT: "bg-red-600",
  ORPHAN_BANK_CREDIT: "bg-purple-500",
  REFUND_MISMATCH: "bg-amber-500",
  CHARGEBACK_ADJUSTMENT: "bg-rose-600",
  DELAYED_BANK_CREDIT: "bg-blue-500",
  NEEDS_MANUAL_REVIEW: "bg-gray-500",
};

export const FEE_CONFIG = {
  UPI: { rateBps: 200, label: "2%" },
  CARD: { rateBps: 290, label: "2.9%" },
  NETBANKING: { rateBps: 200, label: "2%" },
  WALLET: { rateBps: 200, label: "2%" },
  GST_PERCENT: 18,
};

export const SETTLEMENT_CONFIG = {
  DELAY_DAYS: 2,
  BANK_CREDIT_EXPECTED_HOURS: 24,
  BANK_CREDIT_MAX_HOURS: 72,
  AMOUNT_TOLERANCE_PAISE: 100,
};

export const CONFIDENCE_THRESHOLDS = {
  AUTO_MATCH_MIN: 80,
  MANUAL_REVIEW_MAX: 50,
  HIGH_RISK_MAX: 30,
};

export const DEFAULT_DISTRIBUTION: Record<string, number> = {
  AUTO_MATCHED: 0.35,
  PENDING_SETTLEMENT: 0.10,
  MISSING_BANK_CREDIT: 0.08,
  AMOUNT_MISMATCH: 0.08,
  DUPLICATE_SETTLEMENT: 0.05,
  ORPHAN_BANK_CREDIT: 0.05,
  REFUND_MISMATCH: 0.07,
  CHARGEBACK_ADJUSTMENT: 0.05,
  DELAYED_BANK_CREDIT: 0.07,
  NEEDS_MANUAL_REVIEW: 0.10,
};

export const PAYMENT_METHODS = ["upi", "card", "netbanking", "wallet"] as const;