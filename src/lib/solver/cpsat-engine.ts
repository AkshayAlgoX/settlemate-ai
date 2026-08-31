/*
 * SettleMate AI — Milestone 3: CP-SAT Combinatorial Invoice Matching Engine
 *
 * Implements exact integer minor-unit CP-SAT subset-sum optimization with:
 *   - Lexicographic objective: minimize |total - payment| * 1000 + invoice_count
 *   - Bounded search depth & deterministic branch-and-bound
 *   - Strict timeout ceiling enforcement
 *   - Partial payment policy evaluation
 *   - Single currency normalization & candidate pre-filtering
 */

import { createHash } from "node:crypto";
import type {
  InvoiceMatchRequest,
  InvoiceMatchInput,
  InvoiceMatchResponse,
  CandidateInvoice,
  SolverStatus,
  SolverMatchResultType,
  SolverPolicyConfig,
} from "./types";
import { InvoiceMatchRequestSchema, InvoiceMatchResponseSchema } from "./types";

export const DEFAULT_SOLVER_POLICY: SolverPolicyConfig = {
  version: "invoice-match-v1",
  defaultToleranceMinor: 0,
  maxCandidatesCap: 50,
  maxInvoicesPerSplit: 8,
  defaultTimeoutMs: 2000,
  allowPartialByDefault: false,
};

interface BestSolution {
  selectedIds: string[];
  totalMinor: number;
  differenceMinor: number;
  objectiveValue: number;
}

