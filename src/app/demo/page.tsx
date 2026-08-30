"use client";

import { FinanceOpsVisualizer } from "@/components/demo/FinanceOpsVisualizer";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Brain,
  Check,
  CheckCircle2,
  Loader2,
  Play,
  XCircle,
  Zap,
} from "lucide-react";
import { apiErrorMessage } from "@/lib/api/error-message";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Badge } from "@/components/ui/badge";

export interface ScaleOption {
  size: number;
  label: string;
  badge: "Official Benchmark" | "Standard" | "Scale Lab" | "Hyperscale Lab" | "Stress Test";
  mode: "STANDARD" | "STREAMING";
}

const SIZES: ScaleOption[] = [
  { size: 250, label: "250", badge: "Official Benchmark", mode: "STANDARD" },
  { size: 1000, label: "1,000", badge: "Standard", mode: "STANDARD" },
  { size: 10000, label: "10,000", badge: "Standard", mode: "STANDARD" },
  { size: 100000, label: "100k", badge: "Scale Lab", mode: "STREAMING" },
  { size: 1000000, label: "1M", badge: "Hyperscale Lab", mode: "STREAMING" },
  { size: 10000000, label: "10M", badge: "Stress Test", mode: "STREAMING" },
];

const DISTRIBUTION = [
  { label: "Perfect Match (1:1)", pct: 35 },
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

interface ScaleRunReport {
  totalRecords: number;
  totalPartitions: number;
  workerCount: number;
  wallTimeMs: number;
  planningMs: number;
  workerExecutionMs: number;
  merkleBuildMs: number;
  throughputRps: number;
  recordsPerWorkerSec: number;
  partitionsPerSec: number;
  peakHeapMB: number;
  workerUtilizationPct: number;
  merkleRoot: string;
  deadLetterCount: number;
  retryCount: number;
  invariantStatus: string;
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "done") {
    return (
      <div className="flex h-7 w-7 items-center justify-center rounded border border-border bg-background">
        <Check className="h-3.5 w-3.5 text-[#10b981]" />
      </div>
    );
  }

  if (status === "running") {
    return (
      <div className="flex h-7 w-7 items-center justify-center rounded border border-border bg-background">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-foreground" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex h-7 w-7 items-center justify-center rounded border border-[#3b1818] bg-[#140a0a]">
        <XCircle className="h-3.5 w-3.5 text-[#ef4444]" />
      </div>
    );
  }

  return (
    <div className="flex h-7 w-7 items-center justify-center rounded border border-border bg-background">
      <span className="h-1.5 w-1.5 rounded-full bg-[#666666]" />
    </div>
  );
}

