// src/lib/server/validation/counterparty.ts
import { z } from "zod";

export const createCounterpartySchema = z.object({
  legal_name: z
    .string()
    .min(1, "Legal name is required")
    .max(200, "Legal name too long"),
  display_name: z
    .string()
    .min(1, "Display name is required")
    .max(200, "Display name too long"),
  entity_type: z.enum(["buyer", "supplier", "both"]).default("buyer"),
  email: z.string().email("Invalid email").optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
  currency: z.string().length(3).default("USD"),
  notes: z.string().max(2000).optional().nullable(),
});

export type CreateCounterpartyInput = z.infer<typeof createCounterpartySchema>;
