"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  RefreshCw,
  Check,
  Copy,
  Clock,
  Terminal,
} from "lucide-react";
import { apiErrorMessage } from "@/lib/api/error-message";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Badge } from "@/components/ui/badge";
import { formatAuditTime } from "@/lib/format";

interface SuiteResult {
  suiteId: string;
  name: string;
  command: string;
  status: "PENDING" | "RUNNING" | "PASS" | "FAIL";
  progressPct?: number;
  durationMs?: number;
  metrics?: Record<string, string | number>;
  rawOutputSnippet?: string;
}

interface VerificationHubResponse {
  success: boolean;
  allPassed: boolean;
  timestamp: string;
  totalDurationMs: number;
  totalSuitesExecuted: number;
  results: Record<string, SuiteResult>;
  jobId?: string;
}

interface VerifyJobState {
  jobId: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  requestedSuites: string[];
  totalSuites: number;
  completedSuites: number;
  overallProgressPct: number;
  startedAt: string;
  completedAt?: string;
  totalDurationMs?: number;
  allPassed?: boolean;
  results: Record<string, SuiteResult>;
}

const AVAILABLE_SUITES = [
  { id: "benchmark", name: "Official 250-Record Benchmark", cmd: "npm run evaluate" },
  { id: "cardinality", name: "Cardinality Solver Topologies (8/8)", cmd: "npx tsx scripts/evaluate-cardinality.ts" },
  { id: "claim-validator", name: "AI Claim Validator Micro-Bench (134k claims/s)", cmd: "npx tsx scripts/benchmark-claim-verification.ts" },
  { id: "cross-partition", name: "Cross-Partition Micro-Bench (149k pairs/s)", cmd: "npx tsx scripts/benchmark-cross-partition-scale.ts" },
  { id: "chaos", name: "100k Streaming Chaos Recovery (100%)", cmd: "npx tsx scripts/benchmark-100k-chaos.ts" },
  { id: "receipt", name: "Decision Receipt Standalone Verifier", cmd: "npm run verify:demo" },
  { id: "finance-ops", name: "Track 04 AI Finance-Ops Loop (55 Rec)", cmd: "npx tsx scripts/benchmark-finance-ops-loop.ts" },
];

