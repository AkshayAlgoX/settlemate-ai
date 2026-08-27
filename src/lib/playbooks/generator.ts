/*
 * SettleMate AI — Automated Reconciliation Playbooks Generator
 *
 * Dynamically synthesizes step-by-step resolution playbooks for each exception type
 * by integrating scenario definitions, Context Vault evidence schemas,
 * Policy-as-Code trigger rules, and double-entry ledger invariants.
 */

import { formatCurrency } from "@/lib/format";
import { SETTLEMENT_CONFIG, FEE_CONFIG } from "@/lib/constants";

export interface JournalEntry {
  type: "DEBIT" | "CREDIT";
  account: string;
  amountPaise: number;
  formattedAmount: string;
  description: string;
}

export interface PlaybookApprovalStep {
  stepNumber: number;
  stage: string;
  role: "SYSTEM_GATE" | "MAKER_ANALYST" | "CHECKER_CONTROLLER" | "LEDGER_ENGINE";
  action: string;
  validationCheck: string;
  automated: boolean;
}

export interface PlaybookTriggerCondition {
  parameter: string;
  condition: string;
  policyReference: string;
  thresholdValue: string;
}

export interface PlaybookEvidenceRequirement {
  sourceType: string;
  documentName: string;
  vaultLookupKey: string;
  integrityProof: string;
  mandatory: boolean;
}

export interface ExceptionPlaybook {
  id: string; // "partial-refund" | "fee-discrepancy" | "chargeback" | "duplicate-payment" | "delayed-settlement"
  exceptionType: string;
  category: string;
  title: string;
  description: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  slaTargetHours: number;
  triggerConditions: PlaybookTriggerCondition[];
  requiredEvidence: PlaybookEvidenceRequirement[];
  recommendedJournal: {
    debitAccount: string;
    creditAccount: string;
    sampleAmountPaise: number;
    sampleFormattedAmount: string;
    narration: string;
    entries: JournalEntry[];
    zeroDriftInvariant: string;
  };
  approvalFlow: PlaybookApprovalStep[];
  scenarioId: string;
  scenarioName: string;
  scenarioRunUrl: string;
  sampleAiHypothesis: string;
  sampleClaims: Array<{
    type: string;
    claimText: string;
    validationCheck: string;
  }>;
}

export const PLAYBOOK_SCENARIO_IDS = [
  "partial-refund",
  "fee-discrepancy",
  "chargeback",
  "duplicate-payment",
  "delayed-settlement",
] as const;

export type PlaybookScenarioId = (typeof PLAYBOOK_SCENARIO_IDS)[number];

interface ScenarioTemplate {
  name: string;
  category: string;
  description: string;
  aiHypothesis: string;
  claims: Array<{
    type: string;
    claimText: string;
    validationCheck: string;
  }>;
}

