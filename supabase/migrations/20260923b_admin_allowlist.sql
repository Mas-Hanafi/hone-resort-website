-- Admin access = explicit allowlist, not "any signed-in user".
-- Why: Supabase Auth signup is open by default and the publishable key ships in the website bundle,
-- so anyone could register, confirm their own email and become "authenticated".
-- Also disable signups: Dashboard > Authentication > Sign In / Providers > "Allow new users to sign up" = off.

create schema if not exists private;
create table if not exists private.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.admins where user_id = auth.uid())
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- booking engine tables
drop policy if exists admin_all_inventori on public.inventori;
create policy admin_all_inventori on public.inventori for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists admin_all_booking on public.booking;
create policy admin_all_booking on public.booking for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create or replace function public.booking_create_sales(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'UNAUTHORIZED' using errcode = '28000'; end if;
  return private.booking_insert(p, 'sales', (select email from auth.users where id = auth.uid()));
end $$;

-- CMS tables (prod has these with "auth.role() = 'authenticated'"). Same fix, same shape.
do $$
declare t text; pol text;
begin
  for t, pol in values ('galeri','admin_all_galeri'), ('kamar','admin_all_kamar'), ('meeting_packages','admin_all_meeting'),
                      ('pengaturan','admin_all_pengaturan'), ('pesan','admin_all_pesan'), ('pricelist_periods','admin_all_pricelist'),
                      ('signature_experiences','admin_all_signature')
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists %I on public.%I', pol, t);
      execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', pol, t);
    end if;
  end loop;
end $$;

-- the old inquiry form is gone; anonymous inserts into pesan are no longer needed
drop policy if exists public_insert_pesan on public.pesan;

-- After applying, register each staff account once:
--   insert into private.admins (user_id, note) select id, email from auth.users where email = 'admin@hone.example';
