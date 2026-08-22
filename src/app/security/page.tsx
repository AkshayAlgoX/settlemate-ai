"use client";

import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Brain,
  GitCommit,
  Database,
  CheckCircle2,
  FileText,
  Zap,
  LockKeyhole,
  Fingerprint,
} from "lucide-react";

const SECURITY_LAYERS = [
  {
    title: "Deterministic Financial Engine",
    description:
      "The core reconciliation engine uses business rules, UTR matching, and integer-paise arithmetic. No AI, randomness, or model nondeterminism enters the financial source of truth.",
    icon: Database,
    points: [
      "Exact amount matching in integer paise",
      "T+2 settlement window rules",
      "UTR-based bank credit matching",
      "Fee + GST calculation with integer math",
    ],
  },
  {
    title: "AI Safety Gate",
    description:
      "AI is invoked only for exception investigation. Every response passes through structured validation before it can influence the application.",
    icon: Brain,
    points: [
      "Anomaly agent: max 5 cases per batched call",
      "Resolver agent: max 5 cases per batched call",
      "HIGH-risk fixes cannot auto-apply",
      "Schema rejection falls back to a deterministic template",
    ],
  },
  {
    title: "Structured Output Validation",
    description:
      "AI output is treated as untrusted input. Canonical schemas reject malformed shapes, invalid enums, out-of-range confidence, and unknown case IDs.",
    icon: FileText,
    points: [
      "Confidence constrained to 0–100",
      "Status constrained to canonical enums",
      "Fix type constrained to canonical enums",
      "Case IDs must belong to the queried exceptions",
    ],
  },
  {
    title: "Prompt Injection Defense",
    description:
      "Bank narrations, refund reasons, chargeback descriptions, and other source text are treated strictly as data rather than executable instructions.",
    icon: ShieldAlert,
    points: [
      "Source text explicitly quarantined as untrusted data",
      "Model instructed never to follow record-level instructions",
      "Grounded Q&A rejects invented evidence",
      "Evidence paths validated against actual context",
    ],
  },
  {
    title: "Authentication & Authorization",
    description:
      "Every protected page and API route sits behind the verified session boundary. Identity and role are derived server-side rather than trusted from request payloads.",
    icon: ShieldCheck,
    points: [
      "Unauthenticated pages redirect to /login",
      "Protected APIs return 401 without a valid session",
      "Only ADMIN can approve or reject",
      "REVIEWER can investigate and escalate",
      "Audit records the verified session identity",
    ],
  },
  {
    title: "Human-in-the-Loop Workflow",
    description:
      "AI recommends. Humans approve. The exception state machine enforces atomic transitions and prevents AI or concurrent requests from bypassing the intended approval path.",
    icon: GitCommit,
    points: [
      "OPEN → INVESTIGATING → PENDING APPROVAL → RESOLVED",
      "Compare-and-swap prevents concurrent double transitions",
      "Every successful transition is audited",
      "AI proposals remain advisory only",
    ],
  },
  {
    title: "Adversarial Self-Testing",
    description:
      "The system executes adversarial scenarios against a sandboxed clone so production reconciliation records remain isolated from testing.",
    icon: ShieldCheck,
    points: [
      "Amount tampering detection",
      "Phantom refund detection",
      "Duplicate settlement detection",
      "Fee manipulation detection",
      "Sub-₹1 rounding variance deliberately remains below materiality tolerance",
    ],
  },
];

const BENCHMARK_PROOF = [
  {
    label: "Benchmark version",
    value: "v1",
    icon: FileText,
  },
  {
    label: "Fixed seed",
    value: "20260821",
    icon: Database,
  },
  {
    label: "Dataset fingerprint",
    value:
      "81d840cd8cf981e5e69a367b879a8f11e9e51d60136a6d38e430877f08cab02b",
    icon: Fingerprint,
    mono: true,
  },
  {
    label: "Accuracy",
    value: "98.1%",
    icon: CheckCircle2,
  },
  {
    label: "Precision",
    value: "98%",
    icon: CheckCircle2,
  },
  {
    label: "Recall",
    value: "98%",
    icon: CheckCircle2,
  },
  {
    label: "Adversarial detection",
    value: "90% · 9/10",
    icon: ShieldAlert,
  },
  {
    label: "Throughput",
    value: "~1,000 rec/sec",
    icon: Zap,
  },
];

