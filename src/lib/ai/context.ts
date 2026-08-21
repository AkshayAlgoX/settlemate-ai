import {
  getAccountStatus,
  callGenerativeJSON,
  callGenerativeText,
  AI_TIMEOUT_MS,
  CIRCUIT_COOLDOWN_MS,
} from "./client";

// ── Per-reconciliation AI execution context ──
//
// One AIContext is created for every logical AI execution: each multi-pass
// reconciliation and each explain request. It owns the per-execution logical
// state — call counter, logical call cap, and its own 429 circuit — so that
// concurrent executions (Batch A, Batch B, Explain X) never share or corrupt
// each other's budgets or backoff.
//
// The ACTUAL Gemini API-key quota (~5 req/min) is a genuinely account-wide
// resource shared across all contexts. That protection intentionally remains
// global in client.ts (getAccountStatus / account circuit). This module only
// isolates the LOGICAL execution state.

export interface AIContextOptions {
  maxCallsPerBatch?: number; // logical per-execution cap (default 10, preserves current ceiling)
  circuitCooldownMs?: number; // per-context 429 cooldown (default 65s)
  aiTimeoutMs?: number; // default per-call timeout (default 15s)
}

export interface AIStatus {
  available: boolean;
  callsRemaining: number;
  totalCalls: number;
  circuitOpen: boolean;
  reason: string;
}

export interface AIContext {
  reset(): void;
  getStatus(): AIStatus;
  isAvailable(): boolean;
  generateJSON(
    prompt: string,
    model?: string,
    timeoutMs?: number
  ): Promise<{ data: unknown; tokensUsed: number; latencyMs: number } | null>;
  generateText(
    prompt: string,
    model?: string
  ): Promise<{ text: string; tokensUsed: number; latencyMs: number } | null>;
}

export function createAIContext(opts: AIContextOptions = {}): AIContext {
  const maxCallsPerBatch = opts.maxCallsPerBatch ?? 10;
  const circuitCooldownMs = opts.circuitCooldownMs ?? CIRCUIT_COOLDOWN_MS;
  const aiTimeoutMs = opts.aiTimeoutMs ?? AI_TIMEOUT_MS;

  // Per-context logical execution state. Fully isolated per reconciliation/explain.
  let totalCalls = 0;
  let circuitOpen = false;
  let circuitOpenedAt = 0;

  function getStatus(): AIStatus {
    // Account-wide quota/cooldown is shared across all contexts by design.
    const account = getAccountStatus();
    if (account.blocked) {
      return {
        available: false,
        callsRemaining: 0,
        totalCalls,
        circuitOpen: account.isRateLimited,
        reason: account.reason,
      };
    }

    // Per-context 429 circuit — MUST never affect other contexts.
    if (circuitOpen && Date.now() - circuitOpenedAt < circuitCooldownMs) {
      return {
        available: false,
        callsRemaining: 0,
        totalCalls,
        circuitOpen: true,
        reason: `Rate limited. Retry in ${Math.ceil((circuitCooldownMs - (Date.now() - circuitOpenedAt)) / 1000)}s`,
      };
    }
    if (circuitOpen && Date.now() - circuitOpenedAt >= circuitCooldownMs) {
      circuitOpen = false; // cooldown expired — reopen
    }

    if (totalCalls >= maxCallsPerBatch) {
      return {
        available: false,
        callsRemaining: 0,
        totalCalls,
        circuitOpen: false,
        reason: `Call cap reached (${maxCallsPerBatch}/${maxCallsPerBatch})`,
      };
    }

    return {
      available: true,
      callsRemaining: maxCallsPerBatch - totalCalls,
      totalCalls,
      circuitOpen: false,
      reason: "Available",
    };
  }

  function openCircuit() {
    circuitOpen = true;
    circuitOpenedAt = Date.now();
  }

  async function generateJSON(
    prompt: string,
    model: string = "gemini-3.6-flash",
    timeoutMs: number = aiTimeoutMs
  ): Promise<{ data: unknown; tokensUsed: number; latencyMs: number } | null> {
    const status = getStatus();
    if (!status.available) {
      console.log(`[AI] Skipped: ${status.reason}`);
      return null;
    }

    totalCalls++;
    const result = await callGenerativeJSON(prompt, model, timeoutMs);

    if (result.status === "success") {
      return { data: result.data, tokensUsed: result.tokensUsed, latencyMs: result.latencyMs };
    }
    if (result.status === "rate-limited") openCircuit();
    return null;
  }

  async function generateText(
    prompt: string,
    model: string = "gemini-3.6-flash"
  ): Promise<{ text: string; tokensUsed: number; latencyMs: number } | null> {
    const status = getStatus();
    if (!status.available) return null;

    totalCalls++;
    const result = await callGenerativeText(prompt, model);

    if (result.status === "success") {
      return { text: result.text, tokensUsed: result.tokensUsed, latencyMs: result.latencyMs };
    }
    if (result.status === "rate-limited") openCircuit();
    return null;
  }

  return {
    reset() {
      totalCalls = 0;
      circuitOpen = false;
      circuitOpenedAt = 0;
    },
    getStatus,
    isAvailable: () => getStatus().available,
    generateJSON,
    generateText,
  };
}
