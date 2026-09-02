# SettleMate AI — System Architecture & Technical Specification
### Track 04: AI Finance Controller · Razorpay AI Buildathon

---

## 1. High-Level Architecture Overview

SettleMate AI is engineered as a **deterministic financial control plane with AI-assisted exception investigation**. High-throughput deterministic algorithms process $>96\%$ of standard transactions in sub-millisecond execution times, while advisory AI investigators formulate hypotheses for ambiguous anomalies under strict non-LLM mechanical verification.

```
                    ┌────────────────────────────────────────────────────────┐
                    │            1. Multi-Source Ingestion Engine            │
                    │  (Orders, Payments, Settlements, Bank Credits, Refunds)│
                    └───────────────────────────┬────────────────────────────┘
                                                │
                                                ▼
                    ┌────────────────────────────────────────────────────────┐
                    │         2. Deterministic Financial Control Plane       │
                    │  - Integer minor-unit normalizer (paise arithmetic)    │
                    │  - O(1) Hash Map Indexing (UTR, Order ID, Payment ID)  │
                    │  - Temporal Sliding Window Matching (T+2 SLA)          │
                    │  - Financial Conservation Gate (ΣDr ≡ ΣCr)             │
                    │  - Confidence × Exposure Decision Router               │
                    └───────────┬────────────────────────────────┬───────────┘
                                │                                │
              Clean Fast Path   │ (96.4% Auto-Matched)           │ Exceptions (3.6%)
                                │                                ▼
                                │   ┌────────────────────────────────────────┐
                                │   │     3. Advisory AI & Adversarial Loop  │
                                │   │  - Context Vault Evidence Assembly     │
                                │   │  - Advisory LLM Investigator           │
                                │   │  - Structured Claims AST (AIClaim[])   │
                                │   │  - Adversarial Critic (3 Lenses)       │
                                │   │  - Multi-Pass Reinvestigation Engine   │
                                │   └────────────────────┬───────────────────┘
                                │                        │
                                │                        ▼
                                │   ┌────────────────────────────────────────┐
                                │   │     4. Deterministic Decision Gates    │
                                │   │  - Non-LLM Mechanical Gate (134k/s)    │
                                │   │  - Google OR-Tools CP-SAT Split Solver │
                                │   │  - Minimal Correction Journal Engine   │
                                │   │  - Invariant Restoration Prover (Δ=0)  │
                                │   │  - Dual-Control Human Review (ADMIN)   │
                                │   └────────────────────┬───────────────────┘
                                │                        │
                                ▼                        ▼
                    ┌────────────────────────────────────────────────────────┐
                    │               5. Immutable Finality & Replay           │
                    │  - Atomic CAS Double-Entry Ledger Commit               │
                    │  - Canonical RFC 8785 Decision Receipts (HMAC-SHA256)  │
                    │  - Merkle DAG Evidence Commitments                     │
                    │  - Zero-LLM / Zero-DB Offline Deterministic Replay     │
                    └────────────────────────────────────────────────────────┘
```

---

## 2. Core Subsystem Specifications

### 2.1 Integer Normalization & Minor Units
- All financial balances, fees, and taxes are normalized into integer minor units (paise for INR; cents for USD/EUR).
- Prohibits IEEE 754 floating-point arithmetic across all reconciliation calculations.
- Native `BigInt` and integer `number` types prevent binary rounding drift.

### 2.2 Deterministic Matching & Classification
- **O(1) Hash-Map Indexing**: Indexed by Gateway Payment ID, Order ID, and Bank UTR.
- **Temporal Sliding Window**: Reconciles delayed banking settlements across standard $T+1$ and $T+2$ business-day windows ($\pm 48\text{h}$).
- **Conservation of Money**: Enforces the invariant:
  $$S_{\text{expected}} = P_{\text{gross}} - F_{\text{fee}} - T_{\text{tax}} - R_{\text{refunds}} - D_{\text{chargebacks}}$$

### 2.3 Advisory AI Investigator & Structured Claims AST
- AI is restricted to advisory hypothesis formulation and can never directly mutate account balances or self-approve exceptions.
- Emits strongly typed `AIClaim[]` AST structures with explicit claim types (`AMOUNT`, `DATE`, `REFERENCE`, `ENTITY`).
- **Multi-Model Provider Support**: Pluggable support for OpenAI (`gpt-4o-mini`), Anthropic (`claude-3-5-sonnet`), Google Gemini (`gemini-2.5-flash`), or deterministic offline fallbacks.

