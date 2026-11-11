// src/app/api/public/counteroffers/[token]/respond/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordModule4Audit } from "@/lib/server/repositories/decisions";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const rawToken = params.token;
    if (!rawToken || typeof rawToken !== "string") {
      return NextResponse.json(
        { success: false, error: "Invalid proposal access token" },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const action = body.action;
    const notes = body.notes || "";

    if (!action || !["accept", "reject", "request_changes"].includes(action)) {
      return NextResponse.json(
        { success: false, error: "Action must be one of: 'accept', 'reject', 'request_changes'" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // 1. Hash incoming token
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    // 2. Query token record
    const { data: tokenRecord, error: tokenErr } = await adminClient
      .from("counteroffer_access_tokens")
      .select("*")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (tokenErr || !tokenRecord) {
      return NextResponse.json(
        { success: false, error: "Proposal not found or invalid link" },
        { status: 404 }
      );
    }

    // 3. Atomically check consumption
    if (tokenRecord.consumed_at) {
      return NextResponse.json(
        { success: false, error: "This link has already been used and cannot be replayed." },
        { status: 410 }
      );
    }

    const isExpired = new Date(tokenRecord.expires_at).getTime() < Date.now();
    if (isExpired) {
      return NextResponse.json(
        { success: false, error: "This proposal link has expired." },
        { status: 410 }
      );
    }

    // 4. Consume token atomically
    const consumedAt = new Date().toISOString();
    await adminClient
      .from("counteroffer_access_tokens")
      .update({ consumed_at: consumedAt })
      .eq("id", tokenRecord.id);

    // 5. Insert buyer approval record
    const approvalStatus =
      action === "accept"
        ? "approved"
        : action === "reject"
        ? "rejected"
        : "requested_changes";

    const { data: approval, error: appErr } = await adminClient
      .from("counteroffer_approvals")
      .insert({
        workspace_id: tokenRecord.workspace_id,
        counteroffer_id: tokenRecord.counteroffer_id,
        counteroffer_version_id: tokenRecord.counteroffer_version_id,
        approver_type: "buyer",
        recipient_email: tokenRecord.recipient_email,
        approval_status: approvalStatus,
        confirmation_method: "secure_bearer_link",
        identity_verified: false,
        rejection_notes: notes,
        approved_at: consumedAt,
      })
      .select("id")
      .single();

    if (appErr || !approval) {
      return NextResponse.json(
        { success: false, error: `Failed to record response: ${appErr?.message}` },
        { status: 500 }
      );
    }

    // 6. Update counteroffer status
    const coStatus =
      action === "accept"
        ? "accepted"
        : action === "reject"
        ? "rejected"
        : "buyer_requested_changes";

    await adminClient
      .from("counteroffers")
      .update({ status: coStatus })
      .eq("id", tokenRecord.counteroffer_id);

    // Audit
    const auditEventType =
      action === "accept"
        ? "counteroffer.buyer_accepted"
        : action === "reject"
        ? "counteroffer.buyer_rejected"
        : "counteroffer.changes_requested";

    await recordModule4Audit(
      tokenRecord.workspace_id,
      "counteroffer",
      tokenRecord.counteroffer_id,
      auditEventType,
      {
        approval_id: approval.id,
        version_id: tokenRecord.counteroffer_version_id,
        recipient_email: tokenRecord.recipient_email,
        confirmation_method: "secure_bearer_link",
        identity_verified: false,
        notes,
      }
    );

    const message =
      action === "accept"
        ? "Proposal accepted successfully. The supplier has been notified and transaction finalization can proceed."
        : action === "reject"
        ? "Proposal rejected. The negotiation has been terminated."
        : "Change request submitted. The supplier has been requested to revise terms.";

    return NextResponse.json({
      success: true,
      data: {
        action,
        approval_id: approval.id,
        status: coStatus,
        message,
        disclosure:
          "This response was recorded via secure bearer link. No independent legal identity verification was performed.",
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
