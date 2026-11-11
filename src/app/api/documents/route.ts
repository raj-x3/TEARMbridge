// src/app/api/documents/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/server/services/auth";
import { getDocumentsForEntity } from "@/lib/server/repositories/documents";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { workspaceId } = await requireAuth();

    const searchParams = request.nextUrl.searchParams;
    const entityType = searchParams.get("entityType");
    const entityId = searchParams.get("entityId");

    if (!entityType || !entityId) {
      return NextResponse.json(
        { success: false, error: "entityType and entityId query parameters are required" },
        { status: 400 }
      );
    }

    const docs = await getDocumentsForEntity(workspaceId, entityType, entityId);

    return NextResponse.json(
      { success: true, data: docs },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("GET /api/documents error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error fetching documents" },
      { status: 500 }
    );
  }
}
