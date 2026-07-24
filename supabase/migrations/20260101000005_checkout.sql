-- =====================================================================
-- Migration: 0005_checkout.sql
--
-- The most safety-critical migration in the project. Placing an order must
-- either fully succeed or fully fail: stock reserved, order written, coupon
-- redeemed, cart cleared — all or nothing. That is only achievable inside a
-- single database transaction, which is why the logic lives here rather
-- than in TypeScript.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Columns the core schema was missing
-- ---------------------------------------------------------------------
alter table public.orders
  add column if not exists contact_email   text,
  add column if not exists contact_phone   text,
  -- Guards against double-submit and retried network calls.
  add column if not exists idempotency_key text,
  -- Stock is held until this moment; after it, a sweeper releases it.
  add column if not exists reserved_until  timestamptz,
  add column if not exists invoice_number  text,
  add column if not exists invoiced_at     timestamptz,
  add column if not exists payment_method  text
    check (payment_method in ('stripe','razorpay','cod'));

create unique index if not exists idx_orders_idempotency
  on public.orders (idempotency_key) where idempotency_key is not null;

create unique index if not exists idx_orders_invoice_number
  on public.orders (invoice_number) where invoice_number is not null;

-- A guest order has no user_id, so contact details are mandatory instead.
alter table public.orders
  add constraint order_has_contact
  check (user_id is not null or contact_email is not null);

-- ---------------------------------------------------------------------
-- Invoice numbering
-- Sequential per Indian fiscal year (Apr–Mar), gapless, and allocated
-- inside the same transaction that finalises the order.
-- ---------------------------------------------------------------------
create table if not exists public.invoice_counters (
  prefix  text primary key,
  last_no int  not null default 0
);

create or replace function public.next_invoice_number()
returns text
language plpgsql
as $$
declare
  v_year  int := extract(year from now() at time zone 'Asia/Kolkata');
  v_month int := extract(month from now() at time zone 'Asia/Kolkata');
  v_prefix text;
  v_no int;
begin
  -- Fiscal year starts in April.
  if v_month < 4 then
    v_prefix := format('%s-%s', v_year - 1, right((v_year)::text, 2));
  else
    v_prefix := format('%s-%s', v_year, right((v_year + 1)::text, 2));
  end if;

  -- Upsert + RETURNING is atomic: two concurrent orders cannot get the
  -- same number, and no numbers are skipped.
  insert into public.invoice_counters (prefix, last_no)
  values (v_prefix, 1)
  on conflict (prefix) do update set last_no = public.invoice_counters.last_no + 1
  returning last_no into v_no;

  return format('INV/%s/%s', v_prefix, lpad(v_no::text, 5, '0'));
end;
$$;

-- ---------------------------------------------------------------------
-- place_order — the atomic transaction
--
-- Totals are computed by the TypeScript pricing engine (single source of
-- truth, unit tested) and passed in. This function does NOT recompute them;
-- it VERIFIES the inputs against live data and refuses if anything drifted.
-- The caller is our own server action, never the browser.
-- ---------------------------------------------------------------------
create or replace function public.place_order(
  p_cart_id             uuid,
  p_user_id             uuid,
  p_contact_email       text,
  p_contact_phone       text,
  p_shipping_address_id uuid,
  p_billing_address_id  uuid,
  p_payment_method      text,
  p_idempotency_key     text,
  p_coupon_id           uuid,
  p_coupon_code         text,
  -- [{ variant_id, quantity, unit_price, line_total, product_name, variant_label }]
  p_lines               jsonb,
  -- { subtotal, discount_total, tax_total, shipping_total, grand_total }
  p_totals              jsonb,
  p_reserve_minutes     int default 20
)
returns public.orders
language plpgsql
security definer set search_path = public
as $$
declare
  v_order     public.orders;
  v_line      jsonb;
  v_variant   uuid;
  v_qty       int;
  v_available int;
  v_price     numeric(12,2);
