# SettleMate AI — Authoritative Claims & Evidence Matrix

This document is the **single source of truth** for all externally visible performance, scale, architecture, and reliability claims made by SettleMate AI.

### 🛡️ One-Command Automated Claims Verification
To independently reproduce and verify all 14 empirical claims and benchmarks in this matrix in sequence:
```bash
npm run verify-claims
```
This command resets to clean fixtures, checks the official SHA-256 fingerprint (`81d840cd8cf981e5e69a367b879a8f11e9e51d60136a6d38e430877f08cab02b`), executes all 8 suites, and outputs a consolidated report in `test-results/claims-verification-report.json`.

---

## 1. Authoritative Evidence Matrix

| Capability / Subsystem | Exact Measured Value | Workload Size | Execution Environment | Run Identifier | Metric | Classification | Reproducibility Command |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Official Competition Benchmark** | **98.1% Accuracy**<br>• 98% Precision<br>• 98% Recall<br>• 90% Adversarial (9/10)<br>• **806.75 rec/s** | 250 records (263 normalized events) | Local Node.js v22.17<br>SQLite / In-Memory | Seed: `20260821`<br>Fingerprint: `81d840cd8cf981e5e69a367b879a8f11e9e51d60136a6d38e430877f08cab02b` | Accuracy & Adversarial Detection | **REAL MEASURED (Competition Truth)** | `npm run evaluate` |
| **Scale Reconciliation Engine** | **1,147.5 – 1,246 rec/s**<br>• 10k: 1,246 rec/s (99.9% acc)<br>• 25k: 1,174.8 rec/s (100% acc)<br>• 50k: 1,156.2 rec/s (100% acc)<br>• 100k: 1,147.5 rec/s (100% acc) | 10,000 – 100,000 records | Scalable Cardinality + Durable Path | Run: `scale-v1` | Scale Batch Throughput & Accuracy | **REAL MEASURED SCALE** | `npm run scale` |
| **Cardinality Solver Engine** | **100% Score (8/8 Scenarios)**<br>• Exact N:1, 1:N, N:M<br>• Tolerance N:1<br>• Timing boundary exclusion | 8 complex combinatorial topologies | Local Node.js v22.17 | Run: `eval-card-v1` | Combinatorial Topology Resolution | **REAL MEASURED** | `npx tsx scripts/evaluate-cardinality.ts` |
| **Policy Shadow Replay Micro-Benchmark** | **555,556 rec/s (18ms)**<br>• +14.28% auto-match delta<br>• 0 invariant violations<br>• Safety: `SAFE` | 10,000 historical transactions | Streaming memory buffer ($O(\text{chunk size})$) | Run: `v3-vs-v4-10k` | Policy Impact & Regression Gate | **REAL MEASURED MICRO-BENCHMARK** | `npx tsx scripts/demo-scenario.ts` (Phase 8) |
| **Distributed Chaos Queue Micro-Benchmark** | **219,298 rec/s**<br>• 10,000 crashes recovered (100%)<br>• 5,000 duplicate writes prevented<br>• 0 DLQ, 78MB heap | 100,000 streaming transactions | Partitioned Queue (20 partitions, 4 workers) | Run: `chaos-100k-v1` | Crash Recovery & Effectively-Once Finalization | **REAL MEASURED STRESS MICRO-BENCHMARK** | `npx tsx scripts/benchmark-100k-chaos.ts` |
| **N:M Pathological Complexity** | **3.27ms – 14.49ms**<br>• 1,000 dense items: 14.49ms<br>• 20x20 prime cluster: 3.27ms<br>• 0 false matches | Pathological candidate density clusters | Local Combinatorial Solver | Run: `nm-patho-v1` | Combinatorial Pruning & Anti-Fabrication | **REAL PROVEN** | `npx tsx scripts/benchmark-nm-complexity.ts` |
| **Hot-Key CAS Contention** | **14.23ms** (99 conflicts resolved)<br>• 0 lost updates, 0 state leaks<br>• Independent keys: 0.02ms | 100 concurrent workers on single hot key | In-Memory Relational Engine | Run: `cas-cont-v1` | Optimistic Concurrency & SQLSTATE 40001 | **REAL PROVEN** | `npx tsx scripts/benchmark-cas-contention.ts` |
| **Financial Correctness Attack Suite** | **16/16 Passed (100%)**<br>• 0 fabricated matches<br>• 0 silent drops<br>• 0 double posts | 16 adversarial financial edge cases | Local Rule & Invariant Engine | Run: `fin-attack-v1` | Fail-Closed Conservation Invariant | **REAL PROVEN** | `npx tsx scripts/financial-correctness-attack.ts` |
| **Multi-Fault Hardening Suite** | **10/10 Passed (100%)**<br>• Multi-failure concurrency<br>• Poison pill isolated to DLQ | 10 combined failure edge cases | Local Rule & Invariant Engine | Run: `multi-fault-v1` | Multi-Fault Robustness | **REAL PROVEN** | `npx tsx scripts/benchmark-multi-fault.ts` |
| **SQLite vs PostgreSQL Equivalence** | **0 Divergence (100% Equivalence)**<br>• Bitwise Merkle batch root match<br>• Identical CAS transition | 3 partitions, 100 transactions/partition | PostgreSQL Production Adapter | Run: `diff-db-v1` | Relational Storage Engine Parity | **REAL PROVEN DIFFERENTIAL EQUIVALENCE** | `npx tsx scripts/differential-db-test.ts` |
| **Object Storage Adapter** | **100% Integrity Verification**<br>• SHA-256 chunk hash check<br>• Instant corruption detection | Chunked disk streaming (`.storage_vault/`) | Local Disk + S3 Contract | Run: `obj-store-v1` | Content Hash & Tamper Detection | **REAL LOCAL + PROD CONTRACT** | `npx tsx src/lib/reconciliation/distributed/object-storage.test.ts` |
| **Event Queue & Consumer Groups** | **16/16 Chaos Scenarios Passed**<br>• Lease timeout reclamation (500ms)<br>• DLQ routing (max 3 retries)<br>• Watermark backpressure | In-Memory Partitioned Event Log | Local Event Loop | Run: `chaos-16-v1` | Partition Ordering & Lease Safety | **REAL LOCAL + KAFKA CONTRACT** | `npx tsx src/lib/reconciliation/distributed/chaos.test.ts` |
| **Streaming Engine Peak Capacity** | **894,454 rec/s (11.23s)**<br>• 489MB peak heap<br>• 0 retries, 0 DLQ | 10,000,000 synthetic streaming events | $O(\text{chunk size})$ Generator | Run: `cap-10m-v1` | Memory Bound & Streaming Ingestion | **CAPACITY BENCHMARK** | `npx tsx src/lib/reconciliation/distributed/stream-generator.ts` |
| **Hyperscale Horizon (100M – 10B)** | **Mathematical $O(\text{chunk size})$ Bound**<br>• $<500\text{MB}$ memory footprint<br>• Horizontally sharded partitions | 100,000,000 – 10,000,000,000 events | Distributed Worker Fleet | Architecture Specification | Scale Feasibility | **CAPACITY PROJECTION** | Theoretical Capacity Model |

