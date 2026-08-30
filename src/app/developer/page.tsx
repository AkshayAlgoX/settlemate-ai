"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Send,
  Copy,
  ExternalLink,
  Clock,
  Play,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Badge } from "@/components/ui/badge";
import { CodeBlock } from "@/components/ui/code-block";
import { formatDateTime, formatAuditTime } from "@/lib/format";

interface EndpointDoc {
  method: "GET" | "POST";
  path: string;
  title: string;
  description: string;
  authRequired: boolean;
  defaultBody?: string;
  curlSnippet: string;
  jsSnippet: string;
  pythonSnippet: string;
}

const ENDPOINTS: EndpointDoc[] = [
  {
    method: "POST",
    path: "/api/v1/reconcile",
    title: "Execute Multi-Pass Batch Reconciliation",
    description:
      "Ingest transactions or CSV, execute multi-pass deterministic matching, verify financial invariants, generate SHA-256 Merkle DAG receipt, and optionally dispatch async webhook.",
    authRequired: true,
    defaultBody: JSON.stringify(
      {
        transactions: [
          {
            source: "PAYMENT",
            amount: 20000,
            currency: "INR",
            date: "2026-08-25T00:00:00Z",
            reference_id: "TXN_PROD_1001",
          },
          {
            source: "SETTLEMENT",
            amount: 18450,
            currency: "INR",
            date: "2026-08-25T00:00:00Z",
            reference_id: "TXN_PROD_1001",
            utr: "UTR_PROD_1001",
          },
          {
            source: "REFUND",
            amount: 1550,
            currency: "INR",
            date: "2026-08-25T00:00:00Z",
            reference_id: "TXN_PROD_1001",
          },
        ],
      },
      null,
      2
    ),
    curlSnippet: `curl -X POST http://localhost:3000/api/v1/reconcile \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: sk_live_settlemate_production_token_8899" \\
  -d '{"transactions":[{"source":"PAYMENT","amount":20000,"currency":"INR","reference_id":"TXN_1001"}]}'`,
    jsSnippet: `const response = await fetch("http://localhost:3000/api/v1/reconcile", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": "sk_live_settlemate_production_token_8899"
  },
  body: JSON.stringify({
    transactions: [
      { source: "PAYMENT", amount: 20000, currency: "INR", reference_id: "TXN_1001" }
    ]
  })
});
const data = await response.json();
console.log("Job ID:", data.jobId, "Merkle Root:", data.receipt?.rootHash);`,
    pythonSnippet: `import requests

url = "http://localhost:3000/api/v1/reconcile"
headers = {
    "Content-Type": "application/json",
    "X-API-Key": "sk_live_settlemate_production_token_8899"
}
payload = {
    "transactions": [
        {"source": "PAYMENT", "amount": 20000, "currency": "INR", "reference_id": "TXN_1001"}
    ]
}

response = requests.post(url, json=payload, headers=headers)
data = response.json()
print("Job ID:", data.get("jobId"), "Match Rate:", data.get("summary", {}).get("matchRatePct"))`,
  },
  {
    method: "GET",
    path: "/api/v1/reconcile/job_demo_sample",
    title: "Retrieve Reconciliation Job by ID",
    description: "Fetch execution status, summary metrics, exception lists, and cryptographic proof DAG by Job ID.",
    authRequired: true,
    curlSnippet: `curl -X GET http://localhost:3000/api/v1/reconcile/job_demo_sample \\
  -H "X-API-Key: sk_live_settlemate_production_token_8899"`,
    jsSnippet: `const response = await fetch("http://localhost:3000/api/v1/reconcile/job_demo_sample", {
  headers: { "X-API-Key": "sk_live_settlemate_production_token_8899" }
});
const job = await response.json();
console.log(job);`,
    pythonSnippet: `import requests

response = requests.get(
    "http://localhost:3000/api/v1/reconcile/job_demo_sample",
    headers={"X-API-Key": "sk_live_settlemate_production_token_8899"}
)
print(response.json())`,
  },
  {
    method: "GET",
    path: "/api/v1/health",
    title: "Engine Health & System Diagnostics",
    description: "Returns uptime, engine version, rate limit configuration, and security status.",
    authRequired: false,
    curlSnippet: `curl -X GET http://localhost:3000/api/v1/health`,
    jsSnippet: `const res = await fetch("http://localhost:3000/api/v1/health");
console.log(await res.json());`,
    pythonSnippet: `import requests
res = requests.get("http://localhost:3000/api/v1/health")
print(res.json())`,
  },
  {
    method: "POST",
    path: "/api/v1/webhooks/register",
    title: "Register External Webhook Callback",
    description: "Register an external ERP/CRM webhook URL to receive HMAC-signed notifications upon reconciliation completion.",
    authRequired: true,
    defaultBody: JSON.stringify(
      {
        url: "https://erp.merchant-hub.internal/v1/settlemate-listener",
        events: ["reconciliation.completed", "exception.detected"],
        secret: "whsec_custom_signing_key_9988",
      },
      null,
      2
    ),
    curlSnippet: `curl -X POST http://localhost:3000/api/v1/webhooks/register \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: sk_live_settlemate_production_token_8899" \\
  -d '{"url":"https://erp.merchant.com/webhook","events":["reconciliation.completed"]}'`,
    jsSnippet: `const response = await fetch("http://localhost:3000/api/v1/webhooks/register", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": "sk_live_settlemate_production_token_8899"
  },
  body: JSON.stringify({
    url: "https://erp.merchant.com/webhook",
    events: ["reconciliation.completed"]
  })
});
console.log(await response.json());`,
    pythonSnippet: `import requests

payload = {
    "url": "https://erp.merchant.com/webhook",
    "events": ["reconciliation.completed"]
}
res = requests.post(
    "http://localhost:3000/api/v1/webhooks/register",
    json=payload,
    headers={"X-API-Key": "sk_live_settlemate_production_token_8899"}
)
print(res.json())`,
  },
  {
    method: "GET",
    path: "/api/docs",
    title: "OpenAPI 3.0.3 Specification",
    description: "Serves full machine-readable OpenAPI specification JSON.",
    authRequired: false,
    curlSnippet: `curl -X GET http://localhost:3000/api/docs`,
    jsSnippet: `const openApiSpec = await fetch("http://localhost:3000/api/docs").then(r => r.json());`,
    pythonSnippet: `import requests
spec = requests.get("http://localhost:3000/api/docs").json()`,
  },
  {
    method: "POST",
    path: "/api/v1/webhooks/test",
    title: "Test Live Webhook Dispatch (HMAC-SHA256)",
    description: "Trigger a sample test ping to verify webhook URL connectivity, retry backoff, and HMAC signature verification.",
    authRequired: false,
    defaultBody: JSON.stringify(
      {
        url: "https://erp.merchant-hub.internal/v1/settlemate-listener",
        event: "webhook.test_ping",
        secret: "whsec_demo_9876543210fedcba",
      },
      null,
      2
    ),
    curlSnippet: `curl -X POST http://localhost:3000/api/v1/webhooks/test \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://erp.merchant.com/webhook","event":"webhook.test_ping"}'`,
    jsSnippet: `const res = await fetch("http://localhost:3000/api/v1/webhooks/test", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: "https://erp.merchant.com/webhook" })
});
console.log(await res.json());`,
    pythonSnippet: `import requests
res = requests.post("http://localhost:3000/api/v1/webhooks/test", json={"url": "https://erp.merchant.com/webhook"})
print(res.json())`,
  },
  {
    method: "GET",
    path: "/api/report/receipt/rcpt_sample",
    title: "Retrieve Stored Decision Receipt by ID",
    description: "Retrieve immutable decision receipt and Merkle root verification proof from persistent SQLite storage.",
    authRequired: false,
    curlSnippet: `curl -X GET http://localhost:3000/api/report/receipt/rcpt_sample`,
    jsSnippet: `const res = await fetch("http://localhost:3000/api/report/receipt/rcpt_sample");
console.log(await res.json());`,
    pythonSnippet: `import requests
res = requests.get("http://localhost:3000/api/report/receipt/rcpt_sample")
print(res.json())`,
  },
];

