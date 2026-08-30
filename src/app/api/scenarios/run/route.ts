/*
 * SettleMate AI — Interactive Finance-Ops Scenario Lab API
 */

import { NextRequest, NextResponse } from "next/server";
import { safeErrorResponse } from "@/lib/security/api-security";
import { formatCurrency } from "@/lib/format";
import { buildIndexes } from "@/lib/reconciliation/indexer";
import { matchAllRecords } from "@/lib/reconciliation/matcher";
import { applyCardinalityMatching } from "@/lib/reconciliation/apply-cardinality";
import type { BatchData } from "@/lib/reconciliation/types";

export interface ScenarioClaim {
  type: string;
  claimText: string;
  status: "VERIFIED" | "DISPUTED";
  validationCheck: string;
  details: string;
}

export interface ScenarioResult {
  scenarioId: string;
  scenarioName: string;
  category: string;
  description: string;
  summary: {
    autoMatched: number;
    suggested: number;
    exception: number;
    total: number;
  };
  exceptions: Array<{
    id: string;
    type: string;
    description: string;
    amountPaise: number;
    formattedAmount: string;
    referenceId: string;
    expectedNetPaise: number;
    actualSettledPaise: number | null;
  }>;
  aiSuggestion: {
    available: boolean;
    confidenceScore: number;
    hypothesis: string;
    claims: ScenarioClaim[];
    proposedCorrection: string;
    targetAccount: string;
    makerCheckerRequired: boolean;
  };
  processedAt: string;
}

