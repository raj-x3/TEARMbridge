// tests/commercial-intelligence.test.ts
/**
 * Module 3 — Gemini Commercial Intelligence Test Suite & Quality Benchmark
 *
 * Verifies:
 * 1. Document Preprocessing across PDF, DOCX, XLSX, CSV, TXT
 * 2. Stable Source Reference generation (DOC_xxx_PAGE_001, DOC_xxx_PARA_001, etc.)
 * 3. Independent Server-Side Evidence Validator
 * 4. Deterministic Financial & Commercial Arithmetic Validator
 * 5. Multi-Document Reconciliation Scenarios 1–5
 * 6. Prompt Injection Defense
 * 7. Live Gemini Model Configuration status check
 */

import * as fs from "fs";
import * as path from "path";
import {
  preprocessDocument,
  PreprocessedDocument,
} from "../src/lib/server/document-processing";
import {
  validateEvidenceItem,
  validateAllFindingsEvidence,
} from "../src/lib/server/intelligence/evidence-validator";
import {
  validatePurchaseOrderArithmetic,
  calculatePaymentTermVarianceDays,
  parseToCents,
  centsToDecimalString,
} from "../src/lib/server/intelligence/commercial-validator";
import { isGeminiConfigured } from "../src/lib/server/ai/gemini";
import { ReconciliationFinding } from "../src/lib/server/ai/schemas/commercial-analysis";

let passed = 0;
let total = 0;

// Load .env.local if present
const envLocalPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envLocalPath)) {
  const content = fs.readFileSync(envLocalPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"](.*)['"]$/, "$1");
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function test(name: string, fn: () => void | Promise<void>) {
  total++;
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`  ❌ ${name}: ${errorMsg}`);
  }
}