begin
  if jsonb_array_length(p_lines) = 0 then
    raise exception 'EMPTY_CART';
  end if;

  -- 1. Idempotency. A retried submit returns the original order rather than
  --    creating a second one.
  select * into v_order from public.orders
   where idempotency_key = p_idempotency_key;
  if found then
    return v_order;
  end if;

  -- 2. Lock inventory rows in a deterministic (sorted) order. Two concurrent
  --    checkouts touching the same variants therefore queue instead of
  --    deadlocking against each other.
  for v_variant in
    select distinct (l->>'variant_id')::uuid
    from jsonb_array_elements(p_lines) l
    order by 1
  loop
    perform 1 from public.inventory where variant_id = v_variant for update;
  end loop;

  -- 3. Validate every line against live stock and live price.
  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_variant := (v_line->>'variant_id')::uuid;
    v_qty     := (v_line->>'quantity')::int;

    select greatest(i.quantity - i.reserved_quantity, 0), v.price
      into v_available, v_price
      from public.inventory i
      join public.product_variants v on v.id = i.variant_id
     where i.variant_id = v_variant;

    if not found then
      raise exception 'VARIANT_MISSING:%', v_variant;
    end if;

    if v_available < v_qty then
      raise exception 'INSUFFICIENT_STOCK:%:%', v_variant, v_available;
    end if;

    -- If the admin repriced this item while the shopper was checking out,
    -- refuse rather than silently charging a different amount.
    if v_price is distinct from (v_line->>'unit_price')::numeric then
      raise exception 'PRICE_CHANGED:%', v_variant;
    end if;
  end loop;

  -- 4. Write the order header.
  insert into public.orders (
    user_id, contact_email, contact_phone, status,
    subtotal, discount_total, tax_total, shipping_total, grand_total,
    coupon_code, shipping_address_id, billing_address_id,
    payment_method, idempotency_key, reserved_until
  ) values (
    p_user_id, p_contact_email, p_contact_phone, 'pending',
    (p_totals->>'subtotal')::numeric,
    (p_totals->>'discount_total')::numeric,
    (p_totals->>'tax_total')::numeric,
    (p_totals->>'shipping_total')::numeric,
    (p_totals->>'grand_total')::numeric,
    p_coupon_code, p_shipping_address_id, p_billing_address_id,
    p_payment_method, p_idempotency_key,
    now() + make_interval(mins => p_reserve_minutes)
  )
  returning * into v_order;

  -- 5. Snapshot line items and RESERVE stock (not decrement — the sale is
  --    not final until payment clears).
  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_variant := (v_line->>'variant_id')::uuid;
    v_qty     := (v_line->>'quantity')::int;

    insert into public.order_items (
      order_id, variant_id, product_name, variant_label,
      unit_price, quantity, line_total
    ) values (
      v_order.id, v_variant,
      v_line->>'product_name',
      nullif(v_line->>'variant_label', ''),
      (v_line->>'unit_price')::numeric,
      v_qty,
      (v_line->>'line_total')::numeric
    );

    update public.inventory
       set reserved_quantity = reserved_quantity + v_qty,
           updated_at = now()
     where variant_id = v_variant;
  end loop;

  -- 6. Redeem the coupon. Incrementing here (not at apply time) is what
  --    makes usage_limit truthful.
  if p_coupon_id is not null then
    update public.coupons
       set used_count = used_count + 1
     where id = p_coupon_id;

    insert into public.coupon_redemptions (coupon_id, user_id, order_id, discount_amount)
    values (p_coupon_id, p_user_id, v_order.id, (p_totals->>'discount_total')::numeric);
  end if;

  -- 7. Empty the cart. If anything above raised, this never happens.
  delete from public.cart_items where cart_id = p_cart_id;

  return v_order;
end;
$$;

-- ---------------------------------------------------------------------
-- finalize_paid_order — called by the payment webhook (Phase 10) and
-- immediately for cash on delivery.
-- Converts the reservation into a real stock decrement and issues the
-- invoice number. Idempotent: running it twice does not double-decrement.
-- ---------------------------------------------------------------------
create or replace function public.finalize_paid_order(p_order_id uuid)
returns public.orders
language plpgsql
security definer set search_path = public
as $$
declare
  v_order public.orders;
  v_item  record;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  -- Already finalised — return as-is so webhook retries are harmless.
  if v_order.status <> 'pending' then
    return v_order;
  end if;

  for v_item in
    select variant_id, quantity from public.order_items
     where order_id = p_order_id and variant_id is not null
     order by variant_id
  loop
    update public.inventory
       set quantity          = greatest(quantity - v_item.quantity, 0),
           reserved_quantity = greatest(reserved_quantity - v_item.quantity, 0),
           updated_at = now()
     where variant_id = v_item.variant_id;
  end loop;

  update public.orders
     set status         = 'confirmed',
         reserved_until = null,
         invoice_number = coalesce(invoice_number, public.next_invoice_number()),
         invoiced_at    = coalesce(invoiced_at, now()),
         updated_at     = now()
   where id = p_order_id
  returning * into v_order;

  insert into public.notifications (user_id, type, title, body, data)
  select v_order.user_id, 'order_confirmed', 'Order confirmed',
         'We have received your order ' || v_order.order_number,
         jsonb_build_object('order_id', v_order.id)
  where v_order.user_id is not null;

  return v_order;
end;
$$;

-- ---------------------------------------------------------------------
-- release_expired_reservations — the sweeper.
-- Without this, an abandoned checkout holds stock forever and the store
-- slowly shows everything as sold out.
-- Schedule with pg_cron:
--   select cron.schedule('release-stock','*/5 * * * *',
--                        $$select public.release_expired_reservations()$$);
-- ---------------------------------------------------------------------
create or replace function public.release_expired_reservations()
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_order record;
  v_item  record;
  v_count int := 0;
begin
  for v_order in
    select id from public.orders
     where status = 'pending'
       and reserved_until is not null
       and reserved_until < now()
     for update skip locked
  loop
    for v_item in
      select variant_id, quantity from public.order_items
       where order_id = v_order.id and variant_id is not null
    loop
      update public.inventory
         set reserved_quantity = greatest(reserved_quantity - v_item.quantity, 0),
             updated_at = now()
       where variant_id = v_item.variant_id;
    end loop;

    update public.orders
       set status = 'cancelled', reserved_until = null, updated_at = now()
     where id = v_order.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.order_items enable row level security;
alter table public.payments    enable row level security;
alter table public.shipping    enable row level security;

create policy "read own order items" on public.order_items
  for select using (
    exists (select 1 from public.orders o
             where o.id = order_id
               and (o.user_id = auth.uid() or public.is_admin(auth.uid())))
  );

create policy "read own payments" on public.payments
  for select using (
    exists (select 1 from public.orders o
             where o.id = order_id
               and (o.user_id = auth.uid() or public.is_admin(auth.uid())))
  );

create policy "read own shipping" on public.shipping
  for select using (
    exists (select 1 from public.orders o
             where o.id = order_id
               and (o.user_id = auth.uid() or public.is_admin(auth.uid())))
  );