### 2.4 Adversarial Critic & Multi-Pass Reinvestigation
- Every AI claim is evaluated by an Adversarial Critic across three challenge lenses:
  1. *Arithmetic Lens*: Independently recomputes fees, taxes, and deduction schedules.
  2. *Timing Lens*: Enforces banking cutoff times, settlement SLAs, and holiday calendars.
  3. *Relationship Lens*: Verifies gateway-to-merchant entity relationships.
- When an objection is confirmed, the claim is rejected and returned to the investigator in an automated multi-pass reinvestigation loop.

### 2.5 Non-LLM Mechanical Validator
- Validates all AI claims against raw immutable transaction feeds before workflow transitions:
  - Verifies all cited evidence IDs exist in the Context Vault.
  - Verifies numeric values match raw ingested records bitwise.
  - Micro-benchmark throughput: **134,511 claims/second**.
  - Fabricated or hallucinated claims are instantly blocked.

### 2.6 Google OR-Tools CP-SAT Combinatorial Solver
- Solves complex $N:1$, $1:N$, and $N:M$ aggregate invoice and settlement splits.
- Exact combinatorial optimization guarantees zero heuristic drift on multi-invoice reconciliations in $<2\text{ms}$.

### 2.7 Minimal Correction Engine & Invariant Prover
- Formulates minimal correcting journal entries containing exactly 1 balancing pair (2 lines: 1 debit, 1 credit).
- The **Invariant Restoration Prover** proves state restoration mathematically:
  $$\Delta_{\text{pre}} \neq 0 \implies \text{Imbalance}, \quad \Delta_{\text{post}} = 0 \implies \text{Invariant Restored}$$

### 2.8 Terminal Decision Receipts & Zero-LLM Deterministic Replay
- Every finalized decision produces a self-contained `TerminalDecisionReceipt`.
- Formatted as canonical RFC 8785 JSON with lexicographically sorted keys.
- Cryptographically signed with HMAC-SHA256 and Merkle DAG root evidence commitments.
- Replays offline in $<1\text{ms}$ with **zero LLM invocations and zero database queries**.

---

## 3. Scale & Durable Execution Architecture

```
[Operations Center (Browser / Client Coordinator)]
                      │
                      │ POST /api/batches/jobs/:jobId/step
                      ▼
[Durable State Store (PostgreSQL / SQLite with Optimistic CAS)]
                      │
                      │ Chunk Lease Allocation (1,000–5,000 txns)
                      ▼
[Partitioned Chunk Match Engine (Constant Memory Footprint)]
                      │
                      │ Atomic State Checkpoint
                      ▼
[Monotonic Progress Persistence & Resumability] ──► [<1000ms SLA Cooperative Cancel]
```

* **Operations Center Step Coordinator**: Bounded client-driven step requests eliminate monolithic request timeouts.
* **Dual Database Architecture**:
  - *Cloud Production*: PostgreSQL via `pg.Pool` and Neon Serverless (`prisma/schema.postgresql.prisma`).
  - *Local Dev & Offline Demo*: SQLite via `better-sqlite3` in WAL mode (`prisma/schema.prisma`).
* **Cooperative Cancellation State Machine**: Guaranteed terminal cancellation latency SLA $<1,000\text{ms}$.
* **Resumability**: Automatically resumes from the last completed chunk checkpoint upon process restart.

---

## 4. Zero-Trust Security Boundary

1. **Authentication**: Signed HTTP-only session cookies with HMAC-SHA256 and `timingSafeEqual` constant-time verification.
2. **Server-Derived Identity**: User identity, tenant ID, and role are derived strictly server-side; request body overrides are rejected.
3. **Role-Based Authorization**:
   - `REVIEWER`: Exception investigation and preliminary triage.
   - `ADMIN`: Strictly required for high-exposure approvals and correcting journal commits.
4. **Row-Level Security (RLS)**: Multi-tenant partitioning guarantees tenant isolation; cross-tenant queries fail closed (404/403).
5. **SSRF Guard**: Webhook dispatch blocks loopback addresses, private CIDRs, and the cloud metadata service (`169.254.169.254`).
6. **Rate Limiting**: Token-bucket algorithm enforcing 100 req/min for general APIs and 10 req/min for authentication.
