/*
 * SettleMate AI — Safe Fetch & Universal API Client Utilities
 *
 * Provides crash-resilient HTTP fetching, safe response parsing (never throwing
 * 'Unexpected end of JSON input' on empty bodies or HTML), standardized error envelope
 * extraction, accurate 429 Retry-After handling with real second countdowns,
 * granular timeout classification, and visibility-aware polling.
 */

export interface StructuredApiError {
  message?: string;
  code?: string;
  retryable?: boolean;
  retryAfterSeconds?: number;
  requestId?: string;
  timestamp?: string;
  details?: unknown;
}

export interface SafeFetchResult<T = unknown> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
  code: string | null;
  retryable: boolean;
  retryAfterSeconds: number | null;
  requestId: string | null;
  rawText?: string;
}

export interface SafeFetchOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
}

/**
 * Parses a numeric or HTTP-date Retry-After header string into remaining seconds.
 */
export function parseRetryAfterHeader(headerValue: string | null | undefined): number | null {
  if (!headerValue) return null;
  const trimmed = headerValue.trim();
  const numeric = parseInt(trimmed, 10);
  if (!isNaN(numeric) && numeric >= 0) {
    return numeric;
  }
  // Try parsing as HTTP Date (RFC 7231 / IMF-fixdate)
  const parsedDate = Date.parse(trimmed);
  if (!isNaN(parsedDate)) {
    const diffSeconds = Math.max(1, Math.ceil((parsedDate - Date.now()) / 1000));
    return diffSeconds;
  }
  return null;
}

/**
 * Classifies an error message or exception into a standardized classification code
 * and human-friendly user message.
 */
export function classifyError(
  err: unknown,
  status?: number
): { code: string; message: string; retryable: boolean } {
  const text = (err instanceof Error ? err.message : String(err || "")).toLowerCase();

  // 1. Database Connection & Busy Timeouts
  if (
    text.includes("timeout exceeded when trying to connect") ||
    text.includes("sqlite_busy") ||
    text.includes("database is locked") ||
    text.includes("econnrefused") ||
    text.includes("database connection") ||
    text.includes("prisma client initialization")
  ) {
    return {
      code: "DATABASE_TIMEOUT",
      message: "Service is temporarily unable to reach the database.",
      retryable: true,
    };
  }

  // 2. Upstream AI Timeouts
  if (
    text.includes("ai investigation timed out") ||
    text.includes("anthropic") ||
    text.includes("gemini") ||
    text.includes("openai") ||
    text.includes("llm timeout") ||
    text.includes("model call timed out")
  ) {
    return {
      code: "AI_TIMEOUT",
      message: "AI investigation timed out. Your financial reconciliation is unaffected.",
      retryable: true,
    };
  }

  // 3. Client / Network Fetch Timeouts & Aborts
  if (
    text.includes("abort") ||
    text.includes("timeout") ||
    text.includes("timed out") ||
    status === 408 ||
    status === 504
  ) {
    return {
      code: "CLIENT_TIMEOUT",
      message: "Operation timed out. Processing may still be running in the background.",
      retryable: true,
    };
  }

  // 4. Network Disconnection
  if (
    text.includes("failed to fetch") ||
    text.includes("network error") ||
    text.includes("networkrequestfailed") ||
    status === 0
  ) {
    return {
      code: "NETWORK_ERROR",
      message: "Network connection lost or server unreachable. Please check your internet connection.",
      retryable: true,
    };
  }

  // 5. Rate Limiting (429)
  if (status === 429 || text.includes("rate limit") || text.includes("too many requests")) {
    return {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests. Please slow down and try again shortly.",
      retryable: true,
    };
  }

  // 6. HTTP Status-based defaults
  if (status === 401) {
    return {
      code: "UNAUTHORIZED",
      message: "Session expired or authentication required. Please sign in again.",
      retryable: false,
    };
  }
  if (status === 403) {
    return {
      code: "FORBIDDEN",
      message: "Access Denied: You do not have permission or cross-tenant access is prohibited.",
      retryable: false,
    };
  }
  if (status === 404) {
    return {
      code: "NOT_FOUND",
      message: "The requested financial resource or batch was not found.",
      retryable: false,
    };
  }
  if (status === 409) {
    return {
      code: "CONFLICT",
      message: "A concurrent conflicting operation is already in progress.",
      retryable: true,
    };
  }
  if (status === 422 || status === 400) {
    return {
      code: "VALIDATION_ERROR",
      message: err instanceof Error && err.message ? err.message : "Invalid input parameters.",
      retryable: false,
    };
  }
  if (status === 503) {
    return {
      code: "SERVICE_UNAVAILABLE",
      message: "Financial service is temporarily undergoing maintenance or overloaded.",
      retryable: true,
    };
  }

  return {
    code: "INTERNAL_SERVER_ERROR",
    message:
      err instanceof Error && err.message && !err.message.includes("V8") && status && status < 500
        ? err.message
        : "An unexpected error occurred while processing your request.",
    retryable: status ? status >= 500 : true,
  };
}

