// src/app/api/workspace/overview/route.ts
import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/server/services/auth";
import { getWorkspaceOverview } from "@/lib/server/repositories/workspace";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { workspaceId } = await requireAuth();
    const overview = await getWorkspaceOverview(workspaceId);

    return NextResponse.json(
      { success: true, data: overview },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("GET /api/workspace/overview error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error fetching overview" },
      { status: 500 }
    );
  }
}
