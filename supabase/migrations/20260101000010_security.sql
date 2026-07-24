-- =====================================================================
-- Migration: 0010_security.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- DURABLE RATE LIMITING
--
-- This replaces the in-memory Map from Phase 5, which was explicitly a
-- placeholder: on serverless each instance has its own memory, so an
-- attacker distributed across instances effectively multiplied their
-- allowance by the number of running functions.
--
-- Postgres is used rather than adding Redis because the database is
-- already a hard dependency, the write volume is trivial next to the
-- checkout path, and one fewer vendor is one fewer thing to secure. At
-- serious scale, swap in Upstash — the TypeScript signature is unchanged.
-- ---------------------------------------------------------------------
create table if not exists public.rate_limits (
  key          text primary key,
  window_start timestamptz not null,
  count        int not null,
  updated_at   timestamptz not null default now()
);

create index if not exists idx_rate_limits_stale on public.rate_limits (updated_at);

/**
 * Fixed-window counter, incremented atomically.
 *
 * INSERT … ON CONFLICT DO UPDATE is a single statement, so two concurrent
 * requests cannot both read "4" and both write "5". A read-then-write in
 * application code is exactly the race that makes naive rate limiters
 * bypassable under load.
 */
create or replace function public.check_rate_limit(
  p_key        text,
  p_limit      int,
  p_window_sec int
)
returns table (allowed boolean, remaining int, reset_at timestamptz)
language plpgsql
security definer set search_path = public
as $$
declare
  v_now    timestamptz := now();
  v_cutoff timestamptz := now() - make_interval(secs => p_window_sec);
  v_count  int;
  v_start  timestamptz;
begin
  insert into public.rate_limits (key, window_start, count, updated_at)
  values (p_key, v_now, 1, v_now)
  on conflict (key) do update
    set count = case when public.rate_limits.window_start < v_cutoff
                     then 1
                     else public.rate_limits.count + 1 end,
        window_start = case when public.rate_limits.window_start < v_cutoff
                     then v_now
                     else public.rate_limits.window_start end,
        updated_at = v_now
  returning public.rate_limits.count, public.rate_limits.window_start
  into v_count, v_start;

  return query
    select v_count <= p_limit,
           greatest(p_limit - v_count, 0),
           v_start + make_interval(secs => p_window_sec);
end;
$$;

-- Housekeeping so the table does not grow without bound.
--   select cron.schedule('purge-rate-limits','0 * * * *',
--     $$select public.purge_rate_limits()$$);
create or replace function public.purge_rate_limits()
returns int
language sql
security definer set search_path = public
as $$
  with deleted as (
    delete from public.rate_limits
     where updated_at < now() - interval '24 hours'
    returning 1
  )
  select count(*)::int from deleted;
$$;

alter table public.rate_limits enable row level security;
-- No policies: service role only. Clients must never read or write counters.

-- ---------------------------------------------------------------------
-- EXPANDED AUDIT COVERAGE
--
-- Phase 4 audited products and orders. Anything that can move money,
-- change permissions, or alter what customers see belongs here too.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'coupons', 'refunds', 'user_roles', 'roles', 'role_permissions',
    'site_settings', 'homepage_sections', 'cms_pages', 'inventory',
    'product_variants', 'addresses'
  ]
  loop
    execute format($p$
      drop trigger if exists trg_audit_%1$s on public.%1$s;
      create trigger trg_audit_%1$s
        after insert or update or delete on public.%1$s
        for each row execute function public.audit_row();
    $p$, t);
  end loop;
end $$;

-- Audit records are evidence. Nobody edits or deletes them, including
-- admins — RLS is enabled with SELECT-only policies and no write policy.
alter table public.audit_logs enable row level security;

drop policy if exists "admins read audit" on public.audit_logs;
create policy "admins read audit" on public.audit_logs
  for select using (public.is_admin(auth.uid()));

-- Retention: audit logs grow quickly on a busy store. Two years is a
-- common commercial default; align it with your own legal advice.
create or replace function public.purge_old_audit_logs(p_keep_days int default 730)
returns int
language sql
security definer set search_path = public
as $$
  with deleted as (
    delete from public.audit_logs
     where created_at < now() - make_interval(days => p_keep_days)
    returning 1
  )
  select count(*)::int from deleted;
$$;

-- ---------------------------------------------------------------------
-- SECURITY EVENT LOG
--
-- Separate from audit_logs, which records DATA changes. This records
-- AUTHENTICATION and authorization events — the trail you actually need
-- when investigating "did someone get into this account".
-- ---------------------------------------------------------------------
create table if not exists public.security_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles(id) on delete set null,
  event      text not null,   -- login_failed, admin_action_denied, rate_limited…
  severity   text not null default 'info' check (severity in ('info','warning','critical')),
  ip_prefix  text,
  user_agent text,
  detail     jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_security_events_recent
  on public.security_events (created_at desc);
create index if not exists idx_security_events_severity
  on public.security_events (severity, created_at desc) where severity <> 'info';

alter table public.security_events enable row level security;

create policy "admins read security events" on public.security_events
  for select using (public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- RLS VERIFICATION
--
-- Run this before every deploy. The dangerous state is not "RLS off" —
-- that is obvious. It is a table with RLS ENABLED and ZERO policies,
-- which silently denies everything and produces empty result sets that
-- look like missing data rather than a security misconfiguration.
-- ---------------------------------------------------------------------
create or replace view public.security_rls_status as
select
  c.relname                                  as table_name,
  c.relrowsecurity                           as rls_enabled,
  count(p.polname)                           as policy_count,
  case
    when not c.relrowsecurity then 'EXPOSED — RLS disabled'
    when count(p.polname) = 0 then 'LOCKED — RLS on, no policies'
    else 'ok'
  end                                        as status
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public' and c.relkind = 'r'
group by c.relname, c.relrowsecurity
order by
  case when not c.relrowsecurity then 0
       when count(p.polname) = 0 then 1
       else 2 end,
  c.relname;

-- Every SECURITY DEFINER function must pin search_path. Without it, a
-- caller can create a shadowing object in a schema earlier on the path
-- and have it executed with the function owner's privileges.
create or replace view public.security_definer_audit as
select
  p.proname                                     as function_name,
  p.prosecdef                                   as is_security_definer,
  coalesce(array_to_string(p.proconfig, ', '), '(none)') as config,
  case
    when p.prosecdef and (p.proconfig is null
      or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
    then 'UNSAFE — SECURITY DEFINER without search_path'
    else 'ok'
  end                                           as status
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by 4 desc, 1;

revoke all on public.security_rls_status, public.security_definer_audit
  from anon, authenticated;
