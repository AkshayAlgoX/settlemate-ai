import { GoogleGenerativeAI } from "@google/generative-ai";

let genAI: GoogleGenerativeAI | null = null;

// ── Circuit Breaker State ──
let circuitOpen = false;
let circuitOpenedAt = 0;
let totalCallsThisBatch = 0;
const MAX_CALLS_PER_BATCH = 10; // Hard cap
const CIRCUIT_COOLDOWN_MS = 65_000; // 65s (Gemini says 58s, add buffer)
const AI_TIMEOUT_MS = 15_000; // 15s per call max

export function resetAICounter() {
  totalCallsThisBatch = 0;
  circuitOpen = false;
  circuitOpenedAt = 0;
}

export function getAIStatus(): {
  available: boolean;
  callsRemaining: number;
  totalCalls: number;
  circuitOpen: boolean;
  reason: string;
} {
  if (circuitOpen && Date.now() - circuitOpenedAt < CIRCUIT_COOLDOWN_MS) {
    return {
      available: false,
      callsRemaining: 0,
      totalCalls: totalCallsThisBatch,
      circuitOpen: true,
      reason: `Rate limited. Retry in ${Math.ceil((CIRCUIT_COOLDOWN_MS - (Date.now() - circuitOpenedAt)) / 1000)}s`,
    };
  }

  // Reset circuit if cooldown passed
  if (circuitOpen && Date.now() - circuitOpenedAt >= CIRCUIT_COOLDOWN_MS) {
    circuitOpen = false;
  }

  if (totalCallsThisBatch >= MAX_CALLS_PER_BATCH) {
    return {
      available: false,
      callsRemaining: 0,
      totalCalls: totalCallsThisBatch,
      circuitOpen: false,
      reason: `Call cap reached (${MAX_CALLS_PER_BATCH}/${MAX_CALLS_PER_BATCH})`,
    };
  }

  if (!getAIClient()) {
    return {
      available: false,
      callsRemaining: 0,
      totalCalls: 0,
      circuitOpen: false,
      reason: "No API key configured",
    };
  }

  return {
    available: true,
    callsRemaining: MAX_CALLS_PER_BATCH - totalCallsThisBatch,
    totalCalls: totalCallsThisBatch,
    circuitOpen: false,
    reason: "Available",
  };
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

export function isAIAvailable(): boolean {
  return getAIStatus().available;
}

function openCircuit() {
  circuitOpen = true;
  circuitOpenedAt = Date.now();
  console.warn(`[AI Circuit Breaker] OPENED at ${new Date().toISOString()}. Cooldown: ${CIRCUIT_COOLDOWN_MS / 1000}s`);
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`AI call timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export async function generateJSON(
  prompt: string,
  model: string = "gemini-3.6-flash",
  timeoutMs: number = AI_TIMEOUT_MS
): Promise<{ data: unknown; tokensUsed: number; latencyMs: number } | null> {
  const status = getAIStatus();
  if (!status.available) {
    console.log(`[AI] Skipped: ${status.reason}`);
    return null;
  }

  const client = getAIClient();
  if (!client) return null;

  totalCallsThisBatch++;
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
    return { data, tokensUsed, latencyMs };
  } catch (error: unknown) {
    const errStr = String(error);

    // Detect 429 rate limit
    if (errStr.includes("429") || errStr.includes("RESOURCE_EXHAUSTED") || errStr.includes("quota")) {
      openCircuit();
      console.warn(`[AI] Rate limited on call #${totalCallsThisBatch}. Circuit opened.`);
      return null;
    }

    // Detect timeout
    if (errStr.includes("timed out")) {
      console.warn(`[AI] Timeout on call #${totalCallsThisBatch}`);
      return null;
    }

    console.error(`[AI] Error on call #${totalCallsThisBatch}:`, errStr.slice(0, 200));
    return null;
  }
}

export async function generateText(
  prompt: string,
  model: string = "gemini-3.6-flash"
): Promise<{ text: string; tokensUsed: number; latencyMs: number } | null> {
  const status = getAIStatus();
  if (!status.available) {
    console.log(`[AI] Skipped: ${status.reason}`);
    return null;
  }

  const client = getAIClient();
  if (!client) return null;

  totalCallsThisBatch++;
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

    return { text, tokensUsed, latencyMs };
  } catch (error: unknown) {
    const errStr = String(error);

    if (errStr.includes("429") || errStr.includes("RESOURCE_EXHAUSTED") || errStr.includes("quota")) {
      openCircuit();
      return null;
    }

    if (errStr.includes("timed out")) {
      return null;
    }

    console.error(`[AI] Text error:`, errStr.slice(0, 200));
    return null;
  }
}