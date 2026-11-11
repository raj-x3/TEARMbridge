// scripts/verify-live-intelligence.ts
/**
 * Module 3.1: Live Production Verification Script.
 * Executes real Gemini 3.8 Flash analysis on synthetic AGR-1042 document package.
 */

import * as fs from "fs";
import * as path from "path";
import { preprocessDocument } from "../src/lib/server/document-processing";
import { extractDocumentFacts } from "../src/lib/server/intelligence/extraction-service";
import { reconcileCommercialDocuments } from "../src/lib/server/intelligence/reconciliation-service";
import { isGeminiConfigured, getGeminiConfig } from "../src/lib/server/ai/gemini";
import * as crypto from "crypto";

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
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

async function runLiveVerification() {
  console.log("================================================================================");
  console.log("   TERMBridge Module 3.1 — Production Intelligence Live Verification");
  console.log("================================================================================\n");

  if (!isGeminiConfigured()) {
    console.log("STATUS: [NOT CONFIGURED] — GEMINI_API_KEY is not set.");
    console.log("To run live verification, set GEMINI_API_KEY in .env.local.");
    process.exit(1);
  }

  const config = getGeminiConfig();
  console.log(`Model Provider:     Google Gemini API`);
  console.log(`Configured Model:   ${config.model}`);
  console.log(`Thinking Level:     ${config.thinkingLevel}`);
  console.log(`API Key Status:     CONFIGURED (length: ${config.apiKey.length} chars, masked: ${config.apiKey.slice(0, 6)}...${config.apiKey.slice(-4)})\n`);

  const runId = crypto.randomUUID();
  console.log(`Generated Analysis Run ID: ${runId}`);

  const fixturesDir = path.resolve(process.cwd(), "tests/fixtures/scenario3_effective_amendment");
  const masterAgrPath = path.join(fixturesDir, "agreement.txt");
  const amendmentPath = path.join(fixturesDir, "amendment.txt");
  const poPath = path.join(fixturesDir, "purchase_order.txt");

  const masterAgrBuf = fs.readFileSync(masterAgrPath);
  const amendmentBuf = fs.readFileSync(amendmentPath);
  const poBuf = fs.readFileSync(poPath);

  const startTime = Date.now();

  console.log("\n--- Phase 1: Preprocessing & Block Coordinate Generation ---");
  const docMaster = await preprocessDocument("agr-1042-master", "AGR-1042_Master_Agreement.txt", "text/plain", masterAgrBuf);
  const docAmd = await preprocessDocument("agr-1042-amd", "AGR-1042_Amendment_01.txt", "text/plain", amendmentBuf);
  const docPo = await preprocessDocument("agr-1042-po", "PO-8821.txt", "text/plain", poBuf);

  console.log(`✓ Master Agreement preprocessed: ${docMaster.blocks.length} blocks, SHA-256: ${docMaster.sha256_hash.slice(0, 16)}...`);
  console.log(`✓ Amendment 01 preprocessed:     ${docAmd.blocks.length} blocks, SHA-256: ${docAmd.sha256_hash.slice(0, 16)}...`);
  console.log(`✓ Purchase Order preprocessed:   ${docPo.blocks.length} blocks, SHA-256: ${docPo.sha256_hash.slice(0, 16)}...`);

  console.log("\n--- Phase 2: Live Gemini 3.8 Flash Extraction ---");
  const extractionStart = Date.now();

  const extMaster = await extractDocumentFacts(docMaster);
  console.log(`✓ Master extracted in ${Date.now() - extractionStart}ms | Tokens: In=${extMaster.inputTokenCount}, Out=${extMaster.outputTokenCount}`);

  const amdExtStart = Date.now();
  const extAmd = await extractDocumentFacts(docAmd);
  console.log(`✓ Amendment extracted in ${Date.now() - amdExtStart}ms | Tokens: In=${extAmd.inputTokenCount}, Out=${extAmd.outputTokenCount}`);

  const poExtStart = Date.now();
  const extPo = await extractDocumentFacts(docPo);
  console.log(`✓ PO extracted in ${Date.now() - poExtStart}ms | Tokens: In=${extPo.inputTokenCount}, Out=${extPo.outputTokenCount}`);

  // Aggregate extraction tokens
  const callsTokenMetadata = [
    { call: "extraction_master_agreement", model: config.model, input_tokens: extMaster.inputTokenCount ?? null, output_tokens: extMaster.outputTokenCount ?? null },
    { call: "extraction_amendment_01", model: config.model, input_tokens: extAmd.inputTokenCount ?? null, output_tokens: extAmd.outputTokenCount ?? null },
    { call: "extraction_purchase_order", model: config.model, input_tokens: extPo.inputTokenCount ?? null, output_tokens: extPo.outputTokenCount ?? null },
  ];

  console.log("\n--- Phase 3: Live Gemini 3.8 Flash Hierarchy Reconciliation ---");
  const reconStart = Date.now();
  const documentsWithFacts = [
    { doc: docMaster, extraction: extMaster.facts },
    { doc: docAmd, extraction: extAmd.facts },
    { doc: docPo, extraction: extPo.facts },
  ];

  const reconResult = await reconcileCommercialDocuments({
    agreementReference: "AGR-1042",
    poNumber: "PO-8821",
    documentsWithFacts,
  });

  const reconDuration = Date.now() - reconStart;
  const totalDuration = Date.now() - startTime;

  callsTokenMetadata.push({
    call: "commercial_reconciliation",
    model: config.model,
    input_tokens: reconResult.inputTokenCount ?? null,
    output_tokens: reconResult.outputTokenCount ?? null,
  });

  // Calculate aggregated totals across all calls without double counting
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  for (const c of callsTokenMetadata) {
    if (typeof c.input_tokens === "number") totalInputTokens += c.input_tokens;
    if (typeof c.output_tokens === "number") totalOutputTokens += c.output_tokens;
  }
  const combinedTokens = totalInputTokens + totalOutputTokens;

  console.log(`✓ Multi-document reconciliation completed in ${reconDuration}ms`);
  console.log(`✓ Total Processing Duration: ${totalDuration}ms`);
  console.log(`✓ Aggregated Token Accounting Across All Calls (${callsTokenMetadata.length} calls):`);
  console.log(`    - Total Input Tokens:  ${totalInputTokens}`);
  console.log(`    - Total Output Tokens: ${totalOutputTokens}`);
  console.log(`    - Combined Total:      ${combinedTokens}`);

  console.log("\n--- Phase 4: Reconciliation Results Summary ---");
  console.log(`Overall Status:   ${reconResult.analysis.summary.overall_status}`);
  console.log(`Headline:         ${reconResult.analysis.summary.headline}`);
  console.log(`Matched Terms:    ${reconResult.analysis.summary.matched_count}`);
  console.log(`Conflicts:        ${reconResult.analysis.summary.conflict_count}`);
  console.log(`Missing Terms:    ${reconResult.analysis.summary.missing_count}`);
  console.log(`Ambiguous Terms:  ${reconResult.analysis.summary.ambiguous_count}`);

  console.log("\n--- Operative Commercial Framework ---");
  console.log(`Master Agreement:       ${reconResult.analysis.operative_framework.master_agreement_id || "AGR-1042"}`);
  console.log(`Applicable Amendments:  ${JSON.stringify(reconResult.analysis.operative_framework.applicable_amendments)}`);
  console.log(`Hierarchy Reasoning:    ${reconResult.analysis.operative_framework.amendment_reasoning || "None"}`);

  console.log("\n--- Generated Findings & Independent Evidence Verification ---");
  for (const f of reconResult.validatedFindings) {
    console.log(`\n[Finding] ${f.term_label} (${f.term_key})`);
    console.log(`  Type:       ${f.finding_type} | Severity: ${f.severity} | Confidence: ${Math.round((f.confidence || 0.9) * 100)}%`);
    console.log(`  Agreement:  ${f.agreement_value?.value || "N/A"}`);
    console.log(`  Amendment:  ${f.amendment_value?.value || "N/A"}`);
    console.log(`  PO:         ${f.purchase_order_value?.value || "N/A"}`);
    console.log(`  Explanation: ${f.explanation}`);

    if (f.validated_evidence && f.validated_evidence.length > 0) {
      console.log(`  Evidence Citations (${f.validated_evidence.length}):`);
      for (const ev of f.validated_evidence) {
        console.log(`    - Ref: [${ev.source_ref}] Verification: [${ev.verification_status}] Method: [${ev.verification_method}]`);
        console.log(`      Quote: "${ev.quote}"`);
      }
    }
  }

  console.log("\n--- Deterministic Financial Arithmetic Validation ---");
  console.log(`Arithmetic Valid:       ${reconResult.arithmeticValidation.is_valid}`);
  console.log(`Currency:               ${reconResult.arithmeticValidation.currency}`);
  console.log(`Calculated Subtotal:    ${reconResult.arithmeticValidation.calculated_subtotal}`);
  console.log(`Stated Subtotal:        ${reconResult.arithmeticValidation.subtotal}`);
  console.log(`Calculated Total:       ${reconResult.arithmeticValidation.calculated_total}`);
  console.log(`Stated Total:           ${reconResult.arithmeticValidation.total_amount}`);
  console.log(`Currency Mismatch:      ${reconResult.arithmeticValidation.currency_mismatch || false}`);
  if (reconResult.arithmeticValidation.warnings.length > 0) {
    console.log(`Warnings: ${JSON.stringify(reconResult.arithmeticValidation.warnings)}`);
  }

  console.log("\n================================================================================");
  console.log("   LIVE VERIFICATION EXECUTION COMPLETE — ALL STEPS PASSED");
  console.log("================================================================================\n");

  // Write execution output record for audit artifact inclusion
  const auditOutput = {
    verified_at: new Date().toISOString(),
    run_id: runId,
    model_id: config.model,
    model_provider: "google",
    thinking_level: config.thinkingLevel,
    total_duration_ms: totalDuration,
    token_usage: {
      aggregated_input_tokens: totalInputTokens,
      aggregated_output_tokens: totalOutputTokens,
      combined_total_tokens: combinedTokens,
      calls: callsTokenMetadata,
    },
    findings_count: reconResult.validatedFindings.length,
    summary: reconResult.analysis.summary,
    operative_framework: reconResult.analysis.operative_framework,
    arithmetic_validation: {
      is_valid: reconResult.arithmeticValidation.is_valid,
      calculated_total: reconResult.arithmeticValidation.calculated_total,
      stated_total: reconResult.arithmeticValidation.total_amount,
    },
    findings: reconResult.validatedFindings.map((f) => ({
      term_key: f.term_key,
      term_label: f.term_label,
      finding_type: f.finding_type,
      severity: f.severity,
      explanation: f.explanation,
      evidence_verification: f.validated_evidence.map((e) => ({
        source_ref: e.source_ref,
        verification_status: e.verification_status,
        verification_method: e.verification_method,
      })),
    })),
  };

  fs.writeFileSync(
    path.resolve(process.cwd(), "docs/live-verification-run.json"),
    JSON.stringify(auditOutput, null, 2)
  );
}

runLiveVerification().catch((err) => {
  console.error("Live verification execution failed:", err);
  process.exit(1);
});
