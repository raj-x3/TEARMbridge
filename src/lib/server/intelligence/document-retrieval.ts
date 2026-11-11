// src/lib/server/intelligence/document-retrieval.ts
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface RetrievedDocumentItem {
  documentId: string;
  documentGroupId?: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  classificationHint?: "master_agreement" | "amendment" | "purchase_order" | "supporting_document";
}

/**
 * Retrieves all relevant documents for a commercial agreement from Supabase Storage.
 */
export async function retrieveAgreementDocuments(
  workspaceId: string,
  agreementId: string
): Promise<{
  agreement: { id: string; agreement_reference: string; [key: string]: unknown };
  linkedPo?: { id: string; po_number: string; [key: string]: unknown };
  documents: RetrievedDocumentItem[];
}> {
  let supabase;
  try {
    supabase = createAdminClient();
  } catch {
    supabase = createServerSupabaseClient();
  }

  // 1. Fetch Agreement with workspace verification
  const { data: agreement, error: agrError } = await supabase
    .from("commercial_agreements")
    .select("*, buyer:counterparties!buyer_id(*), supplier:counterparties!supplier_id(*)")
    .eq("id", agreementId)
    .eq("workspace_id", workspaceId)
    .single();

  if (agrError || !agreement) {
    throw new Error(`Agreement not found in workspace: ${agrError?.message || "Not found"}`);
  }

  // 2. Fetch linked Purchase Order
  const { data: linkedPos } = await supabase
    .from("purchase_orders")
    .select("*, line_items:purchase_order_line_items(*)")
    .eq("workspace_id", workspaceId)
    .eq("linked_agreement_id", agreementId);

  const linkedPo = linkedPos && linkedPos.length > 0 ? linkedPos[0] : undefined;

  // 3. Collect Document IDs from:
  //    a) Agreement versions
  //    b) document_links for agreement
  //    c) document_links for PO (if any)
  const docIdsToFetch = new Set<string>();
  const classificationHints = new Map<string, RetrievedDocumentItem["classificationHint"]>();

  // a) Agreement versions
  const { data: versions } = await supabase
    .from("agreement_versions")
    .select("document_id, version_number")
    .eq("agreement_id", agreementId)
    .eq("workspace_id", workspaceId);

  if (versions) {
    for (const v of versions) {
      if (v.document_id) {
        docIdsToFetch.add(v.document_id);
        classificationHints.set(
          v.document_id,
          v.version_number > 1 ? "amendment" : "master_agreement"
        );
      }
    }
  }

  // b) Document links for agreement
  const { data: agrLinks } = await supabase
    .from("document_links")
    .select("document_id, relationship_type")
    .eq("workspace_id", workspaceId)
    .eq("entity_type", "agreement")
    .eq("entity_id", agreementId);

  if (agrLinks) {
    for (const link of agrLinks) {
      docIdsToFetch.add(link.document_id);
      if (link.relationship_type === "amendment") {
        classificationHints.set(link.document_id, "amendment");
      } else if (!classificationHints.has(link.document_id)) {
        classificationHints.set(link.document_id, "master_agreement");
      }
    }
  }

  // c) Document links for purchase order
  if (linkedPo) {
    const { data: poLinks } = await supabase
      .from("document_links")
      .select("document_id")
      .eq("workspace_id", workspaceId)
      .eq("entity_type", "purchase_order")
      .eq("entity_id", linkedPo.id);

    if (poLinks) {
      for (const link of poLinks) {
        docIdsToFetch.add(link.document_id);
        classificationHints.set(link.document_id, "purchase_order");
      }
    }
  }

  const retrievedDocs: RetrievedDocumentItem[] = [];

  if (docIdsToFetch.size === 0) {
    // If no documents exist in database yet, check synthetic demonstration fixtures
    const demoDocs = getSyntheticDemoDocuments(agreement.agreement_reference);
    return {
      agreement,
      linkedPo,
      documents: demoDocs,
    };
  }

  // 4. Retrieve metadata from documents table
  const { data: docRecords, error: docsError } = await supabase
    .from("documents")
    .select("*")
    .in("id", Array.from(docIdsToFetch))
    .eq("workspace_id", workspaceId);

  if (docsError || !docRecords) {
    throw new Error(`Failed to query documents: ${docsError?.message}`);
  }

  // 5. Download private file buffers from Supabase Storage
  let adminClient = supabase;
  try {
    adminClient = createAdminClient();
  } catch {
    adminClient = supabase;
  }

  for (const docRec of docRecords) {
    try {
      const { data: fileData, error: downloadError } = await adminClient.storage
        .from("termbridge-documents")
        .download(docRec.storage_path);

      if (downloadError || !fileData) {
        console.warn(`Could not download ${docRec.storage_path}: ${downloadError?.message}`);
        continue;
      }

      const buffer = Buffer.from(await fileData.arrayBuffer());

      retrievedDocs.push({
        documentId: docRec.id,
        documentGroupId: docRec.document_group_id,
        fileName: docRec.file_name,
        mimeType: docRec.mime_type,
        buffer,
        classificationHint: classificationHints.get(docRec.id) || "master_agreement",
      });
    } catch (err: unknown) {
      console.warn(`Error retrieving storage object for doc ${docRec.id}: ${(err as Error).message}`);
    }
  }

  // If storage downloads were empty (e.g. initial demo setup), fallback to synthetic demo fixtures
  if (retrievedDocs.length === 0) {
    const demoDocs = getSyntheticDemoDocuments(agreement.agreement_reference);
    return {
      agreement,
      linkedPo,
      documents: demoDocs,
    };
  }

  return {
    agreement,
    linkedPo,
    documents: retrievedDocs,
  };
}

