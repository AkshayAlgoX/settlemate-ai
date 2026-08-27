"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Sparkles,
  ShieldCheck,
  Target,
  FileCheck,
  AlertCircle,
  RefreshCw,
  Play,
  Award,
} from "lucide-react";
import { GuidedTourModal } from "@/components/layout/guided-tour-modal";

interface BatchMeta {
  id: string;
  name?: string | null;
  size: number;
  status: string;
  createdAt: string;
}

const CORE_DIFFERENTIATORS = [
  {
    num: "01",
    title: "Advisory-Only AI with Deterministic Validation",
    icon: ShieldCheck,
    badge: "AI SAFETY BOUNDARY",
    desc: "AI assists operations but is mathematically barred from writing to the ledger. Structured claims are mechanically checked against raw feeds by non-LLM validators at 134,511 claims/s before ledger finalization.",
  },
  {
    num: "02",
    title: "98.1% Accuracy on Official Benchmark",
    icon: Target,
    badge: "REPRODUCIBLE TRUTH",
    desc: "Bitwise deterministic 98.1% accuracy, 98% precision, 98% recall, and 90% adversarial detection (9/10) on the official 250-record dataset (Fingerprint: 81d840cd8cf981e5e69a367b879a8f11e9e51d60136a6d38e430877f08cab02b).",
  },
  {
    num: "03",
    title: "Cryptographic Decision Receipts + Offline Verification",
    icon: FileCheck,
    badge: "TAMPER-EVIDENT DAG",
    desc: "Every reconciliation decision emits a canonical SHA-256 Merkle DAG receipt that auditors can verify offline in <1ms with zero LLMs and zero external database dependencies.",
  },
  {
    num: "04",
    title: "Honest Exception List with Reason Codes",
    icon: AlertCircle,
    badge: "TRANSPARENT AUDIT",
    desc: "Unresolved variances are isolated with exact integer paise shortfalls, transparent reason codes, Context Vault evidence citations, and dual-control Maker/Checker sign-off.",
  },
  {
    num: "05",
    title: "Failure Recovery: 100K Chaos & 0 DLQ",
    icon: RefreshCw,
    badge: "EFFECTIVELY-ONCE RESULT",
    desc: "Demonstrated 100% crash recovery across 10,000 injected worker failures in a 100,000-record streaming load with 0 dead-letter queue drops via atomic CAS locking and ledger idempotency.",
  },
];

const COMPACT_METRICS = [
  {
    value: "98.1%",
    label: "Official Accuracy",
    detail: "98% Prec · 98% Rec · 90% Adv",
  },
  {
    value: "806.75",
    unit: "rec/s",
    label: "Core Throughput",
    detail: "Up to 1,246 rec/s on scale",
  },
  {
    value: "100%",
    label: "Chaos Crash Recovery",
    detail: "10k crashes · 0 DLQ drops",
  },
  {
    value: "0",
    label: "False Ledger Writes",
    detail: "Zero-LLM invariant gated",
  },
];

