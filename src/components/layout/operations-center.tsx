"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  Activity,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  X,
  ExternalLink,
  Ban,
} from "lucide-react";

import { safeFetch } from "@/lib/api/safe-fetch";

export interface OperationJob {
  jobId: string;
  tenantId?: string;
  type?: string;
  status:
    | "PENDING"
    | "CLAIMED"
    | "PROCESSING"
    | "RUNNING"
    | "CANCEL_REQUESTED"
    | "COMPLETED"
    | "FAILED"
    | "CANCELLED"
    | "STALLED"
    | "RETRY_WAIT"
    | "DEAD_LETTER";
  batchSize: number;
  progressPct: number;
  progressCurrent?: number;
  progressTotal?: number;
  recordsPerSecond?: number;
  estimatedRemainingMs?: number | null;
  recommendedNextChunkSize?: number;
  queuePosition?: number;
  createdAt: string;
  cancelRequestedAt?: string;
  result?: { batchId?: string; size?: number };
  error?: string;
}

export function OperationsCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeJobs, setActiveJobs] = useState<OperationJob[]>([]);
  const [recentJobs, setRecentJobs] = useState<OperationJob[]>([]);
  const [cancellingIds, setCancellingIds] = useState<Set<string>>(new Set());
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inFlightJobIdsRef = useRef<Set<string>>(new Set());
  const adaptiveChunkSizesRef = useRef<Map<string, number>>(new Map());
  const isSteppingRef = useRef<boolean>(false);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // 1. Fetch operations list (Status only — GET /api/batches/jobs)
  const refreshJobs = useCallback(async () => {
    try {
      const res = await safeFetch<{
        activeJobs?: OperationJob[];
        recentJobs?: OperationJob[];
      }>("/api/batches/jobs");

      if (res.ok && res.data) {
        const terminalServerIds = new Set(
          (res.data.recentJobs || [])
            .filter((j) => j.status === "CANCELLED" || j.status === "COMPLETED" || j.status === "FAILED" || j.status === "DEAD_LETTER")
            .map((j) => j.jobId)
        );

        if (res.data.activeJobs) {
          const filteredActive = res.data.activeJobs.filter(
            (j) =>
              (j.status === "PENDING" ||
                j.status === "CLAIMED" ||
                j.status === "PROCESSING" ||
                j.status === "RUNNING" ||
                j.status === "RETRY_WAIT") &&
              !cancellingIds.has(j.jobId) &&
              !terminalServerIds.has(j.jobId)
          );
          setActiveJobs(filteredActive);
        }
        if (res.data.recentJobs) {
          setRecentJobs(res.data.recentJobs);
          // Clean up cancellingIds for jobs that the server now confirms as CANCELLED or terminal
          if (terminalServerIds.size > 0) {
            setCancellingIds((prev) => {
              const next = new Set(prev);
              let changed = false;
              for (const tid of terminalServerIds) {
                if (next.has(tid)) {
                  next.delete(tid);
                  changed = true;
                }
              }
              return changed ? next : prev;
            });
          }
        }
      }
    } catch {
      // Background poll failure is non-blocking
    }
  }, [cancellingIds]);

  // Poll job status periodically and listen to Page Visibility API
  useEffect(() => {
    let mounted = true;
    let pollInterval = 3000;

    const fetchInitial = async () => {
      if (mounted) {
        await refreshJobs();
      }
    };
    void fetchInitial();

    let intervalId = setInterval(() => {
      if (mounted) {
        void refreshJobs();
      }
    }, pollInterval);

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        // Tab restored to focus: immediately refresh authoritative state and restore aggressive poll
        void refreshJobs();
        clearInterval(intervalId);
        pollInterval = 3000;
        intervalId = setInterval(() => {
          if (mounted) void refreshJobs();
        }, pollInterval);
      } else {
        // Tab hidden: back off polling frequency to reduce unnecessary network chatter
        clearInterval(intervalId);
        pollInterval = 10000;
        intervalId = setInterval(() => {
          if (mounted) void refreshJobs();
        }, pollInterval);
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    const handleCustomUpdate = () => {
      if (mounted) void refreshJobs();
    };
    window.addEventListener("operations-updated", handleCustomUpdate);

    return () => {
      mounted = false;
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("operations-updated", handleCustomUpdate);
    };
  }, [refreshJobs]);

  // 2. Bounded Step Executor: continuous automated coordinator with fair round-robin scheduling
  const executeStepCycle = useCallback(async () => {
    if (isSteppingRef.current) return;
    isSteppingRef.current = true;

    try {
      const eligibleJobs = activeJobs.filter(
        (job) =>
          (job.status === "PENDING" ||
            job.status === "CLAIMED" ||
            job.status === "PROCESSING" ||
            job.status === "RUNNING" ||
            job.status === "RETRY_WAIT") &&
          !cancellingIds.has(job.jobId) &&
          !inFlightJobIdsRef.current.has(job.jobId)
      );

      if (eligibleJobs.length === 0) return;

      for (const job of eligibleJobs) {
        if (cancellingIds.has(job.jobId) || inFlightJobIdsRef.current.has(job.jobId)) {
          continue;
        }

        // Mark job as in-flight
        inFlightJobIdsRef.current.add(job.jobId);
        const nextChunkSize = adaptiveChunkSizesRef.current.get(job.jobId) || 100;

        try {
          const res = await safeFetch<{ job?: OperationJob }>(
            `/api/batches/jobs/${job.jobId}/step`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chunkSize: nextChunkSize }),
            }
          );

          if (res.ok && res.data?.job) {
            const updated = res.data.job;
            if (updated.recommendedNextChunkSize) {
              adaptiveChunkSizesRef.current.set(job.jobId, updated.recommendedNextChunkSize);
            }

            if (updated.status === "CANCELLED" || updated.status === "CANCEL_REQUESTED" || updated.status === "COMPLETED" || updated.status === "FAILED") {
              setActiveJobs((prev) => prev.filter((j) => j.jobId !== updated.jobId));
              setRecentJobs((prev) => {
                const exists = prev.some((j) => j.jobId === updated.jobId);
                return exists
                  ? prev.map((j) => (j.jobId === updated.jobId ? { ...j, ...updated } : j))
                  : [updated, ...prev];
              });
            } else {
              setActiveJobs((prev) =>
                prev.map((j) => (j.jobId === updated.jobId ? { ...j, ...updated } : j))
              );
            }
          } else if (!res.ok) {
            if (res.status === 409 || res.status === 404) {
              // Terminal state, cancelled, or not found: remove from active pool immediately
              setActiveJobs((prev) => prev.filter((j) => j.jobId !== job.jobId));
              setCancellingIds((prev) => {
                const next = new Set(prev);
                next.delete(job.jobId);
                return next;
              });
              if (res.data?.job) {
                const updated = res.data.job;
                setRecentJobs((prev) => {
                  const exists = prev.some((j) => j.jobId === updated.jobId);
                  return exists
                    ? prev.map((j) => (j.jobId === updated.jobId ? { ...j, ...updated } : j))
                    : [updated, ...prev];
                });
              }
            }
          }
        } catch {
          // Transient network error handled on next tick
        } finally {
          inFlightJobIdsRef.current.delete(job.jobId);
        }

        // Fair web loop yield delay
        await new Promise((r) => setTimeout(r, 100));
      }
    } finally {
      isSteppingRef.current = false;
    }
  }, [activeJobs, cancellingIds]);

  // Trigger automated stepping whenever active jobs are eligible
  useEffect(() => {
    const hasEligibleJobs = activeJobs.some(
      (job) =>
        (job.status === "PENDING" ||
          job.status === "CLAIMED" ||
          job.status === "PROCESSING" ||
          job.status === "RUNNING" ||
          job.status === "RETRY_WAIT") &&
        !cancellingIds.has(job.jobId)
    );

    if (!hasEligibleJobs) return;

    const timer = setTimeout(() => {
      void executeStepCycle();
    }, 150);

    return () => {
      clearTimeout(timer);
    };
  }, [activeJobs, cancellingIds, executeStepCycle]);

  // 3. Request job cancellation (Idempotent & immediate UI reflection)
  const handleCancel = async (jobId: string) => {
    // Immediately mark as cancelling in UI and exclude from stepping
    setCancellingIds((prev) => new Set(prev).add(jobId));

    // Optimistically transition status to CANCEL_REQUESTED
    setActiveJobs((prev) => prev.filter((j) => j.jobId !== jobId));
    setRecentJobs((prev) =>
      prev.map((j) => (j.jobId === jobId ? { ...j, status: "CANCEL_REQUESTED" } : j))
    );

    try {
      const res = await safeFetch<{ success?: boolean; status?: string; jobId?: string; cancelRequestedAt?: string }>(
        `/api/batches/jobs/${jobId}/cancel`,
        { method: "POST" }
      );
      if (res.ok && res.data) {
        if (res.data.status === "CANCELLED") {
          setCancellingIds((prev) => {
            const next = new Set(prev);
            next.delete(jobId);
            return next;
          });
          setRecentJobs((prev) =>
            prev.map((j) => (j.jobId === jobId ? { ...j, status: "CANCELLED", cancelRequestedAt: res.data?.cancelRequestedAt || j.cancelRequestedAt } : j))
          );
        }
      }
      await refreshJobs();
    } catch {
      // Server cancellation error handled on next poll
    }
  };

  const totalActive = activeJobs.filter(
    (j) =>
      (j.status === "PENDING" ||
        j.status === "CLAIMED" ||
        j.status === "PROCESSING" ||
        j.status === "RUNNING" ||
        j.status === "RETRY_WAIT") &&
      !cancellingIds.has(j.jobId)
  ).length;

  const displayList = [
    ...activeJobs,
    ...recentJobs.filter((r) => !activeJobs.some((a) => a.jobId === r.jobId)),
  ].slice(0, 8);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex h-9 sm:h-10 items-center gap-2 rounded-lg border px-2.5 sm:px-3 text-xs font-medium transition shadow-2xs cursor-pointer ${
          totalActive > 0
            ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20"
            : "border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent"
        }`}
        aria-label="Operations Center"
        title="Durable background operations and step execution"
      >
        {totalActive > 0 ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500 shrink-0" />
        ) : (
          <Activity className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
        <span className="hidden sm:inline font-sans">Operations</span>
        {totalActive > 0 && (
          <span className="rounded-full bg-amber-500/20 px-1.5 py-0.2 text-[10px] font-mono font-bold text-amber-600 dark:text-amber-300">
            {totalActive}
          </span>
        )}
        <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {/* Operations Center Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border border-border bg-popover/95 p-3 text-popover-foreground shadow-xl backdrop-blur-md z-50 animate-in fade-in-50 zoom-in-95">
          <div className="flex items-center justify-between border-b border-border pb-2 px-1">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-xs text-foreground tracking-tight">Operations Center</h3>
              {totalActive > 0 && (
                <span className="rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-mono text-amber-500">
                  {totalActive} active
                </span>
              )}
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-muted-foreground hover:text-foreground p-0.5 rounded"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-2 space-y-2 max-h-80 overflow-y-auto pr-1 text-xs">
            {displayList.length === 0 ? (
              <div className="py-6 text-center text-muted-foreground text-xs">
                No active or recent operations.
              </div>
            ) : (
              displayList.map((job) => {
                const isCancelling = cancellingIds.has(job.jobId) || job.status === "CANCEL_REQUESTED";
                const isCancelled = job.status === "CANCELLED";
                const isProcessing =
                  (job.status === "PENDING" ||
                    job.status === "CLAIMED" ||
                    job.status === "PROCESSING" ||
                    job.status === "RUNNING" ||
                    job.status === "RETRY_WAIT") &&
                  !isCancelling;
                const isCompleted = job.status === "COMPLETED";
                const isFailed = job.status === "FAILED" || job.status === "STALLED" || job.status === "DEAD_LETTER";
                const batchId = job.result?.batchId;

                return (
                  <div
                    key={job.jobId}
                    className="rounded-lg border border-border/80 bg-card/60 p-2.5 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 font-medium text-foreground">
                        {isProcessing && <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />}
                        {isCancelling && <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />}
                        {isCompleted && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                        {isCancelled && <Ban className="h-3.5 w-3.5 text-muted-foreground" />}
                        {isFailed && <XCircle className="h-3.5 w-3.5 text-rose-500" />}
                        <span>Generate {(job.batchSize || job.progressTotal || 250).toLocaleString()} records</span>
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {isCancelling
                          ? "⏹ Cancelling…"
                          : isCancelled
                          ? "⏹ Cancelled"
                          : job.queuePosition && job.queuePosition > 1
                          ? `Queued · Pos ${job.queuePosition}`
                          : isProcessing
                          ? `${job.progressPct}%`
                          : job.status}
                      </span>
                    </div>

                    {/* Progress Bar & Telemetry for active operations */}
                    {(isProcessing || isCancelling) && (
                      <div className="space-y-1">
                        <div className="w-full bg-secondary rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-amber-500 h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${Math.max(5, job.progressPct)}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground pt-0.5">
                          <span>
                            {(job.progressCurrent ?? 0).toLocaleString()} / {(job.batchSize || job.progressTotal || 250).toLocaleString()} recs
                          </span>
                          {job.recordsPerSecond ? (
                            <span>{job.recordsPerSecond.toLocaleString()} rec/s</span>
                          ) : null}
                          {job.estimatedRemainingMs ? (
                            <span>ETA ~{Math.ceil(job.estimatedRemainingMs / 1000)}s</span>
                          ) : isProcessing && (job.progressCurrent ?? 0) === 0 ? (
                            <span>calculating ETA…</span>
                          ) : null}
                        </div>
                      </div>
                    )}

                    {/* Cancelled records info */}
                    {isCancelled && (
                      <div className="text-[10px] text-muted-foreground font-mono">
                        {(job.progressCurrent ?? 0).toLocaleString()} / {(job.batchSize || job.progressTotal || 0).toLocaleString()} records completed before cancellation
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center justify-between text-[11px] pt-1">
                      <span className="text-muted-foreground text-[10px]">
                        {new Date(job.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <div className="flex items-center gap-2">
                        {isProcessing && (
                          <button
                            type="button"
                            onClick={() => handleCancel(job.jobId)}
                            className="rounded px-2 py-0.5 text-rose-500 hover:bg-rose-500/10 font-medium transition cursor-pointer"
                          >
                            Cancel
                          </button>
                        )}
                        {isCancelling && (
                          <span className="text-[10px] text-amber-500/90 font-medium italic">
                            Cancellation requested…
                          </span>
                        )}
                        {isCompleted && batchId && (
                          <Link
                            href={`/exceptions?batchId=${batchId}`}
                            onClick={() => setIsOpen(false)}
                            className="flex items-center gap-1 text-primary hover:underline font-medium"
                          >
                            Open batch <ExternalLink className="h-2.5 w-2.5" />
                          </Link>
                        )}
                        <Link
                          href="/demo"
                          onClick={() => setIsOpen(false)}
                          className="text-muted-foreground hover:text-foreground font-medium"
                        >
                          View in Lab
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="mt-2.5 pt-2 border-t border-border flex items-center justify-between text-[10px] text-muted-foreground px-1">
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Durable Operations Active
            </span>
            <Link
              href="/demo"
              onClick={() => setIsOpen(false)}
              className="text-primary hover:underline"
            >
              Scale Lab
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
