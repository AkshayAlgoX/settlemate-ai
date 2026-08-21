import { GoogleGenerativeAI } from "@google/generative-ai";

// ── Account-global state (shared across ALL AI execution contexts) ──
// The Google Gemini free-tier quota (~5 req/min) is keyed to the API key, so
// 429 rate-limit protection MUST be coordinated account-wide, not per-batch.
// The per-batch logical state (call counter, per-context circuit) lives in
// context.ts; only the shared account quota/cooldown belongs here.
let genAI: GoogleGenerativeAI | null = null;
let accountCircuitOpen = false;
let accountCircuitOpenedAt = 0;

export const AI_TIMEOUT_MS = 15_000; // 15s per call max
export const CIRCUIT_COOLDOWN_MS = 65_000; // 65s (Gemini says 58s, add buffer)

export interface AccountStatus {
  blocked: boolean;
  isRateLimited: boolean;
  reason: string;
}

// Report whether the account-wide quota/cooldown currently blocks any new call.
// This is shared across every context because the upstream quota is shared.
export function getAccountStatus(): AccountStatus {
  if (accountCircuitOpen && Date.now() - accountCircuitOpenedAt < CIRCUIT_COOLDOWN_MS) {
    return {
      blocked: true,
      isRateLimited: true,
      reason: `Rate limited. Retry in ${Math.ceil((CIRCUIT_COOLDOWN_MS - (Date.now() - accountCircuitOpenedAt)) / 1000)}s`,
    };
  }

  // Cooldown expired — reopen.
  if (accountCircuitOpen && Date.now() - accountCircuitOpenedAt >= CIRCUIT_COOLDOWN_MS) {
    accountCircuitOpen = false;
  }

  if (!getAIClient()) {
    return { blocked: true, isRateLimited: false, reason: "No API key configured" };
  }

  return { blocked: false, isRateLimited: false, reason: "Available" };
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

function openAccountCircuit() {
  accountCircuitOpen = true;
  accountCircuitOpenedAt = Date.now();
  console.warn(
    `[AI Circuit Breaker] OPENED (account-wide) at ${new Date().toISOString()}. Cooldown: ${CIRCUIT_COOLDOWN_MS / 1000}s`
  );
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`AI call timed out after ${ms}ms`)), ms)
    ),
  ]);
}

// Discriminated outcome of a single network call to the provider. The context
// maps these to its public `{ data, ... } | null` contract and opens its own
// per-context circuit on `rate-limited`.
export type AIJSONResult =
  | { status: "success"; data: unknown; tokensUsed: number; latencyMs: number }
  | { status: "rate-limited"; latencyMs: number }
  | { status: "timeout"; latencyMs: number }
  | { status: "error"; latencyMs: number };

export async function callGenerativeJSON(
  prompt: string,
  model: string,
  timeoutMs: number = AI_TIMEOUT_MS
): Promise<AIJSONResult> {
  const client = getAIClient();
  if (!client) return { status: "error", latencyMs: 0 };

  const startTime = Date.now();

  try {
    const m = client.getGenerativeModel({
      model,
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    });

    const result = await withTimeout(m.generateContent(prompt), timeoutMs);
    const text = result.response.text().trim();
    const tokensUsed = result.response.usageMetadata?.totalTokenCount || 0;
    const latencyMs = Date.now() - startTime;

    const cleaned = text
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    const data = JSON.parse(cleaned);
    return { status: "success", data, tokensUsed, latencyMs };
  } catch (error: unknown) {
    const errStr = String(error);
    const latencyMs = Date.now() - startTime;

    // Detect 429 rate limit — open the shared account circuit (quota is per key).
    if (errStr.includes("429") || errStr.includes("RESOURCE_EXHAUSTED") || errStr.includes("quota")) {
      openAccountCircuit();
      console.warn(`[AI] Rate limited. Account circuit opened.`);
      return { status: "rate-limited", latencyMs };
    }

    // Detect timeout
    if (errStr.includes("timed out")) {
      console.warn(`[AI] Timeout`);
      return { status: "timeout", latencyMs };
    }

    console.error(`[AI] Error:`, errStr.slice(0, 200));
    return { status: "error", latencyMs };
  }
}

export type AITextResult =
  | { status: "success"; text: string; tokensUsed: number; latencyMs: number }
  | { status: "rate-limited"; latencyMs: number }
  | { status: "timeout"; latencyMs: number }
  | { status: "error"; latencyMs: number };

export async function callGenerativeText(
  prompt: string,
  model: string
): Promise<AITextResult> {
  const client = getAIClient();
  if (!client) return { status: "error", latencyMs: 0 };

  const startTime = Date.now();

  try {
    const m = client.getGenerativeModel({
      model,
      generationConfig: { temperature: 0.2 },
    });

    const result = await withTimeout(m.generateContent(prompt), AI_TIMEOUT_MS);
    const text = result.response.text().trim();
    const tokensUsed = result.response.usageMetadata?.totalTokenCount || 0;
    const latencyMs = Date.now() - startTime;

    return { status: "success", text, tokensUsed, latencyMs };
  } catch (error: unknown) {
    const errStr = String(error);
    const latencyMs = Date.now() - startTime;

    if (errStr.includes("429") || errStr.includes("RESOURCE_EXHAUSTED") || errStr.includes("quota")) {
      openAccountCircuit();
      return { status: "rate-limited", latencyMs };
    }

    if (errStr.includes("timed out")) {
      return { status: "timeout", latencyMs };
    }

    console.error(`[AI] Text error:`, errStr.slice(0, 200));
    return { status: "error", latencyMs };
  }
}
