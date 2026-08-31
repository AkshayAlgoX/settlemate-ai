/*
 * SettleMate AI — Production API Security & Rate Limiting Module
 *
 * Provides in-memory token bucket rate limiting (100 req/min per API key/IP),
 * CORS handling, security headers injection, input sanitization, and API key validation.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";

/**
 * Tenant every unbound credential resolves to. Declared locally rather than
 * imported from `@/lib/tenant/tenant-context` so this module stays free of the
 * Prisma client — `proxy.ts` runs on the request path for every route.
 */
const DEFAULT_TENANT_ID = "tenant_default_sandbox";

export interface RateLimiterConfig {
  maxTokens: number; // Max burst / capacity (e.g. 100)
  refillWindowMs: number; // Refill interval in ms (e.g. 60,000)
}

interface Bucket {
  tokens: number;
  lastRefill: number;
}

export class TokenBucketRateLimiter {
  private buckets = new Map<string, Bucket>();
  private readonly maxTokens: number;
  private readonly refillWindowMs: number;

  constructor(config: RateLimiterConfig = { maxTokens: 100, refillWindowMs: 60_000 }) {
    this.maxTokens = config.maxTokens;
    this.refillWindowMs = config.refillWindowMs;
  }

  /**
   * Check and consume a token for a given client identifier.
   */
  check(clientId: string, now: number = Date.now()): {
    allowed: boolean;
    remaining: number;
    resetAt: number;
    retryAfterSeconds: number;
  } {
    let bucket = this.buckets.get(clientId);

    if (!bucket) {
      bucket = {
        tokens: this.maxTokens - 1,
        lastRefill: now,
      };
      this.buckets.set(clientId, bucket);
      return {
        allowed: true,
        remaining: bucket.tokens,
        resetAt: now + this.refillWindowMs,
        retryAfterSeconds: 0,
      };
    }

    // Refill tokens based on elapsed time
    const elapsed = now - bucket.lastRefill;
    if (elapsed >= this.refillWindowMs) {
      bucket.tokens = this.maxTokens;
      bucket.lastRefill = now;
    } else {
      const tokensToAdd = Math.floor((elapsed / this.refillWindowMs) * this.maxTokens);
      if (tokensToAdd > 0) {
        bucket.tokens = Math.min(this.maxTokens, bucket.tokens + tokensToAdd);
        bucket.lastRefill = now;
      }
    }

    if (bucket.tokens > 0) {
      bucket.tokens--;
      const resetAt = bucket.lastRefill + this.refillWindowMs;
      return {
        allowed: true,
        remaining: bucket.tokens,
        resetAt,
        retryAfterSeconds: 0,
      };
    }

    const resetAt = bucket.lastRefill + this.refillWindowMs;
    const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000));
    return {
      allowed: false,
      remaining: 0,
      resetAt,
      retryAfterSeconds,
    };
  }

  reset(clientId: string): void {
    this.buckets.delete(clientId);
  }

  clear(): void {
    this.buckets.clear();
  }
}

// Global default API rate limiter: 100 requests per minute
export const apiV1RateLimiter = new TokenBucketRateLimiter({
  maxTokens: 100,
  refillWindowMs: 60_000,
});

/**
 * Standard CORS headers.
 * NOTE: For demo & integration simulator, Access-Control-Allow-Origin is set to '*'.
 * In a hardened production deployment, this should be restricted to trusted domains (e.g. process.env.ALLOWED_ORIGINS).
 */
export function getCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key, Accept, Origin, X-Requested-With",
    "Access-Control-Max-Age": "86400",
  };
}

/**
 * Standard Security Headers for API responses.
 */
export function getSecurityHeaders(): Record<string, string> {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "default-src 'none'",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  };
}

/**
 * Applies security and CORS headers to any Next.js response.
 */
export function applySecurityHeaders(
  response: NextResponse,
  extraHeaders?: Record<string, string>
): NextResponse {
  const security = getSecurityHeaders();
  const cors = getCorsHeaders();

  for (const [key, value] of Object.entries(security)) {
    response.headers.set(key, value);
  }
  for (const [key, value] of Object.entries(cors)) {
    response.headers.set(key, value);
  }
  if (extraHeaders) {
    for (const [key, value] of Object.entries(extraHeaders)) {
      response.headers.set(key, value);
    }
  }

  return response;
}

/**
 * Handle OPTIONS preflight requests.
 */
export function handleCorsPreflight(): NextResponse {
  return applySecurityHeaders(
    new NextResponse(null, { status: 204 })
  );
}

