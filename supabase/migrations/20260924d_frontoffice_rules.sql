-- Aturan front office dari owner (24 Sep 2026):
--  * K10: batas no-show 23.30 WIB; tombol no-show ditolak sebelum jam itu pada hari check-in.
--  * K9: jaminan saat check-in wajib, pilih salah satu: deposit uang Rp100.000 ATAU titip kartu identitas.
-- Sekalian: check-in ke kamar yang masih ditempati tamu lain ditolak, dan laporan APOA dicatat waktunya.

alter table public.booking_setting alter column jam_no_show set default '23:30';
alter table public.booking_setting add column if not exists deposit_nominal bigint not null default 100000 check (deposit_nominal >= 0);
update public.booking_setting set jam_no_show = '23:30' where id = 1;

alter table public.booking add column if not exists deposit_jenis text check (deposit_jenis in ('uang', 'identitas'));

drop function if exists public.admin_checkin(text, uuid, boolean, bigint, text);

create or replace function public.admin_checkin(
  p_kode text, p_room_id uuid, p_id_verified boolean, p_deposit_jenis text, p_apoa boolean, p_catatan text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  b public.booking;
  r public.rooms;
  v_email text;
  v_nominal bigint;
begin
  if not public.has_role('owner','front_office') then raise exception 'UNAUTHORIZED' using errcode = '28000'; end if;
  select email into v_email from auth.users where id = auth.uid();

  select * into b from public.booking where kode = p_kode for update;
  if not found then raise exception 'BOOKING_TIDAK_ADA'; end if;
  if b.status <> 'lunas' then raise exception 'STATUS_TIDAK_VALID'; end if;
  if not coalesce(p_id_verified, false) then raise exception 'ID_BELUM_DIVERIFIKASI'; end if;
  if p_deposit_jenis is null or p_deposit_jenis not in ('uang', 'identitas') then raise exception 'JAMINAN_WAJIB'; end if;

  select * into r from public.rooms where id = p_room_id;
  if not found or not r.aktif or r.room_code <> b.room_code then raise exception 'KAMAR_TIDAK_COCOK'; end if;
  if exists (select 1 from public.booking o where o.room_id = p_room_id and o.status = 'checked_in' and o.id <> b.id) then
    raise exception 'KAMAR_TERISI' using detail = r.nomor;
  end if;

  select deposit_nominal into v_nominal from public.booking_setting where id = 1;

  update public.booking set status = 'checked_in', room_id = p_room_id, id_verified = true,
         deposit_jenis = p_deposit_jenis,
         deposit = case when p_deposit_jenis = 'uang' then v_nominal else null end,
         apoa_reported_at = case when coalesce(p_apoa, false) then now() else apoa_reported_at end,
         catatan_admin = coalesce(p_catatan, catatan_admin),
         checked_in_at = now(), checked_in_by = v_email, updated_at = now()
   where id = b.id returning * into b;

  insert into public.booking_events (booking_id, jenis, data, oleh)
  values (b.id, 'checkin', jsonb_build_object('room_id', p_room_id, 'nomor', r.nomor, 'jaminan', p_deposit_jenis, 'apoa', coalesce(p_apoa, false)), v_email);

  return public.booking_get(p_kode);
end $$;

create or replace function public.admin_no_show(p_kode text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  b public.booking; v_email text;
  v_now timestamp := now() at time zone 'Asia/Jakarta';
  v_batas time;
begin
  if not public.has_role('owner','front_office') then raise exception 'UNAUTHORIZED' using errcode = '28000'; end if;
  select email into v_email from auth.users where id = auth.uid();

  select * into b from public.booking where kode = p_kode for update;
  if not found then raise exception 'BOOKING_TIDAK_ADA'; end if;
  if b.status <> 'lunas' or b.checkin > v_now::date then raise exception 'STATUS_TIDAK_VALID'; end if;

  select jam_no_show into v_batas from public.booking_setting where id = 1;
  if b.checkin = v_now::date and v_now::time < v_batas then
    raise exception 'BELUM_JAM_NO_SHOW' using detail = to_char(v_batas, 'HH24.MI');
  end if;

  update public.booking set status = 'no_show', no_show_at = now(), updated_at = now() where id = b.id returning * into b;
  insert into public.booking_events (booking_id, jenis, oleh) values (b.id, 'no_show', v_email);

  return public.booking_get(p_kode);
end $$;

revoke execute on function public.admin_checkin(text, uuid, boolean, text, boolean, text) from public, anon;
grant execute on function public.admin_checkin(text, uuid, boolean, text, boolean, text) to authenticated;
