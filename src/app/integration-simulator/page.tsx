"use client";

import { useState, useEffect, useTransition } from "react";
import {
  PlugZap,
  Play,
  RotateCw,
  Dices,
  Send,
  Radio,
  AlertTriangle,
  FileCode,
  Layers,
  Copy,
  Clock,
  ShieldCheck,
  Database,
} from "lucide-react";
import {
  generateSimulatorBatch,
  type SimulatorBatchResult,
  type AnomalyConfig,
} from "@/lib/simulator/simulator-generator";

interface HistoryEntry {
  jobId: string;
  timestamp: string;
  rowCount: number;
  mode: "SYNC" | "ASYNC_WEBHOOK";
  status: "SUCCESS" | "ACCEPTED" | "ERROR";
  latencyMs: number;
  matchRatePct?: number;
  discrepancyPaise?: number;
}

interface WebhookLogItem {
  id: string;
  url: string;
  event: string;
  payload: Record<string, unknown>;
  signature: string;
  timestamp: string;
  status: string;
}

export default function IntegrationSimulatorPage() {
  const [, startTransition] = useTransition();

  // Generator Configuration State
  const [rowCount, setRowCount] = useState<number>(75);
  const [seed, setSeed] = useState<number>(42);
  const [anomalyConfig, setAnomalyConfig] = useState<AnomalyConfig>({
    partialRefundRate: 0.08,
    feeMismatchRate: 0.06,
    duplicateRate: 0.04,
    delayedSettlementRate: 0.05,
    orphanCreditRate: 0.03,
  });

  // Current Generated Batch (lazy initialized)
  const [batch, setBatch] = useState<SimulatorBatchResult | null>(() =>
    generateSimulatorBatch(75, 42, {
      partialRefundRate: 0.08,
      feeMismatchRate: 0.06,
      duplicateRate: 0.04,
      delayedSettlementRate: 0.05,
      orphanCreditRate: 0.03,
    })
  );

  // API Call State
  const [apiKey, setApiKey] = useState<string>("sk_live_merchant_simulator_token_9901");
  const [asyncMode, setAsyncMode] = useState<boolean>(false);
  const [webhookUrl, setWebhookUrl] = useState<string>(
    "https://erp.merchant-hub.internal/v1/settlemate-listener"
  );
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [apiResponse, setApiResponse] = useState<Record<string, unknown> | null>(null);
  const [responseStatus, setResponseStatus] = useState<number | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [copiedReceipt, setCopiedReceipt] = useState<boolean>(false);

  // Webhook Registration & Logs
  const [registeredWebhookStatus, setRegisteredWebhookStatus] = useState<string | null>(null);
  const [isRegisteringWebhook, setIsRegisteringWebhook] = useState<boolean>(false);
  const [webhookLogs, setWebhookLogs] = useState<WebhookLogItem[]>([]);

  // Call History
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  // Fetch Webhook Logs (for manual actions)
  const fetchWebhookLogs = async () => {
    try {
      const res = await fetch("/api/v1/webhooks/logs");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.logs)) {
          setWebhookLogs(data.logs);
        }
      }
    } catch {
      // Ignore polling errors
    }
  };

  // Poll Webhook Logs
  useEffect(() => {
    let isMounted = true;
    const poll = async () => {
      try {
        const res = await fetch("/api/v1/webhooks/logs");
        if (res.ok && isMounted) {
          const data = await res.json();
          if (Array.isArray(data.logs)) {
            setWebhookLogs(data.logs);
          }
        }
      } catch {
        // Ignore polling errors
      }
    };

    const interval = setInterval(poll, 3000);
    const timer = setTimeout(poll, 100);

    return () => {
      isMounted = false;
      clearInterval(interval);
      clearTimeout(timer);
    };
  }, []);

  const handleGenerate = () => {
    startTransition(() => {
      const newBatch = generateSimulatorBatch(rowCount, seed, anomalyConfig);
      setBatch(newBatch);
      setApiResponse(null);
      setResponseStatus(null);
    });
  };

  const handleRandomizeSeed = () => {
    const newSeed = Math.floor(Math.random() * 90000) + 1000;
    setSeed(newSeed);
    startTransition(() => {
      const newBatch = generateSimulatorBatch(rowCount, newSeed, anomalyConfig);
      setBatch(newBatch);
      setApiResponse(null);
    });
  };

  const handleRegisterWebhook = async () => {
    setIsRegisteringWebhook(true);
    setRegisteredWebhookStatus(null);
    try {
      const res = await fetch("/api/v1/webhooks/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
        },
        body: JSON.stringify({
          url: webhookUrl,
          events: ["reconciliation.completed", "exception.detected"],
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setRegisteredWebhookStatus(`Active (${data.webhook.id})`);
        fetchWebhookLogs();
      } else {
        setRegisteredWebhookStatus(`Error: ${data.error?.message || "Registration failed"}`);
      }
    } catch (err) {
      setRegisteredWebhookStatus(`Network Error: ${(err as Error).message}`);
    } finally {
      setIsRegisteringWebhook(false);
    }
  };

  const handleSendToApi = async () => {
    if (!batch) return;
    setIsSubmitting(true);
    setApiResponse(null);
    setResponseStatus(null);
    const start = performance.now();

    try {
      const payload: Record<string, unknown> = {
        transactions: batch.transactions,
      };
      if (asyncMode && webhookUrl) {
        payload.webhookUrl = webhookUrl;
      }

      const res = await fetch("/api/v1/reconcile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
        },
        body: JSON.stringify(payload),
      });

      const end = performance.now();
      const elapsed = Math.round(end - start);
      setLatency(elapsed);
      setResponseStatus(res.status);

      const json = await res.json();
      setApiResponse(json);

      const newEntry: HistoryEntry = {
        jobId: String(json.jobId || "job_failed"),
        timestamp: new Date().toLocaleTimeString(),
        rowCount: batch.transactions.length,
        mode: asyncMode ? "ASYNC_WEBHOOK" : "SYNC",
        status: res.status === 200 ? "SUCCESS" : res.status === 202 ? "ACCEPTED" : "ERROR",
        latencyMs: elapsed,
        matchRatePct: json.summary?.matchRatePct,
        discrepancyPaise: json.summary?.discrepancyPaise,
      };

      setHistory((prev) => [newEntry, ...prev.slice(0, 9)]);
      if (asyncMode) {
        setTimeout(fetchWebhookLogs, 600);
      }
    } catch (err) {
      const end = performance.now();
      setLatency(Math.round(end - start));
      setResponseStatus(500);
      setApiResponse({ error: { message: (err as Error).message } });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyReceipt = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedReceipt(true);
    setTimeout(() => setCopiedReceipt(false), 2000);
  };

  const summary = apiResponse?.summary as
    | { autoMatched: number; suggested: number; exception: number; total: number; matchRatePct: number }
    | undefined;

  const receipt = apiResponse?.receipt as
    | { rootHash: string; leafCount: number; algorithm: string; signature: string }
    | undefined;

  const exceptions = (apiResponse?.exceptions || []) as Array<{
    id: string;
    type: string;
    description: string;
    formattedAmount: string;
    paymentId: string;
    cardinalityType: string;
  }>;

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-[#242820] pb-6 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center border border-[#424738] bg-[#11140f] text-[#aab98b]">
              <PlugZap className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-[#f0eee5]">
                External Integration Simulator
              </h1>
              <p className="text-xs text-[#8a9184]">
                Simulate external ERP / E-Commerce batch ingestion, webhook stream callbacks & REST API contract
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 border border-[#30362e] bg-[#121611] px-2.5 py-1 text-[11px] font-mono text-[#aab98b]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#aab98b] animate-pulse" />
            API v1 Ready
          </span>
          <span className="border border-[#3a4035] bg-[#1a1f17] px-2.5 py-1 text-[11px] font-mono text-[#dcd7cb]">
            🔌 00H
          </span>
        </div>
      </div>

      {/* Grid Layout: Controls & Ingestion */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Synthetic Generator Controls */}
        <div className="space-y-6 lg:col-span-5">
          <div className="border border-[#242820] bg-[#0d100c] p-5">
            <div className="mb-4 flex items-center justify-between border-b border-[#1f241c] pb-3">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-[#aab98b]" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-[#e6e2d8]">
                  Batch Generator
                </h2>
              </div>
              <span className="font-mono text-[10px] text-[#7a8174]">Deterministic PRNG</span>
            </div>

            <div className="space-y-4">
              {/* Row Count Slider */}
              <div>
                <div className="flex justify-between text-xs text-[#cfcac0]">
                  <span>Batch Row Count (50 - 200)</span>
                  <span className="font-mono font-bold text-[#aab98b]">{rowCount} txns</span>
                </div>
                <input
                  type="range"
                  min={50}
                  max={200}
                  step={5}
                  value={rowCount}
                  onChange={(e) => setRowCount(Number(e.target.value))}
                  className="mt-2 w-full accent-[#aab98b] cursor-pointer"
                />
              </div>

              {/* PRNG Seed */}
              <div>
                <div className="flex justify-between text-xs text-[#cfcac0]">
                  <span>PRNG Seed (Reproducibility)</span>
                  <span className="font-mono text-[#8a9184]"># {seed}</span>
                </div>
                <div className="mt-1.5 flex gap-2">
                  <input
                    type="number"
                    value={seed}
                    onChange={(e) => setSeed(Number(e.target.value))}
                    className="w-full border border-[#2b3127] bg-[#121611] px-3 py-1.5 text-xs font-mono text-[#f0eee5] focus:border-[#aab98b] focus:outline-none"
                  />
                  <button
                    onClick={handleRandomizeSeed}
                    title="Randomize Seed"
                    className="flex items-center gap-1.5 border border-[#3a4035] bg-[#161b14] px-3 py-1.5 text-xs text-[#d0d0c8] hover:bg-[#20271d] hover:text-[#fff]"
                  >
                    <Dices className="h-3.5 w-3.5" />
                    Dice
                  </button>
                </div>
              </div>

              {/* Anomaly Distribution Sliders */}
              <div className="border-t border-[#1f241c] pt-4 space-y-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#8b9186]">
                  Anomaly Injection Rates
                </div>

                {/* Partial Refund */}
                <div>
                  <div className="flex justify-between text-[11px] text-[#aaa89f]">
                    <span>Partial Refund Variance (15% gap)</span>
                    <span className="font-mono text-[#d4af37]">
                      {Math.round(anomalyConfig.partialRefundRate * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={0.25}
                    step={0.01}
                    value={anomalyConfig.partialRefundRate}
                    onChange={(e) =>
                      setAnomalyConfig((prev) => ({
                        ...prev,
                        partialRefundRate: Number(e.target.value),
                      }))
                    }
                    className="mt-1 w-full accent-[#d4af37] cursor-pointer"
                  />
                </div>

                {/* Fee Mismatch */}
                <div>
                  <div className="flex justify-between text-[11px] text-[#aaa89f]">
                    <span>Gateway Fee Overcharge (150 vs 300 bps)</span>
                    <span className="font-mono text-[#e06c75]">
                      {Math.round(anomalyConfig.feeMismatchRate * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={0.2}
                    step={0.01}
                    value={anomalyConfig.feeMismatchRate}
                    onChange={(e) =>
                      setAnomalyConfig((prev) => ({
                        ...prev,
                        feeMismatchRate: Number(e.target.value),
                      }))
                    }
                    className="mt-1 w-full accent-[#e06c75] cursor-pointer"
                  />
                </div>

                {/* Duplicate Settlement */}
                <div>
                  <div className="flex justify-between text-[11px] text-[#aaa89f]">
                    <span>Duplicate Settlement Collision</span>
                    <span className="font-mono text-[#98c379]">
                      {Math.round(anomalyConfig.duplicateRate * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={0.15}
                    step={0.01}
                    value={anomalyConfig.duplicateRate}
                    onChange={(e) =>
                      setAnomalyConfig((prev) => ({
                        ...prev,
                        duplicateRate: Number(e.target.value),
                      }))
                    }
                    className="mt-1 w-full accent-[#98c379] cursor-pointer"
                  />
                </div>

                {/* Orphan Bank Credit */}
                <div>
                  <div className="flex justify-between text-[11px] text-[#aaa89f]">
                    <span>Orphan Bank Credit (No matching payment)</span>
                    <span className="font-mono text-[#61afef]">
                      {Math.round(anomalyConfig.orphanCreditRate * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={0.1}
                    step={0.01}
                    value={anomalyConfig.orphanCreditRate}
                    onChange={(e) =>
                      setAnomalyConfig((prev) => ({
                        ...prev,
                        orphanCreditRate: Number(e.target.value),
                      }))
                    }
                    className="mt-1 w-full accent-[#61afef] cursor-pointer"
                  />
                </div>
              </div>

              {/* Generate Button */}
              <button
                onClick={handleGenerate}
                className="mt-4 flex w-full items-center justify-center gap-2 border border-[#4a553c] bg-[#1a2116] py-2.5 text-xs font-semibold text-[#f0eee5] transition hover:bg-[#253020] hover:text-[#fff]"
              >
                <RotateCw className="h-3.5 w-3.5 text-[#aab98b]" />
                Regenerate Batch ({batch?.transactions.length || 0} Records)
              </button>
            </div>
          </div>

          {/* Webhook Configuration Panel */}
          <div className="border border-[#242820] bg-[#0d100c] p-5">
            <div className="mb-3 flex items-center justify-between border-b border-[#1f241c] pb-3">
              <div className="flex items-center gap-2">
                <Radio className="h-4 w-4 text-[#aab98b]" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-[#e6e2d8]">
                  External Webhook Listener
                </h2>
              </div>
              <span className="font-mono text-[10px] text-[#7a8174]">HMAC-SHA256 Signed</span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-[#9a9f93]">Destination ERP Webhook Endpoint</label>
                <input
                  type="text"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  className="mt-1 w-full border border-[#2b3127] bg-[#121611] px-3 py-1.5 text-xs font-mono text-[#f0eee5] focus:border-[#aab98b] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between">
                <button
                  onClick={handleRegisterWebhook}
                  disabled={isRegisteringWebhook}
                  className="flex items-center gap-1.5 border border-[#30362e] bg-[#141912] px-3 py-1.5 text-xs text-[#cfcac0] hover:bg-[#1f251b] hover:text-[#fff] disabled:opacity-50"
                >
                  <Send className="h-3 w-3 text-[#aab98b]" />
                  {isRegisteringWebhook ? "Registering..." : "Register Webhook"}
                </button>

                {registeredWebhookStatus && (
                  <span className="font-mono text-[11px] text-[#aab98b]">
                    {registeredWebhookStatus}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Ingestion Dispatcher & Live Response */}
        <div className="space-y-6 lg:col-span-7">
          {/* Dispatcher Card */}
          <div className="border border-[#242820] bg-[#0d100c] p-5">
            <div className="mb-4 flex items-center justify-between border-b border-[#1f241c] pb-3">
              <div className="flex items-center gap-2">
                <Send className="h-4 w-4 text-[#aab98b]" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-[#e6e2d8]">
                  REST API Ingestion Pipeline
                </h2>
              </div>
              <span className="font-mono text-[11px] text-[#aab98b]">POST /api/v1/reconcile</span>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-[11px] text-[#9a9f93]">API Key Header (X-API-Key)</label>
                  <input
                    type="text"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="mt-1 w-full border border-[#2b3127] bg-[#121611] px-3 py-1.5 text-xs font-mono text-[#f0eee5] focus:border-[#aab98b] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-[#9a9f93]">Execution Mode</label>
                  <div className="mt-1 flex gap-2">
                    <button
                      onClick={() => setAsyncMode(false)}
                      className={`flex-1 border px-2 py-1.5 text-xs font-medium transition ${
                        !asyncMode
                          ? "border-[#505a42] bg-[#1a2215] text-[#f0eee5]"
                          : "border-[#2b3127] bg-[#121611] text-[#7a8174] hover:text-[#bbb]"
                      }`}
                    >
                      Sync (200 OK)
                    </button>
                    <button
                      onClick={() => setAsyncMode(true)}
                      className={`flex-1 border px-2 py-1.5 text-xs font-medium transition ${
                        asyncMode
                          ? "border-[#505a42] bg-[#1a2215] text-[#f0eee5]"
                          : "border-[#2b3127] bg-[#121611] text-[#7a8174] hover:text-[#bbb]"
                      }`}
                    >
                      Async Webhook (202)
                    </button>
                  </div>
                </div>
              </div>

              {/* Batch Summary Bar */}
              {batch && (
                <div className="grid grid-cols-4 gap-2 border border-[#1e231b] bg-[#121611] p-3 text-center">
                  <div>
                    <div className="text-[10px] uppercase text-[#7a8174]">Total Rows</div>
                    <div className="font-mono text-sm font-bold text-[#f0eee5]">
                      {batch.transactions.length}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-[#7a8174]">Clean Matches</div>
                    <div className="font-mono text-sm font-bold text-[#aab98b]">
                      {batch.stats.cleanTxnCount}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-[#7a8174]">Injected Variances</div>
                    <div className="font-mono text-sm font-bold text-[#d4af37]">
                      {batch.stats.partialRefundCount + batch.stats.feeMismatchCount}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-[#7a8174]">Orphan / Dupes</div>
                    <div className="font-mono text-sm font-bold text-[#e06c75]">
                      {batch.stats.duplicateCount + batch.stats.orphanCount}
                    </div>
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <button
                onClick={handleSendToApi}
                disabled={isSubmitting || !batch}
                className="flex w-full items-center justify-center gap-2 border border-[#6b7b54] bg-[#222c1b] py-3 text-sm font-semibold text-[#f0eee5] shadow-lg transition hover:bg-[#2c3a23] hover:text-[#fff] disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#aab98b] border-t-transparent" />
                    Executing Multi-Pass Invariant Engine...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 text-[#aab98b]" />
                    Send Batch to REST API ({asyncMode ? "Async + Webhook" : "Sync Ingestion"})
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Response & Decision Receipt Card */}
          {apiResponse && (
            <div className="border border-[#242820] bg-[#0d100c] p-5">
              <div className="mb-4 flex items-center justify-between border-b border-[#1f241c] pb-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-[#aab98b]" />
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-[#e6e2d8]">
                    API Response & Cryptographic Receipt
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`font-mono text-xs px-2 py-0.5 border ${
                      responseStatus === 200
                        ? "border-[#4a5e38] bg-[#162112] text-[#aab98b]"
                        : responseStatus === 202
                        ? "border-[#605530] bg-[#211d10] text-[#d4af37]"
                        : "border-[#603530] bg-[#211210] text-[#e06c75]"
                    }`}
                  >
                    HTTP {responseStatus}
                  </span>
                  {latency !== null && (
                    <span className="font-mono text-xs text-[#7a8174] flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {latency}ms
                    </span>
                  )}
                </div>
              </div>

              {/* Summary Stats */}
              {summary && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="border border-[#1e231b] bg-[#121611] p-3 text-center">
                    <div className="text-[10px] uppercase text-[#7a8174]">Auto-Matched</div>
                    <div className="font-mono text-base font-bold text-[#aab98b]">
                      {summary.autoMatched}
                    </div>
                  </div>
                  <div className="border border-[#1e231b] bg-[#121611] p-3 text-center">
                    <div className="text-[10px] uppercase text-[#7a8174]">Suggested</div>
                    <div className="font-mono text-base font-bold text-[#d4af37]">
                      {summary.suggested}
                    </div>
                  </div>
                  <div className="border border-[#1e231b] bg-[#121611] p-3 text-center">
                    <div className="text-[10px] uppercase text-[#7a8174]">Exceptions</div>
                    <div className="font-mono text-base font-bold text-[#e06c75]">
                      {summary.exception}
                    </div>
                  </div>
                  <div className="border border-[#1e231b] bg-[#121611] p-3 text-center">
                    <div className="text-[10px] uppercase text-[#7a8174]">Match Rate</div>
                    <div className="font-mono text-base font-bold text-[#f0eee5]">
                      {summary.matchRatePct}%
                    </div>
                  </div>
                </div>
              )}

              {/* Cryptographic DAG Receipt */}
              {receipt && (
                <div className="mt-4 border border-[#2b3127] bg-[#121611] p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#cfcac0] flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5 text-[#aab98b]" />
                      Merkle DAG Root Hash
                    </span>
                    <button
                      onClick={() => handleCopyReceipt(receipt.rootHash)}
                      className="text-[11px] font-mono text-[#aab98b] hover:underline flex items-center gap-1"
                    >
                      <Copy className="h-3 w-3" />
                      {copiedReceipt ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <div className="font-mono text-[11px] text-[#8a9184] break-all bg-[#090c08] p-2 border border-[#1e241a]">
                    {receipt.rootHash}
                  </div>
                  <div className="flex justify-between text-[10px] font-mono text-[#6c7465]">
                    <span>Algorithm: {receipt.algorithm}</span>
                    <span>Leaves: {receipt.leafCount} items</span>
                  </div>
                </div>
              )}

              {/* Exceptions Preview */}
              {exceptions.length > 0 && (
                <div className="mt-4 space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[#cfcac0]">
                    Detected Discrepancies ({exceptions.length})
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                    {exceptions.map((exc) => (
                      <div
                        key={exc.id}
                        className="flex items-center justify-between border border-[#2b221b] bg-[#161210] p-2 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-3.5 w-3.5 text-[#e06c75] shrink-0" />
                          <span className="font-mono text-[11px] text-[#f0eee5]">
                            {exc.paymentId}
                          </span>
                          <span className="text-[11px] text-[#8a9184] truncate max-w-[240px]">
                            {exc.description}
                          </span>
                        </div>
                        <span className="font-mono font-bold text-[#e06c75]">
                          {exc.formattedAmount}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Webhook Delivery Live Feed & API History */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Webhook Log Stream */}
        <div className="border border-[#242820] bg-[#0d100c] p-5">
          <div className="mb-3 flex items-center justify-between border-b border-[#1f241c] pb-3">
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-[#aab98b]" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-[#e6e2d8]">
                Mock Webhook Listener Stream
              </h2>
            </div>
            <span className="font-mono text-[10px] text-[#7a8174]">
              {webhookLogs.length} events received
            </span>
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {webhookLogs.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#62695d]">
                No webhook events dispatched yet. Trigger an async reconciliation batch to see live callbacks.
              </div>
            ) : (
              webhookLogs.map((log) => (
                <div
                  key={log.id}
                  className="border border-[#1e241a] bg-[#11150f] p-3 text-xs space-y-1.5 font-mono"
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[#aab98b] font-bold">{log.event}</span>
                    <span className="text-[#62695d]">{new Date(log.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div className="text-[10px] text-[#82887b] truncate">URL: {log.url}</div>
                  <div className="text-[10px] text-[#61afef] truncate">Signature: {log.signature}</div>
                  <div className="bg-[#090b08] p-1.5 text-[10px] text-[#cfcac0] overflow-x-auto">
                    {JSON.stringify(log.payload)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Previous API Call History */}
        <div className="border border-[#242820] bg-[#0d100c] p-5">
          <div className="mb-3 flex items-center justify-between border-b border-[#1f241c] pb-3">
            <div className="flex items-center gap-2">
              <FileCode className="h-4 w-4 text-[#aab98b]" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-[#e6e2d8]">
                Recent API Call History
              </h2>
            </div>
            <span className="font-mono text-[10px] text-[#7a8174]">Last 10 executions</span>
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {history.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#62695d]">
                No recent API calls in this session.
              </div>
            ) : (
              history.map((entry, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between border border-[#1e241a] bg-[#11150f] p-2.5 text-xs font-mono"
                >
                  <div>
                    <div className="text-[#f0eee5] font-semibold">{entry.jobId}</div>
                    <div className="text-[10px] text-[#7a8174]">
                      {entry.timestamp} · {entry.rowCount} txns · {entry.mode}
                    </div>
                  </div>
                  <div className="text-right">
                    <span
                      className={`inline-block px-1.5 py-0.5 text-[10px] border ${
                        entry.status === "SUCCESS"
                          ? "border-[#4a5e38] text-[#aab98b]"
                          : entry.status === "ACCEPTED"
                          ? "border-[#605530] text-[#d4af37]"
                          : "border-[#603530] text-[#e06c75]"
                      }`}
                    >
                      {entry.status}
                    </span>
                    <div className="mt-0.5 text-[10px] text-[#62695d]">{entry.latencyMs}ms</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
