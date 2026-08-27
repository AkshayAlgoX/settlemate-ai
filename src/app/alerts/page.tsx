"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  BellRing,
  Play,
  Square,
  Zap,
  Radio,
  Clock,
  AlertTriangle,
  Copy,
  Check,
} from "lucide-react";

import { generateDeterministicAlert } from "@/lib/alerts/alert-types";

interface SmartAlertItem {
  id: string;
  exceptionId: string;
  type: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  title: string;
  description: string;
  amountPaise: number;
  formattedAmount: string;
  channel: string;
  targetUrl: string;
  timestamp: string;
  ruleTriggered: string;
  signature?: string;
  deliveryStatus?: "DELIVERED" | "SIMULATED" | "FAILED";
  statusCode?: number;
  recommendedPlaybook: string;
}

interface AlertChannel {
  id: string;
  name: string;
  targetUrl: string;
  type: string;
  events: string[];
  status: string;
}

const INITIAL_ALERTS: SmartAlertItem[] = [
  {
    ...generateDeterministicAlert(1, true),
    signature: "t=1787845000,v1=7e2072277764f7b7891048291039482019482019482019482019482019482019",
    deliveryStatus: "SIMULATED",
    statusCode: 200,
  },
  {
    ...generateDeterministicAlert(0, false),
    signature: "t=1787844990,v1=862f4ec9945fae504537829910ab384729104827103984728190384720194827",
    deliveryStatus: "SIMULATED",
    statusCode: 200,
  },
];

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<SmartAlertItem[]>(INITIAL_ALERTS);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [isTriggering, setIsTriggering] = useState<boolean>(false);
  const [channels, setChannels] = useState<AlertChannel[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<string>("all");
  const [selectedSeverity, setSelectedSeverity] = useState<string>("all");

  const streamIndexRef = useRef<number>(2);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const triggerAlert = useCallback(async (highRiskOnly: boolean = false, explicitIndex?: number) => {
    setIsTriggering(true);
    try {
      const idx = explicitIndex !== undefined ? explicitIndex : streamIndexRef.current++;
      const res = await fetch("/api/alerts/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index: idx, highRiskOnly }),
      });
      const data = await res.json();
      if (data && data.success && data.alert) {
        setAlerts((prev) => [data.alert, ...prev.slice(0, 49)]);
      }
    } catch (err) {
      console.error("Alert trigger error:", err);
    } finally {
      setIsTriggering(false);
    }
  }, []);

  // Fetch initial channels
  useEffect(() => {
    let mounted = true;
    fetch("/api/alerts/trigger")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (mounted && data?.channels) {
          setChannels(data.channels);
        }
      })
      .catch((err) => console.error("Failed to load channels:", err));

    return () => {
      mounted = false;
    };
  }, []);

  const toggleStream = () => {
    if (isStreaming) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setIsStreaming(false);
    } else {
      setIsStreaming(true);
      // Immediately fire one
      triggerAlert(false);
      // Stream every 3.5 seconds
      timerRef.current = setInterval(() => {
        triggerAlert(false);
      }, 3500);
    }
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  const handleClear = () => {
    setAlerts([]);
  };

  const copySignature = (alertId: string, sig?: string) => {
    if (!sig) return;
    navigator.clipboard.writeText(sig);
    setCopiedId(alertId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredAlerts = alerts.filter((a) => {
    if (selectedSeverity !== "all" && a.severity !== selectedSeverity) return false;
    if (selectedChannel !== "all" && !a.channel.toLowerCase().includes(selectedChannel.toLowerCase())) return false;
    return true;
  });

  const highCount = alerts.filter((a) => a.severity === "HIGH").length;
  const medCount = alerts.filter((a) => a.severity === "MEDIUM").length;
  const lowCount = alerts.filter((a) => a.severity === "LOW").length;
  const totalAmountAtRiskPaise = alerts.reduce((acc, a) => acc + a.amountPaise, 0);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="border border-[#2a2e29] bg-[#0d100d] p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.2em] text-[#a4b58a]">
              <BellRing className="h-4 w-4 text-[#a4b58a]" />
              Smart Alerting Simulator · 🔔 00V
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#e3e1d8]">
              Live Exception Detection &amp; Signed Webhook Escalation
            </h1>
            <p className="mt-1 text-xs text-[#8c9288]">
              Simulates a live automated telemetry stream detecting high-risk reconciliation exceptions. Dispatches HMAC-SHA256 cryptographically signed webhooks to Slack, PagerDuty, and CFO escalation queues.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => triggerAlert(true)}
              disabled={isTriggering}
              className="px-4 py-2 border border-[#592321] bg-[#1c0f0e] hover:bg-[#2d1211] text-[#e89088] text-xs font-bold uppercase tracking-wider flex items-center gap-2"
            >
              <Zap className="h-3.5 w-3.5 fill-current" />
              Trigger High-Risk Alert
            </button>

            <button
              type="button"
              onClick={toggleStream}
              className={`px-5 py-2.5 text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all ${
                isStreaming
                  ? "bg-[#592321] hover:bg-[#6e2c29] text-[#ffd6d3] border border-[#7a322f]"
                  : "bg-[#a4b58a] hover:bg-[#b8c99e] text-[#0d100d]"
              }`}
            >
              {isStreaming ? (
                <>
                  <Square className="h-3.5 w-3.5 fill-current" />
                  Stop Alert Stream
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 fill-current" />
                  Start Alert Stream (3.5s)
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* KPI Overview Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="border border-[#252a24] bg-[#090b09] p-4">
          <div className="text-[9px] font-bold uppercase tracking-wider text-[#687063]">
            Total Streamed Alerts
          </div>
          <div className="mt-1 text-2xl font-mono font-bold text-[#e3e1d8]">
            {alerts.length}
          </div>
          <div className="mt-1 text-[10px] text-[#8c9288] flex items-center gap-1.5">
            {isStreaming ? (
              <span className="flex items-center gap-1 text-[#a4b58a]">
                <span className="h-2 w-2 rounded-full bg-[#a4b58a] animate-ping" />
                Live streaming active
              </span>
            ) : (
              <span>Stream paused</span>
            )}
          </div>
        </div>

        <div className="border border-[#252a24] bg-[#090b09] p-4">
          <div className="text-[9px] font-bold uppercase tracking-wider text-[#687063]">
            High-Risk Critical Alerts
          </div>
          <div className="mt-1 text-2xl font-mono font-bold text-[#d9776f]">
            {highCount}
          </div>
          <div className="mt-1 text-[10px] text-[#687063]">
            {medCount} Medium · {lowCount} Low
          </div>
        </div>

        <div className="border border-[#252a24] bg-[#090b09] p-4">
          <div className="text-[9px] font-bold uppercase tracking-wider text-[#687063]">
            Total Amount At Risk
          </div>
          <div className="mt-1 text-2xl font-mono font-bold text-[#e3e1d8]">
            ₹{(totalAmountAtRiskPaise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </div>
          <div className="mt-1 text-[10px] text-[#8c9288]">
            Exact integer paise accounting
          </div>
        </div>

        <div className="border border-[#252a24] bg-[#090b09] p-4">
          <div className="text-[9px] font-bold uppercase tracking-wider text-[#687063]">
            HMAC Delivery Status
          </div>
          <div className="mt-1 text-2xl font-mono font-bold text-[#a4b58a]">
            100%
          </div>
          <div className="mt-1 text-[10px] text-[#8c9288]">
            SHA-256 signed payloads
          </div>
        </div>
      </div>

      {/* Webhook Destinations & Registered Channels Bar */}
      <div className="border border-[#252a24] bg-[#090b09] p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-bold uppercase tracking-wider text-[#e3e1d8] flex items-center gap-2">
            <Radio className="h-4 w-4 text-[#a4b58a]" />
            Registered Escalation Webhook Channels
          </div>
          <span className="text-[10px] font-mono text-[#687063]">
            All payloads signed with HMAC-SHA256
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {channels.map((chan) => (
            <div
              key={chan.id}
              className="p-3 border border-[#1f241d] bg-[#060806] space-y-1.5 font-mono text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#e3e1d8] text-[11px] truncate">
                  {chan.name}
                </span>
                <span className="px-1.5 py-0.2 text-[8px] bg-[#142211] border border-[#3e5532] text-[#a4b58a]">
                  {chan.status}
                </span>
              </div>
              <div className="text-[9px] text-[#687063] truncate">
                {chan.targetUrl}
              </div>
              <div className="text-[9px] text-[#8c9288]">
                Type: <strong className="text-[#a4b58a]">{chan.type}</strong>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Filters and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono font-bold text-[#687063] uppercase">
              Severity:
            </span>
            {["all", "HIGH", "MEDIUM", "LOW"].map((sev) => (
              <button
                key={sev}
                type="button"
                onClick={() => setSelectedSeverity(sev)}
                className={`px-2.5 py-1 text-[10px] font-mono font-bold border transition-all ${
                  selectedSeverity === sev
                    ? "bg-[#151a12] border-[#505a42] text-[#f0eee6]"
                    : "border-[#252a24] bg-[#090b09] text-[#8c9288] hover:text-[#e3e1d8]"
                }`}
              >
                {sev.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono font-bold text-[#687063] uppercase">
              Channel:
            </span>
            {[
              { id: "all", label: "ALL" },
              { id: "slack", label: "SLACK" },
              { id: "pagerduty", label: "PAGERDUTY" },
              { id: "email", label: "EMAIL" },
            ].map((chan) => (
              <button
                key={chan.id}
                type="button"
                onClick={() => setSelectedChannel(chan.id)}
                className={`px-2.5 py-1 text-[10px] font-mono font-bold border transition-all ${
                  selectedChannel === chan.id
                    ? "bg-[#151a12] border-[#505a42] text-[#f0eee6]"
                    : "border-[#252a24] bg-[#090b09] text-[#8c9288] hover:text-[#e3e1d8]"
                }`}
              >
                {chan.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {alerts.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              className="px-3 py-1 text-[10px] font-mono border border-[#252a24] bg-[#090b09] text-[#8c9288] hover:text-[#e3e1d8]"
            >
              Clear Feed ({alerts.length})
            </button>
          )}
        </div>
      </div>

      {/* Live Activity Feed */}
      <div className="space-y-3">
        {filteredAlerts.length > 0 ? (
          filteredAlerts.map((alert) => {
            const isHigh = alert.severity === "HIGH";
            const isMed = alert.severity === "MEDIUM";

            return (
              <div
                key={alert.id}
                className={`border p-5 transition-all space-y-3 ${
                  isHigh
                    ? "border-[#592321] bg-[#0f0909]"
                    : isMed
                    ? "border-[#54411f] bg-[#0f0d08]"
                    : "border-[#252a24] bg-[#090b09]"
                }`}
              >
                {/* Alert Top Line */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-2 py-0.5 text-[9px] font-mono font-bold border flex items-center gap-1 ${
                        isHigh
                          ? "bg-[#22100f] border-[#592321] text-[#e89088]"
                          : isMed
                          ? "bg-[#241c0e] border-[#54411f] text-[#d9aa6f]"
                          : "bg-[#142211] border-[#3e5532] text-[#a4b58a]"
                      }`}
                    >
                      {isHigh ? <AlertTriangle className="h-3 w-3" /> : <BellRing className="h-3 w-3" />}
                      {alert.severity} SEVERITY
                    </span>

                    <span className="text-[10px] font-mono font-bold text-[#687063]">
                      {alert.id}
                    </span>

                    <span className="px-2 py-0.2 text-[9px] font-mono bg-[#11140f] border border-[#252a24] text-[#a4b58a]">
                      {alert.type}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 font-mono text-[10px] text-[#687063]">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(alert.timestamp).toLocaleTimeString()}
                    </span>
                    <span className="px-2 py-0.5 bg-[#142211] border border-[#3e5532] text-[#a4b58a] font-bold">
                      {alert.deliveryStatus || "SIMULATED"}
                    </span>
                  </div>
                </div>

                {/* Alert Body */}
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-[#e3e1d8]">
                      {alert.title}
                    </h3>
                    <p className="text-xs text-[#8c9288] leading-relaxed">
                      {alert.description}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-[9px] font-bold uppercase tracking-wider text-[#687063]">
                      Amount At Risk
                    </div>
                    <div className="text-base font-mono font-bold text-[#e3e1d8] mt-0.5">
                      {alert.formattedAmount}
                    </div>
                  </div>
                </div>

                {/* Bottom Meta Strip */}
                <div className="pt-3 border-t border-[#1f241d] flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                  <div className="flex flex-wrap items-center gap-3 text-[10px] font-mono text-[#8c9288]">
                    <span>
                      Target: <strong className="text-[#e3e1d8]">{alert.channel}</strong>
                    </span>
                    <span>·</span>
                    <span>
                      Playbook: <strong className="text-[#a4b58a]">{alert.recommendedPlaybook}</strong>
                    </span>
                  </div>

                  {alert.signature && (
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-mono text-[#687063]">
                        HMAC-SHA256: {alert.signature.slice(0, 24)}...
                      </span>
                      <button
                        type="button"
                        onClick={() => copySignature(alert.id, alert.signature)}
                        className="px-2 py-0.5 border border-[#252a24] bg-[#060806] hover:bg-[#121611] text-[#8c9288] text-[9px] font-mono flex items-center gap-1"
                      >
                        {copiedId === alert.id ? <Check className="h-2.5 w-2.5 text-[#a4b58a]" /> : <Copy className="h-2.5 w-2.5" />}
                        {copiedId === alert.id ? "Copied" : "Copy Signature"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="border border-dashed border-[#252a24] bg-[#090b09] p-12 text-center space-y-3">
            <div className="mx-auto w-12 h-12 border border-[#3e4d36] bg-[#11160f] flex items-center justify-center">
              <BellRing className="h-6 w-6 text-[#a4b58a]" />
            </div>
            <h3 className="text-sm font-bold text-[#e3e1d8]">
              Alert Activity Feed Is Clear
            </h3>
            <p className="text-xs text-[#8c9288] max-w-md mx-auto">
              Click <strong>&quot;Start Alert Stream&quot;</strong> or <strong>&quot;Trigger High-Risk Alert&quot;</strong> above to simulate real-time exception detection and signed webhook delivery.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
