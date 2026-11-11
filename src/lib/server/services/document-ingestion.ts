// src/lib/server/services/document-ingestion.ts
// Core document upload, validation, versioning and storage service
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createHash } from "crypto";
import {
  ALLOWED_DOCUMENT_TYPES,
  BLOCKED_EXTENSIONS,
  MAX_FILE_SIZE,
  isFilenameSafe,
  validateFileSignature,
  validateOfficeZipContent,
  type DocumentUploadMeta,
} from "@/lib/server/validation/document";

export interface UploadResult {
  success: boolean;
  documentId?: string;
  documentGroupId?: string;
  error?: string;
  duplicate?: {
    documentId: string;
    filename: string;
    createdAt: string;
  };
}

export async function processDocumentUpload(
  file: File,
  meta: DocumentUploadMeta,
  workspaceId: string,
  userId: string
): Promise<UploadResult> {
  const supabase = createServerSupabaseClient();

  // --- Step 1: Validate filename ---
  if (!isFilenameSafe(file.name)) {
    return { success: false, error: "Invalid or unsafe filename" };
  }

  // --- Step 2: Validate extension ---
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  if (BLOCKED_EXTENSIONS.includes(ext)) {
    return { success: false, error: `File type .${ext} is not allowed` };
  }

  const allowedExtensions = Object.values(ALLOWED_DOCUMENT_TYPES).flat();
  if (!allowedExtensions.includes(ext)) {
    return {
      success: false,
      error: `Unsupported file type: .${ext}. Allowed: ${allowedExtensions.join(", ")}`,
    };
  }

  // --- Step 3: Validate size ---
  if (file.size === 0) {
    return { success: false, error: "Empty files cannot be uploaded" };
  }
  if (file.size > MAX_FILE_SIZE) {
    return {
      success: false,
      error: `File exceeds maximum size of ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
    };
  }

  // --- Step 4: Validate MIME type matches extension ---
  const mimeType = file.type || "application/octet-stream";
  const allowedExtsForMime = ALLOWED_DOCUMENT_TYPES[mimeType];
  // For text formats, be lenient with MIME detection
  const isTextFormat = ext === "csv" || ext === "txt";
  if (!isTextFormat && allowedExtsForMime && !allowedExtsForMime.includes(ext)) {
    return {
      success: false,
      error: `File extension .${ext} does not match content type ${mimeType}`,
    };
  }

  // --- Step 5: Read bytes and validate file signature ---
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (!isTextFormat && !validateFileSignature(bytes, mimeType)) {
    return {
      success: false,
      error: "File content does not match its declared type",
    };
  }

  // --- Step 6: For Office formats, validate ZIP internals ---
  if (!validateOfficeZipContent(bytes, mimeType)) {
    return {
      success: false,
      error: `File appears to be a renamed ZIP and not a valid ${ext.toUpperCase()} document`,
    };
  }

  // --- Step 7: Compute SHA-256 checksum ---
  const hashBuffer = createHash("sha256").update(bytes).digest("hex");

  // --- Step 8: Check for duplicate in workspace ---
  const { data: existing } = await supabase
    .from("documents")
    .select("id, original_filename, created_at")
    .eq("workspace_id", workspaceId)
    .eq("sha256_checksum", hashBuffer)
    .eq("upload_status", "stored")
    .limit(1)
    .maybeSingle();

  if (existing) {
    return {
      success: false,
      error: "A document with identical content already exists in this workspace",
      duplicate: {
        documentId: existing.id,
        filename: existing.original_filename,
        createdAt: existing.created_at,
      },
    };
  }

  // --- Step 9: Verify target entity belongs to workspace ---
  const entityVerified = await verifyEntityOwnership(
    supabase,
    meta.entity_type,
    meta.entity_id,
    workspaceId
  );
  if (!entityVerified) {
    return {
      success: false,
      error: "Target entity not found or does not belong to this workspace",
    };
  }

  // --- Step 10: Upload to Supabase Storage ---
  const storageFilename = `${crypto.randomUUID()}.${ext}`;
  const storagePath = `${workspaceId}/${storageFilename}`;

  const { error: storageError } = await supabase.storage
    .from("termbridge-documents")
    .upload(storagePath, bytes, {
      contentType: mimeType,
      upsert: false,
    });

  if (storageError) {
    return {
      success: false,
      error: `Storage upload failed: ${storageError.message}`,
    };
  }

  // --- Step 11: Create document group ---
  const { data: docGroup, error: groupError } = await supabase
    .from("document_groups")
    .insert({
      workspace_id: workspaceId,
      document_type: meta.document_type,
      title: meta.title || file.name,
      created_by: userId,
    })
    .select("id")
    .single();

  if (groupError || !docGroup) {
    // Cleanup: remove uploaded file
    await supabase.storage.from("termbridge-documents").remove([storagePath]);
    return {
      success: false,
      error: `Failed to create document record: ${groupError?.message}`,
    };
  }

  // --- Step 12: Create document record ---
  const { data: doc, error: docError } = await supabase
    .from("documents")
    .insert({
      workspace_id: workspaceId,
      document_group_id: docGroup.id,
      original_filename: file.name,
      storage_path: storagePath,
      mime_type: mimeType,
      extension: ext,
      size_bytes: file.size,
      sha256_checksum: hashBuffer,
      version_number: 1,
      is_current: true,
      upload_status: "stored",
      uploaded_by: userId,
    })
    .select("id")
    .single();

  if (docError || !doc) {
    // Cleanup: remove uploaded file
    await supabase.storage.from("termbridge-documents").remove([storagePath]);
    return {
      success: false,
      error: `Failed to save document metadata: ${docError?.message}`,
    };
  }

  // --- Step 13: Create document link ---
  const { error: linkError } = await supabase.from("document_links").insert({
    workspace_id: workspaceId,
    document_id: doc.id,
    entity_type: meta.entity_type,
    entity_id: meta.entity_id,
    relationship_type: meta.relationship_type,
  });

  if (linkError) {
    // Non-fatal: document is uploaded, link just failed
    console.error("Document link creation failed:", linkError.message);
  }

  // --- Step 14: Audit event ---
  // Note: Audit event is automatically recorded within the same database transaction
  // by the database trigger trg_audit_document_creation (SECURITY DEFINER).

  return {
    success: true,
    documentId: doc.id,
    documentGroupId: docGroup.id,
  };
}

/**
 * Upload a new version of an existing document group.
 */
export async function processNewDocumentVersion(
  file: File,
  documentId: string,
  workspaceId: string,
  userId: string
): Promise<UploadResult> {
  const supabase = createServerSupabaseClient();

  // Get the existing document and its group
  const { data: existingDoc, error: fetchError } = await supabase
    .from("documents")
    .select("id, document_group_id, version_number, workspace_id")
    .eq("id", documentId)
    .eq("workspace_id", workspaceId)
    .single();

  if (fetchError || !existingDoc) {
    return { success: false, error: "Original document not found in this workspace" };
  }

  // Basic validations
  if (!isFilenameSafe(file.name)) {
    return { success: false, error: "Invalid or unsafe filename" };
  }

  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  if (file.size === 0) return { success: false, error: "Empty files cannot be uploaded" };
  if (file.size > MAX_FILE_SIZE) {
    return { success: false, error: `File exceeds maximum size of ${MAX_FILE_SIZE / (1024 * 1024)}MB` };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const hashBuffer = createHash("sha256").update(bytes).digest("hex");
  const mimeType = file.type || "application/octet-stream";

  // Upload new version to storage
  const storageFilename = `${crypto.randomUUID()}.${ext}`;
  const storagePath = `${workspaceId}/${storageFilename}`;

  const { error: storageError } = await supabase.storage
    .from("termbridge-documents")
    .upload(storagePath, bytes, { contentType: mimeType, upsert: false });

  if (storageError) {
    return { success: false, error: `Storage upload failed: ${storageError.message}` };
  }

  // Mark old document as not current
  await supabase
    .from("documents")
    .update({ is_current: false })
    .eq("document_group_id", existingDoc.document_group_id)
    .eq("workspace_id", workspaceId);

  // Create new document version
  const newVersionNumber = existingDoc.version_number + 1;
  const { data: newDoc, error: docError } = await supabase
    .from("documents")
    .insert({
      workspace_id: workspaceId,
      document_group_id: existingDoc.document_group_id,
      original_filename: file.name,
      storage_path: storagePath,
      mime_type: mimeType,
      extension: ext,
      size_bytes: file.size,
      sha256_checksum: hashBuffer,
      version_number: newVersionNumber,
      supersedes_document_id: existingDoc.id,
      is_current: true,
      upload_status: "stored",
      uploaded_by: userId,
    })
    .select("id")
    .single();

  if (docError || !newDoc) {
    await supabase.storage.from("termbridge-documents").remove([storagePath]);
    return { success: false, error: `Failed to save new version: ${docError?.message}` };
  }

  // Note: Audit event is automatically recorded within the same database transaction
  // by the database trigger trg_audit_document_creation (SECURITY DEFINER).

  return {
    success: true,
    documentId: newDoc.id,
    documentGroupId: existingDoc.document_group_id,
  };
}

async function verifyEntityOwnership(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  entityType: string,
  entityId: string,
  workspaceId: string
): Promise<boolean> {
  const tableMap: Record<string, string> = {
    purchase_order: "purchase_orders",
    agreement: "commercial_agreements",
    counterparty: "counterparties",
  };
  const table = tableMap[entityType];
  if (!table) return false;

  const { data, error } = await supabase
    .from(table)
    .select("id")
    .eq("id", entityId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  return !error && !!data;
}
