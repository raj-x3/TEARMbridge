// src/app/api/documents/[id]/download/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/server/services/auth";
import { getDocumentDownloadUrl } from "@/lib/server/repositories/documents";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { workspaceId } = await requireAuth();

    // Check optional expiry query param (capped between 60s and 3600s)
    const url = new URL(request.url);
    const requestedExpires = parseInt(url.searchParams.get("expires") || "300", 10);
    const expiresIn = Math.min(Math.max(requestedExpires, 60), 3600);

    const downloadInfo = await getDocumentDownloadUrl(
      workspaceId,
      params.id,
      expiresIn
    );

    // If 'redirect=true' is passed, 307 redirect directly to signed URL
    if (url.searchParams.get("redirect") === "true") {
      return NextResponse.redirect(downloadInfo.signedUrl, 307);
    }

    return NextResponse.json(
      { success: true, data: downloadInfo },
      { headers: { "Cache-Control": "no-store, private" } }
    );
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("GET /api/documents/[id]/download error:", error);
    const msg = error instanceof Error ? error.message : "Failed to generate download authorization";
    return NextResponse.json(
      { success: false, error: msg },
      { status: 404 }
    );
  }
}
