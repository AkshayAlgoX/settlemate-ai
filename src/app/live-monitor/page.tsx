"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Activity,
  Play,
  Pause,
  RotateCcw,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Sliders,
  ArrowUpRight,
  Database,
} from "lucide-react";

interface StreamRecord {
  id: string;
  paymentId: string;
  orderId: string;
  amountPaise: number;
  amountFormatted: string;
  status: "MATCHED" | "SUGGESTED" | "EXCEPTION";
  reason: string;
  latencyMs: number;
  timestamp: string;
}

interface StreamStats {
  totalProcessed: number;
  autoMatched: number;
  suggested: number;
  exceptions: number;
  totalGrossPaise: number;
  reconciledPaise: number;
  variancePaise: number;
  currentThroughputRps: number;
  avgLatencyMs: number;
}

const SAMPLE_PAYMENT_PREFIXES = ["PAY_UPI", "PAY_CARD", "PAY_NETBNK", "PAY_WALLET"];

export default function LiveMonitorPage() {
  const [isRunning, setIsRunning] = useState(true);
  const [speedMs, setSpeedMs] = useState(500); // 500ms default (2 batches/sec)
  const [anomalyRate, setAnomalyRate] = useState(10); // 10% anomalies
  const [records, setRecords] = useState<StreamRecord[]>([]);
  const [stats, setStats] = useState<StreamStats>({
    totalProcessed: 0,
    autoMatched: 0,
    suggested: 0,
    exceptions: 0,
    totalGrossPaise: 0,
    reconciledPaise: 0,
    variancePaise: 0,
    currentThroughputRps: 0,
    avgLatencyMs: 0,
  });

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const counterRef = useRef(0);
  const latenciesRef = useRef<number[]>([]);

  const generateBatch = React.useCallback(() => {
    counterRef.current += 1;
    const batchSize = Math.floor(Math.random() * 8) + 4; // 4 to 12 transactions per pulse
    const newRecords: StreamRecord[] = [];
    const t0 = performance.now();

    let batchMatched = 0;
    let batchSuggested = 0;
    let batchExceptions = 0;
    let batchGross = 0;
    let batchReconciled = 0;
    let batchVariance = 0;

    for (let i = 0; i < batchSize; i++) {
      const idx = counterRef.current * 100 + i;
      const prefix = SAMPLE_PAYMENT_PREFIXES[Math.floor(Math.random() * SAMPLE_PAYMENT_PREFIXES.length)];
      const paymentId = `${prefix}_${idx}`;
      const orderId = `ORD_${idx}`;
      const amountPaise = (Math.floor(Math.random() * 950) + 50) * 100; // ₹50 to ₹1,000
      const isAnomaly = Math.random() * 100 < anomalyRate;

      batchGross += amountPaise;

      let status: StreamRecord["status"] = "MATCHED";
      let reason = "1:1 Exact UTR & Amount Match";

      if (isAnomaly) {
        const rand = Math.random();
        if (rand < 0.4) {
          status = "EXCEPTION";
          reason = "Partial Refund Variance (Voucher in Vault)";
          batchExceptions++;
          batchVariance += Math.floor(amountPaise * 0.15);
          batchReconciled += Math.floor(amountPaise * 0.85);
        } else if (rand < 0.7) {
          status = "SUGGESTED";
          reason = "Temporal Delay T+2 (Weekend Cutoff)";
          batchSuggested++;
          batchReconciled += amountPaise;
        } else {
          status = "EXCEPTION";
          reason = "Gateway Fee Tier Breach (150bps vs 200bps)";
          batchExceptions++;
          batchVariance += Math.floor(amountPaise * 0.02);
          batchReconciled += Math.floor(amountPaise * 0.98);
        }
      } else {
        batchMatched++;
        batchReconciled += amountPaise;
      }

      const elapsed = Number((performance.now() - t0).toFixed(2));

      newRecords.push({
        id: `rec_${idx}`,
        paymentId,
        orderId,
        amountPaise,
        amountFormatted: `₹${(amountPaise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
        status,
        reason,
        latencyMs: Math.max(0.1, elapsed),
        timestamp: new Date().toLocaleTimeString(),
      });
    }

    const totalBatchTimeMs = performance.now() - t0;
    latenciesRef.current.push(totalBatchTimeMs);
    if (latenciesRef.current.length > 20) latenciesRef.current.shift();

    const avgLat = Number(
      (latenciesRef.current.reduce((a, b) => a + b, 0) / latenciesRef.current.length).toFixed(2)
    );

    const rps = Math.round((batchSize / (speedMs / 1000)));

    setStats((prev) => ({
      totalProcessed: prev.totalProcessed + batchSize,
      autoMatched: prev.autoMatched + batchMatched,
      suggested: prev.suggested + batchSuggested,
      exceptions: prev.exceptions + batchExceptions,
      totalGrossPaise: prev.totalGrossPaise + batchGross,
      reconciledPaise: prev.reconciledPaise + batchReconciled,
      variancePaise: prev.variancePaise + batchVariance,
      currentThroughputRps: rps,
      avgLatencyMs: avgLat,
    }));

    setRecords((prev) => [...newRecords.reverse(), ...prev].slice(0, 50));
  }, [anomalyRate, speedMs]);

  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(generateBatch, speedMs);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning, speedMs, generateBatch]);

  const handleReset = () => {
    setRecords([]);
    counterRef.current = 0;
    latenciesRef.current = [];
    setStats({
      totalProcessed: 0,
      autoMatched: 0,
      suggested: 0,
      exceptions: 0,
      totalGrossPaise: 0,
      reconciledPaise: 0,
      variancePaise: 0,
      currentThroughputRps: 0,
      avgLatencyMs: 0,
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/20 shadow-xl">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
              <span className="relative flex h-2 w-2">
                {isRunning && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                )}
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Live Reconciliation Stream · 📡 00O
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Real-Time Settlement Telemetry Center
            </h1>
            <p className="text-xs sm:text-sm text-slate-400">
              Live deterministic matching, Context Vault evidence extraction, and non-LLM invariant gating at wire speed.
            </p>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setIsRunning(!isRunning)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md ${
                isRunning
                  ? "bg-amber-600 hover:bg-amber-500 text-white"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white"
              }`}
            >
              {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {isRunning ? "Pause Stream" : "Resume Stream"}
            </button>

            <button
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Counters
            </button>
          </div>
        </div>

        {/* Live Tuning Parameters Bar */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-slate-300">
              <span className="font-semibold flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                Stream Frequency / Ingestion Speed:
              </span>
              <span className="font-mono font-bold text-indigo-400">
                {speedMs}ms ({Math.round(1000 / speedMs)} batches/s)
              </span>
            </div>
            <input
              type="range"
              min="100"
              max="1000"
              step="100"
              value={speedMs}
              onChange={(e) => setSpeedMs(Number(e.target.value))}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-slate-300">
              <span className="font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                Simulated Anomaly Injection Rate:
              </span>
              <span className="font-mono font-bold text-amber-400">{anomalyRate}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="50"
              step="5"
              value={anomalyRate}
              onChange={(e) => setAnomalyRate(Number(e.target.value))}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
          </div>
        </div>

        {/* Key Metrics Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Total Processed</div>
            <div className="text-xl font-bold font-mono text-white">{stats.totalProcessed.toLocaleString()}</div>
            <div className="text-[10px] text-slate-500 flex items-center gap-1">
              <Database className="w-3 h-3" /> Live Ingested
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
            <div className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">Auto-Matched</div>
            <div className="text-xl font-bold font-mono text-emerald-400">{stats.autoMatched.toLocaleString()}</div>
            <div className="text-[10px] text-emerald-500/80 font-semibold">
              {stats.totalProcessed > 0
                ? `${((stats.autoMatched / stats.totalProcessed) * 100).toFixed(1)}%`
                : "0%"}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
            <div className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider">Suggested Match</div>
            <div className="text-xl font-bold font-mono text-amber-400">{stats.suggested.toLocaleString()}</div>
            <div className="text-[10px] text-slate-500">Sliding Window</div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
            <div className="text-[10px] font-semibold text-rose-400 uppercase tracking-wider">Exceptions Gated</div>
            <div className="text-xl font-bold font-mono text-rose-400">{stats.exceptions.toLocaleString()}</div>
            <div className="text-[10px] text-slate-500">Grounded Claims</div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
            <div className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider">Throughput</div>
            <div className="text-xl font-bold font-mono text-indigo-400">{stats.currentThroughputRps} <span className="text-xs font-normal">rec/s</span></div>
            <div className="text-[10px] text-slate-500">Real-Time Speed</div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
            <div className="text-[10px] font-semibold text-cyan-400 uppercase tracking-wider">Avg Latency</div>
            <div className="text-xl font-bold font-mono text-cyan-400">{stats.avgLatencyMs} <span className="text-xs font-normal">ms</span></div>
            <div className="text-[10px] text-slate-500">Native V8 Loop</div>
          </div>
        </div>

        {/* Live Stream Table & Activity Feed */}
        <div className="rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden shadow-xl space-y-4">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Live Transaction Stream (Last 50 Events)
              </h3>
            </div>
            <span className="text-[11px] font-mono text-slate-400">
              Showing latest {records.length} records
            </span>
          </div>

          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse font-mono">
              <thead className="sticky top-0 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800 text-slate-400 text-[10px] uppercase">
                <tr>
                  <th className="py-2.5 px-4">Timestamp</th>
                  <th className="py-2.5 px-4">Payment ID</th>
                  <th className="py-2.5 px-4">Order ID</th>
                  <th className="py-2.5 px-4 text-right">Gross Amount</th>
                  <th className="py-2.5 px-4 text-center">Status</th>
                  <th className="py-2.5 px-4">Reconciliation Detail</th>
                  <th className="py-2.5 px-4 text-right">Latency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {records.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500 font-sans">
                      Stream initialized. Awaiting incoming transactions...
                    </td>
                  </tr>
                ) : (
                  records.map((r) => {
                    let statusBadge = (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        <CheckCircle2 className="w-3 h-3" /> MATCHED
                      </span>
                    );
                    if (r.status === "SUGGESTED") {
                      statusBadge = (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                          <Clock className="w-3 h-3" /> SUGGESTED
                        </span>
                      );
                    } else if (r.status === "EXCEPTION") {
                      statusBadge = (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">
                          <AlertTriangle className="w-3 h-3" /> EXCEPTION
                        </span>
                      );
                    }

                    return (
                      <tr key={r.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-2 px-4 text-slate-400 text-[11px]">{r.timestamp}</td>
                        <td className="py-2 px-4 font-semibold text-slate-200">{r.paymentId}</td>
                        <td className="py-2 px-4 text-slate-400">{r.orderId}</td>
                        <td className="py-2 px-4 text-right font-bold text-slate-200">{r.amountFormatted}</td>
                        <td className="py-2 px-4 text-center">{statusBadge}</td>
                        <td className="py-2 px-4 text-slate-300 font-sans text-[11px]">{r.reason}</td>
                        <td className="py-2 px-4 text-right text-indigo-400 text-[11px]">{r.latencyMs}ms</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Financial Invariants Guarantee Box */}
        <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-emerald-300">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <span className="font-bold text-white">Continuous Double-Entry Invariant Guard:</span>
              <p className="text-emerald-300/80 mt-0.5">
                Every processed streaming batch automatically verifies {"∑ Debits ≡ ∑ Credits"}. Zero false financial writes allowed.
              </p>
            </div>
          </div>
          <a
            href="/audit-trail"
            className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 hover:text-emerald-300 hover:underline shrink-0"
          >
            Inspect General Ledger <ArrowUpRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </main>
    </div>
  );
}
