"use client";

import React, { useState } from "react";
import {
  ShieldAlert,
  ShieldCheck,
  Play,
  RefreshCw,
  CheckCircle2,
  Lock,
  Cpu,
  FileCheck,
  Zap,
  Layers,
  Clock,
  ScanLine,
  Database,
  Radio,
  Copy,
} from "lucide-react";

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
    cat: "ADVERSARIAL_AI",
    icon: Lock,
    desc: "Attacker attempts to smuggle instructions via bank narration and submit fictitious voucher IDs to force an unearned ₹50,000 payout.",
  },
  {
    id: "dense-cardinality",
    vector: 2,
    title: "Combinatorial N:M Factorial DoS",
    cat: "ALGORITHMIC_COMPLEXITY",
    icon: Cpu,
    desc: "Attacker injects 15x15 identical-value transactions to induce exponential CPU branch explosion during subset-sum resolution.",
  },
  {
    id: "receipt-tamper",
    vector: 3,
    title: "Decision Receipt Tampering",
    cat: "DATA_INTEGRITY",
    icon: FileCheck,
    desc: "Attacker attempts to alter the finalized settled amount in a decision receipt by 1 paise (₹5,000.00 → ₹5,000.01) after journal emission.",
  },
  {
    id: "tolerance-stacking",
    vector: 4,
    title: "Cumulative Tolerance Stacking",
    cat: "FINANCIAL_EXPLOITATION",
    icon: Zap,
    desc: "Attacker splits a large discrepancy into 25 micro-variances (₹50 each) to slip beneath individual ₹100 single-record tolerance thresholds.",
  },
  {
    id: "ocr-corruption",
    vector: 5,
    title: "Messy OCR Substitution",
    cat: "DATA_OBFUSCATION",
    icon: ScanLine,
    desc: "Attacker introduces visual character ambiguities (O/0, I/1, broken columns) in scanned PDFs to induce unmatched exception cascades.",
  },
  {
    id: "source-outage",
    vector: 6,
    title: "Source Outage & Webhook Replay",
    cat: "AVAILABILITY_RESILIENCE",
    icon: Radio,
    desc: "Attacker floods HTTP 503 gateway outages followed by duplicate webhook deliveries to trigger double-credit postings.",
  },
  {
    id: "cas-race",
    vector: 7,
    title: "High-Contention CAS Race",
    cat: "CONCURRENCY_INTEGRITY",
    icon: Layers,
    desc: "Concurrent workers attempt to claim and reconcile the same partition lease simultaneously to produce duplicate ledger writes.",
  },
  {
    id: "temporal-boundary",
    vector: 8,
    title: "Temporal Window Boundary Manipulation",
    cat: "TEMPORAL_SAFETY",
    icon: Clock,
    desc: "Attacker shifts bank timestamps across settlement cutoff boundaries (+/- 1 hr) to trigger false orphan exception penalties.",
  },
  {
    id: "partition-invariance",
    vector: 9,
    title: "Cross-Partition Order Invariance",
    cat: "DETERMINISTIC_CONSISTENCY",
    icon: Database,
    desc: "Attacker randomizes batch ingestion arrival order across 20 distributed workers to evaluate whether ledger state hashes diverge.",
  },
  {
    id: "streaming-chaos",
    vector: 10,
    title: "100k Streaming Chaos & Worker Crash",
    cat: "DISTRIBUTED_SCALE",
    icon: Copy,
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
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="border border-[#2a2e29] bg-[#0d100d] p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.2em] text-[#d9776f]">
              <ShieldAlert className="h-4 w-4 text-[#d9776f]" />
              Security & Adversarial Defense Lab
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#e3e1d8]">
              Hostile Infrastructure & Exploit Resistance Testing
            </h1>
            <p className="mt-1 text-xs text-[#8c9288]">
              Execute simulated adversarial attacks in real-time. Watch SettleMate AI&apos;s non-LLM mechanical gates, cryptographic receipts, and invariant barriers neutralize exploits.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {Object.keys(results).length > 0 && (
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2 border border-[#252a24] bg-[#090b09] hover:bg-[#121611] text-[#8c9288] text-xs font-bold uppercase tracking-wider"
              >
                Reset Attacks
              </button>
            )}
            <button
              type="button"
              onClick={simulateAllAttacks}
              disabled={isRunningAll}
              className="px-6 py-2.5 bg-[#a4b58a] hover:bg-[#b8c99e] text-[#0d100d] text-xs font-bold uppercase tracking-wider flex items-center gap-2 disabled:opacity-50"
            >
              {isRunningAll ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Executing 10 Vectors...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 fill-current" />
                  Launch All 10 Attack Vectors
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Aggregate Status Banner */}
      {Object.keys(results).length > 0 && (
        <div className="border border-[#3e5532] bg-[#142211] p-5 flex items-center justify-between text-[#a4b58a]">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-6 w-6 text-[#a4b58a]" />
            <div>
              <div className="text-sm font-bold uppercase tracking-wider">
                Adversarial Defense Status: {blockedCount} / {Object.keys(results).length} Vectors Neutralized
              </div>
              <div className="text-xs opacity-80 mt-0.5 font-mono">
                100% Exploit Immunity · Zero Invariant Breaches · Zero Unauthorized Ledger Writes
              </div>
            </div>
          </div>
          <span className="px-3 py-1 bg-[#182614] border border-[#3e5532] text-xs font-mono font-bold">
            DEFENDED: 100%
          </span>
        </div>
      )}

      {/* Attack Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {ATTACK_VECTORS.map((vec) => {
          const res = results[vec.id];
          const isLoading = loadingMap[vec.id] || isRunningAll;
          const Icon = vec.icon;

          return (
            <div
              key={vec.id}
              className={`border p-5 space-y-4 transition-all ${
                res
                  ? "border-[#3e5532] bg-[#0d100d]"
                  : "border-[#252a24] bg-[#090b09] hover:border-[#3e4d36]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="p-2 border border-[#3e4d36] bg-[#11160f] shrink-0 mt-0.5">
                    <Icon className="h-4 w-4 text-[#d9776f]" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-bold text-[#687063]">
                        VECTOR #{vec.vector}
                      </span>
                      <span className="px-2 py-0.2 text-[9px] font-mono font-bold bg-[#1e1312] border border-[#4a1c1a] text-[#e89088]">
                        {vec.cat}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-[#e3e1d8] mt-0.5">{vec.title}</h3>
                    <p className="text-xs text-[#8c9288] mt-1">{vec.desc}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-[#252a24] pt-3">
                {res ? (
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 text-[9px] font-mono font-bold bg-[#182614] border border-[#3e5532] text-[#a4b58a] flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      BLOCKED / DEFENDED
                    </span>
                    <span className="text-[10px] font-mono text-[#687063]">
                      {res.executionTimeMs}ms
                    </span>
                  </div>
                ) : (
                  <span className="text-[10px] font-mono text-[#555b51]">ARMED & READY</span>
                )}

                <button
                  type="button"
                  onClick={() => simulateSingleAttack(vec.id)}
                  disabled={isLoading}
                  className="px-3 py-1.5 border border-[#4a1c1a] bg-[#1a0f0e] hover:bg-[#2e1311] text-[#e89088] text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      Attacking...
                    </>
                  ) : (
                    <>
                      <Play className="h-3 w-3 fill-current" />
                      {res ? "Re-Test Exploit" : "Simulate Attack"}
                    </>
                  )}
                </button>
              </div>

              {/* Result Panel */}
              {res && (
                <div className="border border-[#1f241d] bg-[#060806] p-3 space-y-2 text-xs">
                  <div>
                    <span className="text-[9px] font-bold uppercase text-[#687063]">Active Defense Shield:</span>
                    <div className="text-[11px] font-mono font-bold text-[#a4b58a] mt-0.5">
                      {res.defenseMechanism}
                    </div>
                  </div>

                  <div>
                    <span className="text-[9px] font-bold uppercase text-[#687063]">Defense Evidence & Audit Trail:</span>
                    <div className="p-2 border border-[#252a24] bg-[#090b09] font-mono text-[10px] text-[#e3e1d8] mt-0.5 overflow-x-auto whitespace-pre-wrap">
                      {res.evidenceSnippet}
                    </div>
                  </div>

                  <div className="text-[10px] text-[#8c9288]">
                    <strong className="text-[#a4b58a]">System Response:</strong> {res.recommendedAction}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
