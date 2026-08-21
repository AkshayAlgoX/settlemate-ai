import { z } from "zod";

// ── Canonical enums (must stay in sync with engine.ts / evaluator.ts) ──
export const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;

export const RECONCILIATION_STATUSES = [
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

export const FIX_TYPES = [
  "FEE_CORRECTION",
  "REFUND_ADJUSTMENT",
  "SPLIT_SETTLEMENT",
  "WAIT_FOR_CREDIT",
  "CONTACT_SUPPORT",
  "CANNOT_FIX",
] as const;

// Accept a JSON number, or a numeric string (Gemini occasionally emits "85").
// Anything else (null, boolean, "abc") fails → the whole decision is rejected.
const Confidence100 = z
  .union([
    z.number(),
    z.string().regex(/^\d{1,4}(\.\d+)?$/),
  ])
  .transform((v) => Number(v))
  .refine((n) => Number.isFinite(n) && n >= 0 && n <= 100, {
    message: "confidence must be a number between 0 and 100",
  });

// ── Explainer output (single object) ──
export const ExplanationSchema = z.object({
  summary: z.string().min(1).max(500),
  reason: z.string().min(1).max(2000),
  evidence: z.array(z.string().min(1).max(300)).max(10).default([]),
  recommended_action: z.string().min(1).max(500),
  risk_level: z.enum(RISK_LEVELS),
  needs_manual_review: z.boolean(),
});

export type ExplanationOutput = z.infer<typeof ExplanationSchema>;

// ── Anomaly agent decision (array element) ──
export const AnomalyDecisionSchema = z.object({
  case_id: z.string().min(1),
  should_reclassify: z.boolean(),
  new_status: z.enum(RECONCILIATION_STATUSES),
  new_confidence: Confidence100,
  reasoning: z.string().max(500).default(""),
  anomaly_detected: z.string().max(500).nullable().default(null),
  risk_assessment: z.enum(RISK_LEVELS),
});

export type AnomalyDecision = z.infer<typeof AnomalyDecisionSchema>;

// ── Resolver agent decision (array element) ──
export const ReasoningStepSchema = z.object({
  step: z.coerce.number().int().min(1).max(50).default(1),
  label: z.string().min(1).max(200),
  detail: z.string().max(1000).default(""),
});

export const ResolverDecisionSchema = z.object({
  case_id: z.string().min(1),
  can_auto_fix: z.boolean(),
  proposed_fix: z.string().min(1).max(1000),
  fix_type: z.enum(FIX_TYPES),
  expected_accuracy_after_fix: Confidence100,
  evidence: z.array(z.string().min(1).max(300)).max(10).default([]),
  razorpay_ticket_needed: z.boolean(),
  ticket_subject: z.string().max(200).default(""),
  ticket_body: z.string().max(2000).default(""),
  reasoning_steps: z.array(ReasoningStepSchema).max(10).default([]),
  risk_if_applied: z.enum(RISK_LEVELS),
}).superRefine((d, ctx) => {
  // A logically contradictory decision is unsafe: reject it so it falls back.
  if (d.can_auto_fix && d.fix_type === "CANNOT_FIX") {
    ctx.addIssue({
      code: "custom",
      message: "can_auto_fix cannot be true while fix_type is CANNOT_FIX",
    });
  }
});

export type ResolverDecision = z.infer<typeof ResolverDecisionSchema>;

// ── Batch parsers: validate + cross-check case_id against the queried set ──
export function parseAnomalyDecisions(
  raw: unknown,
  allowedIds: Set<string>
): Map<string, AnomalyDecision> {
  if (!Array.isArray(raw)) return new Map();
  const out = new Map<string, AnomalyDecision>();
  for (const entry of raw) {
    const parsed = AnomalyDecisionSchema.safeParse(entry);
    if (!parsed.success || !allowedIds.has(parsed.data.case_id)) continue;
    if (!out.has(parsed.data.case_id)) out.set(parsed.data.case_id, parsed.data);
  }
  return out;
}

export function parseResolverDecisions(
  raw: unknown,
  allowedIds: Set<string>
): Map<string, ResolverDecision> {
  if (!Array.isArray(raw)) return new Map();
  const out = new Map<string, ResolverDecision>();
  for (const entry of raw) {
    const parsed = ResolverDecisionSchema.safeParse(entry);
    if (!parsed.success || !allowedIds.has(parsed.data.case_id)) continue;
    if (!out.has(parsed.data.case_id)) out.set(parsed.data.case_id, parsed.data);
  }
  return out;
}

// ── Chat response (grounded Q&A) ──
export const ChatResponseSchema = z.object({
  answer: z.string().min(1).max(2000),
  evidence_cited: z
    .array(z.string().min(1).max(300))
    .max(5)
    .default([]),
});

export type ChatResponseOutput = z.infer<typeof ChatResponseSchema>;

// Validates that each evidence string references an actual path in the
// provided context. This prevents invented evidence.
export function parseChatResponse(
  raw: unknown,
  allowedEvidencePaths: Set<string>
): ChatResponseOutput | null {
  const parsed = ChatResponseSchema.safeParse(raw);

  if (!parsed.success) {
    return null;
  }

  // Every cited evidence must correspond to a real context path.
  for (const evidence of parsed.data.evidence_cited) {
    const path = evidence.split(" = ")[0]?.trim();

    if (!path || !allowedEvidencePaths.has(path)) {
      // A cited path does not exist in the context → reject the whole response.
      return null;
    }
  }

  return parsed.data;
}

// ── Single source of truth for the active Gemini model ──
// gemini-2.0-flash was deprecated and shut down June 1, 2026.
// gemini-3.5-flash is the current recommended replacement.
export const CURRENT_AI_MODEL = "gemini-3.5-flash";