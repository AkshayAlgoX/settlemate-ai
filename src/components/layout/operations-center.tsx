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
  status: "PENDING" | "PROCESSING" | "RUNNING" | "CANCEL_REQUESTED" | "COMPLETED" | "FAILED" | "CANCELLED" | "STALLED" | "DEAD_LETTER";
  batchSize: number;
  progressPct: number;
  progressCurrent?: number;
  progressTotal?: number;
  createdAt: string;
  cancelRequestedAt?: string;
  result?: { batchId?: string; size?: number };
  error?: string;
}

export function OperationsCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeJobs, setActiveJobs] = useState<OperationJob[]>([]);
  const [recentJobs, setRecentJobs] = useState<OperationJob[]>([]);
  const [isStepping, setIsStepping] = useState(false);
  const [cancellingIds, setCancellingIds] = useState<Set<string>>(new Set());
  const dropdownRef = useRef<HTMLDivElement>(null);

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
        if (res.data.activeJobs) {
          // Filter out any jobs that are currently cancelling or cancelled
          const filteredActive = res.data.activeJobs.filter(
            (j) =>
              (j.status === "PENDING" || j.status === "PROCESSING" || j.status === "RUNNING") &&
              !cancellingIds.has(j.jobId)
          );
          setActiveJobs(filteredActive);
        }
        if (res.data.recentJobs) {
          setRecentJobs(res.data.recentJobs);
          // Clean up cancellingIds for jobs that the server now confirms as CANCELLED or terminal
          const terminalServerIds = res.data.recentJobs
            .filter((j) => j.status === "CANCELLED" || j.status === "COMPLETED" || j.status === "FAILED")
            .map((j) => j.jobId);
          if (terminalServerIds.length > 0) {
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

  // Poll job status periodically
  useEffect(() => {
    let mounted = true;
    const fetchInitial = async () => {
      if (mounted) {
        await refreshJobs();
      }
    };
    void fetchInitial();
    const interval = setInterval(() => {
      if (mounted) {
        void refreshJobs();
      }
    }, 3000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [refreshJobs]);

  // 2. Bounded Step Executor: drives fair scheduling strictly across active non-cancelled jobs
  useEffect(() => {
    // Only schedule if activeJobs has valid eligible jobs and not currently stepping
    const eligibleJobs = activeJobs.filter(
      (job) =>
        (job.status === "PENDING" || job.status === "PROCESSING" || job.status === "RUNNING") &&
        !cancellingIds.has(job.jobId)
    );

    if (eligibleJobs.length === 0 || isStepping) return;

    let isMounted = true;

    async function stepActiveJobs() {
      setIsStepping(true);
      try {
        // Fair scheduling: step each eligible active job in round-robin sequence
        for (const job of eligibleJobs) {
          if (!isMounted) break;

          // Re-verify cancellation check before issuing step call
          if (cancellingIds.has(job.jobId)) {
            continue;
          }

          try {
            const res = await safeFetch<{ job?: OperationJob }>(
              `/api/batches/jobs/${job.jobId}/step`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chunkSize: 100 }),
              }
            );

            if (isMounted) {
              if (res.ok && res.data?.job) {
                const updated = res.data.job;
                if (updated.status === "CANCELLED" || updated.status === "CANCEL_REQUESTED") {
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
                // If 409 conflict or job cancelled on server, remove from active pool
                setActiveJobs((prev) => prev.filter((j) => j.jobId !== job.jobId));
              }
            }
          } catch {
            // Step error handled on next poll
          }

          // Small inter-step delay for fair web loop yield
          await new Promise((r) => setTimeout(r, 200));
        }
      } finally {
        if (isMounted) {
          setIsStepping(false);
          void refreshJobs();
        }
      }
    }

    const timer = setTimeout(stepActiveJobs, 1000);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [activeJobs, isStepping, refreshJobs, cancellingIds]);

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
      await safeFetch(`/api/batches/jobs/${jobId}/cancel`, { method: "POST" });
      await refreshJobs();
    } catch {
      // Server cancellation error handled on next poll
    }
  };

  const totalActive = activeJobs.filter(
    (j) =>
      (j.status === "PENDING" || j.status === "PROCESSING" || j.status === "RUNNING") &&
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
                  (job.status === "PENDING" || job.status === "PROCESSING" || job.status === "RUNNING") &&
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
                          : isProcessing
                          ? `${job.progressPct}%`
                          : job.status}
                      </span>
                    </div>

                    {/* Progress Bar for active operations */}
                    {(isProcessing || isCancelling) && (
                      <div className="w-full bg-secondary rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-amber-500 h-1.5 rounded-full transition-all duration-300"
                          style={{ width: `${Math.max(5, job.progressPct)}%` }}
                        />
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
