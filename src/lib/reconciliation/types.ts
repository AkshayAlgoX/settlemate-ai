export interface NormalizedPayment {
  dbId: string;
  paymentId: string;
  orderId: string;
  amount: number;
  fee: number;
  tax: number;
  method: string;
  status: string;
  capturedAt: Date | null;
  createdAt: Date;
}

export interface NormalizedSettlement {
  dbId: string;
  settlementId: string;
  paymentId: string;
  amount: number;
  fee: number;
  tax: number;
  utr: string | null;
  status: string;
  settledAt: Date | null;
  createdAt: Date;
}

export interface NormalizedBankTxn {
  dbId: string;
  txnId: string;
  utr: string | null;
  amount: number;
  type: string;
  narration: string | null;
  txnDate: Date;
  matched: boolean;
}

export interface NormalizedRefund {
  dbId: string;
  refundId: string;
  paymentId: string;
  amount: number;
  status: string;
}

export interface NormalizedChargeback {
  dbId: string;
  chargebackId: string;
  paymentId: string;
  amount: number;
  status: string;
}

export interface NormalizedOrder {
  dbId: string;
  orderId: string;
  amount: number;
  status: string;
  createdAt: Date;
}

export interface MatchResult {
  paymentId: string;
  orderId: string;
  settlementIds: string[];
  bankTxnIds: string[];
  refundIds: string[];
  chargebackIds: string[];
  orderAmount: number;
  paymentAmount: number;
  paymentFee: number;
  paymentTax: number;
  refundAmount: number;
  chargebackAmount: number;
  expectedNetAmount: number;
  actualSettledAmount: number | null;
  bankCreditedAmount: number | null;
  mismatchAmount: number | null;
  status: string;
  confidenceScore: number;
  matchMethod: string;
  matchDetails: string;
  cardinalityType: "1:1" | "1:N" | "N:1" | "N:M";
  cardinalityReason: string | null;
  relationshipScore: number | null;
}

export interface ReconciliationMetrics {
  totalRecords: number;
  autoMatched: number;
  exceptionsFound: number;
  unresolvedCount: number;
  accuracy: number;
  precision: number;
  recall: number;
  throughputRps: number;
  processingTimeMs: number;
  confusionMatrix: Record<string, Record<string, number>>;
  perTypeMetrics: Record<string, { precision: number; recall: number; f1: number; count: number }>;
  grossOrderAmount: number;
  capturedPayments: number;
  expectedSettlement: number;
  actualBankCredits: number;
  totalRefunds: number;
  totalChargebacks: number;
  amountAtRisk: number;
  exceptionsByType: Record<string, number>;
  phaseTimings: Record<string, number>;
}

export interface BatchData {
  orders: NormalizedOrder[];
  payments: NormalizedPayment[];
  settlements: NormalizedSettlement[];
  bankTransactions: NormalizedBankTxn[];
  refunds: NormalizedRefund[];
  chargebacks: NormalizedChargeback[];
  groundTruths: Array<{ paymentId: string; expectedLabel: string; scenario: string }>;
}