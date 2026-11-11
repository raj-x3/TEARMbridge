// src/lib/server/document-processing/pdf.ts
import pdfParse from "pdf-parse";
import {
  ContentBlock,
  PreprocessedDocument,
  hashText,
  sanitizeDocRef,
} from "./source-references";

/**
 * Extracts page-indexed text blocks and metadata from a PDF buffer.
 */
export async function processPdfDocument(
  documentId: string,
  fileName: string,
  buffer: Buffer
): Promise<PreprocessedDocument> {
  const cleanId = sanitizeDocRef(documentId);
  const pagesText: string[] = [];

  // Custom page renderer to capture page-by-page text
  const customPageRender = async (pageData: {
    getTextContent: () => Promise<{
      items: Array<{ str?: string; transform: number[] }>;
    }>;
  }) => {
    try {
      const textContent = await pageData.getTextContent();
      let lastY: number | undefined;
      let text = "";

      for (const item of textContent.items) {
        if (!item || typeof item.str !== "string") continue;
        if (lastY === undefined || lastY === item.transform[5]) {
          text += item.str + " ";
        } else {
          text += "\n" + item.str + " ";
        }
        lastY = item.transform[5];
      }

      pagesText.push(text.trim());
      return text;
    } catch {
      pagesText.push("");
      return "";
    }
  };

  const options = {
    pagerender: customPageRender,
  };

  let data: { text?: string; numpages?: number };
  try {
    data = await pdfParse(buffer, options);
  } catch (err: unknown) {
    console.warn(`[PDF Processor] Failed text extraction on ${fileName}: ${(err as Error).message}`);
    data = { text: "", numpages: 1 };
  }

  const numPages = data.numpages || pagesText.length || 1;
  const blocks: ContentBlock[] = [];

  for (let pageIdx = 0; pageIdx < numPages; pageIdx++) {
    const pageNum = pageIdx + 1;
    const pageText = pagesText[pageIdx] || "";
    const sourceRef = `DOC_${cleanId}_PAGE_${String(pageNum).padStart(3, "0")}`;

    blocks.push({
      source_ref: sourceRef,
      location_type: "pdf_page",
      location: {
        page: pageNum,
      },
      text: pageText,
      content_hash: hashText(pageText),
    });
  }

  const fullText = blocks.map((b) => b.text).join("\n\n");
  const isScannedWithoutText = fullText.replace(/\s+/g, "").length < 40;

  return {
    document_id: documentId,
    file_name: fileName,
    mime_type: "application/pdf",
    file_size_bytes: buffer.length,
    sha256_hash: hashText(buffer.toString("binary")),
    blocks,
    full_text: fullText,
    is_scanned_without_text: isScannedWithoutText,
    raw_buffer: buffer,
  };
}