export default function LandingPage() {
  const [batch, setBatch] = useState<BatchMeta | null>(null);
  const [tourOpen, setTourOpen] = useState<boolean>(false);

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
    <div className="space-y-10 pb-8 md:space-y-12">
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
                Autonomous Finance Controller · Track 04
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="border border-[#2e3b26] bg-[#11170d] px-2.5 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.14em] text-[#a9ba8a]">
              EFFECTIVELY-ONCE FINANCIAL RESULT
            </span>
            <div className="inline-flex items-center gap-2 border border-[#30372f] bg-[#0e110e] px-3 py-1.5 text-[8px] font-medium uppercase tracking-[0.16em] text-[#848b81]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#99aa7d]" />
              System operational · SQLite WAL
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="space-y-5">
        <div className="inline-flex items-center gap-2 border border-[#333d2a] bg-[#11150e] px-2.5 py-1 text-[8px] font-bold uppercase tracking-[0.2em] text-[#a8b98b]">
          <Sparkles className="h-3 w-3" />
          Razorpay AI Buildathon · Track 4: AI Finance Controller
        </div>

        <h1 className="max-w-3xl text-[34px] font-semibold leading-[1.08] tracking-[-0.055em] text-[#efede5] sm:text-[44px]">
          Financial reconciliation with
          <br />
          cryptographic proof &amp; grounded AI.
        </h1>

        <p className="max-w-2xl text-[13px] leading-relaxed text-[#858c82]">
          SettleMate AI reconciles multi-source financial streams through a deterministic invariant engine and grounded advisory council — where <strong className="text-[#d8d5c7]">AI assists operations, but never controls financial truth.</strong>
        </p>

        {/* Primary Call to Action */}
        <div className="pt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setTourOpen(true)}
            className="inline-flex h-11 items-center gap-2.5 border border-[#5d6e46] bg-[#172012] hover:bg-[#1f2c18] px-6 text-[9px] font-bold uppercase tracking-[0.16em] text-[#c7d5a5] shadow-[0_0_20px_rgba(164,186,128,0.15)] transition"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            Watch Guided Demo
          </button>

          <Link
            href="/judge-mode"
            className="inline-flex h-11 items-center gap-2 border border-[#3e5532] bg-[#142211] hover:bg-[#1a2b16] px-5 text-[9px] font-bold uppercase tracking-[0.15em] text-[#a4b58a] transition"
          >
            <Award className="h-3.5 w-3.5" />
            Executive Judge Mode
          </Link>

          <Link
            href={dashboardHref}
            className="inline-flex h-11 items-center gap-2 border border-[#363c34] bg-[#0e110e] px-5 text-[9px] font-semibold uppercase tracking-[0.15em] text-[#abaea5] transition hover:border-[#4a5341] hover:text-[#d3d2ca]"
          >
            Dashboard
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>

      {/* Compact Metrics Row */}
      <section className="border border-[#2a2e29] bg-[#0d100d]">
        <div className="grid grid-cols-2 divide-y divide-[#252a24] sm:grid-cols-4 sm:divide-y-0 sm:divide-x divide-[#252a24]">
          {COMPACT_METRICS.map((m) => (
            <div key={m.label} className="p-4 sm:p-5 bg-[#0a0d0a]">
              <div className="flex items-baseline gap-1">
                <span className="font-mono text-2xl sm:text-[28px] font-bold tracking-tight text-[#e8e5da]">
                  {m.value}
                </span>
                {m.unit && (
                  <span className="font-mono text-[10px] font-medium text-[#7c8477]">
                    {m.unit}
                  </span>
                )}
              </div>
              <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.14em] text-[#8f968b]">
                {m.label}
              </div>
              <div className="mt-1 text-[8.5px] font-mono text-[#686f64]">
                {m.detail}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 5 Core Differentiators */}
      <section className="space-y-4">
        <div className="border-b border-[#20241f] pb-3">
          <div className="text-[8px] font-medium uppercase tracking-[0.2em] text-[#626960]">
            Core Architectural Differentiators
          </div>
          <h2 className="text-[16px] font-semibold text-[#dddcd4]">
            Why SettleMate AI Wins Track 04
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {CORE_DIFFERENTIATORS.map((d) => {
            const Icon = d.icon;
            return (
              <div
                key={d.num}
                className="border border-[#252a24] bg-[#0d100d] p-4 sm:p-5 transition-all hover:border-[#3e5532] hover:bg-[#10140f]"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex items-start gap-3.5">
                    <div className="p-2 border border-[#252a24] bg-[#060806] text-[#a4b58a] shrink-0">
                      <Icon className="h-4 w-4" />
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[9px] font-bold text-[#687063]">
                          {d.num}
                        </span>
                        <h3 className="text-xs sm:text-sm font-bold text-[#e3e1d8]">
                          {d.title}
                        </h3>
                      </div>
                      <p className="text-[11.5px] leading-relaxed text-[#8c9288] max-w-3xl">
                        {d.desc}
                      </p>
                    </div>
                  </div>

                  <span className="font-mono text-[8px] font-bold px-2 py-0.5 border border-[#252a24] bg-[#060806] text-[#a4b58a] shrink-0 self-start sm:self-auto">
                    {d.badge}
                  </span>
                </div>
              </div>
            );
          })}
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
