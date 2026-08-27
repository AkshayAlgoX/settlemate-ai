# Contributing to SettleMate AI
**Autonomous Financial Controller Engineering Guidelines**

Thank you for contributing to SettleMate AI! Because SettleMate AI governs immutable double-entry financial ledgers and processes real enterprise settlement workflows, all code contributions must satisfy strict architectural invariants and rigorous deterministic test verification.

---

## 1. Golden Architectural Principles

1. **AI Never Writes Financial Truth:** Advisory AI (LLM agents) formulate structured claims (`AIClaim`). AI models are **never** permitted to directly mutate database ledger rows or finalize reconciliation batches.
2. **Integer Arithmetic Invariant:** All amounts must be stored and computed as **integer paise** (`number` in paise or `BigInt` for micro-units). Floating point numbers (`₹12.50`) are forbidden in arithmetic paths to avoid rounding drift.
3. **Double-Entry Balance Conservation:** Every financial adjustment must have balanced debits and credits:
   $$\sum \text{Debits} \equiv \sum \text{Credits}$$
4. **Canonical Reproducibility:** Serialized payloads and cryptographic decision receipts must use bitwise canonical key sorting (`canonicalizeJson`) and SHA-256 hashing.
5. **No Regressions on Benchmark:** The official 250-record benchmark must maintain:
   - **Accuracy $\ge 98.1\%$**
   - **Precision $\ge 98.0\%$**
   - **Recall $\ge 98.0\%$**
   - **Adversarial Catch $\ge 90.0\%$**
   - **Fingerprint:** `81d840cd8cf981e5e69a367b879a8f11e9e51d60136a6d38e430877f08cab02b`

---

## 2. Development & Verification Workflow

### 1. Installation & Local Setup
```bash
npm install
npx prisma db push
npm run dev
```

### 2. Full Test Suite Execution
Every pull request must pass all 48 test suites cleanly:
```bash
npm test
```

### 3. Official Benchmark Evaluation
Verify that benchmark metrics and fingerprint match official baseline:
```bash
npm run evaluate
```

### 4. Code Quality & Linting
Ensure ESLint checks pass with 0 warnings:
```bash
npm run lint
```

### 5. Production Next.js Build
Verify strict TypeScript type checking and static route generation:
```bash
npm run build
```

---

## 3. Pull Request Checklist

Before submitting a PR, ensure:
- [ ] All 48 test suites pass (`npm test`).
- [ ] Static analysis passes with 0 warnings (`npm run lint`).
- [ ] Production build succeeds (`npm run build`).
- [ ] No floating-point arithmetic introduced in financial calculations.
- [ ] Any new API endpoint includes rate limiting (`rateLimitGuard`) and security headers (`applySecurityHeaders`).
- [ ] High-risk actions enforce dual-control Maker/Checker authorization.
