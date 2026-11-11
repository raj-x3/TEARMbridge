// src/app/api/commercial-rules/route.ts
import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/server/services/auth";
import { getCommercialRules } from "@/lib/server/repositories/commercial-rules";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { workspaceId } = await requireAuth();
    const rules = await getCommercialRules(workspaceId);

    return NextResponse.json(
      { success: true, data: rules },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("GET /api/commercial-rules error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error fetching commercial rules" },
      { status: 500 }
    );
  }
}