export function buildScenarioData(scenarioId: string): { name: string; category: string; description: string; batchData: BatchData; aiHypothesis: string; claims: ScenarioClaim[]; proposedCorrection: string; targetAccount: string } {
  const now = new Date();
  const tMinus5 = new Date(Date.now() - 5 * 86400000);
  const tMinus120 = new Date(Date.now() - 120 * 86400000);

  switch (scenarioId) {
    case "partial-refund": {
      // Payment ₹20,000 (2,000,000 paise), Refund ₹1,550 (155,000 paise), Settled ₹18,450 (1,845,000 paise)
      return {
        name: "Partial Refund Discrepancy",
        category: "REFUND_VARIANCE",
        description: "A ₹20,000 payment settled for ₹18,450 because an un-notified ₹1,550 refund voucher was executed at the gateway.",
        batchData: {
          orders: [{ dbId: "ord_1", orderId: "TXN_PR_101", amount: 2000000, status: "paid", createdAt: now }],
          payments: [{ dbId: "pay_1", paymentId: "TXN_PR_101", orderId: "TXN_PR_101", amount: 2000000, fee: 0, tax: 0, method: "upi", status: "captured", capturedAt: now, createdAt: now }],
          settlements: [{ dbId: "set_1", settlementId: "set_PR_101", paymentId: "TXN_PR_101", amount: 1845000, fee: 0, tax: 0, utr: "UTR_PR_101", status: "settled", settledAt: now, createdAt: now }],
          bankTransactions: [{ dbId: "bnk_1", txnId: "bnk_PR_101", utr: "UTR_PR_101", amount: 1845000, type: "CREDIT", narration: "Razorpay Payout TXN_PR_101", txnDate: now, matched: false }],
          refunds: [], // Refund voucher REF_8821 exists in Context Vault, but not in gateway batch feed, triggering AMOUNT_MISMATCH exception
          chargebacks: [],
          groundTruths: [],
        },
        aiHypothesis: "Settlement variance of ₹1,550.00 is fully explained by processed gateway refund REF_8821.",
        claims: [
          { type: "EVIDENCE_EXISTS_IN_VAULT", claimText: "Refund voucher REF_8821 exists in Context Vault", status: "VERIFIED", validationCheck: "SHA-256 Vault Seal Verified (a7f92b...)", details: "Voucher authorized and linked to payment TXN_PR_101" },
          { type: "ARITHMETIC_CONSERVATION", claimText: "Gross (₹20,000) - Refund (₹1,550) == Net (₹18,450)", status: "VERIFIED", validationCheck: "2,000,000 - 155,000 == 1,845,000 paise (0 discrepancy)", details: "Exact minor-unit equality satisfied" },
        ],
        proposedCorrection: "Post double-entry journal transfer from REFUND_CLEARING_AC to SETTLEMENT_VARIANCE_AC.",
        targetAccount: "REFUND_CLEARING_AC",
      };
    }

    case "fee-discrepancy": {
      // Payment ₹10,000 (1,000,000 paise), expected fee ₹150 (15,000 paise), fee charged ₹200 (20,000 paise), settled ₹9,800 vs expected ₹9,850
      return {
        name: "Gateway Fee Tier Overcharge",
        category: "FEE_MISMATCH",
        description: "Processor billed 2.0% fee (₹200.00) instead of the negotiated contract rate 1.5% (₹150.00), leaving a ₹50.00 variance.",
        batchData: {
          orders: [{ dbId: "ord_2", orderId: "TXN_FEE_201", amount: 1000000, status: "paid", createdAt: now }],
          payments: [{ dbId: "pay_2", paymentId: "TXN_FEE_201", orderId: "TXN_FEE_201", amount: 1000000, fee: 15000, tax: 0, method: "card", status: "captured", capturedAt: now, createdAt: now }],
          settlements: [{ dbId: "set_2", settlementId: "set_FEE_201", paymentId: "TXN_FEE_201", amount: 980000, fee: 20000, tax: 0, utr: "UTR_FEE_201", status: "settled", settledAt: now, createdAt: now }],
          bankTransactions: [{ dbId: "bnk_2", txnId: "bnk_FEE_201", utr: "UTR_FEE_201", amount: 980000, type: "CREDIT", narration: "Bank Credit TXN_FEE_201", txnDate: now, matched: false }],
          refunds: [],
          chargebacks: [],
          groundTruths: [],
        },
        aiHypothesis: "Variance of ₹50.00 is caused by an unannounced fee tier upgrade (200 bps vs contractual 150 bps).",
        claims: [
          { type: "CONTRACTUAL_FEE_SCHEDULE", claimText: "Active merchant policy rate is 1.5% (15,000 paise)", status: "VERIFIED", validationCheck: "Policy-as-Code Contract ID: POL_FEE_2026", details: "Policy specifies 150 bps tier for credit card transactions" },
          { type: "PROCESSOR_OVERBILLING", claimText: "Processor withheld 20,000 paise (overbilling of 5,000 paise)", status: "VERIFIED", validationCheck: "20,000 billed - 15,000 expected == 5,000 paise variance", details: "Direct mathematical discrepancy against fee agreement" },
        ],
        proposedCorrection: "Raise automated clawback dispute against payment gateway for ₹50.00 and hold in PROCESSOR_DISPUTE_CLEARING.",
        targetAccount: "PROCESSOR_DISPUTE_CLEARING",
      };
    }

    case "chargeback": {
      // Payment ₹15,000 settled; chargeback opened after T+120 days
      return {
        name: "Expired Chargeback Reversal Risk",
        category: "CHARGEBACK_RISK",
        description: "Chargeback of ₹15,000 filed at T+120 days, exceeding the 90-day dispute SLA window defined by card networks.",
        batchData: {
          orders: [{ dbId: "ord_3", orderId: "TXN_CB_301", amount: 1500000, status: "paid", createdAt: tMinus120 }],
          payments: [{ dbId: "pay_3", paymentId: "TXN_CB_301", orderId: "TXN_CB_301", amount: 1500000, fee: 0, tax: 0, method: "card", status: "captured", capturedAt: tMinus120, createdAt: tMinus120 }],
          settlements: [{ dbId: "set_3", settlementId: "set_CB_301", paymentId: "TXN_CB_301", amount: 1500000, fee: 0, tax: 0, utr: "UTR_CB_301", status: "settled", settledAt: tMinus120, createdAt: tMinus120 }],
          bankTransactions: [],
          refunds: [],
          chargebacks: [{ dbId: "cb_3", chargebackId: "CB_9901", paymentId: "TXN_CB_301", amount: 1500000, status: "opened" }],
          groundTruths: [],
        },
        aiHypothesis: "Chargeback CB_9901 was initiated 120 days post-settlement, violating the 90-day network arbitration rule.",
        claims: [
          { type: "SLA_TIMING_WINDOW", claimText: "Dispute elapsed time is 120 calendar days", status: "VERIFIED", validationCheck: "Capture Date: T-120 days | Network Max Window: 90 days", details: "Exceeds Visa Core Rules & Cardholder Dispute Framework §11.2" },
          { type: "ARBITRATION_DEFENSE", claimText: "Valid documentation exists to assert auto-representment defense", status: "VERIFIED", validationCheck: "Delivery Proof SHA-256 (e4b281...) verified in Context Vault", details: "Sufficient evidence to request immediate reversal" },
        ],
        proposedCorrection: "Submit representment defense packet to merchant bank citing SLA expiration and reject chargeback liability.",
        targetAccount: "CHARGEBACK_ARBITRATION_SUSPENSE",
      };
    }

    case "delayed-settlement": {
      // Payment on Day T-5, Settlement arrives today
      return {
        name: "Delayed Settlement SLA Breach",
        category: "SLA_BREACH",
        description: "Payment captured 5 days ago settled today, breaching the contractual T+1 settlement SLA.",
        batchData: {
          orders: [{ dbId: "ord_4", orderId: "TXN_DELAY_401", amount: 800000, status: "paid", createdAt: tMinus5 }],
          payments: [{ dbId: "pay_4", paymentId: "TXN_DELAY_401", orderId: "TXN_DELAY_401", amount: 800000, fee: 0, tax: 0, method: "netbanking", status: "captured", capturedAt: tMinus5, createdAt: tMinus5 }],
          settlements: [{ dbId: "set_4", settlementId: "set_DELAY_401", paymentId: "TXN_DELAY_401", amount: 800000, fee: 0, tax: 0, utr: "UTR_DELAY_401", status: "settled", settledAt: now, createdAt: now }],
          bankTransactions: [{ dbId: "bnk_4", txnId: "bnk_DELAY_401", utr: "UTR_DELAY_401", amount: 800000, type: "CREDIT", narration: "Late Netbanking Settlement", txnDate: now, matched: false }],
          refunds: [],
          chargebacks: [],
          groundTruths: [],
        },
        aiHypothesis: "Settlement arrived at T+5 days due to bank nodal account clearing delay during long weekend.",
        claims: [
          { type: "SETTLEMENT_AGING_CHECK", claimText: "Aging duration is 120 hours (5 business days)", status: "VERIFIED", validationCheck: "Expected SLA: T+1 (24 hours) | Actual: T+5 (120 hours)", details: "Gateway delayed payout beyond SLA standard" },
          { type: "LIQUIDITY_NEUTRALITY", claimText: "Final gross funds (₹8,000.00) match order total exactly", status: "VERIFIED", validationCheck: "800,000 == 800,000 paise (0 variance)", details: "Principal funds intact with zero balance shortfall" },
        ],
        proposedCorrection: "Clear delayed transit ledger balance and tag gateway for monthly SLA breach penalty deduction.",
        targetAccount: "NODAL_CLEARING_AC",
      };
    }

    case "duplicate-payment":
    default: {
      // Payment ₹5,000; two bank credits of ₹5,000
      return {
        name: "Duplicate Bank Credit Detection",
        category: "DUPLICATE_CREDIT",
        description: "Bank statement contains two separate credit entries of ₹5,000 for a single ₹5,000 order settlement.",
        batchData: {
          orders: [{ dbId: "ord_5", orderId: "TXN_DUP_501", amount: 500000, status: "paid", createdAt: now }],
          payments: [{ dbId: "pay_5", paymentId: "TXN_DUP_501", orderId: "TXN_DUP_501", amount: 500000, fee: 0, tax: 0, method: "upi", status: "captured", capturedAt: now, createdAt: now }],
          settlements: [{ dbId: "set_5", settlementId: "set_DUP_501", paymentId: "TXN_DUP_501", amount: 500000, fee: 0, tax: 0, utr: "UTR_DUP_501", status: "settled", settledAt: now, createdAt: now }],
          bankTransactions: [
            { dbId: "bnk_5a", txnId: "bnk_DUP_501A", utr: "UTR_DUP_501", amount: 500000, type: "CREDIT", narration: "Bank Credit UPI TXN_DUP_501", txnDate: now, matched: false },
            { dbId: "bnk_5b", txnId: "bnk_DUP_501B", utr: "UTR_DUP_501", amount: 500000, type: "CREDIT", narration: "Duplicate Bank Credit UPI TXN_DUP_501", txnDate: now, matched: false },
          ],
          refunds: [],
          chargebacks: [],
          groundTruths: [],
        },
        aiHypothesis: "Bank nodal switch executed an duplicate credit posting of ₹5,000.00 for single transaction TXN_DUP_501.",
        claims: [
          { type: "DUPLICATE_IDENTIFIER_MATCH", claimText: "Two bank credit records share identical UTR: UTR_DUP_501", status: "VERIFIED", validationCheck: "bnk_DUP_501A and bnk_DUP_501B both match UTR_DUP_501", details: "Exact UTR collision detected on bank credit stream" },
          { type: "OVER_CREDIT_DETECTION", claimText: "Bank credits total ₹10,000 vs Payment ₹5,000 (₹5,000 surplus)", status: "VERIFIED", validationCheck: "1,000,000 paise received - 500,000 paise captured == 500,000 paise excess", details: "Over-credit requires treasury refund" },
        ],
        proposedCorrection: "Post ₹5,000.00 adjustment to UNCLAIMED_BANK_CREDITS and notify treasury for bank clawback.",
        targetAccount: "UNCLAIMED_BANK_CREDITS",
      };
    }
  }
}

