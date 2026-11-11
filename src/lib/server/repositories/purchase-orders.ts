// src/lib/server/repositories/purchase-orders.ts
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { CreatePurchaseOrderInput } from "@/lib/server/validation/purchase-order";

export async function getPurchaseOrders(workspaceId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("purchase_orders")
    .select(`
      *,
      buyer:buyer_id(id, display_name, legal_name),
      supplier:supplier_id(id, display_name, legal_name),
      linked_agreement:linked_agreement_id(id, agreement_reference, title),
      line_items:purchase_order_line_items(*)
    `)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to fetch purchase orders: ${error.message}`);
  return data || [];
}

export async function createPurchaseOrder(
  workspaceId: string,
  input: CreatePurchaseOrderInput,
  _userId?: string
) {
  void _userId;
  const supabase = createServerSupabaseClient();

  // Insert PO
  const { data: po, error: poError } = await supabase
    .from("purchase_orders")
    .insert({
      workspace_id: workspaceId,
      po_number: input.po_number,
      buyer_id: input.buyer_id,
      supplier_id: input.supplier_id || null,
      linked_agreement_id: input.linked_agreement_id || null,
      status: "needs_review",
      currency: input.currency,
      subtotal: input.subtotal,
      tax_amount: input.tax_amount,
      shipping_amount: input.shipping_amount,
      total_amount: input.total_amount,
      requested_delivery_date: input.requested_delivery_date || null,
      requested_payment_terms: input.requested_payment_terms || null,
      notes: input.notes || null,
      received_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (poError || !po) {
    throw new Error(`Failed to create purchase order: ${poError?.message}`);
  }

  // Insert Line items if provided
  if (input.line_items && input.line_items.length > 0) {
    const itemsToInsert = input.line_items.map((item) => ({
      workspace_id: workspaceId,
      purchase_order_id: po.id,
      sku: item.sku || null,
      product_name: item.product_name,
      description: item.description || null,
      quantity: item.quantity,
      unit_price: item.unit_price,
      line_total: item.line_total,
      metadata: item.metadata || {},
    }));

    const { error: lineError } = await supabase
      .from("purchase_order_line_items")
      .insert(itemsToInsert);

    if (lineError) {
      console.error("Failed to insert line items:", lineError.message);
    }
  }

  // Note: Audit event is automatically recorded within the same database transaction
  // by the database trigger trg_audit_purchase_order_creation (SECURITY DEFINER).
  return po;
}
