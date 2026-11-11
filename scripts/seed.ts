// scripts/seed.ts
/**
 * Canonical Idempotent Database Seeder for TERMBridge
 *
 * Populates Supabase with the canonical demonstration dataset:
 * - 13 active commercial flows
 * - $24,820 total outstanding value
 * - 4 agreements in review
 * - 3 awaiting counterparty
 * - 6 ready to invoice
 * - 2 completed agreements
 *
 * Usage:
 *   npx tsx scripts/seed.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

// 1. Load .env.local if present
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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const demoEmail = process.env.TERMBRIDGE_DEMO_EMAIL || process.env.DEMO_EMAIL;
const demoPassword = process.env.TERMBRIDGE_DEMO_PASSWORD || process.env.DEMO_PASSWORD;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("❌ ERROR: Database seed requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  console.error("Please configure them in .env.local before running the seed script.");
  process.exit(1);
}

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function runSeed() {
  console.log("🌱 Starting canonical database seed for TERMBridge...");

  // 1. Create or retrieve demo workspace
  const workspaceSlug = "northstar-supply";
  let workspaceId: string;

  const { data: existingWorkspace } = await adminClient
    .from("workspaces")
    .select("id")
    .eq("slug", workspaceSlug)
    .maybeSingle();

  if (existingWorkspace) {
    workspaceId = existingWorkspace.id;
    console.log(`✓ Found existing demo workspace (${workspaceId})`);
  } else {
    const { data: newWorkspace, error: wsError } = await adminClient
      .from("workspaces")
      .insert({
        name: "Northstar Supply",
        slug: workspaceSlug,
        default_currency: "USD",
      })
      .select("id")
      .single();

    if (wsError || !newWorkspace) {
      throw new Error(`Failed to create workspace: ${wsError?.message}`);
    }
    workspaceId = newWorkspace.id;
    console.log(`✓ Created demo workspace (${workspaceId})`);
  }

  // 2. Create demo user if configured
  if (demoEmail && demoPassword) {
    let userId: string | null = null;
    const { data: usersData } = await adminClient.auth.admin.listUsers();
    const existingUser = usersData?.users?.find((u) => u.email === demoEmail);

    if (existingUser) {
      userId = existingUser.id;
      console.log(`✓ Demo user already exists (${demoEmail})`);
    } else {
      const { data: newUser, error: userError } = await adminClient.auth.admin.createUser({
        email: demoEmail,
        password: demoPassword,
        email_confirm: true,
        user_metadata: { name: "Alex Morgan", role: "Finance Administrator" },
      });

      if (userError || !newUser?.user) {
        console.warn(`⚠️ Warning: could not create demo user: ${userError?.message}`);
      } else {
        userId = newUser.user.id;
        console.log(`✓ Created demo user (${demoEmail})`);
      }
    }

    if (userId) {
      // Upsert membership
      const { error: memberError } = await adminClient.from("workspace_members").upsert(
        {
          workspace_id: workspaceId,
          user_id: userId,
          role: "owner",
        },
        { onConflict: "workspace_id,user_id" }
      );
      if (!memberError) {
        console.log(`✓ Assigned owner role for demo user in workspace`);
      }
    }
  }

  // 3. Seed Counterparties (Upsert by workspace_id + display_name)
  const counterpartiesData = [
    { display_name: "Northstar Supply", legal_name: "Northstar Supply Corp.", entity_type: "supplier", email: "treasury@northstar-supply.com", country: "United States", currency: "USD" },
    { display_name: "Meridian Retail", legal_name: "Meridian Retail Enterprises LLC", entity_type: "buyer", email: "e.ramos@meridianretail.com", country: "United States", currency: "USD" },
    { display_name: "Apex Distribution", legal_name: "Apex Distribution Holdings Inc.", entity_type: "buyer", email: "m.vance@apexdist.com", country: "United States", currency: "USD" },
    { display_name: "Northline Traders", legal_name: "Northline Traders Corp.", entity_type: "buyer", email: "c.beauchamp@northlinetraders.com", country: "Canada", currency: "USD" },
    { display_name: "Vertex Supplies", legal_name: "Vertex Supplies Group", entity_type: "buyer", email: "d.lin@vertexsupplies.com", country: "United States", currency: "USD" },
    { display_name: "Cascade Commerce", legal_name: "Cascade Commerce Partners LLC", entity_type: "buyer", email: "s.reed@cascadecommerce.com", country: "United States", currency: "USD" },
    { display_name: "Solstice Industrial", legal_name: "Solstice Industrial Supply Ltd.", entity_type: "buyer", email: "procurement@solsticeind.com", country: "United States", currency: "USD" },
    { display_name: "Crestline Logistics", legal_name: "Crestline Logistics Inc.", entity_type: "buyer", email: "orders@crestlinelogistics.com", country: "United States", currency: "USD" },
    { display_name: "Vanguard Materials", legal_name: "Vanguard Materials Co.", entity_type: "buyer", email: "ops@vanguardmaterials.com", country: "United States", currency: "USD" },
    { display_name: "Atlas Manufacturing", legal_name: "Atlas Manufacturing Ltd.", entity_type: "buyer", email: "desk@atlasmfg.com", country: "United States", currency: "USD" },
    { display_name: "Zenith Corp", legal_name: "Zenith Corporation", entity_type: "buyer", email: "purchasing@zenithcorp.com", country: "United States", currency: "USD" },
    { display_name: "Pacific Hardware", legal_name: "Pacific Hardware Supplies", entity_type: "buyer", email: "intake@pacifichardware.com", country: "United States", currency: "USD" },
    { display_name: "Matrix Components", legal_name: "Matrix Components Global", entity_type: "buyer", email: "supply@matrixcomp.com", country: "United States", currency: "USD" },
    { display_name: "Horizon Freight", legal_name: "Horizon Freight Services", entity_type: "buyer", email: "admin@horizonfreight.com", country: "United States", currency: "USD" },
    { display_name: "Nexus Logistics", legal_name: "Nexus Logistics Worldwide", entity_type: "buyer", email: "procurement@nexuslog.com", country: "United States", currency: "USD" },
    { display_name: "Summit Dynamics", legal_name: "Summit Dynamics Corp.", entity_type: "buyer", email: "orders@summitdynamics.com", country: "United States", currency: "USD" },
  ];

  const cpMap: Record<string, string> = {};
  for (const cp of counterpartiesData) {
    const { data: existingCp } = await adminClient
      .from("counterparties")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("display_name", cp.display_name)
      .maybeSingle();

    if (existingCp) {
      cpMap[cp.display_name] = existingCp.id;
    } else {
      const { data: newCp } = await adminClient
        .from("counterparties")
        .insert({
          workspace_id: workspaceId,
          display_name: cp.display_name,
          legal_name: cp.legal_name,
          entity_type: cp.entity_type,
          email: cp.email,
          country: cp.country,
          currency: cp.currency,
          status: "active",
        })
        .select("id")
        .single();
      if (newCp) cpMap[cp.display_name] = newCp.id;
    }
  }
  console.log(`✓ Seeded ${Object.keys(cpMap).length} counterparties`);

  const supplierId = cpMap["Northstar Supply"];

  // 4. Seed Canonical 13 Active Commercial Agreements + 2 Completed
  const agreementsData = [
    // --- 4 Needs Review ---
    { ref: "AGR-1042", buyer: "Meridian Retail", title: "Master Supplier Agreement v2.1 — Meridian Retail", status: "needs_review", poNum: "PO-8821", amount: 4500, terms: "Net 30" },
    { ref: "AGR-1040", buyer: "Crestline Logistics", title: "Commercial Logistics Supply Agreement", status: "needs_review", poNum: "PO-8817", amount: 1800, terms: "Net 30" },
    { ref: "AGR-1037", buyer: "Vanguard Materials", title: "Raw Material Purchasing Agreement", status: "needs_review", poNum: "PO-8812", amount: 1450, terms: "Net 30" },
    { ref: "AGR-1034", buyer: "Atlas Manufacturing", title: "Component Procurement Schedule", status: "needs_review", poNum: "PO-8791", amount: 920, terms: "Net 30" },

    // --- 3 Awaiting Counterparty ---
    { ref: "AGR-1041", buyer: "Apex Distribution", title: "Distribution Master Purchasing Terms", status: "counteroffer_sent", poNum: "PO-8819", amount: 5250, terms: "Net 60 -> Net 30 (2/10)" },
    { ref: "AGR-1035", buyer: "Cascade Commerce", title: "Wholesale Fulfillment Agreement", status: "awaiting_counterparty", poNum: "PO-8798", amount: 2400, terms: "FOB Origin Split" },
    { ref: "AGR-1033", buyer: "Solstice Industrial", title: "Standard Commercial Supply Agreement", status: "awaiting_counterparty", poNum: "PO-8789", amount: 1600, terms: "Net 30" },

    // --- 6 Ready to Invoice ---
    { ref: "AGR-1039", buyer: "Northline Traders", title: "Apparel & Retail Distribution Master Contract", status: "ready_to_invoice", poNum: "PO-8815", amount: 2400, terms: "Net 30" },
    { ref: "AGR-1032", buyer: "Solstice Industrial", title: "Industrial Tools Purchasing Annex", status: "ready_to_invoice", poNum: "PO-8785", amount: 1500, terms: "Net 15" },
    { ref: "AGR-1030", buyer: "Zenith Corp", title: "Precision Equipment Order Agreement", status: "ready_to_invoice", poNum: "PO-8780", amount: 1100, terms: "Net 30" },
    { ref: "AGR-1029", buyer: "Pacific Hardware", title: "Hardware Procurement Agreement", status: "ready_to_invoice", poNum: "PO-8774", amount: 750, terms: "Net 30" },
    { ref: "AGR-1028", buyer: "Matrix Components", title: "Electronic Components Supply Schedule", status: "ready_to_invoice", poNum: "PO-8770", amount: 650, terms: "Net 30" },
    { ref: "AGR-1027", buyer: "Horizon Freight", title: "Freight & Storage Handling Terms", status: "ready_to_invoice", poNum: "PO-8765", amount: 500, terms: "Net 30" },

    // --- 2 Completed ---
    { ref: "AGR-1038", buyer: "Vertex Supplies", title: "Packaging Tooling & Supply Agreement", status: "completed", poNum: "PO-8809", amount: 6800, terms: "Net 30" },
    { ref: "AGR-1025", buyer: "Nexus Logistics", title: "Logistics Hub Master Supply Agreement", status: "completed", poNum: "PO-8742", amount: 7200, terms: "Net 30" },
  ];

  for (const agr of agreementsData) {
    const buyerId = cpMap[agr.buyer];
    if (!buyerId) continue;

    // Upsert agreement
    let agreementId: string;
    const { data: existingAgr } = await adminClient
      .from("commercial_agreements")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("agreement_reference", agr.ref)
      .maybeSingle();

    if (existingAgr) {
      agreementId = existingAgr.id;
    } else {
      const { data: newAgr, error: agrError } = await adminClient
        .from("commercial_agreements")
        .insert({
          workspace_id: workspaceId,
          agreement_reference: agr.ref,
          title: agr.title,
          buyer_id: buyerId,
          supplier_id: supplierId,
          status: agr.status,
          currency: "USD",
          default_payment_terms: agr.terms,
        })
        .select("id")
        .single();
      if (agrError || !newAgr) {
        console.error(`Error seeding agreement ${agr.ref}:`, agrError?.message);
        continue;
      }
      agreementId = newAgr.id;
    }

    // Upsert purchase order
    const { data: existingPO } = await adminClient
      .from("purchase_orders")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("po_number", agr.poNum)
      .maybeSingle();

    if (!existingPO) {
      const { data: newPO } = await adminClient
        .from("purchase_orders")
        .insert({
          workspace_id: workspaceId,
          po_number: agr.poNum,
          buyer_id: buyerId,
          supplier_id: supplierId,
          linked_agreement_id: agreementId,
          status: agr.status,
          currency: "USD",
          subtotal: agr.amount,
          total_amount: agr.amount,
          requested_payment_terms: agr.terms,
          received_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (newPO) {
        // Add sample line item
        await adminClient.from("purchase_order_line_items").insert({
          workspace_id: workspaceId,
          purchase_order_id: newPO.id,
          product_name: `Commercial Fulfillment Order (${agr.ref})`,
          quantity: 1,
          unit_price: agr.amount,
          line_total: agr.amount,
        });
      }
    }
  }
  console.log(`✓ Seeded ${agreementsData.length} commercial agreements and purchase orders ($24,820 active outstanding)`);

  // 5. Seed Agreement Terms for AGR-1042
  const { data: agr1042 } = await adminClient
    .from("commercial_agreements")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("agreement_reference", "AGR-1042")
    .maybeSingle();

  if (agr1042) {
    const terms1042 = [
      { key: "unit_price", label: "Unit price", category: "pricing", value: { contract: "$100.00", request: "$100.00", status: "matched", clause: "Clause 4.1" } },
      { key: "quantity", label: "Quantity", category: "quantity", value: { contract: "Minimum 50 units", request: "45 units", status: "conflict", clause: "Clause 4.2" } },
      { key: "discount", label: "Discount", category: "discount", value: { contract: "10% above 50 units", request: "15%", status: "conflict", clause: "Clause 4.2" } },
      { key: "payment_terms", label: "Payment terms", category: "payment", value: { contract: "Net 30", request: "Net 30", status: "matched", clause: "Clause 5.1" } },
      { key: "delivery", label: "Delivery", category: "delivery", value: { contract: "7 business days", request: "3 business days", status: "needs_confirmation", clause: "Clause 7.1" } },
    ];

    for (const t of terms1042) {
      const { data: existingTerm } = await adminClient
        .from("agreement_terms")
        .select("id")
        .eq("agreement_id", agr1042.id)
        .eq("term_key", t.key)
        .maybeSingle();

      if (!existingTerm) {
        await adminClient.from("agreement_terms").insert({
          workspace_id: workspaceId,
          agreement_id: agr1042.id,
          term_key: t.key,
          term_label: t.label,
          term_category: t.category,
          term_value: t.value,
          currency: "USD",
        });
      }
    }
    console.log(`✓ Seeded 5 commercial terms for AGR-1042`);
  }

  // 6. Seed Commercial Rules
  const rulesData = [
    { name: "Tier-1 Volume Threshold", rule_type: "threshold", priority: 1, config: { minUnits: 50, maxDiscount: 0.10 } },
    { name: "Payment Terms Standard", rule_type: "payment_terms", priority: 2, config: { defaultTerms: "Net 30", earlyDiscount: 0.02 } },
    { name: "Expedited Fulfillment Lead Time", rule_type: "fulfillment", priority: 3, config: { minDays: 5, surcharge: 250 } },
    { name: "PayPal Commercial Invoicing Gate", rule_type: "gate", priority: 4, config: { gateCondition: "all_terms_approved" } },
  ];

  for (const r of rulesData) {
    const { data: existingRule } = await adminClient
      .from("commercial_rules")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("name", r.name)
      .maybeSingle();

    if (!existingRule) {
      await adminClient.from("commercial_rules").insert({
        workspace_id: workspaceId,
        name: r.name,
        rule_type: r.rule_type,
        priority: r.priority,
        configuration: r.config,
        is_active: true,
      });
    }
  }
  console.log(`✓ Seeded ${rulesData.length} commercial policy rules`);

  console.log("\n🎉 Canonical database seed completed successfully!");
}

runSeed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
