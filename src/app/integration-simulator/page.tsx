"use client";

import { useState, useEffect, useTransition } from "react";
import {
  RotateCw,
  Dices,
  Send,
  AlertTriangle,
  Copy,
  Clock,
} from "lucide-react";
import {
  generateSimulatorBatch,
  type SimulatorBatchResult,
  type AnomalyConfig,
} from "@/lib/simulator/simulator-generator";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Badge } from "@/components/ui/badge";
import { formatAuditTime } from "@/lib/format";

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
        timestamp: formatAuditTime(new Date()),
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
    <div className="space-y-10 pb-12">
      {/* Page Header */}
      <PageHeader
        tag="Developer Integration"
        title="Integration simulator"
        description="Simulate external ERP / E-Commerce batch ingestion, webhook stream callbacks, and REST API contracts."
        badge={<Badge variant="outline">API v1</Badge>}
      />

      {/* Grid Layout: Controls & Ingestion */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Synthetic Generator Controls */}
        <div className="space-y-6 lg:col-span-5">
          <div className="rounded-lg border border-border bg-card p-5 space-y-4">
            <SectionHeader
              title="Batch generator"
              description="Deterministic PRNG synthetic test batch."
              className="border-b-0 pb-0"
            />

            <div className="space-y-4">
              {/* Row Count Slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Batch Rows (50 - 200)</span>
                  <span className="font-mono font-semibold text-foreground">{rowCount} txns</span>
                </div>
                <input
                  type="range"
                  min={50}
                  max={200}
                  step={5}
                  value={rowCount}
                  onChange={(e) => setRowCount(Number(e.target.value))}
                  className="w-full accent-[#ededed] cursor-pointer"
                />
              </div>

              {/* PRNG Seed */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>PRNG Seed</span>
                  <span className="font-mono text-muted-foreground/70"># {seed}</span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={seed}
                    onChange={(e) => setSeed(Number(e.target.value))}
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs font-mono text-foreground focus:border-foreground/40 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleRandomizeSeed}
                    title="Randomize Seed"
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs text-foreground hover:bg-accent transition"
                  >
                    <Dices className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>Dice</span>
                  </button>
                </div>
              </div>

              {/* Anomaly Distribution Sliders */}
              <div className="border-t border-border pt-4 space-y-3">
                <div className="text-xs font-semibold text-foreground">
                  Anomaly Injection Rates
                </div>

                {/* Partial Refund */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>Partial Refund (15% gap)</span>
                    <span className="font-mono text-foreground">
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
                    className="w-full accent-[#ededed] cursor-pointer"
                  />
                </div>

                {/* Fee Mismatch */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>Fee Overcharge (150 vs 300 bps)</span>
                    <span className="font-mono text-foreground">
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
                    className="w-full accent-[#ededed] cursor-pointer"
                  />
                </div>

                {/* Duplicate Settlement */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>Duplicate Settlement</span>
                    <span className="font-mono text-foreground">
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
                    className="w-full accent-[#ededed] cursor-pointer"
                  />
                </div>

                {/* Orphan Bank Credit */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>Orphan Bank Credit</span>
                    <span className="font-mono text-foreground">
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
                    className="w-full accent-[#ededed] cursor-pointer"
                  />
                </div>
              </div>

              {/* Generate Button */}
              <button
                type="button"
                onClick={handleGenerate}
                className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-border bg-card text-xs font-medium text-foreground hover:bg-accent transition"
              >
                <RotateCw className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Regenerate batch ({batch?.transactions.length || 0} records)</span>
              </button>
            </div>
          </div>

          {/* Webhook Configuration Panel */}
          <div className="rounded-lg border border-border bg-card p-5 space-y-3">
            <SectionHeader
              title="External webhook listener"
              description="HMAC-SHA256 signed callbacks."
              className="border-b-0 pb-0"
            />

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-muted-foreground block mb-1">Destination Webhook Endpoint</label>
                <input
                  type="text"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs font-mono text-foreground focus:border-foreground/40 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleRegisterWebhook}
                  disabled={isRegisteringWebhook}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs text-foreground hover:bg-accent disabled:opacity-50 transition"
                >
                  <Send className="h-3 w-3 text-muted-foreground" />
                  <span>{isRegisteringWebhook ? "Registering..." : "Register webhook"}</span>
                </button>

                {registeredWebhookStatus && (
                  <span className="font-mono text-xs text-foreground">
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
          <div className="rounded-lg border border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <SectionHeader
                title="REST API pipeline"
                description="Simulate HTTP ingestion requests."
                className="border-b-0 pb-0"
              />
              <span className="font-mono text-xs text-muted-foreground">POST /api/v1/reconcile</span>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-muted-foreground block mb-1">API Key Header (X-API-Key)</label>
                  <input
                    type="text"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs font-mono text-foreground focus:border-foreground/40 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-muted-foreground block mb-1">Execution Mode</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setAsyncMode(false)}
                      className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition ${
                        !asyncMode
                          ? "border-[#ededed] bg-accent text-foreground"
                          : "border-border bg-background text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Sync (200 OK)
                    </button>
                    <button
                      type="button"
                      onClick={() => setAsyncMode(true)}
                      className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition ${
                        asyncMode
                          ? "border-[#ededed] bg-accent text-foreground"
                          : "border-border bg-background text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Async Webhook (202)
                    </button>
                  </div>
                </div>
              </div>

              {/* Batch Summary Bar */}
              {batch && (
                <div className="grid grid-cols-4 gap-2 rounded-md border border-border bg-background p-3 text-center">
                  <div>
                    <div className="text-xs text-muted-foreground">Total rows</div>
                    <div className="font-mono text-sm font-semibold text-foreground">
                      {batch.transactions.length}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Clean matches</div>
                    <div className="font-mono text-sm font-semibold text-foreground">
                      {batch.stats.cleanTxnCount}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Variances</div>
                    <div className="font-mono text-sm font-semibold text-[#ef4444]">
                      {batch.stats.partialRefundCount + batch.stats.feeMismatchCount}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Orphans / dupes</div>
                    <div className="font-mono text-sm font-semibold text-[#ef4444]">
                      {batch.stats.duplicateCount + batch.stats.orphanCount}
                    </div>
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="button"
                onClick={handleSendToApi}
                disabled={isSubmitting || !batch}
                className="inline-flex h-9 w-full items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-medium text-primary-foreground hover:bg-[#ffffff] disabled:opacity-50 transition"
              >
                {isSubmitting ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#000000] border-t-transparent mr-2" />
                    <span>Executing multi-pass engine...</span>
                  </>
                ) : (
                  <span>Send batch to REST API ({asyncMode ? "Async + Webhook" : "Sync"})</span>
                )}
              </button>
            </div>
          </div>

          {/* Response & Decision Receipt Card */}
          {apiResponse && (
            <div className="rounded-lg border border-border bg-card p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <SectionHeader
                  title="Response & decision receipt"
                  className="border-b-0 pb-0"
                />
                <div className="flex items-center gap-2">
                  <Badge variant={responseStatus === 200 ? "success" : responseStatus === 202 ? "secondary" : "destructive"}>
                    HTTP {responseStatus}
                  </Badge>
                  {latency !== null && (
                    <span className="font-mono text-xs text-muted-foreground/70 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {latency}ms
                    </span>
                  )}
                </div>
              </div>

              {/* Summary Stats */}
              {summary && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-md border border-border bg-background p-3 text-center space-y-0.5">
                    <div className="text-xs text-muted-foreground">Auto-matched</div>
                    <div className="font-mono text-base font-semibold text-foreground">
                      {summary.autoMatched}
                    </div>
                  </div>
                  <div className="rounded-md border border-border bg-background p-3 text-center space-y-0.5">
                    <div className="text-xs text-muted-foreground">Suggested</div>
                    <div className="font-mono text-base font-semibold text-foreground">
                      {summary.suggested}
                    </div>
                  </div>
                  <div className="rounded-md border border-border bg-background p-3 text-center space-y-0.5">
                    <div className="text-xs text-muted-foreground">Exceptions</div>
                    <div className="font-mono text-base font-semibold text-[#ef4444]">
                      {summary.exception}
                    </div>
                  </div>
                  <div className="rounded-md border border-border bg-background p-3 text-center space-y-0.5">
                    <div className="text-xs text-muted-foreground">Match rate</div>
                    <div className="font-mono text-base font-semibold text-foreground">
                      {summary.matchRatePct}%
                    </div>
                  </div>
                </div>
              )}

              {/* Cryptographic DAG Receipt */}
              {receipt && (
                <div className="rounded-md border border-border bg-background p-3.5 space-y-2 text-xs font-mono">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">
                      Merkle DAG Root Hash
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyReceipt(receipt.rootHash)}
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                    >
                      <Copy className="h-3 w-3" />
                      <span>{copiedReceipt ? "Copied" : "Copy"}</span>
                    </button>
                  </div>
                  <div className="text-[11px] text-muted-foreground break-all bg-card p-2 rounded border border-border">
                    {receipt.rootHash}
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground/70">
                    <span>Algorithm: {receipt.algorithm}</span>
                    <span>Leaves: {receipt.leafCount} items</span>
                  </div>
                </div>
              )}

              {/* Exceptions Preview */}
              {exceptions.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-foreground">
                    Detected Discrepancies ({exceptions.length})
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                    {exceptions.map((exc) => (
                      <div
                        key={exc.id}
                        className="flex items-center justify-between rounded border border-border bg-background p-2 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-3.5 w-3.5 text-[#ef4444] shrink-0" />
                          <span className="font-mono text-[11px] text-foreground">
                            {exc.paymentId}
                          </span>
                          <span className="text-xs text-muted-foreground truncate max-w-[240px]">
                            {exc.description}
                          </span>
                        </div>
                        <span className="font-mono font-semibold text-[#ef4444]">
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
        <div className="rounded-lg border border-border bg-card p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <SectionHeader
              title="Webhook stream"
              description={`${webhookLogs.length} events logged`}
              className="border-b-0 pb-0"
            />
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {webhookLogs.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground/70">
                No webhook events dispatched yet. Trigger an async reconciliation batch to view live callbacks.
              </div>
            ) : (
              webhookLogs.map((log) => (
                <div
                  key={log.id}
                  className="rounded border border-border bg-background p-3 text-xs space-y-1 font-mono"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-foreground font-medium">{log.event}</span>
                    <span className="text-muted-foreground/70">{formatAuditTime(log.timestamp)}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">URL: {log.url}</div>
                  <div className="text-[11px] text-muted-foreground/70 truncate">Signature: {log.signature}</div>
                  <div className="bg-card p-2 rounded text-[11px] text-muted-foreground overflow-x-auto border border-border">
                    {JSON.stringify(log.payload)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Previous API Call History */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <SectionHeader
              title="Recent API call history"
              description="Last 10 executions"
              className="border-b-0 pb-0"
            />
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {history.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground/70">
                No recent API calls in this session.
              </div>
            ) : (
              history.map((entry, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded border border-border bg-background p-2.5 text-xs font-mono"
                >
                  <div>
                    <div className="text-foreground font-medium">{entry.jobId}</div>
                    <div className="text-[11px] text-muted-foreground/70">
                      {entry.timestamp} · {entry.rowCount} txns · {entry.mode}
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant={entry.status === "SUCCESS" ? "success" : entry.status === "ACCEPTED" ? "secondary" : "destructive"}>
                      {entry.status}
                    </Badge>
                    <div className="mt-0.5 text-[11px] text-muted-foreground/70">{entry.latencyMs}ms</div>
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
