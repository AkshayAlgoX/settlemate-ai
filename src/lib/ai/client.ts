import { GoogleGenerativeAI } from "@google/generative-ai";
import { CURRENT_AI_MODEL } from "./schemas";

let genAI: GoogleGenerativeAI | null = null;

// Account-level circuit breaker.
// Gemini quota is associated with the API key, so this state is shared
// across all AI execution contexts in this Node process.
let accountCircuitOpen = false;
let accountCircuitOpenedAt = 0;

export const CIRCUIT_COOLDOWN_MS = 65_000;
export const AI_TIMEOUT_MS = 15_000;

class AsyncSemaphore {
  private running = 0;
  private queue: (() => void)[] = [];

  constructor(private readonly maxConcurrency: number) {}

  async acquire(): Promise<() => void> {
    if (this.running < this.maxConcurrency) {
      this.running++;
      let released = false;
      return () => {
        if (!released) {
          released = true;
          this.running--;
          this.dispatchNext();
        }
      };
    }

    return new Promise<() => void>((resolve) => {
      this.queue.push(() => {
        this.running++;
        let released = false;
        resolve(() => {
          if (!released) {
            released = true;
            this.running--;
            this.dispatchNext();
          }
        });
      });
    });
  }

  private dispatchNext() {
    if (this.queue.length > 0 && this.running < this.maxConcurrency) {
      const next = this.queue.shift();
      if (next) next();
    }
  }

  get pendingCount(): number {
    return this.queue.length;
  }
}

// Bounded AI concurrency: max 4 concurrent in-flight calls to Google Gemini
export const aiConcurrencyLimiter = new AsyncSemaphore(4);

export interface AccountAIStatus {
  available: boolean;
  circuitOpen: boolean;
  reason: string;
}

function getAIClient(): GoogleGenerativeAI | null {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === "your-gemini-api-key-here") {
    return null;
  }

  if (!genAI) {
    genAI = new GoogleGenerativeAI(apiKey);
  }

  return genAI;
}

function openAccountCircuit(): void {
  accountCircuitOpen = true;
  accountCircuitOpenedAt = Date.now();

  console.warn(
    `[AI Circuit Breaker] OPENED at ${new Date().toISOString()}. ` +
      `Cooldown: ${CIRCUIT_COOLDOWN_MS / 1000}s`
  );
}

function isAccountCircuitOpen(): boolean {
  if (!accountCircuitOpen) {
    return false;
  }

  const elapsed = Date.now() - accountCircuitOpenedAt;

  if (elapsed >= CIRCUIT_COOLDOWN_MS) {
    accountCircuitOpen = false;
    accountCircuitOpenedAt = 0;
    return false;
  }

  return true;
}

/**
 * Returns ONLY account/provider-level availability.
 *
 * This intentionally contains no per-request/per-batch counters.
 */
export function getAccountStatus(): AccountAIStatus {
  if (isAccountCircuitOpen()) {
    const remainingMs =
      CIRCUIT_COOLDOWN_MS - (Date.now() - accountCircuitOpenedAt);

    return {
      available: false,
      circuitOpen: true,
      reason: `Rate limited. Retry in ${Math.ceil(remainingMs / 1000)}s`,
    };
  }

  if (!getAIClient()) {
    return {
      available: false,
      circuitOpen: false,
      reason: "No API key configured",
    };
  }

  return {
    available: true,
    circuitOpen: false,
    reason: "Available",
  };
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`AI call timed out after ${ms}ms`));
        }, ms);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

/**
 * Low-level structured Gemini call.
 *
 * IMPORTANT:
 * This function does NOT maintain a per-request call counter.
 * Per-execution budgeting belongs to AIContext.
 */