/**
 * Safely parse any HTTP Response without ever throwing 'Unexpected end of JSON input'.
 * Extracts JSON, parses headers (Retry-After, X-Request-Id), and safely handles HTML error pages.
 */
export async function safeParseResponse<T = unknown>(response: Response): Promise<SafeFetchResult<T>> {
  const status = response.status;
  const ok = response.ok;
  const requestId =
    response.headers.get("x-request-id") ||
    response.headers.get("request-id") ||
    null;

  // Extract real Retry-After if present
  const retryAfterHeader = response.headers.get("retry-after");
  const retryAfterSecondsFromHeader = parseRetryAfterHeader(retryAfterHeader);

  // 1. Status 204 No Content or empty 200/201 response
  if (status === 204) {
    return {
      ok: true,
      status: 204,
      data: {} as T,
      error: null,
      code: null,
      retryable: false,
      retryAfterSeconds: null,
      requestId,
    };
  }

  // 2. Read text safely
  let text = "";
  try {
    text = await response.text();
  } catch (readErr) {
    const classification = classifyError(readErr, status);
    return {
      ok: false,
      status,
      data: null,
      error: classification.message,
      code: classification.code,
      retryable: classification.retryable,
      retryAfterSeconds: retryAfterSecondsFromHeader,
      requestId,
    };
  }

  if (!text || text.trim().length === 0) {
    if (ok) {
      return {
        ok: true,
        status,
        data: {} as T,
        error: null,
        code: null,
        retryable: false,
        retryAfterSeconds: null,
        requestId,
      };
    }
    const classification = classifyError(null, status);
    return {
      ok: false,
      status,
      data: null,
      error: classification.message,
      code: classification.code,
      retryable: classification.retryable,
      retryAfterSeconds: retryAfterSecondsFromHeader,
      requestId,
      rawText: text,
    };
  }

  // 3. Detect HTML error pages (e.g. Next.js 500 page or proxy 502/504 Bad Gateway)
  const trimmed = text.trim();
  if (
    trimmed.startsWith("<!DOCTYPE") ||
    trimmed.startsWith("<html") ||
    trimmed.startsWith("<HTML")
  ) {
    const classification = classifyError(null, status);
    return {
      ok: false,
      status,
      data: null,
      error: classification.message,
      code: classification.code,
      retryable: classification.retryable,
      retryAfterSeconds: retryAfterSecondsFromHeader,
      requestId,
      rawText: text,
    };
  }

  // 4. Parse JSON
  let parsedJson: unknown = null;
  try {
    parsedJson = JSON.parse(text);
  } catch {
    // Non-JSON plain text body
    if (ok) {
      return {
        ok: true,
        status,
        data: text as unknown as T,
        error: null,
        code: null,
        retryable: false,
        retryAfterSeconds: null,
        requestId,
        rawText: text,
      };
    }
    const classification = classifyError(text, status);
    return {
      ok: false,
      status,
      data: null,
      error: text.length < 200 ? text : classification.message,
      code: classification.code,
      retryable: classification.retryable,
      retryAfterSeconds: retryAfterSecondsFromHeader,
      requestId,
      rawText: text,
    };
  }

  // 5. Extract structured fields from JSON envelope
  let extractedMessage: string | null = null;
  let extractedCode: string | null = null;
  let extractedRetryAfter: number | null = retryAfterSecondsFromHeader;
  let extractedRetryable: boolean = false;
  let extractedRequestId: string | null = requestId;

  if (parsedJson && typeof parsedJson === "object") {
    const obj = parsedJson as Record<string, unknown>;

    // Check for requestId
    if (typeof obj.requestId === "string") {
      extractedRequestId = obj.requestId;
    }

    // Check for error object or string
    const rawError = obj.error;
    if (typeof rawError === "string") {
      extractedMessage = rawError;
    } else if (rawError && typeof rawError === "object") {
      const errObj = rawError as StructuredApiError;
      if (typeof errObj.message === "string") extractedMessage = errObj.message;
      if (typeof errObj.code === "string") extractedCode = errObj.code;
      if (typeof errObj.retryable === "boolean") extractedRetryable = errObj.retryable;
      if (typeof errObj.retryAfterSeconds === "number") extractedRetryAfter = errObj.retryAfterSeconds;
      if (typeof errObj.requestId === "string") extractedRequestId = errObj.requestId;
    }

    if (!extractedMessage && typeof obj.message === "string") {
      extractedMessage = obj.message;
    }
    if (!extractedCode && typeof obj.code === "string") {
      extractedCode = obj.code;
    }
    if (typeof obj.retryAfterSeconds === "number") {
      extractedRetryAfter = obj.retryAfterSeconds;
    }
    if (typeof obj.retryable === "boolean") {
      extractedRetryable = obj.retryable;
    }
  }

  // Real 429 rate limit message derivation
  if (status === 429 || extractedCode === "RATE_LIMIT_EXCEEDED") {
    const seconds = extractedRetryAfter || 10;
    extractedMessage = `Too many requests. Try again in ${seconds} seconds.`;
    extractedCode = "RATE_LIMIT_EXCEEDED";
    extractedRetryable = true;
    extractedRetryAfter = seconds;
  }

  if (!ok) {
    const fallbackClassification = classifyError(extractedMessage || text, status);
    return {
      ok: false,
      status,
      data: parsedJson as T,
      error: extractedMessage || fallbackClassification.message,
      code: extractedCode || fallbackClassification.code,
      retryable: extractedRetryable || fallbackClassification.retryable,
      retryAfterSeconds: extractedRetryAfter,
      requestId: extractedRequestId,
      rawText: text,
    };
  }

  return {
    ok: true,
    status,
    data: parsedJson as T,
    error: null,
    code: null,
    retryable: false,
    retryAfterSeconds: null,
    requestId: extractedRequestId,
    rawText: text,
  };
}

