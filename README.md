# TERMBridge — Commercial Agreement & Payment Workflow Platform

> **"From agreement to payment."**
> Turn complex business purchasing agreements into clear, validated, and executable transactions.

---

## 1. Project Overview & Architecture

TERMBridge is a specialized B2B commercial agreement and settlement platform designed for finance directors, treasury administrators, and procurement teams.

### Core Commercial Lifecycle
```
Purchase Order → Contract Interpretation → Commercial Validation → Negotiation → Mutual Approval → PayPal Invoice → Payment Tracking
```

### Module Architecture
- **Frontend Foundation (Module 1):** Next.js 14.2.35 App Router, React 18, TypeScript 5, Tailwind CSS, Framer Motion, and Lucide React.
- **Data & Ingestion Engine (Module 2):**
  - Supabase PostgreSQL with strict multi-tenant Row Level Security (RLS).
  - Private Supabase Storage for business documents with short-lived signed URLs.
  - Server-side validation via Zod schemas, file magic signature verification, and ZIP Office content inspection.
  - Dual Mode Support: Runs seamlessly in demo mode with canonical mock data when unconfigured, or in full database mode when Supabase is connected.

```
termbridge/
├── supabase/
│   └── migrations/                 # 9 versioned SQL migrations with RLS & audit triggers
│       ├── 00001_create_workspaces.sql
│       ├── 00002_create_counterparties.sql
│       ├── 00003_create_commercial_agreements.sql
│       ├── 00004_create_purchase_orders.sql
│       ├── 00005_create_documents.sql
│       ├── 00006_create_commercial_rules.sql
│       ├── 00007_create_audit_events.sql
│       ├── 00008_enable_rls.sql
│       └── 00009_audit_immutability_and_security.sql
├── scripts/
│   └── seed.ts                     # Canonical idempotent database seeder
├── tests/
│   ├── document-validation.test.ts # Unit tests for document security & Zod schemas
│   └── security-preflight.test.ts  # Preflight suite for migrations, RLS & immutability
├── docs/
│   └── SUPABASE_SETUP.md           # Step-by-step database setup guide
├── src/
│   ├── app/
│   │   ├── api/                    # 11 Next.js 14 App Router API endpoints
│   │   ├── login/                  # Authentication entry point
│   │   ├── auth/callback/          # Session cookie exchange
│   │   └── workspace/              # 11 Commercial workspace screens
│   ├── components/                 # Modals, workbench panels, UI primitives
│   ├── hooks/                      # useSupabaseMode auth & environment hook
│   ├── lib/
│   │   ├── supabase/               # Browser, server, and admin Supabase clients
│   │   └── server/                 # Repositories, services, and validation schemas
│   └── types/                      # Shared commercial TypeScript types
└── middleware.ts                   # Session refresh and auth route protection
```

---

## 2. Environment Variables

Create `.env.local` using the template `.env.example`:

```bash
cp .env.example .env.local
```

| Variable | Description | Exposure |
|---|---|:---:|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project API URL (`https://xyz.supabase.co`) | Public (Browser/Client) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Modern publishable or legacy anon key | Public (Browser/Client) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role secret (bypasses RLS for seed script) | **Strictly Server-Side** |
| `TERMBRIDGE_DEMO_EMAIL` | Demo account email for `npm run db:seed` | Server-Side |
| `TERMBRIDGE_DEMO_PASSWORD` | Demo account password for `npm run db:seed` | Server-Side |

> ⚠️ Never prefix `SUPABASE_SERVICE_ROLE_KEY` with `NEXT_PUBLIC_`. It is strictly used by `scripts/seed.ts`.

---

## 3. Dual Mode Configuration

TERMBridge supports two clearly distinguished operational modes:

### Mode A: Demo Mode (Default, Unconfigured)
- Runs immediately out of the box with zero setup.
- Uses centralized canonical demonstration data (13 active flows, \$24,820 total value, 4 in review, 3 awaiting counterparty, 6 ready to invoice).
- Displays a discreet `Demo mode — database not connected` notification banner.
- Read-only actions simulate workflows safely without claiming to persist records.

### Mode B: Database Mode (Supabase Configured)
- Enabled as soon as `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are provided.
- Enforces authentication: unauthenticated visits to `/workspace/*` redirect to `/login`.
- Real database mutations use authenticated server-side APIs.
- Uploaded files are stored in private Supabase Storage under `termbridge-documents/{workspace_id}/{uuid}.ext`.
- Short-lived signed URLs protect document access.

---

## 4. Supabase Setup & Seeding

For complete instructions, see the [Supabase Setup Guide](docs/SUPABASE_SETUP.md).

Quick summary:
1. **Apply Migrations:** Run SQL scripts in `supabase/migrations/` in ascending order.
2. **Create Storage Bucket:** In Supabase Dashboard, create private bucket `termbridge-documents`.
3. **Seed Database:**
   ```bash
   npm run db:seed
   ```

---

## 5. Development & Testing Commands

```bash
# Run Next.js local development server
npm run dev

# Run unit tests for document validation, magic bytes & Zod schemas
npm run test:unit

# Run database security, migration preflight & RBAC test suite
npm run test:security

# Run database security integration test suite (requires active PostgreSQL instance)
npm run test:integration

# Seed canonical demonstration database
npm run db:seed

# TypeScript typechecking
npx tsc --noEmit

# Run Next.js ESLint
npm run lint

# Production compilation & static optimization
npm run build
```

---

## 6. Document Ingestion Engine

Supported formats:
- **PDF** (`application/pdf`) — validated with magic signature `%PDF`
- **DOCX** (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`) — verified ZIP header with `word/` directory structure
- **XLSX** (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`) — verified ZIP header with `xl/` directory structure
- **CSV** (`text/csv`) & **TXT** (`text/plain`)

### Security Controls:
- **Max size:** 10 MB.
- **Path Traversal Protection:** Filenames with `..`, `/`, `\`, null bytes, or hidden extensions are rejected.
- **Executable Blocking:** `.exe`, `.bat`, `.cmd`, `.msi`, `.sh`, `.app` files are strictly blocked.
- **Duplicate Detection:** Computes SHA-256 hash across file bytes; rejects duplicate uploads with HTTP 409 Conflict.
- **Storage Cleanup:** If database metadata insertion fails, the storage object is immediately purged to prevent orphaned bytes.

---

## 7. Security & Limitations

- **Row Level Security (RLS):** Every tenant table enforces workspace isolation via `get_user_workspace_ids()`.
- **Money Precision:** Monetary values use PostgreSQL `NUMERIC(15,2)`—never floating point.
- **Scope Boundary for Module 2:**
  - AI document parsing, OCR, and clause extraction will be implemented in Module 3.
  - Live PayPal OAuth, invoice generation, and payment capture will be implemented in subsequent modules.
