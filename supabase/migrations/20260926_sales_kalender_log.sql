-- 2026-09-26 owner decision: sales may change allotment and prices (Kalender + rule-set),
-- and every change must show who did it and what the value was before.
--
-- 1. admin_calendar_save: owner OR sales; the booking_events row now carries a per-cell
--    before/after list (`perubahan`), so "jatah 5 -> 2 by bima@" is visible.
-- 2. rule_set: sales may insert/update/delete; a trigger logs every change with old/new rows.
-- 3. booking_events becomes append-only from the client side: admins can read it, nobody can
--    edit or delete it through the API (all writers are SECURITY DEFINER functions).

create or replace function public.admin_calendar_save(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_rooms text[] := (select array_agg(x) from jsonb_array_elements_text(p->'rooms') x);
  v_from date := (p->>'from')::date;
  v_to date := (p->>'to')::date;
  v_days int[] := coalesce((select array_agg(x::int) from jsonb_array_elements_text(coalesce(p->'days','[]'::jsonb)) x), '{}');
  v_set jsonb := coalesce(p->'set', '{}'::jsonb);
  v_reset boolean := coalesce((v_set->>'reset')::boolean, false);
  v_email text;
  v_room text; d date; v_n int := 0;
  v_new_allotment int; v_terpakai int;
  v_old jsonb; v_new jsonb;
  v_perubahan jsonb := '[]'::jsonb;
begin
  if not public.has_role('owner', 'sales') then raise exception 'UNAUTHORIZED' using errcode = '28000'; end if;
  if v_from is null or v_to is null or v_to < v_from then raise exception 'TANGGAL_TIDAK_VALID'; end if;

  select email into v_email from auth.users where id = auth.uid();

  foreach v_room in array coalesce(v_rooms, '{}') loop
    d := v_from;
    while d <= v_to loop
      if array_length(v_days, 1) is null or extract(dow from d)::int = any(v_days) then

        select to_jsonb(i) - 'updated_at' - 'updated_by' into v_old
          from public.inventori i where tanggal = d and room_code = v_room;

        insert into public.inventori (tanggal, room_code, updated_by)
        values (d, v_room, v_email)
        on conflict (tanggal, room_code) do nothing;

        if v_set ? 'stop_sell' then
          update public.inventori set stop_sell = (v_set->>'stop_sell')::boolean, updated_at = now(), updated_by = v_email
            where tanggal = d and room_code = v_room;
        end if;
        if v_set ? 'allotment' then
          update public.inventori set allotment = (v_set->>'allotment')::int, updated_at = now(), updated_by = v_email
            where tanggal = d and room_code = v_room;
        end if;
        if v_set ? 'harga' then
          update public.inventori set harga = (v_set->>'harga')::bigint, updated_at = now(), updated_by = v_email
            where tanggal = d and room_code = v_room;
        end if;
        if v_set ? 'rule_set_id' then
          update public.inventori set rule_set_id = (v_set->>'rule_set_id')::uuid, updated_at = now(), updated_by = v_email
            where tanggal = d and room_code = v_room;
        end if;
        if v_set ? 'catatan' then
          update public.inventori set catatan = v_set->>'catatan', updated_at = now(), updated_by = v_email
            where tanggal = d and room_code = v_room;
        end if;
        if v_set ? 'min_malam' then
          update public.inventori set min_malam = (v_set->>'min_malam')::int, updated_at = now(), updated_by = v_email
            where tanggal = d and room_code = v_room;
        end if;
        if v_set ? 'tutup_checkin' then
          update public.inventori set tutup_checkin = (v_set->>'tutup_checkin')::boolean, updated_at = now(), updated_by = v_email
            where tanggal = d and room_code = v_room;
        end if;
        if v_set ? 'tutup_checkout' then
          update public.inventori set tutup_checkout = (v_set->>'tutup_checkout')::boolean, updated_at = now(), updated_by = v_email
            where tanggal = d and room_code = v_room;
        end if;
        if v_reset then
          update public.inventori set harga = null, rule_set_id = null, min_malam = null,
                 tutup_checkin = false, tutup_checkout = false, updated_at = now(), updated_by = v_email
            where tanggal = d and room_code = v_room;
        end if;

        select allotment into v_new_allotment from public.inventori where tanggal = d and room_code = v_room;
        v_terpakai := private.rooms_used(v_room, d);
        if v_set ? 'allotment' and v_new_allotment is not null and v_new_allotment < v_terpakai then
          raise exception 'JATAH_KURANG' using detail = d::text || ' ' || v_room;
        end if;

        -- before/after per changed column; a cell with no row yet had every value unset (null)
        select to_jsonb(i) - 'updated_at' - 'updated_by' into v_new
          from public.inventori i where tanggal = d and room_code = v_room;
        v_perubahan := v_perubahan || coalesce((
          select jsonb_agg(jsonb_build_object('tanggal', d, 'kamar', v_room, 'kolom', k,
                                              'lama', v_old->k, 'baru', v_new->k))
          from jsonb_object_keys(v_new) k
          where k not in ('tanggal', 'room_code')
            and (v_old->k) is distinct from (v_new->k)
            and not (v_old is null and v_new->k in ('null'::jsonb, 'false'::jsonb))
        ), '[]'::jsonb);

        v_n := v_n + 1;
      end if;
      d := d + 1;
    end loop;
  end loop;

  insert into public.booking_events (jenis, data, oleh)
  values ('kalender', jsonb_build_object('rooms', v_rooms, 'from', v_from, 'to', v_to, 'days', v_days,
                                         'set', v_set, 'sel_diubah', v_n, 'perubahan', v_perubahan), v_email);

  return jsonb_build_object('sel_diubah', v_n);
end $function$;

-- rule-set: owner + sales, every change logged
drop policy if exists owner_insert_rule_set on public.rule_set;
drop policy if exists owner_update_rule_set on public.rule_set;
drop policy if exists owner_delete_rule_set on public.rule_set;
create policy staff_insert_rule_set on public.rule_set for insert
  with check (public.has_role('owner', 'sales'));
create policy staff_update_rule_set on public.rule_set for update
  using (public.has_role('owner', 'sales')) with check (public.has_role('owner', 'sales'));
create policy staff_delete_rule_set on public.rule_set for delete
  using (public.has_role('owner', 'sales'));

create or replace function private.log_rule_set()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  insert into public.booking_events (jenis, data, oleh)
  values ('rule_set',
          jsonb_build_object('aksi', lower(tg_op),
                             'lama', case when tg_op <> 'INSERT' then to_jsonb(old) - 'updated_at' - 'updated_by' end,
                             'baru', case when tg_op <> 'DELETE' then to_jsonb(new) - 'updated_at' - 'updated_by' end),
          (select email from auth.users where id = auth.uid()));
  return null;
end $function$;

drop trigger if exists rule_set_log on public.rule_set;
create trigger rule_set_log after insert or update or delete on public.rule_set
  for each row execute function private.log_rule_set();

-- log is read-only for the admin app
drop policy if exists admin_all_booking_events on public.booking_events;
drop policy if exists admin_select_booking_events on public.booking_events;
create policy admin_select_booking_events on public.booking_events for select
  using (public.is_admin());

-- owner (only) may delete Kalender / rule-set log entries; booking events (payments,
-- check-in, cancellations) stay undeletable for everyone
drop policy if exists owner_delete_change_log on public.booking_events;
create policy owner_delete_change_log on public.booking_events for delete
  using (public.has_role('owner') and jenis in ('kalender', 'rule_set'));