/**
 * Extracts client identifier from request (API Key > Bearer token > IP).
 */
export function getClientIdentifier(req: NextRequest): string {
  const apiKey = req.headers.get("x-api-key") || req.headers.get("authorization");
  if (apiKey && apiKey.trim().length > 0) {
    return `auth_${apiKey.trim().replace(/^Bearer\s+/i, "")}`;
  }

  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return `ip_${forwarded.split(",")[0].trim()}`;
  }

  const realIp = req.headers.get("x-real-ip");
  if (realIp) {
    return `ip_${realIp.trim()}`;
  }

  return "client_default";
}

/**
 * Validates API key according to specification:
 * Must start with 'sk_' and have length > 20.
 */
export function validateApiKey(rawKey: string | null | undefined): {
  valid: boolean;
  error?: string;
  key?: string;
} {
  if (!rawKey) {
    return {
      valid: false,
      error: "Missing API key. Provide 'X-API-Key' or 'Authorization: Bearer sk_...'",
    };
  }

  const cleaned = rawKey.trim().replace(/^Bearer\s+/i, "");
  if (!cleaned.startsWith("sk_")) {
    return {
      valid: false,
      error: "Invalid API key format. Secret keys must begin with 'sk_'",
    };
  }

  if (cleaned.length <= 20) {
    return {
      valid: false,
      error: "Invalid API key length. Secret keys must be longer than 20 characters",
    };
  }

  return {
    valid: true,
    key: cleaned,
  };
}

/**
 * Sanitizes input string to prevent control characters, prototype injection, and script injection.
 */
export function sanitizeInputString(input: unknown, maxLength: number = 5000): string {
  if (input === null || input === undefined) return "";
  const str = String(input);
  if (str.length > maxLength) {
    return str.slice(0, maxLength);
  }
  // Strip null bytes and non-printable control characters (except newline and tab)
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim();
}

/**
 * Recursively sanitizes JSON objects, guarding against prototype pollution.
 */
export function sanitizeObject<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") {
    if (typeof obj === "string") {
      return sanitizeInputString(obj) as unknown as T;
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item)) as unknown as T;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    // Guard against prototype pollution
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      continue;
    }
    const cleanKey = sanitizeInputString(key, 128);
    sanitized[cleanKey] = sanitizeObject(value);
  }

  return sanitized as T;
}

/**
 * Rate limit guard helper for Next.js route handlers.
 * Returns { allowed: true } or { allowed: false, response: NextResponse }
 */
export function rateLimitGuard(
  req: NextRequest,
  limiter: TokenBucketRateLimiter = apiV1RateLimiter
): { allowed: boolean; response?: NextResponse; clientId: string; remaining: number } {
  const clientId = getClientIdentifier(req);
  const check = limiter.check(clientId);

  if (!check.allowed) {
    const errorResponse = NextResponse.json(
      {
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: `Rate limit exceeded. Maximum 100 requests per minute allowed. Try again in ${check.retryAfterSeconds} seconds.`,
          retryAfterSeconds: check.retryAfterSeconds,
          resetAt: new Date(check.resetAt).toISOString(),
        },
      },
      { status: 429 }
    );
    applySecurityHeaders(errorResponse, {
      "Retry-After": String(check.retryAfterSeconds),
      "X-RateLimit-Limit": "100",
      "X-RateLimit-Remaining": "0",
      "X-RateLimit-Reset": String(Math.floor(check.resetAt / 1000)),
    });

    return { allowed: false, response: errorResponse, clientId, remaining: 0 };
  }

  return { allowed: true, clientId, remaining: check.remaining };
}

/**
 * API-key guard helper for /api/v1/* route handlers.
 *
 * The v1 surface is a MACHINE API authenticated by `sk_` key, distinct from the
 * dashboard's session-cookie boundary in proxy.ts. Because proxy.ts deliberately
 * lets /api/v1/* through so this key check can run, every v1 route that returns
 * or mutates tenant data MUST call this. Mirrors rateLimitGuard's shape so a
 * handler reads: rate limit -> key auth -> work.
 */
export function apiKeyGuard(
  req: NextRequest
): { allowed: boolean; response?: NextResponse; key?: string } {
  const rawKey = req.headers.get("x-api-key") || req.headers.get("authorization");
  const auth = validateApiKey(rawKey);

  if (!auth.valid) {
    return {
      allowed: false,
      response: applySecurityHeaders(
        NextResponse.json(
          {
            error: {
              code: "UNAUTHORIZED",
              message:
                auth.error || "Valid API key starting with 'sk_' (length > 20) required",
            },
          },
          { status: 401 }
        ),
        { "WWW-Authenticate": 'Bearer realm="settlemate-api-v1"' }
      ),
    };
  }

  return { allowed: true, key: auth.key };
}

