/*
 * SettleMate AI — Milestone 3: OR-Tools Invoice Matching Types & Schemas
 *
 * Strict Zod schemas and domain model for combinatorial invoice matching:
 *   - Split payments (1 payment -> N invoices)
 *   - Partial payments (1 payment -> partial invoice)
 *   - Tolerance & fee discrepancy bounds
 *   - Deterministic result verification
 */

import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "../currency/fx-rates";

export const SolverMatchResultTypeEnum = z.enum([
  "EXACT_MATCH",
  "SPLIT_MATCH",
  "SPLIT_MATCH_WITH_TOLERANCE",
  "PARTIAL_PAYMENT",
  "NO_FEASIBLE_MATCH",
  "SOLVER_TIMEOUT",
  "INVALID_SOLVER_RESULT",
  "BLOCKED",
]);
export type SolverMatchResultType = z.infer<typeof SolverMatchResultTypeEnum>;

export const SolverStatusEnum = z.enum([
  "OPTIMAL",
  "FEASIBLE",
  "INFEASIBLE",
  "TIMEOUT",
  "MODEL_INVALID",
]);
export type SolverStatus = z.infer<typeof SolverStatusEnum>;

export const InvoiceStatusEnum = z.enum([
  "ELIGIBLE",
  "CONSUMED",
  "LOCKED",
  "DISPUTED",
]);
export type InvoiceStatus = z.infer<typeof InvoiceStatusEnum>;

export const CandidateInvoiceSchema = z.object({
  invoiceId: z.string().min(1).max(100),
  tenantId: z.string().min(1).max(100),
  amountMinor: z.number().int().positive(),
  currency: z.string().min(1).refine(
    (c) => SUPPORTED_CURRENCIES.includes(c.toUpperCase().trim()),
    { message: "Unsupported currency code" }
  ),
  status: InvoiceStatusEnum.default("ELIGIBLE"),
  invoiceDate: z.coerce.date().optional(),
  dueDate: z.coerce.date().optional(),
  customerReference: z.string().optional(),
});
export type CandidateInvoice = z.infer<typeof CandidateInvoiceSchema>;

export const InvoiceMatchRequestSchema = z.object({
  paymentId: z.string().min(1).max(100),
  tenantId: z.string().min(1).max(100),
  paymentAmountMinor: z.number().int().positive(),
  currency: z.string().min(1).refine(
    (c) => SUPPORTED_CURRENCIES.includes(c.toUpperCase().trim()),
    { message: "Unsupported currency code" }
  ),
  toleranceMinor: z.number().int().nonnegative().default(0),
  allowPartialPayment: z.boolean().default(false),
  maxInvoicesPerSplit: z.number().int().min(1).max(20).default(8),
  timeoutMs: z.number().int().min(100).max(10000).default(2000),
  invoices: z.array(CandidateInvoiceSchema).min(1).max(500),
  policyVersion: z.string().min(1).default("invoice-match-v1"),
});
export type InvoiceMatchRequest = z.infer<typeof InvoiceMatchRequestSchema>;
export type InvoiceMatchInput = z.input<typeof InvoiceMatchRequestSchema>;

export const InvoiceMatchResponseSchema = z.object({
  solveId: z.string().min(1),
  tenantId: z.string().min(1),
  paymentId: z.string().min(1),
  status: SolverMatchResultTypeEnum,
  solverStatus: SolverStatusEnum,
  selectedInvoiceIds: z.array(z.string()),
  selectedTotalMinor: z.number().int().nonnegative(),
  paymentAmountMinor: z.number().int().nonnegative(),
  differenceMinor: z.number().int().nonnegative(),
  toleranceMinor: z.number().int().nonnegative(),
  currency: z.string().min(1),
  objectiveValue: z.number().nonnegative(),
  solveDurationMs: z.number().nonnegative(),
  candidatesConsideredCount: z.number().int().nonnegative(),
  isVerifiedDeterministically: z.boolean(),
  verificationReason: z.string().min(1),
  proofSignature: z.string().length(64),
  policyVersion: z.string().min(1),
  createdAt: z.string().datetime(),
});
export type InvoiceMatchResponse = z.infer<typeof InvoiceMatchResponseSchema>;

export interface SolverPolicyConfig {
  version: string;
  defaultToleranceMinor: number;
  maxCandidatesCap: number; // e.g. 50
  maxInvoicesPerSplit: number; // e.g. 8
  defaultTimeoutMs: number; // 2000ms
  allowPartialByDefault: boolean;
}
