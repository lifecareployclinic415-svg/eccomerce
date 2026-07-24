-- supabase/tests/database.test.sql
--
-- Run with:  supabase test db
--
-- ⚠️ CRITICAL: NEVER test RLS from the Supabase SQL editor. It runs as the
-- postgres superuser, which BYPASSES RLS entirely — every policy test will
-- pass while proving absolutely nothing. These tests explicitly switch to
-- the `authenticated` role and set a JWT claim so auth.uid() resolves,
-- which is the only way to exercise a policy honestly.
--
-- This file covers what TypeScript tests structurally cannot: row-level
-- security, transaction atomicity, and database-enforced idempotency.

begin;
select plan(18);

-- ---------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'bob@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'admin@test.local');

-- profiles and the 'customer' role are created by the handle_new_user
-- trigger from migration 0003, so we only add the admin grant.
insert into public.user_roles (user_id, role_id)
select '33333333-3333-3333-3333-333333333333', id from public.roles where name = 'admin';

insert into public.categories (id, name, slug, tax_rate)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'Test', 'test-cat', 18);

insert into public.products (id, name, slug, base_price, category_id, is_published)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'Test Lamp', 'test-lamp', 1000.00,
        'aaaaaaaa-0000-0000-0000-000000000001', true);

insert into public.product_variants (id, product_id, sku, price)
values ('cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001',
        'SKU-TEST-1', 1000.00);

insert into public.inventory (variant_id, quantity, reserved_quantity)
values ('cccccccc-0000-0000-0000-000000000001', 5, 0);

insert into public.addresses (id, user_id, full_name, phone, line1, city, state, postal_code)
values ('dddddddd-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        'Alice', '9999999999', '1 Test Road', 'Hubballi', 'Karnataka', '580001');

-- Helper: become a signed-in user for the statements that follow.
create or replace function tests.become(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end;
$$;

-- =====================================================================
-- 1. ROW LEVEL SECURITY — the tests that matter most
-- =====================================================================

-- Every table must have RLS on. This single query catches the most
-- dangerous misconfiguration in a Supabase project.
select is_empty(
  $$ select table_name from public.security_rls_status where status <> 'ok' $$,
  'no table is left exposed or policy-less'
);

set local role postgres;
insert into public.orders (id, user_id, contact_email, grand_total, subtotal, status)
values ('eeeeeeee-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        'alice@test.local', 1180.00, 1000.00, 'confirmed');

select tests.become('11111111-1111-1111-1111-111111111111');

select results_eq(
  $$ select count(*)::int from public.orders $$,
  array[1],
  'alice sees her own order'
);

select tests.become('22222222-2222-2222-2222-222222222222');

-- The single most important assertion in the suite. If this fails,
-- every customer can read every other customer's orders.
select results_eq(
  $$ select count(*)::int from public.orders $$,
  array[0],
  'bob CANNOT see alice''s order'
);

select results_eq(
  $$ select count(*)::int from public.addresses $$,
  array[0],
  'bob CANNOT see alice''s address'
);

select results_eq(
  $$ select count(*)::int from public.order_items
     where order_id = 'eeeeeeee-0000-0000-0000-000000000001' $$,
  array[0],
  'bob CANNOT see alice''s order items'
);

-- Live coupon codes are commercially sensitive, so the table is not
-- publicly readable even to signed-in users.
set local role postgres;
insert into public.coupons (id, code, discount_type, discount_value)
values ('ffffffff-0000-0000-0000-000000000001', 'SECRET10', 'percent', 10);

select tests.become('22222222-2222-2222-2222-222222222222');
select results_eq(
  $$ select count(*)::int from public.coupons $$,
  array[0],
  'customers cannot enumerate coupon codes'
);

-- Privilege escalation: a user must not be able to grant themselves admin.
select throws_ok(
  $$ insert into public.user_roles (user_id, role_id)
     select '22222222-2222-2222-2222-222222222222', id
     from public.roles where name = 'admin' $$,
  '42501',
  null,
  'a customer cannot grant themselves the admin role'
);

select tests.become('33333333-3333-3333-3333-333333333333');
select results_eq(
  $$ select count(*)::int from public.orders $$,
  array[1],
  'an admin can see all orders'
);

-- =====================================================================
-- 2. place_order — atomicity, validation, idempotency
-- =====================================================================
set local role postgres;

insert into public.cart (id, user_id) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111');
insert into public.cart_items (cart_id, variant_id, quantity) values
  ('a0000000-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 2);

select lives_ok(
  $$ select public.place_order(
       'a0000000-0000-0000-0000-000000000001',
       '11111111-1111-1111-1111-111111111111',
       'alice@test.local', '9999999999',
       'dddddddd-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001',
       'cod', 'idem-key-1', null, null,
       '[{"variant_id":"cccccccc-0000-0000-0000-000000000001","quantity":2,
          "unit_price":1000.00,"line_total":2360.00,"product_name":"Test Lamp",
          "variant_label":""}]'::jsonb,
       '{"subtotal":2000.00,"discount_total":0,"tax_total":360.00,
         "shipping_total":0,"grand_total":2360.00}'::jsonb
     ) $$,
  'place_order succeeds with valid stock and price'
);

-- Stock is RESERVED, not decremented: the sale is not final until payment.
select results_eq(
  $$ select quantity, reserved_quantity from public.inventory
     where variant_id = 'cccccccc-0000-0000-0000-000000000001' $$,
  $$ values (5, 2) $$,
  'stock is reserved, not yet deducted'
);

select is_empty(
  $$ select 1 from public.cart_items
     where cart_id = 'a0000000-0000-0000-0000-000000000001' $$,
  'the cart is emptied on success'
);

-- Idempotency: the same key must return the SAME order, not create a
-- second one. This is what protects against double-click and retries.
select results_eq(
  $$ select count(*)::int from public.orders where idempotency_key = 'idem-key-1' $$,
  array[1],
  'one order exists for the idempotency key'
);

select lives_ok(
  $$ select public.place_order(
       'a0000000-0000-0000-0000-000000000001',
       '11111111-1111-1111-1111-111111111111',
       'alice@test.local', '9999999999',
       'dddddddd-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001',
       'cod', 'idem-key-1', null, null,
       '[{"variant_id":"cccccccc-0000-0000-0000-000000000001","quantity":2,
          "unit_price":1000.00,"line_total":2360.00,"product_name":"Test Lamp",
          "variant_label":""}]'::jsonb,
       '{"subtotal":2000.00,"discount_total":0,"tax_total":360.00,
         "shipping_total":0,"grand_total":2360.00}'::jsonb
     ) $$,
  'replaying the same idempotency key does not error'
);