/**
 * Universal safe fetch wrapper that guards against timeouts, connection aborts,
 * 429 rate limiting, and malformed responses.
 */
export async function safeFetch<T = unknown>(
  input: RequestInfo | URL,
  init?: SafeFetchOptions
): Promise<SafeFetchResult<T>> {
  const timeoutMs = init?.timeoutMs ?? 30_000;
  const controller = new AbortController();
  const timeoutTimer = setTimeout(() => controller.abort(), timeoutMs);

  const fetchSignal = init?.signal
    ? composeSignals(init.signal, controller.signal)
    : controller.signal;

  try {
    const response = await fetch(input, {
      ...init,
      signal: fetchSignal,
    });

    clearTimeout(timeoutTimer);
    return await safeParseResponse<T>(response);
  } catch (networkError: unknown) {
    clearTimeout(timeoutTimer);
    const classification = classifyError(networkError);
    return {
      ok: false,
      status: classification.code === "CLIENT_TIMEOUT" ? 408 : 0,
      data: null,
      error: classification.message,
      code: classification.code,
      retryable: classification.retryable,
      retryAfterSeconds: null,
      requestId: null,
    };
  }
}

function composeSignals(sig1: AbortSignal, sig2: AbortSignal): AbortSignal {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  sig1.addEventListener("abort", onAbort);
  sig2.addEventListener("abort", onAbort);
  if (sig1.aborted || sig2.aborted) {
    controller.abort();
  }
  return controller.signal;
}

/**
 * Visibility-aware polling controller with exponential backoff and jitter.
 * Automatically throttles when document is hidden (background tab) and
 * immediately triggers on focus/visibility restoration.
 */
export class VisibilityAwarePoller {
  private timer: NodeJS.Timeout | null = null;
  private active = false;
  private consecutiveFailures = 0;
  private currentIntervalMs: number;

  constructor(
    private readonly task: () => Promise<{ stop?: boolean } | void>,
    private readonly baseIntervalMs: number = 1500,
    private readonly maxIntervalMs: number = 10000,
    private readonly backgroundIntervalMs: number = 8000
  ) {
    this.currentIntervalMs = baseIntervalMs;
  }

  public start(): void {
    if (this.active) return;
    this.active = true;
    this.consecutiveFailures = 0;
    this.scheduleNext(0);

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.handleVisibilityChange);
    }
  }

  public stop(): void {
    this.active = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    }
  }

  private handleVisibilityChange = (): void => {
    if (!this.active) return;
    if (document.visibilityState === "visible") {
      // User returned to tab: wake up immediately!
      if (this.timer) {
        clearTimeout(this.timer);
      }
      this.scheduleNext(0);
    }
  };

  private scheduleNext(delayMs: number): void {
    if (!this.active) return;
    this.timer = setTimeout(async () => {
      if (!this.active) return;
      try {
        const res = await this.task();
        this.consecutiveFailures = 0;
        this.currentIntervalMs = this.baseIntervalMs;

        if (res && res.stop) {
          this.stop();
          return;
        }
      } catch {
        this.consecutiveFailures += 1;
        // Bounded exponential backoff with jitter
        const backoff = Math.min(
          this.maxIntervalMs,
          this.baseIntervalMs * Math.pow(1.5, Math.min(this.consecutiveFailures, 5))
        );
        const jitter = Math.random() * 500;
        this.currentIntervalMs = backoff + jitter;
      }

      if (!this.active) return;

      const isHidden = typeof document !== "undefined" && document.visibilityState === "hidden";
      const nextDelay = isHidden
        ? Math.max(this.backgroundIntervalMs, this.currentIntervalMs)
        : this.currentIntervalMs;

      this.scheduleNext(nextDelay);
    }, delayMs);
  }
}
