# TERMBridge — Supabase Database & Storage Setup Guide

This guide walks you through connecting your own Supabase project to enable persistent storage, Row Level Security (RLS), email/password authentication, and private document storage for TERMBridge.

---

## 1. Create a Supabase Project

1. Navigate to [Supabase](https://supabase.com) and sign in.
2. Click **New Project**.
3. Choose an organization, enter a name (e.g. `termbridge-prod` or `termbridge-dev`), select your nearest database region, and choose a strong database password.
4. Wait approximately 1–2 minutes for the database cluster to provision.

---

## 2. Obtain Project Credentials

In your Supabase project dashboard:

1. Go to **Project Settings** (gear icon) → **API**.
2. Locate the following values:
   - **Project URL:** e.g. `https://xyzprojectref.supabase.co`
   - **anon / public key:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
   - **service_role key (secret):** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (Click *Reveal key*).

> ⚠️ **CRITICAL SECURITY NOTE:**
> - The `service_role` key bypasses Row Level Security.
> - **NEVER** commit the service role key to git.
> - **NEVER** prefix it with `NEXT_PUBLIC_`.
> - It is used strictly on the server-side by the idempotent database seed script (`npm run db:seed`).

---

## 3. Configure Local Environment Variables

1. In the project root, copy the template:
   ```bash
   cp .env.example .env.local
   ```
2. Populate the keys in `.env.local`:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-anon-publishable-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-secret-key
   TERMBRIDGE_DEMO_EMAIL=alex.morgan@northstar-supply.com
   TERMBRIDGE_DEMO_PASSWORD=ChooseASecurePassword123!
   ```

---

## 4. Apply Database SQL Migrations

Apply the migration scripts located in `supabase/migrations/` in ascending numerical order.

You can run them using the **Supabase Dashboard SQL Editor**:
1. Open your Supabase Dashboard → **SQL Editor** → **New query**.
2. Paste and run each file in sequence:
   - `00001_create_workspaces.sql` (Creates `workspaces`, `workspace_members`, and RLS helper functions)
   - `00002_create_counterparties.sql` (Creates buyers and suppliers directory)
   - `00003_create_commercial_agreements.sql` (Creates agreements, versions, and terms)
   - `00004_create_purchase_orders.sql` (Creates purchase orders and line items with `NUMERIC(15,2)` precision)
   - `00005_create_documents.sql` (Creates document groups, versioned documents, and entity links)
   - `00006_create_commercial_rules.sql` (Creates policy rules table)
   - `00007_create_audit_events.sql` (Creates audit event logging table)
   - `00008_enable_rls.sql` (Enables Row Level Security on all tables and creates workspace isolation policies)
   - `00009_audit_immutability_and_security.sql` (Revokes UPDATE/DELETE on audit_events, enforces audit trigger, validates polymorphic links, and hardens RBAC)
   - `00010_audit_authenticity.sql` (Revokes direct INSERT on audit_events, installs TRUNCATE protection trigger, enforces supported event_type constraint, deploys secure append_audit_event RPC, and installs automatic database mutation triggers)
   - `00011_harden_audit_rpc_and_search_paths.sql` (Revokes EXECUTE on append_audit_event from PUBLIC/anon/authenticated, grants strictly to service_role, installs automatic creation triggers for all core entities, and hardens all SECURITY DEFINER functions with SET search_path = '')

Alternatively, if using the Supabase CLI:
```bash
supabase db push
```

---

## 5. Configure the Private Document Storage Bucket

1. In the Supabase Dashboard, click **Storage** (folder icon).
2. Click **New bucket**.
3. Bucket name: **`termbridge-documents`** (must match exactly).
4. Set visibility: **Private** (toggle *Public bucket* to **OFF**).
5. Click **Create bucket**.

### Storage Access Policies
In the Storage dashboard under `termbridge-documents` → **Policies**:
- Click **New Policy** → **For authenticated users**.
- Select `SELECT` and set expression:
  ```sql
  bucket_id = 'termbridge-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT get_user_workspace_ids()::text
  )
  ```
- Repeat for `INSERT` with the same expression to ensure authenticated users can only write to their assigned workspace folder.

---

## 6. Seed the Canonical Demonstration Dataset

Run the automated idempotent seed script:
```bash
npm run db:seed
```

This will:
- Check for or create the demo workspace (`Northstar Supply`).
- Provision the demo user (`alex.morgan@northstar-supply.com`) and assign `owner` membership.
- Seed the 16 verified counterparties.
- Seed the 13 active commercial flows ($24,820 total value, 4 in review, 3 awaiting counterparty, 6 ready to invoice) + 2 completed transactions.
- Seed the 5 commercial terms for `AGR-1042`.
- Seed commercial policy rules.

---

## 7. Authenticate & Verify

1. Start the dev server: `npm run dev`
2. Open `http://localhost:3000/login`
3. Log in with your demo account credentials.
4. You will be redirected to `/workspace/overview` with live PostgreSQL metrics.