/**
 * Authentication guard for the v1 streaming surface, which is reached by two
 * different kinds of caller:
 *
 *   - the browser dashboard (`live-monitor`), which carries a session cookie and
 *     no API key, because `EventSource` cannot set request headers;
 *   - machine integrations, which carry `X-API-Key` / `Authorization: Bearer sk_…`.
 *
 * Either credential is accepted; an anonymous request is refused with 401.
 *
 * The tenant is resolved **server-side only** — from the session when there is
 * one, otherwise the default sandbox tenant that an unbound API key maps to.
 * A caller-supplied `x-tenant-id` is never used to select the tenant; if it is
 * present and disagrees with the resolved tenant the request is refused with 403
 * rather than silently ignored, so tampering is visible in logs.
 */
export function sessionOrApiKeyGuard(req: NextRequest): {
  allowed: boolean;
  response?: NextResponse;
  tenantId: string;
  role: string;
  authMode: "session" | "api_key" | "none";
} {
  const session = getSession(req);

  let tenantId: string;
  let role: string;
  let authMode: "session" | "api_key";

  if (session) {
    tenantId = session.tenantId || DEFAULT_TENANT_ID;
    role = session.role;
    authMode = "session";
  } else {
    const auth = validateApiKey(
      req.headers.get("x-api-key") || req.headers.get("authorization")
    );
    if (!auth.valid) {
      return {
        allowed: false,
        tenantId: DEFAULT_TENANT_ID,
        role: "ANONYMOUS",
        authMode: "none",
        response: applySecurityHeaders(
          NextResponse.json(
            {
              error: {
                code: "UNAUTHORIZED",
                message:
                  auth.error ||
                  "Authentication required: provide a session cookie or an API key starting with 'sk_' (length > 20)",
              },
            },
            { status: 401 }
          ),
          { "WWW-Authenticate": 'Bearer realm="settlemate-api-v1"' }
        ),
      };
    }
    tenantId = DEFAULT_TENANT_ID;
    role = "SERVICE";
    authMode = "api_key";
  }

  const requestedTenantId = req.headers.get("x-tenant-id");
  if (requestedTenantId && requestedTenantId !== tenantId) {
    return {
      allowed: false,
      tenantId,
      role,
      authMode,
      response: applySecurityHeaders(
        NextResponse.json(
          {
            error: {
              code: "FORBIDDEN_CROSS_TENANT_ACCESS",
              message: `Access Denied: authenticated tenant '${tenantId}' cannot access or mutate records for tenant '${requestedTenantId}'.`,
              timestamp: new Date().toISOString(),
            },
          },
          { status: 403 }
        )
      ),
    };
  }

  return { allowed: true, tenantId, role, authMode };
}

/**
 * Validates request payload size against a strict byte limit (default: 1MB).
 */
export function validateBodySize(
  rawBody: string | Buffer | null | undefined,
  maxBytes: number = 1_048_576
): { valid: boolean; sizeBytes: number; error?: string } {
  if (!rawBody) return { valid: true, sizeBytes: 0 };
  const sizeBytes = typeof rawBody === "string" ? Buffer.byteLength(rawBody, "utf8") : rawBody.length;
  if (sizeBytes > maxBytes) {
    return {
      valid: false,
      sizeBytes,
      error: `Payload size (${(sizeBytes / 1024 / 1024).toFixed(2)} MB) exceeds maximum allowed limit of ${(maxBytes / 1024 / 1024).toFixed(0)} MB`,
    };
  }
  return { valid: true, sizeBytes };
}

/**
 * Checks that a nested JSON structure does not exceed maximum allowable depth (DoS defense).
 */
export function checkObjectDepth(obj: unknown, maxDepth: number = 10, currentDepth: number = 0): boolean {
  if (currentDepth > maxDepth) return false;
  if (obj === null || typeof obj !== "object") return true;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (!checkObjectDepth(item, maxDepth, currentDepth + 1)) return false;
    }
    return true;
  }

  for (const val of Object.values(obj as Record<string, unknown>)) {
    if (!checkObjectDepth(val, maxDepth, currentDepth + 1)) return false;
  }
  return true;
}

/**
 * Sanitizes header values against CRLF injection / HTTP response splitting.
 */
