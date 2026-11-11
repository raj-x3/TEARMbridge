// src/app/api/agreements/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/server/services/auth";
import { getAgreementByReferenceOrId } from "@/lib/server/repositories/agreements";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { workspaceId } = await requireAuth();
    const agreement = await getAgreementByReferenceOrId(
      workspaceId,
      params.id
    );

    if (!agreement) {
      return NextResponse.json(
        { success: false, error: "Agreement not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: true, data: agreement },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("GET /api/agreements/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error fetching agreement" },
      { status: 500 }
    );
  }
}