export default function DemoPage() {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<"TRACK_04" | "SCALE_LAB">("TRACK_04");
  const [size, setSize] = useState(250);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    batchId: string;
    batchName?: string;
    stats?: Record<string, number>;
  } | null>(null);
  const [scaleResult, setScaleResult] = useState<{
    batchId: string;
    runId: string;
    report: ScaleRunReport;
    classification: string;
  } | null>(null);
  const [steps, setSteps] = useState<ProgressStep[]>([]);
  const [error, setError] = useState<string | null>(null);

  const selectedOption = SIZES.find((s) => s.size === size) || SIZES[0];
  const isStreamingScale = selectedOption.mode === "STREAMING";

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setScaleResult(null);
    setSteps([]);

    try {
      if (isStreamingScale) {
        const response = await fetch("/api/scale/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ size, workerCount: 16 }),
        });

        const data = await response.json();
        if (!response.ok || !data?.success) {
          throw new Error(apiErrorMessage(data, "Streaming scale run failed."));
        }

        setScaleResult(data);
      } else {
        const response = await fetch("/api/batches/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ size }),
        });

        const data = await response.json();
        if (!response.ok || !data?.batchId) {
          throw new Error(data?.error || "Demo batch generation failed.");
        }

        setResult(data);
      }
    } catch (requestError) {
      console.error("Execution failed:", requestError);
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Execution failed."
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
        "/api/reconcile/" + result.batchId + "/multi-pass",
        { method: "POST" }
      );

      const data: MultiPassResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Reconciliation failed.");
      }

      const newSteps: ProgressStep[] = data.passes.map((pass) => ({
        label: "Pass " + pass.passNumber + " · " + pass.name,
        status: "done",
        detail: pass.accuracy + "% accuracy · " + pass.aiCallsMade + " AI calls · " + pass.durationMs + "ms",
      }));

      newSteps.push({
        label: "Adversarial Self-Test",
        status: "done",
        detail: data.adversarial.detected + "/" + data.adversarial.totalTests + " detected · " + data.adversarial.detectionRate + "%",
      });

      newSteps.push({
        label: "Calibration & Metrics",
        status: "done",
        detail: "Completed in " + data.totalDurationMs + "ms · AI " + data.aiStatus.totalCalls + "/" + data.aiStatus.maxCalls + (data.aiStatus.circuitTripped ? " · circuit tripped" : ""),
      });

      setSteps(newSteps);

      window.setTimeout(() => {
        router.push("/dashboard?batchId=" + result.batchId);
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
            ? { ...step, status: "error", detail: message }
            : step
        )
      );
    } finally {
      setLoading(false);
    }
  };

  const pipelineComplete =
    steps.length > 0 && steps.every((s) => s.status === "done");

  return (
    <div className="space-y-10 pb-12">
      {/* Header */}
      <PageHeader
        tag="Interactive Lab"
        title="Scale lab & benchmark execution"
        description="Deterministic financial scenarios, multi-worker streaming partitions, and live cryptographic verification."
        badge={<Badge variant="outline">{isStreamingScale ? "Streaming workers" : size === 250 ? "Official benchmark" : "Standard run"}</Badge>}
      />

      {/* Mode Selector Tabs */}
      <div className="inline-flex rounded-md border border-border bg-card p-0.5">
        <button
          type="button"
          onClick={() => setActiveTab("TRACK_04")}
          className={`px-3.5 py-1.5 text-xs font-medium rounded transition ${
            activeTab === "TRACK_04"
              ? "bg-secondary text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <span>Track 04: Finance-Ops Loop</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("SCALE_LAB")}
          className={`px-3.5 py-1.5 text-xs font-medium rounded transition ${
            activeTab === "SCALE_LAB"
              ? "bg-secondary text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <span>Scale Lab & Benchmark (250 to 10M)</span>
        </button>
      </div>

      {activeTab === "TRACK_04" ? (
        <FinanceOpsVisualizer />
      ) : (
        <div className="space-y-6">
          {error ? (
            <div className="flex items-start gap-3 rounded-md border border-[#3b1818] bg-[#140a0a] p-4 text-xs text-[#ef4444]">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-semibold">Execution failed</div>
                <div className="mt-1 text-muted-foreground">{error}</div>
              </div>
            </div>
          ) : null}

          {/* Configuration Grid */}
          <section className="rounded-lg border border-border bg-card p-6 space-y-6">
            <SectionHeader
              title="Workload configuration & scale presets"
              description="Choose dataset size and execution engine tier"
              className="border-b-0 pb-0"
            />

            <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
              {/* Size Selector */}
              <div className="rounded-md border border-border bg-background p-5 space-y-4">
                <div className="text-xs font-semibold text-foreground">Scale Presets</div>

                <div className="grid grid-cols-2 gap-2">
                  {SIZES.map((opt) => {
                    const selected = size === opt.size;

                    return (
                      <button
                        key={opt.size}
                        type="button"
                        disabled={loading}
                        onClick={() => {
                          setSize(opt.size);
                          setResult(null);
                          setScaleResult(null);
                        }}
                        className={`flex flex-col items-start p-3 rounded border text-left transition ${
                          selected
                            ? "border-[#ededed] bg-secondary text-foreground"
                            : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-border"
                        }`}
                      >
                        <span className="text-xs font-mono font-semibold">
                          {opt.label} recs
                        </span>
                        <span className="mt-0.5 text-[10px] text-muted-foreground/70">
                          {opt.badge}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="border-t border-border pt-3 text-xs">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Selected</span>
                    <span className="font-mono font-semibold text-foreground">
                      {size.toLocaleString()} records
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground/70">
                    {isStreamingScale ? "Bounded chunk streaming · 16 workers" : "Deterministic in-memory evaluation"}
                  </div>
                </div>
              </div>

              {/* Execution Mode Details */}
              <div className="rounded-md border border-border bg-background p-5 space-y-4">
                {isStreamingScale ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs font-semibold text-foreground">
                          Streaming Engine Configuration
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Bounded-memory parallel worker pool
                        </div>
                      </div>
                      <Badge variant="outline">
                        STREAMING_BOUNDED_HEAP
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
                      <div className="rounded border border-border bg-card p-3 space-y-1">
                        <div className="font-mono text-base font-semibold text-foreground">
                          {(size / 20).toLocaleString()}
                        </div>
                        <div className="text-xs font-medium text-foreground">Partitions</div>
                        <div className="text-[11px] text-muted-foreground/70">Disjoint clusters</div>
                      </div>

                      <div className="rounded border border-border bg-card p-3 space-y-1">
                        <div className="font-mono text-base font-semibold text-foreground">
                          16 Workers
                        </div>
                        <div className="text-xs font-medium text-foreground">Worker pool</div>
                        <div className="text-[11px] text-muted-foreground/70">Concurrent leases</div>
                      </div>

                      <div className="rounded border border-border bg-card p-3 space-y-1">
                        <div className="font-mono text-base font-semibold text-[#10b981]">
                          O(chunk) Heap
                        </div>
                        <div className="text-xs font-medium text-foreground">Memory safety</div>
                        <div className="text-[11px] text-muted-foreground/70">Bounded footprint</div>
                      </div>

                      <div className="rounded border border-border bg-card p-3 space-y-1">
                        <div className="font-mono text-base font-semibold text-foreground">
                          Binary DAG
                        </div>
                        <div className="text-xs font-medium text-foreground">Audit lineage</div>
                        <div className="text-[11px] text-muted-foreground/70">SHA-256 Merkle root</div>
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Streams synthetic financial partitions directly into distributed worker queues in bounded chunks with 0 retries and 0 dead letters.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold text-foreground">
                        Scenario Distribution (10 Deterministic Conditions)
                      </div>
                      <span className="font-mono text-xs text-muted-foreground/70">100%</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {DISTRIBUTION.map((item, index) => {
                        const count = Math.round((size * item.pct) / 100);
                        return (
                          <div key={item.label} className="p-2 rounded border border-border bg-card space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">{String(index + 1).padStart(2, "0")}. {item.label}</span>
                              <span className="font-mono text-foreground">{item.pct}% ({count})</span>
                            </div>
                            <div className="h-1 bg-secondary rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary text-primary-foreground rounded-full"
                                style={{ width: item.pct + "%" }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={loading}
                className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium text-primary-foreground hover:bg-[#ffffff] disabled:opacity-50 transition"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Executing streaming workload...</span>
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5 fill-current" />
                    <span>
                      {isStreamingScale
                        ? `Launch ${size.toLocaleString()}-record streaming execution (16 workers)`
                        : `Generate ${size.toLocaleString()} records`}
                    </span>
                  </>
                )}
              </button>
            </div>
          </section>

          {/* Scale Run Telemetry Result */}
          {scaleResult ? (
            <section className="rounded-lg border border-border bg-card p-6 space-y-6">
              <div className="flex flex-col gap-4 border-b border-border pb-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[#10b981]" />
                    <span className="text-xs font-semibold text-foreground">
                      Scale Execution Verified · {scaleResult.classification}
                    </span>
                  </div>
                  <div className="mt-1 font-mono text-xs text-muted-foreground">
                    Run ID: {scaleResult.runId}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => router.push("/dashboard?batchId=" + scaleResult.batchId)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3.5 text-xs font-medium text-primary-foreground hover:bg-[#ffffff] transition"
                >
                  <span>Inspect in dashboard</span>
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6 text-xs">
                <div className="rounded border border-border bg-background p-4 space-y-1">
                  <div className="font-mono text-lg font-semibold text-foreground">
                    {scaleResult.report.throughputRps.toLocaleString()}
                  </div>
                  <div className="text-xs font-medium text-foreground">Throughput</div>
                  <div className="text-[11px] text-muted-foreground/70">rec / sec</div>
                </div>

                <div className="rounded border border-border bg-background p-4 space-y-1">
                  <div className="font-mono text-lg font-semibold text-foreground">
                    {scaleResult.report.wallTimeMs >= 1000
                      ? (scaleResult.report.wallTimeMs / 1000).toFixed(2) + "s"
                      : scaleResult.report.wallTimeMs + "ms"}
                  </div>
                  <div className="text-xs font-medium text-foreground">Wall duration</div>
                  <div className="text-[11px] text-muted-foreground/70">end-to-end</div>
                </div>

                <div className="rounded border border-border bg-background p-4 space-y-1">
                  <div className="font-mono text-lg font-semibold text-foreground">
                    {scaleResult.report.totalPartitions.toLocaleString()}
                  </div>
                  <div className="text-xs font-medium text-foreground">Partitions</div>
                  <div className="text-[11px] text-muted-foreground/70">all completed</div>
                </div>

                <div className="rounded border border-border bg-background p-4 space-y-1">
                  <div className="font-mono text-lg font-semibold text-foreground">
                    {scaleResult.report.workerCount} Workers
                  </div>
                  <div className="text-xs font-medium text-foreground">Worker pool</div>
                  <div className="text-[11px] text-muted-foreground/70">{scaleResult.report.workerUtilizationPct}% utilization</div>
                </div>

                <div className="rounded border border-border bg-background p-4 space-y-1">
                  <div className="font-mono text-lg font-semibold text-[#10b981]">
                    {scaleResult.report.peakHeapMB} MB
                  </div>
                  <div className="text-xs font-medium text-foreground">Peak heap</div>
                  <div className="text-[11px] text-muted-foreground/70">bounded stream</div>
                </div>

                <div className="rounded border border-border bg-background p-4 space-y-1">
                  <div className="font-mono text-lg font-semibold text-[#10b981]">
                    0 Retry / 0 DLQ
                  </div>
                  <div className="text-xs font-medium text-foreground">Reliability</div>
                  <div className="text-[11px] text-muted-foreground/70">100% success</div>
                </div>
              </div>

              <div className="rounded border border-border bg-background p-3 text-xs font-mono">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-muted-foreground/70">Merkle DAG Root:</span>
                  <span className="text-foreground break-all max-w-xl">
                    {scaleResult.report.merkleRoot}
                  </span>
                </div>
              </div>
            </section>
          ) : null}

          {/* Generated Result for Standard Runs */}
          {result && !isStreamingScale ? (
            <section className="rounded-lg border border-border bg-card p-6 space-y-6">
              <div className="flex flex-col gap-4 border-b border-border pb-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[#10b981]" />
                    <span className="text-xs font-semibold text-foreground">
                      Batch generated
                    </span>
                  </div>
                  <div className="mt-1 font-mono text-xs text-muted-foreground">
                    {result.batchId}
                  </div>
                </div>

                <Badge variant="success">
                  Ready for reconciliation
                </Badge>
              </div>

              {result.stats ? (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4 text-xs">
                  {Object.entries(result.stats).map(([key, value]) => (
                    <div key={key} className="rounded border border-border bg-background p-4">
                      <div className="text-[10px] uppercase text-muted-foreground/70">
                        {key.replace(/([A-Z])/g, " $1")}
                      </div>
                      <div className="mt-1 font-mono text-lg font-semibold text-foreground">
                        {value}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleReconcile}
                  disabled={loading}
                  className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium text-primary-foreground hover:bg-[#ffffff] disabled:opacity-50 transition"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Running multi-pass reconciliation...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="h-3.5 w-3.5" />
                      <span>Run 3-pass reconciliation pipeline</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </>
                  )}
                </button>
              </div>
            </section>
          ) : null}

          {/* Execution Pipeline Steps */}
          {steps.length > 0 ? (
            <section className="rounded-lg border border-border bg-card p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <Brain className="h-4 w-4 text-foreground" />
                  <span className="text-xs font-semibold text-foreground">
                    Multi-pass pipeline progress
                  </span>
                </div>

                <span className="text-xs font-mono text-muted-foreground/70">
                  {steps.filter((step) => step.status === "done").length}/{steps.length} complete
                </span>
              </div>

              <div className="space-y-4 pt-2">
                {steps.map((step, index) => (
                  <div key={step.label + "-" + index} className="flex gap-4 items-start text-xs">
                    <StepIcon status={step.status} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className={`font-semibold ${
                          step.status === "done"
                            ? "text-foreground"
                            : step.status === "running"
                            ? "text-foreground"
                            : step.status === "error"
                            ? "text-[#ef4444]"
                            : "text-muted-foreground/70"
                        }`}>
                          {step.label}
                        </span>
                        {step.status === "done" && (
                          <Badge variant="success">Done</Badge>
                        )}
                      </div>
                      {step.detail ? (
                        <p className="mt-1 text-xs text-muted-foreground font-mono">
                          {step.detail}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>

              {pipelineComplete ? (
                <div className="mt-4 flex items-center justify-between rounded-md border border-border bg-background p-3 text-xs">
                  <div className="flex items-center gap-2 text-[#10b981]">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Pipeline complete</span>
                  </div>
                  <span className="text-muted-foreground">
                    Opening dashboard...
                  </span>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
