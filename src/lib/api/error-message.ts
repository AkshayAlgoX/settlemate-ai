/*
 * SettleMate AI — Client-side API error reader
 *
 * The API deliberately returns two different error envelopes:
 *
 *   { error: "Missing required CSV column: utr" }
 *       — a page-facing 4xx, where the message IS the useful content and is safe
 *         to show verbatim because the route authored it.
 *
 *   { error: { code, message, timestamp } }
 *       — every 5xx (via safeErrorResponse) and the whole /api/v1 surface, where
 *         the message is deliberately generic and the machine-readable `code` is
 *         what a caller should branch on.
 *
 * Both shapes are correct and neither is going away, so client code must not
 * assume one. It also must never hand the object form to React: an object as a
 * child throws, which would turn a cleanly-handled server error into a blank
 * screen — strictly worse than the error it was reporting.
 */

interface StructuredApiError {
  code?: unknown;
  message?: unknown;
  retryAfterSeconds?: unknown;
  error?: unknown;
}

/**
 * Extracts a displayable message from an API response body, whichever envelope
 * the route used. Handles 429 Retry-After, database timeouts, AI timeouts,
 * nested error objects, and safe string fallbacks.
 */
export function apiErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;

  const raw = (payload as { error?: unknown }).error;

  if (typeof raw === "string" && raw.trim().length > 0) {
    if (raw.includes("timeout exceeded when trying to connect") || raw.includes("SQLITE_BUSY")) {
      return "Service is temporarily unable to reach the database.";
    }
    if (raw.includes("AI investigation timed out")) {
      return "AI investigation timed out. Your financial reconciliation is unaffected.";
    }
    return raw;
  }

  if (raw && typeof raw === "object") {
    const structured = raw as StructuredApiError;
    if (typeof structured.code === "string" && structured.code === "RATE_LIMIT_EXCEEDED" && structured.retryAfterSeconds) {
      return `Too many requests. Try again in ${structured.retryAfterSeconds} seconds.`;
    }
    if (typeof structured.message === "string" && structured.message.trim().length > 0) {
      if (structured.message.includes("timeout exceeded when trying to connect") || structured.message.includes("SQLITE_BUSY")) {
        return "Service is temporarily unable to reach the database.";
      }
      return structured.message;
    }
    if (typeof structured.error === "string" && structured.error.trim().length > 0) {
      return structured.error;
    }
    // A code with no message is still more actionable than a generic fallback.
    if (typeof structured.code === "string" && structured.code.trim().length > 0) {
      return structured.code;
    }
  }

  // Some routes report failure as { success: false, message: "...", retryAfterSeconds: ... }.
  const topLevel = payload as { message?: unknown; code?: unknown; retryAfterSeconds?: unknown };
  if (topLevel.code === "RATE_LIMIT_EXCEEDED" && topLevel.retryAfterSeconds) {
    return `Too many requests. Try again in ${topLevel.retryAfterSeconds} seconds.`;
  }
  if (typeof topLevel.message === "string" && topLevel.message.trim().length > 0) {
    if (topLevel.message.includes("timeout exceeded when trying to connect") || topLevel.message.includes("SQLITE_BUSY")) {
      return "Service is temporarily unable to reach the database.";
    }
    return topLevel.message;
  }

  return fallback;
}

