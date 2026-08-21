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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const SECURITY_LAYERS = [
  {
    title: "Deterministic Financial Engine",
    description:
      "The core reconciliation engine uses business rules, UTR matching, and integer paise arithmetic. No AI. No randomness. No model nondeterminism. This is the financial source of truth.",
    icon: Database,
    color: "text-blue-400",
    status: "ACTIVE",
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
      "AI is only invoked for exceptions — never matched records. Every AI response passes through Zod schema validation, ID whitelists, and enum checks before touching any database.",
    icon: Brain,
    color: "text-purple-400",
    status: "ACTIVE",
    points: [
      "Anomaly agent: max 5 cases, 1 batched call",
      "Resolver agent: max 5 cases, 1 batched call",
      "HIGH-risk fixes cannot auto-apply",
      "Schema rejection falls back to deterministic template",
    ],
  },
  {
    title: "Structured Output Validation",
    description:
      "No unsafe TypeScript casts. Every AI response is parsed through Zod schemas. Invalid shapes, unknown enums, out-of-range values, and invented case IDs are rejected.",
    icon: FileText,
    color: "text-green-400",
    status: "ACTIVE",
    points: [
      "Confidence must be 0-100 (number or numeric string)",
      "Status must be from canonical enum",
      "Fix type must be from canonical enum",
      "Case ID must match queried exception IDs",
    ],
  },
  {
    title: "Prompt Injection Defense",
    description:
      "All source record text (bank narrations, refund reasons, chargeback descriptions, customer emails) is treated as untrusted data, not instructions.",
    icon: ShieldAlert,
    color: "text-red-400",
    status: "ACTIVE",
    points: [
      "System prompt explicitly states source text is data",
      "Model cannot follow instructions from source records",
      "Grounded Q&A rejects invented evidence",
      "Evidence paths validated against actual context",
    ],
  },
  {
    title: "Human-in-the-Loop Workflow",
    description:
      "AI recommends. Humans approve. The exception state machine enforces atomic transitions with compare-and-swap. AI cannot directly resolve any exception.",
    icon: GitCommit,
    color: "text-amber-400",
    status: "ACTIVE",
    points: [
      "OPEN → INVESTIGATING → PENDING_APPROVAL → RESOLVED",
      "Compare-and-swap prevents concurrent double-transition",
      "Full audit trail for every transition",
      "AI proposals are advisory only",
    ],
  },
  {
    title: "Adversarial Self-Testing",
    description:
      "The system tests itself against 10 adversarial scenarios in a sandboxed clone. Production rows are never mutated.",
    icon: ShieldCheck,
    color: "text-orange-400",
    status: "ACTIVE",
    points: [
      "Amount tampering (10x inflation) detected",
      "Phantom refunds detected",
      "Duplicate settlements detected",
      "Fee manipulation detected",
      "Subtle ₹0.47 rounding error intentionally missed",
    ],
  },
];

const BENCHMARK_PROOF = [
  {
    label: "Benchmark Version",
    value: "v1",
    icon: FileText,
  },
  {
    label: "Fixed Seed",
    value: "20260821",
    icon: Database,
  },
  {
    label: "Dataset Fingerprint",
    value: "81d840cd8cf981e5e69a367b879a8f11e9e51d60136a6d38e430877f08cab02b",
    icon: Shield,
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
    label: "Adversarial Detection",
    value: "90% (9/10)",
    icon: ShieldAlert,
  },
  {
    label: "Throughput",
    value: "~1035 rec/sec",
    icon: Zap,
  },
];

export default function SecurityPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Shield className="w-6 h-6 text-blue-400" />
          Security Architecture
        </h1>
        <p className="text-gray-400 text-sm mt-1">
          SettleMate AI is a deterministic financial control system with AI safely embedded
          behind structured validation gates.
        </p>
      </div>

      {/* Security Layers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SECURITY_LAYERS.map((layer) => {
          const Icon = layer.icon;
          return (
            <Card key={layer.title} className="bg-gray-900 border-gray-800">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-white text-sm">
                    <Icon className={`w-4 h-4 ${layer.color}`} />
                    {layer.title}
                  </span>
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                    {layer.status}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-gray-400 mb-3">{layer.description}</p>
                <ul className="space-y-1.5">
                  {layer.points.map((point, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-xs text-gray-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-400 mt-0.5 shrink-0" />
                      {point}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Benchmark Proof */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-green-400" />
            Reproducible Benchmark Proof
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {BENCHMARK_PROOF.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="bg-gray-950 rounded-lg p-4 border border-gray-800">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="w-3.5 h-3.5 text-blue-400" />
                    <p className="text-xs text-gray-500">{item.label}</p>
                  </div>
                  <p className={`text-sm font-bold text-white ${item.mono ? "font-mono text-xs" : ""}`}>
                    {item.value}
                  </p>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-gray-500 mt-4">
            Run <code className="text-blue-400">npm run evaluate</code> to verify. Same seed →
            same dataset fingerprint → same metrics. Fully reproducible.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}