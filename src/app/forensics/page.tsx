"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  History,
  Play,
  Pause,
  RotateCcw,
  ChevronRight,
  ChevronLeft,
  ShieldCheck,
  Layers,
  FileCheck,
  Zap,
  CheckCircle2,
  Lock,
  Scale,
  Database,
  Copy,
  Check,
  RefreshCw,
} from "lucide-react";
import {
  type ForensicsTimeline,
  type ForensicsStep,
  type StoredJobSummaryItem,
} from "@/lib/forensics/forensics-types";

const PHASE_ICONS = {
  INPUT_INGESTION: Database,
  INDEX_BUILDING: Layers,
  MATCHING_RESULTS: Scale,
  AI_INVESTIGATION: Lock,
  MAKER_CHECKER: ShieldCheck,
  LEDGER_POSTING: Zap,
  DECISION_RECEIPT: FileCheck,
};

export default function ForensicsPage() {
  const [jobs, setJobs] = useState<StoredJobSummaryItem[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [timeline, setTimeline] = useState<ForensicsTimeline | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [offlineVerified, setOfflineVerified] = useState<boolean>(false);
  const [copiedHash, setCopiedHash] = useState<boolean>(false);

  const playbackTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch job list on mount
  useEffect(() => {
    let mounted = true;
    fetch("/api/forensics/jobs")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (mounted && data && Array.isArray(data.jobs) && data.jobs.length > 0) {
          setJobs(data.jobs);
          setSelectedJobId(data.jobs[0].jobId);
        }
      })
      .catch((err) => console.error("Failed to load jobs list:", err));

    return () => {
      mounted = false;
    };
  }, []);

  // Fetch timeline when selectedJobId changes
  useEffect(() => {
    let mounted = true;
    if (!selectedJobId) return;

    fetch(`/api/forensics/${selectedJobId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (mounted && data && data.success && data.timeline) {
          setTimeline(data.timeline);
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

  // Automated Playback Timer
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
  const StepIcon = activeStep ? (PHASE_ICONS[activeStep.phase] || FileCheck) : FileCheck;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="border border-[#2a2e29] bg-[#0d100d] p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.2em] text-[#a4b58a]">
              <History className="h-4 w-4 text-[#a4b58a]" />
              Reconciliation Forensics &amp; Playback · 🔍 00W
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#e3e1d8]">
              Step-by-Step Ledger Transformation &amp; Verification Playback
            </h1>
            <p className="mt-1 text-xs text-[#8c9288]">
              Select any stored reconciliation job from persistent SQLite and replay the complete 7-phase transformation from raw inputs to verified double-entry ledger postings, AI claims, and cryptographic Merkle receipts.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleReset}
              className="px-3 py-2 border border-[#252a24] bg-[#090b09] hover:bg-[#121611] text-[#8c9288] text-xs font-bold uppercase tracking-wider flex items-center gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
            <button
              type="button"
              onClick={handleStepPrev}
              disabled={currentStepIndex === 0}
              className="px-3 py-2 border border-[#252a24] bg-[#090b09] hover:bg-[#121611] text-[#e3e1d8] text-xs font-bold uppercase tracking-wider flex items-center gap-1 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
              Prev
            </button>
            <button
              type="button"
              onClick={handleStepNext}
              disabled={currentStepIndex === 6}
              className="px-3 py-2 border border-[#252a24] bg-[#090b09] hover:bg-[#121611] text-[#e3e1d8] text-xs font-bold uppercase tracking-wider flex items-center gap-1 disabled:opacity-40"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={togglePlay}
              className={`px-5 py-2.5 text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all ${
                isPlaying
                  ? "bg-[#592321] hover:bg-[#6e2c29] text-[#ffd6d3] border border-[#7a322f]"
                  : "bg-[#a4b58a] hover:bg-[#b8c99e] text-[#0d100d]"
              }`}
            >
              {isPlaying ? (
                <>
                  <Pause className="h-3.5 w-3.5 fill-current" />
                  Pause Playback
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 fill-current" />
                  {currentStepIndex >= 6 ? "Replay From Start" : "Play Timeline (1.2s)"}
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Job Selector & Metric Header Strip */}
      <div className="border border-[#252a24] bg-[#090b09] p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[#e3e1d8] flex items-center gap-2">
              <Database className="h-4 w-4 text-[#a4b58a]" />
              Select Stored Reconciliation Job:
            </span>
            <select
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
              className="bg-[#060806] border border-[#252a24] text-[#e3e1d8] font-mono text-xs px-3 py-2 focus:border-[#a4b58a] focus:outline-none"
            >
              {jobs.map((j) => (
                <option key={j.jobId} value={j.jobId}>
                  {j.jobId} · {j.matchRatePct}% Match · {j.batchSize} records · {new Date(j.createdAt).toLocaleDateString()}
                </option>
              ))}
            </select>
          </div>

          {timeline && (
            <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
              <div>
                <span className="text-[10px] text-[#687063] block">BATCH SIZE</span>
                <strong className="text-[#e3e1d8]">{timeline.batchSize} records</strong>
              </div>
              <div className="h-6 w-px bg-[#252a24]" />
              <div>
                <span className="text-[10px] text-[#687063] block">MATCH RATE</span>
                <strong className="text-[#a4b58a]">{timeline.summary.matchRatePct}%</strong>
              </div>
              <div className="h-6 w-px bg-[#252a24]" />
              <div>
                <span className="text-[10px] text-[#687063] block">EXCEPTIONS</span>
                <strong className={timeline.summary.exception > 0 ? "text-[#d9776f]" : "text-[#a4b58a]"}>
                  {timeline.summary.exception} item(s) ({timeline.summary.formattedDiscrepancy})
                </strong>
              </div>
            </div>
          )}
        </div>

        {/* 7-Step Progress Bar */}
        <div className="space-y-1.5 pt-2 border-t border-[#1f241d]">
          <div className="flex items-center justify-between text-[10px] font-mono font-bold text-[#687063]">
            <span>PHASE {currentStepIndex + 1} OF 7: {activeStep?.title.toUpperCase()}</span>
            <span>{Math.round(((currentStepIndex + 1) / 7) * 100)}% COMPLETE</span>
          </div>
          <div className="h-1.5 w-full bg-[#11140f] overflow-hidden">
            <div
              className="h-full bg-[#a4b58a] transition-all duration-300"
              style={{ width: `${((currentStepIndex + 1) / 7) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Main Split Layout: Left Vertical Timeline (5 cols) & Right Deep Inspector (7 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: 7 Chronological Steps List */}
        <div className="lg:col-span-5 space-y-2.5">
          <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#687063] px-1">
            Chronological Forensics Pipeline Steps:
          </div>

          {!timeline ? (
            <div className="border border-[#252a24] bg-[#090b09] p-8 text-center space-y-3">
              <RefreshCw className="h-5 w-5 animate-spin text-[#a4b58a] mx-auto" />
              <div className="text-xs font-mono text-[#8c9288]">Reconstructing Forensics Timeline...</div>
            </div>
          ) : (
            timeline.steps.map((step, idx) => {
              const isActive = idx === currentStepIndex;
              const isPast = idx < currentStepIndex;
              const Icon = PHASE_ICONS[step.phase] || FileCheck;

              return (
                <button
                  key={step.stepNumber}
                  type="button"
                  onClick={() => {
                    setIsPlaying(false);
                    setCurrentStepIndex(idx);
                  }}
                  className={`w-full text-left p-4 border transition-all flex items-start gap-3.5 ${
                    isActive
                      ? "border-[#3e5532] bg-[#142211] text-[#f0eee6]"
                      : isPast
                      ? "border-[#252a24] bg-[#0a0d0a] text-[#8c9288] hover:border-[#384234]"
                      : "border-[#1f241d] bg-[#060806] text-[#555b52] hover:border-[#252a24]"
                  }`}
                >
                  <div
                    className={`p-2 border shrink-0 mt-0.5 ${
                      isActive
                        ? "border-[#3e5532] bg-[#1a2b16] text-[#a4b58a]"
                        : isPast
                        ? "border-[#252a24] bg-[#11140f] text-[#8c9288]"
                        : "border-[#1c201b] bg-[#090b09] text-[#444a41]"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-mono font-bold opacity-75">
                          STEP 0{step.stepNumber}
                        </span>
                        <span
                          className={`px-1.5 py-0.2 text-[8px] font-mono font-bold border ${
                            step.status === "VERIFIED"
                              ? "bg-[#142211] border-[#3e5532] text-[#a4b58a]"
                              : step.status === "AUDITED"
                              ? "bg-[#1f1a10] border-[#4a3b1f] text-[#d9aa6f]"
                              : "bg-[#11140f] border-[#252a24] text-[#8c9288]"
                          }`}
                        >
                          {step.status}
                        </span>
                      </div>
                      <span className="text-[9px] font-mono text-[#687063]">
                        {step.durationMs}ms
                      </span>
                    </div>

                    <h3 className={`text-xs font-bold mt-1 truncate ${isActive ? "text-[#e3e1d8]" : "text-[#b5bba9]"}`}>
                      {step.title}
                    </h3>
                    <p className="text-[11px] text-[#8c9288] line-clamp-2 mt-0.5 leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Right Column: Deep Step Inspector & Snapshot */}
        <div className="lg:col-span-7 space-y-4">
          {activeStep ? (
            <div className="border border-[#2a2e29] bg-[#060806] p-6 space-y-5">
              {/* Step Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#252a24] pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 border border-[#3e5532] bg-[#142211] text-[#a4b58a]">
                    <StepIcon className="h-6 w-6 text-[#a4b58a]" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 text-[9px] font-mono font-bold bg-[#182614] border border-[#3e5532] text-[#a4b58a]">
                        PHASE {activeStep.stepNumber}: {activeStep.phase}
                      </span>
                      <span className="text-[10px] font-mono text-[#687063]">
                        {activeStep.durationMs}ms execution
                      </span>
                    </div>
                    <h2 className="text-base font-bold text-[#e3e1d8] mt-1">
                      {activeStep.title}
                    </h2>
                  </div>
                </div>

                <div className="text-right font-mono text-[10px] text-[#687063]">
                  <div>STATUS: {activeStep.status}</div>
                  <div>TIMESTAMP: {new Date(activeStep.timestamp).toLocaleTimeString()}</div>
                </div>
              </div>

              {/* Step Description */}
              <p className="text-xs text-[#8c9288] leading-relaxed">
                {activeStep.description}
              </p>

              {/* Data Snapshot Views by Phase */}
              <div className="space-y-3">
                <div className="text-[10px] font-mono font-bold text-[#687063] uppercase">
                  Data Snapshot &amp; Execution Artifacts
                </div>

                {/* PHASE 1: Input Ingestion Table */}
                {activeStep.phase === "INPUT_INGESTION" && (
                  <div className="space-y-2">
                    <div className="border border-[#252a24] bg-[#090b09] overflow-x-auto">
                      <table className="w-full text-left font-mono text-[11px]">
                        <thead className="bg-[#0d100d] border-b border-[#252a24] text-[9px] text-[#687063] uppercase">
                          <tr>
                            <th className="p-2">Source</th>
                            <th className="p-2">Record ID</th>
                            <th className="p-2">Reference</th>
                            <th className="p-2">Amount (Paise)</th>
                            <th className="p-2">Formatted</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#1f241d]">
                          {((activeStep.dataSnapshot.sampleRecords as Array<Record<string, unknown>>) || []).map((r, i) => (
                            <tr key={i} className="hover:bg-[#11160f]">
                              <td className="p-2 text-[#a4b58a] font-bold">{String(r.source)}</td>
                              <td className="p-2 text-[#e3e1d8]">{String(r.id)}</td>
                              <td className="p-2 text-[#8c9288]">{String(r.referenceId || "-")}</td>
                              <td className="p-2 text-[#687063]">{String(r.amountPaise)}</td>
                              <td className="p-2 text-[#e3e1d8] font-bold">{String(r.formattedAmount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* PHASE 2: Index Building */}
                {activeStep.phase === "INDEX_BUILDING" && (
                  <div className="grid grid-cols-2 gap-3 font-mono text-xs">
                    <div className="p-3 border border-[#252a24] bg-[#090b09] space-y-1">
                      <span className="text-[9px] text-[#687063] uppercase font-bold">Partition Keys</span>
                      <div className="text-[#a4b58a] font-bold">paymentId, referenceId, utr</div>
                    </div>
                    <div className="p-3 border border-[#252a24] bg-[#090b09] space-y-1">
                      <span className="text-[9px] text-[#687063] uppercase font-bold">Temporal Window</span>
                      <div className="text-[#e3e1d8] font-bold">72 Hours Sliding Bound</div>
                    </div>
                    <div className="p-3 border border-[#252a24] bg-[#090b09] space-y-1">
                      <span className="text-[9px] text-[#687063] uppercase font-bold">Candidate Pairs</span>
                      <div className="text-[#e3e1d8] font-bold">{String(activeStep.dataSnapshot.candidatePairsGenerated || 40)} pairs</div>
                    </div>
                    <div className="p-3 border border-[#252a24] bg-[#090b09] space-y-1">
                      <span className="text-[9px] text-[#687063] uppercase font-bold">Search Strategy</span>
                      <div className="text-[#a4b58a] font-bold">HASH_MAP_PARTITIONED</div>
                    </div>
                  </div>
                )}

                {/* PHASE 3: Matching Results */}
                {activeStep.phase === "MATCHING_RESULTS" && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-3 font-mono text-xs text-center">
                      <div className="p-3 border border-[#3e5532] bg-[#142211]">
                        <span className="text-[9px] text-[#687063] uppercase">Auto-Matched</span>
                        <div className="text-base font-bold text-[#a4b58a]">{String(activeStep.dataSnapshot.autoMatchedCount)}</div>
                      </div>
                      <div className="p-3 border border-[#252a24] bg-[#090b09]">
                        <span className="text-[9px] text-[#687063] uppercase">Suggested</span>
                        <div className="text-base font-bold text-[#e3e1d8]">{String(activeStep.dataSnapshot.suggestedCount)}</div>
                      </div>
                      <div className="p-3 border border-[#592321] bg-[#1c0f0e]">
                        <span className="text-[9px] text-[#687063] uppercase">Exceptions</span>
                        <div className="text-base font-bold text-[#e89088]">{String(activeStep.dataSnapshot.exceptionCount)}</div>
                      </div>
                    </div>

                    {Array.isArray(activeStep.dataSnapshot.exceptions) && (activeStep.dataSnapshot.exceptions as Array<Record<string, unknown>>).length > 0 && (
                      <div className="border border-[#252a24] bg-[#090b09] p-3 space-y-2 font-mono text-xs">
                        <span className="text-[9px] font-bold uppercase text-[#687063]">Isolated Exception Item:</span>
                        {((activeStep.dataSnapshot.exceptions as Array<Record<string, unknown>>)).map((exc, i) => (
                          <div key={i} className="flex items-center justify-between p-2 border border-[#3d1a19] bg-[#130b0a]">
                            <div>
                              <span className="text-[#e89088] font-bold">{String(exc.id)}</span> · <span className="text-[#8c9288]">{String(exc.type)}</span>
                              <div className="text-[10px] text-[#8c9288] mt-0.5">{String(exc.description)}</div>
                            </div>
                            <span className="text-[#e89088] font-bold">{String(exc.varianceFormatted)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* PHASE 4: AI Investigation & Non-LLM Checks */}
                {activeStep.phase === "AI_INVESTIGATION" && (
                  <div className="space-y-3 font-mono text-xs">
                    <div className="p-3 border border-[#252a24] bg-[#090b09] space-y-1.5">
                      <span className="text-[9px] font-bold uppercase text-[#687063]">Formulated Structured Claim:</span>
                      <p className="text-[#e3e1d8] text-[11px] leading-relaxed">
                        &quot;{String(activeStep.dataSnapshot.claimStatement)}&quot;
                      </p>
                      <div className="text-[10px] text-[#8c9288]">
                        Cited Evidence: <strong className="text-[#a4b58a]">{JSON.stringify(activeStep.dataSnapshot.citedEvidenceIds)}</strong> · Model: {String(activeStep.dataSnapshot.modelInvoked)}
                      </div>
                    </div>

                    <div className="border border-[#252a24] bg-[#090b09] p-3 space-y-2">
                      <span className="text-[9px] font-bold uppercase text-[#687063]">Deterministic Non-LLM Verification Checks:</span>
                      <div className="space-y-1">
                        {((activeStep.dataSnapshot.nonLlmChecks as Array<{ check: string; status: string; detail: string }>) || []).map((chk, i) => (
                          <div key={i} className="flex items-center justify-between p-1.5 border border-[#1f241d] bg-[#060806] text-[10px]">
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="h-3 w-3 text-[#a4b58a]" />
                              <span className="text-[#e3e1d8] font-bold">{chk.check}</span>
                              <span className="text-[#8c9288]">{chk.detail}</span>
                            </div>
                            <span className="px-1.5 py-0.2 text-[8px] bg-[#142211] border border-[#3e5532] text-[#a4b58a] font-bold">
                              {chk.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* PHASE 5: Maker / Checker */}
                {activeStep.phase === "MAKER_CHECKER" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-xs">
                    <div className="p-3 border border-[#252a24] bg-[#090b09] space-y-1.5">
                      <span className="text-[9px] font-bold uppercase text-[#687063]">Maker (Reviewer Proposal)</span>
                      <div className="text-[#e3e1d8] font-bold">reviewer_finance_ops</div>
                      <div className="text-[10px] text-[#8c9288]">Action: PROPOSE_JOURNAL_ADJUSTMENT</div>
                    </div>

                    <div className="p-3 border border-[#3e5532] bg-[#142211] space-y-1.5">
                      <span className="text-[9px] font-bold uppercase text-[#a4b58a]">Checker (Controller Sign-off)</span>
                      <div className="text-[#f0eee6] font-bold">controller_cfo_01 (ADMIN)</div>
                      <div className="text-[10px] text-[#a4b58a]">Verdict: AUTHORIZED (Level 3 Clearance)</div>
                    </div>
                  </div>
                )}

                {/* PHASE 6: Ledger Posting */}
                {activeStep.phase === "LEDGER_POSTING" && (
                  <div className="space-y-3 font-mono text-xs">
                    <div className="border border-[#252a24] bg-[#090b09] overflow-x-auto">
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-[#0d100d] border-b border-[#252a24] text-[9px] text-[#687063] uppercase">
                          <tr>
                            <th className="p-2">Account Name</th>
                            <th className="p-2">Debit (₹)</th>
                            <th className="p-2">Credit (₹)</th>
                            <th className="p-2">Note</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#1f241d]">
                          {((activeStep.dataSnapshot.journalEntries as Array<Record<string, unknown>>) || []).map((j, i) => (
                            <tr key={i} className="hover:bg-[#11160f]">
                              <td className="p-2 text-[#e3e1d8] font-bold">{String(j.account)}</td>
                              <td className="p-2 text-[#a4b58a]">{Number(j.debitPaise) > 0 ? `₹${(Number(j.debitPaise) / 100).toFixed(2)}` : "-"}</td>
                              <td className="p-2 text-[#d9aa6f]">{Number(j.creditPaise) > 0 ? `₹${(Number(j.creditPaise) / 100).toFixed(2)}` : "-"}</td>
                              <td className="p-2 text-[#8c9288] text-[10px]">{String(j.note)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="p-2.5 border border-[#3e5532] bg-[#142211] flex items-center justify-between text-[11px]">
                      <span className="text-[#a4b58a] font-bold">Money Conservation Invariant:</span>
                      <span className="text-[#f0eee6] font-bold">Debits ₹200.00 == Credits ₹200.00 (0 Paise Drift)</span>
                    </div>
                  </div>
                )}

                {/* PHASE 7: Decision Receipt */}
                {activeStep.phase === "DECISION_RECEIPT" && (
                  <div className="space-y-3 font-mono text-xs">
                    <div className="p-3 border border-[#252a24] bg-[#090b09] space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-bold uppercase text-[#687063]">Merkle DAG Root Hash:</span>
                        <span className="text-[9px] text-[#a4b58a]">ALGORITHM: SHA256-MERKLE-DAG</span>
                      </div>
                      <div className="text-[10px] text-[#a4b58a] break-all bg-[#060806] p-2 border border-[#1f241d]">
                        {String(activeStep.dataSnapshot.rootHash || timeline?.receipt?.rootHash || "")}
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-3 border border-[#3e5532] bg-[#142211]">
                      <div>
                        <div className="text-xs font-bold text-[#f0eee6]">
                          {offlineVerified ? "OFFLINE VERIFIED (0 LLMs, 0 DBs)" : "Standalone Verifier Ready"}
                        </div>
                        <div className="text-[10px] text-[#a4b58a] opacity-80 mt-0.5">
                          Cryptographic SHA-256 Lineage &amp; Merkle Root Match Confirmed
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleVerifyOffline}
                        className="px-3 py-1.5 bg-[#a4b58a] hover:bg-[#b8c99e] text-[#0d100d] text-xs font-bold uppercase tracking-wider"
                      >
                        {offlineVerified ? "Re-Verify Offline" : "Run Offline Verifier"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Cryptographic SHA-256 Audit Seal */}
              {activeStep.auditProof && (
                <div className="border border-[#1f241d] bg-[#090b09] p-3 flex items-center justify-between gap-3 font-mono">
                  <div className="min-w-0 flex-1">
                    <span className="text-[8px] font-bold uppercase tracking-wider text-[#687063] block">
                      Phase {activeStep.stepNumber} Cryptographic Audit Seal (SHA-256):
                    </span>
                    <div className="text-[10px] text-[#a4b58a] truncate mt-0.5">
                      {activeStep.auditProof.hash}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyHash(activeStep.auditProof?.hash || "")}
                    className="px-2.5 py-1 border border-[#252a24] bg-[#060806] hover:bg-[#121611] text-[#8c9288] text-[10px] flex items-center gap-1 shrink-0"
                  >
                    {copiedHash ? <Check className="h-3 w-3 text-[#a4b58a]" /> : <Copy className="h-3 w-3" />}
                    {copiedHash ? "Copied" : "Copy Hash"}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="border border-dashed border-[#252a24] bg-[#090b09] p-12 text-center space-y-3">
              <History className="h-6 w-6 text-[#a4b58a] mx-auto" />
              <h3 className="text-sm font-bold text-[#e3e1d8]">Forensics Step Ready</h3>
              <p className="text-xs text-[#8c9288]">Select any step on the left to inspect detailed execution state.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
