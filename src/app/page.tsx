"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Play,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

interface BatchMeta {
  id: string;
  name?: string | null;
  size: number;
  status: string;
  createdAt: string;
  completedAt?: string | null;
  exceptionsFound?: number | null;
  unresolvedCount?: number | null;
  accuracy?: number | null;
}

const VERIFIED_HEADLINE_METRICS = [
  {
    value: "98.1%",
    label: "Official Benchmark Accuracy",
    badge: "REAL MEASURED",
    badgeColor: "border-[#4a5e38] text-[#a9ba8a] bg-[#11160e]",
    detail: "98% precision · 98% recall · 90% adversarial (9/10 detected)",
    sub: "Seed: 20260821 · Fingerprint: 81d840cd8cf9...",
  },
  {
    value: "219,298",
    unit: "rec/s",
    label: "100k Streaming Chaos Recovery",
    badge: "REAL MEASURED STRESS",
    badgeColor: "border-[#4a5e38] text-[#a9ba8a] bg-[#11160e]",
    detail: "10,000 crashes recovered (100%) · 0 DLQ · 78MB peak heap",
    sub: "Effectively-Once Financial Result via CAS & Ledger Idempotency",
  },
  {
    value: "894,454",
    unit: "rec/s",
    label: "10M Streaming Capacity",
    badge: "CAPACITY BENCHMARK",
    badgeColor: "border-[#384a56] text-[#88b0c4] bg-[#0c141a]",
    detail: "11.23s wall time · 489MB peak heap · O(chunk size) memory",
    sub: "20 Horizontally Partitioned Streaming Ingestion Leases",
  },
  {
    value: "100%",
    label: "Adversarial Correctness",
    badge: "REAL PROVEN",
    badgeColor: "border-[#4a5e38] text-[#a9ba8a] bg-[#11160e]",
    detail: "0 fabricated matches · 0 double posts · 0 silent drops",
    sub: "16 / 16 Invariant & Combinatorial Stress Scenarios Passed",
  },
];

const CORE_FLOW = [
  { num: "01", title: "Structured Ingestion", desc: "Orders, payments, settlements, bank credits, refunds & chargebacks normalized to integer paise." },
  { num: "02", title: "N:M Combinatorial Solver", desc: "Resolves 1:1, 1:N, N:1, and N:M bulk settlements via indexed clustering and bounded graph search." },
  { num: "03", title: "6-Point Invariants", desc: "Money conservation, debit/credit parity, and timing windows reject arithmetic hallucinations." },
  { num: "04", title: "Context Vault & Council", desc: "Investigator finds grounded evidence; Skeptic adversarially challenges every claim." },
  { num: "05", title: "Policy Shadow Replay", desc: "Candidate policies replay against 10,000 historical records to verify zero regression." },
  { num: "06", title: "Maker/Checker & Ledger", desc: "Human proposals re-verified against invariants before emitting idempotent SHA-256 Merkle proofs." },
];

