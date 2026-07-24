-- =====================================================================
-- eCommerce core schema
-- Migration: 0002_core_schema.sql
-- Conventions:
--   * snake_case, plural table names
--   * uuid primary keys (gen_random_uuid)
--   * timestamptz created_at / updated_at, updated_at auto-maintained
--   * money stored as numeric(12,2); enums modelled as text + CHECK for
--     flexibility (adding a status never requires an ALTER TYPE)
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Shared helper functions
-- ---------------------------------------------------------------------

-- Auto-update updated_at on every UPDATE
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Is the given user an admin? Used by RLS policies across the schema.
create or replace function public.is_admin(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = uid
      and r.name in ('admin', 'super_admin')
  );
$$;

-- Human-readable order numbers: ORD-20260723-000042
create sequence if not exists public.order_number_seq;
create or replace function public.next_order_number()
returns text language sql as $$
  select 'ORD-' || to_char(now(), 'YYYYMMDD') || '-' ||
         lpad(nextval('public.order_number_seq')::text, 6, '0');
$$;

-- Generic audit writer (attached to sensitive tables)
create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_logs (actor_id, action, table_name, record_id, old_data, new_data)
  values (
    auth.uid(),
    tg_op,
    tg_table_name,
    coalesce(new.id, old.id),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

-- =====================================================================
-- 1. IDENTITY & ACCESS CONTROL
-- =====================================================================

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  phone       text,
  avatar_url  text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.roles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text,
  created_at  timestamptz not null default now()
);

create table public.permissions (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,          -- e.g. 'products.create'
  description text,
  created_at  timestamptz not null default now()
);

