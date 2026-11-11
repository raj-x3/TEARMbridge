// src/lib/server/repositories/paypal.ts
/**
 * Database repository for PayPal Sandbox Invoicing & Webhook records.
 * Uses createAdminClient() for secure service_role database operations that
 * bypass client-side RLS mutation prohibitions while respecting workspace isolation.
 */

import { createAdminClient } from "@/lib/supabase/admin";

export interface PayPalInvoiceRecord {
  id: string;
  workspace_id: string;
  finalized_transaction_id: string;
  paypal_invoice_id: string | null;
  invoice_number: string | null;
  paypal_status: string | null;
  normalized_status: string;
  currency_code: string;
  invoice_amount: number;
  amount_paid: number;
  amount_due: number;
  recipient_email: string;
  recipient_view_url: string | null;
  currency_snapshot: Record<string, unknown> | null;
  create_request_id: string;
  send_request_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  draft_created_at: string | null;
  sent_at: string | null;
  paid_at: string | null;
  last_synced_at: string | null;
  safe_error_code: string | null;
}

export async function getPayPalInvoiceRecordByTransaction(
  workspaceId: string,
  transactionId: string
): Promise<PayPalInvoiceRecord | null> {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("paypal_invoice_records")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("finalized_transaction_id", transactionId)
    .maybeSingle();

  if (error || !data) return null;
  return data as PayPalInvoiceRecord;
}

export async function getPayPalInvoiceByPayPalId(
  paypalInvoiceId: string
): Promise<PayPalInvoiceRecord | null> {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("paypal_invoice_records")
    .select("*")
    .eq("paypal_invoice_id", paypalInvoiceId)
    .maybeSingle();

  if (error || !data) return null;
  return data as PayPalInvoiceRecord;
}

export async function getOrCreatePayPalInvoiceDraftRecord(params: {
  workspaceId: string;
  transactionId: string;
  recipientEmail: string;
  invoiceAmount: number;
  currencyCode: string;
  createRequestId: string;
  createdBy: string;
}): Promise<PayPalInvoiceRecord> {
  const adminClient = createAdminClient();

  // Check if one already exists
  const existing = await getPayPalInvoiceRecordByTransaction(
    params.workspaceId,
    params.transactionId
  );
  if (existing) {
    return existing;
  }

  const { data, error } = await adminClient
    .from("paypal_invoice_records")
    .insert({
      workspace_id: params.workspaceId,
      finalized_transaction_id: params.transactionId,
      recipient_email: params.recipientEmail,
      invoice_amount: params.invoiceAmount,
      amount_due: params.invoiceAmount,
      amount_paid: 0,
      currency_code: params.currencyCode,
      create_request_id: params.createRequestId,
      created_by: params.createdBy,
      normalized_status: "draft",
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Failed to initialize PayPal invoice draft record: ${error?.message}`);
  }

  return data as PayPalInvoiceRecord;
}

export async function updatePayPalInvoiceRecord(
  id: string,
  updates: Partial<PayPalInvoiceRecord>
): Promise<PayPalInvoiceRecord> {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("paypal_invoice_records")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Failed to update PayPal invoice record: ${error?.message}`);
  }

  return data as PayPalInvoiceRecord;
}

export async function getOrCreateApiOperation(params: {
  workspaceId: string;
  transactionId: string;
  operationType: "create_draft" | "send_invoice" | "sync_status" | "verify_webhook";
  requestId: string;
}): Promise<{ id: string; operationStatus: string; attemptCount: number }> {
  const adminClient = createAdminClient();

  const { data: existing } = await adminClient
    .from("paypal_api_operations")
    .select("*")
    .eq("transaction_id", params.transactionId)
    .eq("operation_type", params.operationType)
    .eq("request_id", params.requestId)
    .maybeSingle();

  if (existing) {
    // Increment attempt count
    await adminClient
      .from("paypal_api_operations")
      .update({
        attempt_count: existing.attempt_count + 1,
        last_attempt_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    return {
      id: existing.id,
      operationStatus: existing.operation_status,
      attemptCount: existing.attempt_count + 1,
    };
  }

  const { data, error } = await adminClient
    .from("paypal_api_operations")
    .insert({
      workspace_id: params.workspaceId,
      transaction_id: params.transactionId,
      operation_type: params.operationType,
      request_id: params.requestId,
      operation_status: "pending",
      attempt_count: 1,
    })
    .select("id, operation_status, attempt_count")
    .single();

  if (error || !data) {
    throw new Error(`Failed to register PayPal API operation: ${error?.message}`);
  }

  return {
    id: data.id,
    operationStatus: data.operation_status,
    attemptCount: data.attempt_count,
  };
}

export async function updateApiOperationStatus(
  id: string,
  status: "pending" | "in_progress" | "succeeded" | "failed",
  safeMetadata?: Record<string, unknown>
): Promise<void> {
  const adminClient = createAdminClient();
  await adminClient
    .from("paypal_api_operations")
    .update({
      operation_status: status,
      safe_response_metadata: safeMetadata || null,
      last_attempt_at: new Date().toISOString(),
    })
    .eq("id", id);
}

/**
 * Persists an incoming webhook event record idempotently.
 */
export async function recordWebhookEvent(params: {
  paypalEventId: string;
  eventType: string;
  paypalInvoiceId: string | null;
  payloadHash: string;
  signatureVerified: boolean;
  rawSummary?: Record<string, unknown>;
}): Promise<{ id: string; isDuplicate: boolean }> {
  const adminClient = createAdminClient();

  // Check for duplicate
  const { data: existing } = await adminClient
    .from("paypal_webhook_events")
    .select("id")
    .eq("paypal_event_id", params.paypalEventId)
    .maybeSingle();

  if (existing) {
    return { id: existing.id, isDuplicate: true };
  }

  const { data, error } = await adminClient
    .from("paypal_webhook_events")
    .insert({
      paypal_event_id: params.paypalEventId,
      event_type: params.eventType,
      paypal_invoice_id: params.paypalInvoiceId,
      payload_hash: params.payloadHash,
      signature_verified: params.signatureVerified,
      processing_status: params.signatureVerified ? "received" : "failed",
      raw_summary: params.rawSummary || null,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to record PayPal webhook event: ${error?.message}`);
  }

  return { id: data.id, isDuplicate: false };
}

export async function updateWebhookEventStatus(
  id: string,
  status: "processed" | "ignored" | "failed" | "duplicate",
  safeErrorCode?: string
): Promise<void> {
  const adminClient = createAdminClient();
  await adminClient
    .from("paypal_webhook_events")
    .update({
      processing_status: status,
      processed_at: new Date().toISOString(),
      safe_error_code: safeErrorCode || null,
    })
    .eq("id", id);
}

/**
 * Safe audit event logger for Module 5.
 */
export async function recordModule5Audit(
  workspaceId: string,
  entityType: "paypal_invoice" | "paypal_webhook_event",
  entityId: string,
  eventType: string,
  details: Record<string, unknown>
): Promise<void> {
  try {
    const adminClient = createAdminClient();
    await adminClient.from("audit_events").insert({
      workspace_id: workspaceId,
      actor_type: "system",
      entity_type: entityType,
      entity_id: entityId,
      event_type: eventType,
      details,
    });
  } catch (err) {
    console.warn(`[Audit Warning] Failed to log audit event for ${eventType}:`, err);
  }
}
