# Security verification checklist

Run this before every production deploy. It is ordered by how badly each item fails: the database section can leak an entire customer table, the last section only slows down an investigation.

---

## 1. Database (highest severity)

**Run the two verification views from migration `0010`:**

```sql
select * from public.security_rls_status where status <> 'ok';
select * from public.security_definer_audit where status <> 'ok';
```

Both must return **zero rows**.

- `EXPOSED — RLS disabled` means anyone with the publishable key can read that table. This is how most Supabase data breaches happen.
- `LOCKED — RLS on, no policies` denies everything silently. It looks like missing data, not a misconfiguration, so it usually reaches production and gets debugged for hours.
- `UNSAFE — SECURITY DEFINER without search_path` lets a caller create a shadowing object in an earlier schema and have it run with the function owner's privileges.

**Then verify by behaviour, not by reading policies:**

- [ ] Sign in as customer A, attempt to fetch customer B's order by ID. Expect empty.
- [ ] Same for addresses, cart, payments, refunds, notifications.
- [ ] Confirm an unauthenticated client cannot read `coupons` (live codes are commercially sensitive).
- [ ] Confirm `webhook_events`, `rate_limits`, and `security_events` are unreadable by `anon` and `authenticated`.
- [ ] Confirm a non-admin cannot insert into `user_roles` — this is the privilege-escalation path.

**Keys:**

- [ ] `SUPABASE_SECRET_KEY` appears in **no** file with `NEXT_PUBLIC_`, no client component, and no committed `.env`.
- [ ] Run `git log -p | grep -iE "secret|sk_live|whsec_|service_role"` on the full history. A rotated key is still a leaked key until rotated.
- [ ] Every `createAdminClient()` call site has an explicit ownership check — it bypasses RLS, so the database guardrail is off.

---

## 2. Payments and money

- [ ] Send a webhook with a tampered signature → expect **400**, no state change.
- [ ] Replay a valid webhook twice → second is ignored (`webhook_events` unique constraint).
- [ ] Send a webhook whose amount differs from the order → `AMOUNT_MISMATCH`, order stays `pending`.
- [ ] Confirm the middleware matcher excludes `/api/webhooks` (otherwise providers get redirected to `/login` and **webhooks silently never fire**).
- [ ] Confirm Stripe **live-mode** signing secret is set in production, not the test one.
- [ ] Attempt checkout with a `shippingAddressId` belonging to another user → rejected.
- [ ] Double-submit an order → one order, via the idempotency key.

---

## 3. Application

- [ ] Every server action either calls `requireAdmin()`/`requireUser()` or is deliberately public. A server action is a public HTTP endpoint; guarding the page that renders the button protects nothing.
- [ ] Every action validates input with Zod **before** using it.
- [ ] Authorization uses `getUser()`, never `getSession()`. `getSession()` only decodes the cookie; `getUser()` revalidates against the auth server.
- [ ] Replace the `.or()` search construction in `BaseRepository` with `buildSearchClause()` from `query-safety.ts`.
- [ ] All `dangerouslySetInnerHTML` call sites pass through `sanitizeRichText()`. Grep for it: `grep -rn "dangerouslySetInnerHTML" src/`.
- [ ] Rate limiting uses the Postgres-backed limiter, not the Phase 5 in-memory placeholder.
- [ ] Auth, coupon, and payment limiters use `onError: "closed"`.

**Cookies** — verify in DevTools → Application → Cookies:

| Cookie | httpOnly | Reason |
|---|---|---|
| Supabase auth | ✅ | session token |
| `cart_session` | ✅ | capability token for guest carts |
| `cart_coupon` | ✅ | affects pricing |
| `consent_state` | ❌ | read by the banner; a preference, not a credential |
| `visitor_id` | ❌ | pseudonymous id |
| `recently_viewed` | ❌ | product ids only |

All must be `sameSite=lax` (or `strict`) and `secure` in production.

---

## 4. Headers and transport

Test with [securityheaders.com](https://securityheaders.com) and your browser console.

- [ ] CSP present on all routes; `/admin` and `/checkout` use nonce + `strict-dynamic`.
- [ ] **Zero CSP violations** in the console on: home, product, cart, checkout, admin, payment iframe.
- [ ] HSTS enabled **only** after confirming every subdomain serves HTTPS — this is hard to reverse.
- [ ] `frame-ancestors 'none'` and `X-Frame-Options: DENY`.
- [ ] `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` — cheap and high value.

---

## 5. Infrastructure

- [ ] Production and development use **separate Supabase projects**.
- [ ] Supabase → Authentication → **leaked password protection enabled** (checks HaveIBeenPwned).
- [ ] Redirect URL allowlist has no wildcards that would defeat open-redirect protection.
- [ ] Custom SMTP configured (the built-in sender caps at ~2 emails/hour and will silently drop password resets).
- [ ] `robots.ts` blocks all crawling when `VERCEL_ENV !== "production"`.
- [ ] Cron jobs scheduled: `release_expired_reservations`, `refresh_analytics`, `purge_rate_limits`, media sweeper.
- [ ] `npm audit --production` clean, or every finding consciously accepted.
- [ ] Database backups enabled and a **restore actually tested** — an untested backup is a hypothesis.

---

## 6. Incident readiness

- [ ] Error monitoring wired up (Sentry or equivalent) with alerts on `severity = 'critical'` security events.
- [ ] You know how to rotate each key without downtime: Supabase secret, Stripe, Razorpay, Resend.
- [ ] You know how to force-invalidate all sessions (Supabase → Auth → sign out all users).
- [ ] Someone other than you can perform both of the above.

---

## What this checklist does not cover

It verifies the things this codebase controls. It is not a penetration test, not a compliance audit, and not legal advice. Before handling real customer payments at volume, get an independent security review and have someone qualified check your DPDP obligations — particularly consent records, retention periods, and your data-processing agreements with Razorpay, Stripe, Supabase, Vercel, and Meta.
