import {
  getAccountStatus,
  callGenerativeJSON,
  callGenerativeText,
  AI_TIMEOUT_MS,
} from "./client";

export const MAX_CALLS_PER_EXECUTION = 10;

export interface AIContextStatus {
  available: boolean;
  callsRemaining: number;
  totalCalls: number;
  circuitOpen: boolean;
  reason: string;
}

export interface AIContext {
  readonly totalCalls: number;
  readonly maxCalls: number;
  readonly circuitOpen: boolean;

  isAvailable(): boolean;

  generateJSON(
    prompt: string,
    model?: string,
    timeoutMs?: number
  ): Promise<{
    data: unknown;
    tokensUsed: number;
    latencyMs: number;
  } | null>;

  generateText(
    prompt: string,
    model?: string,
    timeoutMs?: number
  ): Promise<{
    text: string;
    tokensUsed: number;
    latencyMs: number;
  } | null>;

  getStatus(): AIContextStatus;
}

export function createAIContext(
  maxCalls: number = MAX_CALLS_PER_EXECUTION
): AIContext {
  if (!Number.isInteger(maxCalls) || maxCalls <= 0) {
    throw new Error(`Invalid AI context call limit: ${maxCalls}`);
  }

  let totalCalls = 0;

  const getStatus = (): AIContextStatus => {
    const account = getAccountStatus();

    if (!account.available) {
      return {
        available: false,
        callsRemaining: Math.max(0, maxCalls - totalCalls),
        totalCalls,
        circuitOpen: account.circuitOpen,
        reason: account.reason,
      };
    }

    if (totalCalls >= maxCalls) {
      return {
        available: false,
        callsRemaining: 0,
        totalCalls,
        circuitOpen: false,
        reason: `Context call cap reached (${maxCalls}/${maxCalls})`,
      };
    }

    return {
      available: true,
      callsRemaining: maxCalls - totalCalls,
      totalCalls,
      circuitOpen: false,
      reason: "Available",
    };
  };

  return {
    get totalCalls() {
      return totalCalls;
    },

    maxCalls,

    // The actual rate-limit circuit is account-wide and owned by client.ts.
    get circuitOpen() {
      return getAccountStatus().circuitOpen;
    },

    getStatus,

    isAvailable() {
      return getStatus().available;
    },

    async generateJSON(prompt, model, timeoutMs = AI_TIMEOUT_MS) {
      const status = getStatus();

      if (!status.available) {
        console.log(`[AIContext] Skipped JSON: ${status.reason}`);
        return null;
      }

      // Per-execution counter lives ONLY inside this context.
      totalCalls += 1;

      return callGenerativeJSON(prompt, model, timeoutMs);
    },

    async generateText(prompt, model, timeoutMs = AI_TIMEOUT_MS) {
      const status = getStatus();

      if (!status.available) {
        console.log(`[AIContext] Skipped text: ${status.reason}`);
        return null;
      }

      // Per-execution counter lives ONLY inside this context.
      totalCalls += 1;

      return callGenerativeText(prompt, model, timeoutMs);
    },
  };
}

export const AI_CONTEXT_DEFAULTS = {
  AI_TIMEOUT_MS,
  MAX_CALLS_PER_EXECUTION,
};