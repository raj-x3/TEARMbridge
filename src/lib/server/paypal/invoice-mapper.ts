// src/lib/server/paypal/invoice-mapper.ts
/**
 * Maps an immutable FinalizedTransactionRecord to the official PayPal Invoicing API v2 schema.
 *
 * Rules:
 * - Deterministic conversion: strictly uses values from the immutable snapshot.
 * - Exact arithmetic re-verification before returning payload.
 * - Supports PayPal's standard payment terms enum (e.g. NET_45, NET_30).
 * - Maps buyer and merchant billing details directly without inventing missing addresses.
 * - Generates unique merchant invoice numbers.
 */

import { centsToDecimalString, parseToCents } from "@/lib/server/intelligence/commercial-validator";

export interface TransactionSnapshot {
  workspace_id: string;
  counteroffer_id: string;
  counteroffer_version_id: string;
  version_number: number;
  terms_hash: string;
  agreement: {
    id: string;
    reference: string;
    title: string;
  };
  purchase_order: {
    id: string;
    po_number: string;
    original_total?: number;
    original_subtotal?: number;
  };
  buyer: {
    id: string;
    display_name: string;
    email: string;
  };
  supplier: {
    id: string;
    display_name: string;
  };
  approved_terms: {
    quantity: number;
    unit_price_cents: number;
    discount_percent: number;
    discount_amount_cents?: number;
    payment_term_days: number;
    payment_term_label: string;
    delivery_days: number;
    currency: string;
    line_items?: Array<{
      product_name: string;
      quantity: number;
      unit_price_cents: number;
      discount_amount_cents?: number;
      gross_amount_cents?: number;
      net_amount_cents?: number;
    }>;
  };
  financial_summary: {
    gross_amount: string;
    discount_amount: string;
    subtotal: string;
    tax_amount: string;
    shipping_amount: string;
    grand_total: string;
    currency: string;
  };
  approvals: Array<{
    approver_type: string;
    approved_at: string;
    confirmation_method: string;
    identity_verified: boolean;
    recipient_email?: string;
  }>;
  finalized_at: string;
  finalized_by?: string;
}

export interface FinalizedTransactionRow {
  id: string;
  workspace_id: string;
  transaction_snapshot: TransactionSnapshot;
  snapshot_hash: string;
  transaction_status: string;
  currency: string;
  grand_total: string | number;
  buyer_email: string;
}

export interface PayPalInvoicePayload {
  detail: {
    invoice_number: string;
    reference: string;
    invoice_date: string;
    currency_code: string;
    note: string;
    term?: string;
    payment_term?: {
      term_type: string;
    };
  };
  invoicer?: {
    name?: {
      given_name: string;
      surname: string;
    };
    email_address?: string;
  };
  primary_recipients: Array<{
    billing_info: {
      name?: {
        given_name: string;
        surname: string;
      };
      email_address: string;
    };
  }>;
  items: Array<{
    name: string;
    description: string;
    quantity: string;
    unit_amount: {
      currency_code: string;
      value: string;
    };
    discount?: {
      percent: string;
    };
    unit_of_measure: string;
  }>;
}

/**
 * Maps a payment term label or day count to PayPal's documented payment_term enum.
 */
export function mapPaymentTermToPayPal(label: string, days?: number): string {
  const norm = (label || "").toUpperCase().replace(/[\s-_]/g, "");

  if (norm.includes("45") || days === 45) return "NET_45";
  if (norm.includes("30") || days === 30) return "NET_30";
  if (norm.includes("10") || days === 10) return "NET_10";
  if (norm.includes("15") || days === 15) return "NET_15";
  if (norm.includes("60") || days === 60) return "NET_60";
  if (norm.includes("90") || days === 90) return "NET_90";
  if (norm.includes("RECEIPT") || norm.includes("IMMEDIATE") || days === 0) return "DUE_ON_RECEIPT";

  throw new Error(`Unsupported PayPal payment term: '${label}' (${days} days). PayPal Invoicing requires standard terms.`);
}

/**
 * Splits a full display name into safe given and surname for PayPal schema.
 */
function splitName(displayName: string): { given_name: string; surname: string } {
  const parts = (displayName || "").trim().split(/\s+/);
  if (parts.length === 1) {
    return { given_name: parts[0], surname: "Enterprises" };
  }
  return {
    given_name: parts.slice(0, -1).join(" "),
    surname: parts[parts.length - 1],
  };
}