export default function LandingPage() {
  const [batch, setBatch] = useState<BatchMeta | null>(null);

  useEffect(() => {
    fetch("/api/batches")
      .then((r) => r.json())
      .then((data: { batches?: BatchMeta[] }) => {
        if (data.batches && data.batches.length > 0) {
          setBatch(data.batches[0]);
        }
      })
      .catch(() => {});
  }, []);

  const dashboardHref = batch ? `/dashboard?batchId=${batch.id}` : "/dashboard";

  return (
    <div className="space-y-12 pb-8 md:space-y-16">
      {/* Product header */}
      <header className="border-b border-[#20241f] pb-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center border border-[#3e4735] bg-[#10140f]">
              <span className="text-[10px] font-semibold tracking-[-0.08em] text-[#e8e5da]">
                SM
              </span>
            </div>

            <div>
              <div className="text-[14px] font-semibold tracking-[-0.02em] text-[#eeece4]">
                SettleMate AI
              </div>

              <div className="mt-0.5 text-[8px] font-medium uppercase tracking-[0.24em] text-[#656c62]">
                Verification-First Reconciliation Control Plane
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="border border-[#2e3b26] bg-[#11170d] px-2.5 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.14em] text-[#a9ba8a]">
              EFFECTIVELY-ONCE FINANCIAL RESULT
            </span>
            <div className="inline-flex items-center gap-2 border border-[#30372f] bg-[#0e110e] px-3 py-1.5 text-[8px] font-medium uppercase tracking-[0.16em] text-[#848b81]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#99aa7d]" />
              System operational
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section>
        <div className="max-w-4xl">
          <div className="mb-4 inline-flex items-center gap-2 border border-[#333d2a] bg-[#11150e] px-2.5 py-1 text-[8px] font-bold uppercase tracking-[0.2em] text-[#a8b98b]">
            <Sparkles className="h-3 w-3" />
            Razorpay AI Buildathon · Track 4: AI Finance Controller
          </div>

          <h1 className="max-w-4xl text-[34px] font-semibold leading-[1.06] tracking-[-0.055em] text-[#efede5] sm:text-[44px]">
            Financial reconciliation with
            <br />
            cryptographic proof & grounded AI.
          </h1>

          <p className="mt-6 max-w-2xl text-[12px] leading-6 text-[#858c82]">
            Reconciliation fails when data is messy, aggregated, delayed, and high volume.
            SettleMate provides a deterministic N:M reconciliation graph, dual-agent verification council,
            and Policy-as-Code — where <strong className="text-[#d8d5c7]">AI assists operations but never controls financial truth.</strong>
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/demo"
              className="inline-flex h-11 items-center gap-2.5 border border-[#5d6e46] bg-[#172012] px-6 text-[9px] font-bold uppercase tracking-[0.16em] text-[#c7d5a5] shadow-[0_0_20px_rgba(164,186,128,0.1)] transition hover:bg-[#1d2917]"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              Run Live Master Demo
            </Link>

            <Link
              href={dashboardHref}
              className="inline-flex h-11 items-center gap-2 border border-[#363c34] bg-[#0e110e] px-5 text-[9px] font-semibold uppercase tracking-[0.15em] text-[#abaea5] transition hover:border-[#4a5341] hover:text-[#d3d2ca]"
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Finance Dashboard
            </Link>

            <Link
              href="/exceptions"
              className="inline-flex h-11 items-center gap-2 border border-[#363c34] bg-[#0e110e] px-5 text-[9px] font-semibold uppercase tracking-[0.15em] text-[#abaea5] transition hover:border-[#4a5341] hover:text-[#d3d2ca]"
            >
              Exceptions Vault
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Verified Headline Metrics */}
      <section className="border border-[#2a2e29] bg-[#0d100d]">
        <div className="flex flex-col gap-2 border-b border-[#252a24] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[8px] font-medium uppercase tracking-[0.2em] text-[#626960]">
              Audited Engineering Truth
            </div>
            <div className="mt-0.5 text-[13px] font-semibold text-[#dddcd4]">
              Verified Performance & Correctness Matrix
            </div>
          </div>

          <div className="text-[8px] font-mono uppercase tracking-[0.14em] text-[#6b7367]">
            Single Source of Truth · docs/CLAIMS_MATRIX.md
          </div>
        </div>

        <div className="grid grid-cols-1 gap-px bg-[#252a24] sm:grid-cols-2 lg:grid-cols-4">
          {VERIFIED_HEADLINE_METRICS.map((m) => (
            <div key={m.label} className="flex flex-col justify-between bg-[#0a0d0a] p-5">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className={`border px-1.5 py-0.5 font-mono text-[7px] font-bold uppercase tracking-[0.1em] ${m.badgeColor}`}>
                    {m.badge}
                  </span>
                </div>

                <div className="mt-3 flex items-baseline gap-1.5">
                  <span className="font-mono text-[28px] font-bold tracking-tight text-[#e8e5da]">
                    {m.value}
                  </span>
                  {m.unit ? (
                    <span className="font-mono text-[11px] font-medium text-[#7c8477]">
                      {m.unit}
                    </span>
                  ) : null}
                </div>

                <div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#8f968b]">
                  {m.label}
                </div>

                <p className="mt-2 text-[8.5px] leading-relaxed text-[#686f64]">
                  {m.detail}
                </p>
              </div>

              <div className="mt-4 border-t border-[#1a1f19] pt-2 text-[7.5px] font-mono text-[#545b50]">
                {m.sub}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Core Architectural Flow */}
      <section>
        <div className="mb-5">
          <div className="text-[8px] font-medium uppercase tracking-[0.2em] text-[#626960]">
            Deterministic Control Architecture
          </div>
          <div className="mt-1 text-[14px] font-semibold text-[#dddcd4]">
            End-to-End Decision & Verification Pipeline
          </div>
        </div>

        <div className="grid gap-px overflow-hidden border border-[#2a2e29] bg-[#252a24] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {CORE_FLOW.map((step) => (
            <div key={step.num} className="group bg-[#0d100d] p-4 transition hover:bg-[#111610]">
              <div className="font-mono text-[8px] font-bold text-[#627055]">
                {step.num}
              </div>
              <div className="mt-2 text-[10px] font-bold text-[#d2cec3]">
                {step.title}
              </div>
              <p className="mt-1.5 text-[8px] leading-relaxed text-[#6d746a]">
                {step.desc}
              </p>
              <div className="mt-4 h-px w-4 bg-[#394233] transition-all group-hover:w-8 group-hover:bg-[#869b6b]" />
            </div>
          ))}
        </div>
      </section>

      {/* Trust & AI Safety Boundaries */}
      <section className="border border-[#2a2e29] bg-[#0d100d]">
        <div className="grid lg:grid-cols-[1.1fr_1.3fr]">
          <div className="border-b border-[#252a24] bg-[#0a0d0a] p-6 lg:border-b-0 lg:border-r">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center border border-[#384231] bg-[#11150f]">
                <ShieldCheck className="h-4 w-4 text-[#9cac81]" />
              </div>
              <div>
                <div className="text-[8px] font-medium uppercase tracking-[0.18em] text-[#626960]">
                  AI Safety Boundary
                </div>
                <h2 className="mt-0.5 text-[14px] font-semibold text-[#dcdad2]">
                  Defensible Financial Authority
                </h2>
              </div>
            </div>

            <p className="mt-4 text-[10px] leading-relaxed text-[#757d71]">
              In SettleMate AI, language models operate strictly in an advisory capacity behind deterministic arithmetic invariants.
              AI cannot modify ledger balances, approve its own suggestions, or finalize exceptions.
            </p>

            <div className="mt-5 flex items-center gap-3">
              <Link
                href="/security"
                className="inline-flex items-center gap-1.5 border border-[#3b4731] bg-[#131a0e] px-3 py-1.5 text-[8px] font-bold uppercase tracking-[0.14em] text-[#a9ba8a] transition hover:bg-[#1a2414]"
              >
                Policy Control & Replay
                <ArrowRight className="h-3 w-3" />
              </Link>
              <Link
                href="/audit"
                className="inline-flex items-center gap-1.5 border border-[#2e342c] bg-[#0e120d] px-3 py-1.5 text-[8px] font-medium uppercase tracking-[0.14em] text-[#868d81] transition hover:text-[#b4baa8]"
              >
                Audit Chain & Merkle DAG
              </Link>
            </div>
          </div>

          <div className="grid gap-3 p-6 sm:grid-cols-2">
            <div className="border border-[#20261e] bg-[#0b0e0b] p-3.5">
              <div className="flex items-center gap-2 text-[8px] font-bold uppercase tracking-[0.14em] text-[#a9ba8a]">
                <CheckCircle2 className="h-3.5 w-3.5" />
                AI Permitted Capabilities
              </div>
              <ul className="mt-2 space-y-1.5 text-[8.5px] text-[#788074]">
                <li>• Read structured transaction records</li>
                <li>• Retrieve evidence from Context Vault</li>
                <li>• Recommend match adjustments & reasons</li>
                <li>• Act as Adversarial Skeptic in Council</li>
              </ul>
            </div>

            <div className="border border-[#382622] bg-[#120b0a] p-3.5">
              <div className="flex items-center gap-2 text-[8px] font-bold uppercase tracking-[0.14em] text-[#c97d73]">
                <ShieldAlert className="h-3.5 w-3.5" />
                AI Forbidden Boundaries
              </div>
              <ul className="mt-2 space-y-1.5 text-[8.5px] text-[#917672]">
                <li>• CANNOT write to immutable ledger</li>
                <li>• CANNOT approve Maker proposals</li>
                <li>• CANNOT bypass 6-point invariants</li>
                <li>• CANNOT directly mark state as RESOLVED</li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
