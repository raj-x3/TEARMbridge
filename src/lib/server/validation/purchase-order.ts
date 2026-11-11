// src/lib/server/validation/purchase-order.ts
import { z } from "zod";

export const createPurchaseOrderSchema = z.object({
  po_number: z
    .string()
    .min(1, "PO number is required")
    .max(50, "PO number too long")
    .regex(/^[A-Za-z0-9\-_]+$/, "PO number contains invalid characters"),
  buyer_id: z.string().uuid("Invalid buyer ID"),
  supplier_id: z.string().uuid("Invalid supplier ID").optional().nullable(),
  linked_agreement_id: z
    .string()
    .uuid("Invalid agreement ID")
    .optional()
    .nullable(),
  currency: z.string().length(3, "Currency must be a 3-letter code").default("USD"),
  subtotal: z.number().nonnegative("Subtotal must be non-negative"),
  tax_amount: z.number().nonnegative("Tax must be non-negative").default(0),
  shipping_amount: z
    .number()
    .nonnegative("Shipping must be non-negative")
    .default(0),
  total_amount: z.number().nonnegative("Total must be non-negative"),
  requested_delivery_date: z.string().optional().nullable(),
  requested_payment_terms: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  line_items: z
    .array(
      z.object({
        sku: z.string().optional().nullable(),
        product_name: z.string().min(1, "Product name required"),
        description: z.string().optional().nullable(),
        quantity: z.number().positive("Quantity must be positive"),
        unit_price: z.number().nonnegative("Unit price must be non-negative"),
        line_total: z.number().nonnegative("Line total must be non-negative"),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .optional()
    .default([]),
});

export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;
