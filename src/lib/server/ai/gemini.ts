// src/lib/server/ai/gemini.ts
/**
 * Server-only Google Gemini API Client for TERMBridge Commercial Intelligence.
 *
 * Requirements:
 * - Model ID: gemini-3.8-flash
 * - Official SDK: @google/genai
 * - Thinking level: medium
 * - Server-side only (never exposed to client bundles)
 * - Exponential backoff retry for transient network/rate-limit failures
 * - Structured JSON output generation
 */

import { GoogleGenAI, ThinkingLevel } from "@google/genai";

export interface GeminiConfig {
  apiKey: string;
  model: string;
  thinkingLevel: "minimal" | "low" | "medium" | "high";
  timeoutMs: number;
  maxRetries: number;
}

export interface GenerateStructuredParams {
  prompt: string;
  systemInstruction?: string;
  responseSchema?: Record<string, unknown>;
  inlineFiles?: Array<{
    mimeType: string;
    data: Buffer | string; // Base64 or Buffer
  }>;
}

export class GeminiError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly retryable: boolean;

  constructor(message: string, code = "GEMINI_ERROR", statusCode = 500, retryable = false) {
    super(message);
    this.name = "GeminiError";
    this.code = code;
    this.statusCode = statusCode;
    this.retryable = retryable;
  }
}

/**
 * Resolves server-side Gemini configuration safely.
 */
export function getGeminiConfig(): GeminiConfig {
  const apiKey = process.env.GEMINI_API_KEY || "";
  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const rawThinking = (process.env.GEMINI_THINKING_LEVEL || "medium").toLowerCase();
  const thinkingLevel: GeminiConfig["thinkingLevel"] =
    rawThinking === "low" || rawThinking === "high" || rawThinking === "minimal"
      ? rawThinking
      : "medium";

  return {
    apiKey,
    model,
    thinkingLevel,
    timeoutMs: 60000, // 60 seconds
    maxRetries: 3,
  };
}

/**
 * Checks if Gemini API is configured with an API key.
 */
export function isGeminiConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0;
}

let cachedClient: GoogleGenAI | null = null;

function getClient(apiKey: string): GoogleGenAI {
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({ apiKey });
  }
  return cachedClient;
}

/**
 * Generates structured JSON from Gemini 3.8 Flash with exponential backoff.
 */
export async function generateStructuredJson<T>(params: GenerateStructuredParams): Promise<{
  data: T;
  rawText: string;
  inputTokenCount?: number;
  outputTokenCount?: number;
}> {
  const config = getGeminiConfig();

  if (!config.apiKey) {
    throw new GeminiError(
      "Gemini API key is not configured. Set GEMINI_API_KEY in server environment.",
      "CONFIG_MISSING",
      503,
      false
    );
  }

  const ai = getClient(config.apiKey);

  // Construct parts: inline documents first, then prompt
  const contentsParts: Array<
    | string
    | {
        inlineData: {
          mimeType: string;
          data: string;
        };
      }
  > = [];

  if (params.inlineFiles && params.inlineFiles.length > 0) {
    for (const file of params.inlineFiles) {
      const b64 = Buffer.isBuffer(file.data)
        ? file.data.toString("base64")
        : file.data.startsWith("data:")
        ? file.data.split(",")[1]
        : file.data;

      contentsParts.push({
        inlineData: {
          mimeType: file.mimeType,
          data: b64,
        },
      });
    }
  }

  contentsParts.push(params.prompt);

  let attempt = 0;
  let delay = 1000;

  while (attempt < config.maxRetries) {
    attempt++;
    try {
      const thinkingLevelEnum =
        config.thinkingLevel === "minimal"
          ? ThinkingLevel.MINIMAL
          : config.thinkingLevel === "low"
          ? ThinkingLevel.LOW
          : config.thinkingLevel === "high"
          ? ThinkingLevel.HIGH
          : ThinkingLevel.MEDIUM;

      const response = await ai.models.generateContent({
        model: config.model,
        contents: contentsParts,
        config: {
          systemInstruction: params.systemInstruction,
          responseMimeType: "application/json",
          responseSchema: params.responseSchema as Record<string, unknown>,
          thinkingConfig: {
            thinkingLevel: thinkingLevelEnum,
          },
        },
      });

      const rawText = response.text || "{}";

      let parsed: T;
      try {
        parsed = JSON.parse(rawText) as T;
      } catch (parseErr) {
        throw new GeminiError(
          `Gemini returned invalid JSON: ${(parseErr as Error).message}`,
          "INVALID_JSON_RESPONSE",
          502,
          false
        );
      }

      return {
        data: parsed,
        rawText,
        inputTokenCount: response.usageMetadata?.promptTokenCount,
        outputTokenCount: response.usageMetadata?.candidatesTokenCount,
      };
    } catch (err: unknown) {
      const error = err as { status?: number; message?: string; code?: string };
      const isRateLimit =
        error?.status === 429 ||
        error?.message?.includes("429") ||
        error?.message?.includes("RESOURCE_EXHAUSTED");
      const isTransient =
        error?.status === 503 ||
        error?.message?.includes("503") ||
        error?.message?.includes("UNAVAILABLE") ||
        error?.code === "ETIMEDOUT";

      if ((isRateLimit || isTransient) && attempt < config.maxRetries) {
        console.warn(
          `[Gemini] Transient error on attempt ${attempt}/${config.maxRetries} (${error.message}). Retrying in ${delay}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
        continue;
      }

      // Safe normalized error
      const message = error?.message || "Unknown Gemini generation error";
      const sanitized = message.replace(/key=[A-Za-z0-9_-]+/g, "key=[REDACTED]");
      throw new GeminiError(
        sanitized,
        isRateLimit ? "RATE_LIMIT_EXCEEDED" : "PROVIDER_ERROR",
        error?.status || 500,
        false
      );
    }
  }

  throw new GeminiError(
    "Exceeded maximum retries communicating with Gemini API.",
    "MAX_RETRIES_EXCEEDED",
    504,
    false
  );
}
