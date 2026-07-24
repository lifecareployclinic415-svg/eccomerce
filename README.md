# eCommerce store — Next.js 15 + Supabase

Full-stack storefront and admin, built in 17 phases. Clean Architecture with a repository/service split, Row Level Security enforced at the database, atomic order placement, and signature-verified payments.

**Read this whole file before running anything.** There are two setup steps that cannot be skipped.

---

## Prerequisites

- Node 20 LTS or newer
- A Supabase project (two, ideally — one dev, one production)
- Supabase CLI (`npx supabase`)

---

## Setup

### 1. Install

```bash
npm install
```

### 2. Install shadcn/ui components — REQUIRED

These are not in the repo by design: shadcn copies component source into your project so you own it. The build **will fail** without this step.

```bash
npx shadcn@latest add button input label card badge table skeleton \
  dialog alert-dialog dropdown-menu select checkbox switch \
  radio-group sheet sidebar sonner form separator
```

Answer **yes** if it asks to overwrite `components.json` — the version in this repo is already configured for the `src/` layout and the `new-york` style.

### 3. Environment

```bash
cp .env.example .env.local
```

Fill in the four required values from Supabase → Project Settings → API Keys:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=          # server only — never prefix NEXT_PUBLIC_
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Everything else can stay empty until you reach that feature.

### 4. Database — REQUIRED

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npm run db:push      # applies all 9 migrations in order
npm run db:types     # regenerates src/types/database.types.ts
```

That second command matters. `database.types.ts` ships as a permissive placeholder, so until you run it every Supabase query is effectively untyped.

### 5. Verify security

In the Supabase SQL editor:

```sql
select * from public.security_rls_status where status <> 'ok';
select * from public.security_definer_audit where status <> 'ok';
```

Both must return **zero rows** before you put anything real in this database.

### 6. Run

```bash
npm run dev
```

---

## Project structure

```
src/
├── app/                    # routes only — thin
│   ├── (storefront)/       # customer-facing
│   ├── (admin)/            # admin, guarded
│   ├── (auth)/             # login, signup, reset
│   ├── api/                # webhooks, health
│   ├── sitemap.ts, robots.ts
│   └── globals.css         # design tokens live here
├── features/               # feature-based modules
│   └── <feature>/
│       ├── components/     # feature UI
│       ├── actions/        # server actions (use cases)
│       ├── services/       # business logic
│       ├── repositories/   # the ONLY place that talks to Supabase
│       └── schemas/        # Zod validation
├── components/
│   ├── ui/                 # shadcn (installed via CLI)
│   └── shared/             # cross-feature UI
├── lib/                    # supabase clients, security, utils
└── types/

supabase/
├── migrations/             # the schema — source of truth
├── functions/              # edge functions
└── tests/                  # pgTAP: RLS and SQL function tests
```

Dependencies point inward. Nothing in a service imports Supabase directly; that's what the repository boundary is for.

---

## Testing

Three tiers, because Vitest cannot render async Server Components:

```bash
npm run test        # Vitest — pure logic, schemas, route handlers
npm run test:db     # pgTAP — RLS policies, SQL functions (needs Docker)
npm run test:e2e    # Playwright — Server Components, user journeys
```

The most valuable file is `src/features/cart/services/pricing.service.test.ts`. Run it first — it verifies the money maths and depends on nothing external.

**Never test RLS from the Supabase SQL editor.** It runs as superuser and bypasses RLS, so every policy test passes while proving nothing. Use `npm run test:db`.

---

## Deploying

See `docs/DEPLOYMENT.md` for the full runbook. The short version:

1. Push to a **private** GitHub repo
2. Import into Vercel
3. Set env vars **per environment** — production gets live payment keys, preview gets test keys
4. Add a custom domain, then update `NEXT_PUBLIC_SITE_URL`, Supabase redirect URLs, and payment webhook endpoints
5. Schedule the cron jobs (SQL in `docs/DEPLOYMENT.md`) — without them, abandoned checkouts hold stock forever
6. Work through `docs/SECURITY-CHECKLIST.md`

---

## Status — read this

This is a **reference implementation**, not a finished store. The architecture, database, and every hard problem are done. Some screens are not.

### Complete and production-shaped

Database (9 migrations, RLS throughout) · auth with guards · cart with guest→user merge · pricing engine (integer paise, unit tested) · atomic order placement · Razorpay/Stripe/COD with webhook verification and idempotency · storage with signed uploads · CMS page builder · SEO with JSON-LD and sharded sitemaps · consent-first analytics · security layer · deployment and recovery runbooks.

### Built as one worked example

- **Admin: Products only.** The generic engine (`BaseRepository`, `DataTable`, `DataTableToolbar`) does the heavy lifting; each remaining module is roughly 80 lines. Copy `src/features/products/` and change the columns.
- **Product create/edit form** is not built. The schema, actions, and image uploader all exist — it needs the form wiring them together.

### Not built

Wishlist page · address book UI · order detail page · blog list and post pages · contact form page · admin section-editor UI · charts on the dashboard (data layer is done, `recharts` is installed).

### Known caveats

- **The SQL has never been executed.** Roughly 3,000 lines written without running it. Expect the `DO $$` blocks in the CMS and analytics migrations to need fixing first. Apply migrations one at a time if you hit errors.
- `database.types.ts` is a permissive placeholder until you run `npm run db:types`.
- Several files were assembled by splitting combined deliverables. Imports should resolve, but check the first build carefully.
- The E2E suite assumes a seeded test user and at least one in-stock product. Write `supabase/seed.sql` before running it.

### Suggested order of work

1. `npm run db:push` — fix any SQL errors
2. `npm run db:types`
3. `npm run build` — fix any remaining type errors
4. Seed a product and walk the storefront
5. Build the product create/edit form
6. Add admin modules from the Products template
