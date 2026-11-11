// src/app/api/analysis/[runId]/findings/[findingId]/review/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/server/services/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

export const dynamic = "force-dynamic";

const ReviewStatusSchema = z.object({
  review_status: z.enum(["confirmed", "dismissed", "needs_more_information"]),
  review_notes: z.string().max(1000).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { runId: string; findingId: string } }
) {
  try {
    const { workspaceId, userId } = await requireAuth(["owner", "admin", "finance", "reviewer"]);
    const supabase = createServerSupabaseClient();
    let adminClient = supabase;
    try {
      adminClient = createAdminClient();
    } catch {
      adminClient = supabase;
    }

    const body = await request.json().catch(() => ({}));
    const parseResult = ReviewStatusSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid review status. Allowed values: confirmed, dismissed, needs_more_information.",
          details: parseResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { review_status, review_notes } = parseResult.data;

    // Verify finding exists in workspace
    const { data: finding, error: findingErr } = await supabase
      .from("analysis_findings")
      .select("id, analysis_run_id")
      .eq("id", params.findingId)
      .eq("analysis_run_id", params.runId)
      .eq("workspace_id", workspaceId)
      .single();

    if (findingErr || !finding) {
      return NextResponse.json(
        { success: false, error: "Finding not found in this analysis run." },
        { status: 404 }
      );
    }

    // Update review status via trusted server client
    const { data: updated, error: updateErr } = await adminClient
      .from("analysis_findings")
      .update({
        review_status,
        review_notes: review_notes || null,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.findingId)
      .eq("workspace_id", workspaceId)
      .select("*")
      .single();

    if (updateErr) {
      return NextResponse.json(
        { success: false, error: updateErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }

    console.error("POST /api/analysis/.../review error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error updating finding review" },
      { status: 500 }
    );
  }
}
