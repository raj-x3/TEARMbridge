// src/app/api/counteroffers/[id]/approve-seller/route.ts
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

    const body = await request.json().catch(() => ({}));
    const action = body.action || "approve";
    const versionId = body.version_id;
    const notes = body.notes;

    // Load counteroffer
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

    if (action === "withdraw") {
      await adminClient
        .from("counteroffers")
        .update({ status: "withdrawn" })
        .eq("id", co.id);

      await recordModule4Audit(workspaceId, "counteroffer", co.id, "counteroffer.withdrawn", {
        performed_by: userId,
        notes,
      });

      return NextResponse.json({
        success: true,
        data: { counteroffer_id: co.id, status: "withdrawn" },
      });
    }

    if (!versionId) {
      return NextResponse.json(
        { success: false, error: "version_id is required for approval or rejection" },
        { status: 400 }
      );
    }

    // Verify version exists and belongs to this counteroffer
    const { data: ver, error: verErr } = await adminClient
      .from("counteroffer_versions")
      .select("*")
      .eq("counteroffer_id", co.id)
      .eq("id", versionId)
      .single();

    if (verErr || !ver) {
      return NextResponse.json(
        { success: false, error: "Counteroffer version not found" },
        { status: 404 }
      );
    }

    if (action === "reject") {
      await adminClient
        .from("counteroffers")
        .update({ status: "draft" })
        .eq("id", co.id);

      const { data: approval } = await adminClient
        .from("counteroffer_approvals")
        .insert({
          workspace_id: workspaceId,
          counteroffer_id: co.id,
          counteroffer_version_id: versionId,
          approver_type: "seller",
          approver_user_id: userId,
          approval_status: "rejected",
          confirmation_method: "internal_session",
          identity_verified: true,
          rejection_notes: notes,
          approved_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      await recordModule4Audit(workspaceId, "counteroffer", co.id, "counteroffer.seller_rejected", {
        version_id: versionId,
        rejected_by: userId,
        notes,
      });

      return NextResponse.json({
        success: true,
        data: { counteroffer_id: co.id, approval_id: approval?.id, status: "draft" },
      });
    }

    // Action === "approve"
    const { data: approval, error: appErr } = await adminClient
      .from("counteroffer_approvals")
      .insert({
        workspace_id: workspaceId,
        counteroffer_id: co.id,
        counteroffer_version_id: versionId,
        approver_type: "seller",
        approver_user_id: userId,
        approval_status: "approved",
        confirmation_method: "internal_session",
        identity_verified: true,
        approved_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (appErr || !approval) {
      return NextResponse.json(
        { success: false, error: `Failed to record seller approval: ${appErr?.message}` },
        { status: 500 }
      );
    }

    // Advance counteroffer status to awaiting_buyer
    await adminClient
      .from("counteroffers")
      .update({ status: "awaiting_buyer" })
      .eq("id", co.id);

    await recordModule4Audit(workspaceId, "counteroffer", co.id, "counteroffer.seller_approved", {
      version_id: versionId,
      approved_by: userId,
      approval_id: approval.id,
    });

    return NextResponse.json({
      success: true,
      data: {
        counteroffer_id: co.id,
        approval_id: approval.id,
        status: "awaiting_buyer",
        message: "Seller approval recorded. Counteroffer is now ready for buyer delivery.",
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
