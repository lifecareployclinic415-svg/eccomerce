-- =====================================================================
-- Migration: 0009_analytics.sql
--
-- Two halves: an auditable consent record (a DPDP requirement, not a
-- nicety), and the reporting layer that powers the admin dashboard.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Consent log
--
-- DPDP guidance requires consent to be granular, withdrawable and
-- AUDITABLE. "We showed a banner" is not a defence; you need a record of
-- what was asked, what was granted, and when. Each change appends a row —
-- the history is the evidence, so nothing here is ever updated.
-- ---------------------------------------------------------------------
create table if not exists public.consent_log (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references public.profiles(id) on delete set null,
  -- Anonymous visitors get the same cookie id used by the banner.
  visitor_id     text not null,
  analytics      boolean not null,
  marketing      boolean not null,
  personalization boolean not null,
  -- Which banner wording produced this consent. When copy changes, prior
  -- consents are still explainable.
  policy_version text not null,
  action         text not null check (action in ('accept_all','reject_all','custom','withdraw')),
  -- Truncated to /24 so it is useful for dispute resolution without
  -- retaining a precise identifier longer than necessary.
  ip_prefix      text,
  user_agent     text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_consent_visitor on public.consent_log (visitor_id, created_at desc);
create index if not exists idx_consent_user on public.consent_log (user_id, created_at desc);

alter table public.consent_log enable row level security;

-- Deliberately no SELECT policy for regular users: consent records are
-- written by the server and read by admins only.
create policy "admins read consent" on public.consent_log
  for select using (public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- REVENUE REPORTING
--
-- Revenue counts only orders that actually became sales. Including
-- 'pending' would inflate every figure with abandoned checkouts, and
-- including 'cancelled' would never reconcile against the payment
-- provider's settlement report.
-- ---------------------------------------------------------------------
create or replace view public.report_revenue_daily as
select
  date_trunc('day', o.placed_at at time zone 'Asia/Kolkata')::date as day,
  count(*)                                     as orders,
  count(distinct o.user_id)                    as customers,
  sum(o.subtotal)                              as gross_sales,
  sum(o.discount_total)                        as discounts,
  sum(o.tax_total)                             as tax,
  sum(o.shipping_total)                        as shipping,
  sum(o.grand_total)                           as total_collected,
  -- Net revenue excludes tax (owed to the government, not income) and
  -- shipping (largely pass-through cost).
  sum(o.subtotal - o.discount_total)           as net_revenue,
  round(avg(o.grand_total), 2)                 as average_order_value
from public.orders o
where o.status in ('confirmed','processing','shipped','delivered')
group by 1;

-- Refunds tracked separately so gross and net never get conflated.
create or replace view public.report_refunds_daily as
select
  date_trunc('day', r.processed_at at time zone 'Asia/Kolkata')::date as day,
  count(*)        as refunds,
  sum(r.amount)   as refunded_amount
from public.refunds r
where r.status = 'completed' and r.processed_at is not null
group by 1;

-- ---------------------------------------------------------------------
-- PRODUCT PERFORMANCE
-- ---------------------------------------------------------------------
create or replace view public.report_product_performance as
select
  p.id                                    as product_id,
  p.name,
  p.slug,
  c.name                                  as category,
  b.name                                  as brand,
  count(distinct oi.order_id)             as orders,
  coalesce(sum(oi.quantity), 0)           as units_sold,
  coalesce(sum(oi.line_total), 0)         as revenue,
  p.rating_avg,
  p.rating_count
from public.products p
left join public.product_variants v on v.product_id = p.id
left join public.order_items oi on oi.variant_id = v.id
left join public.orders o
  on o.id = oi.order_id
 and o.status in ('confirmed','processing','shipped','delivered')
left join public.categories c on c.id = p.category_id
left join public.brands b on b.id = p.brand_id
group by p.id, p.name, p.slug, c.name, b.name, p.rating_avg, p.rating_count;

-- ---------------------------------------------------------------------
-- CUSTOMER REPORTING
-- ---------------------------------------------------------------------
create or replace view public.report_customer_summary as
select
  pr.id                                        as user_id,
  pr.full_name,
  pr.created_at                                as signed_up_at,
  count(o.id)                                  as order_count,
  coalesce(sum(o.grand_total), 0)              as lifetime_value,
  round(coalesce(avg(o.grand_total), 0), 2)    as average_order_value,
  min(o.placed_at)                             as first_order_at,
  max(o.placed_at)                             as last_order_at,
  -- Deliberately simple segmentation. Anything more (RFM scoring,
  -- propensity models) belongs in a warehouse, not in the transactional
  -- database that also has to serve checkout.
  case
    when count(o.id) = 0 then 'never_purchased'
    when count(o.id) = 1 then 'one_time'
    when max(o.placed_at) < now() - interval '180 days' then 'lapsed'
    else 'repeat'
  end                                          as segment
from public.profiles pr
left join public.orders o
  on o.user_id = pr.id
 and o.status in ('confirmed','processing','shipped','delivered')
group by pr.id, pr.full_name, pr.created_at;

-- ---------------------------------------------------------------------
-- INVENTORY REPORTING
-- ---------------------------------------------------------------------
create or replace view public.report_inventory_status as
select
  v.id                                          as variant_id,
  p.id                                          as product_id,
  p.name                                        as product_name,
  v.sku,
  i.quantity,
  i.reserved_quantity,
  greatest(i.quantity - i.reserved_quantity, 0) as available,
  i.low_stock_threshold,
  v.price,
  -- Capital sitting on the shelf. Uses selling price, so treat it as
  -- retail value rather than cost basis (we do not store cost prices).
  round(i.quantity * v.price, 2)                as retail_value,
  case
    when i.quantity - i.reserved_quantity <= 0 then 'out_of_stock'
    when i.quantity - i.reserved_quantity <= i.low_stock_threshold then 'low_stock'
    else 'in_stock'
  end                                           as stock_status
from public.inventory i
join public.product_variants v on v.id = i.variant_id
join public.products p on p.id = v.product_id;

-- ---------------------------------------------------------------------
-- Dashboard rollup (materialized)
--
-- The dashboard loads on every admin page view, so the headline numbers
-- are precomputed rather than aggregated live. Refreshed CONCURRENTLY so
-- reads are never blocked, which requires the unique index below.
--
--   select cron.schedule('refresh-dashboard','*/15 * * * *',
--     $$select public.refresh_analytics()$$);
-- ---------------------------------------------------------------------
create materialized view if not exists public.mv_dashboard_daily as
select
  d.day,
  coalesce(r.orders, 0)          as orders,
  coalesce(r.customers, 0)       as customers,
  coalesce(r.net_revenue, 0)     as net_revenue,
  coalesce(r.total_collected, 0) as total_collected,
  coalesce(r.average_order_value, 0) as average_order_value,
  coalesce(f.refunded_amount, 0) as refunded_amount
from generate_series(
       (current_date - interval '365 days')::date,
       current_date,
       interval '1 day'
     ) as d(day)
left join public.report_revenue_daily r on r.day = d.day::date
left join public.report_refunds_daily f on f.day = d.day::date;

create unique index if not exists idx_mv_dashboard_day
  on public.mv_dashboard_daily (day);

create or replace function public.refresh_analytics()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  refresh materialized view concurrently public.mv_dashboard_daily;
end;
$$;

-- ---------------------------------------------------------------------
-- Views inherit RLS from their base tables in Postgres 15+, but these are
-- admin-only reads regardless, so access goes through the service role in
-- server code rather than being exposed to the client.
-- ---------------------------------------------------------------------
revoke all on public.report_revenue_daily        from anon, authenticated;
revoke all on public.report_refunds_daily        from anon, authenticated;
revoke all on public.report_product_performance  from anon, authenticated;
revoke all on public.report_customer_summary     from anon, authenticated;
revoke all on public.report_inventory_status     from anon, authenticated;
revoke all on public.mv_dashboard_daily          from anon, authenticated;
