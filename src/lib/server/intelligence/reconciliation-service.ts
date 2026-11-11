// src/lib/server/intelligence/reconciliation-service.ts
import { PreprocessedDocument } from "../document-processing/source-references";
import { generateStructuredJson, isGeminiConfigured, GeminiError } from "../ai/gemini";
import { buildCommercialReconciliationPrompt } from "../ai/prompts/commercial-reconciliation";
import {
  MultiDocumentAnalysisResult,
  MultiDocumentAnalysisResultSchema,
  ReconciliationFinding,
} from "../ai/schemas/commercial-analysis";
import { ExtractedDocumentFacts } from "../ai/schemas/document-extraction";
import { validateAllFindingsEvidence, ValidatedFinding } from "./evidence-validator";
import {
  validatePurchaseOrderArithmetic,
  calculatePaymentTermVarianceDays,
} from "./commercial-validator";

export interface ReconciliationServiceResult {
  analysis: MultiDocumentAnalysisResult;
  validatedFindings: ValidatedFinding[];
  arithmeticValidation: ReturnType<typeof validatePurchaseOrderArithmetic>;
  inputTokenCount?: number;
  outputTokenCount?: number;
  isModelGenerated: boolean;
}

function normalizeRawFinding(raw: Record<string, unknown>): ReconciliationFinding {
  const termCategory = raw.term_category || raw.category || raw.term;
  const termKey = String(raw.term_key || termCategory || "commercial_term")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_");

  const termLabel = String(
    raw.term_label ||
    raw.label ||
    (termCategory
      ? String(termCategory).replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
      : "Commercial Term")
  );

  let findingType: ReconciliationFinding["finding_type"] = "matched";
  const rawType = String(raw.finding_type || raw.status || "").toLowerCase();
  if (rawType.includes("conflict") || rawType.includes("discrepan") || rawType.includes("mismatch")) {
    findingType = "conflict";
  } else if (rawType.includes("missing_in_po") || rawType.includes("missing_in_purchase")) {
    findingType = "missing_in_purchase_order";
  } else if (rawType.includes("missing_in_agr") || rawType.includes("missing_in_agreement")) {
    findingType = "missing_in_agreement";
  } else if (rawType.includes("ambigu")) {
    findingType = "ambiguous";
  } else if (rawType.includes("unsupport")) {
    findingType = "unsupported";
  } else if (rawType.includes("unverif")) {
    findingType = "unverifiable";
  } else if (rawType.includes("match")) {
    findingType = "matched";
  }

  let severity: ReconciliationFinding["severity"] = "informational";
  const rawSev = String(raw.severity || "").toLowerCase();
  if (["critical", "high", "medium", "low", "informational"].includes(rawSev)) {
    severity = rawSev as ReconciliationFinding["severity"];
  } else if (findingType === "conflict") {
    severity = "high";
  }

  const agreementVal = raw.agreement_value
    ? (typeof raw.agreement_value === "object" ? (raw.agreement_value as Record<string, unknown>) : { value: String(raw.agreement_value) })
    : (raw.master_agreement_term ? { value: String(raw.master_agreement_term) } : null);

  const amendmentVal = raw.amendment_value
    ? (typeof raw.amendment_value === "object" ? (raw.amendment_value as Record<string, unknown>) : { value: String(raw.amendment_value) })
    : (raw.operative_term ? { value: String(raw.operative_term) } : null);

  const poVal = raw.purchase_order_value
    ? (typeof raw.purchase_order_value === "object" ? (raw.purchase_order_value as Record<string, unknown>) : { value: String(raw.purchase_order_value) })
    : (raw.purchase_order_term ? { value: String(raw.purchase_order_term) } : null);

  const explanation = String(raw.explanation || raw.description || raw.reason || "Reconciled commercial term.");

  const evidence = Array.isArray(raw.evidence)
    ? raw.evidence.map((ev: Record<string, unknown>) => ({
        source_ref: String(ev.source_ref || ev.ref || ""),
        quote: String(ev.quote || ev.text || ""),
        location_type: (ev.location_type as "pdf_page") || "txt_line",
        location: (ev.location as Record<string, unknown>) || {},
      }))
    : [];

  return {
    term_key: termKey,
    term_label: termLabel,
    finding_type: findingType,
    severity,
    agreement_value: agreementVal as ReconciliationFinding["agreement_value"],
    amendment_value: amendmentVal as ReconciliationFinding["amendment_value"],
    purchase_order_value: poVal as ReconciliationFinding["purchase_order_value"],
    explanation,
    confidence: typeof raw.confidence === "number" ? raw.confidence : 0.9,
    evidence,
  };
}

/**
 * Executes multi-document commercial reconciliation and independent evidence validation.
 */
