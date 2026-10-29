"""
Run the SMT-LIB scripts emitted by Z3InvariantProver through Z3 and check
that Z3 agrees with the TypeScript verdict: sat for PROOF_VALID, unsat for
COUNTEREXAMPLE_FOUND, and no assertions at all for SMT_ERROR.

Usage:
  SMT_EXPORT=/tmp/smt.json npx tsx tests/smt-script-consistency.test.ts
  python3 -m pip install z3-solver
  python3 scripts/smt_z3_differential.py /tmp/smt.json
"""

import json
import sys

import z3


def main(path: str) -> int:
    cases = json.load(open(path))
    mismatches = 0
    tally = {"sat": 0, "unsat": 0, "skipped": 0}
    for case in cases:
        if case["status"] == "SMT_ERROR":
            tally["skipped"] += 1
            if "(assert" in case["script"]:
                mismatches += 1
                print(f"{case['name']}: SMT_ERROR but the script has assertions")
            continue
        solver = z3.Solver()
        try:
            solver.from_string(case["script"].replace("(get-model)", ""))
            verdict = str(solver.check())
        except z3.Z3Exception as err:
            verdict = f"error: {err}"
        tally[verdict] = tally.get(verdict, 0) + 1
        expected = "sat" if case["status"] == "PROOF_VALID" else "unsat"
        if verdict != expected:
            mismatches += 1
            print(f"{case['name']}: ts={case['status']} z3={verdict}")
    print(f"z3 {z3.get_version_string()}: {len(cases)} scripts, {tally}, {mismatches} mismatches")
    return 1 if mismatches else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
