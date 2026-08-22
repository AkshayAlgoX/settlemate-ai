"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Database,
  Fingerprint,
  ShieldCheck,
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

const BENCHMARK_STATS = [
  {
    value: "98.1%",
    label: "Accuracy",
    detail: "records classified correctly",
  },
  {
    value: "98%",
    label: "Precision",
    detail: "flagged matches verified",
  },
  {
    value: "98%",
    label: "Recall",
    detail: "true exceptions detected",
  },
  {
    value: "90%",
    label: "Adversarial",
    detail: "9 of 10 injected errors",
  },
];

const FLOW_STEPS = [
  {
    num: "01",
    title: "Source data",
    desc: "Orders, payments, settlements, bank credits, refunds and chargebacks.",
  },
  {
    num: "02",
    title: "Deterministic reconciliation",
    desc: "Explicit rules and integer-paise arithmetic establish financial truth.",
    primary: true,
  },
  {
    num: "03",
    title: "Typed exception",
    desc: "Unresolved records become risk-scored financial investigations.",
  },
  {
    num: "04",
    title: "Grounded explanation",
    desc: "AI explains only from validated evidence in the active batch.",
  },
  {
    num: "05",
    title: "Human decision",
    desc: "Consequential actions follow an authenticated approval path.",
  },
  {
    num: "06",
    title: "Audit trail",
    desc: "Every meaningful action and state change is traceable.",
  },
];

const CAPABILITIES = [
  {
    num: "01",
    title: "Deterministic Matching",
    desc: "Explicit rules, UTR matching and integer-paise calculations form the financial source of truth.",
  },
  {
    num: "02",
    title: "Exception Intelligence",
    desc: "Every unresolved discrepancy becomes a typed and risk-scored investigation.",
  },
  {
    num: "03",
    title: "Grounded AI",
    desc: "Explanations and recommendations are constrained to validated evidence.",
  },
  {
    num: "04",
    title: "Human-in-the-Loop",
    desc: "Final financial decisions stay behind authenticated role-controlled workflow.",
  },
  {
    num: "05",
    title: "Audit & Provenance",
    desc: "Source records, decisions, actors and state changes remain traceable.",
  },
  {
    num: "06",
    title: "Adversarial Validation",
    desc: "The system tests its own reconciliation logic against hostile scenarios.",
  },
];

const SECURITY_CONTROLS = [
  "Server-derived identity",
  "Role-based approval",
  "AI cannot resolve exceptions",
  "Compare-and-swap transitions",
  "Append-only audit events",
  "Grounded evidence whitelist",
  "Deterministic AI fallback",
];

const statusLabel = (status: string) => {
  if (status === "COMPLETED") return "Completed";
  if (status === "PROCESSING") return "In progress";
  return "Created";
};

const statusMeta = (status: string) => {
  if (status === "COMPLETED") {
    return {
      dot: "bg-[#96aa79]",
      text: "text-[#a8b68e]",
      border: "border-[#3d4b35]",
      bg: "bg-[#11160f]",
    };
  }

  if (status === "PROCESSING") {
    return {
      dot: "bg-[#ba9f63] animate-pulse",
      text: "text-[#c3ae78]",
      border: "border-[#55482f]",
      bg: "bg-[#17130b]",
    };
  }

  return {
    dot: "bg-[#737b71]",
    text: "text-[#969b92]",
    border: "border-[#343934]",
    bg: "bg-[#10130f]",
  };
};

