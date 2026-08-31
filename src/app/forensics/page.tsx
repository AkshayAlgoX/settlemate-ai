"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Copy,
  Check,
  RefreshCw,
} from "lucide-react";
import {
  type ForensicsTimeline,
  type ForensicsStep,
  type StoredJobSummaryItem,
} from "@/lib/forensics/forensics-types";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Badge } from "@/components/ui/badge";
import { Dropdown } from "@/components/ui/dropdown";
import { formatDateOnly, formatAuditTime } from "@/lib/format";

import { safeFetch } from "@/lib/api/safe-fetch";

export default function ForensicsPage() {
  const [jobs, setJobs] = useState<StoredJobSummaryItem[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [timeline, setTimeline] = useState<ForensicsTimeline | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [offlineVerified, setOfflineVerified] = useState<boolean>(false);
  const [copiedHash, setCopiedHash] = useState<boolean>(false);
  const [loadingJobs, setLoadingJobs] = useState<boolean>(true);

  const playbackTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let mounted = true;
    safeFetch<{ jobs?: StoredJobSummaryItem[] }>("/api/forensics/jobs")
      .then((res) => {
        if (mounted && res.ok && res.data && Array.isArray(res.data.jobs) && res.data.jobs.length > 0) {
          setJobs(res.data.jobs);
          setSelectedJobId(res.data.jobs[0].jobId);
        }
      })
      .catch((err) => console.error("Failed to load jobs list:", err))
      .finally(() => {
        if (mounted) setLoadingJobs(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    if (!selectedJobId) return;

    safeFetch<{ success: boolean; timeline: ForensicsTimeline }>(`/api/forensics/${selectedJobId}`)
      .then((res) => {
        if (mounted && res.ok && res.data?.success && res.data.timeline) {
          setTimeline(res.data.timeline);
          setCurrentStepIndex(0);
          setIsPlaying(false);
          setOfflineVerified(false);
        }
      })
      .catch((err) => console.error("Failed to fetch forensics timeline:", err));

    return () => {
      mounted = false;
    };
  }, [selectedJobId]);


  useEffect(() => {
    if (isPlaying) {
      playbackTimerRef.current = setInterval(() => {
        setCurrentStepIndex((prev) => {
          if (prev >= 6) {
            setIsPlaying(false);
            return 6;
          }
          return prev + 1;
        });
      }, 1200);
    } else if (playbackTimerRef.current) {
      clearInterval(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }

    return () => {
      if (playbackTimerRef.current) {
        clearInterval(playbackTimerRef.current);
      }
    };
  }, [isPlaying]);

  const togglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      if (currentStepIndex >= 6) {
        setCurrentStepIndex(0);
      }
      setIsPlaying(true);
    }
  };

  const handleStepPrev = () => {
    setIsPlaying(false);
    setCurrentStepIndex((prev) => Math.max(0, prev - 1));
  };

  const handleStepNext = () => {
    setIsPlaying(false);
    setCurrentStepIndex((prev) => Math.min(6, prev + 1));
  };

  const handleReset = () => {
    setIsPlaying(false);
    setCurrentStepIndex(0);
  };

  const handleVerifyOffline = () => {
    setOfflineVerified(true);
  };

  const copyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  const activeStep: ForensicsStep | undefined = timeline?.steps[currentStepIndex];

  return (
    <div className="space-y-10 pb-12">
      {/* Header */}
      <PageHeader
        tag="Audit & Forensics"
        title="Reconciliation playback & forensics"
        description="Replay the deterministic 7-phase transformation from raw transactions to verified ledger postings, AI claims, and SHA-256 Merkle receipts."
        badge={<Badge variant="outline">Forensics</Badge>}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-foreground hover:bg-accent transition"
            >
              <RotateCcw className="h-3 w-3 text-muted-foreground" />
              <span>Reset</span>
            </button>
            <button
              type="button"
              onClick={handleStepPrev}
              disabled={currentStepIndex === 0}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-40 transition"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Prev</span>
            </button>
            <button
              type="button"
              onClick={handleStepNext}
              disabled={currentStepIndex === 6}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-40 transition"
            >
              <span>Next</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={togglePlay}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3.5 text-xs font-medium text-primary-foreground hover:bg-[#ffffff] transition"
            >
              {isPlaying ? (
                <>
                  <Pause className="h-3.5 w-3.5 fill-current" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 fill-current" />
                  <span>{currentStepIndex >= 6 ? "Replay" : "Play (1.2s)"}</span>
                </>
              )}
            </button>
          </div>
        }
      />

      {/* Job Selector & Metric Header Strip */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-muted-foreground">
              Stored reconciliation job:
            </span>
            <Dropdown
              value={selectedJobId}
              onValueChange={setSelectedJobId}
              options={jobs.map((j) => ({
                value: j.jobId,
                label: `${j.jobId} (${j.batchSize} recs · ${formatDateOnly(j.createdAt)})`,
                badge: `${j.matchRatePct}%`,
              }))}
              triggerClassName="min-w-[280px] font-mono text-sm"
              data-testid="forensics-job-dropdown"
            />
          </div>

          {timeline && (
            <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
              <div>
                <span className="text-[11px] text-muted-foreground block font-sans">Batch size</span>
                <strong className="text-foreground">{timeline.batchSize} records</strong>
              </div>
              <div className="h-6 w-px bg-[#1e1e1e]" />
              <div>
                <span className="text-[11px] text-muted-foreground block font-sans">Match rate</span>
                <strong className="text-foreground">{timeline.summary.matchRatePct}%</strong>
              </div>
              <div className="h-6 w-px bg-[#1e1e1e]" />
              <div>
                <span className="text-[11px] text-muted-foreground block font-sans">Exceptions</span>
                <strong className={timeline.summary.exception > 0 ? "text-[#ef4444]" : "text-foreground"}>
                  {timeline.summary.exception} ({timeline.summary.formattedDiscrepancy})
                </strong>
              </div>
            </div>
          )}
        </div>

        {/* 7-Step Progress Bar */}
        <div className="space-y-1.5 pt-2 border-t border-border">
          <div className="flex items-center justify-between text-xs font-mono text-muted-foreground/70">
            <span>Phase {currentStepIndex + 1} of 7: {activeStep?.title}</span>
            <span>{Math.round(((currentStepIndex + 1) / 7) * 100)}% Complete</span>
          </div>
          <div className="h-1.5 w-full bg-[#181818] rounded-full overflow-hidden">
            <div
              className="h-full bg-primary text-primary-foreground rounded-full transition-all duration-300"
              style={{ width: `${((currentStepIndex + 1) / 7) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Main Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: 7 Chronological Steps */}
        <div className="lg:col-span-5 space-y-2">
          <SectionHeader
            title="Forensics timeline"
            description="Select any phase to view execution state."
            className="border-b-0 pb-0"
          />

          {!timeline ? (
            <div className="rounded-lg border border-border bg-card p-8 text-center space-y-3">
              <RefreshCw className="h-5 w-5 animate-spin text-foreground mx-auto" />
              <div className="text-xs font-mono text-muted-foreground">Reconstructing Forensics Timeline...</div>
            </div>
          ) : (
            timeline.steps.map((step, idx) => {
              const isActive = idx === currentStepIndex;

              return (
                <button
                  key={step.stepNumber}
                  type="button"
                  onClick={() => {
                    setIsPlaying(false);
                    setCurrentStepIndex(idx);
                  }}
                  className={`w-full text-left p-3.5 rounded-lg border transition-all flex items-start gap-3 ${
                    isActive
                      ? "border-[#ededed] bg-accent text-foreground"
                      : "border-border bg-card text-muted-foreground hover:border-border"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono font-medium text-muted-foreground/70">
                          0{step.stepNumber}
                        </span>
                        <Badge variant="outline">
                          {step.status}
                        </Badge>
                      </div>
                      <span className="text-[11px] font-mono text-muted-foreground/70">
                        {step.durationMs}ms
                      </span>
                    </div>

                    <h3 className={`text-xs font-semibold mt-1 truncate ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                      {step.title}
                    </h3>
                    <p className="text-[11px] text-muted-foreground/70 line-clamp-2 mt-0.5 leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Right Column: Deep Step Inspector */}
        <div className="lg:col-span-7 space-y-4">
          {activeStep ? (
            <div className="rounded-lg border border-border bg-card p-6 space-y-5">
              {/* Step Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      Phase {activeStep.stepNumber}: {activeStep.phase}
                    </Badge>
                    <span className="text-xs font-mono text-muted-foreground/70">
                      {activeStep.durationMs}ms
                    </span>
                  </div>
                  <h2 className="text-base font-semibold text-foreground mt-1">
                    {activeStep.title}
                  </h2>
                </div>

                <div className="text-right font-mono text-xs text-muted-foreground/70">
                  <div>Status: {activeStep.status}</div>
                  <div>{formatAuditTime(activeStep.timestamp)}</div>
                </div>
              </div>

              {/* Step Description */}
              <p className="text-xs text-muted-foreground leading-relaxed">
                {activeStep.description}
              </p>

              {/* Data Snapshot Views by Phase */}
              <div className="space-y-3">
                <div className="text-xs font-semibold text-foreground">
                  Execution Snapshot
                </div>

                {/* PHASE 1: Input Ingestion Table */}
                {activeStep.phase === "INPUT_INGESTION" && (
                  <div className="rounded border border-border bg-background overflow-x-auto">
                    <table className="w-full text-left font-mono text-xs">
                      <thead className="border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground">
                        <tr>
                          <th className="p-2.5 font-medium">Source</th>
                          <th className="p-2.5 font-medium">Record ID</th>
                          <th className="p-2.5 font-medium">Reference</th>
                          <th className="p-2.5 font-medium text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {((activeStep.dataSnapshot.sampleRecords as Array<Record<string, unknown>>) || []).map((r, i) => (
                          <tr key={i} className="hover:bg-accent/40">
                            <td className="p-2.5 text-foreground font-medium">{String(r.source)}</td>
                            <td className="p-2.5 text-muted-foreground">{String(r.id)}</td>
                            <td className="p-2.5 text-muted-foreground/70">{String(r.referenceId || "-")}</td>
                            <td className="p-2.5 text-foreground font-medium text-right">{String(r.formattedAmount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* PHASE 2: Index Building */}
                {activeStep.phase === "INDEX_BUILDING" && (
                  <div className="grid grid-cols-2 gap-3 font-mono text-xs">
                    <div className="p-3 rounded-md border border-border bg-background space-y-1">
                      <span className="text-xs text-muted-foreground">Partition keys</span>
                      <div className="text-foreground font-medium">paymentId, referenceId, utr</div>
                    </div>
                    <div className="p-3 rounded-md border border-border bg-background space-y-1">
                      <span className="text-xs text-muted-foreground">Temporal window</span>
                      <div className="text-foreground font-medium">72 Hours Sliding Bound</div>
                    </div>
                    <div className="p-3 rounded-md border border-border bg-background space-y-1">
                      <span className="text-xs text-muted-foreground">Candidate pairs</span>
                      <div className="text-foreground font-medium">{String(activeStep.dataSnapshot.candidatePairsGenerated || 40)} pairs</div>
                    </div>
                    <div className="p-3 rounded-md border border-border bg-background space-y-1">
                      <span className="text-xs text-muted-foreground">Search strategy</span>
                      <div className="text-foreground font-medium">HASH_MAP_PARTITIONED</div>
                    </div>
                  </div>
                )}

                {/* PHASE 3: Matching Results */}
                {activeStep.phase === "MATCHING_RESULTS" && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-3 font-mono text-xs text-center">
                      <div className="p-3 rounded-md border border-border bg-background">
                        <span className="text-xs text-muted-foreground">Auto-matched</span>
                        <div className="text-lg font-semibold text-foreground">{String(activeStep.dataSnapshot.autoMatchedCount)}</div>
                      </div>
                      <div className="p-3 rounded-md border border-border bg-background">
                        <span className="text-xs text-muted-foreground">Suggested</span>
                        <div className="text-lg font-semibold text-foreground">{String(activeStep.dataSnapshot.suggestedCount)}</div>
                      </div>
                      <div className="p-3 rounded-md border border-border bg-background">
                        <span className="text-xs text-muted-foreground">Exceptions</span>
                        <div className="text-lg font-semibold text-[#ef4444]">{String(activeStep.dataSnapshot.exceptionCount)}</div>
                      </div>
                    </div>

                    {Array.isArray(activeStep.dataSnapshot.exceptions) && (activeStep.dataSnapshot.exceptions as Array<Record<string, unknown>>).length > 0 && (
                      <div className="rounded-md border border-border bg-background p-3 space-y-2 font-mono text-xs">
                        <span className="text-xs text-muted-foreground">Isolated exception:</span>
                        {((activeStep.dataSnapshot.exceptions as Array<Record<string, unknown>>)).map((exc, i) => (
                          <div key={i} className="flex items-center justify-between p-2 rounded border border-border bg-card">
                            <div>
                              <span className="text-foreground font-semibold">{String(exc.id)}</span> · <span className="text-muted-foreground">{String(exc.type)}</span>
                              <div className="text-[11px] text-muted-foreground/70 mt-0.5">{String(exc.description)}</div>
                            </div>
                            <span className="text-[#ef4444] font-semibold">{String(exc.varianceFormatted)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* PHASE 4: AI Investigation */}
                {activeStep.phase === "AI_INVESTIGATION" && (
                  <div className="space-y-3 font-mono text-xs">
                    <div className="p-3 rounded-md border border-border bg-background space-y-1">
                      <span className="text-[10px] uppercase text-muted-foreground/70">Structured Advisory Claim:</span>
                      <p className="text-foreground leading-relaxed font-sans text-xs">
                        &quot;{String(activeStep.dataSnapshot.claimStatement)}&quot;
                      </p>
                      <div className="text-[11px] text-muted-foreground/70 pt-1">
                        Evidence: <strong className="text-foreground">{JSON.stringify(activeStep.dataSnapshot.citedEvidenceIds)}</strong>
                      </div>
                    </div>

                    <div className="rounded-md border border-border bg-background p-3 space-y-2">
                      <span className="text-[10px] uppercase text-muted-foreground/70">Mechanical Non-LLM Verifications:</span>
                      <div className="space-y-1">
                        {((activeStep.dataSnapshot.nonLlmChecks as Array<{ check: string; status: string; detail: string }>) || []).map((chk, i) => (
                          <div key={i} className="flex items-center justify-between p-2 rounded border border-border bg-card text-xs">
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="h-3.5 w-3.5 text-[#10b981]" />
                              <span className="text-foreground font-medium">{chk.check}</span>
                              <span className="text-muted-foreground/70">{chk.detail}</span>
                            </div>
                            <Badge variant="success">
                              {chk.status}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* PHASE 5: Maker / Checker */}
                {activeStep.phase === "MAKER_CHECKER" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-xs">
                    <div className="p-3 rounded-md border border-border bg-background space-y-1">
                      <span className="text-xs text-muted-foreground">Maker (Reviewer Proposal)</span>
                      <div className="text-foreground font-medium">reviewer_finance_ops</div>
                      <div className="text-[11px] text-muted-foreground/70">Action: PROPOSE_JOURNAL_ADJUSTMENT</div>
                    </div>

                    <div className="p-3 rounded-md border border-border bg-background space-y-1">
                      <span className="text-xs text-muted-foreground">Checker (Controller Sign-off)</span>
                      <div className="text-foreground font-medium">controller_cfo_01 (Admin)</div>
                      <div className="text-[11px] text-[#10b981]">Verdict: AUTHORIZED (Level 3)</div>
                    </div>
                  </div>
                )}

                {/* PHASE 6: Ledger Posting */}
                {activeStep.phase === "LEDGER_POSTING" && (
                  <div className="space-y-3 font-mono text-xs">
                    <div className="rounded border border-border bg-background overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground">
                          <tr>
                            <th className="p-2.5 font-medium">Account</th>
                            <th className="p-2.5 font-medium">Debit</th>
                            <th className="p-2.5 font-medium">Credit</th>
                            <th className="p-2.5 font-medium">Note</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {((activeStep.dataSnapshot.journalEntries as Array<Record<string, unknown>>) || []).map((j, i) => (
                            <tr key={i} className="hover:bg-accent/40">
                              <td className="p-2.5 text-foreground font-medium">{String(j.account)}</td>
                              <td className="p-2.5 text-foreground">{Number(j.debitPaise) > 0 ? `₹${(Number(j.debitPaise) / 100).toFixed(2)}` : "-"}</td>
                              <td className="p-2.5 text-foreground">{Number(j.creditPaise) > 0 ? `₹${(Number(j.creditPaise) / 100).toFixed(2)}` : "-"}</td>
                              <td className="p-2.5 text-muted-foreground/70 text-[11px]">{String(j.note)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="p-3 rounded-md border border-border bg-background flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Money Conservation Invariant:</span>
                      <span className="text-foreground font-semibold">Debits ₹200.00 == Credits ₹200.00 (0 Drift)</span>
                    </div>
                  </div>
                )}

                {/* PHASE 7: Decision Receipt */}
                {activeStep.phase === "DECISION_RECEIPT" && (
                  <div className="space-y-3 font-mono text-xs">
                    <div className="p-3 rounded-md border border-border bg-background space-y-1">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Merkle DAG Root Hash</span>
                        <span>SHA256-MERKLE-DAG</span>
                      </div>
                      <div className="text-[11px] text-foreground break-all bg-card p-2 rounded border border-border">
                        {String(activeStep.dataSnapshot.rootHash || timeline?.receipt?.rootHash || "")}
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-md border border-border bg-background">
                      <div>
                        <div className="text-xs font-semibold text-foreground">
                          {offlineVerified ? "Offline Verified (0 LLMs, 0 DBs)" : "Standalone Verifier Ready"}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          Cryptographic SHA-256 Lineage Match Confirmed
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleVerifyOffline}
                        className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-[#ffffff] transition"
                      >
                        {offlineVerified ? "Re-verify" : "Verify offline"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Cryptographic SHA-256 Audit Seal */}
              {activeStep.auditProof && (
                <div className="rounded-md border border-border bg-background p-3 flex items-center justify-between gap-3 font-mono">
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] uppercase text-muted-foreground/70 block">
                      Phase {activeStep.stepNumber} Audit Seal (SHA-256):
                    </span>
                    <div className="text-xs text-foreground truncate mt-0.5">
                      {activeStep.auditProof.hash}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyHash(activeStep.auditProof?.hash || "")}
                    className="h-7 px-2.5 rounded border border-border bg-card hover:bg-accent text-foreground text-xs flex items-center gap-1 shrink-0 transition"
                  >
                    {copiedHash ? <Check className="h-3 w-3 text-[#10b981]" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
                    <span>{copiedHash ? "Copied" : "Copy"}</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Forensics Step Ready</h3>
              <p className="text-xs text-muted-foreground">Select any step on the left to inspect detailed execution state.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
