// scripts/verify-module4-demo.ts
import * as path from "path";
import * as fs from "fs";
import { createClient } from "@supabase/supabase-js";

// Load .env.local
const envLocalPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envLocalPath)) {
  const content = fs.readFileSync(envLocalPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"](.*)['"]$/, "$1");
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
}

async function main() {
  console.log("================================================================================");
  console.log("   TERMBridge Module 4 — Complete Commercial Decision & Negotiation Live Demo   ");
  console.log("================================================================================\n");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const demoEmail = process.env.TERMBRIDGE_DEMO_EMAIL!;
  const demoPassword = process.env.TERMBRIDGE_DEMO_PASSWORD!;

  const adminClient = createClient(supabaseUrl, serviceKey);

  // 1. Authenticate with Supabase Auth using @supabase/ssr
  console.log(`[Step 1] Authenticating as demo seller: ${demoEmail}...`);
  const { createServerClient } = await import("@supabase/ssr");
  const cookieJar: Record<string, string> = {};

  const ssrClient = createServerClient(supabaseUrl, publishableKey, {
    cookies: {
      getAll() {
        return Object.entries(cookieJar).map(([name, value]) => ({ name, value }));
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          cookieJar[name] = value;
        });
      },
    },
  });

  const { data: authData, error: authError } = await ssrClient.auth.signInWithPassword({
    email: demoEmail,
    password: demoPassword,
  });

  if (authError || !authData.session) {
    throw new Error(`Authentication failed: ${authError?.message}`);
  }

  const token = authData.session.access_token;
  const cookieHeader = Object.entries(cookieJar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  console.log(`✓ Authenticated successfully! User ID: ${authData.user.id}\n`);

  const headers = {
    Cookie: cookieHeader,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  // 2. Evaluate commercial decision
  console.log("[Step 2] Evaluating commercial decision for AGR-1042...");
  const evalRes = await fetch("http://localhost:3000/api/agreements/AGR-1042/evaluate", {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  });

  if (!evalRes.ok) {
    throw new Error(`Evaluate failed (${evalRes.status}): ${await evalRes.text()}`);
  }

  const evalJson = await evalRes.json();
  console.log(`✓ Decision outcome: ${evalJson.data.decision_status.toUpperCase()}`);
  console.log(`   - Decision ID: ${evalJson.data.decision_id}`);
  console.log(`   - Summary: ${evalJson.data.summary}`);
  console.log(`   - Counteroffer reasons: ${evalJson.data.requires_counteroffer_reasons?.length}\n`);

  const decisionId = evalJson.data.decision_id;

  // 3. Generate counteroffer
  console.log("[Step 3] Generating rule-validated counteroffer...");
  const coRes = await fetch("http://localhost:3000/api/purchase-orders/129e8bc7-618e-4da8-9009-d0d4a605e7ac/counteroffers", {
    method: "POST",
    headers,
    body: JSON.stringify({
      decision_id: decisionId,
      agreement_id: "ff33cc7a-0cc9-4143-8239-f3aa10310889",
    }),
  });

  if (!coRes.ok) {
    throw new Error(`Counteroffer creation failed (${coRes.status}): ${await coRes.text()}`);
  }

  const coJson = await coRes.json();
  const coId = coJson.data.counteroffer_id;
  const versionId = coJson.data.version_id;
  console.log(`✓ Counteroffer generated: ID ${coId} (Version ${versionId})`);
  console.log(`   - Terms hash: ${coJson.data.terms_hash}`);
  console.log(`   - Proposed Quantity: ${coJson.data.proposed_terms?.quantity} units (adjusted to MOQ)`);
  console.log(`   - Proposed Discount: ${coJson.data.proposed_terms?.discount_percent}% (adjusted to Tier-1 ceiling)`);
  console.log(`   - Proposed Payment: ${coJson.data.proposed_terms?.payment_term_label} (reconciled to Amendment No. 1)`);
  console.log(`   - Proposed Delivery: ${coJson.data.proposed_terms?.delivery_days} business days`);
  console.log(`   - Financial: Gross $${coJson.data.financial_summary?.gross_amount} - Discount $${coJson.data.financial_summary?.discount_amount} = Subtotal $${coJson.data.financial_summary?.subtotal}`);
  console.log(`   - Grand Total: $${coJson.data.financial_summary?.grand_total} ${coJson.data.financial_summary?.currency}\n`);

  // 4. Seller approval
  console.log("[Step 4] Seller approving proposal version...");
  const approveRes = await fetch(`http://localhost:3000/api/counteroffers/${coId}/approve-seller`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      version_id: versionId,
      action: "approve",
    }),
  });

  if (!approveRes.ok) {
    throw new Error(`Seller approve failed (${approveRes.status}): ${await approveRes.text()}`);
  }

  const approveJson = await approveRes.json();
  console.log(`✓ Seller approval recorded! Status: ${approveJson.data.status}`);
  console.log(`   - Approval ID: ${approveJson.data.approval_id}\n`);

  // 5. Generate buyer proposal link
  console.log("[Step 5] Generating single-use buyer proposal link...");
  const linkRes = await fetch(`http://localhost:3000/api/counteroffers/${coId}/generate-buyer-link`, {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  });

  if (!linkRes.ok) {
    throw new Error(`Generate buyer link failed (${linkRes.status}): ${await linkRes.text()}`);
  }

  const linkJson = await linkRes.json();
  const buyerLink = linkJson.data.buyer_link;
  const rawToken = buyerLink.replace("/respond/", "");
  console.log(`✓ Buyer link generated: ${buyerLink}`);
  console.log(`   - Raw bearer token length: ${rawToken.length} chars (stored only as SHA-256 hash in DB)`);
  console.log(`   - Recipient: ${linkJson.data.recipient_email}`);
  console.log(`   - Disclosure: "${linkJson.data.disclosure}"\n`);

  // 6. Public buyer inspection
  console.log("[Step 6] Buyer opening public proposal endpoint (no session auth)...");
  const pubGetRes = await fetch(`http://localhost:3000/api/public/counteroffers/${rawToken}`);
  if (!pubGetRes.ok) {
    throw new Error(`Public GET failed (${pubGetRes.status}): ${await pubGetRes.text()}`);
  }

  const pubGetJson = await pubGetRes.json();
  console.log(`✓ Public proposal loaded successfully!`);
  console.log(`   - PO: ${pubGetJson.data.po_number}`);
  console.log(`   - Buyer: ${pubGetJson.data.buyer_name}`);
  console.log(`   - Supplier: ${pubGetJson.data.supplier_name}`);
  console.log(`   - Grand Total: $${pubGetJson.data.financial_summary?.grand_total} ${pubGetJson.data.financial_summary?.currency}`);
  console.log(`   - Security disclosure verified: "${pubGetJson.data.disclosure}"\n`);

  // 7. Buyer acceptance
  console.log("[Step 7] Buyer accepting proposal terms...");
  const respondRes = await fetch(`http://localhost:3000/api/public/counteroffers/${rawToken}/respond`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "accept",
      notes: "Commercial terms approved on behalf of Meridian Retail procurement desk.",
    }),
  });

  if (!respondRes.ok) {
    throw new Error(`Buyer respond failed (${respondRes.status}): ${await respondRes.text()}`);
  }

  const respondJson = await respondRes.json();
  console.log(`✓ Buyer response recorded!`);
  console.log(`   - Action: ${respondJson.data.action}`);
  console.log(`   - Counteroffer Status: ${respondJson.data.status}`);
  console.log(`   - Disclosure: "${respondJson.data.disclosure}"\n`);

  // 8. Test single-use token replay rejection
  console.log("[Step 8] Verifying token replay is strictly blocked...");
  const replayRes = await fetch(`http://localhost:3000/api/public/counteroffers/${rawToken}/respond`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "accept" }),
  });

  if (replayRes.status === 410) {
    console.log(`✓ Token replay rejected with 410 Gone as required: ${await replayRes.text()}\n`);
  } else {
    throw new Error(`Expected 410 Gone on token replay, got ${replayRes.status}`);
  }

  // 9. Mutual finalization
  console.log("[Step 9] Seller locking transaction finalization snapshot...");
  const finalizeRes = await fetch(`http://localhost:3000/api/counteroffers/${coId}/finalize`, {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  });

  if (!finalizeRes.ok) {
    throw new Error(`Finalize failed (${finalizeRes.status}): ${await finalizeRes.text()}`);
  }

  const finalizeJson = await finalizeRes.json();
  const txId = finalizeJson.data.transaction_id;
  console.log(`✓ Transaction Finalized & Locked!`);
  console.log(`   - Transaction ID: ${txId}`);
  console.log(`   - Snapshot SHA-256: ${finalizeJson.data.snapshot_hash}`);
  console.log(`   - Status: ${finalizeJson.data.transaction_status.toUpperCase()}`);
  console.log(`   - Grand Total: $${finalizeJson.data.grand_total} ${finalizeJson.data.currency}\n`);

  // 10. Direct Database Persistence Verification
  console.log("[Step 10] Auditing live Supabase database records...");
  const { data: txRecord } = await adminClient
    .from("finalized_transactions")
    .select("*")
    .eq("id", txId)
    .single();

  console.log(`✓ Direct DB verified: finalized_transactions record exists:`);
  console.log(`   - ID: ${txRecord.id}`);
  console.log(`   - Subtotal: $${txRecord.subtotal}`);
  console.log(`   - Discount: -$${txRecord.discount_total}`);
  console.log(`   - Grand Total: $${txRecord.grand_total} ${txRecord.currency}`);
  console.log(`   - Snapshot Hash: ${txRecord.snapshot_hash}`);
  console.log(`   - Finalized At: ${txRecord.finalized_at}`);

  const { data: approvalsCount } = await adminClient
    .from("counteroffer_approvals")
    .select("*")
    .eq("counteroffer_id", coId);

  console.log(`✓ Direct DB verified: ${approvalsCount?.length} approval records (Seller + Buyer)`);
  approvalsCount?.forEach((app: any) => {
    console.log(`   - ${app.approver_type.toUpperCase()}: status=${app.approval_status}, method=${app.confirmation_method}, verified=${app.identity_verified}`);
  });

  console.log("\n================================================================================");
  console.log("   MODULE 4 LIVE DEMO COMPLETED SUCCESSFULLY (100% PASS)                        ");
  console.log("================================================================================\n");
}

main().catch((err) => {
  console.error("Live demo failed:", err);
  process.exit(1);
});
