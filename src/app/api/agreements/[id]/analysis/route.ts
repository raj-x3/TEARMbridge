// src/app/api/agreements/[id]/analysis/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/server/services/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAgreementByReferenceOrId } from "@/lib/server/repositories/agreements";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { workspaceId } = await requireAuth();
    const supabase = createServerSupabaseClient();

    const agreement = await getAgreementByReferenceOrId(workspaceId, params.id);
    if (!agreement) {
      return NextResponse.json(
        { success: false, error: "Agreement not found" },
        { status: 404 }
      );
    }

    // Fetch the latest analysis run for this agreement
    const { data: runs, error: runsError } = await supabase
      .from("analysis_runs")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("agreement_id", agreement.id)
      .order("created_at", { ascending: false })
      .limit(5);

    if (runsError) {
      return NextResponse.json(
        { success: false, error: runsError.message },
        { status: 500 }
      );
    }

    const latestRun = runs && runs.length > 0 ? runs[0] : null;

    if (!latestRun) {
      return NextResponse.json({
        success: true,
        data: {
          has_analysis: false,
          latest_run: null,
          findings: [],
        },
      });
    }

    // Fetch findings for latest run
    const { data: findings } = await supabase
      .from("analysis_findings")
      .select("*")
      .eq("analysis_run_id", latestRun.id)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true });

    // Fetch evidence
    const { data: evidence } = await supabase
      .from("analysis_evidence")
      .select("*")
      .eq("analysis_run_id", latestRun.id)
      .eq("workspace_id", workspaceId);

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
        has_analysis: true,
        latest_run: latestRun,
        runs: runs || [],
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

    console.error("GET /api/agreements/[id]/analysis error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error fetching agreement analysis" },
      { status: 500 }
    );
  }
}
