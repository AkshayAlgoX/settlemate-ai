"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Brain,
  Check,
  CheckCircle2,
  Database,
  Loader2,
  Play,
  ShieldCheck,
  Sparkles,
  XCircle,
  Zap,
} from "lucide-react";

const SIZES = [50, 100, 250, 500];

const DISTRIBUTION = [
  { label: "Perfect Match", pct: 35 },
  { label: "Pending Settlement", pct: 10 },
  { label: "Missing Bank Credit", pct: 8 },
  { label: "Amount Mismatch", pct: 8 },
  { label: "Duplicate Settlement", pct: 5 },
  { label: "Orphan Bank Credit", pct: 5 },
  { label: "Refund Mismatch", pct: 7 },
  { label: "Chargeback Adj.", pct: 5 },
  { label: "Delayed Credit", pct: 7 },
  { label: "Manual Review", pct: 10 },
];

type StepStatus = "pending" | "running" | "done" | "error" | "skipped";

interface ProgressStep {
  label: string;
  status: StepStatus;
  detail: string;
}

interface MultiPassPass {
  passNumber: number;
  name: string;
  accuracy: number;
  aiCallsMade: number;
  durationMs: number;
}

interface MultiPassResponse {
  success: boolean;
  passes: MultiPassPass[];
  adversarial: {
    detected: number;
    totalTests: number;
    detectionRate: number;
  };
  aiStatus: {
    totalCalls: number;
    maxCalls: number;
    circuitTripped: boolean;
  };
  totalDurationMs: number;
  error?: string;
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "done") {
    return (
      <div className="flex h-7 w-7 items-center justify-center border border-[#3e4d36] bg-[#11160f]">
        <Check className="h-3.5 w-3.5 text-[#a4b58a]" />
      </div>
    );
  }

  if (status === "running") {
    return (
      <div className="flex h-7 w-7 items-center justify-center border border-[#566042] bg-[#14180f]">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-[#b4c18f]" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex h-7 w-7 items-center justify-center border border-[#533936] bg-[#160f0d]">
        <XCircle className="h-3.5 w-3.5 text-[#c07e73]" />
      </div>
    );
  }

  return (
    <div className="flex h-7 w-7 items-center justify-center border border-[#30362f] bg-[#0d100d]">
      <span className="h-1.5 w-1.5 rounded-full bg-[#555c53]" />
    </div>
  );
}

