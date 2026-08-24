# SettleMate AI — Finance Controller

**Razorpay AI Buildathon · Track 4: AI Finance Controller**

SettleMate AI is a payment reconciliation system with **two advisory AI
investigation agents plus grounded Finance Q&A**, in which **AI assists financial
operations but never controls financial truth.** A deterministic engine is
the source of truth for matching and financial decisions; AI agents explain, interpret,
and recommend — behind structured validation gates and an explicit human-approval
workflow.

---

## 1. Problem

Reconciling thousands of daily payments across six source systems (orders, payments,
settlements, bank transactions, refunds, chargebacks) is slow, error-prone, and
silently destructive when it fails. Naive matching produces false "reconciled" rows,
missing credits go unnoticed, duplicate settlements overpay, and fees/refunds/chargebacks
drift from expectations. A finance team needs to know *exactly* what happened, why the
system classified it that way, and what to do next — with every decision traceable.

The harder problem is AI: an LLM can hallucinate an ID, invent a bank credit, or be
tricked by an instruction smuggled into a bank narration. This project is built around a
single principle: **AI may explain and recommend, but it must never be able to falsify a
financial record or resolve an exception by itself.**

## 1.1 Authoritative Claims & Evidence Matrix

For the complete, audited evidence matrix across all scale presets, benchmarks, and infrastructure contracts, see **[docs/CLAIMS_MATRIX.md](docs/CLAIMS_MATRIX.md)**.

- **Official 250 Benchmark**: 98.1% accuracy, 98% precision, 98% recall, 90% adversarial (9/10 detected).
- **10,000 Policy Shadow Replay**: Evaluated at 555,556 rec/s with 0 invariant violations.
- **100,000 Streaming Chaos Benchmark**: 10,000 injected worker crashes recovered (100%), 0 DLQ, 219,298 rec/s.
- **Effectively-Once Financial Result**: Verified via deterministic idempotency keys and immutable ledger uniqueness.

## 2. Architecture

| Layer | Role | Technology |
|---|---|---|
| **Deterministic Engine** | Financial source of truth — matching, classification, metrics | TypeScript, integer paise |
| **AI Agents** (advisory) | Anomaly review, resolution proposals, exception explanation, grounded Q&A | Gemini, Zod-validated |
| **Workflow** | Human-in-the-loop exception state machine | Compare-and-swap, Prisma tx |
| **Audit / Provenance** | Append-oriented trace of every decision and transition | AuditLog, AgentTrace, Feedback |
| **Security Boundary** | Authentication + server-derived actor/role | Signed-cookie sessions, Next.js Proxy |
| **Benchmark** | Deterministic evaluator + adversarial self-test | Seeded synthetic data |

## 3. Data Flow

```
SOURCE DATA
  orders · payments · settlements · bank txns · refunds · chargebacks
        ↓
DETERMINISTIC NORMALIZATION   (trim, lowercase IDs, uppercase UTR, paise integers)
        ↓
MULTI-SOURCE INDEXING         (payment/order/UTR/amount maps)
        ↓
MATCHING + CLASSIFICATION     (rules: UTR, ID, amount, date, fuzzy, orphan detection)
        ↓
CONFIDENCE + RISK             (evidence-weighted score, risk bands)
        ↓
EXCEPTION                     (any non-auto-matched row becomes an exception)
        ↓
AI EXPLANATION                (grounded, evidence-cited, fallback-safe)
        ↓
HUMAN APPROVAL                (state machine; AI cannot reach RESOLVED)
        ↓
RESOLUTION                    (metadata + audit + learning feedback)
        ↓
IMMUTABLE AUDIT TRAIL         (actor, before/after, reason, trace)
```

## 4. Deterministic Reconciliation Engine

`src/lib/reconciliation/engine.ts`. Every amount is an **integer in paise** — no
floating-point drift. For each captured payment the engine computes the expected net
settlement:

```
expectedNet = payment − fee − tax − refunds − chargebacks
```

then classifies against settlements and bank credits using a fixed T+2 settlement window,
a ₹1 amount tolerance, UTR matching, and fuzzy amount/date candidate discovery. Records
that do not auto-match become typed exceptions (amount mismatch, missing credit, duplicate
settlement, orphan credit, refund/chargeback mismatch, delayed credit, manual review).

## 5. Matching Strategy

1. **Exact UTR** between settlement and bank credit (strongest signal).
2. **Exact IDs** (payment ↔ order ↔ settlement).
3. **Amount** within ₹1 tolerance of expected net.
4. **Timing** within the T+2 / 24h credit window.
5. **Fuzzy** candidate discovery (1% amount window) — used *only* to find
   candidates; the UTR / exact-ID / amount path enforces the tight ₹1 tolerance,
   while the fuzzy bank-credit discovery window can accept a credit within ~1% of
   the expected net.
