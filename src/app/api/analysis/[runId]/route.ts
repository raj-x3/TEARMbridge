// src/app/api/analysis/[runId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/server/services/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { runId: string } }
) {
  try {
    const { workspaceId } = await requireAuth();
    const supabase = createServerSupabaseClient();

    // 1. Fetch analysis run
    const { data: run, error: runError } = await supabase
      .from("analysis_runs")
      .select("*")
      .eq("id", params.runId)
      .eq("workspace_id", workspaceId)
      .single();

    if (runError || !run) {
      return NextResponse.json(
        { success: false, error: "Analysis run not found" },
        { status: 404 }
      );
    }

    // 2. Fetch findings
    const { data: findings } = await supabase
      .from("analysis_findings")
      .select("*")
      .eq("analysis_run_id", params.runId)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true });

    // 3. Fetch evidence for findings
    const { data: evidence } = await supabase
      .from("analysis_evidence")
      .select("*")
      .eq("analysis_run_id", params.runId)
      .eq("workspace_id", workspaceId);

    // Group evidence by finding_id
    const evidenceByFinding = new Map<string, unknown[]>();
    if (evidence) {
      for (const ev of evidence) {
        const list = evidenceByFinding.get(ev.finding_id) || [];
        list.push(ev);
        evidenceByFinding.set(ev.finding_id, list);
      }
    }

    const enrichedFindings = (findings || []).map((f) => ({
      ...f,
      evidence: evidenceByFinding.get(f.id) || [],
    }));

    return NextResponse.json({
      success: true,
      data: {
        run,
        findings: enrichedFindings,
      },
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }

    console.error("GET /api/analysis/[runId] error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error fetching analysis details" },
      { status: 500 }
    );
  }
}
