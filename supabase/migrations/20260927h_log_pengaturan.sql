-- Riwayat also records who changed booking rules (booking_setting) and add-on prices (addon):
-- sales have the owner's powers there, so the owner needs the same trail as for the Kalender.
create or replace function private.setting_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) - 'updated_at' end;
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) - 'updated_at' end;
  v_perubahan jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('kolom', k, 'lama', v_old->k, 'baru', v_new->k)), '[]'::jsonb)
    into v_perubahan
    from (select jsonb_object_keys(coalesce(v_new, v_old)) k) s
   where k not in ('id', 'urutan') and (v_old->k) is distinct from (v_new->k);
  if tg_op = 'UPDATE' and v_perubahan = '[]'::jsonb then return new; end if;

  insert into public.booking_events (jenis, data, oleh)
  values ('pengaturan', jsonb_build_object(
            'tabel', tg_table_name, 'aksi', lower(tg_op),
            'nama', coalesce(v_new->>'nama', v_old->>'nama'),
            'perubahan', v_perubahan),
          (select email from auth.users where id = auth.uid()));
  return coalesce(new, old);
end;
$function$;

drop trigger if exists setting_log on public.booking_setting;
create trigger setting_log after update on public.booking_setting
  for each row execute function private.setting_log();
drop trigger if exists addon_log on public.addon;
create trigger addon_log after insert or update or delete on public.addon
  for each row execute function private.setting_log();

drop policy if exists owner_delete_change_log on public.booking_events;
create policy owner_delete_change_log on public.booking_events for delete to authenticated
  using (public.has_role('owner') and jenis = any (array['kalender', 'rule_set', 'voucher', 'pengaturan']));
