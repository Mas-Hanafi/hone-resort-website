-- 2026-09-26 owner decision: sales get the same powers as the owner, except
--   * deleting Kalender / rule-set log entries (owner_delete_change_log stays owner-only)
--   * the sales discount cap: sales stay capped at booking_setting.diskon_sales_maks,
--     and only the owner may change that cap.
-- Policy names keep their old owner_* prefix; only the role list changes.

alter policy owner_write_addon on public.addon
  using (public.has_role('owner', 'sales')) with check (public.has_role('owner', 'sales'));
alter policy owner_write_hari_libur on public.hari_libur
  using (public.has_role('owner', 'sales')) with check (public.has_role('owner', 'sales'));

alter policy owner_insert_booking_setting on public.booking_setting with check (public.has_role('owner', 'sales'));
alter policy owner_update_booking_setting on public.booking_setting
  using (public.has_role('owner', 'sales')) with check (public.has_role('owner', 'sales'));
alter policy owner_delete_booking_setting on public.booking_setting using (public.has_role('owner', 'sales'));

alter policy owner_insert_inventori on public.inventori with check (public.has_role('owner', 'sales'));
alter policy owner_update_inventori on public.inventori
  using (public.has_role('owner', 'sales')) with check (public.has_role('owner', 'sales'));
alter policy owner_delete_inventori on public.inventori using (public.has_role('owner', 'sales'));

alter policy owner_insert_room_type on public.room_type with check (public.has_role('owner', 'sales'));
alter policy owner_update_room_type on public.room_type
  using (public.has_role('owner', 'sales')) with check (public.has_role('owner', 'sales'));
alter policy owner_delete_room_type on public.room_type using (public.has_role('owner', 'sales'));

-- check-in / check-out / no-show: add sales to the allowed roles, rest of each function unchanged
do $$
declare f text; def text;
begin
  foreach f in array array['public.admin_checkin(text,uuid,boolean,text,boolean,text)',
                           'public.admin_checkout(text,boolean)',
                           'public.admin_no_show(text)'] loop
    def := pg_get_functiondef(f::regprocedure);
    if position('has_role(''owner'',''front_office'')' in def) = 0 then
      raise exception 'role check not found in %', f;
    end if;
    execute replace(def, 'has_role(''owner'',''front_office'')', 'has_role(''owner'',''front_office'',''sales'')');
  end loop;
end $$;

-- only the owner may move the sales discount cap
create or replace function private.guard_diskon_sales_maks()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  -- auth.uid() is null for the SQL editor / migrations, which stay allowed
  if new.diskon_sales_maks is distinct from old.diskon_sales_maks
     and auth.uid() is not null and not public.has_role('owner') then
    raise exception 'HANYA_OWNER_DISKON' using errcode = '42501';
  end if;
  return new;
end $function$;

drop trigger if exists guard_diskon_sales_maks on public.booking_setting;
create trigger guard_diskon_sales_maks before update on public.booking_setting
  for each row execute function private.guard_diskon_sales_maks();