/**
 * Provides synthetic demo document fixtures for end-to-end demonstrations (e.g. AGR-1042).
 */
export function getSyntheticDemoDocuments(agreementRef: string): RetrievedDocumentItem[] {
  // Default synthetic package for AGR-1042
  const masterAgreementText = `
MASTER COMMERCIAL SUPPLY AGREEMENT
Agreement Reference: ${agreementRef}
Buyer: Meridian Retail Enterprises LLC
Supplier: Northstar Supply Corp.
Effective Date: January 15, 2026
Currency: USD

1. SCOPE AND PRODUCTS
1.1 Supplier shall supply commercial industrial goods as specified in purchase orders issued by Buyer under this Agreement.

2. PRICING AND DISCOUNTS
2.1 Contract Unit Price: $100.00 USD per unit.
2.2 Minimum Order Quantity: 50 units per individual purchase order.
2.3 Discount Schedule: A 10% volume discount shall apply to qualifying orders exceeding 50 units. No discounts apply to orders below 50 units.

3. PAYMENT TERMS
3.1 Payment shall be due within thirty (30) days from invoice date (Net 30).
3.2 Late payments shall accrue interest at 1.5% per month.

4. DELIVERY COMMITMENTS
4.1 Standard delivery shall be completed within seven (7) business days from order confirmation.

IN WITNESS WHEREOF, the parties have executed this Agreement.
Signed: Northstar Supply Corp. / Meridian Retail Enterprises LLC
`.trim();

  const amendmentText = `
CONTRACT AMENDMENT NO. 1 TO MASTER SUPPLY AGREEMENT
Referenced Agreement: ${agreementRef}
Parties: Northstar Supply Corp. and Meridian Retail Enterprises LLC
Execution Date: October 20, 2026
Effective Date: November 1, 2026

WHEREAS the parties desire to amend specific commercial credit terms of Agreement ${agreementRef};
NOW THEREFORE, the parties agree as follows:

1. MODIFIED PAYMENT TERMS
Section 3.1 of the Master Agreement is hereby amended. Effective November 1, 2026, payment terms for all qualifying purchase orders are extended from Net 30 to forty-five (45) days from invoice date (Net 45).

2. ALL OTHER TERMS UNCHANGED
All other terms, conditions, pricing schedules ($100.00/unit), delivery timelines (7 business days), and minimum order quantities (50 units) established in Master Agreement ${agreementRef} remain in full force and effect.

Signed: Alex Morgan, Northstar Supply Corp.
Signed: Elena Ramos, Meridian Retail Enterprises LLC
`.trim();

  const purchaseOrderText = `
PURCHASE ORDER PO-8821
PO Number: PO-8821
Referenced Agreement: ${agreementRef}
Buyer: Meridian Retail Enterprises LLC
Supplier: Northstar Supply Corp.
Issue Date: November 10, 2026
Currency: USD

ORDER SPECIFICATIONS:
Item 1: Commercial Industrial Fulfillment Units
Quantity: 45 units
Unit Price: $100.00 USD
Requested Discount: 15% promotional discount
Stated Line Total: $3,825.00 USD
Total Amount: $3,825.00 USD

REQUESTED CONDITIONS:
- Requested Payment Terms: Net 60 days
- Requested Delivery: Delivery within 3 business days from order date
- Special Instructions: Priority dispatch requested.
`.trim();

  return [
    {
      documentId: "00000000-0000-4000-a000-000000000001",
      fileName: "Master_Supply_Agreement_AGR-1042.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(masterAgreementText, "utf-8"),
      classificationHint: "master_agreement",
    },
    {
      documentId: "00000000-0000-4000-a000-000000000002",
      fileName: "Amendment_No_1_Payment_Terms_AGR-1042.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(amendmentText, "utf-8"),
      classificationHint: "amendment",
    },
    {
      documentId: "00000000-0000-4000-a000-000000000003",
      fileName: "Purchase_Order_PO-8821.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(purchaseOrderText, "utf-8"),
      classificationHint: "purchase_order",
    },
  ];
}
