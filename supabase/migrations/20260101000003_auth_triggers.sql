-- =====================================================================
-- Migration: 0003_auth_triggers.sql
-- Bridges Supabase's auth.users table into our public schema.
-- =====================================================================

-- Seed the baseline roles (idempotent).
insert into public.roles (name, description) values
  ('super_admin', 'Full system access'),
  ('admin',       'Manage store operations'),
  ('customer',    'Standard shopper')
on conflict (name) do nothing;

-- When Supabase creates an auth user, mirror it into profiles and give
-- them the default 'customer' role. Running this in the database (rather
-- than application code) guarantees no user can ever exist without a
-- profile — even if they sign up via OAuth, the dashboard, or the API.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  customer_role_id uuid;
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;

  select id into customer_role_id from public.roles where name = 'customer';

  if customer_role_id is not null then
    insert into public.user_roles (user_id, role_id)
    values (new.id, customer_role_id)
    on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Role assignment must never be self-service: users can read their own
-- roles but only admins may grant them.
alter table public.user_roles enable row level security;
alter table public.roles enable row level security;

create policy "read own roles" on public.user_roles
  for select using (auth.uid() = user_id or public.is_admin(auth.uid()));

create policy "admins manage roles" on public.user_roles
  for all using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create policy "read roles" on public.roles
  for select using (true);
