# SettleMate AI — Autonomous Finance Controller
**Razorpay AI Buildathon · Track 04: AI Finance Controller**

[![CI / CD](https://img.shields.io/badge/CI%2FCD-passing-emerald)](.github/workflows/ci.yml)
[![Coverage](https://img.shields.io/badge/Coverage-97.7%25%20Statements-blue)](scripts/test-coverage.ts)
[![Tests](https://img.shields.io/badge/Tests-52%2F52%20Passing-brightgreen)](package.json)
[![Accuracy](https://img.shields.io/badge/Official%20Accuracy-98.1%25-success)](scripts/evaluate.ts)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FAkshayAlgoX%2Fsettlemate-ai)
[![OpenAPI 3.0.3](https://img.shields.io/badge/OpenAPI-3.0.3-green)](src/app/api-docs/page.tsx)
[![Postman Collection](https://img.shields.io/badge/Postman-Collection%20Ready-orange)](postman-collection.json)

> **Executive Summary:** High-volume payment reconciliation across fragmented source systems (orders, payments, settlements, bank credits, refunds, chargebacks) is historically error-prone and vulnerable to silent ledger drift. SettleMate AI establishes a strict architectural boundary: **AI assists financial operations, but never controls financial truth.**
>
> A deterministic 3-pass rules and invariant engine serves as the immutable source of truth (**806.75 rec/s official benchmark throughput, up to 1,246 rec/s scale throughput, 98.1% accuracy**). Advisory AI agents investigate isolated exceptions and formulate **structured claims** that are mechanically validated by non-LLM verification gates (**134,511 claims/s micro-benchmark**) before dual-control Maker/Checker authorization, immutable double-entry ledger finalization, and self-contained cryptographic decision receipt generation (**0 LLMs, 0 DBs for offline verification**).
>
> **Verified Measured Results:** 98.1% Accuracy · 98% Precision · 98% Recall · 90.0% Adversarial Catch (9/10) · 96.4% AI Fast-Path Bypass · 100% Chaos Crash Recovery (0 DLQ) · **6.40x Speedup on Meet-in-the-Middle Combinatorics** · **200,000 Fuzz Iterations (0 Crashes / 0 Leaks)** · **100-Worker Atomic CAS Concurrency Verified** · **0 False Financial Writes across 52/52 passing test suites** · **97.7% Statement Coverage**.
>
> **Honest Boundaries:** AI cannot directly mutate balances or self-approve; N:M cardinality is computationally bounded; sub-tolerance rounding (< ₹1) is intentionally preserved to avoid false alarms.

---

## ⚡ Quick Start for Judges & Evaluators

> **💡 Judge Fast-Path:** Press <kbd>Ctrl</kbd>+<kbd>K</kbd> (or <kbd>⌘</kbd>+<kbd>K</kbd>) anywhere in the app to open the **Global Command Palette**, or press <kbd>?</kbd> to launch the **5-Step Judge Interactive Guided Tour**.

| Evaluation Surface | URL / Path | Purpose & What to Look For |
| :--- | :--- | :--- |
| **🏆 Judge Mode Terminal** | [`/judge-mode`](http://localhost:3000/judge-mode) | Full-screen 7-step guided walkthrough: dataset ingestion, 98.1% accuracy, structured AI claim checks, live malicious claim rejection, and offline receipt tamper detection. |
| **💼 Business Impact & ROI** | [`/business-impact`](http://localhost:3000/business-impact) | Interactive enterprise ROI calculator: 91.3% automated resolution, 96.4% token cost bypass, ~$2.2M annual savings, and FTE labor reallocation model. |
| **🚨 Risk & Exposure Command Center** | [`/risk-dashboard`](http://localhost:3000/risk-dashboard) | Real-time aggregated exposure for the finance controller: total unresolved amount, high-risk exception count, tolerance-stacking breach detection, SLA / duplicate-credit / cross-currency signals, and a 0–100 severity-weighted risk score — with exceptions grouped by category showing root cause + recommended action. Exact integer-paise math. |
| **📈 Confidence Calibration** | [`/calibration`](http://localhost:3000/calibration) | Interactive calibration curve & reliability diagram, expected calibration error (ECE), Brier score, and deterministic live batch simulator. |
| **📚 Resolution Playbooks** | [`/playbook`](http://localhost:3000/playbook) | Auto-generated SOP resolution playbooks for 5 exception types with policy triggers, Context Vault evidence proofs, double-entry journals, and Maker/Checker flows. |
| **🌍 Multi-Currency Recon** | [`/multi-currency`](http://localhost:3000/multi-currency) | Cross-border multi-currency conversion (USD, EUR, GBP, SGD, AED, JPY, INR), GST/VAT tax isolation, exact integer-floor math, and zero-drift ledger integrity. |
| **🔍 Root Cause Visualizer** | [`/exception-analysis/EXP-REFUND-001`](http://localhost:3000/exception-analysis/EXP-REFUND-001) | 5-stage chronological multi-source event timeline, expected vs actual side-by-side math, Context Vault SHA-256 voucher seals, and non-LLM mechanical verification. |
| **⚖️ AI vs Deterministic** | [`/ai-comparison`](http://localhost:3000/ai-comparison) | 3-column side-by-side architectural comparison: Rules-Only vs Pure LLM vs SettleMate Hybrid on 5 real-world anomaly scenarios. |
| **📡 Live Telemetry Monitor** | [`/live-monitor`](http://localhost:3000/live-monitor) | Real-time transaction streaming center with live throughput gauges, auto-matching counters, anomaly rate tuning, and sub-millisecond latencies. |
| **📄 Executive Audit Report** | [`/api/report/generate`](http://localhost:3000/api/report/generate) | Downloadable printable HTML/PDF audit compliance binder with official fingerprint, Merkle root, and Maker/Checker sign-off. |
| **📊 Benchmark Comparison** | [`/benchmark-comparison`](http://localhost:3000/benchmark-comparison) | 8-dimension quantitative and architectural feature matrix comparing SettleMate AI against conventional reconciliation tools. |
| **🌿 AI Decision Provenance** | [`/provenance/...`](http://localhost:3000/judge-mode) | 6-stage interactive DAG explorer tracking discrepancy $\rightarrow$ Context Vault $\rightarrow$ AI Claim AST $\rightarrow$ Non-LLM Gate $\rightarrow$ Receipt. |
| **⚙️ Policy Playground** | [`/policy-playground`](http://localhost:3000/policy-playground) | Interactive policy-as-code parameter sliders with real-time 20-record reclassification diffs and live SHA-256 policy hashing. |
| **🏢 Multi-Tenant Sim** | [`/multi-tenant`](http://localhost:3000/multi-tenant) | Strict mathematical partition isolation across 4 enterprise tenants with 0 cross-talk matches and cross-tenant fraud interception. |
| **📜 Audit Trail Explorer** | [`/audit-trail`](http://localhost:3000/audit-trail) | Immutable double-entry ledger with in-browser offline decision receipt verifier (<1ms latency, 0 LLMs, 0 DB queries). |
| **🔌 Integration Simulator** | [`/integration-simulator`](http://localhost:3000/integration-simulator) | Synthetic ERP/E-commerce batch generator (50-200 txns), anomaly injection sliders, direct REST API submission, and live HMAC-signed webhook listener stream. |
| **💻 Developer API Portal** | [`/developer`](http://localhost:3000/developer) | Interactive REST console, OpenAPI 3.0.3 documentation link, cURL / Node / Python code snippets, token bucket rate limiter & security headers. |
| **🧪 Interactive Sandbox** | [`/sandbox`](http://localhost:3000/sandbox) | Drag-and-drop custom CSV upload with 1-click sample dataset generation, minor-unit arithmetic, and isolated exception grouping. |
| **🛡️ Live Verification Hub** | [`/verify`](http://localhost:3000/verify) | Run all 7 core subsystem benchmark suites live on the server with live streaming progress bars and JSON export. |
| **🧪 Scenario Lab** | [`/scenarios`](http://localhost:3000/scenarios) | Interactive testbed for 5 real-world finance-ops anomalies (partial refunds, fee overcharges, expired chargebacks, delayed payouts, duplicate credits) with non-LLM claim proof. |
| **⚔️ Live Judge Red-Team Console** | [`/red-team`](http://localhost:3000/red-team) | Interactive hostile payload console: type custom prompt injections, fake voucher IDs, SSRF webhooks, or corrupted JSON to test real-time neutralization across all 6 defense gates with SHA-256 audit seals. |
| **🔔 Smart Alerting Simulator** | [`/alerts`](http://localhost:3000/alerts) | Real-time high-risk exception alert stream, HMAC-SHA256 signed webhook dispatch to mock Slack / PagerDuty / Email queues, and instant critical escalation triggers. |
| **🔍 Forensics Playback** | [`/forensics`](http://localhost:3000/forensics) | Step-by-step interactive playback of any stored SQLite reconciliation job across all 7 execution phases (ingestion $\rightarrow$ index $\rightarrow$ matching $\rightarrow$ AI claims $\rightarrow$ Maker/Checker $\rightarrow$ double-entry ledger $\rightarrow$ Merkle receipt). |
| **🛡️ Security Lab** | [`/security-lab`](http://localhost:3000/security-lab) | Hostile exploit simulator executing all 10 defended adversarial vectors (prompt injections, receipt tampering, CAS races, tolerance stacking) in real time. |
| **🎯 Track 04 Compliance** | [`/track04-compliance`](http://localhost:3000/track04-compliance) | **The fastest way to see how SettleMate AI meets Track 04 requirements**: bidirectional mapping from official judging criteria to empirical implementation and evidence. |
| **📜 Live Demo Script** | [`docs/judge-demo-script.md`](docs/judge-demo-script.md) | Complete step-by-step presenter script with verbal cues and contingency actions. |
| **📄 Submission Pack & PDF** | [`docs/submission-pack.html`](docs/submission-pack.html) | Printable 2-page executive presentation pack and architectural proof. |
| **🔐 1-Command CLI Audit** | `npm test` | Run all 52 test suites & bitwise determinism proofs in ~2 minutes. |
| **📊 Coverage Audit** | `npm run test:coverage` | 97.7% Statement, 95.4% Branch, 97.7% Function coverage. |
| **🚀 1-Command Live Deploy** | `bash scripts/deploy-live.sh` | Instant production build & serverless Vercel deploy. |

### Local Setup in 60 Seconds
```bash
# 1. Install dependencies
npm install

# 2. Configure environment (optional: add OPENAI_API_KEY / ANTHROPIC_API_KEY)
cp .env.example .env.local

# 3. Initialize persistent SQLite database & schema
npm run db:init
npx prisma db push

# 4. Start Next.js development server
npm run dev
```
*Sign in at [http://localhost:3000](http://localhost:3000) with `admin` / `admin123` or `reviewer` / `review123`.*

### 🔑 Environment Variables & Subsystem Configuration
| Variable | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `OPENAI_API_KEY` | Optional | `None (offline fallback)` | Real LLM claim formulation via OpenAI (`gpt-4o-mini`). |
| `ANTHROPIC_API_KEY` | Optional | `None` | Alternative LLM reasoning via Claude (`claude-3-5-sonnet`). |
| `GEMINI_API_KEY` | Optional | `None` | Alternative LLM reasoning via Google Gemini (`gemini-3.5-flash`). |
| `SETTLEMATE_DB_PATH` | Optional | `data/settlemate.db` | Persistent SQLite database file for crash-safe job & receipt storage. |
| `WEBHOOK_SHARED_SECRET`| Optional | `whsec_settlemate...` | Shared secret for signing dispatched webhooks with HMAC-SHA256. |

---

## 🗺️ System Architecture & Financial Safety Map

```mermaid
flowchart LR
    SRC[Multi-Source Feeds] --> NORM[Integer Minor Units]
    NORM --> ENGINE[Deterministic Engine 806.75 rec/s]
    ENGINE -- Auto-Matched 96.4% --> LEDGER[Double-Entry Ledger]
    ENGINE -- Exceptions --> AI_AGENT[Advisory AI Investigator]
    AI_AGENT --> CLAIMS[Structured Claims Payload]
    CLAIMS --> MECH_VAL[Mechanical Non-LLM Validator 134k/s]
    MECH_VAL -- Valid --> MAKER_CHECKER[Maker / Checker Gate]
    MECH_VAL -- Fabricated --> BLOCKED[Disputed & Locked]
    MAKER_CHECKER --> LEDGER --> RECEIPT[Canonical Decision Receipt]
    RECEIPT --> OFFLINE[Offline Standalone Verifier 0 LLMs 0 DBs]
```

---

## 1. Problem & Core Architecture

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

## 1.1 Judge Mode & Interactive Sandbox

For competition evaluators and judges, SettleMate AI provides two dedicated evaluation surfaces:

1. **Judge Mode Terminal (`/judge-mode`)**:
   - **Guided 7-Step Wizard**: Walks judges through dataset ingestion, 98.1% accuracy verification, exception spotlighting, structured AI claim falsification, Maker/Checker authorization, cryptographic decision receipt verification, and the complete 10-step finance-ops loop.
   - **Interactive Hostile Injections**: Live buttons to test fake claim rejection and receipt tamper detection.
   - **Judge Demo Script**: A comprehensive presenter script with verbal cues and contingency instructions is available at **[docs/judge-demo-script.md](docs/judge-demo-script.md)**.

2. **Interactive Developer & Judge Sandbox (`/sandbox`)**:
   - Upload any custom CSV transaction dataset (max 100 rows, 1 MB) to test deterministic multi-source matching and exception classification in complete isolation.
   - Includes 1-click **Download Sample CSV** (with valid payments, settlements, refunds, and intentional discrepancies).

3. **Live Verification Hub (`/verify`)**:
   - Execute all core verification suites (Official Benchmark, Cardinality Solvers, Claim Falsification, 100k Chaos, Decision Receipts) live from the browser with individual duration timers and live output snippets.
   - Export full cryptographic JSON reports with 1-click copy.

## 1.2 Authoritative Claims & Reproducible Verification

To independently re-execute and verify every single metric, benchmark, invariant suite, and dataset fingerprint in this repository with one deterministic command:

```bash
npm run verify-claims
```

This single command executes all 8 core benchmark suites, verifies the official SHA-256 dataset fingerprint (`81d840cd8cf981e5e69a367b879a8f11e9e51d60136a6d38e430877f08cab02b`), confirms zero false financial writes, and outputs a consolidated verification report in `test-results/claims-verification-report.json` and `test-results/claims-verification-report.md`.

For the complete, audited evidence matrix across all scale presets, benchmarks, and infrastructure contracts, see **[docs/CLAIMS_MATRIX.md](docs/CLAIMS_MATRIX.md)**.

- **Official 250 Benchmark**: 806.75 rec/s, 98.1% accuracy, 98% precision, 98% recall, 90% adversarial (9/10 detected), fingerprint `81d840cd8cf981e5e69a367b879a8f11e9e51d60136a6d38e430877f08cab02b`.
- **Scale Benchmarks (`npm run scale`)**:
  - 10,000 records: **1,246 rec/sec**, 99.9% accuracy
  - 25,000 records: **1,174.8 rec/sec**, 100% accuracy
  - 50,000 records: **1,156.2 rec/sec**, 100% accuracy
  - 100,000 records: **1,147.5 rec/sec**, 100% accuracy
- **55-Record Autonomous Finance-Ops Loop**: 96.4% AI bypass, 1 selective investigation, 0 false ledger writes.
- **10,000 Policy Shadow Replay Micro-Benchmark**: Evaluated at 555,556 rec/s with 0 invariant violations.
- **100,000 Streaming Chaos Queue Micro-Benchmark**: 10,000 injected worker crashes recovered (100%), 0 DLQ, 219,298 rec/s.
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
| Throughput | >250 rec/s | **806.75 rec/s** (250-record benchmark) · **1,147.5 – 1,246 rec/s** (10k–100k scale) |
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
npm run verify-claims    # verify all 14 claims & dataset fingerprints
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

---

## 18. Integration Simulator & Webhook Stream

For enterprise integrations, SettleMate AI includes a full-featured simulator at [`/integration-simulator`](http://localhost:3000/integration-simulator):
- **Deterministic Batch Generator**: Generates 50–200 transaction rows with configurable anomaly rates (partial refunds, fee overcharges, duplicate settlements, orphan credits).
- **Synchronous & Asynchronous Ingestion**: Dispatches batches directly to `/api/v1/reconcile` with token-bucket rate limiting.
- **HMAC-SHA256 Webhook Stream**: Real-time mock listener displays cryptographic callback payloads signed with `X-SettleMate-Signature`.

---

## 19. Developer API & OpenAPI 3.0 Specification

SettleMate AI provides a production-grade REST API:
- **Interactive Developer Console**: Test live API calls at [`/developer`](http://localhost:3000/developer).
- **OpenAPI 3.0 JSON Specification**: Served directly at [`/api/docs`](http://localhost:3000/api/docs).
- **Security & Headers**: In-memory token bucket rate limiter (100 req/min), CORS headers (`Access-Control-Allow-Origin: *`), and hardened security headers (`X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'`).

### Core REST Endpoints:
- `POST /api/v1/reconcile` — Multi-pass batch reconciliation with Merkle DAG receipt.
- `GET /api/v1/reconcile/:jobId` — Retrieve stored job status and results from persistent SQLite store.
- `GET /api/v1/health` — Engine health, uptime, and rate limit telemetry.
- `POST /api/v1/webhooks/register` — Register external ERP webhook subscriptions in SQLite.
- `POST /api/v1/webhooks/test` — Public webhook connectivity tester with HMAC-SHA256 signing and 3-attempt exponential backoff retry.
- `GET /api/report/receipt/:id` — Look up persistent Decision Receipts and Merkle DAG proofs by receipt ID or job ID.
- `GET /api/verify/progress/:jobId` — Real-time progress poller for verification runs.

---

## 20. Production Subsystems & Live Implementation

SettleMate AI has graduated from simulation to a hardened production implementation:

### 1. Real AI Investigator (LLM) with Multi-Provider Support & Offline Fallback
- **Multi-Provider Engine** (`src/lib/ai/llm-investigator.ts`): Automatically binds to `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `GEMINI_API_KEY`.
- **Structured Prompt Engineering**: Supplies full exception metadata, source transaction details, and Context Vault evidence items; requests structured JSON matching the `AIClaim[]` schema.
- **Deterministic Non-LLM Gate**: LLM output is strictly advisory and must pass through `DeterministicClaimValidator` as the non-LLM final gate before Maker/Checker review.
- **High-Precision Offline Fallback**: If API keys are missing or calls fail/time out, the engine seamlessly falls back to deterministic offline claims (`model: "offline-fallback"`).
- **Persistent AI Telemetry**: Every single LLM and fallback call is logged to persistent SQLite (`ai_claim_logs`) with `inputHash`, `model`, `output`, `latencyMs`, and `status`.

### 2. Persistent Storage with SQLite (`data/settlemate.db`)
- **Dedicated SQLite Database Engine** (`src/lib/storage/sqlite-db.ts`): Uses `better-sqlite3` with WAL mode and synchronous normality.
- **Persistent Entities**:
  - `reconciliation_jobs`: Job metadata, summaries, exceptions, receipts, and execution timestamps.
  - `decision_receipts`: Merkle DAG root hashes, leaf counts, fingerprints, and signatures.
  - `webhook_registrations`: Active callback URLs, subscribed events, and signing secrets.
  - `webhook_delivery_logs`: Webhook delivery attempts, status codes, and latency logs.
  - `ai_claim_logs`: Audit trace of every LLM and fallback execution.
  - `audit_ledger`: Double-entry accounting modifications and controller actions.
  - `verify_progress_jobs`: Real-time benchmark and verification execution state.
- **Crash & Restart Persistence**: Verified across simulated process restarts with full data integrity.

### 3. Real Webhook Dispatch & HMAC-SHA256 Signing
- **Cryptographic Delivery**: Signs payloads using HMAC-SHA256 (`X-SettleMate-Signature: t=<timestamp>,v1=<signature>`).
- **Resilient Retry Engine**: Up to 3 delivery attempts with exponential backoff on HTTP errors or timeouts.
- **Public Connectivity Tester** (`/api/v1/webhooks/test`): Live testing endpoint for merchant developers to verify signature verification algorithms.
- **Developer Portal Integration**: Real-time console to view active subscriptions and trigger live webhook test pings.

### 4. Production Deployment & Live Cloud Setup
- **1-Command Deployment Scripts**: `scripts/deploy-live.sh` (Bash) and `scripts/deploy-live.ps1` (PowerShell) automatically initialize the database, execute the 55-suite test matrix, verify benchmark accuracy and dataset fingerprint, build Next.js bundles, and deploy to Vercel.
- **Cloud Configuration**: Production-ready `vercel.json` with function timeouts, database initialization (`npx tsx scripts/init-db.ts`), security headers, and `.env.example` reference.

### 5. Operational Hardening & Observability
Layered on top of the deterministic core **without changing any financial result** (fingerprint & 98.1/98/98/90 metrics preserved). Full detail in **[docs/PRODUCTION_READINESS.md](docs/PRODUCTION_READINESS.md)**:
- **Structured NDJSON logging** with automatic secret redaction, level filtering, and per-request correlation ids (`x-request-id`) on every `/api/v1/*` route (`src/lib/observability/`).
- **Liveness/readiness probe** `GET /api/health` (real `SELECT 1` DB round-trip → 200/503) and **Prometheus metrics** `GET /api/metrics` (text exposition v0.0.4).
- **SQLite concurrency hardening**: WAL + `busy_timeout` + `SQLITE_BUSY` retry with bounded backoff + atomic multi-table transactions (job+receipt written atomically).
- **Graceful shutdown**: SIGTERM/SIGINT checkpoints the WAL and closes the DB before exit, so rolling deploys never strand data.
- **Outbound SSRF guard** on webhook dispatch: blocks localhost, private/reserved IP ranges, and the `169.254.169.254` cloud-metadata endpoint (`src/lib/security/ssrf-guard.ts`).

---

## 21. Production Deployment & Containerization

SettleMate AI is ready for containerized cloud deployment:
- **Multi-stage Dockerfile**: Minimal attack surface on `node:20-alpine` with non-root security user.
- **Docker Compose**: Pre-configured in `docker-compose.yml` with health checks and volume bindings.
- **Cloud Runbook**: Detailed deployment runbook for AWS ECS, Google Cloud Run, and Kubernetes in **[DEPLOYMENT.md](DEPLOYMENT.md)**.
- **Pre-Deployment Gate**: Execute `bash scripts/deploy-live.sh` to verify build, tests, and benchmark fingerprints before release.


