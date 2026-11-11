// src/app/api/counteroffers/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/server/services/auth";
import { getCounterofferById } from "@/lib/server/repositories/decisions";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { workspaceId } = await requireAuth();

    const counteroffer = await getCounterofferById(workspaceId, params.id);
    if (!counteroffer) {
      return NextResponse.json(
        { success: false, error: "Counteroffer not found in workspace" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: counteroffer,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
