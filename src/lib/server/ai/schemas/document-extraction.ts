// src/lib/server/ai/schemas/document-extraction.ts
import { z } from "zod";

export const SourceCitationSchema = z.object({
  source_ref: z.string().describe("Stable source block ID, e.g. DOC_xxx_PAGE_001"),
  quote: z.string().describe("Verbatim excerpt from the document text"),
  location_hint: z.string().optional().describe("Page, paragraph, or row hint"),
});

export const CommercialTermObservedSchema = z.object({
  term_key: z.string(),
  observed_value: z.string(),
  unit: z.string().optional(),
  quote: z.string().optional(),
  source_ref: z.string().optional(),
  ambiguity_notes: z.string().optional(),
});

/**
 * Coerces any AI-returned value to a plain string.
 * Handles cases where the model returns a nested object or number instead of a string.
 */
function coerceToString(v: unknown): unknown {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v === null || v === undefined) return v;
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    // Try common semantic keys
    for (const key of ["value", "text", "code", "name", "label", "raw"]) {
      if (typeof obj[key] === "string" && obj[key]) return obj[key] as string;
    }
    // Last resort: serialize
    try { return JSON.stringify(v); } catch { return ""; }
  }
  return "";
}

/** A Zod type that accepts any scalar/object from AI and always produces a string. */
const coercedString = z.preprocess(coerceToString, z.string());

export const ExtractedDocumentFactsSchema = z.object({
  document_classification: z.enum([
    "master_agreement",
    "amendment",
    "purchase_order",
    "supporting_document",
    "unknown",
  ]),
  agreement_reference: coercedString.nullable().optional(),
  buyer_name: coercedString.nullable().optional(),
  supplier_name: coercedString.nullable().optional(),
  currency: coercedString.default("USD"),
  effective_date: coercedString.nullable().optional(),
  expiry_date: coercedString.nullable().optional(),

  // Key Commercial Terms
  commercial_terms: z.record(z.string(), CommercialTermObservedSchema).default({}),

  // Amendment Specifics (populated if classification is amendment)
  amendment_details: z
    .object({
      amendment_id: coercedString.optional(),
      referenced_agreement: coercedString.optional(),
      effective_date: coercedString.optional(),
      terms_modified: z.array(
        z.object({
          term_key: z.string(),
          new_value: z.string(),
          previous_value: z.string().optional(),
          source_ref: z.string().optional(),
          quote: z.string().optional(),
        })
      ).default([]),
      applicability_assessment: z.enum(["applicable", "uncertain", "not_applicable"]).default("applicable"),
      applicability_reasoning: z.string().optional(),
    })
    .nullable()
    .optional(),

  // Purchase Order Specifics (populated if classification is purchase_order)
  purchase_order_details: z
    .object({
      po_number: coercedString.optional(),
      issue_date: coercedString.optional(),
      requested_delivery_date: coercedString.optional(),
      requested_payment_terms: coercedString.optional(),
      line_items: z.array(
        z.object({
          product_name: z.string(),
          sku: z.string().optional(),
          quantity: z.string(),
          unit_price: z.string(),
          line_total: z.string(),
          source_ref: z.string().optional(),
          quote: z.string().optional(),
        })
      ).default([]),
      subtotal: coercedString.optional(),
      total_amount: coercedString.optional(),
      referenced_agreement: coercedString.optional(),
    })
    .nullable()
    .optional(),

  extracted_citations: z.array(SourceCitationSchema).default([]),
});

export type ExtractedDocumentFacts = z.infer<typeof ExtractedDocumentFactsSchema>;