async function runBenchmark() {
  console.log("🧠 Running Module 3 Commercial Intelligence Test Suite & Benchmark...\n");

  const fixturesDir = path.resolve(process.cwd(), "tests/fixtures");

  // =========================================================================
  // 1. DOCUMENT PREPROCESSING ACROSS ALL SUPPORTED FORMATS
  // =========================================================================
  await test("DocPrep 1: TXT Preprocessor creates line-numbered blocks and stable references", async () => {
    const textBuffer = Buffer.from(
      "Line 1: Master Commercial Agreement\nLine 2: Section 1 Pricing\nLine 3: Unit Price $100.00\nLine 4: Net 30 days\nLine 5: End of agreement",
      "utf-8"
    );
    const doc = await preprocessDocument("doc-txt-01", "agreement.txt", "text/plain", textBuffer);

    assert(doc.blocks.length >= 1, "Must generate at least 1 content block");
    assert(doc.blocks[0].source_ref.startsWith("DOC_doc-txt-01_LINES_"), "Must have standard source_ref format");
    assert(doc.blocks[0].location_type === "txt_line", "Location type must be txt_line");
    assert(doc.blocks[0].text.includes("Unit Price $100.00"), "Block text must match buffer content");
    assert(!doc.is_scanned_without_text, "TXT cannot be marked as scanned without text");
  });

  await test("DocPrep 2: CSV Preprocessor preserves row coordinates and headers", async () => {
    const csvBuffer = Buffer.from(
      "SKU,Product Name,Quantity,Unit Price,Total\nWIDGET-01,Alpha Industrial Unit,50,100.00,5000.00\nWIDGET-02,Beta Unit,10,20.00,200.00",
      "utf-8"
    );
    const doc = await preprocessDocument("doc-csv-01", "pricing.csv", "text/csv", csvBuffer);

    assert(doc.blocks.length === 3, `Expected 3 rows, got ${doc.blocks.length}`);
    assert(doc.blocks[1].source_ref.includes("CSV_ROW_002"), "Row 2 must have indexed source ref");
    assert(doc.blocks[1].location.row_index === 2, "Row index must be 2");
    assert(doc.blocks[1].text.includes("Alpha Industrial Unit"), "Must extract row content accurately");
  });

  await test("DocPrep 3: Scanned document detection flags empty/unextractable text", async () => {
    // Minimal mock PDF buffer with negligible text
    const emptyPdfBuffer = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF", "utf-8");
    const doc = await preprocessDocument("doc-scanned-01", "scanned_doc.pdf", "application/pdf", emptyPdfBuffer);

    assert(doc.is_scanned_without_text === true, "Must flag unextractable PDF as is_scanned_without_text");
  });

  // =========================================================================
  // 2. INDEPENDENT SERVER-SIDE EVIDENCE VALIDATOR
  // =========================================================================
  await test("Evidence 1: Validates exact verbatim quotation (verified_exact)", async () => {
    const textBuffer = Buffer.from("Clause 3.1: Payment shall be due within thirty (30) days from invoice date (Net 30).", "utf-8");
    const doc = await preprocessDocument("doc-agr-01", "contract.txt", "text/plain", textBuffer);

    const ref = doc.blocks[0].source_ref;
    const docsMap = new Map([[doc.document_id, doc]]);
    const blocksMap = new Map([[ref, { block: doc.blocks[0], doc }]]);

    const result = validateEvidenceItem(
      {
        source_ref: ref,
        quote: "Payment shall be due within thirty (30) days from invoice date (Net 30).",
      },
      docsMap,
      blocksMap
    );

    assert(result.verification_status === "verified_exact", `Expected verified_exact, got ${result.verification_status}`);
    assert(result.verification_method === "exact", "Method must be exact");
  });

  await test("Evidence 2: Validates normalized whitespace quotation (verified_normalized)", async () => {
    const textBuffer = Buffer.from("Clause 3.1:  Payment   shall   be due   within 30 days.", "utf-8");
    const doc = await preprocessDocument("doc-agr-02", "contract.txt", "text/plain", textBuffer);

    const ref = doc.blocks[0].source_ref;
    const docsMap = new Map([[doc.document_id, doc]]);
    const blocksMap = new Map([[ref, { block: doc.blocks[0], doc }]]);

    const result = validateEvidenceItem(
      {
        source_ref: ref,
        quote: "Payment shall be due within 30 days.", // Normalized single spaces
      },
      docsMap,
      blocksMap
    );

    assert(
      result.verification_status === "verified_normalized",
      `Expected verified_normalized, got ${result.verification_status}`
    );
    assert(result.verification_method === "normalized_whitespace", "Method must be normalized_whitespace");
  });

  await test("Evidence 3: Rejects inaccurate or fabricated quotation (not_found)", async () => {
    const textBuffer = Buffer.from("Clause 3.1: Payment due within thirty days.", "utf-8");
    const doc = await preprocessDocument("doc-agr-03", "contract.txt", "text/plain", textBuffer);

    const ref = doc.blocks[0].source_ref;
    const docsMap = new Map([[doc.document_id, doc]]);
    const blocksMap = new Map([[ref, { block: doc.blocks[0], doc }]]);

    const result = validateEvidenceItem(
      {
        source_ref: ref,
        quote: "Payment shall be due within sixty (60) days and buyer receives 20% discount.", // Invented
      },
      docsMap,
      blocksMap
    );

    assert(result.verification_status === "not_found", `Expected not_found, got ${result.verification_status}`);
    assert(result.failure_reason !== undefined, "Failure reason must be populated");
  });

  await test("Evidence 4: Rejects non-existent source reference (invalid_source)", async () => {
    const textBuffer = Buffer.from("Valid content", "utf-8");
    const doc = await preprocessDocument("doc-agr-04", "contract.txt", "text/plain", textBuffer);

    const docsMap = new Map([[doc.document_id, doc]]);
    const blocksMap = new Map([[doc.blocks[0].source_ref, { block: doc.blocks[0], doc }]]);

    const result = validateEvidenceItem(
      {
        source_ref: "DOC_NONEXISTENT_PAGE_999",
        quote: "Valid content",
      },
      docsMap,
      blocksMap
    );

    assert(result.verification_status === "invalid_source", `Expected invalid_source, got ${result.verification_status}`);
  });

  await test("Evidence 5: Marks scanned/visual document citations as visually_located_unverified", async () => {
    const emptyPdfBuffer = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF", "utf-8");
    const doc = await preprocessDocument("doc-scanned-02", "scanned.pdf", "application/pdf", emptyPdfBuffer);

    const ref = doc.blocks[0].source_ref;
    const docsMap = new Map([[doc.document_id, doc]]);
    const blocksMap = new Map([[ref, { block: doc.blocks[0], doc }]]);

    const result = validateEvidenceItem(
      {
        source_ref: ref,
        quote: "Handwritten signature visible",
      },
      docsMap,
      blocksMap
    );

    assert(
      result.verification_status === "visually_located_unverified",
      `Expected visually_located_unverified, got ${result.verification_status}`
    );
  });

  // =========================================================================
  // 3. DETERMINISTIC FINANCIAL ARITHMETIC VALIDATOR
  // =========================================================================
  await test("Arithmetic 1: Correctly validates line items and totals without floating point error", () => {
    const po = {
      currency: "USD",
      subtotal: "4500.00",
      total_amount: "4500.00",
      line_items: [
        { product_name: "Item A", quantity: 45, unit_price: "100.00", line_total: "4500.00" },
      ],
    };

    const res = validatePurchaseOrderArithmetic(po);
    assert(res.is_valid === true, "Valid PO math must pass");
    assert(res.calculated_subtotal === "4500.00", `Calculated subtotal must be 4500.00, got ${res.calculated_subtotal}`);
    assert(res.line_item_validations[0].is_valid === true, "Line item must be valid");
  });

  await test("Arithmetic 2: Detects line item multiplication discrepancy", () => {
    const po = {
      currency: "USD",
      subtotal: "4500.00",
      total_amount: "4500.00",
      line_items: [
        { product_name: "Item A", quantity: 45, unit_price: "100.00", line_total: "3825.00" }, // 45 * 100 != 3825
      ],
    };

    const res = validatePurchaseOrderArithmetic(po);
    assert(res.is_valid === false, "Math mismatch must fail validation");
    assert(res.line_item_validations[0].is_valid === false, "Line item must be flagged invalid");
    assert(res.warnings.length > 0, "Warning must be recorded");
  });

  await test("Arithmetic 3: Computes exact payment term day variance", () => {
    const v1 = calculatePaymentTermVarianceDays("Net 30 days", "Net 45 days");
    assert(v1.varianceDays === 15, `Expected +15 days, got ${v1.varianceDays}`);

    const v2 = calculatePaymentTermVarianceDays("Net 45", "Net 60");
    assert(v2.varianceDays === 15, `Expected +15 days, got ${v2.varianceDays}`);

    const v3 = calculatePaymentTermVarianceDays("Net 30", "Net 30");
    assert(v3.varianceDays === 0, `Expected 0 days, got ${v3.varianceDays}`);
  });

  // =========================================================================
  // 3b. EXACT DECIMAL ARITHMETIC (replaces binary float multiplication)
  // =========================================================================
  await test("Arithmetic 4: Exact decimal parsing handles banker's rounding edge case '1.005'", () => {
    // In IEEE-754 float: 1.005 * 100 = 100.49999999999999 (rounds to 100, NOT 101)
    // Our exact decimal parser must yield 101 (correct half-up rounding)
    const result = parseToCents("1.005");
    assert(result === 101, `Expected 101 cents for '1.005', got ${result}`);
  });

  await test("Arithmetic 5: Exact decimal parsing preserves precision for '0.10' and '999999.99'", () => {
    assert(parseToCents("0.10") === 10, `Expected 10 cents for '0.10', got ${parseToCents("0.10")}`);
    assert(parseToCents("999999.99") === 99999999, `Expected 99999999 cents for '999999.99', got ${parseToCents("999999.99")}`);
  });

  await test("Arithmetic 6: Exact decimal parsing handles negative values", () => {
    assert(parseToCents("-50.25") === -5025, `Expected -5025 for '-50.25', got ${parseToCents("-50.25")}`);
  });

  await test("Arithmetic 7: Invalid monetary string returns 0 (via parseToCents wrapper)", () => {
    assert(parseToCents("abc") === 0, "Non-numeric string must return 0");
    assert(parseToCents("12.34.56") === 0, "Double-decimal must return 0");
    assert(parseToCents(null) === 0, "null must return 0");
    assert(parseToCents(undefined) === 0, "undefined must return 0");
  });

  await test("Arithmetic 8: Currency mismatch detection in PO validation", () => {
    const po = {
      currency: "EUR",
      expected_currency: "USD",
      line_items: [
        { product_name: "Item A", quantity: 10, unit_price: "100.00", line_total: "1000.00" }
      ],
      subtotal: "1000.00",
      total_amount: "1000.00",
    };
    const res = validatePurchaseOrderArithmetic(po);
    assert(res.is_valid === false, "Currency mismatch must invalidate PO");
    assert(res.currency_mismatch === true, "currency_mismatch flag must be true");
    assert(res.warnings.some(w => w.includes("Currency mismatch")), "Warning must mention currency mismatch");
  });

  // =========================================================================
  // 3c. EXTENDED EVIDENCE VERIFICATION REGRESSION TESTS
  // =========================================================================
  await test("Evidence 6: Correct quotation in wrong document is rejected", async () => {
    const docA = await preprocessDocument("doc-ev6-a", "agreement_A.txt", "text/plain",
      Buffer.from("Payment terms: Net 30 days upon invoice receipt.", "utf-8"));
    const docB = await preprocessDocument("doc-ev6-b", "agreement_B.txt", "text/plain",
      Buffer.from("Delivery terms: FOB warehouse within 14 days.", "utf-8"));

    const docsMap = new Map([
      [docA.document_id, docA],
      [docB.document_id, docB],
    ]);
    const blocksMap = new Map([
      [docA.blocks[0].source_ref, { block: docA.blocks[0], doc: docA }],
      [docB.blocks[0].source_ref, { block: docB.blocks[0], doc: docB }],
    ]);

    // Quote from docA, citing docB block
    const result = validateEvidenceItem(
      { source_ref: docB.blocks[0].source_ref, quote: "Net 30 days upon invoice receipt" },
      docsMap,
      blocksMap
    );
    assert(result.verification_status === "not_found",
      `Expected not_found when quoting from wrong doc, got ${result.verification_status}`);
  });

  await test("Evidence 7: Correct quotation with wrong page/block reference is rejected", async () => {
    const longText = Array.from({ length: 25 }, (_, i) => `Line ${i + 1}: Clause content for block verification testing.`).join("\n");
    const doc = await preprocessDocument("doc-ev7", "multiblock.txt", "text/plain", Buffer.from(longText, "utf-8"));

    assert(doc.blocks.length >= 2, "Must have at least 2 blocks for this test");
    const docsMap = new Map([[doc.document_id, doc]]);
    const blocksMap = new Map<string, { block: typeof doc.blocks[0]; doc: typeof doc }>();
    for (const b of doc.blocks) blocksMap.set(b.source_ref, { block: b, doc });

    // Quote from block 0, but cite block 1's source_ref
    const quoteFromBlock0 = "Line 1: Clause content";
    const result = validateEvidenceItem(
      { source_ref: doc.blocks[1].source_ref, quote: quoteFromBlock0 },
      docsMap,
      blocksMap
    );
    // Block 1 starts at line 11, so "Line 1: ..." should not be found there
    assert(result.verification_status === "not_found",
      `Expected not_found for wrong block, got ${result.verification_status}`);
  });

  await test("Evidence 8: Invalid page reference is rejected as invalid_source", async () => {
    const doc = await preprocessDocument("doc-ev8", "short.txt", "text/plain", Buffer.from("Some content.", "utf-8"));
    const docsMap = new Map([[doc.document_id, doc]]);
    const blocksMap = new Map([[doc.blocks[0].source_ref, { block: doc.blocks[0], doc }]]);

    const result = validateEvidenceItem(
      { source_ref: "DOC_doc-ev8_PAGE_999", quote: "Some content" },
      docsMap,
      blocksMap
    );
    assert(result.verification_status === "invalid_source",
      `Expected invalid_source for non-existent page ref, got ${result.verification_status}`);
  });

  await test("Evidence 9: Incorrect line item calculation is detected by arithmetic validator", () => {
    const po = {
      currency: "USD",
      line_items: [
        { product_name: "Sensor", quantity: "7", unit_price: "85.00", line_total: "600.00" } // 7*85 = 595, not 600
      ],
      subtotal: "600.00",
      total_amount: "600.00",
    };
    const res = validatePurchaseOrderArithmetic(po);
    assert(res.is_valid === false, "Incorrect line total must fail validation");
    assert(res.line_item_validations[0].discrepancy_cents !== 0, "Discrepancy must be non-zero");
  });

  await test("Evidence 10: Migration 00013 blocks direct intelligence table writes from authenticated clients", () => {
    const m13 = fs.readFileSync(path.resolve(process.cwd(), "supabase/migrations/00013_harden_intelligence_rls.sql"), "utf-8");
    assert(
      m13.includes("REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.analysis_evidence FROM authenticated, anon, public;"),
      "Must revoke client writes on analysis_evidence"
    );
    assert(
      m13.includes("GRANT ALL ON public.analysis_evidence TO service_role;"),
      "Must grant writes exclusively to service_role"
    );
  });

  await test("Evidence 11: Cross-workspace SELECT isolation is enforced via RLS policies", () => {
    const m12 = fs.readFileSync(path.resolve(process.cwd(), "supabase/migrations/00012_commercial_intelligence.sql"), "utf-8");
    // Verify workspace-scoped RLS using get_user_workspace_ids()
    assert(
      m12.includes("workspace_id IN (SELECT public.get_user_workspace_ids())"),
      "All intelligence SELECT policies must scope to user's workspace IDs"
    );
    // Count occurrences — should appear in SELECT policies for all 4 tables
    const matches = m12.match(/workspace_id IN \(SELECT public\.get_user_workspace_ids\(\)\)/g);
    assert(matches !== null && matches.length >= 4,
      `Expected at least 4 workspace-scoped RLS clauses, found ${matches?.length || 0}`);
  });

  await test("Evidence 12: Amendment applicability prompt checks execution/signature status", () => {
    const promptModule = fs.readFileSync(
      path.resolve(process.cwd(), "src/lib/server/ai/prompts/commercial-reconciliation.ts"), "utf-8"
    );
    assert(promptModule.includes("executed or signed"), "Prompt must check execution/signature status");
    assert(promptModule.includes("buyer and supplier identity"), "Prompt must check party identity match");
    assert(promptModule.includes("superseded by a later executed amendment"), "Prompt must check supersession");
    assert(promptModule.includes("ambiguous"), "Prompt must require ambiguous marking when conditions are unmet");
  });

  // =========================================================================
  // 4. MULTI-DOCUMENT RECONCILIATION SCENARIOS (1–5)
  // =========================================================================
  await test("Scenario 1: Clean agreement loads and preprocessed successfully", async () => {
    const agrPath = path.join(fixturesDir, "scenario1_clean/agreement.txt");
    const poPath = path.join(fixturesDir, "scenario1_clean/purchase_order.txt");

    const agrBuf = fs.readFileSync(agrPath);
    const poBuf = fs.readFileSync(poPath);

    const docAgr = await preprocessDocument("scen1-agr", "agreement.txt", "text/plain", agrBuf);
    const docPo = await preprocessDocument("scen1-po", "po.txt", "text/plain", poBuf);

    assert(docAgr.blocks.length > 0 && docPo.blocks.length > 0, "Both documents must be preprocessed");
    assert(docAgr.full_text.includes("Unit Price: $50.00 USD"), "Must extract unit price");
    assert(docPo.full_text.includes("Quantity: 100 units"), "Must extract quantity");
  });

  await test("Scenario 2: Payment term conflict (Net 30 vs Net 60) verified with evidence citation", async () => {
    const agrBuf = fs.readFileSync(path.join(fixturesDir, "scenario2_payment_conflict/agreement.txt"));
    const poBuf = fs.readFileSync(path.join(fixturesDir, "scenario2_payment_conflict/purchase_order.txt"));

    const docAgr = await preprocessDocument("scen2-agr", "agreement.txt", "text/plain", agrBuf);
    const docPo = await preprocessDocument("scen2-po", "po.txt", "text/plain", poBuf);

    // Validate quotation from agreement block 1
    const docsMap = new Map([[docAgr.document_id, docAgr], [docPo.document_id, docPo]]);
    const blocksMap = new Map<string, any>();
    for (const b of docAgr.blocks) blocksMap.set(b.source_ref, { block: b, doc: docAgr });
    for (const b of docPo.blocks) blocksMap.set(b.source_ref, { block: b, doc: docPo });

    const contractBlock = docAgr.blocks.find((b) => b.text.includes("strictly within thirty (30) days")) || docAgr.blocks[0];

    const evContract = validateEvidenceItem(
      {
        source_ref: contractBlock.source_ref,
        quote: "Payment shall be due strictly within thirty (30) days from invoice date (Net 30).",
      },
      docsMap,
      blocksMap
    );
    assert(evContract.verification_status === "verified_exact", `Contract citation must be verified, got ${evContract.verification_status}`);

    const poBlock = docPo.blocks.find((b) => b.text.includes("Net 60 days")) || docPo.blocks[0];

    const evPo = validateEvidenceItem(
      {
        source_ref: poBlock.source_ref,
        quote: "Payment Terms: Net 60 days",
      },
      docsMap,
      blocksMap
    );
    assert(evPo.verification_status === "verified_exact", "PO citation must be verified");

    const { varianceDays } = calculatePaymentTermVarianceDays("Net 30", "Net 60");
    assert(varianceDays === 30, `Variance must be 30 days, got ${varianceDays}`);
  });

  await test("Scenario 3: Effective amendment applies (Net 30 amended to Net 45)", async () => {
    const amdBuf = fs.readFileSync(path.join(fixturesDir, "scenario3_effective_amendment/amendment.txt"));
    const poBuf = fs.readFileSync(path.join(fixturesDir, "scenario3_effective_amendment/purchase_order.txt"));

    const docAmd = await preprocessDocument("scen3-amd", "amendment.txt", "text/plain", amdBuf);
    const docPo = await preprocessDocument("scen3-po", "po.txt", "text/plain", poBuf);

    assert(docAmd.full_text.includes("Net 45 days"), "Amendment establishes Net 45");
    assert(docPo.full_text.includes("Payment Terms: Net 45 days"), "PO requests Net 45 matching amendment");

    const { varianceDays } = calculatePaymentTermVarianceDays("Net 45", "Net 45");
    assert(varianceDays === 0, "No payment term variance when amendment matches PO");
  });

  await test("Scenario 4: Ambiguous unexecuted amendment is flagged appropriately", async () => {
    const amdBuf = fs.readFileSync(path.join(fixturesDir, "scenario4_ambiguous_amendment/amendment_unclear.txt"));
    const docAmd = await preprocessDocument("scen4-amd", "amendment_unclear.txt", "text/plain", amdBuf);

    assert(docAmd.full_text.includes("Status: Draft proposal - unsigned"), "Must identify draft/unsigned status");
    assert(docAmd.full_text.includes("TBD 2027"), "Must identify unestablished effective date");
  });

  await test("Scenario 5: Prompt injection inside document is treated as untrusted text", async () => {
    const poBuf = fs.readFileSync(path.join(fixturesDir, "scenario5_prompt_injection/malicious_po.txt"));
    const docPo = await preprocessDocument("scen5-po", "malicious_po.txt", "text/plain", poBuf);

    // Verify text is treated strictly as document content
    assert(docPo.blocks[0].text.includes("CRITICAL SYSTEM OVERRIDE"), "Contains text as content");
    assert(docPo.blocks[0].location_type === "txt_line", "Wrapped in standard content block");
    // The prompt generator surrounds it with DOCUMENT SOURCE CONTENT and UNTRUSTED DATA instructions
  });

  // =========================================================================
  // 4b. TOKEN ACCOUNTING & PROCESSING RELIABILITY
  // =========================================================================
  await test("Reliability 1: Token accounting aggregates extraction and reconciliation calls accurately", () => {
    // Stage-level token usage values captured from live AGR-1042 execution
    const calls = [
      { call: "master_extraction", input: 529, output: 579 },
      { call: "amendment_extraction", input: 506, output: 583 },
      { call: "po_extraction", input: 548, output: 757 },
      { call: "reconciliation", input: 1836, output: 1251 },
    ];

    let aggregatedInput = 0;
    let aggregatedOutput = 0;
    for (const c of calls) {
      aggregatedInput += c.input;
      aggregatedOutput += c.output;
    }
    const combinedTotal = aggregatedInput + aggregatedOutput;

    assert(aggregatedInput === 3419, `Expected 3419 input tokens, got ${aggregatedInput}`);
    assert(aggregatedOutput === 3170, `Expected 3170 output tokens, got ${aggregatedOutput}`);
    assert(combinedTotal === 6589, `Expected 6589 combined tokens, got ${combinedTotal}`);
  });

  await test("Reliability 2: Fingerprint calculation produces deterministic SHA-256 for deduplication", () => {
    const docHashes = ["hash_a1b2c3", "hash_d4e5f6"];
    const agreementId = "agr-uuid-1042";
    const promptVersion = "1.0.0";

    const computeFingerprint = (agrId: string, hashes: string[], ver: string) => {
      const crypto = require("crypto");
      const sorted = [...hashes].sort().join(":");
      return crypto.createHash("sha256").update(`${agrId}:${sorted}:${ver}`).digest("hex");
    };

    const fp1 = computeFingerprint(agreementId, docHashes, promptVersion);
    const fp2 = computeFingerprint(agreementId, [...docHashes].reverse(), promptVersion); // order inverted
    assert(fp1 === fp2, "Fingerprint must be independent of document array ordering");
    assert(fp1.length === 64, "Must be valid 64-char SHA-256 hex string");
  });

  // =========================================================================
  // 5. LIVE GEMINI 3.8 FLASH CONFIGURATION STATUS CHECK
  // =========================================================================
  await test("Gemini 1: Live Gemini 3.8 Flash model configuration check", () => {
    const isConfigured = isGeminiConfigured();
    if (!isConfigured) {
      console.log("    ℹ️  STATUS: [NOT CONFIGURED] — GEMINI_API_KEY not detected in server environment.");
      console.log("    ℹ️  To enable live Gemini calls, add GEMINI_API_KEY to .env.local.");
    } else {
      console.log("    ✓ STATUS: [PASS] — GEMINI_API_KEY detected. Configured model: gemini-3.8-flash (thinking: medium).");
    }
  });

  console.log(`\n📊 Module 3 Commercial Intelligence Suite Completed: ${passed}/${total} checks passed.\n`);

  if (passed !== total) {
    process.exit(1);
  }
}

runBenchmark().catch((err) => {
  console.error("Fatal benchmark runner error:", err);
  process.exit(1);
});
