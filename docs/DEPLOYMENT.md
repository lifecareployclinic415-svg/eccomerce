# Deployment runbook

Follow this in order. Later steps assume earlier ones.

---

## 1. Two Supabase projects, not one

Before anything else: create a **second** Supabase project for production and keep `ubqwyeqkvxqryvsbkial` as development.

This is the step people skip and regret. Sharing one project means a migration test wipes real orders, and a seeded E2E run places fake orders against live inventory. Two projects cost nothing extra on the free plan.

```bash
# Development (existing)
npx supabase link --project-ref ubqwyeqkvxqryvsbkial
npm run db:push

# Production (new) — apply the identical migration set
npx supabase link --project-ref <production-ref>
npm run db:push
```

Migrations are the only way schema reaches production. Never hand-edit tables in the dashboard — the next `db push` will disagree with reality and fail in a confusing way.

---

## 2. GitHub

```bash
gh repo create my-store --private --source=. --push
```

Keep it **private**. The repo contains your schema, RLS policies, and business logic — a map of exactly where to look for weaknesses.

Add these repository secrets (Settings → Secrets and variables → Actions):

| Secret | Where it comes from |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | supabase.com/dashboard/account/tokens |
| `SUPABASE_PROJECT_REF` | production project ref |
| `SUPABASE_DB_PASSWORD` | set when you created the project |
| `SUPABASE_SESSION_POOLER_URL` | Connect → Session pooler (**not** direct) |
| `TEST_SUPABASE_*` | the dev project, for CI |
| `BACKUP_*` | your S3/R2 bucket credentials |

---

## 3. Vercel

Import the repo at vercel.com/new. Framework detection handles the build settings.

Set environment variables **per environment** — this is where most production incidents originate:

| Variable | Production | Preview |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | production project | dev project |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | production | dev |
| `SUPABASE_SECRET_KEY` | production | dev |
| `NEXT_PUBLIC_SITE_URL` | `https://yourdomain.com` | `https://preview.yourdomain.com` |
| `RAZORPAY_*` / `STRIPE_*` | **live** keys | **test** keys |

> Mixing test and live payment credentials across environments is the single most expensive misconfiguration available to you. A preview deployment pointed at live Stripe will happily take real money in a test flow.

---

## 4. Custom domain

1. Vercel → Project → Settings → Domains → add `yourdomain.com`.
2. At your registrar, add the records Vercel shows (usually an `A` for apex and `CNAME` for `www`).
3. Wait for DNS propagation — up to 48 hours, usually minutes.
4. Vercel provisions the TLS certificate automatically. **Confirm it is live before enabling HSTS**, because HSTS with a broken certificate locks browsers out of your site for the full `max-age`, and you cannot undo it from your end.

Then update everything that hardcodes the URL:

- `NEXT_PUBLIC_SITE_URL` in Vercel production
- Supabase → Authentication → URL Configuration → Site URL and redirect allowlist (no wildcards)
- Razorpay and Stripe webhook endpoints → `https://yourdomain.com/api/webhooks/...`
- Google Search Console → verify and submit `sitemap.xml` and `product/sitemap.xml`

---

## 5. Scheduled jobs

These run in Supabase, not Vercel. Enable `pg_cron` (Database → Extensions), then:

```sql
-- Abandoned checkouts silently hold stock forever without this.
select cron.schedule('release-stock', '*/5 * * * *',
  $$select public.release_expired_reservations()$$);

select cron.schedule('refresh-dashboard', '*/15 * * * *',
  $$select public.refresh_analytics()$$);

select cron.schedule('purge-rate-limits', '0 * * * *',
  $$select public.purge_rate_limits()$$);

-- Verify they are actually registered:
select jobname, schedule, active from cron.job;
```

The media sweeper needs an Edge Function (it deletes storage objects, which SQL cannot do) — see the comment block in migration `0007`.

---

## 6. Go-live checklist

Work top down. Items are ordered by what fails worst.

**Blocking — do not launch without these**

- [ ] `select * from public.security_rls_status where status <> 'ok';` returns **zero rows**
- [ ] `select * from public.security_definer_audit where status <> 'ok';` returns **zero rows**
- [ ] Signed in as customer A, you cannot read customer B's orders (test it, don't read the policy)
- [ ] Middleware matcher excludes `/api/webhooks` — otherwise providers get redirected to `/login` and **webhooks silently never fire**
- [ ] Live-mode webhook signing secrets set (Stripe signs test and live with *different* secrets)
- [ ] A real end-to-end purchase completed with a live card, then refunded
- [ ] `SUPABASE_SECRET_KEY` rotated after the value you pasted into chat
- [ ] `git log -p | grep -iE "sk_live|whsec_|sb_secret"` finds nothing

**Important**

- [ ] Custom SMTP configured in Supabase Auth (built-in sender caps around 2 emails/hour and will drop password resets)
- [ ] Leaked-password protection enabled (Auth → Policies)
- [ ] `robots.txt` on the production domain allows crawling; preview deployments do not
- [ ] Cron jobs registered and `cron.job` shows them active
- [ ] `/api/health` returns 200 and an uptime monitor polls it
- [ ] Sentry receiving events, with scrubbing verified on a deliberate test error
- [ ] Backup workflow has run **and you have restored from it once**

**Before real traffic**

- [ ] Lighthouse ≥ 90 on home, category, and product pages
- [ ] Checkout completed on a real phone, not just a desktop emulator
- [ ] Rich Results Test passes on a product URL
- [ ] Order confirmation email arrives and renders in Gmail and Outlook

---

## 7. First 48 hours

Watch these, in this order:

1. **Sentry** — any error in checkout or webhooks is urgent, everything else can wait.
2. **`webhook_events` where `processed_at is null`** — these are payments taken but not fulfilled. Nothing else on this list matters more.
3. **`security_events` where `severity = 'critical'`**
4. **Vercel function logs** for timeouts, especially on `place_order`.
5. **`orders` stuck in `pending` past `reserved_until`** — means the sweeper is not running.

```sql
-- The one query to run every morning of your first week
select id, provider, event_type, error, received_at
from public.webhook_events
where processed_at is null
order by received_at desc;
```
