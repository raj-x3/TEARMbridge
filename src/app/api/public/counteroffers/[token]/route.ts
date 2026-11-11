// src/app/api/public/counteroffers/[token]/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const rawToken = params.token;
    if (!rawToken || typeof rawToken !== "string" || rawToken.length < 32) {
      return NextResponse.json(
        { success: false, error: "Invalid proposal access token" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // 1. Hash the incoming token
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    // 2. Look up token record
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

    // 3. Check consumption & expiry
    if (tokenRecord.consumed_at) {
      return NextResponse.json(
        {
          success: false,
          error: "This proposal link has already been responded to and is no longer valid.",
          consumed_at: tokenRecord.consumed_at,
        },
        { status: 410 }
      );
    }

    const isExpired = new Date(tokenRecord.expires_at).getTime() < Date.now();
    if (isExpired) {
      return NextResponse.json(
        {
          success: false,
          error: "This proposal link has expired. Please contact the supplier for an updated proposal.",
          expires_at: tokenRecord.expires_at,
        },
        { status: 410 }
      );
    }

    // Rate-limit attempt counting
    await adminClient
      .from("counteroffer_access_tokens")
      .update({ attempt_count: (tokenRecord.attempt_count || 0) + 1 })
      .eq("id", tokenRecord.id);

    if ((tokenRecord.attempt_count || 0) > 10) {
      return NextResponse.json(
        { success: false, error: "Too many requests. Please wait before retrying." },
        { status: 429 }
      );
    }

    // 4. Load counteroffer and bound version
    const { data: co } = await adminClient
      .from("counteroffers")
      .select("*, agreement:commercial_agreements(agreement_reference, title), po:purchase_orders(po_number), buyer:counterparties!buyer_id(display_name, email), supplier:counterparties!supplier_id(display_name)")
      .eq("id", tokenRecord.counteroffer_id)
      .single();

    const { data: version } = await adminClient
      .from("counteroffer_versions")
      .select("*")
      .eq("id", tokenRecord.counteroffer_version_id)
      .single();

    if (!co || !version) {
      return NextResponse.json(
        { success: false, error: "Counteroffer or proposal version no longer exists" },
        { status: 404 }
      );
    }

    // 5. Return sanitized public-facing data
    return NextResponse.json({
      success: true,
      data: {
        token_id: tokenRecord.id,
        counteroffer_id: co.id,
        version_id: version.id,
        version_number: version.version_number,
        agreement_reference: co.agreement?.agreement_reference || "AGR-1042",
        agreement_title: co.agreement?.title,
        po_number: co.po?.po_number || "PO-8821",
        buyer_name: co.buyer?.display_name || "Meridian Retail",
        supplier_name: co.supplier?.display_name || "Northstar Supply",
        recipient_email: tokenRecord.recipient_email,
        status: co.status,
        expires_at: tokenRecord.expires_at,
        proposed_terms: version.proposed_terms,
        original_terms: version.original_terms,
        financial_summary: version.financial_summary,
        explanation: version.explanation,
        terms_hash: version.terms_hash,
        disclosure:
          "Link possession is the approval mechanism. This does not constitute an independent legal identity verification or electronic signature.",
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
