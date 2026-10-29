/*
 * Property-based differential test of the invoice-matching engine against an
 * independent brute-force reference.
 *
 * The reference enumerates every subset (bitmask) of eligible invoices with
 * 1..maxK members and applies the documented policy directly: feasible when
 * |sum - payment| <= tolerance, objective = difference * 1000 + count. It
 * shares no code with the engine's branch-and-bound search.
 *
 * Cases come from a seeded PRNG (mulberry32), so a failure is reproducible
 * from the printed seed. SOLVER_DIFF_CASES overrides the case count.
 */

import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { cpSatInvoiceMatchingEngine } from "../src/lib/solver/cpsat-engine";
import { solverResultVerifier } from "../src/lib/solver/verifier";
import type { InvoiceMatchInput, InvoiceMatchResponse } from "../src/lib/solver/types";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = Number(process.env.SOLVER_DIFF_SEED ?? 20261029);
const CASES = Number(process.env.SOLVER_DIFF_CASES ?? 3000);
const rand = mulberry32(SEED);
const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));

function generateCase(i: number): InvoiceMatchInput {
  const n = int(1, 12);
  const pool = Array.from({ length: int(1, 4) }, () => int(1, 5000)); // repeated amounts create ties
  const invoices = Array.from({ length: n }, (_, k) => ({
    invoiceId: `inv_${i}_${String(k).padStart(2, "0")}`,
    tenantId: "tenant_a",
    amountMinor: rand() < 0.3 ? pool[int(0, pool.length - 1)] : int(1, 20000),
    currency: "INR",
    status: rand() < 0.85 ? ("ELIGIBLE" as const) : ("CONSUMED" as const),
  }));
  let payment: number;
  if (rand() < 0.6) {
    // Sum of a random subset, possibly perturbed: feasible by construction often.
    payment = invoices.filter(() => rand() < 0.4).reduce((s, v) => s + v.amountMinor, 0) || invoices[0].amountMinor;
    payment = Math.max(1, payment + (rand() < 0.5 ? int(-60, 60) : 0));
  } else {
    payment = int(1, 60000);
  }
  return {
    paymentId: `pay_${i}`,
    tenantId: "tenant_a",
    paymentAmountMinor: payment,
    currency: "INR",
    toleranceMinor: rand() < 0.4 ? 0 : int(0, 80),
    allowPartialPayment: rand() < 0.3,
    maxInvoicesPerSplit: int(1, 6),
    timeoutMs: 10000,
    invoices,
  } as InvoiceMatchInput;
}

interface Reference {
  bestObjective: number | null;
  bestDifference: number | null;
  partialAvailable: boolean;
}

function reference(c: InvoiceMatchInput): Reference {
  const eligible = c.invoices.filter((v) => (v.status ?? "ELIGIBLE") === "ELIGIBLE");
  const maxK = Math.min(c.maxInvoicesPerSplit ?? 8, 8);
  const tol = c.toleranceMinor ?? 0;
  let best: number | null = null;
  let bestDiff: number | null = null;
  for (let mask = 1; mask < 1 << eligible.length; mask++) {
    let count = 0;
    let sum = 0;
    for (let b = 0; b < eligible.length; b++) {
      if (mask & (1 << b)) {
        count++;
        sum += eligible[b].amountMinor;
      }
    }
    if (count > maxK) continue;
    const diff = Math.abs(sum - c.paymentAmountMinor);
    if (diff > tol) continue;
    const obj = diff * 1000 + count;
    if (best === null || obj < best) {
      best = obj;
      bestDiff = diff;
    }
  }
  return {
    bestObjective: best,
    bestDifference: bestDiff,
    partialAvailable: !!c.allowPartialPayment && eligible.some((v) => v.amountMinor > c.paymentAmountMinor),
  };
}

