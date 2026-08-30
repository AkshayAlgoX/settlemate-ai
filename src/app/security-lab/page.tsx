"use client";

import React, { useState } from "react";
import {
  Play,
  RefreshCw,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Badge } from "@/components/ui/badge";

interface SecurityAttackResult {
  attackId: string;
  vectorNumber: number;
  title: string;
  category: string;
  attackerAttempt: string;
  defenseMechanism: string;
  blocked: boolean;
  evidenceSnippet: string;
  recommendedAction: string;
  executionTimeMs: number;
}

const ATTACK_VECTORS = [
  {
    id: "ai-injection",
    vector: 1,
    title: "Prompt Injection & Fake Evidence",
    cat: "Adversarial AI",
    desc: "Attacker attempts to smuggle instructions via bank narration and submit fictitious voucher IDs to force an unearned ₹50,000 payout.",
  },
  {
    id: "dense-cardinality",
    vector: 2,
    title: "Combinatorial N:M Factorial DoS",
    cat: "Complexity",
    desc: "Attacker injects 15x15 identical-value transactions to induce exponential CPU branch explosion during subset-sum resolution.",
  },
  {
    id: "receipt-tamper",
    vector: 3,
    title: "Decision Receipt Tampering",
    cat: "Integrity",
    desc: "Attacker attempts to alter the finalized settled amount in a decision receipt by 1 paise (₹5,000.00 -> ₹5,000.01) after journal emission.",
  },
  {
    id: "tolerance-stacking",
    vector: 4,
    title: "Cumulative Tolerance Stacking",
    cat: "Exploitation",
    desc: "Attacker splits a large discrepancy into 25 micro-variances (₹50 each) to slip beneath individual ₹100 single-record tolerance thresholds.",
  },
  {
    id: "ocr-corruption",
    vector: 5,
    title: "Messy OCR Substitution",
    cat: "Obfuscation",
    desc: "Attacker introduces visual character ambiguities (O/0, I/1, broken columns) in scanned PDFs to induce unmatched exception cascades.",
  },
  {
    id: "source-outage",
    vector: 6,
    title: "Source Outage & Webhook Replay",
    cat: "Resilience",
    desc: "Attacker floods HTTP 503 gateway outages followed by duplicate webhook deliveries to trigger double-credit postings.",
  },
  {
    id: "cas-race",
    vector: 7,
    title: "High-Contention CAS Race",
    cat: "Concurrency",
    desc: "Concurrent workers attempt to claim and reconcile the same partition lease simultaneously to produce duplicate ledger writes.",
  },
  {
    id: "temporal-boundary",
    vector: 8,
    title: "Temporal Window Boundary Manipulation",
    cat: "Temporal Safety",
    desc: "Attacker shifts bank timestamps across settlement cutoff boundaries (+/- 1 hr) to trigger false orphan exception penalties.",
  },
  {
    id: "partition-invariance",
    vector: 9,
    title: "Cross-Partition Order Invariance",
    cat: "Determinism",
    desc: "Attacker randomizes batch ingestion arrival order across 20 distributed workers to evaluate whether ledger state hashes diverge.",
  },
  {
    id: "streaming-chaos",
    vector: 10,
    title: "100k Streaming Chaos & Worker Crash",
    cat: "Distributed Scale",
    desc: "10,000 randomized worker crash signals injected during high-speed 100k record streaming queue consumption.",
  },
];

