// src/lib/server/document-processing/index.ts
import { processPdfDocument } from "./pdf";
import { processDocxDocument } from "./docx";
import { processXlsxDocument } from "./xlsx";
import { processCsvDocument } from "./csv";
import { processTxtDocument } from "./txt";
import { PreprocessedDocument } from "./source-references";

export * from "./source-references";
export * from "./pdf";
export * from "./docx";
export * from "./xlsx";
export * from "./csv";
export * from "./txt";

/**
 * Dispatches preprocessing based on MIME type or filename extension.
 */
export async function preprocessDocument(
  documentId: string,
  fileName: string,
  mimeType: string,
  buffer: Buffer
): Promise<PreprocessedDocument> {
  const lowerName = fileName.toLowerCase();

  if (mimeType === "application/pdf" || lowerName.endsWith(".pdf")) {
    return processPdfDocument(documentId, fileName, buffer);
  }

  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lowerName.endsWith(".docx")
  ) {
    return processDocxDocument(documentId, fileName, buffer);
  }

  if (
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    lowerName.endsWith(".xlsx")
  ) {
    return processXlsxDocument(documentId, fileName, buffer);
  }

  if (mimeType === "text/csv" || lowerName.endsWith(".csv")) {
    return processCsvDocument(documentId, fileName, buffer);
  }

  // Default to plain text
  return processTxtDocument(documentId, fileName, buffer);
}
