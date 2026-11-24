-- PRODUCTION security fix (audit C1), applied to YOUR-PROD-REF on 24 Sep 2026 with owner approval.
-- Before: every CMS table allowed ALL to anyone with auth.role() = 'authenticated', and signup was open,
-- so anyone could register and edit prices/content. After: only accounts in private.admins.
-- Same shape as 20260923b_admin_allowlist.sql + the role column/helpers from 20260924_reservasi_terpadu.sql,
-- minus the booking tables (not on prod yet). Idempotent.
-- Owner must ALSO disable signups: Dashboard > Authentication > Sign In / Providers > "Allow new users to sign up" = off.

create schema if not exists private;
create table if not exists private.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);
alter table private.admins add column if not exists peran text not null default 'owner'
  check (peran in ('owner','sales','front_office'));

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.admins where user_id = auth.uid())
$$;
create or replace function public.admin_role() returns text
language sql stable security definer set search_path = '' as $$
  select peran from private.admins where user_id = auth.uid()
$$;
create or replace function public.has_role(variadic roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.admins where user_id = auth.uid() and peran = any(roles))
$$;
revoke execute on function public.is_admin(), public.admin_role(), public.has_role(text[]) from public, anon;
grant execute on function public.is_admin(), public.admin_role(), public.has_role(text[]) to authenticated;

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

-- inquiry form was removed; anonymous inserts into pesan are no longer needed
drop policy if exists public_insert_pesan on public.pesan;

-- the only existing account (the resort's admin login) becomes owner
insert into private.admins (user_id, note, peran)
select id, email, 'owner' from auth.users where email = 'admin@hone.example'
on conflict (user_id) do nothing;
