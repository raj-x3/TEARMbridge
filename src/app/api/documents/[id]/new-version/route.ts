// src/app/api/documents/[id]/new-version/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/server/services/auth";
import { processNewDocumentVersion } from "@/lib/server/services/document-ingestion";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { workspaceId, userId } = await requireAuth();

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file was provided for the new version" },
        { status: 400 }
      );
    }

    const result = await processNewDocumentVersion(
      file,
      params.id,
      workspaceId,
      userId
    );

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          documentId: result.documentId,
          documentGroupId: result.documentGroupId,
          filename: file.name,
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
    console.error("POST /api/documents/[id]/new-version error:", error);
    const msg = error instanceof Error ? error.message : "Failed to upload new version";
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}