function SectionHeader({
  eyebrow,
  title,
  icon: Icon,
  right,
}: {
  eyebrow: string;
  title: string;
  icon: typeof Shield;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-[#252a24] px-5 py-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-[#9da783]" />

          <span className="text-[8px] font-medium uppercase tracking-[0.2em] text-[#626960]">
            {eyebrow}
          </span>
        </div>

        <h2 className="mt-1 text-[14px] font-semibold tracking-[-0.015em] text-[#dfddd5]">
          {title}
        </h2>
      </div>

      {right}
    </div>
  );
}

function SecurityCard({
  layer,
  index,
}: {
  layer: (typeof SECURITY_LAYERS)[number];
  index: number;
}) {
  const Icon = layer.icon;

  return (
    <article className="group border border-[#2a2e29] bg-[#0d100d] transition-colors hover:border-[#3e4736]">
      <div className="border-b border-[#232821] px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center border border-[#384032] bg-[#11150f]">
              <Icon className="h-4 w-4 text-[#a1ac86]" strokeWidth={1.7} />
            </div>

            <div>
              <div className="mb-1 text-[8px] font-mono text-[#4e554b]">
                {String(index + 1).padStart(2, "0")}
              </div>

              <h3 className="text-[12px] font-semibold leading-5 text-[#d8d6ce]">
                {layer.title}
              </h3>
            </div>
          </div>

          <span className="inline-flex shrink-0 items-center gap-1.5 border border-[#394833] bg-[#10150f] px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.15em] text-[#9faf83]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#94a779]" />
            Active
          </span>
        </div>
      </div>

      <div className="p-5">
        <p className="text-[10px] leading-5 text-[#7d837a]">
          {layer.description}
        </p>

        <div className="mt-5 space-y-2.5">
          {layer.points.map((point) => (
            <div
              key={point}
              className="flex items-start gap-2.5"
            >
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#8fa178]" />

              <span className="text-[9px] leading-5 text-[#9a9e96]">
                {point}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="h-px w-0 bg-[#94a578] transition-all duration-300 group-hover:w-full" />
    </article>
  );
}

export default function SecurityPage() {
  return (
    <div className="space-y-7 pb-8">
      {/* Header */}
      <header className="border-b border-[#20241f] pb-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center border border-[#394232] bg-[#10140f]">
                <Shield className="h-3.5 w-3.5 text-[#a3ae88]" />
              </div>

              <span className="text-[8px] font-medium uppercase tracking-[0.22em] text-[#626960]">
                Governance / Self-Test
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[28px] font-semibold tracking-[-0.045em] text-[#eeece4]">
                Security architecture
              </h1>

              <span className="inline-flex items-center gap-1.5 border border-[#394833] bg-[#10150f] px-2.5 py-1 text-[8px] font-medium uppercase tracking-[0.14em] text-[#9faf83]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#94a779]" />
                Controls active
              </span>
            </div>

            <p className="mt-2 max-w-3xl text-[11px] leading-5 text-[#747a71]">
              SettleMate separates deterministic financial truth from
              controlled AI assistance, with authentication, human approval,
              evidence validation, and adversarial testing around the boundary.
            </p>
          </div>

          <div className="border border-[#30352f] bg-[#0e110e] px-4 py-3">
            <div className="flex items-center gap-2">
              <LockKeyhole className="h-3.5 w-3.5 text-[#858f74]" />

              <span className="text-[8px] font-medium uppercase tracking-[0.16em] text-[#6a7167]">
                Control posture
              </span>
            </div>

            <div className="mt-2 text-[11px] text-[#c7c6bd]">
              Deterministic source of truth
            </div>

            <div className="mt-1 text-[8px] uppercase tracking-[0.13em] text-[#575e54]">
              AI remains bounded
            </div>
          </div>
        </div>
      </header>

      {/* Overview strip */}
      <section className="grid gap-px overflow-hidden border border-[#2a2e29] bg-[#2a2e29] md:grid-cols-3">
        <div className="bg-[#0d100d] p-4">
          <div className="flex items-center gap-2">
            <Database className="h-3.5 w-3.5 text-[#9ba681]" />

            <span className="text-[8px] uppercase tracking-[0.18em] text-[#666d63]">
              Financial truth
            </span>
          </div>

          <div className="mt-2 text-[11px] text-[#c9c8bf]">
            Deterministic before AI
          </div>

          <div className="mt-1 text-[9px] text-[#5f655c]">
            Reconciliation never delegates financial truth to a model.
          </div>
        </div>

        <div className="bg-[#0d100d] p-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-[#9ba681]" />

            <span className="text-[8px] uppercase tracking-[0.18em] text-[#666d63]">
              Human control
            </span>
          </div>

          <div className="mt-2 text-[11px] text-[#c9c8bf]">
            Approval remains explicit
          </div>

          <div className="mt-1 text-[9px] text-[#5f655c]">
            AI cannot directly resolve or reject an exception.
          </div>
        </div>

        <div className="bg-[#0d100d] p-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-3.5 w-3.5 text-[#a79872]" />

            <span className="text-[8px] uppercase tracking-[0.18em] text-[#666d63]">
              Adversarial posture
            </span>
          </div>

          <div className="mt-2 text-[11px] text-[#c9c8bf]">
            Self-tested against injected faults
          </div>

          <div className="mt-1 text-[9px] text-[#5f655c]">
            Sandbox testing keeps production reconciliation isolated.
          </div>
        </div>
      </section>

      {/* Security layers */}
      <section>
        <SectionHeader
          eyebrow="Control layers"
          title="Security architecture"
          icon={ShieldCheck}
          right={
            <span className="text-[8px] uppercase tracking-[0.14em] text-[#575e54]">
              {SECURITY_LAYERS.length} active controls
            </span>
          }
        />

        <div className="mt-3 grid grid-cols-1 gap-px bg-[#252a24] md:grid-cols-2">
          {SECURITY_LAYERS.map((layer, index) => (
            <SecurityCard
              key={layer.title}
              layer={layer}
              index={index}
            />
          ))}
        </div>
      </section>

      {/* Benchmark proof */}
      <section className="border border-[#2a2e29] bg-[#0d100d]">
        <SectionHeader
          eyebrow="Reproducibility"
          title="Benchmark proof"
          icon={Fingerprint}
          right={
            <span className="inline-flex items-center gap-1.5 border border-[#394833] bg-[#10150f] px-2.5 py-1 text-[8px] uppercase tracking-[0.13em] text-[#9faf83]">
              <CheckCircle2 className="h-3 w-3" />
              Verified baseline
            </span>
          }
        />

        <div className="grid grid-cols-2 gap-px bg-[#252a24] md:grid-cols-4">
          {BENCHMARK_PROOF.map((item) => {
            const Icon = item.icon;

            return (
              <div
                key={item.label}
                className="bg-[#0a0d0a] p-4"
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-3.5 w-3.5 text-[#909b78]" />

                  <span className="text-[8px] uppercase tracking-[0.16em] text-[#626960]">
                    {item.label}
                  </span>
                </div>

                <div
                  className={`mt-3 break-all text-[15px] font-semibold tracking-[-0.02em] text-[#dddcd4] ${
                    item.mono
                      ? "font-mono text-[8px] leading-5 font-normal text-[#8b9188]"
                      : ""
                  }`}
                >
                  {item.value}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col gap-3 border-t border-[#252a24] px-5 py-4 md:flex-row md:items-center md:justify-between">
          <p className="max-w-3xl text-[9px] leading-5 text-[#646b62]">
            The benchmark is deterministic: same benchmark version + same seed
            produces the same dataset fingerprint and evaluation workload.
          </p>

          <code className="shrink-0 border border-[#30352f] bg-[#0a0d0a] px-3 py-2 font-mono text-[8px] text-[#9aa47f]">
            npm run evaluate
          </code>
        </div>
      </section>

      {/* Control philosophy */}
      <section className="border border-[#2a2e29] bg-[#0d100d]">
        <div className="grid gap-px bg-[#252a24] md:grid-cols-3">
          <div className="bg-[#0a0d0a] p-5">
            <div className="text-[8px] uppercase tracking-[0.18em] text-[#626960]">
              01 / Decide
            </div>

            <div className="mt-3 text-[12px] font-semibold text-[#d8d6ce]">
              Deterministic engine
            </div>

            <p className="mt-2 text-[9px] leading-5 text-[#686f65]">
              Matching, arithmetic, classification and materiality remain
              rule-driven.
            </p>
          </div>

          <div className="bg-[#0a0d0a] p-5">
            <div className="text-[8px] uppercase tracking-[0.18em] text-[#626960]">
              02 / Explain
            </div>

            <div className="mt-3 text-[12px] font-semibold text-[#d8d6ce]">
              Grounded AI
            </div>

            <p className="mt-2 text-[9px] leading-5 text-[#686f65]">
              Models investigate verified context and produce advisory
              explanations.
            </p>
          </div>

          <div className="bg-[#0a0d0a] p-5">
            <div className="text-[8px] uppercase tracking-[0.18em] text-[#626960]">
              03 / Approve
            </div>

            <div className="mt-3 text-[12px] font-semibold text-[#d8d6ce]">
              Human control
            </div>

            <p className="mt-2 text-[9px] leading-5 text-[#686f65]">
              Final financial decisions pass through authenticated,
              role-controlled workflow.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <div className="flex flex-col gap-3 border-t border-[#20241f] pt-4 text-[8px] uppercase tracking-[0.16em] text-[#4f554d] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-3 w-3" />
          SettleMate security control plane
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