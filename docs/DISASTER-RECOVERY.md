# Backup and disaster recovery

Written to be readable at 2am by someone who did not write it.

---

## What Supabase actually protects

| Plan | Automated backups |
|---|---|
| **Free** | **None downloadable.** Projects also pause after 7 days of inactivity. |
| Pro | 7 days of daily snapshots |
| Team | 14 days |
| Enterprise | 30 days |

Point-in-Time Recovery is a paid add-on (roughly $100/month per 7 days of retention, requires at least a Small compute add-on). It buys second-level granularity instead of daily.

### The gap almost everyone misses

**Backups and PITR cover the database only.** Outside the recovery boundary, at every price point:

- Storage bytes — every product image, every uploaded asset
- Auth configuration — providers, redirect allowlists, email templates
- Edge Functions and their secrets
- Project settings, API keys, cron schedules

Paying for PITR and assuming you are covered is the expensive version of this mistake. You are covered for *one* of the five things that can go wrong.

---

## The strategy

Three layers, each covering the previous one's failure mode.

**1. Provider-native** — daily snapshots or PITR. Protects against disk failure and bad writes. Requires a paid plan; on Free you have none of this.

**2. Independent off-provider** — the nightly `pg_dump` in `.github/workflows/backup.yml`, stored in a bucket your Supabase account cannot reach. Protects against the failures native backups cannot: a compromised account, an accidental project deletion, a lapsed card.

**3. Reproducible configuration** — migrations, Edge Functions, and RLS policies live in Git. This is why "never hand-edit the schema in the dashboard" matters: it is what makes a from-scratch rebuild possible.

**Storage needs its own job.** Nothing above backs up your images. Mirror the buckets on a schedule (`supabase storage cp -r` or the S3-compatible endpoint) or accept that a storage loss means re-uploading every product photo by hand.

---

## Recovery objectives

Decide these deliberately; they drive what you pay for.

| | Free plan | Pro + nightly dump | Pro + PITR |
|---|---|---|---|
| **RPO** (data you can lose) | up to 24h | up to 24h | seconds |
| **RTO** (time to restore) | 1–3h | 1–2h | 15–30 min |

For a store taking real orders, a 24-hour RPO means potentially losing a full day of orders, payments, and customer signups — while the payment provider still holds the money and the customers still expect their goods. That reconciliation is worse than the outage.

---

## Runbooks

### A. Accidental data loss (bad UPDATE, wrong DELETE)

1. **Stop the bleeding.** If a script is running, kill it. If a deploy caused it, roll back in Vercel (Deployments → previous → Promote to Production). Vercel rollbacks are instant and do not rebuild.
2. **Do not "fix" it with more writes.** Every subsequent write shortens your options.
3. Restore:
   - *PITR:* Dashboard → Database → Point in Time → choose a timestamp **just before** the incident.
   - *Daily backup:* Database → Backups → restore. You lose everything since the snapshot.
   - *Free plan:* your nightly dump is the only option. See C.
4. Reconcile payments. Any order taken after the restore point exists at Stripe/Razorpay but not in your database. Export their transactions for the window and recreate those orders manually.

### B. Compromised key

1. **Rotate first, investigate second.** Settings → API Keys → create new secret key → update Vercel and `.env.local` → revoke the old one.
2. Force sign-out of all users: Authentication → Sign out all users.
3. Audit what was touched:
   ```sql
   select * from public.audit_logs
   where created_at > '<suspected compromise time>'
   order by created_at desc;

   select * from public.security_events
   where severity in ('warning','critical')
     and created_at > '<time>'
   order by created_at desc;
   ```
4. Rotate every other credential the same key could have reached: payment providers, Resend, backup bucket.

### C. Total project loss

The scenario the independent backup exists for.

```bash
# 1. Create a new Supabase project, note the ref.

# 2. Schema from Git — the source of truth.
npx supabase link --project-ref <new-ref>
npm run db:push

# 3. Data from the most recent dump.
gunzip data-YYYYMMDD-HHMM.sql.gz
psql "$NEW_SESSION_POOLER_URL" -f data-YYYYMMDD-HHMM.sql

# 4. Regenerate types and redeploy.
npm run db:types
```

Then reconstruct by hand, in this order:

1. Auth providers and redirect allowlist
2. Storage buckets — migration `0007` recreates them; the **files** come from your storage mirror
3. Edge Function secrets (`supabase secrets set …`) and redeploy the functions
4. Cron schedules (the SQL block in `DEPLOYMENT.md`)
5. Vercel environment variables → new project URL and keys
6. Payment provider webhook endpoints → new domain if it changed

Realistic time: **two to four hours**, most of it on steps 1–6, not the database. That is why this list exists.

---

## The only part that matters

**A backup you have never restored is a hypothesis, not a backup.**

Once a quarter, restore your most recent dump into a scratch Supabase project and confirm: row counts are plausible, RLS policies came across (`select * from security_rls_status`), and the app boots against it. Put it in the calendar.

The failure mode this prevents is discovering, during a real incident, that the dump has been zero bytes for five months because a token expired and the alert went to an inbox nobody reads.

---

## Monthly maintenance

- [ ] Backup files present in the bucket, and file size is plausible
- [ ] No failed runs in GitHub Actions history
- [ ] Access tokens not near expiry (Supabase token, backup bucket credentials)
- [ ] `npm audit --production`
- [ ] Free-plan projects: confirm not paused for inactivity
- [ ] Quarterly: **restore test**
