// src/lib/server/intelligence/evidence-validator.ts
import { PreprocessedDocument, ContentBlock } from "../document-processing/source-references";
import { ReconciliationFinding } from "../ai/schemas/commercial-analysis";

export type VerificationStatus =
  | "verified_exact"
  | "verified_normalized"
  | "visually_located_unverified"
  | "not_found"
  | "invalid_source";

export type VerificationMethod = "exact" | "normalized_whitespace" | "visual_native" | "none";

export interface ValidatedEvidenceItem {
  document_id?: string;
  source_ref: string;
  location_type: string;
  location: Record<string, unknown>;
  quote: string;
  verification_status: VerificationStatus;
  verification_method: VerificationMethod;
  failure_reason?: string;
}

export interface ValidatedFinding extends ReconciliationFinding {
  validated_evidence: ValidatedEvidenceItem[];
  all_evidence_verified: boolean;
  has_unverified_visual_evidence: boolean;
}

/**
 * Normalizes text for comparison by collapsing whitespace and punctuation variations.
 */
function normalizeForComparison(str: string): string {
  return str
    .replace(/\s+/g, " ")
    .replace(/[“”"]/g, '"')
    .replace(/[‘’']/g, "'")
    .trim()
    .toLowerCase();
}

/**
 * Validates a single evidence citation against the preprocessed documents.
 */
export function validateEvidenceItem(
  citation: {
    document_id?: string;
    source_ref: string;
    location_type?: string;
    location?: Record<string, unknown>;
    quote: string;
  },
  documentsMap: Map<string, PreprocessedDocument>,
  allBlocksMap: Map<string, { block: ContentBlock; doc: PreprocessedDocument }>
): ValidatedEvidenceItem {
  const quote = citation.quote || "";
  const sourceRef = citation.source_ref;

  // 1. Locate the referenced content block
  const blockEntry = allBlocksMap.get(sourceRef);

  if (!blockEntry) {
    return {
      document_id: citation.document_id,
      source_ref: sourceRef,
      location_type: citation.location_type || "pdf_page",
      location: citation.location || {},
      quote,
      verification_status: "invalid_source",
      verification_method: "none",
      failure_reason: `Source reference '${sourceRef}' does not exist in any preprocessed document block.`,
    };
  }

  const { block, doc } = blockEntry;
  const docId = doc.document_id;
  const locationType = block.location_type;
  const location = { ...block.location, ...citation.location };

  // 2. Handle scanned / visual document with no text
  if (doc.is_scanned_without_text) {
    return {
      document_id: docId,
      source_ref: sourceRef,
      location_type: locationType,
      location,
      quote,
      verification_status: "visually_located_unverified",
      verification_method: "visual_native",
      failure_reason: "Document is visual/scanned without verifiable extracted text. Requires human inspection.",
    };
  }

  // 3. Test exact quotation match
  if (quote && block.text.includes(quote)) {
    return {
      document_id: docId,
      source_ref: sourceRef,
      location_type: locationType,
      location,
      quote,
      verification_status: "verified_exact",
      verification_method: "exact",
    };
  }

  // 4. Test normalized whitespace match
  const normalizedBlock = normalizeForComparison(block.text);
  const normalizedQuote = normalizeForComparison(quote);

  if (quote && normalizedQuote.length > 5 && normalizedBlock.includes(normalizedQuote)) {
    return {
      document_id: docId,
      source_ref: sourceRef,
      location_type: locationType,
      location,
      quote,
      verification_status: "verified_normalized",
      verification_method: "normalized_whitespace",
    };
  }

  // 5. Quote not found in referenced block
  return {
    document_id: docId,
    source_ref: sourceRef,
    location_type: locationType,
    location,
    quote,
    verification_status: "not_found",
    verification_method: "none",
    failure_reason: `Quotation "${quote.slice(0, 50)}..." could not be located in block ${sourceRef}.`,
  };
}

/**
 * Validates all evidence items across all findings produced by the AI reconciliation engine.
 */
export function validateAllFindingsEvidence(
  findings: ReconciliationFinding[],
  documents: PreprocessedDocument[]
): ValidatedFinding[] {
  const documentsMap = new Map<string, PreprocessedDocument>();
  const allBlocksMap = new Map<string, { block: ContentBlock; doc: PreprocessedDocument }>();

  for (const doc of documents) {
    documentsMap.set(doc.document_id, doc);
    for (const block of doc.blocks) {
      allBlocksMap.set(block.source_ref, { block, doc });
    }
  }

  return findings.map((finding) => {
    const validatedItems = (finding.evidence || []).map((item) =>
      validateEvidenceItem(item, documentsMap, allBlocksMap)
    );

    const allVerified =
      validatedItems.length > 0 &&
      validatedItems.every(
        (i) => i.verification_status === "verified_exact" || i.verification_status === "verified_normalized"
      );

    const hasVisual = validatedItems.some(
      (i) => i.verification_status === "visually_located_unverified"
    );

    return {
      ...finding,
      validated_evidence: validatedItems,
      all_evidence_verified: allVerified,
      has_unverified_visual_evidence: hasVisual,
    };
  });
}
