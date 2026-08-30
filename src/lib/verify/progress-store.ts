/*
 * SettleMate AI — Verification Hub Persistent Progress Store
 */

import { randomUUID } from "node:crypto";
import {
  UnifiedProgressRepository as VerifyProgressRepository,
  type UnifiedVerifyProgressJob as StoredVerifyProgressJob,
} from "@/lib/storage/unified-store";

export interface SuiteProgress {
  suiteId: string;
  name: string;
  command: string;
  status: "PENDING" | "RUNNING" | "PASS" | "FAIL";
  progressPct: number;
  durationMs?: number;
  metrics?: Record<string, string | number>;
  rawOutputSnippet?: string;
  error?: string;
}

export interface VerifyJobState {
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
  results: Record<string, SuiteProgress>;
}

const SUITE_METADATA: Record<string, { name: string; command: string }> = {
  benchmark: { name: "Official 250-Record Benchmark", command: "npm run evaluate" },
  cardinality: { name: "Cardinality Solver Topologies (8/8)", command: "npx tsx scripts/evaluate-cardinality.ts" },
  "claim-validator": { name: "AI Claim Falsification (134k claims/s)", command: "npx tsx scripts/benchmark-claim-verification.ts" },
  "cross-partition": { name: "Cross-Partition Scale (149k pairs/s)", command: "npx tsx scripts/benchmark-cross-partition-scale.ts" },
  chaos: { name: "100k Streaming Chaos Recovery (100%)", command: "npx tsx scripts/benchmark-100k-chaos.ts" },
  receipt: { name: "Decision Receipt Standalone Verifier", command: "npm run verify:demo" },
  "finance-ops": { name: "Track 04 AI Finance-Ops Loop (55 Rec)", command: "npx tsx scripts/benchmark-finance-ops-loop.ts" },
};

function stateToStored(job: VerifyJobState): StoredVerifyProgressJob {
  return {
    jobId: job.jobId,
    status: job.status,
    requestedSuites: JSON.stringify(job.requestedSuites),
    totalSuites: job.totalSuites,
    completedSuites: job.completedSuites,
    overallProgressPct: job.overallProgressPct,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    totalDurationMs: job.totalDurationMs,
    allPassed: job.allPassed !== undefined ? (job.allPassed ? 1 : 0) : undefined,
    results: JSON.stringify(job.results),
  };
}

function storedToState(stored: StoredVerifyProgressJob): VerifyJobState {
  return {
    jobId: stored.jobId,
    status: stored.status,
    requestedSuites: JSON.parse(stored.requestedSuites),
    totalSuites: stored.totalSuites,
    completedSuites: stored.completedSuites,
    overallProgressPct: stored.overallProgressPct,
    startedAt: stored.startedAt,
    completedAt: stored.completedAt,
    totalDurationMs: stored.totalDurationMs,
    allPassed: stored.allPassed !== undefined ? stored.allPassed === 1 : undefined,
    results: JSON.parse(stored.results),
  };
}

class VerifyProgressStore {
  createJob(requestedSuites: string[]): VerifyJobState {
    const jobId = `verify_${randomUUID().slice(0, 10)}`;
    const results: Record<string, SuiteProgress> = {};

    for (const suiteId of requestedSuites) {
      const meta = SUITE_METADATA[suiteId] || { name: suiteId, command: `run ${suiteId}` };
      results[suiteId] = {
        suiteId,
        name: meta.name,
        command: meta.command,
        status: "PENDING",
        progressPct: 0,
      };
    }

    const job: VerifyJobState = {
      jobId,
      status: "RUNNING",
      requestedSuites,
      totalSuites: requestedSuites.length,
      completedSuites: 0,
      overallProgressPct: 0,
      startedAt: new Date().toISOString(),
      results,
    };

    VerifyProgressRepository.save(stateToStored(job));
    return job;
  }

  getJob(jobId: string): VerifyJobState | undefined {
    const stored = VerifyProgressRepository.get(jobId);
    if (!stored) return undefined;
    return storedToState(stored);
  }

  setSuiteRunning(jobId: string, suiteId: string): void {
    const job = this.getJob(jobId);
    if (!job || !job.results[suiteId]) return;

    job.results[suiteId].status = "RUNNING";
    job.results[suiteId].progressPct = 50;

    VerifyProgressRepository.save(stateToStored(job));
  }

  setSuiteCompleted(
    jobId: string,
    suiteId: string,
    data: {
      status: "PASS" | "FAIL";
      durationMs: number;
      metrics: Record<string, string | number>;
      rawOutputSnippet: string;
    }
  ): void {
    const job = this.getJob(jobId);
    if (!job || !job.results[suiteId]) return;

    job.results[suiteId] = {
      ...job.results[suiteId],
      status: data.status,
      progressPct: 100,
      durationMs: data.durationMs,
      metrics: data.metrics,
      rawOutputSnippet: data.rawOutputSnippet,
    };

    job.completedSuites++;
    job.overallProgressPct = Math.round((job.completedSuites / job.totalSuites) * 100);

    VerifyProgressRepository.save(stateToStored(job));
  }

  completeJob(jobId: string, allPassed: boolean, totalDurationMs: number): void {
    const job = this.getJob(jobId);
    if (!job) return;

    job.status = allPassed ? "COMPLETED" : "FAILED";
    job.allPassed = allPassed;
    job.completedAt = new Date().toISOString();
    job.totalDurationMs = totalDurationMs;
    job.overallProgressPct = 100;

    VerifyProgressRepository.save(stateToStored(job));
  }
}

export const verifyProgressStore = new VerifyProgressStore();