function mutations(r: InvoiceMatchResponse, c: InvoiceMatchInput): InvoiceMatchResponse[] {
  const out: InvoiceMatchResponse[] = [];
  if (r.selectedInvoiceIds.length > 0) {
    out.push({ ...r, selectedTotalMinor: r.selectedTotalMinor + 1 });
    out.push({ ...r, objectiveValue: r.objectiveValue + 1 });
    out.push({ ...r, differenceMinor: r.differenceMinor + 1 });
    out.push({ ...r, selectedInvoiceIds: [...r.selectedInvoiceIds, r.selectedInvoiceIds[0]] });
    out.push({ ...r, selectedInvoiceIds: [...r.selectedInvoiceIds, "inv_not_in_request"] });
    const ineligible = c.invoices.find((v) => v.status === "CONSUMED");
    if (ineligible) out.push({ ...r, selectedInvoiceIds: [...r.selectedInvoiceIds, ineligible.invoiceId] });
    // Same total, but more invoices than the request allows.
    const extra = c.invoices.filter((v) => v.status !== "CONSUMED" && !r.selectedInvoiceIds.includes(v.invoiceId));
    if (r.status !== "PARTIAL_PAYMENT" && r.selectedInvoiceIds.length + extra.length > (c.maxInvoicesPerSplit ?? 8)) {
      const ids = [...r.selectedInvoiceIds, ...extra.map((v) => v.invoiceId)];
      out.push({ ...r, selectedInvoiceIds: ids });
    }
  }
  return out;
}

const exported: unknown[] = [];
let feasibleCases = 0;
let partialCases = 0;
let noMatchCases = 0;
let rejectedMutations = 0;

for (let i = 0; i < CASES; i++) {
  const c = generateCase(i);
  const ref = reference(c);
  const r = cpSatInvoiceMatchingEngine.solve(c);
  const label = `seed=${SEED} case=${i}`;

  assert.notEqual(r.status, "SOLVER_TIMEOUT", `${label}: unexpected timeout`);

  if (ref.bestObjective !== null) {
    feasibleCases++;
    assert.ok(["EXACT_MATCH", "SPLIT_MATCH", "SPLIT_MATCH_WITH_TOLERANCE"].includes(r.status), `${label}: expected a match, got ${r.status}`);
    assert.equal(r.objectiveValue, ref.bestObjective, `${label}: objective ${r.objectiveValue} != reference ${ref.bestObjective}`);
    assert.equal(r.differenceMinor, ref.bestDifference, `${label}: difference`);
    assert.equal(r.status === "SPLIT_MATCH_WITH_TOLERANCE", ref.bestDifference! > 0, `${label}: status/difference agreement`);
  } else if (ref.partialAvailable) {
    partialCases++;
    assert.equal(r.status, "PARTIAL_PAYMENT", `${label}: expected PARTIAL_PAYMENT, got ${r.status}`);
  } else {
    noMatchCases++;
    assert.equal(r.status, "NO_FEASIBLE_MATCH", `${label}: expected NO_FEASIBLE_MATCH, got ${r.status}`);
    assert.deepEqual(r.selectedInvoiceIds, []);
  }

  const report = solverResultVerifier.verify(c, r);
  assert.ok(report.passed, `${label}: verifier rejected engine output: ${report.failureReasons.join("; ")}`);

  for (const bad of mutations(r, c)) {
    assert.equal(solverResultVerifier.verify(c, bad).passed, false, `${label}: verifier accepted a corrupted result`);
    rejectedMutations++;
  }

  exported.push({ request: c, tsObjective: r.status === "NO_FEASIBLE_MATCH" ? null : r.objectiveValue, tsStatus: r.status });
}

// Inputs for the optional OR-Tools cross-check (scripts/solver_differential.py).
if (process.env.SOLVER_DIFF_EXPORT) writeFileSync(process.env.SOLVER_DIFF_EXPORT, JSON.stringify(exported));

console.log(
  `solver differential: ${CASES} cases (seed ${SEED}) — ${feasibleCases} matched, ${partialCases} partial, ${noMatchCases} no match; ` +
    `${rejectedMutations} corrupted results rejected by the verifier`
);
