// src/lib/server/repositories/documents.ts
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function getDocumentsForEntity(
  workspaceId: string,
  entityType: string,
  entityId: string
) {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("document_links")
    .select(`
      id,
      relationship_type,
      created_at,
      document:document_id (
        id,
        original_filename,
        storage_path,
        mime_type,
        extension,
        size_bytes,
        version_number,
        is_current,
        upload_status,
        created_at,
        uploaded_by
      )
    `)
    .eq("workspace_id", workspaceId)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to fetch documents: ${error.message}`);
  return data || [];
}

export async function getDocumentDownloadUrl(
  workspaceId: string,
  documentId: string,
  expiresInSeconds: number = 300 // default 5 minutes
) {
  const supabase = createServerSupabaseClient();

  // Verify document belongs to workspace
  const { data: doc, error: docError } = await supabase
    .from("documents")
    .select("id, original_filename, storage_path, mime_type, workspace_id")
    .eq("id", documentId)
    .eq("workspace_id", workspaceId)
    .single();

  if (docError || !doc) {
    throw new Error("Document not found or access denied");
  }

  // Generate short-lived signed URL from private storage
  const { data: signedData, error: signError } = await supabase.storage
    .from("termbridge-documents")
    .createSignedUrl(doc.storage_path, expiresInSeconds, {
      download: doc.original_filename,
    });

  if (signError || !signedData?.signedUrl) {
    throw new Error(`Failed to generate download URL: ${signError?.message}`);
  }

  return {
    signedUrl: signedData.signedUrl,
    filename: doc.original_filename,
    mimeType: doc.mime_type,
    expiresIn: expiresInSeconds,
  };
}
