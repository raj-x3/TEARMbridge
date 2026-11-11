// src/app/api/agreements/[id]/decision/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/server/services/auth";
import { getAgreementByReferenceOrId } from "@/lib/server/repositories/agreements";
import {
  getDecisionForAgreement,
  getLatestCounterofferForDecision,
} from "@/lib/server/repositories/decisions";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { workspaceId } = await requireAuth();

    const agreement = await getAgreementByReferenceOrId(workspaceId, params.id);
    if (!agreement) {
      return NextResponse.json(
        { success: false, error: "Agreement not found in workspace" },
        { status: 404 }
      );
    }

    const decision = await getDecisionForAgreement(workspaceId, agreement.id);
    if (!decision) {
      return NextResponse.json({
        success: true,
        data: {
          has_decision: false,
          decision: null,
          counteroffer: null,
        },
      });
    }

    // Also load latest counteroffer if one was generated
    const counteroffer = await getLatestCounterofferForDecision(workspaceId, decision.id);

    return NextResponse.json({
      success: true,
      data: {
        has_decision: true,
        decision,
        counteroffer,
      },
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
