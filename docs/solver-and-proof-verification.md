# Invoice matching and invariant proofs: what is verified

## Invoice matching (`src/lib/solver`)

`cpSatInvoiceMatchingEngine` is an exact branch-and-bound search in
TypeScript over integer minor units. It is used by
`/api/solve/invoice-match`, the financial decision pipeline and solver
replay.

- **Objective:** minimise `difference * 1000 + invoice count`, subject to
  `difference <= toleranceMinor` and at most `min(maxInvoicesPerSplit, 8)`
  invoices. Because the count is at most 20, the difference always takes
  priority.
- **Search order:** invoices are sorted by amount, then id, so the search is
  deterministic when it finishes before `timeoutMs`.
- **Candidate cap:** only the 50 smallest eligible invoices are searched
  (`maxCandidatesCap`). When candidates are dropped, a match is reported as
  `FEASIBLE`, not `OPTIMAL`, and the reason states how many were dropped.
- **Amount limit:** amounts are limited to 10^14 minor units, so sums of up to
  20 invoices stay exact in IEEE-754 doubles.

`services/solver` contains a separate Python OR-Tools CP-SAT model of the
same policy. **The application does not call it.**

### Evidence

- **Brute-force reference.**
  `tests/solver-reference-differential.test.ts` (in `npm test`) compares
  the engine with an independent bitmask enumeration of every subset on
  3,000 seeded random cases, with up to 12 invoices, repeated amounts and
  ineligible invoices. Optimal objective, difference, status and
  verifier acceptance must all agree.
  - It also corrupts each result in several ways: total, objective,
    difference, duplicate id, unknown id, ineligible id, and too many
    invoices. The verifier must reject every corrupted result.
- **OR-Tools cross-check.** `scripts/solver_differential.py` runs the same
  cases through the OR-Tools model. It requires `pip install ortools`. On
  2026-10-29, with OR-Tools 9.15, all 3,000 cases agreed on feasibility and
  on the optimal objective, and every CP-SAT answer was `OPTIMAL`.
  Selections can differ when several subsets share the optimum.
- **What `SolverResultVerifier` checks.** It checks feasibility and
  consistency: ids, tenant, eligibility, duplicates, totals, difference,
  tolerance, objective and the cardinality bound. **It does not prove
  optimality.**

### Limits

- **Event-loop blocking.** The search runs synchronously on the Node.js
  event loop for up to `timeoutMs` (at most 10 s per request).
- **Timeouts and replay.** A search that hits its timeout reports
  `SOLVER_TIMEOUT`. Whether a timeout happens depends on machine speed, so
  replaying a timed-out solve on another machine can give a different
  result.

## Invariant "proofs" (`src/lib/ai/z3-prover.ts`)

`Z3InvariantProver.prove` checks four invariants by exact integer
evaluation: conservation, non-negative domain, double-entry parity and
single consumption. It also emits the equivalent SMT-LIB v2 (QF_LIA)
script.

- **No solver runs in-process.** Every variable is fixed to a concrete
  value, so the script is satisfiable exactly when the checks pass. This is
  a checked computation, not a proof over all inputs.
- **Inputs must be safe integers.** Fractions, NaN and values beyond 2^53
  return `SMT_ERROR`, and no assertions are emitted.
  - Previously these inputs were rounded in the script but not in the
    evaluation, so Z3 could accept a script for a case the evaluation had
    rejected.
  - Values of 1e21 and above, and fractional tolerances, produced invalid
    SMT-LIB.
- **Negative literals** are written `(- n)`, as the SMT-LIB standard
  requires.

### Evidence

- `tests/smt-script-consistency.test.ts` (in `npm test`) covers 2,000
  seeded cases, including negative variances, imbalances and tolerances,
  plus 6 unrepresentable inputs.
- `scripts/smt_z3_differential.py` runs the exported scripts through Z3. It
  requires `pip install z3-solver`. On 2026-10-29, with Z3 5.3.2, all 2,000
  verdicts matched (1,518 sat, 482 unsat).
