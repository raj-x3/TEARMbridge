// src/lib/server/document-processing/xlsx.ts
import * as XLSX from "xlsx";
import {
  ContentBlock,
  PreprocessedDocument,
  hashText,
  sanitizeDocRef,
} from "./source-references";

/**
 * Extracts structured sheet and cell coordinate blocks from an XLSX buffer.
 */
export async function processXlsxDocument(
  documentId: string,
  fileName: string,
  buffer: Buffer
): Promise<PreprocessedDocument> {
  const cleanId = sanitizeDocRef(documentId);
  const blocks: ContentBlock[] = [];
  const fullTextParts: string[] = [];

  try {
    const workbook = XLSX.read(buffer, { type: "buffer" });

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;

      const ref = sheet["!ref"] || "A1:A1";
      const rows: string[][] = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        raw: false,
        defval: "",
      }) as string[][];

      for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
        const row = rows[rowIdx];
        const rowText = row.filter((c) => c !== "").join(" | ");
        if (!rowText.trim()) continue;

        const rowNum = rowIdx + 1;
        const sourceRef = `DOC_${cleanId}_SHEET_${sheetName.replace(/\s+/g, "_")}_ROW_${rowNum}`;

        blocks.push({
          source_ref: sourceRef,
          location_type: "xlsx_cell",
          location: {
            sheet: sheetName,
            row_index: rowNum,
            cell_coordinates: `${sheetName}!A${rowNum}:${XLSX.utils.encode_col(row.length - 1)}${rowNum}`,
          },
          text: `[${sheetName} Row ${rowNum}] ${rowText}`,
          content_hash: hashText(rowText),
        });
      }

      const csv = XLSX.utils.sheet_to_csv(sheet);
      fullTextParts.push(`--- Sheet: ${sheetName} (Range: ${ref}) ---\n${csv}`);
    }
  } catch (err: unknown) {
    console.warn(`[XLSX Processor] Failed extraction on ${fileName}: ${(err as Error).message}`);
  }

  const fullText = fullTextParts.join("\n\n");

  return {
    document_id: documentId,
    file_name: fileName,
    mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    file_size_bytes: buffer.length,
    sha256_hash: hashText(buffer.toString("binary")),
    blocks,
    full_text: fullText,
    is_scanned_without_text: false,
    raw_buffer: buffer,
  };
}
