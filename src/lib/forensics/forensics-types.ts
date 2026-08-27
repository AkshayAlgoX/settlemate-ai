/*
 * SettleMate AI — Forensics Playback Types
 *
 * Browser-safe and server-safe schemas for forensics timeline playback.
 */

export interface ForensicsStep {
  stepNumber: number;
  phase: "INPUT_INGESTION" | "INDEX_BUILDING" | "MATCHING_RESULTS" | "AI_INVESTIGATION" | "MAKER_CHECKER" | "LEDGER_POSTING" | "DECISION_RECEIPT";
  title: string;
  description: string;
  timestamp: string;
  status: "COMPLETED" | "VERIFIED" | "AUDITED" | "FLAGGED";
  durationMs: number;
  dataSnapshot: Record<string, unknown>;
  auditProof?: {
    hash: string;
    algorithm: string;
    verifiedOffline: boolean;
  };
}

export interface ForensicsTimeline {
  jobId: string;
  status: string;
  createdAt: string;
  completedAt: string;
  batchSize: number;
  summary: {
    autoMatched: number;
    suggested: number;
    exception: number;
    total: number;
    matchRatePct: number;
    discrepancyPaise: number;
    formattedDiscrepancy: string;
  };
  steps: ForensicsStep[];
  receipt?: {
    rootHash: string;
    fingerprint: string;
    algorithm: string;
    signature: string;
    timestamp: string;
  };
}

export interface StoredJobSummaryItem {
  jobId: string;
  createdAt: string;
  completedAt?: string;
  status: string;
  batchSize: number;
  matchRatePct: number;
  autoMatched: number;
  exceptionCount: number;
  discrepancyPaise: number;
  formattedDiscrepancy: string;
  hasReceipt: boolean;
}
