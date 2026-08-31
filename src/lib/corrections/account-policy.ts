/*
 * SettleMate AI — Milestone 4: Explicit Deterministic Account Mapping Policy
 *
 * Enforces:
 *   - No magic accounting / no invented accounts
 *   - Versioned, auditable mapping rules
 *   - Deterministic account selection based on correction type and direction
 *   - Tenant-aware overrides if configured; fails closed to null if mapping missing
 */

import type { CorrectionType } from "./types";

export interface AccountDefinition {
  accountId: string;
  accountName: string;
  category: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE" | "CLEARING";
  description: string;
}

export const STANDARD_ACCOUNT_CATALOG: Record<string, AccountDefinition> = {
  SETTLEMENT_VARIANCE_CLEARING: {
    accountId: "SETTLEMENT_VARIANCE_CLEARING",
    accountName: "Settlement Variance Clearing",
    category: "CLEARING",
    description: "Clearing account for unallocated reconciliation variances and discrepancies",
  },
  SETTLEMENT_RECEIVABLE: {
    accountId: "SETTLEMENT_RECEIVABLE",
    accountName: "Settlement Receivable",
    category: "ASSET",
    description: "Receivables due from payment processors and acquiring banks",
  },
  ACCOUNTS_RECEIVABLE: {
    accountId: "ACCOUNTS_RECEIVABLE",
    accountName: "Accounts Receivable",
    category: "ASSET",
    description: "Trade accounts receivable for unsettled merchant orders",
  },
  SUSPENSE_CLEARING: {
    accountId: "SUSPENSE_CLEARING",
    accountName: "Suspense Clearing",
    category: "CLEARING",
    description: "Temporary holding account for unidentified or unclassified financial transactions",
  },
  PAYMENT_PROCESSING_FEES: {
    accountId: "PAYMENT_PROCESSING_FEES",
    accountName: "Payment Processing Fees",
    category: "EXPENSE",
    description: "MDR, gateway charges, interchange, and transaction processing fees",
  },
  BANK_CLEARING: {
    accountId: "BANK_CLEARING",
    accountName: "Bank Clearing Account",
    category: "ASSET",
    description: "Clearing account for direct bank remittances and nodal settlements",
  },
  ACCOUNTS_PAYABLE: {
    accountId: "ACCOUNTS_PAYABLE",
    accountName: "Accounts Payable",
    category: "LIABILITY",
    description: "Liabilities due to suppliers, vendors, or refund payees",
  },
};

export interface AccountMappingPair {
  debitAccount: AccountDefinition;
  creditAccount: AccountDefinition;
  policyRule: string;
}

export class CorrectionAccountPolicy {
  public static readonly POLICY_VERSION = "correction-policy-v1";

  /**
   * Resolves the deterministic debit/credit account pair for a given correction type and imbalance direction.
   * Returns null if the correction type is unsupported or mapping is not defined (fails closed).
   */
  public static resolveMapping(
    correctionType: CorrectionType,
    direction: "DEBIT_IMBALANCE" | "CREDIT_IMBALANCE" | "STANDARD",
    customDebitAccount?: string,
    customCreditAccount?: string
  ): AccountMappingPair | null {
    // If custom accounts supplied, ensure they exist in catalog
    if (customDebitAccount && !STANDARD_ACCOUNT_CATALOG[customDebitAccount]) {
      return null;
    }
    if (customCreditAccount && !STANDARD_ACCOUNT_CATALOG[customCreditAccount]) {
      return null;
    }

    switch (correctionType) {
      case "SETTLEMENT_VARIANCE": {
        if (direction === "DEBIT_IMBALANCE") {
          // Debit was lower than credit; debit variance clearing, credit settlement receivable
          return {
            debitAccount: STANDARD_ACCOUNT_CATALOG.SETTLEMENT_VARIANCE_CLEARING,
            creditAccount: STANDARD_ACCOUNT_CATALOG.SETTLEMENT_RECEIVABLE,
            policyRule: "RULE_VARIANCE_DEBIT_CLEARING_CREDIT_RECEIVABLE",
          };
        } else {
          // Credit was lower than debit; debit settlement receivable, credit variance clearing
          return {
            debitAccount: STANDARD_ACCOUNT_CATALOG.SETTLEMENT_RECEIVABLE,
            creditAccount: STANDARD_ACCOUNT_CATALOG.SETTLEMENT_VARIANCE_CLEARING,
            policyRule: "RULE_VARIANCE_DEBIT_RECEIVABLE_CREDIT_CLEARING",
          };
        }
      }

      case "MISSING_DEBIT": {
        const debit = customDebitAccount
          ? STANDARD_ACCOUNT_CATALOG[customDebitAccount]
          : STANDARD_ACCOUNT_CATALOG.ACCOUNTS_RECEIVABLE;
        return {
          debitAccount: debit,
          creditAccount: STANDARD_ACCOUNT_CATALOG.SUSPENSE_CLEARING,
          policyRule: "RULE_MISSING_DEBIT_RESTORE_TO_SUSPENSE",
        };
      }

      case "MISSING_CREDIT": {
        const credit = customCreditAccount
          ? STANDARD_ACCOUNT_CATALOG[customCreditAccount]
          : STANDARD_ACCOUNT_CATALOG.SETTLEMENT_RECEIVABLE;
        return {
          debitAccount: STANDARD_ACCOUNT_CATALOG.SUSPENSE_CLEARING,
          creditAccount: credit,
          policyRule: "RULE_MISSING_CREDIT_CLEAR_FROM_SUSPENSE",
        };
      }

      case "DUPLICATE_POSTING_REVERSAL": {
        return {
          debitAccount: STANDARD_ACCOUNT_CATALOG.SUSPENSE_CLEARING,
          creditAccount: STANDARD_ACCOUNT_CATALOG.BANK_CLEARING,
          policyRule: "RULE_REVERSE_DUPLICATE_BANK_POSTING",
        };
      }

      case "FEE_ADJUSTMENT": {
        return {
          debitAccount: STANDARD_ACCOUNT_CATALOG.PAYMENT_PROCESSING_FEES,
          creditAccount: STANDARD_ACCOUNT_CATALOG.SETTLEMENT_RECEIVABLE,
          policyRule: "RULE_RECOGNIZE_UNRECONCILED_PROCESSOR_FEE",
        };
      }

      case "UNSUPPORTED_CORRECTION":
      default:
        return null;
    }
  }
}
