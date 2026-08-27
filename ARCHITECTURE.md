# SettleMate AI — System Architecture & Design Specification
**Track 04: AI Finance Controller · Razorpay AI Buildathon**

---

## 1. High-Level System Architecture

SettleMate AI is designed around a multi-tier, zero-trust financial architecture where high-throughput deterministic computation handles 96%+ of straightforward matches, and isolated AI agents investigate edge-case discrepancies under strict mechanical validation.

```mermaid
graph TD
    subgraph Ingestion["1. Multi-Source Ingestion Engine"]
        Orders[E-Commerce Orders]
        Payments[Gateway Payments]
        Settlements[Gateway Settlements]
        Bank[Core Banking Credits / CAMT.053]
        Refunds[Refund Feeds]
        CB[Chargeback Feeds]
    end

    subgraph Deterministic["2. Deterministic Core Engine (806.75 rec/s)"]
        Norm[Integer Minor Units Normalizer]
        Pass1[Pass 1: Exact 1:1 Reference & UTR Match]
        Pass2[Pass 2: Temporal Sliding Window Matching]
        Pass3[Pass 3: Meet-in-the-Middle Combinatorics]
        InvGate[6-Invariant Conservation Gate]
    end

    subgraph AIControl["3. Grounded Advisory AI Loop"]
        Vault[Context Vault Evidence Graph]
        Agent[Investigator AI Agent]
        Claims[Structured AI Claims AST]
        NonLLMGate[Non-LLM Mechanical Validator 134k/s]
        MakerChecker[Dual-Control Maker/Checker Gate]
    end

    subgraph Persistence["4. Immutable State & Lineage"]
        Ledger[Double-Entry General Ledger]
        Receipt[Canonical Decision Receipts]
        Merkle[Merkle DAG Proofs]
        OfflineVerifier[Standalone Offline Verifier (0 LLMs, 0 DBs)]
    end

    Ingestion --> Norm --> Pass1 --> Pass2 --> Pass3 --> InvGate
    InvGate -- Auto-Matched (96.4%) --> Ledger
    InvGate -- Exceptions (3.6%) --> Vault --> Agent --> Claims --> NonLLMGate
    NonLLMGate -- Validated --> MakerChecker --> Ledger
    NonLLMGate -- Fabricated --> Blocked[Disputed & Locked]
    Ledger --> Receipt --> Merkle --> OfflineVerifier
```

---

## 2. Core Subsystems

### 2.1 Integer Normalization & Minor Units
- All currencies stored in integer paise (₹1.00 = 100 paise).
- Eliminates IEEE 754 binary floating-point drift.
- Native `BigInt` support for micro-transactions.

### 2.2 3-Pass Deterministic Reconciliation Engine
1. **Pass 1 (Exact Reference Match):** Matches by Gateway Payment ID, Order ID, and UTR with $O(1)$ hash map lookup.
2. **Pass 2 (Temporal Sliding Window):** Matches delayed bank credits within configurable SLA bounds (e.g. $T+2$ days, $\pm 48$ hours).
3. **Pass 3 (Meet-in-the-Middle Combinatorial Solver):** Solves $N:1$, $1:N$, and $N:M$ aggregated payouts up to $2^{16}$ combinations in $<1\text{ms}$ with zero dynamic array allocation.

### 2.3 Grounded Advisory AI & Non-LLM Verification Council
- AI cannot directly write to the ledger.
- AI formulates a structured claim AST (`AIClaim[]`).
- Deterministic Non-LLM Validator tests claims against 10 mechanical checks:
  1. `EVIDENCE_EXISTS`: All cited evidence IDs present in Context Vault.
  2. `EVIDENCE_AUTHORIZED`: Caller possesses clearance for cited evidence.
  3. `EVIDENCE_LINKED`: Evidence links to target transaction via bounded BFS.
  4. `RECORD_EXISTS`: Financial records exist in source datasets.
  5. `VALUES_MATCH`: Numeric assertions equal raw ingested amounts.
  6. `ARITHMETIC_RECOMPUTED`: Claims recomputed to integer paise.
  7. `TIMING_CHECKED`: Timestamps within policy SLA limits.
  8. `RELATIONSHIP_CHECKED`: Graph topology matches claim.
  9. `POLICY_CHECKED`: Variances within active policy tolerance.
  10. `INVARIANTS_CHECKED`: No contradictory claims in Context Vault.

### 2.4 Immutable Ledger & Cryptographic Decision Receipts
- Double-entry postings preserve $\sum \text{Debits} \equiv \sum \text{Credits}$.
- Every decision emits a self-contained `CanonicalDecisionReceipt` with bitwise canonical JSON serialization and SHA-256 seal.
- Offline standalone verification executes in $<1\text{ms}$ with **zero LLMs and zero DB dependencies**.

### 2.5 Security, Rate Limiting & Concurrency Control
- Token bucket rate limiter: 100 req/min with `429 Too Many Requests`.
- Max payload byte limit: 1 MB cap (`validateBodySize`).
- Max object recursion depth: 10 levels (`checkObjectDepth`).
- Full security headers: `nosniff`, `DENY`, `CSP`, `HSTS`.
- Optimistic CAS locks on orphan leases with atomic monotonic versioning.
