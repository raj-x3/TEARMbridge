// src/app/api/counteroffers/[id]/generate-buyer-link/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { requireAuth, AuthError } from "@/lib/server/services/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordModule4Audit } from "@/lib/server/repositories/decisions";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { workspaceId } = await requireAuth(["owner", "admin", "finance"]);
    const adminClient = createAdminClient();

    // 1. Load counteroffer
    const { data: co, error: coErr } = await adminClient
      .from("counteroffers")
      .select("*, buyer:counterparties!buyer_id(id, display_name, email)")
      .eq("workspace_id", workspaceId)
      .eq("id", params.id)
      .single();

    if (coErr || !co) {
      return NextResponse.json(
        { success: false, error: "Counteroffer not found in workspace" },
        { status: 404 }
      );
    }

    if (co.status !== "awaiting_buyer") {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot generate buyer link: Counteroffer is in '${co.status}' status. Seller must approve the proposal first.`,
        },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    let versionId = body.version_id;

    if (!versionId) {
      // Find latest version
      const { data: latestVer } = await adminClient
        .from("counteroffer_versions")
        .select("id")
        .eq("counteroffer_id", co.id)
        .order("version_number", { ascending: false })
        .limit(1)
        .single();

      versionId = latestVer?.id;
    }

    if (!versionId) {
      return NextResponse.json(
        { success: false, error: "No version found for counteroffer" },
        { status: 400 }
      );
    }

    const recipientEmail =
      body.recipient_email || co.buyer?.email || "procurement@counterparty.com";
    const expiresInHours = body.expires_in_hours || 72;
    const expiresAt = new Date(Date.now() + expiresInHours * 3600 * 1000).toISOString();

    // 2. Generate secure cryptographically random token
    const rawToken = crypto.randomBytes(32).toString("hex"); // 64 hex characters
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    // 3. Store ONLY the SHA-256 hash in database
    const { data: tokenRecord, error: tokenErr } = await adminClient
      .from("counteroffer_access_tokens")
      .insert({
        workspace_id: workspaceId,
        counteroffer_id: co.id,
        counteroffer_version_id: versionId,
        recipient_email: recipientEmail,
        token_hash: tokenHash,
        expires_at: expiresAt,
      })
      .select("id")
      .single();

    if (tokenErr || !tokenRecord) {
      return NextResponse.json(
        { success: false, error: `Failed to generate buyer access token: ${tokenErr?.message}` },
        { status: 500 }
      );
    }

    await recordModule4Audit(workspaceId, "counteroffer", co.id, "counteroffer.sent_to_buyer", {
      token_id: tokenRecord.id,
      recipient_email: recipientEmail,
      expires_at: expiresAt,
    });

    // 4. Return one-time raw link to caller
    const buyerLink = `/respond/${rawToken}`;

    return NextResponse.json({
      success: true,
      data: {
        token_id: tokenRecord.id,
        buyer_link: buyerLink,
        expires_at: expiresAt,
        recipient_email: recipientEmail,
        disclosure:
          "Link possession is the approval mechanism. This does not constitute an independent legal identity verification or electronic signature.",
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