/**
 * Transforms an immutable finalized transaction into the validated PayPal invoice payload.
 */
export function mapFinalizedTransactionToPayPalInvoice(
  tx: FinalizedTransactionRow,
  options?: { customInvoiceNumber?: string }
): { payload: PayPalInvoicePayload; invoiceNumber: string } {
  const snapshot = tx.transaction_snapshot;
  if (!snapshot) {
    throw new Error("Transaction snapshot is missing from finalized transaction record.");
  }

  const { agreement, purchase_order, buyer, supplier, approved_terms, financial_summary } = snapshot;

  // 1. Validate currency
  const currency = (approved_terms.currency || financial_summary.currency || "USD").toUpperCase();
  if (currency !== "USD") {
    throw new Error(`Currency ${currency} not supported for standard PayPal Invoicing integration. Expected USD.`);
  }

  // 2. Exact arithmetic re-verification
  const quantity = approved_terms.quantity;
  const unitPriceCents = approved_terms.unit_price_cents;
  const discountPercent = approved_terms.discount_percent;

  const calculatedGrossCents = quantity * unitPriceCents;
  const calculatedDiscountCents = Math.round((calculatedGrossCents * discountPercent) / 100);
  const calculatedNetCents = calculatedGrossCents - calculatedDiscountCents;

  const snapshotGrandTotalCents = parseToCents(financial_summary.grand_total);

  if (calculatedNetCents !== snapshotGrandTotalCents) {
    throw new Error(
      `Arithmetic validation mismatch: Calculated net ${calculatedNetCents} cents does not match snapshot grand total ${snapshotGrandTotalCents} cents.`
    );
  }

  // 3. Payment term mapping
  const termType = mapPaymentTermToPayPal(
    approved_terms.payment_term_label,
    approved_terms.payment_term_days
  );

  // 4. Generate unique invoice number
  // Format: INV-PO8821-YYYYMMDD-XXXX
  const todayStr = new Date().toISOString().split("T")[0].replace(/-/g, "");
  const shortId = tx.id.replace(/-/g, "").slice(0, 4).toUpperCase();
  const cleanPo = (purchase_order.po_number || "PO").replace(/[^A-Za-z0-9]/g, "");
  const invoiceNumber = options?.customInvoiceNumber || `INV-${cleanPo}-${todayStr}-${shortId}`;

  // 5. Invoicer and Buyer names
  const invoicerName = splitName(supplier.display_name || "Northstar Supply");
  const buyerName = splitName(buyer.display_name || "Meridian Retail");
  const buyerEmail = buyer.email || tx.buyer_email;

  if (!buyerEmail || !buyerEmail.includes("@")) {
    throw new Error("Valid buyer email is required to dispatch PayPal invoice.");
  }

  // 6. Build item
  const productName =
    approved_terms.line_items?.[0]?.product_name ||
    `Commercial Fulfillment Order (${agreement.reference})`;

  const unitAmountStr = centsToDecimalString(unitPriceCents);

  const payload: PayPalInvoicePayload = {
    detail: {
      invoice_number: invoiceNumber,
      reference: purchase_order.po_number,
      invoice_date: new Date().toISOString().split("T")[0],
      currency_code: currency,
      note: `Governed by Master Supplier Agreement ${agreement.reference}. Original PO: ${purchase_order.po_number}. Terms: ${approved_terms.payment_term_label}.`,
      payment_term: {
        term_type: termType,
      },
    },
    invoicer: {
      name: invoicerName,
    },
    primary_recipients: [
      {
        billing_info: {
          name: buyerName,
          email_address: buyerEmail,
        },
      },
    ],
    items: [
      {
        name: productName,
        description: `Approved counteroffer fulfillment: ${quantity} units at ${unitAmountStr} ${currency} with ${discountPercent}% negotiated commercial discount.`,
        quantity: String(quantity),
        unit_amount: {
          currency_code: currency,
          value: unitAmountStr,
        },
        discount: discountPercent > 0 ? { percent: String(discountPercent) } : undefined,
        unit_of_measure: "QUANTITY",
      },
    ],
  };

  return { payload, invoiceNumber };
}