const SCENARIO_TEMPLATES: Record<PlaybookScenarioId, ScenarioTemplate> = {
  "partial-refund": {
    name: "Partial Refund Discrepancy",
    category: "REFUND_VARIANCE",
    description: "A ₹20,000 payment settled for ₹18,450 because an un-notified ₹1,550 refund voucher was executed at the gateway.",
    aiHypothesis: "Settlement variance of ₹1,550.00 is fully explained by processed gateway refund REF_8821.",
    claims: [
      {
        type: "EVIDENCE_EXISTS_IN_VAULT",
        claimText: "Refund voucher REF_8821 exists in Context Vault",
        validationCheck: "SHA-256 Vault Seal Verified (a7f92b...)",
      },
      {
        type: "ARITHMETIC_CONSERVATION",
        claimText: "Gross (₹20,000) - Refund (₹1,550) == Net (₹18,450)",
        validationCheck: "2,000,000 - 155,000 == 1,845,000 paise (0 discrepancy)",
      },
    ],
  },
  "fee-discrepancy": {
    name: "Gateway Fee Tier Overcharge",
    category: "FEE_MISMATCH",
    description: "Processor billed 2.0% fee (₹200.00) instead of the negotiated contract rate 1.5% (₹150.00), leaving a ₹50.00 variance.",
    aiHypothesis: "Variance of ₹50.00 is caused by an unannounced fee tier upgrade (200 bps vs contractual 150 bps).",
    claims: [
      {
        type: "CONTRACTUAL_FEE_SCHEDULE",
        claimText: "Active merchant policy rate is 1.5% (15,000 paise)",
        validationCheck: "Policy-as-Code Contract ID: POL_FEE_2026",
      },
      {
        type: "PROCESSOR_OVERBILLING",
        claimText: "Processor withheld 20,000 paise (overbilling of 5,000 paise)",
        validationCheck: "20,000 billed - 15,000 expected == 5,000 paise variance",
      },
    ],
  },
  chargeback: {
    name: "Expired Chargeback Reversal Risk",
    category: "CHARGEBACK_RISK",
    description: "Chargeback of ₹15,000 filed at T+120 days, exceeding the 90-day dispute SLA window defined by card networks.",
    aiHypothesis: "Chargeback CB_9901 was initiated 120 days post-settlement, violating the 90-day network arbitration rule.",
    claims: [
      {
        type: "SLA_TIMING_WINDOW",
        claimText: "Dispute elapsed time is 120 calendar days",
        validationCheck: "Capture Date: T-120 days | Network Max Window: 90 days",
      },
      {
        type: "ARBITRATION_DEFENSE",
        claimText: "Valid documentation exists to assert auto-representment defense",
        validationCheck: "Delivery Proof SHA-256 (e4b281...) verified in Context Vault",
      },
    ],
  },
  "duplicate-payment": {
    name: "Duplicate Bank Credit Detection",
    category: "DUPLICATE_CREDIT",
    description: "Bank statement contains two separate credit entries of ₹5,000 for a single ₹5,000 order settlement.",
    aiHypothesis: "Bank nodal switch executed an duplicate credit posting of ₹5,000.00 for single transaction TXN_DUP_501.",
    claims: [
      {
        type: "DUPLICATE_IDENTIFIER_MATCH",
        claimText: "Two bank credit records share identical UTR: UTR_DUP_501",
        validationCheck: "bnk_DUP_501A and bnk_DUP_501B both match UTR_DUP_501",
      },
      {
        type: "OVER_CREDIT_DETECTION",
        claimText: "Bank credits total ₹10,000 vs Payment ₹5,000 (₹5,000 surplus)",
        validationCheck: "1,000,000 paise received - 500,000 paise captured == 500,000 paise excess",
      },
    ],
  },
  "delayed-settlement": {
    name: "Delayed Settlement SLA Breach",
    category: "SLA_BREACH",
    description: "Payment captured 5 days ago settled today, breaching the contractual T+1 settlement SLA.",
    aiHypothesis: "Settlement arrived at T+5 days due to bank nodal account clearing delay during long weekend.",
    claims: [
      {
        type: "SETTLEMENT_AGING_CHECK",
        claimText: "Aging duration is 120 hours (5 business days)",
        validationCheck: "Expected SLA: T+1 (24 hours) | Actual: T+5 (120 hours)",
      },
      {
        type: "LIQUIDITY_NEUTRALITY",
        claimText: "Final gross funds (₹8,000.00) match order total exactly",
        validationCheck: "800,000 == 800,000 paise (0 variance)",
      },
    ],
  },
};

/**
 * Generate a complete resolution playbook for a given exception scenario ID
 */