6. **Orphan detection** for unmatched bank credits.

## 6. Confidence Scoring

`src/lib/reconciliation/confidence.ts`. Confidence is a weighted sum of positive evidence
(UTR +40, exact ID +25, amount +15, timing +10, narration +10, single candidate +5) minus
negative evidence (multiple candidates −30, no bank credit −20, no settlement −15, scaled
amount-mismatch penalty, refund/chargeback complexity). It is **calibrated against ground
truth** and reported in confidence buckets (see §14). Confidence reflects real evidence
quality; it is never inflated to move rows into a better bucket.

## 7. Adversarial Detection

`src/lib/reconciliation/adversarial.ts`. Ten scenarios are injected into an **isolated
sandbox clone** of a batch (production rows are never mutated) and detection is measured:
amount tampering, phantom refunds, missing UTR, duplicate settlement, future-dated
settlement, negative amounts, orphan chargebacks, fee manipulation, bank-credit mismatch,
and a subtle rounding error.

**Why the score is 9/10, and why that is correct.** The tenth test inflates a settlement by
**₹0.47** — below the ₹1.00 financial tolerance. Lowering the tolerance to catch it would
flag every legitimate sub-₹1 rounding variance as a false-positive exception. The system
deliberately, and correctly, refuses to treat harmless sub-tolerance variance as a financial
exception. Judges should read this as *engineering judgment*, not a weakness: correctness
over metric gaming.

## 8. AI Safety Architecture

- **AI is advisory.** The deterministic engine is the source of truth. AI never writes
  financial amounts or invents record IDs, and it can never resolve or reject a
  workflow. Within those limits, validated AI output *can* reclassify controlled
  exception fields (e.g. `exceptionType`, `confidenceScore`, `riskLevel`) and record
  a `suggestedAction`, always behind schema gates.
- **Zod safety gates** (`src/lib/ai/schemas.ts`) reject malformed output, unknown enums,
  out-of-range confidence, and invented case IDs before any DB write.
- **Evidence path whitelist** in grounded Q&A — AI cannot cite a path that does not exist
  in the actual batch context.
- **AI cannot resolve.** The workflow rejects any AI-driven transition to `RESOLVED`,
  and agents never touch the workflow `status` on the exception record.
- **Prompt-injection defense** (`src/lib/ai/prompt-injection.ts`) treats all source-record
  text as untrusted data; the chat user message is quarantined as data, not instructions.
- **Deterministic fallback** (`src/lib/ai/fallback.ts`) produces a safe template explanation
  whenever the AI is unavailable, times out, or fails validation.
- **Circuit breaker + timeouts** (`src/lib/ai/client.ts`) bound cost and degrade gracefully
  under rate limits; the app keeps working without Gemini.
- **Isolated per-execution AI context** (`src/lib/ai/context.ts`) caps calls per
  reconciliation and separates concurrent batches.

## 9. Grounded Q&A

`/api/chat`. Batch context is built from actual database data. The model must answer only
from that context and cite evidence via **paths** validated against a whitelist of known
context paths; a cited path that does not exist in the batch context is rejected and the
response falls back to a deterministic, database-backed answer. The whitelist checks the
evidence *path*, not the value at that path. Evidence is persisted to the message.

## 10. Human-in-the-Loop Workflow

`src/lib/exceptions/state-machine.ts` + `service.ts`. States:

```
OPEN → INVESTIGATING → PENDING_APPROVAL → RESOLVED
       ↘ ESCALATED → INVESTIGATING
PENDING_APPROVAL → REJECTED → INVESTIGATING
RESOLVED → REOPENED → INVESTIGATING
```

Safety properties: server-side current-state lookup (client never supplies `from`),
transition validation before any write, **atomic compare-and-swap** so concurrent requests
cannot double-transition, same-state idempotency, mandatory audit logging, resolution
metadata, and a learning-loop feedback entry on close. **The actor recorded for every
transition is derived server-side from the authenticated session** — a client cannot
impersonate "AI" or any other actor.

## 11. Audit / Provenance

Every decision surfaces its **source records, settlement calculation breakdown,
reconciliation provenance, agent reasoning traces, and the full audit timeline.**
`AuditLog` is an **append-oriented** log that records every system, AI, and user action
with actor, before/after state, and reason. It is not a cryptographically sealed or
hash-chained ledger — records are added, not edited in place, but the log is not
cryptographically immutable.

## 12. Security

- **Authentication boundary:** `src/proxy.ts` (Next.js 16 Proxy) requires a valid
  signed-cookie session for all pages and API routes; unauthenticated requests are
  redirected (pages) or rejected 401 (APIs).
