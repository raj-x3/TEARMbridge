// src/app/api/agreements/[id]/analyze/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/server/services/auth";
import { runCommercialAnalysis } from "@/lib/server/intelligence/analysis-orchestrator";
import { isGeminiConfigured } from "@/lib/server/ai/gemini";
import { getAgreementByReferenceOrId } from "@/lib/server/repositories/agreements";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5-minute maximum execution timeout for multi-document AI reconciliation

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { workspaceId, userId } = await requireAuth(["owner", "admin", "finance"]);

    // Check Gemini API Configuration
    if (!isGeminiConfigured()) {
      return NextResponse.json(
        {
          success: false,
          error: "Gemini API key is not configured on the server. Please set GEMINI_API_KEY in .env.local to enable commercial intelligence analysis.",
          code: "GEMINI_NOT_CONFIGURED",
        },
        { status: 503 }
      );
    }

    // Resolve agreement ID (may be UUID or reference like AGR-1042)
    const agreement = await getAgreementByReferenceOrId(workspaceId, params.id);
    if (!agreement) {
      return NextResponse.json(
        { success: false, error: `Agreement '${params.id}' not found.` },
        { status: 404 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const forceNew = body.force_new === true;

    // Run the analysis orchestrator
    const result = await runCommercialAnalysis({
      workspaceId,
      agreementId: agreement.id,
      userId,
      forceNew,
    });

    return NextResponse.json({
      success: true,
      data: {
        run_id: result.runId,
        status: result.status,
        findings_count: result.result?.validatedFindings.length,
        summary: result.result?.analysis.summary,
      },
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }

    console.error("POST /api/agreements/[id]/analyze error:", error);
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message || "Internal server error analyzing agreement",
      },
      { status: 500 }
    );
  }
}