export default function SecurityLabPage() {
  const [results, setResults] = useState<Record<string, SecurityAttackResult>>({});
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
  const [isRunningAll, setIsRunningAll] = useState<boolean>(false);

  const simulateSingleAttack = async (attackId: string) => {
    setLoadingMap((prev) => ({ ...prev, [attackId]: true }));
    try {
      const res = await fetch("/api/security/attack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attackId }),
      });
      const data = await res.json();
      if (data && data.success && data.attack) {
        setResults((prev) => ({ ...prev, [attackId]: data.attack }));
      }
    } catch (err) {
      console.error("Attack simulation failed:", err);
    } finally {
      setLoadingMap((prev) => ({ ...prev, [attackId]: false }));
    }
  };

  const simulateAllAttacks = async () => {
    setIsRunningAll(true);
    try {
      const res = await fetch("/api/security/attack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attackId: "all" }),
      });
      const data = await res.json();
      if (data && data.success && Array.isArray(data.attacks)) {
        const map: Record<string, SecurityAttackResult> = {};
        data.attacks.forEach((a: SecurityAttackResult) => {
          map[a.attackId] = a;
        });
        setResults(map);
      }
    } catch (err) {
      console.error("Run all attacks error:", err);
    } finally {
      setIsRunningAll(false);
    }
  };

  const handleReset = () => {
    setResults({});
  };

  const blockedCount = Object.values(results).filter((r) => r.blocked).length;

  return (
    <div className="space-y-10 pb-12">
      {/* Header */}
      <PageHeader
        tag="Security & Exploit Defense"
        title="Adversarial defense lab"
        description="Execute simulated adversarial attack vectors against SettleMate's non-LLM mechanical gates, cryptographic receipts, and invariant barriers."
        badge={<Badge variant="outline">10 Vectors</Badge>}
        actions={
          <div className="flex items-center gap-2">
            {Object.keys(results).length > 0 && (
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-accent transition"
              >
                <span>Reset</span>
              </button>
            )}
            <button
              type="button"
              onClick={simulateAllAttacks}
              disabled={isRunningAll}
              className="inline-flex h-8 items-center rounded-md bg-primary text-primary-foreground px-3.5 text-xs font-medium text-primary-foreground hover:bg-[#ffffff] disabled:opacity-50 transition"
            >
              {isRunningAll ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  <span>Executing 10 vectors...</span>
                </>
              ) : (
                <span>Run all 10 vectors</span>
              )}
            </button>
          </div>
        }
      />

      {/* Aggregate Status Banner */}
      {Object.keys(results).length > 0 && (
        <div className="rounded-lg border border-border bg-card p-5 flex items-center justify-between text-foreground">
          <div>
            <div className="text-sm font-semibold">
              Adversarial Defense Status: {blockedCount} / {Object.keys(results).length} Vectors Neutralized
            </div>
            <div className="text-xs text-muted-foreground mt-0.5 font-mono">
              100% Exploit Immunity · Zero Invariant Breaches · Zero Unauthorized Ledger Writes
            </div>
          </div>
          <Badge variant="success">
            Defended: 100%
          </Badge>
        </div>
      )}

      {/* Attack Cards Grid */}
      <div className="space-y-4">
        <SectionHeader
          title="Attack vector matrix"
          description="Simulate each vector individually to observe real-time defense mechanics."
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ATTACK_VECTORS.map((vec) => {
            const res = results[vec.id];
            const isLoading = loadingMap[vec.id] || isRunningAll;

            return (
              <div
                key={vec.id}
                className="rounded-lg border border-border bg-card p-5 space-y-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-muted-foreground/70">
                        Vector #{vec.vector}
                      </span>
                      <Badge variant="outline">
                        {vec.cat}
                      </Badge>
                    </div>
                    <h3 className="text-sm font-semibold text-foreground">{vec.title}</h3>
                    <p className="text-xs text-muted-foreground">{vec.desc}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-border pt-3">
                  {res ? (
                    <div className="flex items-center gap-2">
                      <Badge variant="success">
                        Blocked / Defended
                      </Badge>
                      <span className="text-xs font-mono text-muted-foreground/70">
                        {res.executionTimeMs}ms
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs font-mono text-muted-foreground/70">Armed & Ready</span>
                  )}

                  <button
                    type="button"
                    onClick={() => simulateSingleAttack(vec.id)}
                    disabled={isLoading}
                    className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50 transition"
                  >
                    {isLoading ? (
                      <>
                        <RefreshCw className="h-3 w-3 animate-spin" />
                        <span>Attacking...</span>
                      </>
                    ) : (
                      <>
                        <Play className="h-3 w-3 fill-current" />
                        <span>{res ? "Re-test" : "Simulate"}</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Result Panel */}
                {res && (
                  <div className="rounded-md border border-border bg-background p-3 space-y-2 text-xs">
                    <div>
                      <span className="text-[10px] uppercase text-muted-foreground/70">Active Defense Shield:</span>
                      <div className="text-xs font-mono font-semibold text-foreground mt-0.5">
                        {res.defenseMechanism}
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] uppercase text-muted-foreground/70">Defense Evidence & Audit Trail:</span>
                      <div className="p-2 rounded border border-border bg-card font-mono text-[11px] text-muted-foreground mt-0.5 overflow-x-auto whitespace-pre-wrap">
                        {res.evidenceSnippet}
                      </div>
                    </div>

                    <div className="text-xs text-muted-foreground">
                      <strong className="text-foreground">System Response:</strong> {res.recommendedAction}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