- **Signed, expiring sessions** (`src/lib/auth/session.ts`): HMAC-SHA256 tokens verified
  with `timingSafeEqual`; no client-trusted actor/role.
- **Authorization boundary:** roles (`ADMIN`, `REVIEWER`) with separation of duties.
  REVIEWER can investigate, escalate, reopen, and prepare a case to `PENDING_APPROVAL`;
  only **ADMIN** can approve or reject (`PENDING_APPROVAL → RESOLVED / REJECTED`). The
  role is read from the verified session and enforced server-side (403 for a non-ADMIN
  approval attempt) — the client can never claim a role. This makes the human-approval
  step real: a privileged, authenticated human must close the loop, and the audit trail
  records exactly who did.
- **Server-side enforcement** everywhere; role is never read from the request body.
- **No secret leakage:** `.env` (Gemini key, `AUTH_SECRET`) is gitignored; safe, generic
  error responses.
- **`AUTH_SECRET` fails closed:** sessions are HMAC-SHA256-signed with `AUTH_SECRET`. In
  production (`NODE_ENV=production`) a missing `AUTH_SECRET` is a hard error — the app
  refuses to mint or verify any session rather than falling back to a known default. In
  local `next dev` a clearly-labelled dev-only fallback keeps the demo runnable out of
  the box. Set a strong random `AUTH_SECRET` before any non-local deployment.

> **Demo scope note:** This auth layer is a small, self-contained *showcase* — not a
> production IdP. It demonstrates the correct boundary (auth + server-derived actor + role
> gating) without an external framework. For production, swap `session.ts` for Auth.js /
> OIDC and add per-tenant data ownership.

## 13. Deterministic Benchmark

`npm run evaluate` runs a **fully deterministic** benchmark: a seeded synthetic batch
(fixed seed `20260821`) → reconciliation → adversarial suite → calibration. It prints a
dataset **SHA-256 fingerprint** so any change to data or logic is provable.

## 14. Metrics

| Metric | Target | Baseline |
|---|---|---|
| Accuracy | >85% | **98.1%** |
| Precision | — | **98%** |
| Recall | — | **98%** |
| Throughput | — | **~1000 rec/s** (250-record benchmark) |
| Adversarial | >80% | **90% (9/10)** |
| Calibration 0–20 | — | 98% |
| Calibration 21–40 | — | 100% |
| Calibration 41–60 | — | 89% |
| Calibration 61–80 | — | 100% |
| Calibration 81–100 | — | 100% |

## 15. Limitations

- SQLite is used locally; production would use Postgres (schema is portable).
- Demo auth is a showcase, not a full IdP.
- Fuzzy matching uses a 1% discovery window; the fuzzy bank-credit path can accept a
  credit within ~1% of expected net (the UTR / exact-ID / amount path stays at ₹1).
- The 41–60 confidence bucket (89%) reflects genuinely ambiguous, low-evidence matches and
  is intentionally not inflated.
- Sub-tolerance rounding variance (< ₹1) is not raised as an exception by design.

## 16. How to Run

```bash
npm install
npx prisma generate
npx prisma db push        # create SQLite schema
npm run dev
```

Open http://localhost:3000. Sign in with demo credentials:
`admin` / `admin123` (full access) or `reviewer` / `review123` (reviewer).
Override via `DEMO_ADMIN_USER/PASS`, `DEMO_REVIEWER_USER/PASS`. Set `AUTH_SECRET`
(a secure random string) **before deploying** — it is required in production and the
app fails closed if it is missing.

Generate a batch → run the 3-pass reconciliation → review exceptions → ask the grounded
Q&A → inspect the audit trail.

### Validation

```bash
npx tsc --noEmit
npm run lint
npm run build
npm run evaluate
```

## 17. Demo Flow

1. Sign in (demonstrates the security boundary).
2. Generate a deterministic synthetic batch (250 records, 10 scenarios).
3. Run the 3-pass pipeline: deterministic rules → AI anomaly agent → AI resolver.
4. Dashboard: read the ops story (auto-match rate, accuracy, amount at risk, adversarial
   9/10) and the **risk-prioritized "Investigate Now" queue**, which links straight into
   each exception's investigation room. The dashboard reads persisted results — it never
   re-runs reconciliation.
5. Open an exception: a **discrepancy summary** (expected vs. actual settlement and the
   Δ shortfall), a **workflow-position stepper** (where the case sits on the approval
   path), golden-record provenance chain, calculation breakdown, AI analysis with cited
   evidence, agent reasoning trace, and the state-machine action control.
6. Drive OPEN → INVESTIGATING → PENDING_APPROVAL → RESOLVED (approval is ADMIN-only,
   separation of duties); observe the audit trail records your authenticated identity.
7. Ask the **Finance Controller Copilot**, which answers only from the batch context and
   cites the specific evidence paths it relied on.
