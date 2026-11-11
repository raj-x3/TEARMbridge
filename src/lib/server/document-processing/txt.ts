// src/lib/server/document-processing/txt.ts
import {
  ContentBlock,
  PreprocessedDocument,
  hashText,
  sanitizeDocRef,
} from "./source-references";

/**
 * Extracts line-numbered blocks from a plain text buffer.
 */
export async function processTxtDocument(
  documentId: string,
  fileName: string,
  buffer: Buffer
): Promise<PreprocessedDocument> {
  const cleanId = sanitizeDocRef(documentId);
  const textContent = buffer.toString("utf-8");
  const lines = textContent.split(/\r?\n/);

  // Group into 10-line blocks for stable citation references
  const blocks: ContentBlock[] = [];
  const chunkSize = 10;

  for (let i = 0; i < lines.length; i += chunkSize) {
    const chunkLines = lines.slice(i, i + chunkSize);
    const chunkText = chunkLines.join("\n").trim();
    if (!chunkText) continue;

    const startLine = i + 1;
    const endLine = Math.min(i + chunkSize, lines.length);
    const sourceRef = `DOC_${cleanId}_LINES_${String(startLine).padStart(3, "0")}_${String(endLine).padStart(3, "0")}`;

    blocks.push({
      source_ref: sourceRef,
      location_type: "txt_line",
      location: {
        line_number: startLine,
        heading: `Lines ${startLine}-${endLine}`,
      },
      text: chunkText,
      content_hash: hashText(chunkText),
    });
  }

  return {
    document_id: documentId,
    file_name: fileName,
    mime_type: "text/plain",
    file_size_bytes: buffer.length,
    sha256_hash: hashText(textContent),
    blocks,
    full_text: textContent,
    is_scanned_without_text: false,
    raw_buffer: buffer,
  };
}
