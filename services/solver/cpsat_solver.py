"""
SettleMate AI — Python OR-Tools CP-SAT Combinatorial Invoice Matcher

Formulates and solves the integer subset-sum optimization problem:
    minimize |selectedTotal - paymentAmount| * 1000 + invoice_count
    subject to:
        selectedTotal = sum(invoiceAmount_i * x_i)
        |selectedTotal - paymentAmount| <= tolerance
        x_i in {0, 1}
"""

from typing import List, Dict, Any, Optional
import time

try:
    from ortools.sat.python import cp_model
    ORTOOLS_AVAILABLE = True
except ImportError:
    ORTOOLS_AVAILABLE = False


def solve_invoice_match_ortools(
    payment_amount_minor: int,
    invoices: List[Dict[str, Any]],
    tolerance_minor: int = 0,
    allow_partial: bool = False,
    max_k: int = 8,
    timeout_seconds: float = 2.0
) -> Dict[str, Any]:
    """
    Executes CP-SAT integer optimization over candidate invoices.
    """
    start_time = time.perf_counter()

    if not invoices:
        return {
            "status": "NO_FEASIBLE_MATCH",
            "solverStatus": "INFEASIBLE",
            "selectedInvoiceIds": [],
            "selectedTotalMinor": 0,
            "differenceMinor": payment_amount_minor,
            "objectiveValue": 0,
            "solveDurationMs": (time.perf_counter() - start_time) * 1000,
        }

    # 1. Fast-Path Exact Match
    for inv in invoices:
        if inv["amountMinor"] == payment_amount_minor:
            duration_ms = (time.perf_counter() - start_time) * 1000
            return {
                "status": "EXACT_MATCH",
                "solverStatus": "OPTIMAL",
                "selectedInvoiceIds": [inv["invoiceId"]],
                "selectedTotalMinor": inv["amountMinor"],
                "differenceMinor": 0,
                "objectiveValue": 1,
                "solveDurationMs": duration_ms,
            }

    if not ORTOOLS_AVAILABLE:
        # Fallback to pure deterministic branch-and-bound
        return solve_subset_sum_fallback(
            payment_amount_minor, invoices, tolerance_minor, allow_partial, max_k, start_time
        )

    # 2. Build CP-SAT Model
    model = cp_model.CpModel()
    n = len(invoices)
    x = [model.NewBoolVar(f"x_{i}") for i in range(n)]

    # Bound cardinality
    model.Add(sum(x) <= max_k)
    model.Add(sum(x) >= 1)

    # Total expression
    total_var = model.NewIntVar(0, sum(inv["amountMinor"] for inv in invoices), "total")
    model.Add(total_var == sum(invoices[i]["amountMinor"] * x[i] for i in range(n)))

    # Difference expression
    diff_var = model.NewIntVar(0, max(payment_amount_minor, 1000000), "diff")
    model.AddAbsEquality(diff_var, total_var - payment_amount_minor)

    # Tolerance constraint
    model.Add(diff_var <= tolerance_minor)

    # Lexicographic objective: minimize diff * 1000 + count
    model.Minimize(diff_var * 1000 + sum(x))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = timeout_seconds

    status = solver.Solve(model)
    duration_ms = (time.perf_counter() - start_time) * 1000

    if status == cp_model.OPTIMAL or status == cp_model.FEASIBLE:
        selected_ids = [invoices[i]["invoiceId"] for i in range(n) if solver.Value(x[i]) == 1]
        selected_total = int(solver.Value(total_var))
        difference = int(solver.Value(diff_var))
        match_type = "EXACT_MATCH" if difference == 0 and len(selected_ids) == 1 else (
            "SPLIT_MATCH" if difference == 0 else "SPLIT_MATCH_WITH_TOLERANCE"
        )

        return {
            "status": match_type,
            "solverStatus": "OPTIMAL" if status == cp_model.OPTIMAL else "FEASIBLE",
            "selectedInvoiceIds": selected_ids,
            "selectedTotalMinor": selected_total,
            "differenceMinor": difference,
            "objectiveValue": int(solver.ObjectiveValue()),
            "solveDurationMs": duration_ms,
        }

    # Partial payment evaluation
    if allow_partial:
        for inv in sorted(invoices, key=lambda x: x["amountMinor"]):
            if inv["amountMinor"] > payment_amount_minor:
                remaining = inv["amountMinor"] - payment_amount_minor
                return {
                    "status": "PARTIAL_PAYMENT",
                    "solverStatus": "FEASIBLE",
                    "selectedInvoiceIds": [inv["invoiceId"]],
                    "selectedTotalMinor": inv["amountMinor"],
                    "differenceMinor": remaining,
                    "objectiveValue": remaining,
                    "solveDurationMs": duration_ms,
                }

    return {
        "status": "NO_FEASIBLE_MATCH",
        "solverStatus": "INFEASIBLE",
        "selectedInvoiceIds": [],
        "selectedTotalMinor": 0,
        "differenceMinor": payment_amount_minor,
        "objectiveValue": 0,
        "solveDurationMs": duration_ms,
    }