export function generatePlaybook(scenarioId: PlaybookScenarioId): ExceptionPlaybook {
  const scenario = SCENARIO_TEMPLATES[scenarioId] || SCENARIO_TEMPLATES["partial-refund"];

  switch (scenarioId) {
    case "partial-refund": {
      const sampleDiffPaise = 155000; // ₹1,550.00
      return {
        id: scenarioId,
        exceptionType: "AMOUNT_MISMATCH / REFUND_MISMATCH",
        category: scenario.category,
        title: "Partial Refund Discrepancy Playbook",
        description: scenario.description,
        severity: "MEDIUM",
        slaTargetHours: 24,
        triggerConditions: [
          {
            parameter: "Net Settlement Discrepancy",
            condition: "Net Settled Amount < Expected Net Amount",
            policyReference: "Policy §3.1 (Variance Tolerance: ₹1.00 / 100 paise)",
            thresholdValue: `|Variance| > ${SETTLEMENT_CONFIG.AMOUNT_TOLERANCE_PAISE} paise`,
          },
          {
            parameter: "Order & Payment Status",
            condition: "Order is PAID & Gateway Payment is CAPTURED",
            policyReference: "Policy §2.4 (Payment State Invariants)",
            thresholdValue: "status == 'captured'",
          },
          {
            parameter: "Refund Occurrence",
            condition: "Voucher authorized at gateway but un-linked in primary batch feed",
            policyReference: "Policy §4.2 (Asynchronous Refund Reconciliation)",
            thresholdValue: "Refund Voucher exists in Context Vault",
          },
        ],
        requiredEvidence: [
          {
            sourceType: "CONTEXT_VAULT_VOUCHER",
            documentName: "Gateway Refund Voucher (REF_8821)",
            vaultLookupKey: "linkedRecords.paymentIds == TXN_PR_101",
            integrityProof: "SHA-256 Vault Seal (a7f92b...)",
            mandatory: true,
          },
          {
            sourceType: "GATEWAY_SETTLEMENT_BATCH",
            documentName: "Settlement Breakdown Record (set_PR_101)",
            vaultLookupKey: "settlementId == set_PR_101",
            integrityProof: "Merkle Lineage Hash",
            mandatory: true,
          },
          {
            sourceType: "BANK_STATEMENT_CREDIT",
            documentName: "Nodal Bank Credit UTR Statement",
            vaultLookupKey: "utr == UTR_PR_101",
            integrityProof: "Bank Narration Signature",
            mandatory: true,
          },
        ],
        recommendedJournal: {
          debitAccount: "REFUND_CLEARING_AC",
          creditAccount: "SETTLEMENT_VARIANCE_AC",
          sampleAmountPaise: sampleDiffPaise,
          sampleFormattedAmount: formatCurrency(sampleDiffPaise),
          narration: "Post-settlement adjustment: clear gateway refund variance against authorized refund voucher REF_8821",
          entries: [
            {
              type: "DEBIT",
              account: "REFUND_CLEARING_AC",
              amountPaise: sampleDiffPaise,
              formattedAmount: formatCurrency(sampleDiffPaise),
              description: "Clear authorized customer refund obligation",
            },
            {
              type: "CREDIT",
              account: "SETTLEMENT_VARIANCE_AC",
              amountPaise: sampleDiffPaise,
              formattedAmount: formatCurrency(sampleDiffPaise),
              description: "Offset net settlement variance to achieve 0-drift balance",
            },
          ],
          zeroDriftInvariant: "Sum(Debits) === Sum(Credits) === 155,000 paise (₹1,550.00)",
        },
        approvalFlow: [
          {
            stepNumber: 1,
            stage: "Detection & Triage",
            role: "SYSTEM_GATE",
            action: "Core engine flags AMOUNT_MISMATCH exception (> ₹1.00 variance)",
            validationCheck: "2,000,000 - 155,000 == 1,845,000 paise check",
            automated: true,
          },
          {
            stepNumber: 2,
            stage: "Evidence Query",
            role: "SYSTEM_GATE",
            action: "Query Context Vault for payment TXN_PR_101 refund vouchers",
            validationCheck: "SHA-256 integrity seal verification",
            automated: true,
          },
          {
            stepNumber: 3,
            stage: "Advisory AI Formulation",
            role: "SYSTEM_GATE",
            action: "Advisory AI generates structured hypothesis & claims payload",
            validationCheck: "Non-LLM claim falsification gate (134k claims/sec)",
            automated: true,
          },
          {
            stepNumber: 4,
            stage: "Maker Review",
            role: "MAKER_ANALYST",
            action: "Finance Analyst reviews voucher linkage and proposes journal entry",
            validationCheck: "Analyst identity & audit trail capture",
            automated: false,
          },
          {
            stepNumber: 5,
            stage: "Checker Authorization",
            role: "CHECKER_CONTROLLER",
            action: "Controller authorizes double-entry transfer to REFUND_CLEARING_AC",
            validationCheck: "Segregation of duties (Checker != Maker, Role >= ADMIN)",
            automated: false,
          },
          {
            stepNumber: 6,
            stage: "Ledger Posting & Receipt",
            role: "LEDGER_ENGINE",
            action: "Atomic ledger finalization and Merkle DAG decision receipt emission",
            validationCheck: "0-drift ledger invariant & Merkle root sealing",
            automated: true,
          },
        ],
        scenarioId,
        scenarioName: scenario.name,
        scenarioRunUrl: `/scenarios?scenario=${scenarioId}`,
        sampleAiHypothesis: scenario.aiHypothesis,
        sampleClaims: scenario.claims.map((c) => ({
          type: c.type,
          claimText: c.claimText,
          validationCheck: c.validationCheck,
        })),
      };
    }

    case "fee-discrepancy": {
      const sampleDiffPaise = 5000; // ₹50.00
      return {
        id: scenarioId,
        exceptionType: "AMOUNT_MISMATCH / FEE_MISMATCH",
        category: scenario.category,
        title: "Gateway Fee Tier Overcharge & Clawback Playbook",
        description: scenario.description,
        severity: "LOW",
        slaTargetHours: 48,
        triggerConditions: [
          {
            parameter: "Processor Fee Rate",
            condition: "Charged Fee Rate > Contractual Policy Rate (e.g. 200 bps vs 150 bps)",
            policyReference: "Policy-as-Code Contract ID: POL_FEE_2026",
            thresholdValue: `Charged Bps > ${FEE_CONFIG.CARD.rateBps} bps contractual`,
          },
          {
            parameter: "Materiality Assessment",
            condition: "Aggregate fee overcharge exceeds processor audit threshold",
            policyReference: "Policy §5.1 (Fee Discrepancy Quarantine)",
            thresholdValue: "Discrepancy > 0 paise",
          },
        ],
        requiredEvidence: [
          {
            sourceType: "POLICY_AS_CODE_SPEC",
            documentName: "Active Merchant Fee Schedule (POL_FEE_2026)",
            vaultLookupKey: "policyId == POL_FEE_2026",
            integrityProof: "Policy AST SHA-256 Hash",
            mandatory: true,
          },
          {
            sourceType: "GATEWAY_INVOICE_FEE_ROW",
            documentName: "Gateway Settlement Fee Record (set_FEE_201)",
            vaultLookupKey: "settlementId == set_FEE_201",
            integrityProof: "Processor Billed Row Hash",
            mandatory: true,
          },
        ],
        recommendedJournal: {
          debitAccount: "PROCESSOR_DISPUTE_CLEARING",
          creditAccount: "GATEWAY_FEE_EXPENSE",
          sampleAmountPaise: sampleDiffPaise,
          sampleFormattedAmount: formatCurrency(sampleDiffPaise),
          narration: "Automated fee clawback dispute posted against processor overbilling on TXN_FEE_201",
          entries: [
            {
              type: "DEBIT",
              account: "PROCESSOR_DISPUTE_CLEARING",
              amountPaise: sampleDiffPaise,
              formattedAmount: formatCurrency(sampleDiffPaise),
              description: "Hold overcharged fee amount in dispute clearing receivable",
            },
            {
              type: "CREDIT",
              account: "GATEWAY_FEE_EXPENSE",
              amountPaise: sampleDiffPaise,
              formattedAmount: formatCurrency(sampleDiffPaise),
              description: "Reduce recognized gateway fee expense to contractual rate",
            },
          ],
          zeroDriftInvariant: "Sum(Debits) === Sum(Credits) === 5,000 paise (₹50.00)",
        },
        approvalFlow: [
          {
            stepNumber: 1,
            stage: "Fee Audit Gate",
            role: "SYSTEM_GATE",
            action: "Evaluate settlement fee against Policy-as-Code merchant rate table",
            validationCheck: "20,000 billed - 15,000 contractual == 5,000 paise variance",
            automated: true,
          },
          {
            stepNumber: 2,
            stage: "Evidence Aggregation",
            role: "SYSTEM_GATE",
            action: "Extract active fee contract schedule from Context Vault",
            validationCheck: "SHA-256 Policy Contract Signature match",
            automated: true,
          },
          {
            stepNumber: 3,
            stage: "Dispute Packet Assembly",
            role: "MAKER_ANALYST",
            action: "Reviewer prepares automated clawback charge to processor",
            validationCheck: "Verification of merchant tier & payment method eligibility",
            automated: false,
          },
          {
            stepNumber: 4,
            stage: "Controller Sign-off",
            role: "CHECKER_CONTROLLER",
            action: "Authorize dispute entry and schedule monthly gateway reconciliation offset",
            validationCheck: "Approval audit entry stamped with dual-control token",
            automated: false,
          },
        ],
        scenarioId,
        scenarioName: scenario.name,
        scenarioRunUrl: `/scenarios?scenario=${scenarioId}`,
        sampleAiHypothesis: scenario.aiHypothesis,
        sampleClaims: scenario.claims.map((c) => ({
          type: c.type,
          claimText: c.claimText,
          validationCheck: c.validationCheck,
        })),
      };
    }

    case "chargeback": {
      const sampleDiffPaise = 1500000; // ₹15,000.00
      return {
        id: scenarioId,
        exceptionType: "CHARGEBACK_ADJUSTMENT / CHARGEBACK_RISK",
        category: scenario.category,
        title: "Expired Chargeback Reversal & Representment Playbook",
        description: scenario.description,
        severity: "HIGH",
        slaTargetHours: 12,
        triggerConditions: [
          {
            parameter: "Dispute Elapsed Time",
            condition: "Chargeback Notice Date - Capture Date > 90 Calendar Days",
            policyReference: "Visa Core Rules §11.2 & Mastercard Dispute Processing Rules",
            thresholdValue: "Elapsed Time > 90 days (Actual: 120 days)",
          },
          {
            parameter: "Fulfillment Evidence",
            condition: "Valid signed proof of delivery exists in Context Vault",
            policyReference: "Policy §6.3 (Chargeback Representment Standard)",
            thresholdValue: "Delivery Proof SHA-256 verified",
          },
        ],
        requiredEvidence: [
          {
            sourceType: "PROOF_OF_DELIVERY",
            documentName: "Courier Delivery Proof & Customer Signature (e4b281...)",
            vaultLookupKey: "linkedRecords.orderIds == TXN_CB_301",
            integrityProof: "SHA-256 Vault Hash",
            mandatory: true,
          },
          {
            sourceType: "NETWORK_DISPUTE_NOTICE",
            documentName: "Acquirer Chargeback Intake Form (CB_9901)",
            vaultLookupKey: "chargebackId == CB_9901",
            integrityProof: "Network Message Timestamp",
            mandatory: true,
          },
        ],
        recommendedJournal: {
          debitAccount: "CHARGEBACK_ARBITRATION_SUSPENSE",
          creditAccount: "MERCHANT_RECEIVABLE_AC",
          sampleAmountPaise: sampleDiffPaise,
          sampleFormattedAmount: formatCurrency(sampleDiffPaise),
          narration: "Hold disputed funds in arbitration suspense pending statutory representment reversal for CB_9901",
          entries: [
            {
              type: "DEBIT",
              account: "CHARGEBACK_ARBITRATION_SUSPENSE",
              amountPaise: sampleDiffPaise,
              formattedAmount: formatCurrency(sampleDiffPaise),
              description: "Quarantine disputed funds during formal network arbitration",
            },
            {
              type: "CREDIT",
              account: "MERCHANT_RECEIVABLE_AC",
              amountPaise: sampleDiffPaise,
              formattedAmount: formatCurrency(sampleDiffPaise),
              description: "Offset merchant pending balance until dispute closure",
            },
          ],
          zeroDriftInvariant: "Sum(Debits) === Sum(Credits) === 1,500,000 paise (₹15,000.00)",
        },
        approvalFlow: [
          {
            stepNumber: 1,
            stage: "Dispute SLA Gate",
            role: "SYSTEM_GATE",
            action: "Mechanical validator computes dispute aging window (T+120 days vs 90-day SLA limit)",
            validationCheck: "Elapsed days check > 90 limit => SLA_EXPIRED flag",
            automated: true,
          },
          {
            stepNumber: 2,
            stage: "Dossier Compilation",
            role: "MAKER_ANALYST",
            action: "Reviewer verifies proof-of-delivery seal and prepares representment dossier",
            validationCheck: "Vault delivery signature verification",
            automated: false,
          },
          {
            stepNumber: 3,
            stage: "Legal & Controller Sign-off",
            role: "CHECKER_CONTROLLER",
            action: "Authorize representment packet submission to acquiring bank",
            validationCheck: "Maker-Checker dual authorization token issued",
            automated: false,
          },
        ],
        scenarioId,
        scenarioName: scenario.name,
        scenarioRunUrl: `/scenarios?scenario=${scenarioId}`,
        sampleAiHypothesis: scenario.aiHypothesis,
        sampleClaims: scenario.claims.map((c) => ({
          type: c.type,
          claimText: c.claimText,
          validationCheck: c.validationCheck,
        })),
      };
    }

    case "duplicate-payment": {
      const sampleDiffPaise = 500000; // ₹5,000.00
      return {
        id: scenarioId,
        exceptionType: "DUPLICATE_SETTLEMENT / ORPHAN_BANK_CREDIT",
        category: scenario.category,
        title: "Duplicate Bank Credit Detection & Treasury Quarantine",
        description: scenario.description,
        severity: "HIGH",
        slaTargetHours: 8,
        triggerConditions: [
          {
            parameter: "Bank Statement UTR Collision",
            condition: "Multiple bank credit records share the same settlement UTR",
            policyReference: "Policy §2.2 (Bank Credit Cardinality Constraints)",
            thresholdValue: "Count(Bank Credits for UTR) > 1",
          },
          {
            parameter: "Over-Credit Arithmetic",
            condition: "Total Bank Credits Received > Expected Settled Amount",
            policyReference: "Policy §1.1 (Double-Credit Invariant Guard)",
            thresholdValue: "Bank Credit Total > Net Settlement Amount",
          },
        ],
        requiredEvidence: [
          {
            sourceType: "BANK_FEED_RAW_STREAM",
            documentName: "Bank Statement Credit Log (bnk_DUP_501A, bnk_DUP_501B)",
            vaultLookupKey: "utr == UTR_DUP_501",
            integrityProof: "Bank Message Hash",
            mandatory: true,
          },
          {
            sourceType: "GATEWAY_BATCH_FEED",
            documentName: "Single Settled Order Transaction (TXN_DUP_501)",
            vaultLookupKey: "paymentId == TXN_DUP_501",
            integrityProof: "Gateway Capture Seal",
            mandatory: true,
          },
        ],
        recommendedJournal: {
          debitAccount: "BANK_CLEARING_AC",
          creditAccount: "UNCLAIMED_BANK_CREDITS",
          sampleAmountPaise: sampleDiffPaise,
          sampleFormattedAmount: formatCurrency(sampleDiffPaise),
          narration: "Quarantine duplicate bank credit received for TXN_DUP_501 in unclaimed liabilities",
          entries: [
            {
              type: "DEBIT",
              account: "BANK_CLEARING_AC",
              amountPaise: sampleDiffPaise,
              formattedAmount: formatCurrency(sampleDiffPaise),
              description: "Record surplus cash received in bank operating account",
            },
            {
              type: "CREDIT",
              account: "UNCLAIMED_BANK_CREDITS",
              amountPaise: sampleDiffPaise,
              formattedAmount: formatCurrency(sampleDiffPaise),
              description: "Isolate duplicate credit liability pending treasury refund to bank",
            },
          ],
          zeroDriftInvariant: "Sum(Debits) === Sum(Credits) === 500,000 paise (₹5,000.00)",
        },
        approvalFlow: [
          {
            stepNumber: 1,
            stage: "Collision Isolation",
            role: "SYSTEM_GATE",
            action: "Reconciliation indexer detects duplicate UTR collision on bank stream",
            validationCheck: "1,000,000 received vs 500,000 captured => 500,000 excess",
            automated: true,
          },
          {
            stepNumber: 2,
            stage: "Quarantine Journal Proposal",
            role: "MAKER_ANALYST",
            action: "Maker proposes journal allocation to UNCLAIMED_BANK_CREDITS",
            validationCheck: "Lock transaction against auto-matching",
            automated: false,
          },
          {
            stepNumber: 3,
            stage: "Treasury Clawback Approval",
            role: "CHECKER_CONTROLLER",
            action: "Checker authorizes treasury instruction to return over-credit to bank",
            validationCheck: "Treasury dual-authorization compliance",
            automated: false,
          },
        ],
        scenarioId,
        scenarioName: scenario.name,
        scenarioRunUrl: `/scenarios?scenario=${scenarioId}`,
        sampleAiHypothesis: scenario.aiHypothesis,
        sampleClaims: scenario.claims.map((c) => ({
          type: c.type,
          claimText: c.claimText,
          validationCheck: c.validationCheck,
        })),
      };
    }

    case "delayed-settlement":
    default: {
      const sampleDiffPaise = 800000; // ₹8,000.00
      return {
        id: scenarioId,
        exceptionType: "DELAYED_BANK_CREDIT / SLA_BREACH",
        category: scenario.category,
        title: "Delayed Settlement SLA Breach & Liquidity Tracking Playbook",
        description: scenario.description,
        severity: "MEDIUM",
        slaTargetHours: 24,
        triggerConditions: [
          {
            parameter: "Settlement Aging Delay",
            condition: "Settlement Credit Timestamp - Payment Capture Timestamp > T+1 SLA Window",
            policyReference: "Policy §2.1 (Provider Settlement Timelines)",
            thresholdValue: `Elapsed Time > ${SETTLEMENT_CONFIG.BANK_CREDIT_MAX_HOURS} hours (Actual: 120 hours / T+5)`,
          },
          {
            parameter: "Principal Neutrality",
            condition: "Final settled gross amount equals order total with zero balance discrepancy",
            policyReference: "Policy §1.0 (Principal Balance Conservation)",
            thresholdValue: "Settled Amount == Expected Net Amount",
          },
        ],
        requiredEvidence: [
          {
            sourceType: "PAYMENT_CAPTURE_LOG",
            documentName: "Captured Payment Timestamp Record (TXN_DELAY_401)",
            vaultLookupKey: "paymentId == TXN_DELAY_401",
            integrityProof: "Capture Timestamp Sign",
            mandatory: true,
          },
          {
            sourceType: "BANK_CLEARING_TAPE",
            documentName: "Late Nodal Bank Credit Statement (bnk_DELAY_401)",
            vaultLookupKey: "utr == UTR_DELAY_401",
            integrityProof: "Bank Value Date Stamp",
            mandatory: true,
          },
        ],
        recommendedJournal: {
          debitAccount: "BANK_SETTLEMENT_CLEARING",
          creditAccount: "IN_TRANSIT_RECEIVABLE_AC",
          sampleAmountPaise: sampleDiffPaise,
          sampleFormattedAmount: formatCurrency(sampleDiffPaise),
          narration: "Clear delayed transit ledger balance and tag gateway for monthly SLA breach deduction on TXN_DELAY_401",
          entries: [
            {
              type: "DEBIT",
              account: "BANK_SETTLEMENT_CLEARING",
              amountPaise: sampleDiffPaise,
              formattedAmount: formatCurrency(sampleDiffPaise),
              description: "Recognize delayed funds arriving in bank clearing account",
            },
            {
              type: "CREDIT",
              account: "IN_TRANSIT_RECEIVABLE_AC",
              amountPaise: sampleDiffPaise,
              formattedAmount: formatCurrency(sampleDiffPaise),
              description: "Clear open in-transit receivable balance",
            },
          ],
          zeroDriftInvariant: "Sum(Debits) === Sum(Credits) === 800,000 paise (₹8,000.00)",
        },
        approvalFlow: [
          {
            stepNumber: 1,
            stage: "Aging Monitor Detection",
            role: "SYSTEM_GATE",
            action: "Aging monitor flags settlement exceeding 72h SLA threshold",
            validationCheck: "120h elapsed > 72h max allowable => SLA_BREACH tagged",
            automated: true,
          },
          {
            stepNumber: 2,
            stage: "Liquidity Verification",
            role: "SYSTEM_GATE",
            action: "Non-LLM gate checks principal amount equality upon delayed arrival",
            validationCheck: "800,000 == 800,000 paise verified",
            automated: true,
          },
          {
            stepNumber: 3,
            stage: "Maker Review & Tagging",
            role: "MAKER_ANALYST",
            action: "Analyst confirms fund receipt and tags gateway for SLA breach penalty report",
            validationCheck: "Calendar exception & banking holiday cross-check",
            automated: false,
          },
          {
            stepNumber: 4,
            stage: "Checker Release",
            role: "CHECKER_CONTROLLER",
            action: "Authorize release of transit funds to active operating cash",
            validationCheck: "Dual-control controller authorization",
            automated: false,
          },
        ],
        scenarioId,
        scenarioName: scenario.name,
        scenarioRunUrl: `/scenarios?scenario=${scenarioId}`,
        sampleAiHypothesis: scenario.aiHypothesis,
        sampleClaims: scenario.claims.map((c) => ({
          type: c.type,
          claimText: c.claimText,
          validationCheck: c.validationCheck,
        })),
      };
    }
  }
}

/**
 * Returns all generated playbooks for the 5 core exception classes
 */
export function getAllPlaybooks(): ExceptionPlaybook[] {
  return PLAYBOOK_SCENARIO_IDS.map((id) => generatePlaybook(id));
}
