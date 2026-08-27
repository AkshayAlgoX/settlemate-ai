# SettleMate AI — Production Readiness

**Status:** Production-hardened · **Last validated:** 2026-08-26
**Scope:** Operational reliability, observability, and security hardening layered on top of the deterministic reconciliation core — *without altering financial results.*

> **Invariant preserved.** Every change documented here was validated against the official Track 04 benchmark. Dataset fingerprint `81d840cd8cf981e5e69a367b879a8f11e9e51d60136a6d38e430877f08cab02b` and metrics **98.1% accuracy / 98% precision / 98% recall / 90% adversarial** are byte-for-byte unchanged. The evaluator, core matcher, and financial invariants were not modified in any result-affecting way.

This document is the operational capstone. It complements — and does not duplicate — the existing deep-dives:
- [`SECURITY.md`](../SECURITY.md) / [`docs/SECURITY_AUDIT.md`](SECURITY_AUDIT.md) — threat model & audit
- [`docs/CONCURRENCY.md`](CONCURRENCY.md) — concurrency model & CAS locking
- [`docs/PERFORMANCE.md`](PERFORMANCE.md) / [`docs/PERFORMANCE_DEEP_DIVE.md`](PERFORMANCE_DEEP_DIVE.md) — throughput & profiling
- [`docs/FUZZ_TESTING.md`](FUZZ_TESTING.md) — fuzz methodology
- [`DEPLOYMENT.md`](../DEPLOYMENT.md) — containerization & cloud setup

---

## 1. Observability

A dependency-free observability stack. No external agents, worker threads, or bundler-fragile transports — deliberately chosen so nothing breaks inside the Next.js server bundle or a serverless/edge deploy.

### 1.1 Structured logging — [`src/lib/observability/logger.ts`](../src/lib/observability/logger.ts)
- **NDJSON** (one JSON object per line) to `console.log`/`console.error`, machine-parseable by Loki / Datadog / CloudWatch with zero config.
- **Level filtering** via `LOG_LEVEL` (`debug|info|warn|error`); defaults to `warn` under `NODE_ENV=test`, `info` otherwise.
- **Automatic secret redaction** — keys matching `secret|password|authorization|api_key|token|cookie|signature|whsec` are replaced with `[REDACTED]` recursively (bounded depth).
- **Error serialization** never leaks stack traces in production (`NODE_ENV=production` strips `stack`).
- **Request-scoped child loggers** via `logger.child({ requestId, route, method })`.
- **Runtime-portable:** uses `console.*` (supported in both the Node and Edge runtimes) rather than `process.stdout/stderr`.

### 1.2 Route instrumentation — [`src/lib/observability/route.ts`](../src/lib/observability/route.ts)
`instrument(routeName, handler)` wraps an App Router handler and, **without changing its behavior**, adds:
- a per-request correlation id returned as the `x-request-id` response header;
- a structured completion/error log line (`route`, `method`, `status`, `durationMs`);
- Prometheus request-count + latency + rate-limit-rejection metrics;
- a safe, non-leaky HTTP 500 fallback (`safeErrorResponse`) if the handler throws.

The wrapper is fully generic over the handler's argument tuple, so dynamic routes (e.g. `[jobId]` with a `context` arg) keep their exact signature.

**Coverage** — every `/api/v1/*` handler is instrumented:

| Route | Methods | Instrumented label |
| :--- | :--- | :--- |
| `/api/v1/reconcile` | POST | `v1.reconcile` |
| `/api/v1/reconcile/[jobId]` | GET | `v1.job.detail` |
| `/api/v1/multi-currency/reconcile` | GET, POST | `v1.multi_currency.spec` / `.reconcile` |
| `/api/v1/webhooks/register` | GET, POST | `v1.webhooks.list` / `.register` |
| `/api/v1/webhooks/logs` | GET, DELETE | `v1.webhooks.logs.get` / `.delete` |
| `/api/v1/webhooks/test` | GET, POST | `v1.webhooks.test.get` / `.post` |
| `/api/v1/health` | GET | `v1.health` |

`OPTIONS` (CORS preflight) is intentionally left unwrapped.

