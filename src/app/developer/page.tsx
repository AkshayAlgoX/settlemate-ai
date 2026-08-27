"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Code2,
  Terminal,
  Send,
  Copy,
  Key,
  Layers,
  ShieldCheck,
  ExternalLink,
  Clock,
  Sparkles,
  Radio,
  BookOpen,
  Play,
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

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
  const [responseHeaders, setResponseHeaders] = useState<Record<string, string>>({});
  const [responseJson, setResponseJson] = useState<string | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [copiedResponse, setCopiedResponse] = useState<boolean>(false);
  const [copiedSnippet, setCopiedSnippet] = useState<boolean>(false);

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
      // Ignore network errors in dev/offline
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
    setResponseHeaders({});
  };

  const handleExecuteRequest = async () => {
    setIsExecuting(true);
    setResponseJson(null);
    setResponseStatus(null);
    setResponseHeaders({});
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

      const hdrs: Record<string, string> = {};
      res.headers.forEach((val, key) => {
        hdrs[key] = val;
      });
      setResponseHeaders(hdrs);

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
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-[#242820] pb-6 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center border border-[#424738] bg-[#11140f] text-[#aab98b]">
              <Code2 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-[#f0eee5]">
                Developer API Portal
              </h1>
              <p className="text-xs text-[#8a9184]">
                Enterprise REST API reference, interactive sandbox console, client code generators & OpenAPI 3.0 spec
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/api/docs"
            target="_blank"
            className="flex items-center gap-1.5 border border-[#30362e] bg-[#121611] px-3 py-1.5 text-xs font-mono text-[#aab98b] hover:bg-[#1a2116] transition"
          >
            <BookOpen className="h-3.5 w-3.5" />
            OpenAPI JSON Spec
            <ExternalLink className="h-3 w-3 ml-0.5 opacity-60" />
          </Link>
          <span className="border border-[#3a4035] bg-[#1a1f17] px-2.5 py-1.5 text-[11px] font-mono text-[#dcd7cb]">
            💻 00I
          </span>
        </div>
      </div>

      {/* Feature Badges Bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="border border-[#242820] bg-[#0d100c] p-3.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#f0eee5]">
            <Key className="h-4 w-4 text-[#aab98b]" />
            sk_ API Key Auth
          </div>
          <p className="mt-1 text-[11px] text-[#7a8174]">
            X-API-Key & Bearer headers with fail-closed validation
          </p>
        </div>

        <div className="border border-[#242820] bg-[#0d100c] p-3.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#f0eee5]">
            <Layers className="h-4 w-4 text-[#aab98b]" />
            Token Bucket Limiter
          </div>
          <p className="mt-1 text-[11px] text-[#7a8174]">
            100 requests / min burst with Retry-After header
          </p>
        </div>

        <div className="border border-[#242820] bg-[#0d100c] p-3.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#f0eee5]">
            <Radio className="h-4 w-4 text-[#aab98b]" />
            HMAC Webhooks
          </div>
          <p className="mt-1 text-[11px] text-[#7a8174]">
            X-SettleMate-Signature SHA-256 signed event callbacks
          </p>
        </div>

        <div className="border border-[#242820] bg-[#0d100c] p-3.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#f0eee5]">
            <ShieldCheck className="h-4 w-4 text-[#aab98b]" />
            Merkle DAG Receipts
          </div>
          <p className="mt-1 text-[11px] text-[#7a8174]">
            Every reconciliation response includes cryptographic proof
          </p>
        </div>
      </div>

      {/* Interactive Console & Code Snippets Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Endpoint Selector List */}
        <div className="space-y-4 lg:col-span-4">
          <div className="border border-[#242820] bg-[#0d100c] p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#8a9184]">
              REST API Endpoints
            </h2>

            <div className="space-y-1.5">
              {ENDPOINTS.map((ep, idx) => {
                const isSelected = selectedEndpoint.path === ep.path && selectedEndpoint.method === ep.method;
                return (
                  <button
                    key={idx}
                    onClick={() => handleSelectEndpoint(ep)}
                    className={`w-full text-left p-2.5 border transition ${
                      isSelected
                        ? "border-[#505a42] bg-[#151a12] text-[#f0eee6]"
                        : "border-transparent text-[#8b9187] hover:border-[#30362e] hover:bg-[#10130f] hover:text-[#d0d0c8]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-[10px] font-mono font-bold px-1.5 py-0.5 border ${
                          ep.method === "POST"
                            ? "border-[#3e5532] text-[#aab98b] bg-[#11180f]"
                            : "border-[#30455c] text-[#61afef] bg-[#0d141e]"
                        }`}
                      >
                        {ep.method}
                      </span>
                      {ep.authRequired ? (
                        <span className="text-[9px] font-mono text-[#7a8174]">API Key</span>
                      ) : (
                        <span className="text-[9px] font-mono text-[#555d4e]">Public</span>
                      )}
                    </div>
                    <div className="mt-1.5 font-mono text-xs text-[#dddcd4] truncate">{ep.path}</div>
                    <p className="mt-0.5 text-[10px] text-[#7a8174] truncate">{ep.title}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Info Box */}
          <div className="border border-[#242820] bg-[#0d100c] p-4 space-y-2">
            <h3 className="text-xs font-semibold text-[#f0eee5] flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-[#aab98b]" />
              Multi-Language SDK Readiness
            </h3>
            <p className="text-[11px] text-[#8a9184]">
              All endpoints accept JSON and CSV payloads. Use the interactive console on the right to test requests live against the running backend.
            </p>
          </div>
        </div>

        {/* Right: Interactive Console & Snippets */}
        <div className="space-y-6 lg:col-span-8">
          {/* Endpoint Details & Interactive Test Runner */}
          <div className="border border-[#242820] bg-[#0d100c] p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#1f241c] pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[11px] font-mono font-bold px-2 py-0.5 border ${
                      selectedEndpoint.method === "POST"
                        ? "border-[#3e5532] text-[#aab98b] bg-[#11180f]"
                        : "border-[#30455c] text-[#61afef] bg-[#0d141e]"
                    }`}
                  >
                    {selectedEndpoint.method}
                  </span>
                  <span className="font-mono text-sm font-bold text-[#f0eee5]">
                    {selectedEndpoint.path}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[#8a9184]">{selectedEndpoint.description}</p>
              </div>
            </div>

            {/* Request Configuration Form */}
            <div className="space-y-3">
              {selectedEndpoint.authRequired && (
                <div>
                  <label className="text-[11px] text-[#9a9f93]">
                    Authentication API Key (X-API-Key)
                  </label>
                  <input
                    type="text"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="mt-1 w-full border border-[#2b3127] bg-[#121611] px-3 py-1.5 text-xs font-mono text-[#f0eee5] focus:border-[#aab98b] focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="text-[11px] text-[#9a9f93]">Request Path</label>
                <input
                  type="text"
                  value={requestPath}
                  onChange={(e) => setRequestPath(e.target.value)}
                  className="mt-1 w-full border border-[#2b3127] bg-[#121611] px-3 py-1.5 text-xs font-mono text-[#f0eee5] focus:border-[#aab98b] focus:outline-none"
                />
              </div>

              {selectedEndpoint.method === "POST" && (
                <div>
                  <label className="text-[11px] text-[#9a9f93]">JSON Request Payload</label>
                  <textarea
                    rows={6}
                    value={requestBody}
                    onChange={(e) => setRequestBody(e.target.value)}
                    className="mt-1 w-full border border-[#2b3127] bg-[#080a08] p-3 text-xs font-mono text-[#f0eee5] focus:border-[#aab98b] focus:outline-none"
                  />
                </div>
              )}

              <button
                onClick={handleExecuteRequest}
                disabled={isExecuting}
                className="flex items-center gap-2 border border-[#505a42] bg-[#1a2215] px-4 py-2 text-xs font-semibold text-[#f0eee5] hover:bg-[#253020] hover:text-[#fff] disabled:opacity-50"
              >
                {isExecuting ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border border-[#aab98b] border-t-transparent" />
                    Sending Request...
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5 text-[#aab98b]" />
                    Send Request to API
                  </>
                )}
              </button>
            </div>

            {/* Live Response Panel */}
            {responseJson && (
              <div className="mt-4 border-t border-[#1f241c] pt-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 border ${
                        responseStatus === 200 || responseStatus === 201 || responseStatus === 202
                          ? "border-[#4a5e38] bg-[#162112] text-[#aab98b]"
                          : "border-[#603530] bg-[#211210] text-[#e06c75]"
                      }`}
                    >
                      HTTP {responseStatus}
                    </span>
                    {latency !== null && (
                      <span className="text-[10px] font-mono text-[#7a8174] flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {latency}ms
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => handleCopyText(responseJson, setCopiedResponse)}
                    className="text-[11px] font-mono text-[#aab98b] hover:underline flex items-center gap-1"
                  >
                    <Copy className="h-3 w-3" />
                    {copiedResponse ? "Copied!" : "Copy JSON"}
                  </button>
                </div>

                {/* Security Headers Inspection Snippet */}
                {responseHeaders["x-content-type-options"] && (
                  <div className="text-[10px] font-mono text-[#6c7465] flex flex-wrap gap-2 py-1">
                    <span>nosniff: OK</span>
                    <span>CSP: default-src &apos;none&apos;</span>
                    {responseHeaders["x-ratelimit-remaining"] && (
                      <span>RateLimit Remaining: {responseHeaders["x-ratelimit-remaining"]}</span>
                    )}
                  </div>
                )}

                <pre className="border border-[#1e241a] bg-[#060806] p-3 text-xs font-mono text-[#aab98b] max-h-72 overflow-y-auto whitespace-pre-wrap">
                  {responseJson}
                </pre>
              </div>
            )}
          </div>

          {/* Code Snippets Panel */}
          <div className="border border-[#242820] bg-[#0d100c] p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-[#1f241c] pb-3">
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-[#aab98b]" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#e6e2d8]">
                  Client Implementation Snippets
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex border border-[#2b3127] bg-[#121611]">
                  {(["curl", "js", "python"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveSnippetTab(tab)}
                      className={`px-2.5 py-1 text-[11px] font-mono uppercase transition ${
                        activeSnippetTab === tab
                          ? "bg-[#1f2619] text-[#aab98b] font-bold"
                          : "text-[#7a8174] hover:text-[#bbb]"
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => handleCopyText(getCurrentSnippet(), setCopiedSnippet)}
                  className="flex items-center gap-1 border border-[#30362e] bg-[#121611] px-2.5 py-1 text-[11px] text-[#cfcac0] hover:bg-[#1a2116]"
                >
                  <Copy className="h-3 w-3 text-[#aab98b]" />
                  {copiedSnippet ? "Copied" : "Copy"}
                </button>
              </div>
            </div>

            <pre className="border border-[#1e241a] bg-[#060806] p-3.5 text-xs font-mono text-[#cfcac0] overflow-x-auto whitespace-pre">
              {getCurrentSnippet()}
            </pre>
          </div>
        </div>
      </div>

      {/* Webhook Management & Live HMAC Dispatch Console */}
      <div className="border border-[#242820] bg-[#0d100c] p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1f241c] pb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <Radio className="h-5 w-5 text-[#aab98b]" />
              <h2 className="text-sm font-semibold tracking-tight text-[#f0eee5]">
                Registered Webhooks & HMAC-SHA256 Dispatch Console
              </h2>
            </div>
            <p className="mt-1 text-xs text-[#8a9184]">
              Manage registered ERP/CRM callback endpoints. Test live delivery with HMAC-SHA256 signature and exponential backoff retry.
            </p>
          </div>

          <button
            onClick={fetchWebhooksAndLogs}
            disabled={isLoadingWebhooks}
            className="flex items-center gap-1.5 border border-[#30362e] bg-[#121611] px-3 py-1.5 text-xs font-mono text-[#aab98b] hover:bg-[#1a2116] transition"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoadingWebhooks ? "animate-spin" : ""}`} />
            Refresh Webhooks
          </button>
        </div>

        {/* Registered Webhooks Table / List */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#8a9184]">
            Active Webhook Subscriptions ({webhooksList.length})
          </h3>

          {webhooksList.length === 0 ? (
            <div className="border border-[#1f241c] bg-[#080a08] p-6 text-center text-xs text-[#7a8174]">
              No webhooks registered yet. Use the form below or POST to <code className="text-[#aab98b]">/api/v1/webhooks/register</code>.
            </div>
          ) : (
            <div className="overflow-x-auto border border-[#1f241c]">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#1f241c] bg-[#121611] text-[#8a9184]">
                    <th className="p-3 font-semibold">ID / Target URL</th>
                    <th className="p-3 font-semibold">Subscribed Events</th>
                    <th className="p-3 font-semibold">Status</th>
                    <th className="p-3 font-semibold">Registered</th>
                    <th className="p-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1f241c] bg-[#080a08]">
                  {webhooksList.map((wh) => (
                    <tr key={wh.id} className="hover:bg-[#0f130e]">
                      <td className="p-3 font-mono">
                        <div className="text-[#f0eee5] font-semibold">{wh.id}</div>
                        <div className="text-[11px] text-[#aab98b] truncate max-w-xs sm:max-w-md">{wh.url}</div>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {wh.events.map((evt) => (
                            <span key={evt} className="border border-[#2e3b26] bg-[#141d10] px-1.5 py-0.5 text-[10px] font-mono text-[#aab98b]">
                              {evt}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="p-3">
                        <span className="border border-[#38522c] bg-[#121f0f] px-2 py-0.5 text-[10px] font-mono text-[#86efac]">
                          {wh.status}
                        </span>
                      </td>
                      <td className="p-3 text-[11px] text-[#7a8174] font-mono">
                        {new Date(wh.registeredAt).toLocaleString()}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => handleTestWebhook(wh)}
                          disabled={testingWebhookId === wh.id}
                          className="inline-flex items-center gap-1.5 border border-[#505a42] bg-[#1a2215] px-3 py-1 text-xs font-mono text-[#f0eee5] hover:bg-[#253020] disabled:opacity-50"
                        >
                          {testingWebhookId === wh.id ? (
                            <>
                              <span className="h-3 w-3 animate-spin rounded-full border border-[#aab98b] border-t-transparent" />
                              Testing...
                            </>
                          ) : (
                            <>
                              <Play className="h-3 w-3 text-[#aab98b]" />
                              Test Ping
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
              className={`flex items-start gap-2 border p-3 text-xs font-mono ${
                webhookTestMessage.success
                  ? "border-[#4a5e38] bg-[#131d10] text-[#aab98b]"
                  : "border-[#603530] bg-[#211210] text-[#e06c75]"
              }`}
            >
              {webhookTestMessage.success ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-[#86efac] mt-0.5" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0 text-[#e06c75] mt-0.5" />
              )}
              <div>
                <span className="font-bold">[{webhookTestMessage.id}]</span> {webhookTestMessage.msg}
              </div>
            </div>
          )}
        </div>

        {/* Quick Webhook Registration Form */}
        <div className="border border-[#1f241c] bg-[#090c08] p-4 space-y-3">
          <h3 className="text-xs font-semibold text-[#f0eee5] flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5 text-[#aab98b]" />
            Register New Webhook Endpoint
          </h3>

          <form onSubmit={handleRegisterWebhook} className="grid grid-cols-1 gap-3 sm:grid-cols-12">
            <div className="sm:col-span-6">
              <label className="text-[11px] text-[#8a9184]">Webhook Callback URL (http:// or https://)</label>
              <input
                type="url"
                required
                value={newWebhookUrl}
                onChange={(e) => setNewWebhookUrl(e.target.value)}
                placeholder="https://your-api.com/webhooks/reconciliation"
                className="mt-1 w-full border border-[#2b3127] bg-[#121611] px-3 py-1.5 text-xs font-mono text-[#f0eee5] focus:border-[#aab98b] focus:outline-none"
              />
            </div>

            <div className="sm:col-span-4">
              <label className="text-[11px] text-[#8a9184]">Custom Secret (optional)</label>
              <input
                type="text"
                value={newWebhookSecret}
                onChange={(e) => setNewWebhookSecret(e.target.value)}
                placeholder="whsec_auto_generated_if_blank"
                className="mt-1 w-full border border-[#2b3127] bg-[#121611] px-3 py-1.5 text-xs font-mono text-[#f0eee5] focus:border-[#aab98b] focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2 flex items-end">
              <button
                type="submit"
                disabled={isRegisteringWebhook}
                className="w-full flex items-center justify-center gap-1.5 border border-[#505a42] bg-[#1a2215] px-3 py-1.5 text-xs font-semibold text-[#f0eee5] hover:bg-[#253020] disabled:opacity-50"
              >
                {isRegisteringWebhook ? "Adding..." : "Register"}
              </button>
            </div>
          </form>
        </div>

        {/* Recent Webhook Delivery History */}
        {deliveryLogsList.length > 0 && (
          <div className="space-y-3 pt-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#8a9184]">
              Recent Webhook Dispatches & Signature Verification
            </h3>
            <div className="overflow-x-auto border border-[#1f241c]">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#1f241c] bg-[#121611] text-[#8a9184]">
                    <th className="p-2.5 font-semibold">Timestamp</th>
                    <th className="p-2.5 font-semibold">Event</th>
                    <th className="p-2.5 font-semibold">Target URL</th>
                    <th className="p-2.5 font-semibold">Result</th>
                    <th className="p-2.5 font-semibold">Attempts</th>
                    <th className="p-2.5 font-semibold">HMAC Header</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1f241c] bg-[#080a08] font-mono text-[11px]">
                  {deliveryLogsList.map((log) => (
                    <tr key={log.id} className="hover:bg-[#0f130e]">
                      <td className="p-2.5 text-[#7a8174]">{new Date(log.timestamp).toLocaleTimeString()}</td>
                      <td className="p-2.5 text-[#f0eee5]">{log.event}</td>
                      <td className="p-2.5 text-[#aab98b] truncate max-w-xs">{log.url}</td>
                      <td className="p-2.5">
                        <span
                          className={`px-1.5 py-0.5 border text-[10px] ${
                            log.status === "DELIVERED" || log.status === "SIMULATED"
                              ? "border-[#4a5e38] bg-[#131d10] text-[#86efac]"
                              : "border-[#603530] bg-[#211210] text-[#e06c75]"
                          }`}
                        >
                          {log.status} ({log.statusCode})
                        </span>
                      </td>
                      <td className="p-2.5 text-[#8a9184]">{log.attempts || 1}</td>
                      <td className="p-2.5 text-[#6c7465] truncate max-w-xs" title={log.signature}>
                        {log.signature || "X-SettleMate-Signature"}
                      </td>
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
