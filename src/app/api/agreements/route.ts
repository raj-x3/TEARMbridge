// src/app/api/agreements/route.ts
import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/server/services/auth";
import { getAgreements } from "@/lib/server/repositories/agreements";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { workspaceId } = await requireAuth();
    const agreements = await getAgreements(workspaceId);

    return NextResponse.json(
      { success: true, data: agreements },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("GET /api/agreements error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error fetching agreements" },
      { status: 500 }
    );
  }
}
