-- =====================================================================
-- Migration: 0006_payments.sql
--
-- Webhooks are delivered AT LEAST once, out of order, and sometimes years
-- after the fact during provider replays. Everything here is built around
-- that reality: record the event id, refuse duplicates, make every
-- transition idempotent.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Webhook event log — the idempotency ledger
-- ---------------------------------------------------------------------
create table if not exists public.webhook_events (
  id           uuid primary key default gen_random_uuid(),
  provider     text not null check (provider in ('stripe','razorpay')),
  -- The provider's own event id. The unique constraint below is what makes
  -- duplicate delivery a no-op instead of a double refund.
  event_id     text not null,
  event_type   text not null,
  payload      jsonb not null,
  processed_at timestamptz,
  error        text,
  received_at  timestamptz not null default now(),
  unique (provider, event_id)
);

create index if not exists idx_webhook_unprocessed
  on public.webhook_events (provider, received_at)
  where processed_at is null;

-- ---------------------------------------------------------------------
-- Payment columns the core schema lacked
-- ---------------------------------------------------------------------
alter table public.payments
  add column if not exists provider_order_id text,
  add column if not exists failure_reason    text,
  add column if not exists attempt_number    int not null default 1,
  add column if not exists paid_at           timestamptz;

create index if not exists idx_payments_provider_payment
  on public.payments (provider, provider_payment_id);

alter table public.refunds
  add column if not exists processed_at timestamptz,
  add column if not exists requested_by uuid references public.profiles(id) on delete set null;

-- ---------------------------------------------------------------------
-- mark_payment_paid
-- Called by the verified webhook. Records the payment, then delegates to
-- finalize_paid_order (Phase 9) which converts the stock reservation into
-- a real decrement and issues the invoice number.
--
-- Idempotent by design: if this payment is already marked paid, it returns
-- without touching stock a second time.
-- ---------------------------------------------------------------------
create or replace function public.mark_payment_paid(
  p_order_id            uuid,
  p_provider            text,
  p_provider_payment_id text,
  p_amount              numeric,
  p_method              text,
  p_raw                 jsonb
)
returns public.orders
language plpgsql
security definer set search_path = public
as $$
declare
  v_order    public.orders;
  v_existing public.payments;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND:%', p_order_id; end if;

  -- Amount check. A webhook that says a ₹200 order was paid ₹2 is either a
  -- bug or an attack; either way we refuse to finalise it.
  if p_amount is distinct from v_order.grand_total then
    raise exception 'AMOUNT_MISMATCH:%:%', v_order.grand_total, p_amount;
  end if;

  select * into v_existing from public.payments
   where provider = p_provider and provider_payment_id = p_provider_payment_id;

  if found and v_existing.status = 'paid' then
    return v_order;  -- replayed event, nothing to do
  end if;

  if found then
    update public.payments
       set status = 'paid', raw = p_raw, method = p_method,
           paid_at = now(), updated_at = now()
     where id = v_existing.id;
  else
    insert into public.payments (
      order_id, provider, provider_payment_id, amount, method, status, raw, paid_at
    ) values (
      p_order_id, p_provider, p_provider_payment_id, p_amount, p_method, 'paid', p_raw, now()
    );
  end if;

  return public.finalize_paid_order(p_order_id);
end;
$$;

-- ---------------------------------------------------------------------
-- mark_payment_failed
-- Does NOT cancel the order or release stock: the shopper may retry with a
-- different method within the reservation window. The Phase 9 sweeper
-- releases it if they never do.
-- ---------------------------------------------------------------------
create or replace function public.mark_payment_failed(
  p_order_id            uuid,
  p_provider            text,
  p_provider_payment_id text,
  p_reason              text,
  p_raw                 jsonb
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.payments (
    order_id, provider, provider_payment_id, amount, status, failure_reason, raw,
    attempt_number
  )
  select p_order_id, p_provider, p_provider_payment_id, o.grand_total, 'failed', p_reason, p_raw,
         coalesce((select max(attempt_number) + 1 from public.payments where order_id = p_order_id), 1)
  from public.orders o where o.id = p_order_id
  on conflict do nothing;
end;
$$;

-- ---------------------------------------------------------------------
-- process_refund
-- Restores stock for a FULL refund only. Partial refunds are money-only:
-- deciding which units came back is a warehouse decision, not a
-- database one, so the admin adjusts inventory explicitly.
-- ---------------------------------------------------------------------
create or replace function public.process_refund(
  p_refund_id          uuid,
  p_provider_refund_id text,
  p_raw                jsonb default null
)
returns public.refunds
language plpgsql
security definer set search_path = public
as $$
declare
  v_refund public.refunds;
  v_order  public.orders;
  v_item   record;
begin
  select * into v_refund from public.refunds where id = p_refund_id for update;
  if not found then raise exception 'REFUND_NOT_FOUND'; end if;

  if v_refund.status = 'completed' then
    return v_refund;  -- replay
  end if;

  select * into v_order from public.orders where id = v_refund.order_id for update;

  update public.refunds
     set status = 'completed', provider_refund_id = p_provider_refund_id,
         processed_at = now(), updated_at = now()
   where id = p_refund_id
  returning * into v_refund;

  if v_refund.amount >= v_order.grand_total then
    for v_item in
      select variant_id, quantity from public.order_items
       where order_id = v_order.id and variant_id is not null
       order by variant_id
    loop
      update public.inventory
         set quantity = quantity + v_item.quantity, updated_at = now()
       where variant_id = v_item.variant_id;
    end loop;

    update public.orders
       set status = 'refunded', updated_at = now()
     where id = v_order.id;

    update public.payments
       set status = 'refunded', updated_at = now()
     where order_id = v_order.id and status = 'paid';
  end if;

  if p_raw is not null then
    update public.payments set raw = coalesce(raw, '{}'::jsonb) || p_raw
     where order_id = v_order.id and status in ('paid','refunded');
  end if;

  return v_refund;
end;
$$;

-- ---------------------------------------------------------------------
-- extend_order_reservation — used when a shopper retries payment.
-- ---------------------------------------------------------------------
create or replace function public.extend_order_reservation(
  p_order_id uuid,
  p_minutes  int default 20
)
returns timestamptz
language plpgsql
security definer set search_path = public
as $$
declare v_until timestamptz;
begin
  update public.orders
     set reserved_until = now() + make_interval(mins => p_minutes), updated_at = now()
   where id = p_order_id and status = 'pending'
  returning reserved_until into v_until;

  return v_until;
end;
$$;

-- ---------------------------------------------------------------------
-- RLS: webhook_events is service-role only. It contains full provider
-- payloads, which include payment metadata that must never be client
-- readable. No policies are created, so RLS denies everything except the
-- service role (which bypasses RLS).
-- ---------------------------------------------------------------------
alter table public.webhook_events enable row level security;
alter table public.refunds enable row level security;

create policy "read own refunds" on public.refunds
  for select using (
    exists (select 1 from public.orders o
             where o.id = order_id
               and (o.user_id = auth.uid() or public.is_admin(auth.uid())))
  );