def solve_subset_sum_fallback(
    payment_amount_minor: int,
    invoices: List[Dict[str, Any]],
    tolerance_minor: int,
    allow_partial: bool,
    max_k: int,
    start_time: float
) -> Dict[str, Any]:
    """Pure deterministic branch-and-bound when ortools package is not installed."""
    best_ids = []
    best_total = 0
    best_diff = float("inf")
    best_obj = float("inf")

    sorted_inv = sorted(invoices, key=lambda x: x["amountMinor"])

    def search(idx: int, current_total: int, current_subset: List[Dict[str, Any]]):
        nonlocal best_ids, best_total, best_diff, best_obj
        if current_subset:
            diff = abs(current_total - payment_amount_minor)
            if diff <= tolerance_minor:
                obj = diff * 1000 + len(current_subset)
                if obj < best_obj:
                    best_obj = obj
                    best_diff = diff
                    best_total = current_total
                    best_ids = [i["invoiceId"] for i in current_subset]

        if len(current_subset) >= max_k or current_total > payment_amount_minor + tolerance_minor:
            return

        for i in range(idx, len(sorted_inv)):
            inv = sorted_inv[i]
            if current_total + inv["amountMinor"] > payment_amount_minor + tolerance_minor:
                break
            current_subset.append(inv)
            search(i + 1, current_total + inv["amountMinor"], current_subset)
            current_subset.pop()

    search(0, 0, [])
    duration_ms = (time.perf_counter() - start_time) * 1000

    if best_ids:
        match_type = "EXACT_MATCH" if best_diff == 0 and len(best_ids) == 1 else (
            "SPLIT_MATCH" if best_diff == 0 else "SPLIT_MATCH_WITH_TOLERANCE"
        )
        return {
            "status": match_type,
            "solverStatus": "OPTIMAL",
            "selectedInvoiceIds": best_ids,
            "selectedTotalMinor": best_total,
            "differenceMinor": int(best_diff),
            "objectiveValue": int(best_obj),
            "solveDurationMs": duration_ms,
        }

    if allow_partial:
        for inv in sorted_inv:
            if inv["amountMinor"] > payment_amount_minor:
                remaining = inv["amountMinor"] - payment_amount_minor
                return {
                    "status": "PARTIAL_PAYMENT",
                    "solverStatus": "FEASIBLE",
                    "selectedInvoiceIds": [inv["invoiceId"]],
                    "selectedTotalMinor": inv["amountMinor"],
                    "differenceMinor": remaining,
                    "objectiveValue": remaining,
                    "solveDurationMs": duration_ms,
                }

    return {
        "status": "NO_FEASIBLE_MATCH",
        "solverStatus": "INFEASIBLE",
        "selectedInvoiceIds": [],
        "selectedTotalMinor": 0,
        "differenceMinor": payment_amount_minor,
        "objectiveValue": 0,
        "solveDurationMs": duration_ms,
    }
