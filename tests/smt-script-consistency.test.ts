/*
 * The SMT-LIB script emitted by Z3InvariantProver must describe exactly the
 * numbers the TypeScript evaluation checked, so that running the script
 * through an SMT solver reproduces the verdict: sat <=> PROOF_VALID.
 *
 * Seeded random cases (negative variances, imbalances, tolerances) plus the
 * edge inputs that previously produced a script disagreeing with the verdict
 * or no valid script at all. SMT_EXPORT=<file> writes the cases for
 * scripts/smt_z3_differential.py, which runs them through Z3.
 */

import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { Z3InvariantProver, smtInt } from "../src/lib/ai/z3-prover";

const prover = new Z3InvariantProver();
let seed = 1029;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));

// smtInt
assert.equal(smtInt(0), "0");
assert.equal(smtInt(42), "42");
assert.equal(smtInt(-36), "(- 36)");
assert.throws(() => smtInt(1.5));
assert.throws(() => smtInt(Number.NaN));
assert.throws(() => smtInt(2 ** 53));

const LITERAL = /\(assert \(= \w+ (\d+|\(- \d+\))\)\)/;
const exported: Array<{ name: string; status: string; script: string }> = [];

function base() {
  const gross = int(0, 5_000_000);
  const fee = int(0, Math.floor(gross / 10));
  const tax = int(0, Math.floor(fee / 5));
  const refund = rand() < 0.2 ? int(0, Math.floor(gross / 4)) : 0;
  const chargeback = rand() < 0.1 ? int(0, Math.floor(gross / 10)) : 0;
  const net = gross - fee - tax - refund - chargeback;
  const variance = rand() < 0.5 ? 0 : int(-500, 500);
  return { grossPaise: gross, feePaise: fee, taxPaise: tax, refundPaise: refund, chargebackPaise: chargeback, settledPaise: Math.max(0, net - variance), variancePaise: variance };
}

let valid = 0;
let counterexamples = 0;
for (let i = 0; i < 2000; i++) {
  const a = base() as Record<string, number>;
  if (rand() < 0.25) a.settledPaise += int(-3, 3); // small imbalance
  if (rand() < 0.2) {
    a.debitsPaise = int(0, 1000);
    a.creditsPaise = rand() < 0.5 ? a.debitsPaise : int(0, 1000);
  }
  const tolerancePaise = rand() < 0.3 ? int(1, 5) : 0;
  const r = prover.prove({ contextId: `case_${i}`, assignments: a as never, tolerancePaise });
  assert.ok(r.status === "PROOF_VALID" || r.status === "COUNTEREXAMPLE_FOUND", `case ${i}: ${r.status}`);
  // Model assignment lines bind one variable to a literal.
  const assignmentLines = r.smtLibScript.split("\n").filter((l) => /^\(assert \(= \w+ [(\d]/.test(l) && !l.includes(" (- (- "));
  assert.equal(assignmentLines.length, 11, `case ${i}: expected 11 assignments`);
  for (const line of assignmentLines) {
    assert.match(line, LITERAL, `case ${i}: malformed literal in ${line}`);
  }
  if (r.status === "PROOF_VALID") valid++;
  else counterexamples++;
  exported.push({ name: `case_${i}`, status: r.status, script: r.smtLibScript });
}

const ok = { grossPaise: 10000, feePaise: 200, taxPaise: 36, refundPaise: 0, chargebackPaise: 0, settledPaise: 9764, variancePaise: 0 };
const edge: Array<[string, Record<string, number>, number | undefined]> = [
  ["fractional gross", { ...ok, grossPaise: 10000.4 }, undefined],
  ["NaN fee", { ...ok, feePaise: Number.NaN }, undefined],
  ["1e21 gross", { ...ok, grossPaise: 1e21, settledPaise: 1e21 }, undefined],
  ["unsafe integer", { ...ok, grossPaise: 2 ** 53 + 2, settledPaise: 2 ** 53 + 2 - 236 }, undefined],
  ["fractional tolerance", ok, 0.5],
  ["negative tolerance", ok, -1],
];
for (const [name, a, tol] of edge) {
  const r = prover.prove({ contextId: name, assignments: a as never, tolerancePaise: tol });
  assert.equal(r.status, "SMT_ERROR", `${name}: expected SMT_ERROR, got ${r.status}`);
  assert.ok(!r.smtLibScript.includes("(assert"), `${name}: emitted assertions for unrepresentable input`);
  exported.push({ name, status: r.status, script: r.smtLibScript });
}

const neg = prover.prove({ contextId: "negative variance", assignments: { ...ok, settledPaise: 9800, variancePaise: -36 } as never });
assert.equal(neg.status, "PROOF_VALID");
assert.ok(neg.smtLibScript.includes("(assert (= variance (- 36)))"));

if (process.env.SMT_EXPORT) writeFileSync(process.env.SMT_EXPORT, JSON.stringify(exported));
console.log(`smt consistency: 2000 random cases (${valid} valid, ${counterexamples} counterexamples) and ${edge.length} edge inputs rejected`);
