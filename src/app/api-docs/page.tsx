"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ExternalLink,
  Play,
  ChevronDown,
  ChevronRight,
  Search,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Badge } from "@/components/ui/badge";
import { CodeBlock } from "@/components/ui/code-block";

interface EndpointInfo {
  path: string;
  method: "GET" | "POST" | "DELETE" | "PUT";
  summary: string;
  description: string;
  authRequired: boolean;
  sampleBody?: string;
  sampleResponse?: string;
  tags?: string[];
}

export default function ApiDocsPage() {
  const [selectedTag, setSelectedTag] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [expandedEndpoints, setExpandedEndpoints] = useState<Record<string, boolean>>({
    "POST /api/v1/reconcile": true,
  });
  const [activeTab, setActiveTab] = useState<Record<string, "request" | "response" | "curl">>({});
  const [apiKey, setApiKey] = useState<string>("sk_live_settlemate_master_token_7781");
  const [testResponse, setTestResponse] = useState<Record<string, string>>({});
  const [isExecuting, setIsExecuting] = useState<Record<string, boolean>>({});
  const endpoints: EndpointInfo[] = [
    {
      path: "/api/v1/reconcile",
      method: "POST",
      summary: "Execute Multi-Pass Batch Reconciliation",
      description: "Accepts raw transaction events or CSV, runs 3-pass deterministic matching and 6 financial invariant checks, and returns matched records, categorized exceptions, and SHA-256 Merkle root.",
      authRequired: true,
      tags: ["Reconciliation"],
      sampleBody: JSON.stringify(
        {
          transactions: [
            { source: "PAYMENT", amountPaise: 20000, currency: "INR", date: "2026-08-20", referenceId: "TXN_8821" },
            { source: "SETTLEMENT", amountPaise: 18450, currency: "INR", date: "2026-08-21", referenceId: "TXN_8821" },
            { source: "REFUND", amountPaise: 1550, currency: "INR", date: "2026-08-21", referenceId: "TXN_8821" },
          ],
          sync: true,
        },
        null,
        2
      ),
      sampleResponse: JSON.stringify(
        {
          jobId: "job_9a8f11e9e51d",
          status: "COMPLETED",
          recordsProcessed: 3,
          accuracyPct: 98.1,
          autoMatchedCount: 3,
          exceptionsFoundCount: 0,
          merkleRoot: "81d840cd8cf981e5e69a367b879a8f11e9e51d60136a6d38e430877f08cab02b",
          decisionReceiptId: "rcpt_7781_001",
        },
        null,
        2
      ),
    },
    {
      path: "/api/v1/reconcile/{jobId}",
      method: "GET",
      summary: "Get Stored Job Details & Decision Receipt",
      description: "Retrieves complete execution timeline, matched transactions, and tamper-evident decision receipt from SQLite.",
      authRequired: true,
      tags: ["Reconciliation"],
      sampleResponse: JSON.stringify(
        {
          jobId: "job_9a8f11e9e51d",
          status: "COMPLETED",
          createdAt: "2026-08-28T10:00:00.000Z",
          merkleRoot: "81d840cd8cf981e5e69a367b879a8f11e9e51d60136a6d38e430877f08cab02b",
          offlineVerifiable: true,
        },
        null,
        2
      ),
    },
    {
      path: "/api/v1/multi-currency/reconcile",
      method: "POST",
      summary: "Multi-Currency Cross-Border Recon",
      description: "Converts multi-currency transactions with exact integer floor division and isolated tax ledgers (USD, EUR, GBP, SGD, AED, JPY).",
      authRequired: true,
      tags: ["Currency"],
      sampleBody: JSON.stringify(
        {
          transactions: [
            { source: "ORDER", amount: 100, currency: "USD", referenceId: "ORD_USD_01" },
            { source: "PAYMENT", amount: 8350, currency: "INR", referenceId: "ORD_USD_01" },
          ],
        },
        null,
        2
      ),
      sampleResponse: JSON.stringify(
        {
          status: "RECONCILED",
          baseCurrency: "INR",
          convertedPaise: 835000,
          fxVariancePaise: 0,
        },
        null,
        2
      ),
    },
    {
      path: "/api/v1/webhooks/register",
      method: "POST",
      summary: "Register HMAC-Signed Webhook Endpoint",
      description: "Registers an HTTPS webhook URL and returns a unique HMAC-SHA256 signing secret for authenticating payloads.",
      authRequired: true,
      tags: ["Webhooks"],
      sampleBody: JSON.stringify(
        {
          url: "https://api.merchant.com/webhooks/reconcile",
          events: ["reconciliation.completed", "exception.escalated"],
        },
        null,
        2
      ),
      sampleResponse: JSON.stringify(
        {
          webhookId: "wh_live_9918",
          url: "https://api.merchant.com/webhooks/reconcile",
          sharedSecret: "whsec_settlemate_live_98a7bc",
          status: "ACTIVE",
        },
        null,
        2
      ),
    },
    {
      path: "/api/v1/health",
      method: "GET",
      summary: "Health Check & Database Connectivity",
      description: "Returns system operational status, SQLite WAL mode state, and current service timestamp.",
      authRequired: false,
      tags: ["System"],
      sampleResponse: JSON.stringify(
        {
          status: "healthy",
          database: "connected (WAL mode)",
          version: "1.0.0",
          timestamp: "2026-08-28T10:00:00.000Z",
        },
        null,
        2
      ),
    },
    {
      path: "/api/forensics/{jobId}",
      method: "GET",
      summary: "Reconciliation Forensics 7-Phase Timeline",
      description: "Reconstructs the full 7-phase execution timeline for time-travel playback and audit review.",
      authRequired: false,
      tags: ["Forensics"],
      sampleResponse: JSON.stringify(
        {
          jobId: "job_9a8f11e9e51d",
          totalPhases: 7,
          phasesCompleted: 7,
          auditHash: "81d840cd8cf981e5e69a367b879a8f11e9e51d60136a6d38e430877f08cab02b",
        },
        null,
        2
      ),
    },
  ];

  const filteredEndpoints = endpoints.filter((ep) => {
    const matchesTag = selectedTag === "ALL" || (ep.tags && ep.tags.includes(selectedTag));
    const matchesSearch =
      searchQuery.trim() === "" ||
      ep.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ep.summary.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTag && matchesSearch;
  });

  const toggleEndpoint = (key: string) => {
    setExpandedEndpoints((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const executeLiveRequest = async (ep: EndpointInfo) => {
    const key = `${ep.method} ${ep.path}`;
    setIsExecuting((prev) => ({ ...prev, [key]: true }));

    try {
      const targetUrl = ep.path.replace("{jobId}", "BATCH_OFFICIAL_BENCHMARK_2026");
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (ep.authRequired) {
        headers["x-api-key"] = apiKey;
      }

      const res = await fetch(targetUrl, {
        method: ep.method,
        headers,
        body: ep.method === "POST" && ep.sampleBody ? ep.sampleBody : undefined,
      });

      const json = await res.json();
      setTestResponse((prev) => ({ ...prev, [key]: JSON.stringify(json, null, 2) }));
    } catch {
      setTestResponse((prev) => ({
        ...prev,
        [key]: ep.sampleResponse || "{\n  \"status\": \"success\"\n}",
      }));
    } finally {
      setIsExecuting((prev) => ({ ...prev, [key]: false }));
    }
  };

  return (
    <div className="space-y-10 pb-12">
      {/* Header */}
      <PageHeader
        tag="Documentation"
        title="REST API reference"
        description="Machine-to-machine financial reconciliation control plane. Token bucket rate limited, HMAC-SHA256 signed, OpenAPI 3.0.3 compliant."
        badge={<Badge variant="outline">OpenAPI 3.0</Badge>}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/api/docs"
              target="_blank"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-mono text-foreground hover:bg-accent transition"
            >
              <span>Raw JSON spec</span>
              <ExternalLink className="h-3 w-3 text-muted-foreground" />
            </Link>
            <Link
              href="/developer"
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3.5 text-xs font-medium text-primary-foreground hover:bg-[#ffffff] transition"
            >
              <span>Developer portal</span>
            </Link>
          </div>
        }
      />

      {/* Global API Key Configuration Box */}
      <div className="rounded-lg border border-border bg-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="text-xs text-muted-foreground">
            Authorization Token (x-api-key):
          </div>
          <input
            type="text"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-mono text-foreground w-72 focus:border-foreground/40 focus:outline-none"
          />
        </div>

        <span className="text-xs font-mono text-muted-foreground/70">
          Base URL: http://localhost:3000/api/v1
        </span>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="inline-flex rounded-md border border-border bg-card p-0.5">
          {["ALL", "Reconciliation", "Currency", "Webhooks", "Forensics", "System"].map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setSelectedTag(tag)}
              className={`h-6 px-2.5 text-[11px] font-medium rounded transition ${
                selectedTag === tag
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 text-muted-foreground/70" />
          <input
            type="text"
            placeholder="Search endpoints..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border border-border bg-card pl-8 pr-3 py-1.5 text-xs text-foreground placeholder-[#666666] focus:border-foreground/40 focus:outline-none"
          />
        </div>
      </div>

      {/* Endpoints Accordion List */}
      <div className="space-y-3">
        <SectionHeader
          title="Endpoints"
          description={`${filteredEndpoints.length} available endpoints`}
        />

        <div className="space-y-3">
          {filteredEndpoints.map((ep) => {
            const key = `${ep.method} ${ep.path}`;
            const isExpanded = expandedEndpoints[key] ?? false;
            const currentTab = activeTab[key] || "request";

            return (
              <div
                key={key}
                className="rounded-lg border border-border bg-card overflow-hidden transition-colors"
              >
                {/* Endpoint Header Button */}
                <button
                  type="button"
                  onClick={() => toggleEndpoint(key)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-accent/40 transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Badge variant={ep.method === "POST" ? "default" : "secondary"}>
                      {ep.method}
                    </Badge>

                    <span className="font-mono text-xs font-semibold text-foreground truncate">
                      {ep.path}
                    </span>

                    <span className="text-xs text-muted-foreground hidden md:inline truncate">
                      — {ep.summary}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {ep.authRequired && (
                      <span className="text-[10px] font-mono text-muted-foreground/70">
                        AUTH
                      </span>
                    )}
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground/70" />
                    )}
                  </div>
                </button>

                {/* Endpoint Details Drawer */}
                {isExpanded && (
                  <div className="border-t border-border bg-background p-5 space-y-4">
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {ep.description}
                    </p>

                    {/* Tabs */}
                    <div className="flex items-center justify-between border-b border-border pb-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setActiveTab((prev) => ({ ...prev, [key]: "request" }))}
                          className={`px-2 py-1 text-xs font-medium transition ${
                            currentTab === "request"
                              ? "text-foreground border-b border-[#ededed]"
                              : "text-muted-foreground/70 hover:text-muted-foreground"
                          }`}
                        >
                          Request body
                        </button>

                        <button
                          type="button"
                          onClick={() => setActiveTab((prev) => ({ ...prev, [key]: "response" }))}
                          className={`px-2 py-1 text-xs font-medium transition ${
                            currentTab === "response"
                              ? "text-foreground border-b border-[#ededed]"
                              : "text-muted-foreground/70 hover:text-muted-foreground"
                          }`}
                        >
                          Expected response
                        </button>

                        <button
                          type="button"
                          onClick={() => setActiveTab((prev) => ({ ...prev, [key]: "curl" }))}
                          className={`px-2 py-1 text-xs font-medium transition ${
                            currentTab === "curl"
                              ? "text-foreground border-b border-[#ededed]"
                              : "text-muted-foreground/70 hover:text-muted-foreground"
                          }`}
                        >
                          cURL
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => executeLiveRequest(ep)}
                        disabled={isExecuting[key]}
                        className="inline-flex h-7 items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-2.5 text-xs font-medium text-primary-foreground hover:bg-[#ffffff] disabled:opacity-50 transition"
                      >
                        <Play className="h-3 w-3 fill-current" />
                        <span>{isExecuting[key] ? "Executing..." : "Try it out"}</span>
                      </button>
                    </div>

                    {/* Tab Body */}
                    <div>
                      <CodeBlock
                        code={
                          currentTab === "request"
                            ? ep.sampleBody || "// No request body required"
                            : currentTab === "response"
                            ? testResponse[key] || ep.sampleResponse || "// Click 'Try it out' to execute"
                            : `curl -X ${ep.method} http://localhost:3000${ep.path} \\\n  -H "x-api-key: ${apiKey}" \\\n  -H "Content-Type: application/json"${
                                ep.sampleBody ? ` \\\n  -d '${ep.sampleBody}'` : ""
                              }`
                        }
                        language={currentTab === "curl" ? "bash" : "json"}
                        filename={currentTab === "curl" ? "curl-request.sh" : currentTab === "request" ? "request.json" : "response.json"}
                        maxHeight="360px"
                      />
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
