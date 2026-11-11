// src/lib/server/intelligence/analysis-orchestrator.ts
import * as crypto from "crypto";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { retrieveAgreementDocuments } from "./document-retrieval";
import { preprocessDocument, PreprocessedDocument } from "../document-processing";
import { extractDocumentFacts } from "./extraction-service";
import { reconcileCommercialDocuments, ReconciliationServiceResult } from "./reconciliation-service";

export interface StartAnalysisOptions {
  workspaceId: string;
  agreementId: string;
  userId?: string;
  forceNew?: boolean;
}

export interface AnalysisRunProgress {
  runId: string;
  status: string;
  startedAt?: string;
  completedAt?: string;
  errorCode?: string;
  errorMessage?: string;
  findingsCount?: number;
}

/**
 * Computes deterministic input fingerprint for deduplication.
 */
function computeInputFingerprint(
  agreementId: string,
  docHashes: string[],
  promptVersion = "1.0.0"
): string {
  const sorted = [...docHashes].sort().join(":");
  return crypto.createHash("sha256").update(`${agreementId}:${sorted}:${promptVersion}`).digest("hex");
}

/**
 * Orchestrates the full commercial intelligence analysis pipeline.
 */
export async function runCommercialAnalysis(
  options: StartAnalysisOptions
): Promise<{ runId: string; status: string; result?: ReconciliationServiceResult }> {
  const { workspaceId, agreementId, userId, forceNew } = options;

  let adminClient;
  try {
    adminClient = createAdminClient();
  } catch {
    adminClient = createServerSupabaseClient();
  }

  // 1. Stage: retrieving_documents
  const { agreement, linkedPo, documents } = await retrieveAgreementDocuments(
    workspaceId,
    agreementId
  );

  if (!documents || documents.length === 0) {
    throw new Error("No commercial documents found for this agreement to analyze.");
  }

  // 2. Stage: preprocessing
  const preprocessedDocs: PreprocessedDocument[] = [];
  for (const docItem of documents) {
    const preprocessed = await preprocessDocument(
      docItem.documentId,
      docItem.fileName,
      docItem.mimeType,
      docItem.buffer
    );
    // Pass the retrieval-layer classification hint into the preprocessed document
    // so the orchestrator can use it as a fallback when the AI returns an invalid classification.
    preprocessed.classificationHint = docItem.classificationHint;
    preprocessedDocs.push(preprocessed);
  }

  // Compute input fingerprint
  const docHashes = preprocessedDocs.map((d) => d.sha256_hash);
  const fingerprint = computeInputFingerprint(agreementId, docHashes);

  // Check for existing completed run
  if (!forceNew) {
    const { data: existingRun } = await adminClient
      .from("analysis_runs")
      .select("id, status")
      .eq("workspace_id", workspaceId)
      .eq("agreement_id", agreementId)
      .eq("input_fingerprint", fingerprint)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .maybeSingle();

    if (existingRun) {
      return { runId: existingRun.id, status: existingRun.status };
    }
  }

  // Create new analysis run in database
  const { data: newRun, error: runError } = await adminClient
    .from("analysis_runs")
    .insert({
      workspace_id: workspaceId,
      agreement_id: agreementId,
      purchase_order_id: linkedPo?.id || null,
      model_provider: "google",
      model_id: process.env.GEMINI_MODEL || "gemini-3.8-flash",
      prompt_version: "1.0.0",
      input_fingerprint: fingerprint,
      status: "preprocessing",
      initiated_by: userId || null,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (runError || !newRun) {
    throw new Error(`Failed to initialize analysis run: ${runError?.message}`);
  }

  const runId = newRun.id;

  try {
    // 3. Stage: extracting_facts
    await adminClient
      .from("analysis_runs")
      .update({ status: "extracting_facts" })
      .eq("id", runId);

    const documentsWithFacts = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (const preprocessed of preprocessedDocs) {
      const extraction = await extractDocumentFacts(preprocessed);
      if (extraction.inputTokenCount) totalInputTokens += extraction.inputTokenCount;
      if (extraction.outputTokenCount) totalOutputTokens += extraction.outputTokenCount;

      // Normalize document_classification to a valid enum value before writing to DB.
      const VALID_DOC_CLASSIFICATIONS = [
        "master_agreement",
        "amendment",
        "purchase_order",
        "supporting_document",
        "unknown",
      ] as const;
      const rawClassification = extraction.facts.document_classification;
      const safeClassification: (typeof VALID_DOC_CLASSIFICATIONS)[number] =
        VALID_DOC_CLASSIFICATIONS.includes(
          rawClassification as (typeof VALID_DOC_CLASSIFICATIONS)[number]
        )
          ? (rawClassification as (typeof VALID_DOC_CLASSIFICATIONS)[number])
          : preprocessed.classificationHint === "amendment"
          ? "amendment"
          : preprocessed.classificationHint === "purchase_order"
          ? "purchase_order"
          : preprocessed.classificationHint === "supporting_document"
          ? "supporting_document"
          : "master_agreement";

      extraction.facts.document_classification = safeClassification;

      documentsWithFacts.push({
        doc: preprocessed,
        extraction: extraction.facts,
      });

      // Persist document extraction record only when the document_id references
      // an actual registered document in the database (FK constraint enforced).
      // Synthetic demo documents have placeholder IDs that may not be in the documents table.
      const { count: docExists } = await adminClient
        .from("documents")
        .select("*", { count: "exact", head: true })
        .eq("id", preprocessed.document_id);

      if (docExists && docExists > 0) {
        const { error: extInsertError } = await adminClient
          .from("document_extractions")
          .insert({
            workspace_id: workspaceId,
            analysis_run_id: runId,
            document_id: preprocessed.document_id,
            document_version: 1,
            document_classification: safeClassification,
            extracted_facts: extraction.facts as unknown as Record<string, unknown>,
            extraction_status: "extracted",
          });
        if (extInsertError) {
          console.error(
            `[Orchestrator] Failed to persist document_extraction for doc ${preprocessed.document_id}:`,
            extInsertError.message
          );
        }
      } else {
        console.info(
          `[Orchestrator] Skipping document_extraction DB record for doc '${preprocessed.document_id}' — not registered in documents table (synthetic or unregistered document).`
        );
      }
    }

    // 4. Stage: reconciling_terms & validating_evidence
    await adminClient
      .from("analysis_runs")
      .update({ status: "reconciling_terms" })
      .eq("id", runId);

    const reconciliation = await reconcileCommercialDocuments({
      agreementReference: agreement.agreement_reference,
      poNumber: linkedPo?.po_number,
      documentsWithFacts,
    });

    if (reconciliation.inputTokenCount) totalInputTokens += reconciliation.inputTokenCount;
    if (reconciliation.outputTokenCount) totalOutputTokens += reconciliation.outputTokenCount;

    // 5. Stage: saving_results
    await adminClient
      .from("analysis_runs")
      .update({ status: "saving_results" })
      .eq("id", runId);

    for (const finding of reconciliation.validatedFindings) {
      const { data: savedFinding, error: findingInsertError } = await adminClient
        .from("analysis_findings")
        .insert({
          workspace_id: workspaceId,
          analysis_run_id: runId,
          term_key: finding.term_key,
          term_label: finding.term_label,
          finding_type: finding.finding_type,
          severity: finding.severity,
          agreement_value: finding.agreement_value as unknown as Record<string, unknown>,
          amendment_value: finding.amendment_value as unknown as Record<string, unknown>,
          purchase_order_value: finding.purchase_order_value as unknown as Record<string, unknown>,
          explanation: finding.explanation,
          confidence: finding.confidence,
          review_status: "unreviewed",
        })
        .select("id")
        .single();

      if (findingInsertError || !savedFinding) {
        console.error(
          `[Orchestrator] Failed to persist finding '${finding.term_key}':`,
          findingInsertError?.message || "No row returned"
        );
        continue;
      }

      if (savedFinding && finding.validated_evidence) {
        for (const ev of finding.validated_evidence) {
          // Verify if document_id exists in registered database documents before passing FK
          let validDocId: string | null = null;
          if (ev.document_id) {
            const { count: dCount } = await adminClient
              .from("documents")
              .select("*", { count: "exact", head: true })
              .eq("id", ev.document_id);
            if (dCount && dCount > 0) validDocId = ev.document_id;
          }

          const { error: evInsertError } = await adminClient.from("analysis_evidence").insert({
            workspace_id: workspaceId,
            analysis_run_id: runId,
            finding_id: savedFinding.id,
            document_id: validDocId,
            source_ref: ev.source_ref,
            location_type: ev.location_type,
            location: ev.location,
            quote: ev.quote,
            verification_status: ev.verification_status,
            verification_method: ev.verification_method,
          });
          if (evInsertError) {
            console.error(
              `[Orchestrator] Failed to persist evidence for finding '${finding.term_key}':`,
              evInsertError.message
            );
          }
        }
      }
    }
    console.info(
      `[Orchestrator] Saved ${reconciliation.validatedFindings.length} findings for run ${runId}.`
    );

    // 6. Stage: completed
    const finalStatus = reconciliation.validatedFindings.some((f) => f.has_unverified_visual_evidence)
      ? "completed_with_warnings"
      : "completed";

    await adminClient
      .from("analysis_runs")
      .update({
        status: finalStatus,
        input_token_count: totalInputTokens,
        output_token_count: totalOutputTokens,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);

    return {
      runId,
      status: finalStatus,
      result: reconciliation,
    };
  } catch (err: unknown) {
    const errorMsg = (err as Error).message || "Analysis failed";
    console.error(`[AnalysisOrchestrator] Run ${runId} failed:`, errorMsg);

    await adminClient
      .from("analysis_runs")
      .update({
        status: "failed",
        error_code: (err as { code?: string })?.code || "ANALYSIS_FAILED",
        error_message_safe: errorMsg.slice(0, 500),
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);

    throw err;
  }
}