export default function DeveloperPortalPage() {
  const [selectedEndpoint, setSelectedEndpoint] = useState<EndpointDoc>(ENDPOINTS[0]);
  const [apiKey, setApiKey] = useState<string>("sk_live_settlemate_production_token_8899");
  const [requestPath, setRequestPath] = useState<string>(ENDPOINTS[0].path);
  const [requestBody, setRequestBody] = useState<string>(ENDPOINTS[0].defaultBody || "");
  const [activeSnippetTab, setActiveSnippetTab] = useState<"curl" | "js" | "python">("curl");
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [responseStatus, setResponseStatus] = useState<number | null>(null);
  const [responseJson, setResponseJson] = useState<string | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [copiedResponse, setCopiedResponse] = useState<boolean>(false);

  // Webhook Management & Live Dispatch State
  interface WebhookItem {
    id: string;
    url: string;
    events: string[];
    secret: string;
    status: string;
    registeredAt: string;
  }
  interface DeliveryLogItem {
    id: string;
    url: string;
    event: string;
    status: string;
    statusCode: number;
    attempts?: number;
    timestamp: string;
    signature?: string;
    error?: string;
  }

  const [webhooksList, setWebhooksList] = useState<WebhookItem[]>([]);
  const [deliveryLogsList, setDeliveryLogsList] = useState<DeliveryLogItem[]>([]);
  const [isLoadingWebhooks, setIsLoadingWebhooks] = useState<boolean>(false);
  const [newWebhookUrl, setNewWebhookUrl] = useState<string>("https://erp.merchant-hub.internal/v1/settlemate-listener");
  const [newWebhookSecret, setNewWebhookSecret] = useState<string>("");
  const [isRegisteringWebhook, setIsRegisteringWebhook] = useState<boolean>(false);
  const [testingWebhookId, setTestingWebhookId] = useState<string | null>(null);
  const [webhookTestMessage, setWebhookTestMessage] = useState<{ id: string; success: boolean; msg: string } | null>(null);

  const fetchWebhooksAndLogs = async () => {
    setIsLoadingWebhooks(true);
    try {
      const [whRes, logsRes] = await Promise.all([
        fetch("/api/v1/webhooks/register"),
        fetch("/api/v1/webhooks/logs"),
      ]);
      if (whRes.ok) {
        const whData = await whRes.json();
        if (whData.webhooks) setWebhooksList(whData.webhooks);
      }
      if (logsRes.ok) {
        const logsData = await logsRes.json();
        if (logsData.logs) setDeliveryLogsList(logsData.logs.slice(0, 10));
      }
    } catch {
      // Ignore network errors
    } finally {
      setIsLoadingWebhooks(false);
    }
  };

  React.useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/v1/webhooks/register").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/v1/webhooks/logs").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([whData, logsData]) => {
        if (!active) return;
        if (whData?.webhooks) setWebhooksList(whData.webhooks);
        if (logsData?.logs) setDeliveryLogsList(logsData.logs.slice(0, 10));
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  const handleRegisterWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWebhookUrl) return;
    setIsRegisteringWebhook(true);
    try {
      const res = await fetch("/api/v1/webhooks/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
        },
        body: JSON.stringify({
          url: newWebhookUrl,
          events: ["reconciliation.completed", "exception.detected"],
          secret: newWebhookSecret || undefined,
        }),
      });
      if (res.ok) {
        await fetchWebhooksAndLogs();
        setNewWebhookSecret("");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsRegisteringWebhook(false);
    }
  };

  const handleTestWebhook = async (wh: WebhookItem) => {
    setTestingWebhookId(wh.id);
    setWebhookTestMessage(null);
    try {
      const res = await fetch("/api/v1/webhooks/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          webhookId: wh.id,
          url: wh.url,
          secret: wh.secret,
          event: "webhook.test_ping",
        }),
      });
      const data = await res.json();
      setWebhookTestMessage({
        id: wh.id,
        success: data.success,
        msg: data.message || (data.success ? "Webhook delivered successfully" : "Delivery failed"),
      });
      await fetchWebhooksAndLogs();
    } catch (err) {
      setWebhookTestMessage({
        id: wh.id,
        success: false,
        msg: (err as Error).message || "Connection failed",
      });
    } finally {
      setTestingWebhookId(null);
    }
  };

  const handleSelectEndpoint = (ep: EndpointDoc) => {
    setSelectedEndpoint(ep);
    setRequestPath(ep.path);
    setRequestBody(ep.defaultBody || "");
    setResponseJson(null);
    setResponseStatus(null);
  };

  const handleExecuteRequest = async () => {
    setIsExecuting(true);
    setResponseJson(null);
    setResponseStatus(null);
    const start = performance.now();

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (selectedEndpoint.authRequired && apiKey) {
        headers["X-API-Key"] = apiKey;
      }

      const options: RequestInit = {
        method: selectedEndpoint.method,
        headers,
      };

      if (selectedEndpoint.method === "POST" && requestBody) {
        options.body = requestBody;
      }

      const res = await fetch(requestPath, options);
      const end = performance.now();
      setLatency(Math.round(end - start));
      setResponseStatus(res.status);

      const json = await res.json().catch(() => ({ message: "Non-JSON response" }));
      setResponseJson(JSON.stringify(json, null, 2));
    } catch (err) {
      const end = performance.now();
      setLatency(Math.round(end - start));
      setResponseStatus(500);
      setResponseJson(JSON.stringify({ error: (err as Error).message }, null, 2));
    } finally {
      setIsExecuting(false);
    }
  };

  const handleCopyText = (text: string, setCopied: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getCurrentSnippet = () => {
    if (activeSnippetTab === "curl") return selectedEndpoint.curlSnippet;
    if (activeSnippetTab === "js") return selectedEndpoint.jsSnippet;
    return selectedEndpoint.pythonSnippet;
  };

  return (
    <div className="space-y-10 pb-12">
      {/* Top Header */}
      <PageHeader
        tag="Developer Platform"
        title="Developer API portal"
        description="Enterprise REST API reference, interactive sandbox console, client code generators, and OpenAPI 3.0 specification."
        badge={<Badge variant="outline">REST v1</Badge>}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/api/docs"
              target="_blank"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-mono text-foreground hover:bg-accent transition"
            >
              <span>OpenAPI Spec</span>
              <ExternalLink className="h-3 w-3 text-muted-foreground" />
            </Link>
          </div>
        }
      />

      {/* Feature Badges Bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4 space-y-1">
          <div className="text-xs font-semibold text-foreground">API Key Auth</div>
          <p className="text-[11px] text-muted-foreground">
            X-API-Key with fail-closed validation
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 space-y-1">
          <div className="text-xs font-semibold text-foreground">Rate Limiter</div>
          <p className="text-[11px] text-muted-foreground">
            100 req/min with Retry-After header
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 space-y-1">
          <div className="text-xs font-semibold text-foreground">HMAC Webhooks</div>
          <p className="text-[11px] text-muted-foreground">
            SHA-256 signed event callbacks
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 space-y-1">
          <div className="text-xs font-semibold text-foreground">Merkle Receipts</div>
          <p className="text-[11px] text-muted-foreground">
            Cryptographic proof in responses
          </p>
        </div>
      </div>

      {/* Interactive Console & Code Snippets Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Endpoint Selector List */}
        <div className="space-y-4 lg:col-span-4">
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <SectionHeader
              title="REST endpoints"
              className="border-b-0 pb-0"
            />

            <div className="space-y-1">
              {ENDPOINTS.map((ep, idx) => {
                const isSelected = selectedEndpoint.path === ep.path && selectedEndpoint.method === ep.method;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectEndpoint(ep)}
                    className={`w-full text-left p-2.5 rounded-md border transition ${
                      isSelected
                        ? "border-[#ededed] bg-accent text-foreground"
                        : "border-transparent text-muted-foreground hover:border-border hover:bg-accent/40"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <Badge variant={ep.method === "POST" ? "default" : "secondary"}>
                        {ep.method}
                      </Badge>
                      <span className="text-[10px] font-mono text-muted-foreground/70">
                        {ep.authRequired ? "API Key" : "Public"}
                      </span>
                    </div>
                    <div className="mt-1 font-mono text-xs text-foreground truncate">{ep.path}</div>
                    <p className="text-[11px] text-muted-foreground truncate">{ep.title}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Interactive Console & Snippets */}
        <div className="space-y-6 lg:col-span-8">
          {/* Endpoint Details & Interactive Test Runner */}
          <div className="rounded-lg border border-border bg-card p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant={selectedEndpoint.method === "POST" ? "default" : "secondary"}>
                    {selectedEndpoint.method}
                  </Badge>
                  <span className="font-mono text-xs font-semibold text-foreground">
                    {selectedEndpoint.path}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{selectedEndpoint.description}</p>
              </div>
            </div>

            {/* Request Configuration Form */}
            <div className="space-y-3 text-xs">
              {selectedEndpoint.authRequired && (
                <div>
                  <label className="text-muted-foreground block mb-1">
                    API Key (X-API-Key)
                  </label>
                  <input
                    type="text"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs font-mono text-foreground focus:border-foreground/40 focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="text-muted-foreground block mb-1">Request Path</label>
                <input
                  type="text"
                  value={requestPath}
                  onChange={(e) => setRequestPath(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs font-mono text-foreground focus:border-foreground/40 focus:outline-none"
                />
              </div>

              {selectedEndpoint.method === "POST" && (
                <div>
                  <label className="text-muted-foreground block mb-1">JSON Payload</label>
                  <textarea
                    rows={6}
                    value={requestBody}
                    onChange={(e) => setRequestBody(e.target.value)}
                    className="w-full rounded-md border border-border bg-background p-3 text-xs font-mono text-foreground focus:border-foreground/40 focus:outline-none"
                  />
                </div>
              )}

              <button
                type="button"
                onClick={handleExecuteRequest}
                disabled={isExecuting}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3.5 text-xs font-medium text-primary-foreground hover:bg-[#ffffff] disabled:opacity-50 transition"
              >
                {isExecuting ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border border-[#000000] border-t-transparent" />
                    <span>Sending request...</span>
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" />
                    <span>Send request</span>
                  </>
                )}
              </button>
            </div>

            {/* Live Response Panel */}
            {responseJson && (
              <div className="mt-4 border-t border-border pt-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant={responseStatus === 200 || responseStatus === 201 || responseStatus === 202 ? "success" : "destructive"}>
                      HTTP {responseStatus}
                    </Badge>
                    {latency !== null && (
                      <span className="text-xs font-mono text-muted-foreground/70 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {latency}ms
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleCopyText(responseJson, setCopiedResponse)}
                    className="text-xs font-mono text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    <Copy className="h-3 w-3" />
                    <span>{copiedResponse ? "Copied" : "Copy JSON"}</span>
                  </button>
                </div>

                <CodeBlock
                  code={responseJson}
                  language="json"
                  maxHeight="320px"
                />
              </div>
            )}
          </div>

          {/* Code Snippets Panel */}
          <div className="rounded-lg border border-border bg-card p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <SectionHeader
                title="Client code snippets"
                className="border-b-0 pb-0"
              />

              <div className="inline-flex rounded-md border border-border bg-background p-0.5">
                {(["curl", "js", "python"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveSnippetTab(tab)}
                    className={`h-7 px-3 text-xs font-mono uppercase rounded-md transition ${
                      activeSnippetTab === tab
                        ? "bg-secondary text-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            <CodeBlock
              code={getCurrentSnippet()}
              language={activeSnippetTab === "curl" ? "bash" : activeSnippetTab === "js" ? "javascript" : "python"}
              filename={`request.${activeSnippetTab === "curl" ? "sh" : activeSnippetTab === "js" ? "ts" : "py"}`}
              maxHeight="400px"
            />
          </div>
        </div>
      </div>

      {/* Webhook Management & Live HMAC Dispatch Console */}
      <div className="rounded-lg border border-border bg-card p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
          <SectionHeader
            title="Registered webhooks & dispatch console"
            description="Manage registered ERP/CRM callback endpoints with HMAC-SHA256 signatures."
            className="border-b-0 pb-0"
          />

          <button
            type="button"
            onClick={fetchWebhooksAndLogs}
            disabled={isLoadingWebhooks}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-mono text-foreground hover:bg-accent transition"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoadingWebhooks ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Registered Webhooks List */}
        <div className="space-y-3">
          <div className="text-xs font-semibold text-foreground">
            Active Subscriptions ({webhooksList.length})
          </div>

          {webhooksList.length === 0 ? (
            <div className="rounded-md border border-border bg-background p-6 text-center text-xs text-muted-foreground">
              No webhooks registered yet. Use the form below to add an endpoint.
            </div>
          ) : (
            <div className="overflow-x-auto rounded border border-border">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-[10px] uppercase text-muted-foreground/70">
                    <th className="p-3 font-medium">Target URL</th>
                    <th className="p-3 font-medium">Events</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium">Registered</th>
                    <th className="p-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {webhooksList.map((wh) => (
                    <tr key={wh.id} className="hover:bg-accent/40">
                      <td className="p-3 font-mono">
                        <div className="text-foreground font-semibold">{wh.id}</div>
                        <div className="text-[11px] text-muted-foreground truncate max-w-xs">{wh.url}</div>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {wh.events.map((evt) => (
                            <Badge key={evt} variant="secondary">
                              {evt}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="p-3">
                        <Badge variant="success">
                          {wh.status}
                        </Badge>
                      </td>
                      <td className="p-3 text-[11px] text-muted-foreground/70 font-mono">
                        {formatDateTime(wh.registeredAt)}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleTestWebhook(wh)}
                          disabled={testingWebhookId === wh.id}
                          className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-xs text-foreground hover:bg-accent disabled:opacity-50 transition"
                        >
                          {testingWebhookId === wh.id ? (
                            <>
                              <span className="h-3 w-3 animate-spin rounded-full border border-[#ededed] border-t-transparent" />
                              <span>Testing...</span>
                            </>
                          ) : (
                            <>
                              <Play className="h-3 w-3 fill-current" />
                              <span>Test ping</span>
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Test Status Banner */}
          {webhookTestMessage && (
            <div
              className={`flex items-start gap-2 rounded-md border p-3 text-xs font-mono ${
                webhookTestMessage.success
                  ? "border-border bg-background text-foreground"
                  : "border-[#3b1818] bg-[#140a0a] text-[#ef4444]"
              }`}
            >
              {webhookTestMessage.success ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-[#10b981] mt-0.5" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0 text-[#ef4444] mt-0.5" />
              )}
              <div>
                <span className="font-semibold">[{webhookTestMessage.id}]</span> {webhookTestMessage.msg}
              </div>
            </div>
          )}
        </div>

        {/* Quick Webhook Registration Form */}
        <div className="rounded-md border border-border bg-background p-4 space-y-3">
          <div className="text-xs font-semibold text-foreground">
            Register New Endpoint
          </div>

          <form onSubmit={handleRegisterWebhook} className="grid grid-cols-1 gap-3 sm:grid-cols-12 text-xs">
            <div className="sm:col-span-6">
              <label className="text-muted-foreground block mb-1">Webhook Callback URL</label>
              <input
                type="url"
                required
                value={newWebhookUrl}
                onChange={(e) => setNewWebhookUrl(e.target.value)}
                placeholder="https://your-api.com/webhooks/reconciliation"
                className="w-full rounded-md border border-border bg-card px-3 py-1.5 text-xs font-mono text-foreground focus:border-foreground/40 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-4">
              <label className="text-muted-foreground block mb-1">Custom Secret (optional)</label>
              <input
                type="text"
                value={newWebhookSecret}
                onChange={(e) => setNewWebhookSecret(e.target.value)}
                placeholder="whsec_auto_generated_if_blank"
                className="w-full rounded-md border border-border bg-card px-3 py-1.5 text-xs font-mono text-foreground focus:border-foreground/40 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2 flex items-end">
              <button
                type="submit"
                disabled={isRegisteringWebhook}
                className="w-full inline-flex h-8 items-center justify-center rounded-md bg-primary text-primary-foreground px-3 text-xs font-medium text-primary-foreground hover:bg-[#ffffff] disabled:opacity-50 transition"
              >
                {isRegisteringWebhook ? "Adding..." : "Register"}
              </button>
            </div>
          </form>
        </div>

        {/* Recent Webhook Delivery History */}
        {deliveryLogsList.length > 0 && (
          <div className="space-y-3 pt-2">
            <div className="text-xs font-semibold text-foreground">
              Recent Webhook Dispatches
            </div>
            <div className="overflow-x-auto rounded border border-border">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-[10px] uppercase text-muted-foreground/70">
                    <th className="p-2.5 font-medium">Timestamp</th>
                    <th className="p-2.5 font-medium">Event</th>
                    <th className="p-2.5 font-medium">Target URL</th>
                    <th className="p-2.5 font-medium">Result</th>
                    <th className="p-2.5 font-medium">Attempts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-mono text-[11px]">
                  {deliveryLogsList.map((log) => (
                    <tr key={log.id} className="hover:bg-accent/40">
                      <td className="p-2.5 text-muted-foreground/70">{formatAuditTime(log.timestamp)}</td>
                      <td className="p-2.5 text-foreground">{log.event}</td>
                      <td className="p-2.5 text-muted-foreground truncate max-w-xs">{log.url}</td>
                      <td className="p-2.5">
                        <Badge variant={log.status === "DELIVERED" || log.status === "SIMULATED" ? "success" : "destructive"}>
                          {log.status} ({log.statusCode})
                        </Badge>
                      </td>
                      <td className="p-2.5 text-muted-foreground/70">{log.attempts || 1}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
