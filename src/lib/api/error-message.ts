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
}

/**
 * Extracts a displayable message from an API response body, whichever envelope
 * the route used. Falls back to `fallback` when the body carries no usable text,
 * so the return value is always safe to render or pass to `new Error()`.
 */
export function apiErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;

  const raw = (payload as { error?: unknown }).error;

  if (typeof raw === "string" && raw.trim().length > 0) return raw;

  if (raw && typeof raw === "object") {
    const structured = raw as StructuredApiError;
    if (typeof structured.message === "string" && structured.message.trim().length > 0) {
      return structured.message;
    }
    // A code with no message is still more actionable than a generic fallback.
    if (typeof structured.code === "string" && structured.code.trim().length > 0) {
      return structured.code;
    }
  }

  // Some routes report failure as { success: false, message: "..." }.
  const topLevel = (payload as { message?: unknown }).message;
  if (typeof topLevel === "string" && topLevel.trim().length > 0) return topLevel;

  return fallback;
}
