-- =====================================================================
-- Migration: 0004_cart_coupons.sql
-- Adds the pieces the cart needs that the core schema did not cover:
-- coupons, redemption tracking, tax rates, a stock view, and an atomic
-- guest-to-user cart merge.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Coupons
-- ---------------------------------------------------------------------
create table public.coupons (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,
  description       text,
  discount_type     text not null check (discount_type in ('percent','fixed')),
  -- percent: 0–100. fixed: an amount in the store currency.
  discount_value    numeric(12,2) not null check (discount_value > 0),
  -- Ceiling for percentage coupons, e.g. "20% off, up to ₹500".
  max_discount      numeric(12,2) check (max_discount > 0),
  min_subtotal      numeric(12,2) not null default 0 check (min_subtotal >= 0),
  usage_limit       int check (usage_limit > 0),          -- null = unlimited
  used_count        int not null default 0 check (used_count >= 0),
  per_user_limit    int not null default 1 check (per_user_limit > 0),
  starts_at         timestamptz,
  ends_at           timestamptz,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint percent_within_range
    check (discount_type <> 'percent' or discount_value <= 100),
  constraint valid_window
    check (ends_at is null or starts_at is null or ends_at > starts_at)
);

-- Codes are matched case-insensitively; the index makes that lookup fast.
create unique index idx_coupons_code_lower on public.coupons (lower(code));
create index idx_coupons_active on public.coupons (is_active) where is_active;

-- One row per successful redemption. This is what enforces per_user_limit
-- and what makes "how did this campaign perform" answerable later.
create table public.coupon_redemptions (
  id              uuid primary key default gen_random_uuid(),
  coupon_id       uuid not null references public.coupons(id) on delete cascade,
  user_id         uuid references public.profiles(id) on delete set null,
  order_id        uuid references public.orders(id) on delete set null,
  discount_amount numeric(12,2) not null,
  created_at      timestamptz not null default now()
);
create index idx_redemptions_coupon_user on public.coupon_redemptions (coupon_id, user_id);

create trigger trg_coupons_updated before update on public.coupons
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Tax
-- Rate lives on the category so different goods can be taxed differently
-- (GST slabs), with a store-wide fallback in site_settings.
-- ---------------------------------------------------------------------
alter table public.categories
  add column if not exists tax_rate numeric(5,2) check (tax_rate >= 0 and tax_rate <= 100);

insert into public.site_settings (key, value) values
  ('tax',      '{"default_rate": 18, "prices_include_tax": false}'::jsonb),
  ('shipping', '{"flat_rate": 99, "free_over": 2000, "currency": "INR"}'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- Sellable stock
-- Never query inventory.quantity directly for availability — units held
-- for in-flight checkouts are not sellable.
-- ---------------------------------------------------------------------
create or replace view public.variant_availability as
select
  v.id                                            as variant_id,
  v.product_id,
  v.price,
  v.is_active,
  greatest(i.quantity - i.reserved_quantity, 0)   as available
from public.product_variants v
join public.inventory i on i.variant_id = v.id;

-- ---------------------------------------------------------------------
-- Guest cart merge
-- Runs as ONE statement in ONE transaction. Doing this in application code
-- would leave a window where a crash between "copy items" and "delete guest
-- cart" duplicates or loses the basket.
-- ---------------------------------------------------------------------
create or replace function public.merge_guest_cart(p_user_id uuid, p_session_id text)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_guest_cart_id uuid;
  v_user_cart_id  uuid;
begin
  select id into v_guest_cart_id
  from public.cart where session_id = p_session_id and user_id is null;

  if v_guest_cart_id is null then
    select id into v_user_cart_id from public.cart where user_id = p_user_id;
    if v_user_cart_id is null then
      insert into public.cart (user_id) values (p_user_id) returning id into v_user_cart_id;
    end if;
    return v_user_cart_id;
  end if;

  select id into v_user_cart_id from public.cart where user_id = p_user_id;

  -- No existing user cart: adopt the guest cart wholesale. Cheapest path.
  if v_user_cart_id is null then
    update public.cart
      set user_id = p_user_id, session_id = null, updated_at = now()
      where id = v_guest_cart_id;
    return v_guest_cart_id;
  end if;

  -- Both exist: fold guest lines into the user cart, summing quantities but
  -- never exceeding what is actually sellable.
  insert into public.cart_items (cart_id, variant_id, quantity)
  select v_user_cart_id, gi.variant_id, gi.quantity
  from public.cart_items gi
  where gi.cart_id = v_guest_cart_id
  on conflict (cart_id, variant_id) do update
    set quantity = least(
          public.cart_items.quantity + excluded.quantity,
          coalesce((select available from public.variant_availability
                    where variant_id = excluded.variant_id), 0)
        ),
        updated_at = now();

  -- Clamp any adopted line that now exceeds stock.
  update public.cart_items ci
    set quantity = greatest(least(ci.quantity, va.available), 1)
  from public.variant_availability va
  where ci.cart_id = v_user_cart_id and va.variant_id = ci.variant_id;

  delete from public.cart where id = v_guest_cart_id;
  return v_user_cart_id;
end;
$$;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.coupons enable row level security;
alter table public.coupon_redemptions enable row level security;

-- Coupon rows are NOT publicly readable: the list of live codes is
-- commercially sensitive. Validation happens server-side only.
create policy "admins manage coupons" on public.coupons
  for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

create policy "read own redemptions" on public.coupon_redemptions
  for select using (auth.uid() = user_id or public.is_admin(auth.uid()));

-- Signed-in users own their cart. Guest carts have a NULL user_id and are
-- therefore unreachable under RLS by design — all guest access goes through
-- server actions holding the session cookie. See the phase notes.
create policy "own cart" on public.cart
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own cart items" on public.cart_items
  for all using (
    exists (select 1 from public.cart c where c.id = cart_id and c.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.cart c where c.id = cart_id and c.user_id = auth.uid())
  );
