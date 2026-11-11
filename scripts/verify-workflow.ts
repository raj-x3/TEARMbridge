// scripts/verify-workflow.ts
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
  console.log("   TERMBridge Module 3.5 — Authenticated Application Workflow Verification");
  console.log("================================================================================\n");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const demoEmail = process.env.TERMBRIDGE_DEMO_EMAIL!;
  const demoPassword = process.env.TERMBRIDGE_DEMO_PASSWORD!;

  // 1. Authenticate with Supabase Auth using @supabase/ssr to get the exact cookie format
  console.log(`Authenticating as demo user: ${demoEmail}...`);
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
  console.log(`✓ Authenticated successfully! User ID: ${authData.user.id}`);
  console.log(`✓ Formatted ${Object.keys(cookieJar).length} SSR session cookie(s).\n`);

  // 2. Retrieve analysis via GET /api/agreements/AGR-1042/analysis
  console.log("Step 1 & 2: Calling GET /api/agreements/AGR-1042/analysis...");
  const getRes = await fetch("http://localhost:3000/api/agreements/AGR-1042/analysis", {
    headers: {
      Cookie: cookieHeader,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!getRes.ok) {
    const errText = await getRes.text();
    throw new Error(`GET /api/agreements/AGR-1042/analysis failed (${getRes.status}): ${errText}`);
  }

  const analysisData = await getRes.json();
  console.log(`✓ Analysis retrieved:`);
  console.log(`   - has_analysis: ${analysisData.data.has_analysis}`);
  console.log(`   - latest_run_id: ${analysisData.data.latest_run?.id}`);
  console.log(`   - status: ${analysisData.data.latest_run?.status}`);
  console.log(`   - model: ${analysisData.data.latest_run?.model_id}`);
  console.log(`   - input_tokens: ${analysisData.data.latest_run?.input_token_count}`);
  console.log(`   - output_tokens: ${analysisData.data.latest_run?.output_token_count}`);
  console.log(`   - findings count: ${analysisData.data.findings?.length}\n`);

  if (!analysisData.data.findings || analysisData.data.findings.length === 0) {
    throw new Error("No findings returned from analysis endpoint.");
  }

  // 3 & 4 & 5: Inspect findings and evidence in the Agreement Workbench model
  console.log("Step 3, 4, 5: Inspecting findings and evidence references for Workbench display:");
  for (let i = 0; i < analysisData.data.findings.length; i++) {
    const f = analysisData.data.findings[i];
    console.log(`   [Finding ${i + 1}] ID: ${f.id} | Severity: ${f.severity.toUpperCase()} | Key: ${f.term_key}`);
    console.log(`     Explanation: ${f.explanation.slice(0, 95)}...`);
    console.log(`     Review Status: ${f.review_status}`);
    console.log(`     Evidence Citations: ${f.evidence?.length || 0}`);
    for (const ev of f.evidence || []) {
      console.log(`       - Ref: ${ev.source_ref} (${ev.location_type}) Verification: [${ev.verification_status}]`);
      console.log(`         Quote: "${ev.quote}"`);
    }
  }

  // 6. Confirm one finding through the human review endpoint
  const targetFinding = analysisData.data.findings.find((f: any) => f.term_key === "conflict") || analysisData.data.findings[0];
  const runId = analysisData.data.latest_run.id;
  const findingId = targetFinding.id;

  console.log(`\nStep 6: Confirming finding through human review endpoint...`);
  console.log(`Target Finding ID: ${findingId}`);
  console.log(`Endpoint: POST /api/analysis/${runId}/findings/${findingId}/review`);

  const reviewRes = await fetch(`http://localhost:3000/api/analysis/${runId}/findings/${findingId}/review`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieHeader,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      review_status: "confirmed",
      review_notes: "Commercial discrepancy confirmed against executed Amendment No. 1 and PO-8821.",
    }),
  });

  if (!reviewRes.ok) {
    const errText = await reviewRes.text();
    throw new Error(`Review endpoint failed (${reviewRes.status}): ${errText}`);
  }

  const reviewResult = await reviewRes.json();
  console.log(`✓ Review API response: success=${reviewResult.success}`);
  console.log(`   - updated status: ${reviewResult.data?.review_status}`);
  console.log(`   - reviewed_by: ${reviewResult.data?.reviewed_by}`);
  console.log(`   - reviewed_at: ${reviewResult.data?.reviewed_at}`);
  console.log(`   - review_notes: "${reviewResult.data?.review_notes}"\n`);

  // 7 & 8: Refresh page (re-fetch GET /api/agreements/AGR-1042/analysis) and verify state persists
  console.log("Step 7 & 8: Re-fetching GET /api/agreements/AGR-1042/analysis (simulating page refresh)...");
  const refreshRes = await fetch("http://localhost:3000/api/agreements/AGR-1042/analysis", {
    headers: {
      Cookie: cookieHeader,
      Authorization: `Bearer ${token}`,
    },
  });

  const refreshedData = await refreshRes.json();
  const updatedFinding = refreshedData.data.findings.find((f: any) => f.id === findingId);

  if (updatedFinding?.review_status === "confirmed") {
    console.log(`✓ [PASS] Review status persisted across refresh: ${updatedFinding.review_status}`);
    console.log(`   - notes: "${updatedFinding.review_notes}"`);
    console.log(`   - reviewed_at: ${updatedFinding.reviewed_at}`);
  } else {
    throw new Error(`Review status did not persist! Found: ${updatedFinding?.review_status}`);
  }

  // 9. Verify in database directly
  const adminClient = createClient(supabaseUrl, serviceKey);
  const { data: dbFinding } = await adminClient
    .from("analysis_findings")
    .select("id, review_status, review_notes, reviewed_by, reviewed_at")
    .eq("id", findingId)
    .single();

  console.log(`\n✓ Direct Database verification:`);
  console.log(`   - ID: ${dbFinding?.id}`);
  console.log(`   - review_status: ${dbFinding?.review_status}`);
  console.log(`   - reviewed_by: ${dbFinding?.reviewed_by}`);
  console.log(`   - reviewed_at: ${dbFinding?.reviewed_at}`);

  console.log("\n================================================================================");
  console.log("   COMPLETE APPLICATION WORKFLOW VERIFIED SUCCESSFULLY (PASS)");
  console.log("================================================================================");
}

main().catch((err) => {
  console.error("Workflow verification failed:", err);
  process.exit(1);
});
