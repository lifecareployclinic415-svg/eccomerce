-- =====================================================================
-- Migration: 0007_storage.sql
--
-- Buckets are declared here rather than clicked in the dashboard so that
-- storage configuration is versioned, reviewable and reproducible on a
-- fresh project — same reason the tables are.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Buckets
--
-- file_size_limit and allowed_mime_types are enforced by the STORAGE API,
-- not by our code. That matters: a client can lie about a file's type in
-- the request, so the last line of defence has to sit server-side.
-- Note: on the Free plan a bucket limit cannot exceed 50MB.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('product-images',  'product-images',  true,  5242880,  array['image/jpeg','image/png','image/webp','image/avif']),
  ('category-images', 'category-images', true,  3145728,  array['image/jpeg','image/png','image/webp']),
  ('brand-logos',     'brand-logos',     true,  1048576,  array['image/png','image/webp','image/svg+xml']),
  ('avatars',         'avatars',         true,  2097152,  array['image/jpeg','image/png','image/webp']),
  ('cms-assets',      'cms-assets',      true,  8388608,  array['image/jpeg','image/png','image/webp','image/avif']),
  ('invoices',        'invoices',        false, 5242880,  array['application/pdf'])
on conflict (id) do update
  set file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------
-- Media asset ledger
--
-- Every upload is recorded BEFORE the file exists. Uploads that are never
-- attached to a product (the shopper closed the tab mid-form) stay
-- 'pending' and get swept. Without this, storage silently fills with files
-- nothing references and no one can safely identify.
-- ---------------------------------------------------------------------
create table if not exists public.media_assets (
  id           uuid primary key default gen_random_uuid(),
  bucket       text not null,
  path         text not null,
  mime_type    text,
  size_bytes   bigint,
  width        int,
  height       int,
  -- 'pending' until a row elsewhere references it; then 'attached'.
  status       text not null default 'pending' check (status in ('pending','attached')),
  entity_type  text,
  entity_id    uuid,
  uploaded_by  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (bucket, path)
);

create index if not exists idx_media_pending
  on public.media_assets (created_at) where status = 'pending';

create index if not exists idx_media_entity
  on public.media_assets (entity_type, entity_id);

alter table public.media_assets enable row level security;

create policy "admins manage media" on public.media_assets
  for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- Storage object policies
--
-- Public READ so images serve from the CDN without a signed URL round
-- trip. WRITE and DELETE are admin-only — a public bucket that anyone can
-- write to is a free file host for whoever finds it.
-- ---------------------------------------------------------------------
do $$
declare b text;
begin
  foreach b in array array['product-images','category-images','brand-logos','cms-assets']
  loop
    execute format($p$
      drop policy if exists "public read %1$s" on storage.objects;
      create policy "public read %1$s" on storage.objects
        for select using (bucket_id = %1$L);

      drop policy if exists "admin write %1$s" on storage.objects;
      create policy "admin write %1$s" on storage.objects
        for insert with check (bucket_id = %1$L and public.is_admin(auth.uid()));

      drop policy if exists "admin update %1$s" on storage.objects;
      create policy "admin update %1$s" on storage.objects
        for update using (bucket_id = %1$L and public.is_admin(auth.uid()));

      drop policy if exists "admin delete %1$s" on storage.objects;
      create policy "admin delete %1$s" on storage.objects
        for delete using (bucket_id = %1$L and public.is_admin(auth.uid()));
    $p$, b);
  end loop;
end $$;

-- Avatars are owned by the user. The convention is avatars/{user_id}/file,
-- so the first path segment is compared to auth.uid().
drop policy if exists "public read avatars" on storage.objects;
create policy "public read avatars" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "own avatar write" on storage.objects;
create policy "own avatar write" on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "own avatar delete" on storage.objects;
create policy "own avatar delete" on storage.objects
  for delete using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Invoices are private: readable only by the order's owner or an admin.
drop policy if exists "read own invoice" on storage.objects;
create policy "read own invoice" on storage.objects
  for select using (
    bucket_id = 'invoices'
    and (
      public.is_admin(auth.uid())
      or exists (
        select 1 from public.orders o
        where o.user_id = auth.uid()
          and (storage.foldername(name))[1] = o.id::text
      )
    )
  );

-- ---------------------------------------------------------------------
-- Orphan sweeper
--
-- Returns the paths to delete. Storage objects cannot be removed from SQL,
-- so a scheduled Edge Function calls this, deletes the files through the
-- Storage API, then clears the rows.
--
--   select cron.schedule('sweep-media','0 3 * * *',
--     $$select net.http_post(
--         url := 'https://<ref>.supabase.co/functions/v1/sweep-media',
--         headers := '{"Authorization":"Bearer <service_role>"}'::jsonb)$$);
-- ---------------------------------------------------------------------
create or replace function public.list_orphaned_media(p_older_than_hours int default 24)
returns table (id uuid, bucket text, path text)
language sql
security definer set search_path = public
as $$
  select m.id, m.bucket, m.path
  from public.media_assets m
  where m.status = 'pending'
    and m.created_at < now() - make_interval(hours => p_older_than_hours)
  limit 500;
$$;

create or replace function public.attach_media(
  p_asset_ids  uuid[],
  p_entity_type text,
  p_entity_id   uuid
)
returns int
language sql
security definer set search_path = public
as $$
  with updated as (
    update public.media_assets
       set status = 'attached', entity_type = p_entity_type, entity_id = p_entity_id
     where id = any(p_asset_ids)
    returning 1
  )
  select count(*)::int from updated;
$$;
