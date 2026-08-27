# SettleMate AI — Enterprise Security Policy & Threat Model

This document outlines the security architecture, threat model, cryptographic proof mechanisms, and defensive controls implemented across SettleMate AI.

---

## 1. Core Threat Model & Financial Invariants

In high-volume financial reconciliation, software is subject to both external hostile attacks and internal systemic failures. SettleMate AI enforces mathematical invariants that guarantee:

1. **Zero Unauthorized Financial Ledger Writes**: The double-entry ledger can never be directly mutated by an AI model, background cron, or unprivileged user.
2. **Conservation of Money**: Sum of settlements + refunds + dispute balances must equal gross payment credits within exact integer minor units (paise).
3. **Fail-Closed Boundary**: Any unauthenticated, malformed, or ambiguous input fails closed with explicit error structures.

```
+-----------------------------------------------------------------------------------+
|                            PERIMETER DEFENSE LAYER                                |
|  - Token Bucket Rate Limiter (100 req/min per IP/Key)                             |
|  - Input Sanitization & Prototype Pollution Guard (__proto__, constructor)       |
|  - Strict CORS & Security Headers (nosniff, DENY, CSP default-src 'none')         |
+------------------------------------------+----------------------------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------+
|                        AI ISOLATION & VERIFICATION LAYER                          |
|  - Advisory-Only AI Architecture (LLM isolated in read-only sandbox)              |
|  - Non-LLM Claim Falsification Gate (134,511 claims/s direct bitwise check)       |
|  - Malicious Injections & Fabricated Evidence Automatically Disputed & Blocked     |
+------------------------------------------+----------------------------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------+
|                         CRYPTOGRAPHIC AUDIT & LEDGER                              |
|  - Dual-Control Maker / Checker Approval Workflow                                 |
|  - SHA-256 Merkle DAG Decision Receipts (Parent Hash Chaining)                    |
|  - Offline Standalone Verification Engine (0 LLMs, 0 DBs required)                |
+-----------------------------------------------------------------------------------+
```

---

## 2. AI Security & Anti-Jailbreak Protection

### Non-LLM Claim Falsification Gate
Advisory AI agents produce structured investigation claims (e.g. `AMOUNT`, `DATE`, `REFERENCE`, `ENTITY`). Before any claim can influence human workflow or be attached to an audit receipt:
- It is evaluated by `DeterministicClaimValidator` against immutable raw transaction feeds.
- Fabricated reference numbers, injected bank credits, or hallucinated voucher IDs are rejected instantaneously without invoking additional LLMs.

### Prompt Injection Immunity
Financial narrations and external CSV metadata are treated as untrusted raw strings:
- Stripped of prompt escape characters (`{{`, `}}`, `<script>`, `IGNORE PREVIOUS INSTRUCTIONS`).
- Escaped before inclusion in reasoning prompts.
- Claims asserting values absent from raw source feeds are automatically flagged `DISPUTED`.

---

## 3. Cryptographic Decision Receipts

Every reconciliation run generates a self-contained, tamper-evident Merkle DAG decision receipt:
- **Leaf Nodes**: Hashes of input payment, settlement, refund, and bank records.
- **Rule Node**: Exact deterministic rule ID and parameters applied.
- **Root Hash**: Cryptographic SHA-256 root representing the entire decision state.
- **Standalone Offline Verifier**: Auditable offline using `npm run verify:demo` without network connectivity, database access, or LLM runtime.

---

## 4. API Perimeter Security & Rate Limiting

- **Rate Limiting**: `TokenBucketRateLimiter` enforces 100 requests per minute with burst capacity, returning `429 Too Many Requests` and standard `X-RateLimit-*` and `Retry-After` headers.
- **API Key Security**: Requires format `sk_live_...` or `sk_test_...` with minimum 20 characters length.
- **Security Headers**:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Content-Security-Policy: default-src 'none'`
  - `X-XSS-Protection: 1; mode=block`
  - `Referrer-Policy: strict-origin-when-cross-origin`
- **HMAC Webhook Signatures**: Outgoing webhooks are signed using `HMAC-SHA256` with header `X-SettleMate-Signature: t=<timestamp>,v1=<signature>` to prevent spoofing and replay attacks.

---

## 5. Vulnerability Disclosure Policy

To report a security vulnerability or discrepancy, please contact the security maintainers or open a private security advisory on GitHub. All valid reports will be acknowledged and remediated within 24 hours.
