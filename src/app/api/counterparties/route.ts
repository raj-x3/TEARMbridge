// src/app/api/counterparties/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/server/services/auth";
import {
  getCounterparties,
  createCounterparty,
} from "@/lib/server/repositories/counterparties";
import { createCounterpartySchema } from "@/lib/server/validation/counterparty";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { workspaceId } = await requireAuth();
    const counterparties = await getCounterparties(workspaceId);

    return NextResponse.json(
      { success: true, data: counterparties },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("GET /api/counterparties error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error fetching counterparties" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { workspaceId, userId } = await requireAuth(["owner", "admin", "finance"]);

    const body = await request.json();
    const parseResult = createCounterpartySchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation failed",
          details: parseResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    const newCp = await createCounterparty(
      workspaceId,
      parseResult.data,
      userId
    );

    return NextResponse.json(
      { success: true, data: newCp },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("POST /api/counterparties error:", error);
    const msg = error instanceof Error ? error.message : "Failed to create counterparty";
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}