### 1.3 Liveness / readiness — `GET /api/health` — [`src/app/api/health/route.ts`](../src/app/api/health/route.ts)
Performs a **real database round-trip** (`SELECT 1` against the SQLite store), not just a process-liveness check. Returns:
- **HTTP 200** `{ status: "ok", uptime, checks: { database: { status: "up", latencyMs } } }` when healthy;
- **HTTP 503** `{ status: "unhealthy", … }` when the DB is unreachable, so an orchestrator (Kubernetes, ECS, an ALB) can gate traffic away from a broken pod.

### 1.4 Metrics — `GET /api/metrics` — [`src/app/api/metrics/route.ts`](../src/app/api/metrics/route.ts)
Prometheus text exposition format (v0.0.4), `Cache-Control: no-store`. In-memory registry — [`src/lib/observability/metrics.ts`](../src/lib/observability/metrics.ts). Metric catalog:

| Metric | Type | Purpose |
| :--- | :--- | :--- |
| `settlemate_http_requests_total` | counter | Requests by `route`, `method`, `status` class |
| `settlemate_http_request_duration_ms` | histogram | Request latency by `route` |
| `settlemate_reconciliation_runs_total` | counter | Reconciliation runs by `outcome` |
| `settlemate_reconciliation_exceptions_total` | counter | Exceptions detected |
| `settlemate_ai_calls_total` | counter | AI investigator calls by `status` |
| `settlemate_ai_validator_checks_total` | counter | Non-LLM validation-gate checks |
| `settlemate_webhook_deliveries_total` | counter | Webhook deliveries by `status` (delivered/failed/simulated/**blocked**) |
| `settlemate_db_busy_retries_total` | counter | SQLite `SQLITE_BUSY` retries by `op` |
| `settlemate_rate_limit_rejections_total` | counter | Requests rejected by the rate limiter |
| `settlemate_process_uptime_seconds` | gauge | Process uptime (derived from a module-load timestamp; Edge-safe) |

> **Single-process registry.** Metrics are per-process; in a multi-replica deployment scrape each replica and aggregate in Prometheus. Documented, not a defect — this app targets a single-node model.
> **Exposure:** `/api/metrics` is unauthenticated so a scraper is never throttled. In a hardened deployment expose it only on an internal network or behind mTLS.

### 1.5 Centralized error capture — [`src/instrumentation.ts`](../src/instrumentation.ts)
Next.js `onRequestError` records every unhandled server-side error as a structured log line + a `5xx` metric increment, covering all routes without per-handler wiring.

---

## 2. Reliability & Data Integrity

### 2.1 SQLite concurrency hardening — [`src/lib/storage/sqlite-db.ts`](../src/lib/storage/sqlite-db.ts)
- **WAL mode** (`journal_mode = WAL`) — concurrent readers do not block the writer.
- **Busy timeout** (`busy_timeout = 5000`) — SQLite blocks-and-waits up to 5 s for a lock instead of erroring immediately.
- **Application-level retry** — `withBusyRetry(op, fn)` retries `SQLITE_BUSY` / `SQLITE_LOCKED` / `SQLITE_BUSY_SNAPSHOT` up to 4 times with a bounded backoff, using a non-spinning `Atomics.wait` sleep. Every retry increments `settlemate_db_busy_retries_total{op}`. All ten write operations are wrapped.
- **Atomic transactions** — `transaction(fn)` wraps `better-sqlite3`'s `BEGIN/COMMIT` and is itself busy-retried.

### 2.2 Atomic multi-table writes — [`src/lib/api/v1-store.ts`](../src/lib/api/v1-store.ts)
`saveJob()` persists the reconciliation job **and** its decision receipt inside a single `transaction()`, so a crash can never leave a job without its receipt (or vice-versa).

### 2.3 Graceful shutdown — [`src/instrumentation.ts`](../src/instrumentation.ts) → [`src/lib/observability/graceful-shutdown.ts`](../src/lib/observability/graceful-shutdown.ts)
On `SIGTERM`/`SIGINT` the server checkpoints the WAL (`wal_checkpoint(TRUNCATE)`) and closes the connection before `process.exit(0)`, so a rolling deploy never strands committed data in the `-wal` sidecar. Handlers are idempotent (`process.once` + a re-entry guard) and isolated in a Node-only module so their POSIX APIs never enter the Edge bundle.

---

## 3. Security Hardening

### 3.1 Outbound SSRF guard — [`src/lib/security/ssrf-guard.ts`](../src/lib/security/ssrf-guard.ts)
Every outbound webhook target is screened by `evaluateOutboundUrl()` before dispatch ([`src/lib/api/v1-store.ts`](../src/lib/api/v1-store.ts)). Blocks:
- non-`http(s)` protocols;
- reserved hostnames (`localhost`, `*.internal`, `*.local`, `metadata.google.internal`, …);
- private / reserved IPv4 ranges (`10/8`, `127/8`, `169.254/16` incl. the `169.254.169.254` cloud-metadata endpoint, `172.16/12`, `192.168/16`, `100.64/10`, …);
- IPv6 loopback / ULA (`fc00::/7`) / link-local (`fe80::/10`) / IPv4-mapped addresses.

A blocked target is logged, counted (`settlemate_webhook_deliveries_total{status="blocked"}`), and returned as a `FAILED` delivery — it is never contacted. Optional DNS resolution is gated behind `WEBHOOK_RESOLVE_DNS=1` (off by default to keep test/offline runs deterministic).

### 3.2 Existing API security (unchanged) — [`src/lib/security/api-security.ts`](../src/lib/security/api-security.ts)
API-key auth (`sk_…`), per-IP rate limiting, CORS preflight handling, recursive input sanitization, security response headers, and HMAC-SHA256 webhook signing. Error responses expose only a safe message + code — never a stack trace.

---

## 4. Build & Runtime Safety
- `npm run build` compiles cleanly with **zero Edge-Runtime warnings** — the observability + shutdown modules reachable from `instrumentation.ts` (compiled for both runtimes) use only runtime-portable APIs.
- All 58 routes build; the deterministic core is untouched.

---

## 5. CI / CD Gate — [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)
On every push / PR to `main`/`master`, a single `ubuntu-latest` job runs, failing the build on any regression:
1. `npm ci` (auto-generates the Prisma client; initializes the SQLite store via `postinstall`)
2. `npx prisma db push` — provisions the Prisma-managed ledger/audit tables
3. `npm run lint` — ESLint (0 errors required)
4. `npm run build` — production Next.js build
5. `npm test` — full deterministic test pipeline
6. `npm run evaluate` — **official benchmark + SHA-256 fingerprint gate**
7. `npm run verify:receipt` / `verify:demo` — offline receipt verifier + demo ingestion
8. Uploads `FINAL_METRICS.json` + `CLAIMS_MATRIX.md` as artifacts

---

## 6. Property, Fuzz & Invariant Testing
Property-based robustness is covered by a **zero-dependency** harness (chosen over adding `fast-check` to keep the benchmark-locked dependency tree stable):
- [`src/lib/fuzz/`](../src/lib/fuzz) — a randomized fuzz campaign drives thousands of extreme batches through the matcher, receipt serializer, and claim validator, asserting **zero crashes / zero memory leaks / stable canonicalization**.
- [`src/lib/reconciliation/invariants.test.ts`](../src/lib/reconciliation/invariants.test.ts) — explicit financial-invariant assertions (paise conservation, zero ledger drift).
- [`tests/concurrency-stress.test.ts`](../tests/concurrency-stress.test.ts) — multi-worker atomic-CAS concurrency verification.

---

## 7. Operational Runbook

### Environment variables
| Var | Default | Purpose |
| :--- | :--- | :--- |
| `DATABASE_URL` | `file:./dev.db` | SQLite location (Prisma-managed tables) |
| `LOG_LEVEL` | `info` (`warn` in test) | Log verbosity |
| `NODE_ENV` | — | `production` strips stack traces from logs |
| `WEBHOOK_RESOLVE_DNS` | unset (off) | `1` enables DNS resolution in the SSRF guard |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | unset | Optional; offline fallback used when absent |

### Kubernetes probes
```yaml
readinessProbe:
  httpGet: { path: /api/health, port: 3000 }
  initialDelaySeconds: 5
  periodSeconds: 10
livenessProbe:
  httpGet: { path: /api/health, port: 3000 }
  periodSeconds: 15
```
Give pods a `terminationGracePeriodSeconds` ≥ 10 so the SIGTERM WAL checkpoint completes before the container is killed.

### Prometheus scrape
```yaml
scrape_configs:
  - job_name: settlemate
    metrics_path: /api/metrics
    static_configs: [{ targets: ["settlemate:3000"] }]
```

### Storage note
The SQLite DB uses WAL — back up `dev.db`, `dev.db-wal`, and `dev.db-shm` together, or checkpoint first. Graceful shutdown truncates the WAL automatically.

---

## 8. Validation Record

All commands run from the repo root (Node 22.x). Last full run: **2026-08-26**.

| Gate | Command | Result |
| :--- | :--- | :--- |
| Lint | `npm run lint` | ✅ 0 errors (1 pre-existing non-blocking warning) |
| Build | `npm run build` | ✅ Compiled successfully, 58/58 pages, 0 Edge warnings |
| Tests | `npm test` | ✅ 496 assertions pass, 0 failures |
| Benchmark | `npm run evaluate` | ✅ Fingerprint `81d840cd…cab02b`; 98.1% / 98% / 98% / 90% |

Reproduce the benchmark gate:
```bash
npm run evaluate
# → Dataset fingerprint: 81d840cd8cf981e5e69a367b879a8f11e9e51d60136a6d38e430877f08cab02b
# → Overall Accuracy: 98.1% · Precision: 98% · Recall: 98% · Adversarial: 90%
```

---

## 9. Known Limitations / Non-Goals
- **Single-process metrics** — the registry is per-replica; aggregate in Prometheus for multi-replica deployments.
- **SQLite, not a clustered DB** — appropriate for the single-node target; the Prisma layer's driver adapter would allow swapping the datasource if a networked DB is later required.
- **N:M cardinality is computationally bounded** — by design, to keep matching tractable (see [`README.md`](../README.md) §15).
- **Rate limiter is in-memory per-process** — for multi-replica, front with a shared limiter (e.g. at the ingress).

---

## 10. Judge Experience & Security Hardening Enhancements

To maximize usability and evaluation speed for hackathon judges and enterprise auditors, the following enhancements have been integrated:

1. **Enterprise HTTP Security Headers ([`next.config.ts`](../next.config.ts)):**
   - Configured global `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 1; mode=block`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy` across all page and API responses.
2. **Interactive Judge Guided Tour ([`src/components/layout/guided-tour-modal.tsx`](../src/components/layout/guided-tour-modal.tsx)):**
   - Step-by-step interactive modal guiding evaluators through the Top 5 judge modules (`Track 04 Compliance 00F`, `Red Team Console 00U`, `Forensics Playback 00W`, `Alerting Simulator 00V`, and `Risk Dashboard 00T`).
   - Triggerable from top navigation or via global shortcut `?`.
3. **Global Command Palette ([`src/components/layout/command-palette.tsx`](../src/components/layout/command-palette.tsx)):**
   - Searchable global launcher activated via `Ctrl+K` / `Cmd+K` indexing all 25+ platform modules, benchmark suites, and quick demo triggers.
4. **1-Click Live Judge Demo Walkthrough ([`src/app/page.tsx`](../src/app/page.tsx)):**
   - Interactive live simulation widget directly on the landing page executing the complete 6-stage financial reconciliation loop with live terminal telemetry.
5. **Mobile & Tablet Responsive Drawer Navigation ([`src/components/layout/sidebar.tsx`](../src/components/layout/sidebar.tsx) & [`src/components/layout/global-header.tsx`](../src/components/layout/global-header.tsx)):**
   - Seamless evaluation across mobile phones, iPads/tablets, and desktop screens with sticky quick-navigation pills.
6. **Zero-Dependency Global Toast Notification Engine ([`src/components/ui/toast.tsx`](../src/components/ui/toast.tsx)):**
   - Lightweight status feedback for asynchronous operations, offline Merkle proofs, and red-team exploit simulations.

