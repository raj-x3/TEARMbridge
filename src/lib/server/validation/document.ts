// src/lib/server/validation/document.ts
import { z } from "zod";

// Allowed MIME types and their corresponding extensions
export const ALLOWED_DOCUMENT_TYPES: Record<string, string[]> = {
  "application/pdf": ["pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
  "text/csv": ["csv"],
  "text/plain": ["txt"],
};

// File magic bytes for content validation
export const FILE_SIGNATURES: Record<string, number[][]> = {
  "application/pdf": [[0x25, 0x50, 0x44, 0x46]], // %PDF
  // DOCX and XLSX are ZIP-based: PK header
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    [0x50, 0x4b, 0x03, 0x04],
  ],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
    [0x50, 0x4b, 0x03, 0x04],
  ],
};

// ZIP internal entry markers for Office formats
export const OFFICE_ZIP_ENTRIES: Record<string, string> = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "word/",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    "xl/",
};

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export const BLOCKED_EXTENSIONS = [
  "exe", "bat", "cmd", "com", "msi", "scr", "pif",
  "js", "vbs", "wsf", "ps1", "sh", "bash", "app",
];

export const documentUploadMetaSchema = z.object({
  entity_type: z.enum(["purchase_order", "agreement", "counterparty"]),
  entity_id: z.string().uuid("Invalid entity ID"),
  relationship_type: z
    .enum(["source", "attachment", "reference", "amendment"])
    .default("attachment"),
  document_type: z
    .enum([
      "purchase_order",
      "agreement",
      "amendment",
      "invoice",
      "supporting",
      "general",
    ])
    .default("general"),
  title: z.string().min(1).max(300).optional(),
});

export type DocumentUploadMeta = z.infer<typeof documentUploadMetaSchema>;

/**
 * Validate filename for path traversal and suspicious patterns
 */
export function isFilenameSafe(filename: string): boolean {
  if (!filename || filename.length > 255) return false;
  if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) return false;
  if (filename.startsWith(".")) return false;
  // Block null bytes
  if (filename.includes("\0")) return false;
  return true;
}

/**
 * Check if file bytes match the expected magic signature
 */
export function validateFileSignature(
  bytes: Uint8Array,
  mimeType: string
): boolean {
  const signatures = FILE_SIGNATURES[mimeType];
  if (!signatures) return true; // No signature check for text formats

  return signatures.some((sig) =>
    sig.every((byte, i) => bytes[i] === byte)
  );
}

/**
 * For ZIP-based Office formats, verify expected internal entries exist
 * by scanning for the directory marker in the raw bytes.
 */
export function validateOfficeZipContent(
  bytes: Uint8Array,
  mimeType: string
): boolean {
  const expectedEntry = OFFICE_ZIP_ENTRIES[mimeType];
  if (!expectedEntry) return true; // Not a ZIP-based format

  // Convert bytes to string and look for the expected directory entry
  const decoder = new TextDecoder("utf-8", { fatal: false });
  const content = decoder.decode(bytes);
  return content.includes(expectedEntry);
}
