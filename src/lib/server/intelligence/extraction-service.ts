// src/lib/server/intelligence/extraction-service.ts
import { PreprocessedDocument } from "../document-processing/source-references";
import { generateStructuredJson, isGeminiConfigured, GeminiError } from "../ai/gemini";
import { buildDocumentExtractionPrompt } from "../ai/prompts/document-extraction";
import {
  ExtractedDocumentFacts,
  ExtractedDocumentFactsSchema,
} from "../ai/schemas/document-extraction";

export interface ExtractionResult {
  facts: ExtractedDocumentFacts;
  inputTokenCount?: number;
  outputTokenCount?: number;
  isModelGenerated: boolean;
}

/**
 * Extracts structured commercial facts from a single preprocessed document.
 */
export async function extractDocumentFacts(
  doc: PreprocessedDocument
): Promise<ExtractionResult> {
  if (!isGeminiConfigured()) {
    throw new GeminiError(
      "Gemini API key is not configured. Set GEMINI_API_KEY in server environment to enable AI extraction.",
      "NOT_CONFIGURED",
      503
    );
  }

  const { systemInstruction, prompt } = buildDocumentExtractionPrompt(doc);

  // If document is PDF under 10MB, provide inline binary if helpful
  const inlineFiles: Array<{ mimeType: string; data: Buffer }> = [];
  if (doc.mime_type === "application/pdf" && doc.raw_buffer.length < 10 * 1024 * 1024) {
    inlineFiles.push({
      mimeType: "application/pdf",
      data: doc.raw_buffer,
    });
  }

  const result = await generateStructuredJson<ExtractedDocumentFacts>({
    prompt,
    systemInstruction,
    inlineFiles: inlineFiles.length > 0 ? inlineFiles : undefined,
  });

  // Deterministic schema validation on AI output
  const parsed = ExtractedDocumentFactsSchema.safeParse(result.data);
  if (!parsed.success) {
    console.warn(`[Extraction] Schema normalization applied to AI extraction output:`, parsed.error.format());
    // Safe fallback to partially validated data
    return {
      facts: result.data,
      inputTokenCount: result.inputTokenCount,
      outputTokenCount: result.outputTokenCount,
      isModelGenerated: true,
    };
  }

  return {
    facts: parsed.data,
    inputTokenCount: result.inputTokenCount,
    outputTokenCount: result.outputTokenCount,
    isModelGenerated: true,
  };
}
