// src/app/api/counteroffers/[id]/withdraw/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/server/services/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordModule4Audit } from "@/lib/server/repositories/decisions";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { workspaceId, userId } = await requireAuth(["owner", "admin", "finance"]);
    const adminClient = createAdminClient();

    const { data: co, error: coErr } = await adminClient
      .from("counteroffers")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("id", params.id)
      .single();

    if (coErr || !co) {
      return NextResponse.json(
        { success: false, error: "Counteroffer not found in workspace" },
        { status: 404 }
      );
    }

    await adminClient
      .from("counteroffers")
      .update({ status: "withdrawn" })
      .eq("id", co.id);

    await recordModule4Audit(workspaceId, "counteroffer", co.id, "counteroffer.withdrawn", {
      withdrawn_by: userId,
    });

    return NextResponse.json({
      success: true,
      data: { counteroffer_id: co.id, status: "withdrawn" },
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
