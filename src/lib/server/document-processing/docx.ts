// src/lib/server/document-processing/docx.ts
import * as mammoth from "mammoth";
import {
  ContentBlock,
  PreprocessedDocument,
  hashText,
  sanitizeDocRef,
} from "./source-references";

/**
 * Extracts structured paragraph and heading blocks from a DOCX buffer.
 */
export async function processDocxDocument(
  documentId: string,
  fileName: string,
  buffer: Buffer
): Promise<PreprocessedDocument> {
  const cleanId = sanitizeDocRef(documentId);

  let rawText = "";
  try {
    const result = await mammoth.extractRawText({ buffer });
    rawText = result.value || "";
  } catch (err: unknown) {
    console.warn(`[DOCX Processor] Failed extraction on ${fileName}: ${(err as Error).message}`);
    rawText = "";
  }

  // Split into meaningful paragraphs (ignoring empty blank lines)
  const rawParagraphs = rawText
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const blocks: ContentBlock[] = [];
  let currentHeading: string | undefined;

  for (let idx = 0; idx < rawParagraphs.length; idx++) {
    const paraText = rawParagraphs[idx];
    const paraNum = idx + 1;

    // Detect potential heading lines
    if (paraText.length < 80 && (/^(clause|section|article|\d+\.)/i.test(paraText) || !paraText.includes("."))) {
      currentHeading = paraText;
    }

    const sourceRef = `DOC_${cleanId}_PARA_${String(paraNum).padStart(3, "0")}`;

    blocks.push({
      source_ref: sourceRef,
      location_type: "docx_paragraph",
      location: {
        paragraph_index: paraNum,
        heading: currentHeading,
      },
      text: paraText,
      content_hash: hashText(paraText),
    });
  }

  const fullText = blocks.map((b) => b.text).join("\n\n");

  return {
    document_id: documentId,
    file_name: fileName,
    mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    file_size_bytes: buffer.length,
    sha256_hash: hashText(buffer.toString("binary")),
    blocks,
    full_text: fullText,
    is_scanned_without_text: false,
    raw_buffer: buffer,
  };
}
