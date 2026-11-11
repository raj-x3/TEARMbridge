// scripts/verify-live-orchestrator.ts
import * as path from "path";
import * as fs from "fs";

// Load .env.local manually (no dotenv dependency)
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

import { runCommercialAnalysis } from "../src/lib/server/intelligence/analysis-orchestrator";
import { createAdminClient } from "../src/lib/supabase/admin";

async function main() {
  console.log("================================================================================");
  console.log("   TERMBridge Module 3.5 — Live Supabase Intelligence Persistence Test");
  console.log("================================================================================\n");

  const adminClient = createAdminClient();

  // Find AGR-1042
  const { data: agr, error: agrErr } = await adminClient
    .from("commercial_agreements")
    .select("id, workspace_id, agreement_reference, title")
    .eq("agreement_reference", "AGR-1042")
    .single();

  if (agrErr || !agr) throw new Error(`AGR-1042 not found: ${agrErr?.message}`);

  console.log(`Target Agreement: ${agr.agreement_reference} — ${agr.title}`);
  console.log(`Agreement UUID:   ${agr.id}`);
  console.log(`Workspace UUID:   ${agr.workspace_id}\n`);

  console.log("Executing runCommercialAnalysis (force_new=true) with live Gemini 3.8 Flash...");
  const startTime = Date.now();

  const { runId, status, result } = await runCommercialAnalysis({
    workspaceId: agr.workspace_id,
    agreementId: agr.id,
    forceNew: true,
  });

  const durationMs = Date.now() - startTime;
  console.log(`\nAnalysis completed in ${durationMs}ms (${(durationMs/1000).toFixed(1)}s)`);
  console.log(`Run ID: ${runId}`);
  console.log(`Status: ${status}`);
  console.log(`In-memory findings: ${result?.validatedFindings?.length ?? 0}`);

  console.log("\n--- Querying Live Database Records ---");
  let failures = 0;

  // 1. Verify analysis_runs
  const { data: runRecord, error: runError } = await adminClient
    .from("analysis_runs")
    .select("*")
    .eq("id", runId)
    .single();

  if (runError || !runRecord) throw new Error(`Failed to query analysis_runs: ${runError?.message}`);

  if (runRecord.status !== "completed" && runRecord.status !== "completed_with_warnings") {
    console.error(`✗ [FAIL] analysis_runs: status=${runRecord.status}, error=${runRecord.error_message_safe}`);
    failures++;
  } else {
    console.log(`✓ [PASS] analysis_runs record:`);
    console.log(`   - ID:              ${runRecord.id}`);
    console.log(`   - Status:          ${runRecord.status}`);
    console.log(`   - Model ID:        ${runRecord.model_id}`);
    console.log(`   - Input Tokens:    ${runRecord.input_token_count}`);
    console.log(`   - Output Tokens:   ${runRecord.output_token_count}`);
    console.log(`   - Total Tokens:    ${(runRecord.input_token_count || 0) + (runRecord.output_token_count || 0)}`);
    console.log(`   - Fingerprint:     ${runRecord.input_fingerprint}`);
    console.log(`   - Started At:      ${runRecord.started_at}`);
    console.log(`   - Completed At:    ${runRecord.completed_at}`);
    console.log(`   - Workspace ID:    ${runRecord.workspace_id}`);
    console.log(`   - Agreement ID:    ${runRecord.agreement_id}`);
  }

  // 2. Verify document_extractions — 0 is acceptable for synthetic docs (no real document_id FK)
  const { data: extractions } = await adminClient
    .from("document_extractions")
    .select("*")
    .eq("analysis_run_id", runId)
    .order("created_at", { ascending: true });

  const extCount = extractions?.length ?? 0;
  if (extCount === 0) {
    console.log(`\nℹ️  [EXPECTED] document_extractions: 0 records — synthetic documents do not have`);
    console.log(`   registered UUIDs in the documents table, so FK-constrained insertion is correctly skipped.`);
  } else {
    console.log(`\n✓ [PASS] document_extractions (${extCount} records):`);
    for (const ext of extractions!) {
      console.log(`   - type=${ext.document_classification}, status=${ext.extraction_status}`);
    }
  }

  // 3. Verify analysis_findings — MUST be > 0
  const { data: findings, error: findError } = await adminClient
    .from("analysis_findings")
    .select("*")
    .eq("analysis_run_id", runId)
    .eq("workspace_id", agr.workspace_id)
    .order("created_at", { ascending: true });

  if (findError || !findings) {
    console.error(`✗ [FAIL] analysis_findings query failed: ${findError?.message}`);
    failures++;
  } else if (findings.length === 0) {
    console.error(`✗ [FAIL] analysis_findings: 0 records — reconciliation produced no persisted findings.`);
    failures++;
  } else {
    console.log(`\n✓ [PASS] analysis_findings (${findings.length} records):`);
    for (const f of findings) {
      const wsMatch = f.workspace_id === agr.workspace_id ? "✓ws" : "✗ws";
      const runMatch = f.analysis_run_id === runId ? "✓run" : "✗run";
      console.log(`   - [${f.severity.toUpperCase()}] ${wsMatch} ${runMatch} ${f.term_key}: ${f.term_label} (${f.finding_type})`);
      console.log(`     ${f.explanation.slice(0, 100)}`);
    }
  }

  // 4. Verify analysis_evidence
  const { data: evidence, error: evError } = await adminClient
    .from("analysis_evidence")
    .select("*")
    .eq("analysis_run_id", runId)
    .eq("workspace_id", agr.workspace_id)
    .order("created_at", { ascending: true });

  if (evError || !evidence) {
    console.error(`✗ [FAIL] analysis_evidence query failed: ${evError?.message}`);
    failures++;
  } else {
    console.log(`\n✓ [PASS] analysis_evidence (${evidence.length} records):`);
    for (const ev of evidence) {
      const wsMatch = ev.workspace_id === agr.workspace_id ? "✓ws" : "✗ws";
      const runMatch = ev.analysis_run_id === runId ? "✓run" : "✗run";
      console.log(`   - [${ev.verification_status}] ${wsMatch} ${runMatch} ${ev.source_ref} (${ev.location_type}): "${ev.quote?.slice(0, 55)}..."`);
    }

    // Evidence verification breakdown
    if (evidence.length > 0) {
      type EvRow = { verification_status: string };
      const verifiedExact = (evidence as EvRow[]).filter(e => e.verification_status === "verified_exact").length;
      const verifiedNorm  = (evidence as EvRow[]).filter(e => e.verification_status === "verified_normalized").length;
      const unverified    = (evidence as EvRow[]).filter(e => e.verification_status === "unverified").length;
      const visual        = (evidence as EvRow[]).filter(e => e.verification_status === "visually_located_unverified").length;
      const notFound      = (evidence as EvRow[]).filter(e => e.verification_status === "not_found").length;
      console.log(`\n   Evidence verification breakdown:`);
      console.log(`     verified_exact:                ${verifiedExact}`);
      console.log(`     verified_normalized:            ${verifiedNorm}`);
      console.log(`     unverified:                     ${unverified}`);
      console.log(`     visually_located_unverified:    ${visual}`);
      console.log(`     not_found:                      ${notFound}`);
    }
  }

  console.log("\n================================================================================");
  if (failures === 0) {
    console.log("   RESULT: PASS — Live persistence verified against remote Supabase.");
  } else {
    console.log(`   RESULT: FAIL — ${failures} persistence failure(s) detected.`);
  }
  console.log("================================================================================");

  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
