/*
 * Pipeline versions — the single source of truth for what versions a reconciliation run executes.
 *
 * Every run captures these (persisted in RunMetadata) so a run can be reproduced and audited:
 * the provider schema the batch data conforms to, the normalizer, the matcher, the cardinality
 * solver, the financial-invariants ruleset, the decision policy, the model, and the engine itself.
 *
 * Replay identity is built from this set: same input fingerprint + same version set ⇒ the same
 * deterministic reconciliation outcome. If a layer's version changes, previously stored runs are
 * detected as no longer reproducible against the current pipeline.
 */

export const PIPELINE_VERSIONS = {
  /** Schema of the source records (Razorpay order/payment/settlement/refund/chargeback shapes). */
  providerSchema: "1.0",
  /** src/lib/reconciliation/normalizer.ts */
  normalizer: "1.0",
  /** src/lib/reconciliation/matcher.ts */
  matcher: "1.0",
  /** src/lib/reconciliation/cardinality.ts + apply-cardinality.ts */
  cardinality: "1.0",
  /** src/lib/reconciliation/invariants.ts financial-invariants ruleset */
  ruleset: "1.0",
  /** src/lib/reconciliation/decision.ts decision policy (risk triggers/config) */
  policy: "1.0",
  /** The decision model governing confidence/risk classification (rule-based in this version). */
  model: "1.0",
  /** src/lib/reconciliation/engine.ts orchestration */
  engine: "1.0",
} as const;

export type PipelineVersions = typeof PIPELINE_VERSIONS;
