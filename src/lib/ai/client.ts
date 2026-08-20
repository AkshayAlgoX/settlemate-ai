import { GoogleGenerativeAI } from "@google/generative-ai";

let genAI: GoogleGenerativeAI | null = null;

export function getAIClient(): GoogleGenerativeAI | null {
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
  return getAIClient() !== null;
}

export async function generateJSON(
  prompt: string,
  model: string = "gemini-3.6-flash"
): Promise<{ data: unknown; tokensUsed: number; latencyMs: number } | null> {
  const client = getAIClient();
  if (!client) return null;

  const startTime = Date.now();

  try {
    const m = client.getGenerativeModel({
      model,
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    });

    const result = await m.generateContent(prompt);
    const text = result.response.text().trim();
    const tokensUsed = result.response.usageMetadata?.totalTokenCount || 0;
    const latencyMs = Date.now() - startTime;

    // Clean up markdown code blocks if present
    const cleaned = text
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    const data = JSON.parse(cleaned);
    return { data, tokensUsed, latencyMs };
  } catch (error) {
    console.error("AI generation error:", error);
    return null;
  }
}

export async function generateText(
  prompt: string,
  model: string = "gemini-3.6-flash"
): Promise<{ text: string; tokensUsed: number; latencyMs: number } | null> {
  const client = getAIClient();
  if (!client) return null;

  const startTime = Date.now();

  try {
    const m = client.getGenerativeModel({
      model,
      generationConfig: { temperature: 0.2 },
    });

    const result = await m.generateContent(prompt);
    const text = result.response.text().trim();
    const tokensUsed = result.response.usageMetadata?.totalTokenCount || 0;
    const latencyMs = Date.now() - startTime;

    return { text, tokensUsed, latencyMs };
  } catch (error) {
    console.error("AI text generation error:", error);
    return null;
  }
}