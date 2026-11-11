// src/lib/server/ai/schemas/commercial-analysis.ts
import { z } from "zod";

export const EvidenceCitationSchema = z.object({
  document_id: z.string().optional(),
  source_ref: z.string().describe("Exact source reference from provided blocks, e.g. DOC_xxx_PAGE_001"),
  location_type: z
    .enum([
      "pdf_page",
      "docx_paragraph",
      "docx_table",
      "xlsx_cell",
      "csv_cell",
      "txt_line",
      "visual_location",
    ])
    .default("pdf_page"),
  location: z.record(z.string(), z.unknown()).default({}),
  quote: z.string().describe("Verbatim excerpt from the source text"),
});

export const ReconciliationFindingSchema = z.object({
  term_key: z.string(),
  term_label: z.string(),
  finding_type: z.enum([
    "matched",
    "conflict",
    "missing_in_purchase_order",
    "missing_in_agreement",
    "ambiguous",
    "unsupported",
    "unverifiable",
  ]),
  severity: z.enum(["critical", "high", "medium", "low", "informational"]),
  agreement_value: z
    .object({
      value: z.string(),
      clause: z.string().optional(),
      quote: z.string().optional(),
      source_ref: z.string().optional(),
    })
    .nullable()
    .optional(),
  amendment_value: z
    .object({
      value: z.string(),
      amendment_id: z.string().optional(),
      effective_date: z.string().optional(),
      quote: z.string().optional(),
      source_ref: z.string().optional(),
    })
    .nullable()
    .optional(),
  purchase_order_value: z
    .object({
      value: z.string(),
      quote: z.string().optional(),
      source_ref: z.string().optional(),
    })
    .nullable()
    .optional(),
  explanation: z.string().describe("Clear, objective description of the term analysis and any variance"),
  difference_summary: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).default(0.9),
  evidence: z.array(EvidenceCitationSchema).default([]),
});

export const MultiDocumentAnalysisResultSchema = z.object({
  agreement_reference: z.string(),
  po_number: z.string().optional(),
  summary: z.object({
    overall_status: z.enum(["matched", "discrepancies_detected", "needs_clarification", "ambiguous_amendments"]),
    headline: z.string(),
    matched_count: z.number().default(0),
    conflict_count: z.number().default(0),
    missing_count: z.number().default(0),
    ambiguous_count: z.number().default(0),
  }),
  operative_framework: z.object({
    master_agreement_id: z.string().optional(),
    applicable_amendments: z.array(z.string()).default([]),
    unresolved_amendments: z.array(z.string()).default([]),
    amendment_reasoning: z.string().optional(),
  }),
  findings: z.array(ReconciliationFindingSchema),
});

export type ReconciliationFinding = z.infer<typeof ReconciliationFindingSchema>;
export type MultiDocumentAnalysisResult = z.infer<typeof MultiDocumentAnalysisResultSchema>;
