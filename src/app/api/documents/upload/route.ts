// src/app/api/documents/upload/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/server/services/auth";
import { processDocumentUpload } from "@/lib/server/services/document-ingestion";
import { documentUploadMetaSchema } from "@/lib/server/validation/document";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { workspaceId, userId } = await requireAuth();

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file was provided in the upload request" },
        { status: 400 }
      );
    }

    // Extract metadata fields
    const metaRaw = {
      entity_type: formData.get("entity_type"),
      entity_id: formData.get("entity_id"),
      relationship_type: formData.get("relationship_type") || "attachment",
      document_type: formData.get("document_type") || "general",
      title: formData.get("title") || file.name,
    };

    const parseResult = documentUploadMetaSchema.safeParse(metaRaw);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid document metadata",
          details: parseResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    const uploadResult = await processDocumentUpload(
      file,
      parseResult.data,
      workspaceId,
      userId
    );

    if (!uploadResult.success) {
      if (uploadResult.duplicate) {
        return NextResponse.json(
          {
            success: false,
            error: uploadResult.error,
            duplicate: uploadResult.duplicate,
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { success: false, error: uploadResult.error },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          documentId: uploadResult.documentId,
          documentGroupId: uploadResult.documentGroupId,
          filename: file.name,
          sizeBytes: file.size,
        },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("POST /api/documents/upload error:", error);
    const msg = error instanceof Error ? error.message : "Failed to process document upload";
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}