select results_eq(
  $$ select count(*)::int from public.orders where idempotency_key = 'idem-key-1' $$,
  array[1],
  'replaying the key creates NO second order'
);

-- Price drift must abort rather than silently charge a different amount.
select throws_like(
  $$ select public.place_order(
       'a0000000-0000-0000-0000-000000000001',
       '11111111-1111-1111-1111-111111111111',
       'alice@test.local', '9999999999',
       'dddddddd-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001',
       'cod', 'idem-key-2', null, null,
       '[{"variant_id":"cccccccc-0000-0000-0000-000000000001","quantity":1,
          "unit_price":1.00,"line_total":1.18,"product_name":"Test Lamp",
          "variant_label":""}]'::jsonb,
       '{"subtotal":1.00,"discount_total":0,"tax_total":0.18,
         "shipping_total":0,"grand_total":1.18}'::jsonb
     ) $$,
  '%PRICE_CHANGED%',
  'a mismatched unit price is rejected'
);

-- Overselling must be impossible: 3 available, 4 requested.
select throws_like(
  $$ select public.place_order(
       'a0000000-0000-0000-0000-000000000001',
       '11111111-1111-1111-1111-111111111111',
       'alice@test.local', '9999999999',
       'dddddddd-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001',
       'cod', 'idem-key-3', null, null,
       '[{"variant_id":"cccccccc-0000-0000-0000-000000000001","quantity":4,
          "unit_price":1000.00,"line_total":4720.00,"product_name":"Test Lamp",
          "variant_label":""}]'::jsonb,
       '{"subtotal":4000.00,"discount_total":0,"tax_total":720.00,
         "shipping_total":0,"grand_total":4720.00}'::jsonb
     ) $$,
  '%INSUFFICIENT_STOCK%',
  'the store cannot oversell reserved stock'
);

-- =====================================================================
-- 3. Payment finalisation and reservation release
-- =====================================================================
select lives_ok(
  $$ select public.finalize_paid_order(
       (select id from public.orders where idempotency_key = 'idem-key-1')) $$,
  'finalize_paid_order succeeds'
);

-- Reservation becomes a real decrement, exactly once.
select results_eq(
  $$ select quantity, reserved_quantity from public.inventory
     where variant_id = 'cccccccc-0000-0000-0000-000000000001' $$,
  $$ values (3, 0) $$,
  'stock is deducted and the reservation cleared'
);

-- Webhooks are delivered more than once; finalising twice must not
-- deduct stock twice.
select lives_ok(
  $$ select public.finalize_paid_order(
       (select id from public.orders where idempotency_key = 'idem-key-1')) $$,
  'finalizing an already-confirmed order is a no-op'
);

select results_eq(
  $$ select quantity from public.inventory
     where variant_id = 'cccccccc-0000-0000-0000-000000000001' $$,
  array[3],
  'a replayed finalisation does NOT double-deduct stock'
);

select * from finish();
rollback;
