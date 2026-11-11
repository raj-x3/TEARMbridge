// src/lib/server/document-processing/csv.ts
import {
  ContentBlock,
  PreprocessedDocument,
  hashText,
  sanitizeDocRef,
} from "./source-references";

/**
 * Extracts structured row and cell coordinate blocks from a CSV buffer.
 */
export async function processCsvDocument(
  documentId: string,
  fileName: string,
  buffer: Buffer
): Promise<PreprocessedDocument> {
  const cleanId = sanitizeDocRef(documentId);
  const textContent = buffer.toString("utf-8");
  const lines = textContent.split(/\r?\n/).filter((l) => l.trim().length > 0);

  const blocks: ContentBlock[] = [];
  const header = lines[0] || "";

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const rowNum = idx + 1;
    const sourceRef = `DOC_${cleanId}_CSV_ROW_${String(rowNum).padStart(3, "0")}`;

    blocks.push({
      source_ref: sourceRef,
      location_type: "csv_cell",
      location: {
        row_index: rowNum,
        heading: rowNum > 1 ? `Header: ${header}` : "Header Row",
      },
      text: line,
      content_hash: hashText(line),
    });
  }

  return {
    document_id: documentId,
    file_name: fileName,
    mime_type: "text/csv",
    file_size_bytes: buffer.length,
    sha256_hash: hashText(textContent),
    blocks,
    full_text: textContent,
    is_scanned_without_text: false,
    raw_buffer: buffer,
  };
}