export async function callGenerativeJSON(
  prompt: string,
  model: string = CURRENT_AI_MODEL,
  timeoutMs: number = AI_TIMEOUT_MS
): Promise<{
  data: unknown;
  tokensUsed: number;
  latencyMs: number;
} | null> {
  const accountStatus = getAccountStatus();

  if (!accountStatus.available) {
    console.log(`[AI] Skipped: ${accountStatus.reason}`);
    return null;
  }

  const client = getAIClient();

  if (!client) {
    return null;
  }

  const release = await aiConcurrencyLimiter.acquire();
  const startTime = Date.now();

  try {
    const modelClient = client.getGenerativeModel({
      model,
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    });

    const result = await withTimeout(
      modelClient.generateContent(prompt),
      timeoutMs
    );

    const text = result.response.text().trim();

    const tokensUsed =
      result.response.usageMetadata?.totalTokenCount || 0;

    const latencyMs = Date.now() - startTime;

    const cleaned = text
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    const data = JSON.parse(cleaned);

    return {
      data,
      tokensUsed,
      latencyMs,
    };
  } catch (error: unknown) {
    const errStr = String(error);

    if (
      errStr.includes("429") ||
      errStr.includes("RESOURCE_EXHAUSTED") ||
      errStr.toLowerCase().includes("quota")
    ) {
      openAccountCircuit();

      console.warn(
        "[AI] Gemini rate-limited (429). Account circuit opened."
      );

      return null;
    }

    if (errStr.includes("timed out")) {
      console.warn("[AI] Gemini request timed out.");
      return null;
    }

    console.error(
      "[AI] Gemini structured generation error:",
      errStr.slice(0, 300)
    );

    return null;
  } finally {
    release();
  }
}

/**
 * Low-level text Gemini call.
 *
 * Per-execution call budgeting belongs to AIContext.
 */
export async function callGenerativeText(
  prompt: string,
  model: string = CURRENT_AI_MODEL,
  timeoutMs: number = AI_TIMEOUT_MS
): Promise<{
  text: string;
  tokensUsed: number;
  latencyMs: number;
} | null> {
  const accountStatus = getAccountStatus();

  if (!accountStatus.available) {
    console.log(`[AI] Skipped: ${accountStatus.reason}`);
    return null;
  }

  const client = getAIClient();

  if (!client) {
    return null;
  }

  const release = await aiConcurrencyLimiter.acquire();
  const startTime = Date.now();

  try {
    const modelClient = client.getGenerativeModel({
      model,
      generationConfig: {
        temperature: 0.2,
      },
    });

    const result = await withTimeout(
      modelClient.generateContent(prompt),
      timeoutMs
    );

    const text = result.response.text().trim();

    const tokensUsed =
      result.response.usageMetadata?.totalTokenCount || 0;

    const latencyMs = Date.now() - startTime;

    return {
      text,
      tokensUsed,
      latencyMs,
    };
  } catch (error: unknown) {
    const errStr = String(error);

    if (
      errStr.includes("429") ||
      errStr.includes("RESOURCE_EXHAUSTED") ||
      errStr.toLowerCase().includes("quota")
    ) {
      openAccountCircuit();

      console.warn(
        "[AI] Gemini rate-limited (429). Account circuit opened."
      );

      return null;
    }

    if (errStr.includes("timed out")) {
      console.warn("[AI] Gemini request timed out.");
      return null;
    }

    console.error(
      "[AI] Gemini text generation error:",
      errStr.slice(0, 300)
    );

    return null;
  } finally {
    release();
  }
}

/**
 * Temporary compatibility exports.
 *
 * These perform low-level calls only and contain NO per-request state.
 * They will be migrated away from business/API consumers to AIContext.
 */
export async function generateJSON(
  prompt: string,
  model: string = CURRENT_AI_MODEL,
  timeoutMs: number = AI_TIMEOUT_MS
) {
  return callGenerativeJSON(prompt, model, timeoutMs);
}

export async function generateText(
  prompt: string,
  model: string = CURRENT_AI_MODEL,
  timeoutMs: number = AI_TIMEOUT_MS
) {
  return callGenerativeText(prompt, model, timeoutMs);
}