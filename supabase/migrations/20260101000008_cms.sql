-- =====================================================================
-- Migration: 0008_cms.sql
--
-- Two content shapes, chosen deliberately:
--
--   SINGLETONS  → site_settings (key → jsonb). One logo, one announcement
--                 bar, one set of social links. A table with one row is a
--                 smell; a typed key/value store is not.
--
--   COLLECTIONS → real tables (testimonials, banners, faq, blogs). These
--                 have many rows, need ordering, scheduling and their own
--                 indexes, so JSON blobs would be the wrong shape.
--
-- The homepage sits between the two and gets its own model below.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Homepage sections — a page builder, not a fixed template
--
-- Rather than hard-coding "hero, then featured, then categories", the
-- homepage is an ordered list of typed sections. The admin reorders,
-- toggles and configures them; the frontend maps `type` to a component.
-- Adding a new section type means one component and one schema, with no
-- migration and no redeploy to rearrange the page.
-- ---------------------------------------------------------------------
create table if not exists public.homepage_sections (
  id         uuid primary key default gen_random_uuid(),
  type       text not null,          -- matches a key in the section registry
  name       text not null,          -- admin-facing label
  config     jsonb not null default '{}',
  sort_order int  not null default 0,
  is_active  boolean not null default true,
  -- Optional scheduling, so a sale section can appear and retire on its own.
  starts_at  timestamptz,
  ends_at    timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint section_window check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create index if not exists idx_sections_active
  on public.homepage_sections (sort_order) where is_active;

-- ---------------------------------------------------------------------
-- Testimonials (missing from the original schema)
-- ---------------------------------------------------------------------
create table if not exists public.testimonials (
  id          uuid primary key default gen_random_uuid(),
  author_name text not null,
  author_role text,
  avatar_url  text,
  quote       text not null,
  rating      int check (rating between 1 and 5),
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_testimonials_active
  on public.testimonials (sort_order) where is_active;

-- ---------------------------------------------------------------------
-- Navigation — header and footer menus, editable and nestable
-- ---------------------------------------------------------------------
create table if not exists public.navigation_items (
  id         uuid primary key default gen_random_uuid(),
  location   text not null check (location in ('header','footer','legal','mobile')),
  parent_id  uuid references public.navigation_items(id) on delete cascade,
  label      text not null,
  href       text not null,
  -- Groups footer links into columns without a second table.
  group_label text,
  sort_order int not null default 0,
  is_active  boolean not null default true,
  opens_new_tab boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_nav_location
  on public.navigation_items (location, sort_order) where is_active;

-- ---------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['homepage_sections','testimonials','navigation_items','site_settings']
  loop
    execute format(
      'drop trigger if exists trg_%1$s_updated on public.%1$s;
       create trigger trg_%1$s_updated before update on public.%1$s
       for each row execute function public.set_updated_at();', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Seed the singleton settings. Shapes here MUST match the Zod schemas in
-- cms.schemas.ts — that file is the contract, this is the default value.
-- ---------------------------------------------------------------------
insert into public.site_settings (key, value) values
  ('brand', '{
     "name": "Storefront",
     "logoLightUrl": null,
     "logoDarkUrl": null,
     "faviconUrl": null,
     "tagline": "Things worth keeping."
   }'::jsonb),

  ('announcement', '{
     "enabled": true,
     "message": "Free delivery on orders over ₹2,000",
     "href": "/shop",
     "linkLabel": "Shop now",
     "variant": "brand"
   }'::jsonb),

  ('social', '{
     "instagram": null, "facebook": null, "x": null,
     "youtube": null, "linkedin": null, "whatsapp": null
   }'::jsonb),

  ('contact', '{
     "email": "hello@example.com",
     "phone": null,
     "addressLines": [],
     "supportHours": "Mon–Sat, 10am–6pm IST",
     "mapEmbedUrl": null
   }'::jsonb),

  ('footer', '{
     "blurb": "A tight collection, chosen for how it wears over years.",
     "showNewsletter": true,
     "newsletterHeading": "Occasional letters, no noise",
     "copyright": null
   }'::jsonb)
on conflict (key) do nothing;

-- Default homepage layout, matching the Phase 7 build.
insert into public.homepage_sections (type, name, config, sort_order) values
  ('hero',            'Hero',              '{"headline":"Things worth keeping.","subhead":"A tight collection, chosen for how it wears over years rather than seasons.","ctaLabel":"Shop the collection","ctaHref":"/shop","imageUrl":"/hero.jpg"}'::jsonb, 0),
  ('product_rail',    'Featured products', '{"heading":"Featured","source":"featured","limit":8,"href":"/shop?is_featured=true"}'::jsonb, 1),
  ('category_strip',  'Shop by category',  '{"heading":"Shop by category","limit":4}'::jsonb, 2),
  ('product_rail',    'Trending',          '{"heading":"Trending now","source":"trending","limit":8,"href":"/shop"}'::jsonb, 3),
  ('testimonials',    'Testimonials',      '{"heading":"What people say","limit":3}'::jsonb, 4),
  ('trust_badges',    'Trust badges',      '{"items":[{"title":"Free delivery over ₹2,000","body":"Dispatched within two working days."},{"title":"Thirty days to return","body":"Unused and in its original packaging."},{"title":"Secure checkout","body":"Cards, UPI, netbanking and cash on delivery."}]}'::jsonb, 5)
on conflict do nothing;

-- Default navigation.
insert into public.navigation_items (location, label, href, sort_order) values
  ('header', 'Shop all', '/shop', 0),
  ('header', 'New in',   '/shop?category=new', 1),
  ('header', 'Featured', '/shop?is_featured=true', 2),
  ('header', 'Journal',  '/blog', 3),
  ('legal',  'Privacy',  '/privacy', 0),
  ('legal',  'Terms',    '/terms', 1),
  ('legal',  'Refunds',  '/refund-policy', 2)
on conflict do nothing;

insert into public.navigation_items (location, label, href, group_label, sort_order) values
  ('footer', 'About us',    '/about',   'Company', 0),
  ('footer', 'Contact',     '/contact', 'Company', 1),
  ('footer', 'Journal',     '/blog',    'Company', 2),
  ('footer', 'FAQ',         '/faq',     'Help',    0),
  ('footer', 'Track order', '/account/orders', 'Help', 1),
  ('footer', 'Shipping',    '/shipping-policy', 'Help', 2)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- RLS: everything here is public-read (it IS the public website) and
-- admin-write. Scheduling and is_active are applied by the query, not the
-- policy, so admins can preview inactive content.
-- ---------------------------------------------------------------------
alter table public.homepage_sections enable row level security;
alter table public.testimonials      enable row level security;
alter table public.navigation_items  enable row level security;
alter table public.site_settings     enable row level security;
alter table public.cms_pages         enable row level security;
alter table public.faq               enable row level security;
alter table public.blogs             enable row level security;
alter table public.banners           enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'homepage_sections','testimonials','navigation_items','site_settings',
    'cms_pages','faq','blogs','banners'
  ]
  loop
    execute format($p$
      drop policy if exists "public read %1$s" on public.%1$s;
      create policy "public read %1$s" on public.%1$s for select using (true);

      drop policy if exists "admin write %1$s" on public.%1$s;
      create policy "admin write %1$s" on public.%1$s
        for all using (public.is_admin(auth.uid()))
        with check (public.is_admin(auth.uid()));
    $p$, t);
  end loop;
end $$;
