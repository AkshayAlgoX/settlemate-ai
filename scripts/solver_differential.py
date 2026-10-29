"""
Cross-check the TypeScript invoice-matching engine against the Python
OR-Tools CP-SAT model in services/solver/cpsat_solver.py.

The application calls the TypeScript engine only; the OR-Tools service is
not wired in. This script checks that the two implement the same policy:
for every case, both must agree on whether a match exists and on the
optimal objective (difference * 1000 + invoice count). Selected subsets may
differ when several subsets share the optimal objective.

Usage:
  SOLVER_DIFF_EXPORT=/tmp/cases.json npx tsx tests/solver-reference-differential.test.ts
  python3 -m pip install ortools
  python3 scripts/solver_differential.py /tmp/cases.json
"""

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "services", "solver"))
from cpsat_solver import ORTOOLS_AVAILABLE, solve_invoice_match_ortools  # noqa: E402

MATCHED = {"EXACT_MATCH", "SPLIT_MATCH", "SPLIT_MATCH_WITH_TOLERANCE"}


def main(path: str) -> int:
    if not ORTOOLS_AVAILABLE:
        print("ortools is not installed; refusing to run the fallback search as a cross-check")
        return 2
    cases = json.load(open(path))
    mismatches = 0
    counts = {"matched": 0, "partial": 0, "none": 0}
    for i, case in enumerate(cases):
        req = case["request"]
        eligible = [v for v in req["invoices"] if v.get("status", "ELIGIBLE") == "ELIGIBLE"]
        result = solve_invoice_match_ortools(
            payment_amount_minor=req["paymentAmountMinor"],
            invoices=eligible,
            tolerance_minor=req.get("toleranceMinor", 0),
            allow_partial=req.get("allowPartialPayment", False),
            max_k=min(req.get("maxInvoicesPerSplit", 8), 8),
            timeout_seconds=10.0,
        )
        ts_status, ts_obj = case["tsStatus"], case["tsObjective"]
        py_status = result["status"]
        if ts_status in MATCHED or py_status in MATCHED:
            counts["matched"] += 1
            ok = ts_status in MATCHED and py_status in MATCHED and result["objectiveValue"] == ts_obj and result["solverStatus"] == "OPTIMAL"
        else:
            counts["partial" if ts_status == "PARTIAL_PAYMENT" else "none"] += 1
            ok = ts_status == py_status
        if not ok:
            mismatches += 1
            print(f"case {i}: ts={ts_status}/{ts_obj} ortools={py_status}/{result['objectiveValue']} ({result['solverStatus']})")
    print(f"ortools cross-check: {len(cases)} cases, {counts}, {mismatches} mismatches")
    return 1 if mismatches else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
