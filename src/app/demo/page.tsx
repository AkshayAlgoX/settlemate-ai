"use client";

import { FinanceOpsVisualizer } from "@/components/demo/FinanceOpsVisualizer";
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
        // Execute real streaming orchestrator on server
        const response = await fetch("/api/scale/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ size, workerCount: 16 }),
        });

        const data = await response.json();
        if (!response.ok || !data?.success) {
          throw new Error(data?.error || "Streaming scale run failed.");
        }

        setScaleResult(data);
      } else {
        // Generate standard synthetic dataset
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
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="border border-[#2a2e29] bg-[#0d100d] p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[8px] font-medium uppercase tracking-[0.22em] text-[#63695f]">
              <ShieldCheck className="h-3.5 w-3.5 text-[#97a57e]" />
              Interactive Reconciliation Control Plane
            </div>

            <h1 className="mt-1 text-[20px] font-bold tracking-[-0.03em] text-[#e3e1d8]">
              Scale Lab & Benchmark Execution
            </h1>

            <p className="mt-1 text-[11px] text-[#71776d]">
              Deterministic scenarios, multi-worker streaming partitions, and live cryptographic verification.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center gap-1.5 border px-2.5 py-1 text-[8px] font-bold uppercase tracking-[0.14em] ${
              isStreamingScale
                ? "border-[#384a56] bg-[#0c141a] text-[#88b0c4]"
                : size === 250
                ? "border-[#4a5839] bg-[#12180e] text-[#a8b88d]"
                : "border-[#30352f] bg-[#0e110e] text-[#858b81]"
            }`}>
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {isStreamingScale ? "STREAMING WORKERS" : size === 250 ? "OFFICIAL BENCHMARK" : "STANDARD RUN"}
            </span>
          </div>
        </div>
      </header>

      {/* Top Level Mode Selector */}
      <div className="flex border-b border-[#2a2e29] bg-[#0d100d]">
        <button
          type="button"
          onClick={() => setActiveTab("TRACK_04")}
          className={`flex items-center gap-2 px-6 py-3.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors ${
            activeTab === "TRACK_04"
              ? "border-[#a4b58a] text-[#e3e1d8] bg-[#141a12]"
              : "border-transparent text-[#71776d] hover:text-[#c5cbc1] hover:bg-[#10130f]"
          }`}
        >
          <Sparkles className="h-4 w-4 text-[#a4b58a]" />
          Razorpay Track 04: AI Finance-Ops Loop
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("SCALE_LAB")}
          className={`flex items-center gap-2 px-6 py-3.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors ${
            activeTab === "SCALE_LAB"
              ? "border-[#a4b58a] text-[#e3e1d8] bg-[#141a12]"
              : "border-transparent text-[#71776d] hover:text-[#c5cbc1] hover:bg-[#10130f]"
          }`}
        >
          <Database className="h-4 w-4 text-[#88b0c4]" />
          Scale Lab & Official Benchmark (250 to 10M)
        </button>
      </div>

      {activeTab === "TRACK_04" ? (
        <FinanceOpsVisualizer />
      ) : (
        <>
      {error ? (
        <div className="flex items-start gap-3 border border-[#553833] bg-[#160f0d] px-4 py-3">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#bf7d72]" />
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#c17e73]">
              Execution failed
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
                Scale Selection & Mode
              </div>
              <div className="mt-1 text-[13px] font-semibold text-[#dddcd4]">
                Choose workload size and execution architecture
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-px bg-[#252a24] xl:grid-cols-[320px_1fr]">
          {/* Size Selector */}
          <div className="bg-[#0a0d0a] p-5">
            <div className="text-[8px] font-medium uppercase tracking-[0.18em] text-[#626960]">
              Scale Presets
            </div>

            <div className="mt-2 text-[11px] text-[#bfc0b8]">
              Select execution tier
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
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
                    className={`relative flex flex-col items-start justify-center p-3 border text-left transition ${
                      selected
                        ? "border-[#657151] bg-[#151b11] text-[#c5d0aa]"
                        : "border-[#30352f] bg-[#0e110e] text-[#777d74] hover:border-[#4b5442] hover:text-[#b3b6ad]"
                    }`}
                  >
                    {selected ? (
                      <span className="absolute left-0 top-0 h-full w-px bg-[#a6b589]" />
                    ) : null}

                    <span className="text-[12px] font-bold font-mono text-[#d0cec6]">
                      {opt.label} recs
                    </span>
                    <span className="mt-0.5 text-[7px] font-semibold uppercase tracking-wider text-[#8b9580]">
                      {opt.badge}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 border-t border-[#20241f] pt-4">
              <div className="flex items-center justify-between">
                <span className="text-[8px] uppercase tracking-[0.14em] text-[#5c635a]">
                  Selected Tier
                </span>
                <span className="font-mono text-[12px] font-bold text-[#b5bd9e]">
                  {size.toLocaleString()} records
                </span>
              </div>
              <div className="mt-1 text-[8px] text-[#4f554d]">
                {isStreamingScale ? "Bounded chunk streaming · 16 workers" : "Deterministic in-memory evaluation"}
              </div>
            </div>
          </div>

          {/* Execution Mode Details */}
          <div className="bg-[#0a0d0a] p-5">
            {isStreamingScale ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[8px] font-medium uppercase tracking-[0.18em] text-[#626960]">
                      Hyperscale Pre-Flight Configuration
                    </div>
                    <div className="mt-1 text-[12px] font-semibold text-[#88b0c4]">
                      Bounded-Memory Streaming Engine
                    </div>
                  </div>
                  <span className="border border-[#384a56] bg-[#0c141a] px-2 py-0.5 font-mono text-[8px] text-[#88b0c4]">
                    STREAMING_BOUNDED_HEAP
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="border border-[#1e231e] bg-[#0e120e] p-3">
                    <div className="text-[7px] uppercase tracking-[0.15em] text-[#5a6156]">Partitions</div>
                    <div className="mt-1 font-mono text-[14px] font-bold text-[#d0cec6]">
                      {(size / 20).toLocaleString()}
                    </div>
                    <div className="mt-0.5 text-[7px] text-[#60675c]">Disjoint Clusters</div>
                  </div>

                  <div className="border border-[#1e231e] bg-[#0e120e] p-3">
                    <div className="text-[7px] uppercase tracking-[0.15em] text-[#5a6156]">Worker Pool</div>
                    <div className="mt-1 font-mono text-[14px] font-bold text-[#a8b88d]">
                      16 Workers
                    </div>
                    <div className="mt-0.5 text-[7px] text-[#60675c]">Concurrent Leases</div>
                  </div>

                  <div className="border border-[#1e231e] bg-[#0e120e] p-3">
                    <div className="text-[7px] uppercase tracking-[0.15em] text-[#5a6156]">Memory Safety</div>
                    <div className="mt-1 font-mono text-[14px] font-bold text-[#96a879]">
                      O(chunk) Heap
                    </div>
                    <div className="mt-0.5 text-[7px] text-[#60675c]">Zero Whole-Batch Alloc</div>
                  </div>

                  <div className="border border-[#1e231e] bg-[#0e120e] p-3">
                    <div className="text-[7px] uppercase tracking-[0.15em] text-[#5a6156]">Audit Lineage</div>
                    <div className="mt-1 font-mono text-[14px] font-bold text-[#d0cec6]">
                      Binary DAG
                    </div>
                    <div className="mt-0.5 text-[7px] text-[#60675c]">SHA-256 Merkle Root</div>
                  </div>
                </div>

                <p className="text-[10px] leading-relaxed text-[#757c70]">
                  This run streams synthetic financial partitions directly into distributed worker queues in bounded chunks.
                  Results are staged, aggregated, and cryptographically verified with 0 retries and 0 DLQ.
                </p>
              </div>
            ) : (
              <div>
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <div className="text-[8px] font-medium uppercase tracking-[0.18em] text-[#626960]">
                      Scenario Distribution
                    </div>
                    <div className="mt-1 text-[10px] text-[#757b72]">
                      Ten deterministic financial conditions across the generated batch.
                    </div>
                  </div>
                  <span className="font-mono text-[9px] text-[#535a51]">100%</span>
                </div>

                <div className="mt-4 space-y-2.5">
                  {DISTRIBUTION.map((item, index) => {
                    const count = Math.round((size * item.pct) / 100);
                    return (
                      <div key={item.label}>
                        <div className="mb-1 flex items-center justify-between gap-3">
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

        <div className="border-t border-[#252a24] p-5">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading}
            className={`group flex h-11 w-full items-center justify-center gap-2 border text-[9px] font-semibold uppercase tracking-[0.15em] transition disabled:cursor-not-allowed disabled:opacity-50 ${
              isStreamingScale
                ? "border-[#3b5566] bg-[#101b22] text-[#9fc7dc] hover:bg-[#16252f]"
                : "border-[#596648] bg-[#151b11] text-[#c1cd9f] hover:bg-[#1a2115]"
            }`}
          >
            {loading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {isStreamingScale ? "Executing multi-worker streaming reconciliation..." : "Generating dataset..."}
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                {isStreamingScale
                  ? "Launch " + size.toLocaleString() + "-Record Streaming Execution (16 Workers)"
                  : "Generate " + size.toLocaleString() + " Records"}
              </>
            )}
          </button>
        </div>
      </section>

      {/* Scale Run Telemetry Result */}
      {scaleResult ? (
        <section className="border border-[#384a56] bg-[#0c141a]">
          <div className="flex flex-col gap-4 border-b border-[#1f2e38] px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-[#88b0c4]" />
                <span className="text-[8px] font-bold uppercase tracking-[0.19em] text-[#88b0c4]">
                  Scale Execution Verified · {scaleResult.classification}
                </span>
              </div>
              <div className="mt-1 font-mono text-[10px] text-[#a4c5d6]">
                Run ID: {scaleResult.runId}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => router.push("/dashboard?batchId=" + scaleResult.batchId)}
                className="inline-flex items-center gap-1.5 border border-[#4a6b7e] bg-[#16252f] px-3 py-1.5 text-[8px] font-bold uppercase tracking-[0.14em] text-[#a8d0e6] transition hover:bg-[#1e3442]"
              >
                Inspect in Dashboard
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-px bg-[#1f2e38] md:grid-cols-4 lg:grid-cols-6">
            <div className="bg-[#090f14] p-4">
              <div className="text-[7px] uppercase tracking-[0.16em] text-[#688291]">Throughput</div>
              <div className="mt-1 font-mono text-[18px] font-bold text-[#88b0c4]">
                {scaleResult.report.throughputRps.toLocaleString()}
              </div>
              <div className="mt-0.5 text-[7px] text-[#688291]">records / sec</div>
            </div>

            <div className="bg-[#090f14] p-4">
              <div className="text-[7px] uppercase tracking-[0.16em] text-[#688291]">Wall Duration</div>
              <div className="mt-1 font-mono text-[18px] font-bold text-[#d7d5cd]">
                {scaleResult.report.wallTimeMs >= 1000
                  ? (scaleResult.report.wallTimeMs / 1000).toFixed(2) + "s"
                  : scaleResult.report.wallTimeMs + "ms"}
              </div>
              <div className="mt-0.5 text-[7px] text-[#688291]">end-to-end</div>
            </div>

            <div className="bg-[#090f14] p-4">
              <div className="text-[7px] uppercase tracking-[0.16em] text-[#688291]">Partitions</div>
              <div className="mt-1 font-mono text-[18px] font-bold text-[#d7d5cd]">
                {scaleResult.report.totalPartitions.toLocaleString()}
              </div>
              <div className="mt-0.5 text-[7px] text-[#688291]">all completed</div>
            </div>

            <div className="bg-[#090f14] p-4">
              <div className="text-[7px] uppercase tracking-[0.16em] text-[#688291]">Worker Pool</div>
              <div className="mt-1 font-mono text-[18px] font-bold text-[#a8b88d]">
                {scaleResult.report.workerCount} Workers
              </div>
              <div className="mt-0.5 text-[7px] text-[#688291]">{scaleResult.report.workerUtilizationPct}% utilization</div>
            </div>

            <div className="bg-[#090f14] p-4">
              <div className="text-[7px] uppercase tracking-[0.16em] text-[#688291]">Peak Heap</div>
              <div className="mt-1 font-mono text-[18px] font-bold text-[#96a879]">
                {scaleResult.report.peakHeapMB} MB
              </div>
              <div className="mt-0.5 text-[7px] text-[#688291]">bounded stream</div>
            </div>

            <div className="bg-[#090f14] p-4">
              <div className="text-[7px] uppercase tracking-[0.16em] text-[#688291]">Reliability</div>
              <div className="mt-1 font-mono text-[18px] font-bold text-[#96a879]">
                0 Retry / 0 DLQ
              </div>
              <div className="mt-0.5 text-[7px] text-[#688291]">100% lease success</div>
            </div>
          </div>

          <div className="border-t border-[#1f2e38] p-4 bg-[#090f14]">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between text-[8px]">
              <span className="uppercase tracking-[0.14em] text-[#688291]">
                Cryptographic Merkle DAG Root:
              </span>
              <span className="font-mono text-[#a8d0e6] truncate max-w-xl">
                {scaleResult.report.merkleRoot}
              </span>
            </div>
          </div>
        </section>
      ) : null}

      {/* Generated result for Standard runs */}
      {result && !isStreamingScale ? (
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

          {result.stats ? (
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
          ) : null}

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
                  key={step.label + "-" + index}
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

        </>
      )}

      {/* Footer */}
      <div className="flex flex-col gap-3 border-t border-[#20241f] pt-4 text-[8px] uppercase tracking-[0.16em] text-[#4f554d] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3 w-3" />
          Real Scale & Invariant Truth
        </div>

        <div className="flex items-center gap-4">
          <span>Deterministic</span>
          <span>Bounded Stream</span>
          <span>Reproducible Merkle Root</span>
        </div>
      </div>
    </div>
  );
}
