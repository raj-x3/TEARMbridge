// src/lib/server/document-processing/source-references.ts
import * as crypto from "crypto";

export type LocationType =
  | "pdf_page"
  | "docx_paragraph"
  | "docx_table"
  | "xlsx_cell"
  | "csv_cell"
  | "txt_line"
  | "visual_location";

export interface SourceLocation {
  page?: number;
  paragraph_index?: number;
  heading?: string;
  table_index?: number;
  row_index?: number;
  col_index?: number;
  sheet?: string;
  cell_coordinates?: string;
  line_number?: number;
}

export interface ContentBlock {
  source_ref: string;
  location_type: LocationType;
  location: SourceLocation;
  text: string;
  content_hash: string;
}

export interface PreprocessedDocument {
  document_id: string;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
  sha256_hash: string;
  blocks: ContentBlock[];
  full_text: string;
  is_scanned_without_text: boolean;
  raw_buffer: Buffer;
  /** Optional classification hint from retrieval layer (e.g. master_agreement, amendment, purchase_order). */
  classificationHint?: "master_agreement" | "amendment" | "purchase_order" | "supporting_document";
}

/**
 * Creates a deterministic SHA-256 hash for a text segment.
 */
export function hashText(text: string): string {
  return crypto.createHash("sha256").update(text.trim()).digest("hex");
}

/**
 * Formats a clean document identifier for source references.
 */
export function sanitizeDocRef(docId: string): string {
  return docId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 12);
}