export default function DemoPage() {
  const router = useRouter();

  const [size, setSize] = useState(250);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    batchId: string;
    stats: Record<string, number>;
  } | null>(null);
  const [steps, setSteps] = useState<ProgressStep[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setSteps([]);

    try {
      const response = await fetch("/api/batches/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ size }),
      });

      const data = await response.json();

      if (!response.ok || !data?.batchId) {
        throw new Error(data?.error || "Demo batch generation failed.");
      }

      setResult(data);
    } catch (requestError) {
      console.error("Generation failed:", requestError);
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Demo batch generation failed.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleReconcile = async () => {
    if (!result?.batchId) return;

    setLoading(true);
    setError(null);

    setSteps([
      {
        label: "Pass 1 · Deterministic Rules",
        status: "running",
        detail: "UTR + ID + amount matching...",
      },
      {
        label: "Pass 2 · Anomaly Agent",
        status: "pending",
        detail: "",
      },
      {
        label: "Pass 3 · Resolver Agent",
        status: "pending",
        detail: "",
      },
      {
        label: "Adversarial Self-Test",
        status: "pending",
        detail: "",
      },
      {
        label: "Calibration & Metrics",
        status: "pending",
        detail: "",
      },
    ]);

    try {
      const response = await fetch(
        `/api/reconcile/${result.batchId}/multi-pass`,
        {
          method: "POST",
        },
      );

      const data: MultiPassResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Reconciliation failed.");
      }

      const newSteps: ProgressStep[] = data.passes.map((pass) => ({
        label: `Pass ${pass.passNumber} · ${pass.name}`,
        status: "done",
        detail: `${pass.accuracy}% accuracy · ${pass.aiCallsMade} AI calls · ${pass.durationMs}ms`,
      }));

      newSteps.push({
        label: "Adversarial Self-Test",
        status: "done",
        detail: `${data.adversarial.detected}/${data.adversarial.totalTests} detected · ${data.adversarial.detectionRate}%`,
      });

      newSteps.push({
        label: "Calibration & Metrics",
        status: "done",
        detail: `Completed in ${data.totalDurationMs}ms · AI ${data.aiStatus.totalCalls}/${data.aiStatus.maxCalls}${
          data.aiStatus.circuitTripped ? " · circuit tripped" : ""
        }`,
      });

      setSteps(newSteps);

      window.setTimeout(() => {
        router.push(`/dashboard?batchId=${result.batchId}`);
      }, 1800);
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Reconciliation failed.";

      setError(message);

      setSteps((previous) =>
        previous.map((step) =>
          step.status === "running" || step.status === "pending"
            ? {
                ...step,
                status: "error",
                detail: message,
              }
            : step,
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  const pipelineComplete =
    steps.length > 0 && steps.every((step) => step.status === "done");

  return (
    <div className="space-y-7 pb-8">
      {/* Header */}
      <header className="border-b border-[#20241f] pb-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center border border-[#343a31] bg-[#10130f]">
                <Database className="h-3.5 w-3.5 text-[#9fab84]" />
              </div>

              <span className="text-[8px] font-medium uppercase tracking-[0.22em] text-[#626960]">
                Sandbox / Demo Data
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[28px] font-semibold tracking-[-0.045em] text-[#eeece4]">
                Generate demo data
              </h1>

              <span className="inline-flex items-center gap-1.5 border border-[#3b4935] bg-[#10150f] px-2.5 py-1 text-[8px] font-medium uppercase tracking-[0.14em] text-[#a8b58d]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#96a879]" />
                Sandboxed
              </span>
            </div>

            <p className="mt-2 max-w-2xl text-[11px] leading-5 text-[#747a71]">
              Create deterministic Razorpay-like financial records across ten
              controlled exception scenarios, then run the complete
              reconciliation pipeline.
            </p>
          </div>

          <div className="flex items-center gap-2 border border-[#30352f] bg-[#0e110e] px-3 py-2">
            <ShieldCheck className="h-3.5 w-3.5 text-[#899775]" />

            <div>
              <div className="text-[7px] font-medium uppercase tracking-[0.17em] text-[#626960]">
                Environment
              </div>

              <div className="mt-1 text-[9px] uppercase tracking-[0.12em] text-[#a1a59d]">
                Synthetic / isolated
              </div>
            </div>
          </div>
        </div>
      </header>

      {error ? (
        <div className="flex items-start gap-3 border border-[#553833] bg-[#160f0d] px-4 py-3">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#bf7d72]" />

          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#c17e73]">
              Operation failed
            </div>

            <div className="mt-1 text-[10px] leading-5 text-[#98716b]">
              {error}
            </div>
          </div>
        </div>
      ) : null}

      {/* Configuration */}
      <section className="border border-[#2a2e29] bg-[#0d100d]">
        <div className="border-b border-[#252a24] px-5 py-4">
          <div className="flex items-center gap-2">
            <Database className="h-3.5 w-3.5 text-[#98a47f]" />

            <div>
              <div className="text-[8px] font-medium uppercase tracking-[0.2em] text-[#626960]">
                Dataset configuration
              </div>

              <div className="mt-1 text-[13px] font-semibold text-[#dddcd4]">
                Controlled financial scenarios
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-px bg-[#252a24] xl:grid-cols-[280px_1fr]">
          {/* Size */}
          <div className="bg-[#0a0d0a] p-5">
            <div className="text-[8px] font-medium uppercase tracking-[0.18em] text-[#626960]">
              Batch size
            </div>

            <div className="mt-2 text-[11px] text-[#bfc0b8]">
              Select records to generate
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              {SIZES.map((value) => {
                const selected = size === value;

                return (
                  <button
                    key={value}
                    type="button"
                    disabled={loading}
                    onClick={() => setSize(value)}
                    className={`relative h-11 border text-[10px] font-semibold uppercase tracking-[0.12em] transition ${
                      selected
                        ? "border-[#657151] bg-[#151b11] text-[#c5d0aa]"
                        : "border-[#30352f] bg-[#0e110e] text-[#777d74] hover:border-[#4b5442] hover:text-[#b3b6ad]"
                    }`}
                  >
                    {selected ? (
                      <span className="absolute left-0 top-0 h-full w-px bg-[#a6b589]" />
                    ) : null}

                    {value} records
                  </button>
                );
              })}
            </div>

            <div className="mt-5 border-t border-[#20241f] pt-4">
              <div className="flex items-center justify-between">
                <span className="text-[8px] uppercase tracking-[0.14em] text-[#5c635a]">
                  Selected
                </span>

                <span className="font-mono text-[12px] text-[#b5bd9e]">
                  {size}
                </span>
              </div>

              <div className="mt-1 text-[8px] text-[#4f554d]">
                deterministic scenario generation
              </div>
            </div>
          </div>

          {/* Distribution */}
          <div className="bg-[#0a0d0a] p-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="text-[8px] font-medium uppercase tracking-[0.18em] text-[#626960]">
                  Scenario distribution
                </div>

                <div className="mt-1 text-[10px] text-[#757b72]">
                  Ten financial conditions across the generated batch.
                </div>
              </div>

              <span className="font-mono text-[9px] text-[#535a51]">
                100%
              </span>
            </div>

            <div className="mt-5 space-y-3">
              {DISTRIBUTION.map((item, index) => {
                const count = Math.round((size * item.pct) / 100);

                return (
                  <div key={item.label}>
                    <div className="mb-1.5 flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="font-mono text-[7px] text-[#4e554c]">
                          {String(index + 1).padStart(2, "0")}
                        </span>

                        <span className="truncate text-[9px] text-[#8f948b]">
                          {item.label}
                        </span>
                      </div>

                      <span className="shrink-0 font-mono text-[8px] text-[#686f65]">
                        {item.pct}% · {count}
                      </span>
                    </div>

                    <div className="h-1 bg-[#222720]">
                      <div
                        className="h-full bg-[#88966f] transition-all"
                        style={{ width: `${item.pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="border-t border-[#252a24] p-5">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading}
            className="group flex h-11 w-full items-center justify-center gap-2 border border-[#596648] bg-[#151b11] text-[9px] font-semibold uppercase tracking-[0.15em] text-[#c1cd9f] transition hover:bg-[#1a2115] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Generating dataset
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                Generate {size} records
              </>
            )}
          </button>
        </div>
      </section>

      {/* Generated result */}
      {result ? (
        <section className="border border-[#394833] bg-[#0d100d]">
          <div className="flex flex-col gap-4 border-b border-[#2b3328] px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-[#9faf83]" />

                <span className="text-[8px] font-medium uppercase tracking-[0.19em] text-[#68725f]">
                  Batch generated
                </span>
              </div>

              <div className="mt-2 font-mono text-[10px] text-[#aeb39f]">
                {result.batchId}
              </div>
            </div>

            <span className="inline-flex items-center gap-1.5 border border-[#394833] bg-[#10150f] px-2.5 py-1.5 text-[8px] uppercase tracking-[0.13em] text-[#9faf83]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#94a779]" />
              Ready for reconciliation
            </span>
          </div>

          <div className="grid grid-cols-2 gap-px bg-[#252a24] md:grid-cols-4">
            {Object.entries(result.stats).map(([key, value]) => (
              <div key={key} className="bg-[#0a0d0a] p-4">
                <div className="text-[8px] uppercase tracking-[0.16em] text-[#626960]">
                  {key.replace(/([A-Z])/g, " $1")}
                </div>

                <div className="mt-2 text-[20px] font-semibold tracking-[-0.035em] text-[#dddcd4]">
                  {value}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-[#252a24] p-5">
            <button
              type="button"
              onClick={handleReconcile}
              disabled={loading}
              className="group flex h-11 w-full items-center justify-center gap-2 bg-[#d9d6c7] text-[9px] font-semibold uppercase tracking-[0.15em] text-[#11130f] transition hover:bg-[#ece9da] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Running reconciliation pipeline
                </>
              ) : (
                <>
                  <Zap className="h-3.5 w-3.5 transition-transform group-hover:scale-110" />
                  Run 3-pass reconciliation
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </div>
        </section>
      ) : null}

      {/* Progress */}
      {steps.length > 0 ? (
        <section className="border border-[#2a2e29] bg-[#0d100d]">
          <div className="flex items-center justify-between border-b border-[#252a24] px-5 py-4">
            <div className="flex items-center gap-2">
              <Brain className="h-3.5 w-3.5 text-[#9c9f80]" />

              <div>
                <div className="text-[8px] font-medium uppercase tracking-[0.2em] text-[#626960]">
                  Execution
                </div>

                <div className="mt-1 text-[13px] font-semibold text-[#dddcd4]">
                  Reconciliation pipeline
                </div>
              </div>
            </div>

            <span className="text-[8px] uppercase tracking-[0.14em] text-[#555c53]">
              {steps.filter((step) => step.status === "done").length}/
              {steps.length} complete
            </span>
          </div>

          <div className="p-5">
            <div className="space-y-0">
              {steps.map((step, index) => (
                <div
                  key={`${step.label}-${index}`}
                  className="relative flex gap-4"
                >
                  {index < steps.length - 1 ? (
                    <span
                      className={`absolute left-[13px] top-7 h-[calc(100%-7px)] w-px ${
                        step.status === "done"
                          ? "bg-[#4c5a40]"
                          : "bg-[#292f28]"
                      }`}
                    />
                  ) : null}

                  <div className="relative z-10 shrink-0">
                    <StepIcon status={step.status} />
                  </div>

                  <div className="min-w-0 flex-1 pb-6">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span
                        className={`text-[10px] font-semibold ${
                          step.status === "done"
                            ? "text-[#aebc95]"
                            : step.status === "running"
                              ? "text-[#c1c998]"
                              : step.status === "error"
                                ? "text-[#c07f73]"
                                : "text-[#71776e]"
                        }`}
                      >
                        {step.label}
                      </span>

                      {step.status === "done" ? (
                        <span className="text-[7px] uppercase tracking-[0.14em] text-[#64705c]">
                          Complete
                        </span>
                      ) : null}
                    </div>

                    {step.detail ? (
                      <p className="mt-1 text-[9px] leading-5 text-[#61685f]">
                        {step.detail}
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            {pipelineComplete ? (
              <div className="mt-1 flex items-center justify-between gap-4 border border-[#394833] bg-[#10150f] px-4 py-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#9faf83]" />

                  <span className="text-[9px] font-medium uppercase tracking-[0.14em] text-[#a7b58c]">
                    Pipeline complete
                  </span>
                </div>

                <span className="text-[8px] uppercase tracking-[0.12em] text-[#626960]">
                  Opening dashboard
                </span>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* Footer */}
      <div className="flex flex-col gap-3 border-t border-[#20241f] pt-4 text-[8px] uppercase tracking-[0.16em] text-[#4f554d] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3 w-3" />
          Synthetic data only
        </div>

        <div className="flex items-center gap-4">
          <span>Deterministic</span>
          <span>Sandboxed</span>
          <span>Reproducible</span>
        </div>
      </div>
    </div>
  );
}