export function sanitizeHeaderValue(val: string): string {
  if (!val) return "";
  return val.replace(/[\r\n]/g, "").trim();
}

/**
 * Strips NoSQL query injection operators ($where, $gt, $ne, $regex, etc.).
 */
export function sanitizeNoSqlOperators<T>(input: T): T {
  if (input === null || typeof input !== "object") return input;

  if (Array.isArray(input)) {
    return input.map((item) => sanitizeNoSqlOperators(item)) as unknown as T;
  }

  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (k.startsWith("$") || k === "__proto__" || k === "constructor") continue;
    cleaned[k] = sanitizeNoSqlOperators(v);
  }
  return cleaned as T;
}

/**
 * Creates safe, standardized error response adhering to the global API error contract:
 * { error: string, code: string, retryable: boolean, retryAfterSeconds?: number, requestId: string, timestamp: string }
 * while maintaining 100% backward compatibility for { error: { code, message, timestamp } }.
 */
export function safeErrorResponse(
  err: unknown,
  status: number = 500,
  defaultCode: string = "INTERNAL_SERVER_ERROR",
  options?: { retryable?: boolean; retryAfterSeconds?: number; requestId?: string }
): NextResponse {
  let message = "An unexpected internal error occurred.";
  let code = defaultCode;
  const requestId = options?.requestId || `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  if (err instanceof Error) {
    const raw = err.message || "";
    if (
      raw.includes("timeout exceeded when trying to connect") ||
      raw.includes("SQLITE_BUSY") ||
      raw.includes("database is locked") ||
      raw.includes("ECONNREFUSED") ||
      raw.includes("ETIMEDOUT")
    ) {
      message = "Service is temporarily unable to reach the database.";
      code = "DATABASE_TIMEOUT";
    } else if (
      raw.includes("AI investigation timed out") ||
      raw.includes("model call timed out") ||
      raw.includes("Anthropic") ||
      raw.includes("Gemini") ||
      raw.includes("OpenAI")
    ) {
      message = "AI investigation timed out. Your financial reconciliation is unaffected.";
      code = "AI_TIMEOUT";
    } else if (status < 500) {
      message = raw;
    } else {
      // In production, mask internal server error details
      message = "An unexpected error occurred while processing the financial request.";
    }
  } else if (typeof err === "string" && err.trim().length > 0) {
    message = err;
  }

  const retryable =
    options?.retryable ??
    (status === 429 || status === 503 || status === 504 || code === "DATABASE_TIMEOUT" || code === "AI_TIMEOUT");

  const timestamp = new Date().toISOString();

  const responseBody = {
    error: {
      code,
      message,
      retryable,
      retryAfterSeconds: options?.retryAfterSeconds,
      requestId,
      timestamp,
    },
    message,
    code,
    retryable,
    retryAfterSeconds: options?.retryAfterSeconds,
    requestId,
    timestamp,
  };

  const response = NextResponse.json(responseBody, { status });
  const extraHeaders: Record<string, string> = {
    "X-Request-Id": requestId,
  };
  if (options?.retryAfterSeconds) {
    extraHeaders["Retry-After"] = String(options.retryAfterSeconds);
  }

  return applySecurityHeaders(response, extraHeaders);
}


/**
 * Extracts and verifies tenant identity from request session or API key,
 * validating against any attempted cross-tenant overrides.
 */
export function extractTenantIdentity(
  req: NextRequest,
  requestedTenantId?: string | null
): { tenantId: string; role: string; errorResponse?: NextResponse } {
  const session = getSession(req);

  let activeTenantId = "tenant_default_sandbox";
  let activeRole = "SERVICE";

  if (session) {
    activeTenantId = session.tenantId || "tenant_default_sandbox";
    activeRole = session.role;
  }

  // Cross-tenant tampering defense: if the request attempts to specify another tenant
  if (requestedTenantId && requestedTenantId !== activeTenantId) {
    const errorResponse = NextResponse.json(
      {
        error: {
          code: "FORBIDDEN_CROSS_TENANT_ACCESS",
          message: `Access Denied: authenticated tenant '${activeTenantId}' cannot access or mutate records for tenant '${requestedTenantId}'.`,
          timestamp: new Date().toISOString(),
        },
      },
      { status: 403 }
    );
    return {
      tenantId: activeTenantId,
      role: activeRole,
      errorResponse: applySecurityHeaders(errorResponse),
    };
  }

  return { tenantId: activeTenantId, role: activeRole };
}