create table public.role_permissions (
  role_id       uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table public.user_roles (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role_id    uuid not null references public.roles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

create table public.addresses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  type        text not null default 'shipping' check (type in ('shipping','billing')),
  full_name   text not null,
  phone       text not null,
  line1       text not null,
  line2       text,
  city        text not null,
  state       text not null,
  postal_code text not null,
  country     text not null default 'IN',
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index idx_addresses_user on public.addresses(user_id);

-- =====================================================================
-- 2. CATALOG
-- =====================================================================

create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  description text,
  image_url   text,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.subcategories (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete cascade,
  name        text not null,
  slug        text not null unique,
  image_url   text,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index idx_subcategories_category on public.subcategories(category_id);

create table public.brands (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  logo_url    text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.products (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  slug           text not null unique,
  description    text,
  brand_id       uuid references public.brands(id) on delete set null,
  category_id    uuid references public.categories(id) on delete set null,
  subcategory_id uuid references public.subcategories(id) on delete set null,
  base_price     numeric(12,2) not null check (base_price >= 0),
  sale_price     numeric(12,2) check (sale_price >= 0),
  currency       text not null default 'INR',
  is_published   boolean not null default false,
  is_featured    boolean not null default false,
  rating_avg     numeric(3,2) not null default 0,
  rating_count   int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index idx_products_category on public.products(category_id);
create index idx_products_subcategory on public.products(subcategory_id);
create index idx_products_brand on public.products(brand_id);
create index idx_products_published on public.products(is_published) where is_published;

create table public.product_variants (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  sku         text not null unique,
  attributes  jsonb not null default '{}',   -- {"size":"M","color":"Blue"}
  price       numeric(12,2) not null check (price >= 0),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index idx_variants_product on public.product_variants(product_id);

create table public.product_images (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  variant_id  uuid references public.product_variants(id) on delete set null,
  url         text not null,
  alt         text,
  position    int not null default 0,
  is_primary  boolean not null default false,
  created_at  timestamptz not null default now()
);
create index idx_product_images_product on public.product_images(product_id);

-- =====================================================================
-- 3. INVENTORY
-- =====================================================================

create table public.inventory (
  id                  uuid primary key default gen_random_uuid(),
  variant_id          uuid not null unique references public.product_variants(id) on delete cascade,
  quantity            int not null default 0 check (quantity >= 0),
  reserved_quantity   int not null default 0 check (reserved_quantity >= 0),
  low_stock_threshold int not null default 5,
  updated_at          timestamptz not null default now()
);

create table public.stock_history (
  id                uuid primary key default gen_random_uuid(),
  variant_id        uuid not null references public.product_variants(id) on delete cascade,
  change            int not null,
  previous_quantity int not null,
  new_quantity      int not null,
  reason            text not null default 'manual',
  changed_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now()
);
create index idx_stock_history_variant on public.stock_history(variant_id);

-- Log every quantity change on inventory into stock_history
create or replace function public.log_stock_change()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'UPDATE' and new.quantity is distinct from old.quantity) then
    insert into public.stock_history (variant_id, change, previous_quantity, new_quantity, reason, changed_by)
    values (new.variant_id, new.quantity - old.quantity, old.quantity, new.quantity,
            coalesce(current_setting('app.stock_reason', true), 'manual'), auth.uid());
  end if;
  return new;
end;
$$;
create trigger trg_log_stock after update on public.inventory
  for each row execute function public.log_stock_change();

-- =====================================================================
-- 4. CART & WISHLIST
-- =====================================================================

create table public.cart (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete cascade,
  session_id  text,                          -- guest carts (pre-login)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (user_id is not null or session_id is not null)
);
create unique index idx_cart_user on public.cart(user_id) where user_id is not null;
create unique index idx_cart_session on public.cart(session_id) where session_id is not null;

create table public.cart_items (
  id          uuid primary key default gen_random_uuid(),
  cart_id     uuid not null references public.cart(id) on delete cascade,
  variant_id  uuid not null references public.product_variants(id) on delete cascade,
  quantity    int not null default 1 check (quantity > 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (cart_id, variant_id)
);
create index idx_cart_items_cart on public.cart_items(cart_id);

create table public.wishlist (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  product_id  uuid not null references public.products(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (user_id, product_id)
);
create index idx_wishlist_user on public.wishlist(user_id);

-- =====================================================================
-- 5. ORDERS, PAYMENTS, SHIPPING, REFUNDS
-- =====================================================================

create table public.orders (
  id                  uuid primary key default gen_random_uuid(),
  order_number        text not null unique default public.next_order_number(),
  user_id             uuid references public.profiles(id) on delete set null,
  status              text not null default 'pending'
                        check (status in ('pending','confirmed','processing','shipped','delivered','cancelled','refunded')),
  subtotal            numeric(12,2) not null default 0,
  discount_total      numeric(12,2) not null default 0,
  tax_total           numeric(12,2) not null default 0,
  shipping_total      numeric(12,2) not null default 0,
  grand_total         numeric(12,2) not null default 0,
  currency            text not null default 'INR',
  coupon_code         text,
  shipping_address_id uuid references public.addresses(id) on delete set null,
  billing_address_id  uuid references public.addresses(id) on delete set null,
  placed_at           timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index idx_orders_user on public.orders(user_id);
create index idx_orders_status on public.orders(status);

create table public.order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders(id) on delete cascade,
  variant_id    uuid references public.product_variants(id) on delete set null,
  product_name  text not null,               -- snapshot at purchase time
  variant_label text,                        -- snapshot, e.g. "M / Blue"
  unit_price    numeric(12,2) not null,       -- snapshot
  quantity      int not null check (quantity > 0),
  line_total    numeric(12,2) not null,
  created_at    timestamptz not null default now()
);
create index idx_order_items_order on public.order_items(order_id);

create table public.payments (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders(id) on delete cascade,
  provider            text not null check (provider in ('stripe','razorpay','cod')),
  provider_payment_id text,
  amount              numeric(12,2) not null,
  currency            text not null default 'INR',
  method              text,
  status              text not null default 'pending'
                        check (status in ('pending','authorized','paid','failed','refunded')),
  raw                 jsonb,                  -- full provider payload
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index idx_payments_order on public.payments(order_id);

create table public.shipping (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references public.orders(id) on delete cascade,
  carrier            text,
  tracking_number    text,
  status             text not null default 'pending'
                       check (status in ('pending','shipped','in_transit','delivered','returned')),
  shipped_at         timestamptz,
  delivered_at       timestamptz,
  estimated_delivery date,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index idx_shipping_order on public.shipping(order_id);

create table public.refunds (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references public.orders(id) on delete cascade,
  payment_id         uuid references public.payments(id) on delete set null,
  amount             numeric(12,2) not null check (amount > 0),
  reason             text,
  status             text not null default 'pending'
                       check (status in ('pending','processing','completed','rejected')),
  provider_refund_id text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index idx_refunds_order on public.refunds(order_id);

-- =====================================================================
-- 6. REVIEWS & NOTIFICATIONS
-- =====================================================================

create table public.reviews (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  order_id    uuid references public.orders(id) on delete set null, -- verified purchase
  rating      int not null check (rating between 1 and 5),
  title       text,
  body        text,
  is_approved boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, product_id)
);
create index idx_reviews_product on public.reviews(product_id);

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  type        text not null,
  title       text not null,
  body        text,
  data        jsonb,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index idx_notifications_user on public.notifications(user_id, is_read);

-- =====================================================================
-- 7. CONTENT / CMS / MARKETING
-- =====================================================================

create table public.banners (
  id          uuid primary key default gen_random_uuid(),
  title       text,
  image_url   text not null,
  link        text,
  position    text not null default 'home_hero',
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  starts_at   timestamptz,
  ends_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.cms_pages (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  title        text not null,
  content      text,
  is_published boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.blogs (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  title        text not null,
  excerpt      text,
  content      text,
  cover_image  text,
  author_id    uuid references public.profiles(id) on delete set null,
  tags         text[] not null default '{}',
  is_published boolean not null default false,
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.faq (
  id          uuid primary key default gen_random_uuid(),
  question    text not null,
  answer      text not null,
  category    text,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.contact_messages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text not null,
  subject     text,
  message     text not null,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);

create table public.newsletter (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  is_subscribed boolean not null default true,
  created_at    timestamptz not null default now()
);

-- Key/value store for global site configuration
create table public.site_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

-- Polymorphic SEO overrides for any entity (product, page, blog...)
create table public.seo (
  id               uuid primary key default gen_random_uuid(),
  entity_type      text not null,             -- 'product' | 'cms_page' | 'blog' | ...
  entity_id        uuid not null,
  meta_title       text,
  meta_description text,
  og_image         text,
  canonical_url    text,
  keywords         text[] not null default '{}',
  json_ld          jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (entity_type, entity_id)
);

-- =====================================================================
-- 8. LOGGING
-- =====================================================================

-- Customer-facing activity (login, order placed, review posted...)
create table public.activity_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete set null,
  action      text not null,
  entity      text,
  entity_id   uuid,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);
create index idx_activity_user on public.activity_logs(user_id);

-- Immutable record of privileged data changes (admin edits, deletes)
create table public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles(id) on delete set null,
  action      text not null,
  table_name  text not null,
  record_id   uuid,
  old_data    jsonb,
  new_data    jsonb,
  created_at  timestamptz not null default now()
);
create index idx_audit_table on public.audit_logs(table_name, record_id);

-- =====================================================================
-- 9. updated_at triggers (all mutable tables)
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','addresses','categories','subcategories','brands','products',
    'product_variants','cart','cart_items','orders','payments','shipping',
    'refunds','reviews','banners','cms_pages','blogs','faq','seo'
  ] loop
    execute format(
      'create trigger trg_%1$s_updated before update on public.%1$s
       for each row execute function public.set_updated_at();', t);
  end loop;
end $$;

-- Audit the most sensitive tables
create trigger trg_audit_products after insert or update or delete on public.products
  for each row execute function public.audit_row();
create trigger trg_audit_orders after insert or update or delete on public.orders
  for each row execute function public.audit_row();

-- =====================================================================
-- 10. Row Level Security (baseline — expanded in later phases)
-- =====================================================================
alter table public.profiles         enable row level security;
alter table public.addresses        enable row level security;
alter table public.cart             enable row level security;
alter table public.cart_items       enable row level security;
alter table public.wishlist         enable row level security;
alter table public.orders           enable row level security;
alter table public.order_items      enable row level security;
alter table public.payments         enable row level security;
alter table public.reviews          enable row level security;
alter table public.notifications    enable row level security;
alter table public.products         enable row level security;
alter table public.categories       enable row level security;
alter table public.subcategories    enable row level security;
alter table public.brands           enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_images   enable row level security;

-- Self-owned data
create policy "own profile"        on public.profiles     for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "own addresses"      on public.addresses    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own wishlist"       on public.wishlist     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own notifications"  on public.notifications for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own orders read"    on public.orders       for select using (auth.uid() = user_id or public.is_admin(auth.uid()));

-- Public catalog is world-readable; writes are admin-only
create policy "public read products"   on public.products         for select using (is_published or public.is_admin(auth.uid()));
create policy "admin write products"   on public.products         for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "public read categories" on public.categories       for select using (true);
create policy "public read subcats"    on public.subcategories    for select using (true);
create policy "public read brands"     on public.brands           for select using (true);
create policy "public read variants"   on public.product_variants for select using (true);
create policy "public read images"     on public.product_images   for select using (true);

-- Approved reviews are public; a user manages their own
create policy "read approved reviews" on public.reviews for select using (is_approved or auth.uid() = user_id);
create policy "write own reviews"     on public.reviews for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