export async function reconcileCommercialDocuments(params: {
  agreementReference: string;
  poNumber?: string;
  documentsWithFacts: Array<{
    doc: PreprocessedDocument;
    extraction: ExtractedDocumentFacts;
  }>;
}): Promise<ReconciliationServiceResult> {
  if (!isGeminiConfigured()) {
    throw new GeminiError(
      "Gemini API key is not configured. Set GEMINI_API_KEY in server environment to enable commercial reconciliation.",
      "NOT_CONFIGURED",
      503
    );
  }

  const { systemInstruction, prompt } = buildCommercialReconciliationPrompt({
    agreementReference: params.agreementReference,
    poNumber: params.poNumber,
    documents: params.documentsWithFacts,
  });

  const result = await generateStructuredJson<MultiDocumentAnalysisResult>({
    prompt,
    systemInstruction,
  });

  const parsed = MultiDocumentAnalysisResultSchema.safeParse(result.data);
  let analysis: MultiDocumentAnalysisResult;

  if (parsed.success && parsed.data.findings && parsed.data.findings.length > 0) {
    analysis = parsed.data;
  } else {
    // Normalization layer: build conforming structure from raw AI response
    const raw = (result.data || {}) as Record<string, unknown>;
    const rawFindings: unknown[] = Array.isArray(raw.findings)
      ? raw.findings
      : Array.isArray(raw.reconciliation_findings)
      ? raw.reconciliation_findings
      : Array.isArray(raw.terms)
      ? raw.terms
      : Array.isArray(raw.discrepancies)
      ? raw.discrepancies
      : Array.isArray(result.data)
      ? (result.data as unknown[])
      : [];
    const rawSummary = (raw.summary || {}) as Record<string, unknown>;
    const rawFramework = (raw.operative_framework || {}) as Record<string, unknown>;

    const normalizedFindings = rawFindings.map((f: unknown) =>
      normalizeRawFinding((f && typeof f === "object" ? f : {}) as Record<string, unknown>)
    );

    const conflictCount = normalizedFindings.filter((f) => f.finding_type === "conflict").length;
    const ambiguousCount = normalizedFindings.filter((f) => f.finding_type === "ambiguous").length;
    const matchedCount = normalizedFindings.filter((f) => f.finding_type === "matched").length;
    const missingCount = normalizedFindings.filter(
      (f) =>
        f.finding_type === "missing_in_purchase_order" ||
        f.finding_type === "missing_in_agreement"
    ).length;

    let overallStatus: "matched" | "discrepancies_detected" | "needs_clarification" | "ambiguous_amendments" = "matched";
    if (conflictCount > 0) overallStatus = "discrepancies_detected";
    else if (ambiguousCount > 0) overallStatus = "ambiguous_amendments";
    else if (missingCount > 0) overallStatus = "needs_clarification";

    analysis = {
      agreement_reference: String(raw.agreement_reference || params.agreementReference),
      po_number: raw.po_number ? String(raw.po_number) : params.poNumber,
      summary: {
        overall_status: overallStatus,
        headline: String(
          rawSummary.headline ||
            (conflictCount > 0
              ? `${conflictCount} commercial discrepancy detected between contract and purchase order.`
              : "Commercial terms reconciled across agreement documents.")
        ),
        matched_count: Number(rawSummary.matched_count ?? matchedCount),
        conflict_count: Number(rawSummary.conflict_count ?? conflictCount),
        missing_count: Number(rawSummary.missing_count ?? missingCount),
        ambiguous_count: Number(rawSummary.ambiguous_count ?? ambiguousCount),
      },
      operative_framework: {
        master_agreement_id: String(rawFramework.master_agreement_id || params.agreementReference),
        applicable_amendments: Array.isArray(rawFramework.applicable_amendments)
          ? (rawFramework.applicable_amendments as string[])
          : [],
        unresolved_amendments: Array.isArray(rawFramework.unresolved_amendments)
          ? (rawFramework.unresolved_amendments as string[])
          : [],
        amendment_reasoning: rawFramework.amendment_reasoning
          ? String(rawFramework.amendment_reasoning)
          : undefined,
      },
      findings: normalizedFindings,
    };
  }

  // 1. Independent Evidence Validation
  const allDocs = params.documentsWithFacts.map((d) => d.doc);
  const validatedFindings = validateAllFindingsEvidence(analysis.findings || [], allDocs);

  // 2. Deterministic Arithmetic Validation on PO line items
  const poDoc = params.documentsWithFacts.find(
    (d) => d.extraction.document_classification === "purchase_order"
  );
  const poDetails = poDoc?.extraction.purchase_order_details;
  const arithmeticValidation = validatePurchaseOrderArithmetic({
    subtotal: poDetails?.subtotal,
    total_amount: poDetails?.total_amount,
    line_items: poDetails?.line_items,
  });

  // 3. Post-process payment term difference if present
  for (const finding of validatedFindings) {
    if (finding.term_key === "payment_terms" && !finding.difference_summary) {
      const contractTerm = finding.amendment_value?.value || finding.agreement_value?.value;
      const poTerm = finding.purchase_order_value?.value;
      const { varianceDays } = calculatePaymentTermVarianceDays(contractTerm, poTerm);
      if (varianceDays !== undefined && varianceDays !== 0) {
        finding.difference_summary = `Payment term difference: ${Math.abs(varianceDays)} days ${varianceDays > 0 ? "extended" : "shortened"}`;
      }
    }
  }

  return {
    analysis,
    validatedFindings,
    arithmeticValidation,
    inputTokenCount: result.inputTokenCount,
    outputTokenCount: result.outputTokenCount,
    isModelGenerated: true,
  };
}
