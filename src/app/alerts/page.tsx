"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Clock,
  Copy,
  Check,
} from "lucide-react";
import { generateDeterministicAlert } from "@/lib/alerts/alert-types";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Badge } from "@/components/ui/badge";
import { formatAuditTime } from "@/lib/format";

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
      triggerAlert(false);
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
    <div className="space-y-10 pb-12">
      {/* Header */}
      <PageHeader
        tag="Smart Alerting"
        title="Exception detection & webhook escalation"
        description="Automated telemetry stream detecting reconciliation anomalies with HMAC-SHA256 cryptographically signed webhook dispatch."
        badge={<Badge variant="outline">Webhook Delivery</Badge>}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => triggerAlert(true)}
              disabled={isTriggering}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#3b1818] bg-[#140a0a] px-3 text-xs font-medium text-[#ef4444] hover:bg-[#1f0f0f] transition"
            >
              <span>Trigger high-risk alert</span>
            </button>

            <button
              type="button"
              onClick={toggleStream}
              className={`inline-flex h-8 items-center rounded-md px-3.5 text-xs font-medium transition ${
                isStreaming
                  ? "bg-[#ef4444] text-[#ffffff] hover:bg-[#dc2626]"
                  : "bg-primary text-primary-foreground hover:bg-[#ffffff]"
              }`}
            >
              <span>{isStreaming ? "Stop stream" : "Start stream (3.5s)"}</span>
            </button>
          </div>
        }
      />

      {/* KPI Overview Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-lg border border-border bg-card p-4 space-y-1">
          <div className="text-2xl font-mono font-semibold tracking-tight text-foreground">
            {alerts.length}
          </div>
          <div className="text-xs font-medium text-foreground">
            Streamed alerts
          </div>
          <div className="text-[11px] text-muted-foreground/70">
            {isStreaming ? "Streaming active" : "Paused"}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 space-y-1">
          <div className="text-2xl font-mono font-semibold tracking-tight text-[#ef4444]">
            {highCount}
          </div>
          <div className="text-xs font-medium text-foreground">
            High-risk critical alerts
          </div>
          <div className="text-[11px] text-muted-foreground/70">
            {medCount} Medium · {lowCount} Low
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 space-y-1">
          <div className="text-2xl font-mono font-semibold tracking-tight text-foreground">
            ₹{(totalAmountAtRiskPaise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </div>
          <div className="text-xs font-medium text-foreground">
            Amount at risk
          </div>
          <div className="text-[11px] text-muted-foreground/70">
            Exact integer paise
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 space-y-1">
          <div className="text-2xl font-mono font-semibold tracking-tight text-foreground">
            100%
          </div>
          <div className="text-xs font-medium text-foreground">
            HMAC delivery status
          </div>
          <div className="text-[11px] text-muted-foreground/70">
            SHA-256 signed payloads
          </div>
        </div>
      </div>

      {/* Webhook Destinations & Registered Channels Bar */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <SectionHeader
          title="Registered escalation channels"
          description="Payloads signed with HMAC-SHA256."
          className="border-b-0 pb-0"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {channels.map((chan) => (
            <div
              key={chan.id}
              className="p-3.5 rounded-md border border-border bg-background space-y-1 font-mono text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground text-xs truncate">
                  {chan.name}
                </span>
                <Badge variant="outline">
                  {chan.status}
                </Badge>
              </div>
              <div className="text-[11px] text-muted-foreground/70 truncate">
                {chan.targetUrl}
              </div>
              <div className="text-[11px] text-muted-foreground">
                Type: <strong className="text-foreground">{chan.type}</strong>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Filters and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">
              Severity:
            </span>
            <div className="inline-flex rounded-md border border-border bg-card p-0.5">
              {["all", "HIGH", "MEDIUM", "LOW"].map((sev) => (
                <button
                  key={sev}
                  type="button"
                  onClick={() => setSelectedSeverity(sev)}
                  className={`h-6 px-2 text-[11px] font-medium rounded transition ${
                    selectedSeverity === sev
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {sev}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">
              Channel:
            </span>
            <div className="inline-flex rounded-md border border-border bg-card p-0.5">
              {[
                { id: "all", label: "All" },
                { id: "slack", label: "Slack" },
                { id: "pagerduty", label: "PagerDuty" },
                { id: "email", label: "Email" },
              ].map((chan) => (
                <button
                  key={chan.id}
                  type="button"
                  onClick={() => setSelectedChannel(chan.id)}
                  className={`h-6 px-2 text-[11px] font-medium rounded transition ${
                    selectedChannel === chan.id
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {chan.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {alerts.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            className="h-7 px-2.5 rounded border border-border bg-card text-xs text-muted-foreground hover:text-foreground transition"
          >
            Clear feed ({alerts.length})
          </button>
        )}
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
                className="rounded-lg border border-border bg-card p-5 space-y-3"
              >
                {/* Alert Top Line */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <Badge variant={isHigh ? "destructive" : isMed ? "warning" : "secondary"}>
                      {alert.severity}
                    </Badge>

                    <span className="text-xs font-mono text-muted-foreground/70">
                      {alert.id}
                    </span>

                    <span className="text-xs font-mono text-muted-foreground">
                      {alert.type}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 font-mono text-xs text-muted-foreground/70">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatAuditTime(alert.timestamp)}
                    </span>
                    <Badge variant="outline">
                      {alert.deliveryStatus || "SIMULATED"}
                    </Badge>
                  </div>
                </div>

                {/* Alert Body */}
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-foreground">
                      {alert.title}
                    </h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {alert.description}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-xs text-muted-foreground">
                      Amount at risk
                    </div>
                    <div className="text-base font-mono font-semibold text-foreground mt-0.5">
                      {alert.formattedAmount}
                    </div>
                  </div>
                </div>

                {/* Bottom Meta Strip */}
                <div className="pt-3 border-t border-border flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-muted-foreground">
                    <span>Target: <strong className="text-foreground">{alert.channel}</strong></span>
                    <span>·</span>
                    <span>Playbook: <strong className="text-foreground">{alert.recommendedPlaybook}</strong></span>
                  </div>

                  {alert.signature && (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-muted-foreground/70">
                        HMAC-SHA256: {alert.signature.slice(0, 24)}...
                      </span>
                      <button
                        type="button"
                        onClick={() => copySignature(alert.id, alert.signature)}
                        className="h-6 px-2 rounded border border-border bg-background text-muted-foreground hover:text-foreground text-[11px] font-mono flex items-center gap-1 transition"
                      >
                        {copiedId === alert.id ? <Check className="h-3 w-3 text-[#10b981]" /> : <Copy className="h-3 w-3" />}
                        <span>{copiedId === alert.id ? "Copied" : "Copy signature"}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center space-y-2">
            <h3 className="text-sm font-semibold text-foreground">
              Alert activity feed is clear
            </h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Click <strong>&quot;Start stream&quot;</strong> or <strong>&quot;Trigger high-risk alert&quot;</strong> to simulate exception detection and signed webhook delivery.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