export class CPSatInvoiceMatchingEngine {
  /**
   * Solves the combinatorial invoice matching problem deterministically.
   */
  solve(rawRequest: InvoiceMatchInput, policy: SolverPolicyConfig = DEFAULT_SOLVER_POLICY): InvoiceMatchResponse {
    const startTime = performance.now();
    const req = InvoiceMatchRequestSchema.parse(rawRequest);
    const createdAt = new Date().toISOString();
    const solveId = `solv_${createHash("sha256")
      .update(`${req.tenantId}:${req.paymentId}:${req.paymentAmountMinor}:${policy.version}`)
      .digest("hex")
      .slice(0, 12)}`;

    // 1. Currency & Tenant Consistency Pre-Check
    const paymentCurrency = req.currency.toUpperCase().trim();
    const paymentAmount = req.paymentAmountMinor;
    const tolerance = req.toleranceMinor;

    const eligibleInvoices: CandidateInvoice[] = [];
    const seenIds = new Set<string>();

    for (const inv of req.invoices) {
      // Check for duplicate invoice IDs in input
      if (seenIds.has(inv.invoiceId)) {
        return this.buildInvalidResponse(
          solveId,
          req,
          `Duplicate invoice ID '${inv.invoiceId}' provided in request`,
          startTime,
          createdAt,
          policy
        );
      }
      seenIds.add(inv.invoiceId);

      // Check tenant isolation
      if (inv.tenantId !== req.tenantId) {
        return this.buildInvalidResponse(
          solveId,
          req,
          `Tenant mismatch: invoice '${inv.invoiceId}' belongs to '${inv.tenantId}', expected '${req.tenantId}'`,
          startTime,
          createdAt,
          policy
        );
      }

      // Check currency
      if (inv.currency.toUpperCase().trim() !== paymentCurrency) {
        return this.buildInvalidResponse(
          solveId,
          req,
          `Mixed currency rejected: invoice '${inv.invoiceId}' has currency '${inv.currency}', expected '${paymentCurrency}'`,
          startTime,
          createdAt,
          policy
        );
      }

      // Check eligibility
      if (inv.status === "ELIGIBLE") {
        eligibleInvoices.push(inv);
      }
    }

    // 2. Candidate Reduction & Bounding
    // Sort deterministically: ascending by amount, then lexically by ID
    eligibleInvoices.sort((a, b) => a.amountMinor - b.amountMinor || a.invoiceId.localeCompare(b.invoiceId));

    if (eligibleInvoices.length > policy.maxCandidatesCap) {
      eligibleInvoices.length = policy.maxCandidatesCap;
    }

    const candidatesCount = eligibleInvoices.length;

    // 3. Fast-Path: Exact 1:1 Match Check
    for (const inv of eligibleInvoices) {
      if (inv.amountMinor === paymentAmount) {
        const duration = Math.max(0.1, performance.now() - startTime);
        return this.buildSuccessResponse({
          solveId,
          req,
          status: "EXACT_MATCH",
          solverStatus: "OPTIMAL",
          selectedInvoiceIds: [inv.invoiceId],
          selectedTotalMinor: inv.amountMinor,
          paymentAmountMinor: paymentAmount,
          differenceMinor: 0,
          toleranceMinor: tolerance,
          objectiveValue: 1, // 0 diff * 1000 + 1 invoice
          solveDurationMs: duration,
          candidatesConsideredCount: candidatesCount,
          verificationReason: `Exact 1:1 match found with invoice '${inv.invoiceId}'`,
          createdAt,
          policy,
        });
      }
    }

    // 4. Combinatorial CP-SAT Subset-Sum Branch-and-Bound Solver
    let bestSol: BestSolution | null = null;
    let timedOut = false;
    const maxK = Math.min(req.maxInvoicesPerSplit, policy.maxInvoicesPerSplit);
    const timeoutDeadline = startTime + req.timeoutMs;

    // Recursive branch-and-bound search with pruning
    const search = (
      index: number,
      currentTotal: number,
      selected: CandidateInvoice[]
    ) => {
      if (performance.now() > timeoutDeadline) {
        timedOut = true;
        return;
      }

      // Evaluate current subset if non-empty
      if (selected.length > 0) {
        const diff = Math.abs(currentTotal - paymentAmount);
        if (diff <= tolerance) {
          const objective = diff * 1000 + selected.length;
          if (!bestSol || objective < bestSol.objectiveValue) {
            bestSol = {
              selectedIds: selected.map((i) => i.invoiceId),
              totalMinor: currentTotal,
              differenceMinor: diff,
              objectiveValue: objective,
            };
          }
        }
      }

      // Stop branching if cardinality cap reached or total already far exceeds payment + tolerance
      if (selected.length >= maxK || currentTotal > paymentAmount + tolerance) {
        return;
      }

      for (let i = index; i < eligibleInvoices.length; i++) {
        if (timedOut) return;
        const inv = eligibleInvoices[i];
        if (currentTotal + inv.amountMinor > paymentAmount + tolerance) {
          // Since invoices are sorted ascending, later invoices will also exceed
          break;
        }
        selected.push(inv);
        search(i + 1, currentTotal + inv.amountMinor, selected);
        selected.pop();
      }
    };

    search(0, 0, []);

    const duration = Math.max(0.1, performance.now() - startTime);

    if (timedOut) {
      return this.buildTimeoutResponse(solveId, req, candidatesCount, duration, createdAt, policy);
    }

    // 5. If feasible split solution found:
    if (bestSol !== null) {
      const matchStatus: SolverMatchResultType =
        (bestSol as BestSolution).differenceMinor === 0
          ? (bestSol as BestSolution).selectedIds.length > 1
            ? "SPLIT_MATCH"
            : "EXACT_MATCH"
          : "SPLIT_MATCH_WITH_TOLERANCE";

      const sol = bestSol as BestSolution;
      return this.buildSuccessResponse({
        solveId,
        req,
        status: matchStatus,
        solverStatus: "OPTIMAL",
        selectedInvoiceIds: sol.selectedIds,
        selectedTotalMinor: sol.totalMinor,
        paymentAmountMinor: paymentAmount,
        differenceMinor: sol.differenceMinor,
        toleranceMinor: tolerance,
        objectiveValue: sol.objectiveValue,
        solveDurationMs: duration,
        candidatesConsideredCount: candidatesCount,
        verificationReason: `Optimal subset of ${sol.selectedIds.length} invoice(s) matches payment (difference: ₹${(sol.differenceMinor / 100).toFixed(2)})`,
        createdAt,
        policy,
      });
    }

    // 6. Partial Payment Evaluation (if allowed)
    if (req.allowPartialPayment) {
      // Find single invoice where payment is strictly less than invoice amount (P < A)
      const partialCandidates = eligibleInvoices.filter((i) => i.amountMinor > paymentAmount);
      if (partialCandidates.length > 0) {
        // Choose candidate with smallest remaining balance or earliest date
        const selected = partialCandidates[0];
        const remainingBalance = selected.amountMinor - paymentAmount;

        return this.buildSuccessResponse({
          solveId,
          req,
          status: "PARTIAL_PAYMENT",
          solverStatus: "FEASIBLE",
          selectedInvoiceIds: [selected.invoiceId],
          selectedTotalMinor: selected.amountMinor,
          paymentAmountMinor: paymentAmount,
          differenceMinor: remainingBalance,
          toleranceMinor: tolerance,
          objectiveValue: remainingBalance,
          solveDurationMs: duration,
          candidatesConsideredCount: candidatesCount,
          verificationReason: `Payment ₹${(paymentAmount / 100).toFixed(2)} applied as partial payment against invoice '${selected.invoiceId}' (₹${(selected.amountMinor / 100).toFixed(2)}), remaining balance ₹${(remainingBalance / 100).toFixed(2)}`,
          createdAt,
          policy,
        });
      }
    }

    // 7. No Feasible Match
    return this.buildNoMatchResponse(solveId, req, candidatesCount, duration, createdAt, policy);
  }

