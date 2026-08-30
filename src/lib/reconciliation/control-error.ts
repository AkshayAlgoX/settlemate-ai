import { ControlFailureError, InvariantReport } from "@/lib/reconciliation/invariants";

export interface IncompleteInputErrorResponse {
  error: {
    code: "INCOMPLETE_INPUT";
    message: string;
    missing?: string[];
  };
}

/**
 * Builds user-friendly 422 error response payload when reconciliation input
 * is incomplete or fails financial input/partition invariants.
 */
export function buildControlFailureResponse(
  error: ControlFailureError | { report?: InvariantReport; message?: string }
): IncompleteInputErrorResponse {
  const missing: string[] = [];
  const report = (error as ControlFailureError)?.report;
  const counts = report?.checkedCounts || {};
  const amounts = report?.checkedAmounts || {};
  const failures = report?.failures || [];
  const failureCodes = failures.map((f) => f.code);

  const paymentsCount = counts.capturedPayments ?? counts.payments ?? 0;
  const settlementsCount = counts.settlements ?? 0;
  const bankCreditsCount = counts.bankCredits ?? 0;
  const bankDebitsCount = counts.bankDebits ?? 0;
  const chargebacksCount = counts.chargebacks ?? 0;

  if (paymentsCount === 0) {
    missing.push("payments");
  }
  if (settlementsCount === 0 && counts.settlements !== undefined) {
    missing.push("settlements");
  }
  if (bankCreditsCount === 0) {
    missing.push("bankCredits");
  }
  if (bankDebitsCount === 0 && (chargebacksCount > 0 || (amounts.unexplainedDebit ?? 0) > 0)) {
    missing.push("bankDebits");
  }

  // If no missing items were deduced from counts alone, infer from failure codes
  if (missing.length === 0) {
    if (failureCodes.includes("INVARIANT_INPUT_COMPLETE")) {
      missing.push("payments");
    }
    if (failureCodes.includes("INVARIANT_DEBIT_CREDIT_BALANCE")) {
      if (bankCreditsCount === 0) missing.push("bankCredits");
      if (bankDebitsCount === 0) missing.push("bankDebits");
    }
    if (failureCodes.includes("INVARIANT_PARTITION_COMPLETE")) {
      missing.push("settlements");
    }
  }

  // Default fallback guidance if specific missing types could not be isolated
  if (missing.length === 0) {
    missing.push("bankCredits", "bankDebits");
  }

  const missingStr = missing.length > 0 ? ` Missing: ${missing.join(", ")}.` : "";
  const message = `The uploaded file does not contain all required record types. Please include payments, settlements, and bank credits/debits.${missingStr}`;

  return {
    error: {
      code: "INCOMPLETE_INPUT",
      message,
      missing,
    },
  };
}

export function buildIncompleteRecordsError(missing: string[]): IncompleteInputErrorResponse {
  const missingStr = missing.length > 0 ? ` Missing: ${missing.join(", ")}.` : "";
  const message = `The uploaded file does not contain all required record types. Please include payments, settlements, and bank credits/debits.${missingStr}`;
  return {
    error: {
      code: "INCOMPLETE_INPUT",
      message,
      missing,
    },
  };
}
