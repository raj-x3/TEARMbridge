// tests/document-validation.test.ts
import {
  isFilenameSafe,
  validateFileSignature,
  validateOfficeZipContent,
  ALLOWED_DOCUMENT_TYPES,
  BLOCKED_EXTENSIONS,
  MAX_FILE_SIZE,
  documentUploadMetaSchema,
} from "../src/lib/server/validation/document";
import { createPurchaseOrderSchema } from "../src/lib/server/validation/purchase-order";
import { createCounterpartySchema } from "../src/lib/server/validation/counterparty";
import { createHash } from "crypto";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log("🧪 Running Document & Schema Validation Test Suite...\n");

let passed = 0;
let total = 0;

function test(name: string, fn: () => void) {
  total++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ❌ ${name}: ${err.message}`);
  }
}

// 1. Filename security checks
test("Filename security: accepts standard B2B document filenames", () => {
  assert(isFilenameSafe("PO-8821_Meridian_Retail.pdf"), "standard pdf should be safe");
  assert(isFilenameSafe("contract_annex_2026.docx"), "standard docx should be safe");
  assert(isFilenameSafe("price_matrix_v2.xlsx"), "standard xlsx should be safe");
});

test("Filename security: rejects path traversal attempts", () => {
  assert(!isFilenameSafe("../../../etc/passwd"), "directory traversal should be rejected");
  assert(!isFilenameSafe("..\\..\\windows\\system32"), "windows traversal should be rejected");
  assert(!isFilenameSafe("/var/log/app.pdf"), "absolute path should be rejected");
  assert(!isFilenameSafe("foo/bar.pdf"), "relative path should be rejected");
});

test("Filename security: rejects hidden files and null bytes", () => {
  assert(!isFilenameSafe(".env"), "hidden files should be rejected");
  assert(!isFilenameSafe("file\0.pdf"), "null byte should be rejected");
  assert(!isFilenameSafe(""), "empty filename should be rejected");
});

// 2. Blocked extensions
test("Blocked extensions: rejects executable formats", () => {
  for (const ext of ["exe", "bat", "cmd", "msi", "sh", "app"]) {
    assert(BLOCKED_EXTENSIONS.includes(ext), `${ext} should be in blocked extensions`);
  }
});

// 3. Magic file signature validation
test("Magic bytes: identifies genuine PDF files", () => {
  const genuinePdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // %PDF-1.4
  assert(validateFileSignature(genuinePdf, "application/pdf"), "genuine PDF header matches");

  const spoofedPdf = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // 'Hello'
  assert(!validateFileSignature(spoofedPdf, "application/pdf"), "spoofed PDF should be rejected");
});

test("Magic bytes: identifies ZIP/Office headers", () => {
  const zipHeader = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]); // PK..
  assert(
    validateFileSignature(zipHeader, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    "genuine DOCX zip header matches"
  );
  assert(
    validateFileSignature(zipHeader, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    "genuine XLSX zip header matches"
  );
});

// 4. ZIP Office internal entry check
test("Office ZIP contents: verifies word/ or xl/ entry exists", () => {
  const fakeDocxNoEntry = new TextEncoder().encode("PK\x03\x04... some generic zip without word folder");
  assert(
    !validateOfficeZipContent(fakeDocxNoEntry, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    "zip without word/ entry should be rejected as invalid docx"
  );

  const genuineDocxBytes = new TextEncoder().encode("PK\x03\x04... [Content_Types].xml ... word/document.xml");
  assert(
    validateOfficeZipContent(genuineDocxBytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    "zip with word/ entry is validated as genuine docx"
  );

  const genuineXlsxBytes = new TextEncoder().encode("PK\x03\x04... [Content_Types].xml ... xl/workbook.xml");
  assert(
    validateOfficeZipContent(genuineXlsxBytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    "zip with xl/ entry is validated as genuine xlsx"
  );
});

// 5. SHA-256 duplicate detection accuracy
test("SHA-256 checksum: deterministic hash generation", () => {
  const content = new TextEncoder().encode("PO-8821 Master Purchase Order Agreement Content");
  const hash1 = createHash("sha256").update(content).digest("hex");
  const hash2 = createHash("sha256").update(content).digest("hex");
  assert(hash1 === hash2, "identical content must produce identical hash");
  assert(hash1.length === 64, "SHA-256 hash must be 64 hex characters");
});

// 6. Zod input validation schemas
test("Zod validation: purchase order schema enforces non-negative money and valid structure", () => {
  const validPO = {
    po_number: "PO-8821",
    buyer_id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    currency: "USD",
    subtotal: 4500,
    tax_amount: 0,
    shipping_amount: 0,
    total_amount: 4500,
    line_items: [
      {
        product_name: "Industrial Sensor Module",
        quantity: 45,
        unit_price: 100,
        line_total: 4500,
      },
    ],
  };
  const res = createPurchaseOrderSchema.safeParse(validPO);
  assert(res.success, `valid purchase order must pass schema: ${JSON.stringify(res)}`);

  const invalidPO = {
    po_number: "PO-INVALID-@#$",
    buyer_id: "not-a-uuid",
    currency: "US", // invalid length
    subtotal: -500, // negative money
    total_amount: -500,
  };
  const failRes = createPurchaseOrderSchema.safeParse(invalidPO);
  assert(!failRes.success, "invalid purchase order must fail schema");
});

test("Zod validation: counterparty schema enforces required fields and valid types", () => {
  const validCp = {
    legal_name: "Meridian Retail Enterprises LLC",
    display_name: "Meridian Retail",
    entity_type: "buyer",
    email: "e.ramos@meridianretail.com",
    currency: "USD",
  };
  const res = createCounterpartySchema.safeParse(validCp);
  assert(res.success, "valid counterparty must pass schema");

  const invalidCp = {
    legal_name: "",
    display_name: "",
    entity_type: "invalid_type",
  };
  const failRes = createCounterpartySchema.safeParse(invalidCp);
  assert(!failRes.success, "invalid counterparty must fail schema");
});

test("Zod validation: document upload metadata requires UUID and valid entity type", () => {
  const validMeta = {
    entity_type: "purchase_order",
    entity_id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    relationship_type: "source",
    document_type: "purchase_order",
    title: "PO-8821.pdf",
  };
  const res = documentUploadMetaSchema.safeParse(validMeta);
  assert(res.success, "valid document meta must pass schema");

  const invalidMeta = {
    entity_type: "unauthorized_entity",
    entity_id: "not-uuid",
  };
  const failRes = documentUploadMetaSchema.safeParse(invalidMeta);
  assert(!failRes.success, "invalid document meta must fail schema");
});

console.log(`\n📊 Test Suite Completed: ${passed}/${total} tests passed.\n`);

if (passed !== total) {
  process.exit(1);
}
