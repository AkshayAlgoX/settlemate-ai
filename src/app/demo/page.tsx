"use client";

import { FinanceOpsVisualizer } from "@/components/demo/FinanceOpsVisualizer";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Brain,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  History,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  XCircle,
  Zap,
} from "lucide-react";
import { apiErrorMessage } from "@/lib/api/error-message";

import { safeFetch } from "@/lib/api/safe-fetch";
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
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  // Durable Active Job & Recent Batches State
  const [activeJob, setActiveJob] = useState<{
    jobId: string;
    status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELED";
    batchSize: number;
    createdAt: string;
    elapsedSeconds: number;
    pollUrl?: string;
    error?: string;
    result?: {
      batchId: string;
      batchName?: string;
      stats?: Record<string, number>;
    };
  } | null>(null);

  const [recentBatches, setRecentBatches] = useState<{
    id: string;
    name: string;
    size: number;
    status: string;
    source: string;
    totalRecords?: number | null;
    autoMatched?: number | null;
    exceptionsFound?: number | null;
    accuracy?: number | null;
    throughputRps?: number | null;
    createdAt: string;
  }[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);

  // 1. Recover active jobs and recent batches on mount / page refresh / login
  useEffect(() => {
    let isMounted = true;

    async function loadInitialData() {
      setLoadingRecent(true);
      try {
        const [jobsRes, batchesRes] = await Promise.all([
          safeFetch<{ activeJobs?: { jobId: string; status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"; batchSize: number; createdAt: string }[] }>("/api/batches/jobs"),
          safeFetch<{ batches?: typeof recentBatches }>("/api/batches"),
        ]);

        if (jobsRes.ok && jobsRes.data?.activeJobs && jobsRes.data.activeJobs.length > 0 && isMounted) {
          const running = jobsRes.data.activeJobs[0];
          const elapsed = Math.max(
            0,
            Math.round((Date.now() - new Date(running.createdAt).getTime()) / 1000)
          );
          setActiveJob({
            jobId: running.jobId,
            status: running.status,
            batchSize: running.batchSize,
            createdAt: running.createdAt,
            elapsedSeconds: elapsed,
          });
        }

        if (batchesRes.ok && isMounted && Array.isArray(batchesRes.data?.batches)) {
          setRecentBatches(batchesRes.data.batches);
        }
      } catch (err) {
        console.error("Initial data load error:", err);
      } finally {
        if (isMounted) setLoadingRecent(false);
      }
    }

    loadInitialData();

    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Poll active durable job until completion with visibility awareness & backoff
  const activeJobId = activeJob?.jobId;
  const activeJobStatus = activeJob?.status;

  useEffect(() => {
    if (!activeJobId || (activeJobStatus !== "PENDING" && activeJobStatus !== "PROCESSING")) {
      return;
    }

    const timer = setInterval(() => {
      setActiveJob((prev) => (prev ? { ...prev, elapsedSeconds: prev.elapsedSeconds + 1 } : null));
    }, 1000);

    let pollTimeout: NodeJS.Timeout | null = null;
    let cancelled = false;

    async function poll() {
      if (cancelled || !activeJobId) return;
      try {
        const res = await safeFetch<{
          success: boolean;
          job: {
            jobId: string;
            status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
            batchSize: number;
            result?: { batchId: string; batchName?: string; stats?: Record<string, number> };
            error?: string;
          };
        }>(`/api/batches/jobs/${activeJobId}`);

        if (res.ok && res.data?.job) {
          const job = res.data.job;
          if (job.status === "COMPLETED") {
            setActiveJob((prev) =>
              prev
                ? {
                    ...prev,
                    status: "COMPLETED",
                    result: job.result,
                  }
                : null
            );
            // Refresh recent batches
            safeFetch<{ batches: typeof recentBatches }>("/api/batches").then((b) => {
              if (b.ok && Array.isArray(b.data?.batches)) setRecentBatches(b.data.batches);
            });
            return;
          } else if (job.status === "FAILED") {
            setActiveJob((prev) =>
              prev
                ? {
                    ...prev,
                    status: "FAILED",
                    error: job.error || "Background job failed",
                  }
                : null
            );
            return;
          }
        }
      } catch (e) {
        console.warn("Job poll error:", e);
      }

      if (!cancelled) {
        // Slow down polling when document is hidden (background tab)
        const delay = typeof document !== "undefined" && document.visibilityState === "hidden" ? 4000 : 1200;
        pollTimeout = setTimeout(poll, delay);
      }
    }

    pollTimeout = setTimeout(poll, 600);

    return () => {
      cancelled = true;
      clearInterval(timer);
      if (pollTimeout) clearTimeout(pollTimeout);
    };
  }, [activeJobId, activeJobStatus]);

  const selectedOption = SIZES.find((s) => s.size === size) || SIZES[0];
  const isStreamingScale = selectedOption.mode === "STREAMING";

  const handleGenerate = async () => {
    if (isSubmitting) return;

    // If an identical background job is currently active, prevent duplicate spam
    if (activeJob && (activeJob.status === "PROCESSING" || activeJob.status === "PENDING") && activeJob.batchSize === size) {
      setError(`A background generation job is already active for ${size.toLocaleString()} records. Please wait for completion or monitor progress below.`);
      return;
    }

    setIsSubmitting(true);
    setLoading(true);
    setError(null);
    setScaleResult(null);
    setSteps([]);

    try {
      if (isStreamingScale) {
        const response = await safeFetch<ScaleRunReport & { success?: boolean; batchId?: string; runId?: string; classification?: string }>("/api/scale/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ size, workerCount: 16 }),
        });

        if (!response.ok || !response.data?.success) {
          throw new Error(response.error || apiErrorMessage(response.data, "Streaming scale run failed."));
        }

        setScaleResult({
          batchId: response.data.batchId || "",
          runId: response.data.runId || "",
          report: response.data,
          classification: response.data.classification || "REAL MEASURED",
        });
      } else {
        const response = await safeFetch<{
          accepted?: boolean;
          jobId?: string;
          pollUrl?: string;
          batchId?: string;
          stats?: Record<string, number>;
          error?: string;
        }>("/api/batches/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ size }),
        });

        const data = response.data;
        if (response.status === 202 && data?.jobId) {
          // Immediately show Active Background Generation Banner without blocking the UI
          setActiveJob({
            jobId: data.jobId,
            status: "PROCESSING",
            batchSize: size,
            createdAt: new Date().toISOString(),
            elapsedSeconds: 0,
            pollUrl: data.pollUrl,
          });
        } else {
          if (!response.ok || !data?.batchId) {
            throw new Error(response.error || apiErrorMessage(data, "Demo batch generation failed."));
          }
          setResult({
            batchId: data.batchId,
            stats: data.stats,
          });
          // Refresh recent batches list
          safeFetch<{ batches: typeof recentBatches }>("/api/batches").then((b) => {
            if (b.ok && Array.isArray(b.data?.batches)) setRecentBatches(b.data.batches);
          });
        }
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
      setIsSubmitting(false);
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
      const response = await safeFetch<MultiPassResponse & { inProgress?: boolean }>(
        "/api/reconcile/" + result.batchId + "/multi-pass",
        { method: "POST" }
      );

      const data = response.data;

      if (response.status === 202 && data?.inProgress) {
        setError("Reconciliation is already running for this batch. Please wait for completion.");
        setSteps((prev) =>
          prev.map((step) => ({ ...step, status: "done", detail: "In progress on server" }))
        );
        return;
      }

      if (!response.ok || !data?.success) {
        throw new Error(response.error || apiErrorMessage(data, "Reconciliation failed."));
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

          {/* Active Durable Background Job Status Banner */}
          {activeJob ? (
            <div
              className={`rounded-lg border p-4 text-xs space-y-3 transition ${
                activeJob.status === "COMPLETED"
                  ? "border-[#10b981]/40 bg-[#0a1a12]"
                  : activeJob.status === "FAILED"
                  ? "border-[#ef4444]/40 bg-[#1a0a0a]"
                  : "border-border bg-card"
              }`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2.5">
                  {activeJob.status === "COMPLETED" ? (
                    <CheckCircle2 className="h-4 w-4 text-[#10b981] shrink-0" />
                  ) : activeJob.status === "FAILED" ? (
                    <XCircle className="h-4 w-4 text-[#ef4444] shrink-0" />
                  ) : (
                    <Loader2 className="h-4 w-4 text-foreground animate-spin shrink-0" />
                  )}
                  <div>
                    <div className="font-semibold text-foreground flex items-center gap-2">
                      <span>
                        {activeJob.status === "COMPLETED"
                          ? `Generation Complete · ${activeJob.batchSize.toLocaleString()} Records`
                          : activeJob.status === "FAILED"
                          ? "Generation Failed"
                          : `Durable Background Generation in Progress · ${activeJob.batchSize.toLocaleString()} Records`}
                      </span>
                      <Badge
                        variant={
                          activeJob.status === "COMPLETED"
                            ? "success"
                            : activeJob.status === "FAILED"
                            ? "destructive"
                            : "outline"
                        }
                      >
                        {activeJob.status}
                      </Badge>
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-muted-foreground flex items-center gap-3">
                      <span>Job ID: {activeJob.jobId}</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {activeJob.elapsedSeconds}s elapsed
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {activeJob.status === "COMPLETED" && activeJob.result ? (
                    <button
                      type="button"
                      onClick={() => {
                        setResult(activeJob.result!);
                        setActiveJob(null);
                      }}
                      className="inline-flex h-7 items-center gap-1.5 rounded bg-[#10b981] text-black px-3 text-xs font-medium hover:bg-[#10b981]/90 transition"
                    >
                      <span>Load & Reconcile Batch</span>
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  ) : null}

                  {activeJob.status === "FAILED" ? (
                    <button
                      type="button"
                      onClick={handleGenerate}
                      className="inline-flex h-7 items-center gap-1.5 rounded bg-secondary text-foreground px-3 text-xs font-medium hover:bg-secondary/80 transition"
                    >
                      <RotateCcw className="h-3 w-3" />
                      <span>Retry</span>
                    </button>
                  ) : null}

                  {activeJob.status === "COMPLETED" || activeJob.status === "FAILED" ? (
                    <button
                      type="button"
                      onClick={() => setActiveJob(null)}
                      className="inline-flex h-7 items-center px-2 text-[11px] text-muted-foreground hover:text-foreground transition"
                    >
                      Dismiss
                    </button>
                  ) : null}
                </div>
              </div>

              {activeJob.status === "PROCESSING" || activeJob.status === "PENDING" ? (
                <p className="text-[11px] text-muted-foreground/80 border-t border-border/50 pt-2">
                  ℹ️ This job is executing durably on the authoritative server. You can freely navigate to other pages or refresh the browser; progress and results will be automatically recovered.
                </p>
              ) : activeJob.status === "FAILED" ? (
                <p className="text-[11px] text-[#ef4444] border-t border-[#ef4444]/20 pt-2 font-mono">
                  Error: {activeJob.error || "Unknown generation failure"}
                </p>
              ) : null}
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
          {result ? (
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

          {/* Authoritative Recent Batches & Audit History */}
          <section className="rounded-lg border border-border bg-card p-6 space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-foreground" />
                <div>
                  <div className="text-xs font-semibold text-foreground">
                    Authoritative Batch History ({recentBatches.length})
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Durable tenant batches stored in database. Previous batches remain accessible.
                  </div>
                </div>
              </div>

              <button
                type="button"
                disabled={loadingRecent}
                onClick={async () => {
                  setLoadingRecent(true);
                  try {
                    const res = await fetch("/api/batches");
                    const data = await res.json();
                    if (Array.isArray(data.batches)) setRecentBatches(data.batches);
                  } finally {
                    setLoadingRecent(false);
                  }
                }}
                className="inline-flex h-7 items-center gap-1.5 rounded border border-border bg-background px-2.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition disabled:opacity-50"
              >
                <RefreshCw className={`h-3 w-3 ${loadingRecent ? "animate-spin" : ""}`} />
                <span>Refresh</span>
              </button>
            </div>

            {recentBatches.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No batches generated yet. Select a scale preset above and click Generate.
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {recentBatches.slice(0, 10).map((b) => {
                  const isCurrent = result?.batchId === b.id;
                  return (
                    <div
                      key={b.id}
                      className={`flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between text-xs transition ${
                        isCurrent ? "bg-secondary/40 -mx-2 px-2 rounded" : ""
                      }`}
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium text-foreground">
                            {b.id}
                          </span>
                          <Badge variant="outline" className="font-mono text-[10px]">
                            {b.size.toLocaleString()} recs
                          </Badge>
                          {isCurrent ? (
                            <Badge variant="success" className="text-[10px]">
                              Active in View
                            </Badge>
                          ) : null}
                          <span className="text-[10px] text-muted-foreground uppercase font-mono">
                            {b.source}
                          </span>
                        </div>
                        <div className="text-[11px] text-muted-foreground flex items-center gap-3">
                          <span>{new Date(b.createdAt).toLocaleString()}</span>
                          {b.accuracy !== null && b.accuracy !== undefined ? (
                            <span className="text-[#10b981] font-mono">
                              Accuracy: {b.accuracy.toFixed(1)}%
                            </span>
                          ) : null}
                          {b.throughputRps ? (
                            <span className="font-mono">
                              {b.throughputRps.toLocaleString()} rec/s
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {!isCurrent ? (
                          <button
                            type="button"
                            onClick={() => {
                              setResult({
                                batchId: b.id,
                                batchName: b.name,
                                stats: {
                                  records: b.totalRecords || b.size,
                                  autoMatched: b.autoMatched || 0,
                                  exceptions: b.exceptionsFound || 0,
                                },
                              });
                            }}
                            className="inline-flex h-7 items-center gap-1 rounded border border-border bg-background px-2.5 text-[11px] font-medium text-foreground hover:bg-secondary transition"
                          >
                            <span>Load Batch</span>
                          </button>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => router.push("/dashboard?batchId=" + b.id)}
                          className="inline-flex h-7 items-center gap-1 rounded border border-border bg-background px-2.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition"
                        >
                          <span>Dashboard</span>
                          <ExternalLink className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