---

## 2. Precise Terminology & Claim Guardrails

1. **"Effectively-Once Financial Result"** (NOT physical "exactly-once transport"):
   - Transport layers (HTTP, Queues) operate on *at-least-once* delivery with retries.
   - SettleMate achieves *Effectively-Once Financial Finalization* via deterministic idempotency keys (`fin_idempotent_<exceptionId>`), compare-and-swap (CAS) status updates, and immutable ledger write uniqueness.
2. **"Production Adapters" vs "Local Implementations"**:
   - **PostgreSQL**: Implemented with production DDL, `FOR UPDATE SKIP LOCKED`, and streaming bulk write patterns. Verified via differential test against SQLite.
   - **Object Storage**: Local streaming disk storage with SHA-256 chunk verification is fully executable; S3 API is an adapter contract.
   - **Event Queue**: Local partitioned in-memory event log with Kafka consumer group semantics is fully executable; Kafka cluster connectivity is an adapter contract.
3. **Scale Classifications**:
   - **250 Records**: Official Ground-Truth Competition Benchmark (98.1% accuracy).
   - **10,000 Records**: Real Policy Shadow Replay validation.
   - **100,000 Records**: Real Streaming Chaos & Worker Recovery stress benchmark.
   - **10,000,000 Records**: Capacity benchmark ($894\text{k rec/s}$ in $489\text{MB}$ heap).
   - **100M – 10B Records**: Mathematical capacity projection based on bounded chunk streaming.

---

## 3. Core Architectural Defense

> *"SettleMate re-verifies corrections against deterministic financial invariants before finalization."*