function fmtDateTime(iso?: string | null) {
  if (!iso) return "—";

  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-IN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function LandingPage() {
  const [batch, setBatch] = useState<BatchMeta | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let active = true;

    fetch("/api/batches")
      .then((response) => response.json())
      .then((data: { batches?: BatchMeta[] }) => {
        if (!active) return;

        if (data.batches && data.batches.length > 0) {
          setBatch(data.batches[0]);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setChecked(true);
      });

    return () => {
      active = false;
    };
  }, []);

  const dashboardHref = batch
    ? `/dashboard?batchId=${batch.id}`
    : "/dashboard";

  const meta = statusMeta(batch?.status || "CREATED");

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
                Financial Control Plane
              </div>
            </div>
          </div>

          <div className="inline-flex items-center gap-2 self-start border border-[#30372f] bg-[#0e110e] px-3 py-2 text-[8px] font-medium uppercase tracking-[0.16em] text-[#848b81] sm:self-auto">
            <span className="h-1.5 w-1.5 rounded-full bg-[#99aa7d]" />
            System operational
          </div>
        </div>
      </header>

      {/* Hero */}
      <section>
        <div className="max-w-4xl">
          <div className="mb-4 text-[8px] font-medium uppercase tracking-[0.24em] text-[#656c62]">
            Reconciliation / Control Plane
          </div>

          <h1 className="max-w-4xl text-[34px] font-semibold leading-[1.06] tracking-[-0.055em] text-[#efede5] sm:text-[42px]">
            Financial reconciliation
            <br />
            with a defensible decision trail.
          </h1>

          <p className="mt-6 max-w-2xl text-[12px] leading-6 text-[#7b8178]">
            Deterministic reconciliation establishes the financial truth.
            Grounded AI investigates exceptions. Authenticated humans control
            consequential decisions.
          </p>

          <div className="mt-8 flex flex-wrap gap-2.5">
            <Link
              href={dashboardHref}
              className="inline-flex h-10 items-center gap-2 bg-[#d9d6c7] px-5 text-[9px] font-semibold uppercase tracking-[0.15em] text-[#11130f] transition hover:bg-[#ece9da]"
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Open dashboard
            </Link>

            <Link
              href="/exceptions"
              className="inline-flex h-10 items-center gap-2 border border-[#363c34] bg-[#0e110e] px-5 text-[9px] font-semibold uppercase tracking-[0.15em] text-[#abaea5] transition hover:border-[#4a5341] hover:text-[#d3d2ca]"
            >
              Review exceptions
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-[8px] uppercase tracking-[0.16em] text-[#555c53]">
            <span>Deterministic engine</span>
            <span>·</span>
            <span>Grounded AI</span>
            <span>·</span>
            <span>Human approval</span>
            <span>·</span>
            <span>Full audit trail</span>
          </div>
        </div>
      </section>

      {/* Benchmark proof */}
      <section className="border border-[#2a2e29] bg-[#0d100d]">
        <div className="flex flex-col gap-2 border-b border-[#252a24] px-5 py-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-[8px] font-medium uppercase tracking-[0.2em] text-[#626960]">
              Reproducible evaluation
            </div>

            <div className="mt-1 text-[13px] font-semibold text-[#dddcd4]">
              Benchmark v1
            </div>
          </div>

          <div className="text-[8px] uppercase tracking-[0.14em] text-[#555c53]">
            Fixed seed · 20260821
          </div>
        </div>

        <div className="grid grid-cols-2 gap-px bg-[#252a24] lg:grid-cols-4">
          {BENCHMARK_STATS.map((stat) => (
            <div key={stat.label} className="bg-[#0a0d0a] p-5">
              <div className="text-[27px] font-semibold tracking-[-0.045em] text-[#e3e1d9]">
                {stat.value}
              </div>

              <div className="mt-1 text-[9px] font-medium uppercase tracking-[0.14em] text-[#8c9389]">
                {stat.label}
              </div>

              <div className="mt-1.5 text-[8px] leading-4 text-[#535a51]">
                {stat.detail}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2 border-t border-[#20241f] px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-[8px] text-[#575e54]">
            250 deterministic synthetic records
          </span>

          <span className="text-[8px] text-[#4d544c]">
            Benchmark results — not production customer statistics
          </span>
        </div>
      </section>

      {/* Decision path */}
      <section>
        <div className="mb-5">
          <div className="text-[8px] font-medium uppercase tracking-[0.2em] text-[#626960]">
            Decision path
          </div>

          <div className="mt-1 text-[14px] font-semibold text-[#dddcd4]">
            AI explains. Humans decide.
          </div>
        </div>

        <div className="grid gap-px overflow-hidden border border-[#2a2e29] bg-[#2a2e29] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {FLOW_STEPS.map((step) => (
            <div
              key={step.num}
              className={`group bg-[#0d100d] p-4 transition hover:bg-[#10140f] ${
                step.primary ? "bg-[#10150f]" : ""
              }`}
            >
              <div className="font-mono text-[8px] text-[#59624f]">
                {step.num}
              </div>

              <div
                className={`mt-3 text-[10px] font-medium leading-5 ${
                  step.primary ? "text-[#c3cfaa]" : "text-[#c7c6be]"
                }`}
              >
                {step.title}
              </div>

              <p className="mt-1.5 text-[8px] leading-5 text-[#656c63]">
                {step.desc}
              </p>

              <div
                className={`mt-4 h-px w-5 transition-all group-hover:w-10 ${
                  step.primary ? "bg-[#98aa7b]" : "bg-[#454c42]"
                }`}
              />
            </div>
          ))}
        </div>
      </section>

      {/* Capabilities */}
      <section>
        <div className="mb-5">
          <div className="text-[8px] font-medium uppercase tracking-[0.2em] text-[#626960]">
            Control capabilities
          </div>

          <div className="mt-1 text-[14px] font-semibold text-[#dddcd4]">
            Built for financial operations
          </div>
        </div>

        <div className="grid gap-px bg-[#252a24] md:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map((capability) => (
            <div
              key={capability.title}
              className="group bg-[#0d100d] p-5 transition hover:bg-[#10140f]"
            >
              <div className="font-mono text-[8px] text-[#50584e]">
                {capability.num}
              </div>

              <div className="mt-3 text-[11px] font-semibold text-[#d7d5cd]">
                {capability.title}
              </div>

              <p className="mt-2 text-[9px] leading-5 text-[#696f66]">
                {capability.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Trust */}
      <section className="border border-[#2a2e29] bg-[#0d100d]">
        <div className="grid lg:grid-cols-[1fr_1.35fr]">
          <div className="border-b border-[#252a24] bg-[#0a0d0a] p-6 lg:border-b-0 lg:border-r">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center border border-[#384231] bg-[#11150f]">
                <ShieldCheck className="h-4 w-4 text-[#9cac81]" />
              </div>

              <div>
                <div className="text-[8px] font-medium uppercase tracking-[0.18em] text-[#626960]">
                  Financial control
                </div>

                <h2 className="mt-1 text-[14px] font-semibold text-[#dcdad2]">
                  Designed for controlled decisions
                </h2>
              </div>
            </div>

            <p className="mt-4 text-[10px] leading-5 text-[#6d746a]">
              Consequential decisions are bounded by explicit rules,
              server-enforced identity, role-controlled workflow, and an
              append-only audit record.
            </p>

            <Link
              href="/security"
              className="mt-5 inline-flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-[0.14em] text-[#a4b18a] transition hover:text-[#c4ceb0]"
            >
              View security architecture
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="grid gap-x-8 gap-y-0 p-6 sm:grid-cols-2 md:p-7">
            {SECURITY_CONTROLS.map((control) => (
              <div
                key={control}
                className="flex items-start gap-2.5 border-b border-[#1f241f] py-3 first:pt-0 sm:nth-2:pt-0"
              >
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#8fa277]" />

                <span className="text-[9px] leading-5 text-[#979c93]">
                  {control}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Live state */}
      <section>
        <div className="mb-5">
          <div className="text-[8px] font-medium uppercase tracking-[0.2em] text-[#626960]">
            Current environment
          </div>

          <div className="mt-1 text-[14px] font-semibold text-[#dddcd4]">
            Live reconciliation state
          </div>
        </div>

        {checked && !batch ? (
          <div className="border border-dashed border-[#30362e] bg-[#0b0e0b] p-10 text-center">
            <Database className="mx-auto h-5 w-5 text-[#596158]" />

            <div className="mt-4 text-[12px] font-medium text-[#c7c6be]">
              No batch generated yet
            </div>

            <p className="mx-auto mt-1 max-w-sm text-[9px] leading-5 text-[#626960]">
              Generate deterministic demo data to populate the operational
              control plane.
            </p>

            <Link
              href="/demo"
              className="mt-5 inline-flex h-9 items-center gap-2 border border-[#414b38] bg-[#10150f] px-4 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#aebb91] transition hover:bg-[#151b11]"
            >
              <Database className="h-3.5 w-3.5" />
              Generate demo data
            </Link>
          </div>
        ) : (
          <div className="overflow-hidden border border-[#2a2e29] bg-[#2a2e29]">
            <div className="grid grid-cols-2 gap-px lg:grid-cols-4">
              <div className="bg-[#0d100d] p-5">
                <div className="text-[8px] font-medium uppercase tracking-[0.17em] text-[#626960]">
                  Latest batch
                </div>

                <div className="mt-3 truncate font-mono text-[10px] text-[#c6c5bd]">
                  {batch?.name ||
                    (batch?.id ? batch.id.slice(0, 18) : "—")}
                </div>

                <div className="mt-1 text-[8px] text-[#555c53]">
                  {batch?.size ?? "—"} records
                </div>
              </div>

              <div className="bg-[#0d100d] p-5">
                <div className="text-[8px] font-medium uppercase tracking-[0.17em] text-[#626960]">
                  Reconciliation status
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${meta.dot}`}
                  />

                  <span className={`text-[10px] font-medium ${meta.text}`}>
                    {statusLabel(batch?.status || "CREATED")}
                  </span>
                </div>

                <div className="mt-1 text-[8px] text-[#555c53]">
                  {batch?.accuracy != null
                    ? `${batch.accuracy}% accuracy`
                    : "Not yet measured"}
                </div>
              </div>

              <div className="bg-[#0d100d] p-5">
                <div className="text-[8px] font-medium uppercase tracking-[0.17em] text-[#626960]">
                  Exceptions
                </div>

                <div className="mt-3 text-[21px] font-semibold tracking-[-0.04em] text-[#dedcd4]">
                  {batch?.exceptionsFound ?? "—"}
                </div>

                <div className="mt-1 text-[8px] text-[#555c53]">
                  {batch?.unresolvedCount != null
                    ? `${batch.unresolvedCount} unresolved`
                    : "No unresolved count"}
                </div>
              </div>

              <div className="bg-[#0d100d] p-5">
                <div className="text-[8px] font-medium uppercase tracking-[0.17em] text-[#626960]">
                  Last activity
                </div>

                <div className="mt-3 text-[10px] font-medium text-[#c7c5bd]">
                  {fmtDateTime(
                    batch?.completedAt || batch?.createdAt,
                  )}
                </div>

                <div className="mt-1 text-[8px] text-[#555c53]">
                  batch timeline
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Closing CTA */}
      <section className="border-t border-[#20241f] pt-10">
        <div className="flex flex-col items-start gap-5 md:items-center md:text-center">
          <div>
            <div className="text-[8px] font-medium uppercase tracking-[0.2em] text-[#626960]">
              Next action
            </div>

            <h2 className="mt-2 text-[18px] font-semibold tracking-[-0.025em] text-[#e3e1d9]">
              Investigate the next discrepancy.
            </h2>

            <p className="mt-2 text-[10px] text-[#646b62]">
              Move from financial state to evidence-backed decision.
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <Link
              href={dashboardHref}
              className="inline-flex h-10 items-center gap-2 bg-[#d9d6c7] px-5 text-[9px] font-semibold uppercase tracking-[0.15em] text-[#11130f] transition hover:bg-[#ece9da]"
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Open dashboard
            </Link>

            <Link
              href="/exceptions"
              className="inline-flex h-10 items-center gap-2 border border-[#363c34] bg-[#0e110e] px-5 text-[9px] font-semibold uppercase tracking-[0.15em] text-[#abaea5] transition hover:border-[#4a5341] hover:text-[#d3d2ca]"
            >
              Review exceptions
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <div className="flex flex-col gap-3 border-t border-[#20241f] pt-4 text-[8px] uppercase tracking-[0.16em] text-[#4f554d] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Fingerprint className="h-3 w-3" />
          SettleMate AI / Financial Control
        </div>

        <div className="flex items-center gap-4">
          <span>Deterministic</span>
          <span>Grounded</span>
          <span>Human controlled</span>
          <span>Auditable</span>
        </div>
      </div>
    </div>
  );
}