export async function runSingleScenario(scenarioId: string): Promise<ScenarioResult> {
  const { name, category, description, batchData, aiHypothesis, claims, proposedCorrection, targetAccount } = buildScenarioData(scenarioId);

  const indexes = buildIndexes(batchData);
  const results = matchAllRecords(batchData, indexes);
  await applyCardinalityMatching(results, batchData);

  let autoMatched = 0;
  let suggested = 0;
  let exception = 0;

  const exceptions: ScenarioResult["exceptions"] = [];

  results.forEach((res, idx) => {
    if (res.status === "AUTO_MATCHED") {
      autoMatched++;
    } else if (res.status === "SUGGESTED_MATCH") {
      suggested++;
    } else {
      exception++;
      const mismatch = res.mismatchAmount ?? (res.expectedNetAmount - (res.actualSettledAmount ?? 0));
      exceptions.push({
        id: `EXP_${res.paymentId || idx + 1}`,
        type: res.status,
        description: res.matchDetails || `Discrepancy detected for reference ${res.paymentId}`,
        amountPaise: Math.abs(mismatch),
        formattedAmount: formatCurrency(Math.abs(mismatch)),
        referenceId: res.paymentId,
        expectedNetPaise: res.expectedNetAmount,
        actualSettledPaise: res.actualSettledAmount,
      });
    }
  });

  return {
    scenarioId,
    scenarioName: name,
    category,
    description,
    summary: {
      autoMatched,
      suggested,
      exception,
      total: results.length,
    },
    exceptions,
    aiSuggestion: {
      available: true,
      confidenceScore: 0.96,
      hypothesis: aiHypothesis,
      claims,
      proposedCorrection,
      targetAccount,
      makerCheckerRequired: true,
    },
    processedAt: new Date().toISOString(),
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const scenarioId = String(body.scenarioId || "partial-refund");

    if (scenarioId === "all") {
      const allScenarios = ["partial-refund", "fee-discrepancy", "chargeback", "delayed-settlement", "duplicate-payment"];
      const results: ScenarioResult[] = [];
      for (const s of allScenarios) {
        results.push(await runSingleScenario(s));
      }
      return NextResponse.json({
        success: true,
        scenarios: results,
        totalScenariosExecuted: results.length,
        processedAt: new Date().toISOString(),
      });
    }

    const result = await runSingleScenario(scenarioId);
    return NextResponse.json({
      success: true,
      scenario: result,
      processedAt: new Date().toISOString(),
    });
  } catch (err) {
    // safeErrorResponse masks 5xx detail; the raw message leaked matcher and
    // scenario-builder internals to the caller.
    return safeErrorResponse(err, 500, "SCENARIO_ERROR");
  }
}