export default function VerificationHubPage() {
  const [selectedSuites, setSelectedSuites] = useState<string[]>(
    AVAILABLE_SUITES.map((s) => s.id)
  );
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [overallProgress, setOverallProgress] = useState<number>(0);
  const [liveSuiteStates, setLiveSuiteStates] = useState<Record<string, SuiteResult>>({});
  const [finalResponse, setFinalResponse] = useState<VerificationHubResponse | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const toggleSuite = (id: string) => {
    if (selectedSuites.includes(id)) {
      if (selectedSuites.length > 1) {
        setSelectedSuites(selectedSuites.filter((s) => s !== id));
      }
    } else {
      setSelectedSuites([...selectedSuites, id]);
    }
  };

  const selectAll = () => {
    setSelectedSuites(AVAILABLE_SUITES.map((s) => s.id));
  };

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  useEffect(() => {
    return () => stopPolling();
  }, []);

  const handleRunVerification = async () => {
    stopPolling();
    setIsRunning(true);
    setFinalResponse(null);
    setOverallProgress(0);

    const initialStates: Record<string, SuiteResult> = {};
    for (const suiteId of selectedSuites) {
      const meta = AVAILABLE_SUITES.find((s) => s.id === suiteId);
      initialStates[suiteId] = {
        suiteId,
        name: meta?.name || suiteId,
        command: meta?.cmd || `run ${suiteId}`,
        status: "PENDING",
        progressPct: 0,
      };
    }
    setLiveSuiteStates(initialStates);

    try {
      const res = await fetch("/api/verify/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suites: selectedSuites, async: true }),
      });

      const data = await res.json();

      if (res.status === 202 && data.jobId) {
        setActiveJobId(data.jobId);
        startPolling(data.jobId);
      } else if (data.success && data.results) {
        setFinalResponse(data);
        setLiveSuiteStates(data.results);
        setOverallProgress(100);
        setIsRunning(false);
      } else {
        throw new Error(apiErrorMessage(data, "Failed to start verification suite"));
      }
    } catch (err) {
      console.error("Async verification initiation failed, falling back to sync run:", err);
      try {
        const syncRes = await fetch("/api/verify/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ suites: selectedSuites, async: false }),
        });
        const syncData = await syncRes.json();
        if (syncData.success) {
          setFinalResponse(syncData);
          setLiveSuiteStates(syncData.results);
          setOverallProgress(100);
        }
      } catch (fallbackErr) {
        console.error("Sync fallback also failed:", fallbackErr);
      } finally {
        setIsRunning(false);
      }
    }
  };

  const startPolling = (jobId: string) => {
    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/verify/progress/${jobId}`);
        if (!res.ok) return;

        const data: { success: boolean; job: VerifyJobState } = await res.json();
        if (data.success && data.job) {
          const job = data.job;
          setOverallProgress(job.overallProgressPct);
          setLiveSuiteStates(job.results);

          if (job.status === "COMPLETED" || job.status === "FAILED") {
            stopPolling();
            setIsRunning(false);
            setFinalResponse({
              success: true,
              allPassed: job.allPassed ?? false,
              timestamp: job.completedAt || new Date().toISOString(),
              totalDurationMs: job.totalDurationMs || 0,
              totalSuitesExecuted: job.completedSuites,
              results: job.results,
              jobId: job.jobId,
            });
          }
        }
      } catch (err) {
        console.warn("Polling error:", err);
      }
    }, 1500);
  };

  const handleCopyJson = () => {
    if (finalResponse) {
      navigator.clipboard.writeText(JSON.stringify(finalResponse, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-8 pb-12 font-sans">
      {/* Header */}
      <PageHeader
        tag="Empirical Proofs"
        title="Verification hub"
        description="Execute live benchmark suites on demand. Every metric is computed live from clean execution fixtures with cryptographic receipts."
        badge={<Badge variant="outline">Live Engine</Badge>}
        actions={
          <div className="flex items-center gap-2">
            {finalResponse && (
              <button
                type="button"
                onClick={handleCopyJson}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-accent hover:border-foreground/30 transition shadow-2xs"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                <span>{copied ? "Copied" : "Copy JSON report"}</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleRunVerification}
              disabled={isRunning}
              className="inline-flex h-8 items-center rounded-lg bg-primary px-3.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition shadow-xs"
            >
              {isRunning ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  <span>Running ({overallProgress}%)</span>
                </>
              ) : (
                <span>Run verification ({selectedSuites.length})</span>
              )}
            </button>
          </div>
        }
      />

      {/* Live Overall Progress Bar */}
      {isRunning && (
        <div className="p-4 rounded-xl border border-border bg-card space-y-2 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-mono text-foreground">
            <span>Executing verification stream {activeJobId ? `· Job ${activeJobId}` : ""}</span>
            <span>{overallProgress}% Completed</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden bg-muted rounded-full">
            <div
              className="h-full bg-primary transition-all duration-500 rounded-full"
              style={{ width: `${overallProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Suite Selection Controls */}
      <div className="p-5 rounded-xl border border-border bg-card space-y-4 shadow-2xs">
        <div className="flex items-center justify-between">
          <SectionHeader
            title="Verification suites"
            description="Select individual test and benchmark suites to execute."
            className="border-b-0 pb-0"
          />
          <button
            type="button"
            onClick={selectAll}
            className="text-xs text-foreground hover:underline font-semibold"
          >
            Select all (7 suites)
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {AVAILABLE_SUITES.map((suite) => {
            const isChecked = selectedSuites.includes(suite.id);
            return (
              <label
                key={suite.id}
                className={`flex items-center gap-2.5 p-3 rounded-lg border cursor-pointer text-xs transition-all ${
                  isChecked
                    ? "border-foreground/40 bg-accent text-foreground font-semibold"
                    : "border-border bg-background text-muted-foreground hover:border-foreground/20"
                }`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleSuite(suite.id)}
                  disabled={isRunning}
                  className="accent-primary h-3.5 w-3.5 rounded"
                />
                <span className="truncate">{suite.name}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Aggregate Banner */}
      {finalResponse && (
        <div
          className={`p-5 rounded-xl border flex items-center justify-between shadow-2xs ${
            finalResponse.allPassed
              ? "border-border bg-card text-foreground"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}
        >
          <div className="flex items-center gap-3">
            <Badge variant={finalResponse.allPassed ? "success" : "destructive"}>
              {finalResponse.allPassed ? "100% Passed" : "Discrepancy"}
            </Badge>
            <div>
              <div className="text-sm font-semibold">
                {finalResponse.allPassed
                  ? "All subsystems verified: 100% truth preservation"
                  : "Verification warning: discrepancy detected"}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5 font-mono">
                Executed {finalResponse.totalSuitesExecuted} suites in {(finalResponse.totalDurationMs / 1000).toFixed(2)}s · {formatAuditTime(finalResponse.timestamp)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Suite Results Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {AVAILABLE_SUITES.filter((s) => selectedSuites.includes(s.id)).map((suite) => {
          const res = liveSuiteStates[suite.id] || finalResponse?.results?.[suite.id];

          return (
            <div
              key={suite.id}
              className="p-5 rounded-xl border border-border bg-card space-y-4 shadow-2xs"
            >
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div>
                  <h3 className="text-xs font-semibold text-foreground">{suite.name}</h3>
                  <code className="text-[11px] text-muted-foreground font-mono">{suite.cmd}</code>
                </div>

                {res?.status === "RUNNING" ? (
                  <Badge variant="outline">
                    <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                    <span>Running</span>
                  </Badge>
                ) : res?.status === "PASS" ? (
                  <Badge variant="success">Pass</Badge>
                ) : res?.status === "FAIL" ? (
                  <Badge variant="destructive">Fail</Badge>
                ) : (
                  <Badge variant="secondary">{isRunning ? "Queued" : "Idle"}</Badge>
                )}
              </div>

              {/* Metrics Grid */}
              {res?.metrics && Object.keys(res.metrics).length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {Object.entries(res.metrics).map(([key, val]) => (
                    <div key={key} className="p-2.5 rounded-lg border border-border bg-background">
                      <div className="text-xs text-muted-foreground truncate">
                        {key.replace(/([A-Z])/g, " $1")}
                      </div>
                      <div className="text-xs font-mono font-semibold text-foreground truncate mt-0.5">
                        {String(val)}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Duration & Execution Timestamp */}
              {res?.durationMs !== undefined && res.durationMs > 0 && (
                <div className="flex items-center justify-between text-xs font-mono text-muted-foreground border-t border-border pt-2">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>{(res.durationMs / 1000).toFixed(2)}s</span>
                  </span>
                  <span>Deterministic verification output</span>
                </div>
              )}

              {/* Raw Snippet Terminal View */}
              {res?.rawOutputSnippet && (
                <div className="rounded-lg border border-border bg-background p-2.5 text-[11px] font-mono text-muted-foreground max-h-24 overflow-y-auto whitespace-pre-wrap">
                  <div className="flex items-center gap-1.5 text-muted-foreground pb-1 border-b border-border mb-1">
                    <Terminal className="h-3 w-3" />
                    <span>stdout</span>
                  </div>
                  {res.rawOutputSnippet}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
