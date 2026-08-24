/*
 * SettleMate AI — Claim Verification & Deliberate Fabrication Attack Benchmark
 */

import { DeterministicClaimValidator } from "../src/lib/ai/claim-validator";
import type { AIClaim } from "../src/lib/ai/claim-types";
import type { CouncilReviewRequest } from "../src/lib/ai/council";
import type { EvidenceItem } from "../src/lib/evidence/types";

function runBenchmark() {
  console.log("\n=========================================================================");
  console.log(" SETTLEMATE AI — CLAIM VERIFICATION & FABRICATION ATTACK BENCHMARK (DAY 2–3)");
  console.log("=========================================================================\n");

  const validator = new DeterministicClaimValidator();
  const baseDate = new Date("2026-08-20T10:00:00Z");

  const evidence: EvidenceItem[] = [
    {
      evidenceId: "ev_ref_8821",
      sourceType: "REFUND",
      sourceReference: "REFUND-8821",
      title: "Processed Refund #8821",
      contentHash: "hash_ref_8821",
      accessClassification: "CONFIDENTIAL",
      linkedRecords: { paymentIds: ["pay_1001"], refundIds: ["ref_8821"] },
      provider: "GATEWAY",
      structuredData: { paymentId: "pay_1001", refundAmountPaise: 155000 },
      createdAt: baseDate,
    },
    {
      evidenceId: "ev_setl_882",
      sourceType: "SETTLEMENT",
      sourceReference: "Settlement S882",
      title: "Bank Settlement S882",
      contentHash: "hash_setl_882",
      accessClassification: "CONFIDENTIAL",
      linkedRecords: { paymentIds: ["pay_1001"], settlementIds: ["setl_1001"] },
      provider: "BANK",
      structuredData: { paymentId: "pay_1001", settlementAmountPaise: 1845000 },
      createdAt: baseDate,
    },
  ];

  const request: CouncilReviewRequest = {
    exceptionId: "exc_1001",
    exceptionType: "AMOUNT_MISMATCH",
    amountPaise: 2000000,
    discrepancyPaise: 155000,
    riskLevel: "HIGH",
    evidenceItems: evidence,
    paymentRecord: { paymentId: "pay_1001", amount: 2000000, fee: 0, tax: 0, createdAt: baseDate },
    settlementRecord: { settlementId: "setl_1001", amount: 1845000, fee: 0, tax: 0, settledAt: baseDate, utr: "UTR_882" },
    refundRecord: { refundId: "ref_8821", amount: 155000, status: "processed", createdAt: baseDate },
  };

  // Scenario 1: Authentic Claim
  const validClaim: AIClaim = {
    claimId: "C17",
    type: "FINANCIAL_EXPLANATION",
    statement: "₹1,550 refund explains the observed variance.",
    evidenceIds: ["ev_ref_8821", "ev_setl_882"],
    assertedValues: [{ key: "refundAmount", value: 155000, expectedPaise: 155000, observedPaise: 155000 }],
    confidence: 96,
    uncertainties: [],
  };

  const startValid = performance.now();
  const validRes = validator.validateClaim(validClaim, request);
  const durValid = performance.now() - startValid;

  console.log("  [Scenario 1] Authentic Claim Validation:");
  console.log("    * Claim:                 " + validClaim.statement);
  console.log("    * Deterministic Status:  " + validRes.status);
  console.log("    * Checks Passed:         " + validRes.checks.filter((c) => c.passed).length + " / " + validRes.checks.length);
  console.log("    * Evaluation Duration:   " + durValid.toFixed(3) + " ms");

  // Scenario 2: Deliberate Fabrication Attack
  const tamperedRequest: CouncilReviewRequest = {
    ...request,
    refundRecord: { refundId: "ref_8821", amount: 140000, status: "processed", createdAt: baseDate },
  };

  const startFab = performance.now();
  const fabRes = validator.validateClaim(validClaim, tamperedRequest);
  const durFab = performance.now() - startFab;

  console.log("\n  [Scenario 2] Deliberate Fabrication Attack (Investigator claims ₹1,550, Evidence is ₹1,400):");
  console.log("    * Deterministic Status:  " + fabRes.status);
  console.log("    * Dispute Reasons:       " + fabRes.disputeReasons.join(" | "));
  console.log("    * Evaluation Duration:   " + durFab.toFixed(3) + " ms");

  // Multi-iteration throughput
  const iterations = 10000;
  const startPerf = performance.now();
  for (let i = 0; i < iterations; i++) {
    validator.validateClaim(validClaim, request);
  }
  const totalPerf = performance.now() - startPerf;

  console.log("\n  [Throughput Benchmark]:");
  console.log("    * Total Claims Validated: " + iterations);
  console.log("    * Total Time:             " + totalPerf.toFixed(2) + " ms");
  console.log("    * Validation Speed:       " + Math.round((iterations / totalPerf) * 1000).toLocaleString() + " claims/sec");
  console.log("    * Average Latency:        " + ((totalPerf / iterations) * 1000).toFixed(2) + " µs/claim\n");
}

runBenchmark();