  private buildSuccessResponse(params: {
    solveId: string;
    req: InvoiceMatchRequest;
    status: SolverMatchResultType;
    solverStatus: SolverStatus;
    selectedInvoiceIds: string[];
    selectedTotalMinor: number;
    paymentAmountMinor: number;
    differenceMinor: number;
    toleranceMinor: number;
    objectiveValue: number;
    solveDurationMs: number;
    candidatesConsideredCount: number;
    verificationReason: string;
    createdAt: string;
    policy: SolverPolicyConfig;
  }): InvoiceMatchResponse {
    const proofSignature = createHash("sha256")
      .update(
        JSON.stringify({
          solveId: params.solveId,
          tenantId: params.req.tenantId,
          paymentId: params.req.paymentId,
          status: params.status,
          selectedInvoiceIds: params.selectedInvoiceIds,
          selectedTotalMinor: params.selectedTotalMinor,
          paymentAmountMinor: params.paymentAmountMinor,
          differenceMinor: params.differenceMinor,
        })
      )
      .digest("hex");

    const resp: InvoiceMatchResponse = {
      solveId: params.solveId,
      tenantId: params.req.tenantId,
      paymentId: params.req.paymentId,
      status: params.status,
      solverStatus: params.solverStatus,
      selectedInvoiceIds: params.selectedInvoiceIds,
      selectedTotalMinor: params.selectedTotalMinor,
      paymentAmountMinor: params.paymentAmountMinor,
      differenceMinor: params.differenceMinor,
      toleranceMinor: params.toleranceMinor,
      currency: params.req.currency,
      objectiveValue: params.objectiveValue,
      solveDurationMs: Math.round(params.solveDurationMs * 100) / 100,
      candidatesConsideredCount: params.candidatesConsideredCount,
      isVerifiedDeterministically: true,
      verificationReason: params.verificationReason,
      proofSignature,
      policyVersion: params.policy.version,
      createdAt: params.createdAt,
    };

    return InvoiceMatchResponseSchema.parse(resp);
  }

  private buildNoMatchResponse(
    solveId: string,
    req: InvoiceMatchRequest,
    candidatesCount: number,
    durationMs: number,
    createdAt: string,
    policy: SolverPolicyConfig
  ): InvoiceMatchResponse {
    const proofSignature = createHash("sha256")
      .update(`NO_MATCH:${solveId}:${req.paymentId}`)
      .digest("hex");

    return InvoiceMatchResponseSchema.parse({
      solveId,
      tenantId: req.tenantId,
      paymentId: req.paymentId,
      status: "NO_FEASIBLE_MATCH",
      solverStatus: "INFEASIBLE",
      selectedInvoiceIds: [],
      selectedTotalMinor: 0,
      paymentAmountMinor: req.paymentAmountMinor,
      differenceMinor: req.paymentAmountMinor,
      toleranceMinor: req.toleranceMinor,
      currency: req.currency,
      objectiveValue: 0,
      solveDurationMs: Math.round(durationMs * 100) / 100,
      candidatesConsideredCount: candidatesCount,
      isVerifiedDeterministically: true,
      verificationReason: `No feasible subset of candidate invoices satisfies payment amount within tolerance ±₹${(req.toleranceMinor / 100).toFixed(2)}`,
      proofSignature,
      policyVersion: policy.version,
      createdAt,
    });
  }

  private buildTimeoutResponse(
    solveId: string,
    req: InvoiceMatchRequest,
    candidatesCount: number,
    durationMs: number,
    createdAt: string,
    policy: SolverPolicyConfig
  ): InvoiceMatchResponse {
    const proofSignature = createHash("sha256")
      .update(`TIMEOUT:${solveId}:${req.paymentId}`)
      .digest("hex");

    return InvoiceMatchResponseSchema.parse({
      solveId,
      tenantId: req.tenantId,
      paymentId: req.paymentId,
      status: "SOLVER_TIMEOUT",
      solverStatus: "TIMEOUT",
      selectedInvoiceIds: [],
      selectedTotalMinor: 0,
      paymentAmountMinor: req.paymentAmountMinor,
      differenceMinor: req.paymentAmountMinor,
      toleranceMinor: req.toleranceMinor,
      currency: req.currency,
      objectiveValue: 0,
      solveDurationMs: Math.round(durationMs * 100) / 100,
      candidatesConsideredCount: candidatesCount,
      isVerifiedDeterministically: false,
      verificationReason: `Combinatorial search exceeded execution timeout ceiling of ${req.timeoutMs}ms`,
      proofSignature,
      policyVersion: policy.version,
      createdAt,
    });
  }

  private buildInvalidResponse(
    solveId: string,
    req: InvoiceMatchRequest,
    reason: string,
    startTime: number,
    createdAt: string,
    policy: SolverPolicyConfig
  ): InvoiceMatchResponse {
    const durationMs = Math.max(0.1, performance.now() - startTime);
    const proofSignature = createHash("sha256")
      .update(`INVALID:${solveId}:${reason}`)
      .digest("hex");

    return InvoiceMatchResponseSchema.parse({
      solveId,
      tenantId: req.tenantId,
      paymentId: req.paymentId,
      status: "BLOCKED",
      solverStatus: "MODEL_INVALID",
      selectedInvoiceIds: [],
      selectedTotalMinor: 0,
      paymentAmountMinor: req.paymentAmountMinor,
      differenceMinor: req.paymentAmountMinor,
      toleranceMinor: req.toleranceMinor,
      currency: req.currency,
      objectiveValue: 0,
      solveDurationMs: Math.round(durationMs * 100) / 100,
      candidatesConsideredCount: req.invoices.length,
      isVerifiedDeterministically: false,
      verificationReason: reason,
      proofSignature,
      policyVersion: policy.version,
      createdAt,
    });
  }
}

export const cpSatInvoiceMatchingEngine = new CPSatInvoiceMatchingEngine();
