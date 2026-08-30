"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { GuidedTourModal } from "@/components/layout/guided-tour-modal";
import { BrandMark } from "@/components/layout/sidebar";

const CORE_DIFFERENTIATORS = [
  {
    num: "01",
    title: "Deterministic first",
    tag: "Rule-Engine Core",
    desc: "The financial source of truth is governed by deterministic rules, UTR matching, and exact integer-paise arithmetic. AI is mathematically barred from direct ledger mutation.",
  },
  {
    num: "02",
    title: "Safe AI",
    tag: "Non-LLM Validation",
    desc: "AI assists investigation instead of executing financial state changes. Every structured claim is mechanically verified against raw transaction feeds at 134,511 claims/s.",
  },
  {
    num: "03",
    title: "Adversarial defense",
    tag: "Hostile Input Lab",
    desc: "The engine is tested against hostile prompt injections, fake voucher IDs, SSRF payloads, and corrupted bank narrations with 90% adversarial catch rate.",
  },
  {
    num: "04",
    title: "Auditable decisions",
    tag: "Merkle DAG Receipts",
    desc: "Every finalized reconciliation emits a canonical SHA-256 Merkle DAG receipt that external auditors can verify offline in <1ms without calling any LLM.",
  },
  {
    num: "05",
    title: "Production controls",
    tag: "Maker/Checker & Idempotency",
    desc: "Dual-control separation of duties and atomic compare-and-swap (CAS) locking enforce human authorization before journal postings with zero paise balance drift.",
  },
];

const COMPACT_METRICS = [
  {
    value: "98.1%",
    label: "Reconciliation accuracy",
    detail: "Official benchmark · Exact match",
  },
  {
    value: "806.75",
    unit: "rec/s",
    label: "Measured throughput",
    detail: "Sub-millisecond latency per record",
  },
  {
    value: "100%",
    label: "Chaos recovery rate",
    detail: "10,000 crashes · 0 DLQ drops",
  },
  {
    value: "0",
    label: "False financial writes",
    detail: "Zero-LLM invariant enforcement",
  },
];

export default function LandingPage() {
  const [tourOpen, setTourOpen] = useState<boolean>(false);

  return (
    <div
      className="w-full max-w-[1680px] mx-auto flex flex-col justify-between py-6 sm:py-8 space-y-12 sm:space-y-16 pb-16 font-sans min-h-screen"
      style={{ paddingInline: "clamp(24px, 4.5vw, 80px)" }}
    >
      {/* Header — Spans full wide canvas */}
      <header className="flex items-center justify-between border-b border-border pb-4 w-full">
        <div className="flex items-center gap-3">
          <BrandMark />
          <div>
            <div className="text-sm font-semibold tracking-tight text-foreground">
              SettleMate AI
            </div>
            <div className="text-[11px] font-mono text-muted-foreground">
              Autonomous Financial Control Plane
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 text-xs font-medium text-foreground hover:bg-accent hover:border-foreground/30 transition cursor-pointer"
          >
            <span>Sign in</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </header>

      {/* Hero Section — Wide Canvas Layout without redundant pill */}
      <section className="min-h-[340px] sm:min-h-[380px] lg:min-h-[420px] flex flex-col justify-center py-6 sm:py-8 lg:py-10 space-y-6 w-full">
        <div className="space-y-4 max-w-4xl">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-[64px] 2xl:text-[70px] font-bold tracking-tight text-foreground leading-[1.06]">
            Deterministic reconciliation.
            <br />
            <span className="text-muted-foreground font-semibold">Safe AI where it matters.</span>
          </h1>

          <p className="max-w-3xl text-base sm:text-lg lg:text-xl text-muted-foreground leading-relaxed pt-1">
            Reconcile payments, settlements, bank records, refunds and chargebacks with deterministic controls and auditable AI-assisted investigation.
          </p>
        </div>

        {/* Primary Actions — Clean hierarchy: Guided Demo (Primary), Judge Mode (Secondary) */}
        <div className="pt-2 flex flex-wrap items-center gap-3.5">
          <button
            type="button"
            onClick={() => setTourOpen(true)}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition shadow-xs cursor-pointer"
          >
            <span>Watch Guided Demo</span>
          </button>

          <Link
            href="/judge-mode"
            className="inline-flex h-10 items-center rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground hover:border-foreground/30 hover:bg-accent transition"
          >
            Executive Judge Mode
          </Link>
        </div>
      </section>

      {/* Authoritative Metrics — Spans Full Wide Canvas */}
      <section className="w-full rounded-xl border border-border bg-card overflow-hidden shadow-2xs">
        <div className="grid grid-cols-2 divide-y divide-border sm:grid-cols-4 sm:divide-y-0 sm:divide-x divide-border">
          {COMPACT_METRICS.map((m) => (
            <div key={m.label} className="p-6 sm:p-7 lg:p-8 space-y-1.5">
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-2xl sm:text-3xl lg:text-4xl xl:text-5xl font-bold tracking-tight text-foreground">
                  {m.value}
                </span>
                {m.unit && (
                  <span className="font-mono text-xs sm:text-sm lg:text-base text-muted-foreground">
                    {m.unit}
                  </span>
                )}
              </div>
              <div className="text-xs sm:text-sm lg:text-base font-semibold text-foreground">
                {m.label}
              </div>
              <div className="text-[11px] sm:text-xs text-muted-foreground">
                {m.detail}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 5 Core Differentiators — Full Canvas Width */}
      <section className="w-full space-y-6">
        <div className="space-y-1 border-b border-border pb-4 w-full">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Why SettleMate
          </div>
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-foreground">
            Five architectural pillars of financial integrity
          </h2>
        </div>

        <div className="divide-y divide-border w-full">
          {CORE_DIFFERENTIATORS.map((d) => (
            <div
              key={d.num}
              className="py-5 sm:py-6 lg:py-7 first:pt-0 last:pb-0 w-full"
            >
              <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2.5 sm:gap-8 w-full">
                <div className="flex items-baseline gap-4 sm:gap-6 min-w-0">
                  <span className="font-mono text-xs sm:text-sm font-semibold text-muted-foreground/70 shrink-0">
                    {d.num}
                  </span>
                  <div className="space-y-1.5 min-w-0">
                    <h3 className="text-base sm:text-lg lg:text-xl font-semibold text-foreground">
                      {d.title}
                    </h3>
                    <p className="text-xs sm:text-sm lg:text-base text-muted-foreground leading-relaxed max-w-4xl">
                      {d.desc}
                    </p>
                  </div>
                </div>

                <span className="text-xs font-mono text-muted-foreground shrink-0 self-start sm:self-auto pl-8 sm:pl-0 border border-border/80 bg-muted/40 px-2 py-0.5 rounded-md">
                  {d.tag}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Guided Tour Modal */}
      <GuidedTourModal
        isOpen={tourOpen}
        onClose={() => setTourOpen(false)}
      />
    </div>
  );
}
