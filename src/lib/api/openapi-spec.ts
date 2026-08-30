/*
 * SettleMate AI — OpenAPI 3.0.3 Specification Definition
 */

export const OPENAPI_SPEC = {
  openapi: "3.0.3",
  info: {
    title: "SettleMate AI — Financial Control Plane & Reconciliation REST API",
    version: "1.0.0",
    description:
      "Production-grade, integration-ready REST API for enterprise payment reconciliation, automated exception triage, cryptographic decision receipts, and real-time webhook streaming.",
    contact: {
      name: "SettleMate AI Platform Engineering",
      url: "https://github.com/AkshayAlgoX/settlemate-ai",
    },
    license: {
      name: "Apache-2.0",
      url: "https://opensource.org/licenses/Apache-2.0",
    },
  },
  servers: [
    {
      url: "http://localhost:3000/api/v1",
      description: "Local Development Server",
    },
    {
      url: "https://api.settlemate.ai/v1",
      description: "Production Cloud Cluster",
    },
  ],
  paths: {
    "/reconcile": {
      post: {
        summary: "Execute Batch Reconciliation",
        description:
          "Accepts structured payment transactions or CSV data, executes multi-pass deterministic reconciliation, enforces financial invariants, generates Merkle DAG decision receipts, and optionally dispatches async webhooks.",
        security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ReconciliationRequest",
              },
            },
            "text/csv": {
              schema: {
                type: "string",
                example: "source,amount,currency,date,reference_id\nPAYMENT,20000,INR,2026-08-20,TXN_001\nSETTLEMENT,18450,INR,2026-08-21,TXN_001\nREFUND,1550,INR,2026-08-21,TXN_001",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Synchronous Reconciliation Completed",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ReconciliationSuccessResponse",
                },
              },
            },
          },
          "202": {
            description: "Asynchronous Batch Accepted (Webhook callback queued)",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ReconciliationAsyncResponse",
                },
              },
            },
          },
          "400": {
            description: "Invalid Input Schema / Missing Columns",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "401": {
            description: "Unauthorized (Missing or Invalid API Key)",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "429": {
            description: "Rate Limit Exceeded (100 req/min)",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/reconcile/{jobId}": {
      get: {
        summary: "Get Reconciliation Job Result",
        description: "Retrieves status, summary metrics, exception lists, and cryptographic audit receipts for a previously submitted job.",
        security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
        parameters: [
          {
            name: "jobId",
            in: "path",
            required: true,
            schema: { type: "string", example: "job_9a8b7c6d5e" },
          },
        ],
        responses: {
          "200": {
            description: "Job Details Retrieved",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/JobDetailsResponse" },
              },
            },
          },
          "404": {
            description: "Job Not Found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/health": {
      get: {
        summary: "System Health & Engine Status",
        description: "Returns uptime, runtime version, invariant engine status, and rate limiter status.",
        responses: {
          "200": {
            description: "System Operational",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HealthResponse" },
              },
            },
          },
        },
      },
    },
    "/webhooks/register": {
      post: {
        summary: "Register Webhook Listener",
        description: "Registers an external ERP/CRM webhook URL to receive HMAC-signed notifications when batch reconciliations finish or anomalies are detected.",
        security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["url"],
                properties: {
                  url: { type: "string", format: "uri", example: "https://erp.merchant.com/v1/settlemate-hook" },
                  events: {
                    type: "array",
                    items: { type: "string" },
                    example: ["reconciliation.completed", "exception.detected"],
                  },
                  secret: { type: "string", example: "whsec_custom_secret_key_8899" },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Webhook Registered Successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/WebhookSubscriptionResponse" },
              },
            },
          },
        },
      },
    },
    "/webhooks/logs": {
      get: {
        summary: "Get Webhook Event Delivery Logs",
        description: "Retrieves recent webhook deliveries and HMAC signature payloads (used by Integration Simulator listener).",
        responses: {
          "200": {
            description: "Webhook logs retrieved",
          },
        },
      },
    },
    "/multi-currency/reconcile": {
      post: {
        summary: "Cross-Border Multi-Currency Reconcile",
        description: "Executes multi-currency conversion with exact floor division paise arithmetic and isolated tax ledgers.",
        security: [{ ApiKeyAuth: [] }],
        responses: {
          "200": {
            description: "Multi-currency reconciliation successful",
          },
        },
      },
    },
    "/forensics/{jobId}": {
      get: {
        summary: "Forensics 7-Phase Execution Timeline",
        description: "Retrieves chronological 7-phase execution timeline with Merkle receipts and balance invariants.",
        responses: {
          "200": {
            description: "Forensics timeline retrieved",
          },
        },
      },
    },
    "/red-team/attack": {
      post: {
        summary: "Evaluate Red-Team Hostile Payload",
        description: "Evaluates arbitrary hostile payloads across the 6-layer defense pipeline in real time.",
        responses: {
          "200": {
            description: "Red-team telemetry and defense result",
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: "apiKey",
        in: "header",
        name: "X-API-Key",
        description: "Secret API key starting with 'sk_' (min length > 20)",
      },
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT / API Key",
        description: "Standard Authorization header: 'Bearer sk_...'",
      },
    },
    schemas: {
      ReconciliationRequest: {
        type: "object",
        properties: {
          webhookUrl: { type: "string", format: "uri", example: "https://erp.merchant.com/webhook" },
          transactions: {
            type: "array",
            items: {
              type: "object",
              required: ["source", "amount", "currency", "reference_id"],
              properties: {
                source: { type: "string", enum: ["PAYMENT", "SETTLEMENT", "BANK", "REFUND", "CHARGEBACK"], example: "PAYMENT" },
                amount: { type: "number", example: 199.99 },
                currency: { type: "string", example: "INR" },
                date: { type: "string", format: "date-time", example: "2026-08-25T00:00:00Z" },
                reference_id: { type: "string", example: "TXN_1098273" },
              },
            },
          },
        },
      },
      ReconciliationSuccessResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          jobId: { type: "string", example: "job_7f8e9d0a1b" },
          status: { type: "string", example: "COMPLETED" },
          summary: {
            type: "object",
            properties: {
              autoMatched: { type: "integer", example: 45 },
              suggested: { type: "integer", example: 3 },
              exception: { type: "integer", example: 2 },
              total: { type: "integer", example: 50 },
              matchRatePct: { type: "number", example: 96.0 },
              discrepancyPaise: { type: "integer", example: 1550 },
            },
          },
          exceptions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string", example: "EXP_TXN_001" },
                type: { type: "string", example: "PARTIAL_REFUND_VARIANCE" },
                description: { type: "string", example: "Payment 20,000 - Settlement 18,450 = Refund 1,550 variance" },
                amount: { type: "number", example: 1550 },
                formattedAmount: { type: "string", example: "₹15.50" },
                paymentId: { type: "string", example: "TXN_001" },
                expectedNetAmount: { type: "number", example: 18450 },
                actualSettledAmount: { type: "number", example: 18450 },
                cardinalityType: { type: "string", example: "1:1" },
                aiSuggestionAvailable: { type: "boolean", example: true },
              },
            },
          },
          receipt: {
            type: "object",
            properties: {
              rootHash: { type: "string", example: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
              leafCount: { type: "integer", example: 50 },
              algorithm: { type: "string", example: "SHA256-MERKLE-DAG" },
              timestamp: { type: "string", format: "date-time" },
              signature: { type: "string", example: "a4f89d...31b" },
            },
          },
          processedAt: { type: "string", format: "date-time" },
        },
      },
      ReconciliationAsyncResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          jobId: { type: "string", example: "job_7f8e9d0a1b" },
          status: { type: "string", example: "ACCEPTED" },
          message: { type: "string", example: "Reconciliation batch accepted for asynchronous processing" },
          webhookUrl: { type: "string", example: "https://erp.merchant.com/webhook" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      JobDetailsResponse: {
        type: "object",
        properties: {
          jobId: { type: "string" },
          status: { type: "string", enum: ["PENDING", "PROCESSING", "COMPLETED", "FAILED"] },
          createdAt: { type: "string" },
          completedAt: { type: "string" },
          batchSize: { type: "integer" },
          summary: { type: "object" },
          exceptions: { type: "array", items: { type: "object" } },
          receipt: { type: "object" },
        },
      },
      HealthResponse: {
        type: "object",
        properties: {
          status: { type: "string", example: "ok" },
          uptime: { type: "number", example: 420.5 },
          version: { type: "string", example: "v1" },
          timestamp: { type: "string", format: "date-time" },
          engine: { type: "string", example: "deterministic-settlemate-v1" },
          security: { type: "string", example: "enforced" },
          rateLimitMax: { type: "integer", example: 100 },
        },
      },
      WebhookSubscriptionResponse: {
        type: "object",
        properties: {
          id: { type: "string", example: "wh_9a8b7c6d5e" },
          url: { type: "string", example: "https://erp.merchant.com/webhook" },
          events: { type: "array", items: { type: "string" } },
          status: { type: "string", example: "ACTIVE" },
          secret: { type: "string", example: "whsec_..." },
          registeredAt: { type: "string" },
        },
      },
      ErrorResponse: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: {
              code: { type: "string", example: "INVALID_API_KEY" },
              message: { type: "string", example: "Missing or invalid API key" },
              details: { type: "string" },
            },
          },
        },
      },
    },
  },
};
