-- Owner revisions 30 Sep 2026 (operations): room board status, audit trail for every account, add-on rules,
-- owner-only website content, realtime for the admin + website.

-- 1. Room board: per-night manual status of a physical room ------------------------------------------------------
--   terisi  = occupied without a website booking (walk-in / offline) -> takes one allotment that night
--   no_show = marked no-show on the board (room released, does not take allotment)
--   kosong  = clears the manual status (the row is deleted)
create table if not exists public.room_status (
  tanggal    date not null,
  room_id    uuid not null references public.rooms (id) on delete cascade,
  status     text not null check (status in ('terisi', 'no_show')),
  catatan    text,
  oleh       text,
  updated_at timestamptz not null default now(),
  primary key (tanggal, room_id)
);
alter table public.room_status enable row level security;
drop policy if exists admin_select_room_status on public.room_status;
create policy admin_select_room_status on public.room_status for select to authenticated using (public.is_admin());

-- rooms taken on one night: paid / staying bookings + live holds + rooms marked occupied on the board
-- (a board mark on a room a checked-in booking already holds is not counted twice)
create or replace function private.rooms_used(p_room text, p_date date)
returns int language sql stable security definer set search_path = '' as $$
  select (select coalesce(sum(b.jumlah_kamar), 0)::int
            from public.booking b
           where b.room_code = p_room and b.checkin <= p_date and b.checkout > p_date
             and (b.status in ('lunas','checked_in','no_show','checked_out')
                  or (b.status = 'menunggu_bayar' and b.expires_at > now())))
       + (select count(*)::int
            from public.room_status rs join public.rooms r on r.id = rs.room_id
           where r.room_code = p_room and rs.tanggal = p_date and rs.status = 'terisi'
             and not exists (select 1 from public.booking b
                              where b.room_id = rs.room_id and b.status in ('checked_in', 'checked_out')
                                and b.checkin <= p_date and b.checkout > p_date))
$$;

-- every staff account (owner, sales, front office) may set the board; each change lands in Riwayat
create or replace function public.room_status_set(p_room_id uuid, p_tanggal date, p_status text,
                                                  p_malam int default 1, p_catatan text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.rooms; d date; v_email text; v_kode text;
  v_malam int := least(greatest(coalesce(p_malam, 1), 1), 30);
begin
  if not public.is_admin() then raise exception 'UNAUTHORIZED' using errcode = '28000'; end if;
  if p_status not in ('terisi', 'no_show', 'kosong') then raise exception 'STATUS_TIDAK_VALID'; end if;
  select * into r from public.rooms where id = p_room_id;
  if not found then raise exception 'KAMAR_TIDAK_ADA'; end if;
  if not r.aktif and p_status = 'terisi' then raise exception 'KAMAR_NONAKTIF' using detail = r.nomor; end if;
  select email into v_email from auth.users where id = auth.uid();

  for i in 0 .. v_malam - 1 loop
    d := p_tanggal + i;
    -- a room a guest is checked into is handled through check-out, not the board
    select b.kode into v_kode from public.booking b
     where b.room_id = p_room_id and b.status = 'checked_in' and b.checkin <= d and b.checkout > d limit 1;
    if v_kode is not null and p_status <> 'terisi' then
      raise exception 'KAMAR_DITEMPATI_BOOKING' using detail = v_kode;
    end if;
    if p_status = 'kosong' then
      delete from public.room_status where tanggal = d and room_id = p_room_id;
    else
      insert into public.room_status (tanggal, room_id, status, catatan, oleh, updated_at)
      values (d, p_room_id, p_status, nullif(trim(coalesce(p_catatan, '')), ''), v_email, now())
      on conflict (tanggal, room_id) do update
        set status = excluded.status, catatan = excluded.catatan, oleh = excluded.oleh, updated_at = now();
    end if;
  end loop;

  insert into public.booking_events (jenis, data, oleh)
  values ('papan_kamar', jsonb_build_object('nomor', r.nomor, 'kamar', r.room_code, 'status', p_status,
          'dari', p_tanggal, 'malam', v_malam, 'catatan', nullif(trim(coalesce(p_catatan, '')), '')), v_email);
  return jsonb_build_object('nomor', r.nomor, 'status', p_status, 'malam', v_malam);
end $$;
revoke all on function public.room_status_set(uuid, date, text, int, text) from public, anon;
grant execute on function public.room_status_set(uuid, date, text, int, text) to authenticated;

-- 2. Riwayat: every account's change to rooms, room types and website content is logged ----------------------------
create or replace function private.audit_log()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_perubahan jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('kolom', k, 'lama', v_old->k, 'baru', v_new->k)), '[]'::jsonb)
    into v_perubahan
    from (select jsonb_object_keys(coalesce(v_new, v_old)) k) s
   where k not in ('updated_at', 'created_at') and (v_old->k) is distinct from (v_new->k);
  if tg_op = 'UPDATE' and v_perubahan = '[]'::jsonb then return null; end if;
  insert into public.booking_events (jenis, data, oleh)
  values ('perubahan', jsonb_build_object(
            'tabel', tg_table_name, 'aksi', lower(tg_op),
            'nama', coalesce(v_new->>'nama', v_new->>'title', v_new->>'nomor', v_new->>'key', v_new->>'url',
                             v_old->>'nama', v_old->>'title', v_old->>'nomor', v_old->>'key', v_old->>'url'),
            'perubahan', case when tg_op = 'UPDATE' then v_perubahan else '[]'::jsonb end),
          (select email from auth.users where id = auth.uid()));
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['room_type', 'rooms', 'kamar', 'galeri', 'signature_experiences', 'meeting_packages',
                           'hari_libur', 'pengaturan'] loop
    execute format('drop trigger if exists audit_log on public.%I', t);
    execute format('create trigger audit_log after insert or update or delete on public.%I
                    for each row execute function private.audit_log()', t);
  end loop;
end $$;

-- owner may still delete change logs (not booking / payment / check-in / board events); nobody else may
drop policy if exists owner_delete_change_log on public.booking_events;
create policy owner_delete_change_log on public.booking_events for delete to authenticated
  using (public.has_role('owner') and jenis = any (array['kalender', 'rule_set', 'voucher', 'pengaturan', 'perubahan']));

-- 3. Website content (Galeri, Signature, Meeting) is managed by the owner only ---------------------------------------
do $$
declare t text; p text;
begin
  foreach t in array array['galeri', 'signature_experiences', 'meeting_packages'] loop
    p := case t when 'galeri' then 'galeri' when 'signature_experiences' then 'signature' else 'meeting' end;
    execute format('drop policy if exists admin_all_%s on public.%I', p, t);
    execute format('drop policy if exists admin_select_%s on public.%I', p, t);
    execute format('drop policy if exists owner_write_%s on public.%I', p, t);
    execute format('create policy admin_select_%s on public.%I for select to authenticated using (public.is_admin())', p, t);
    execute format('create policy owner_write_%s on public.%I for all to authenticated
                    using (public.has_role(''owner'')) with check (public.has_role(''owner''))', p, t);
  end loop;
end $$;

-- 4. Add-on rules: lead time (Romantic Dinner / Towel need H-2) and a daily quota for the whole resort --------------
alter table public.addon
  add column if not exists kuota_harian int check (kuota_harian is null or kuota_harian >= 1),
  add column if not exists min_hari_sebelum int not null default 0 check (min_hari_sebelum between 0 and 30);
update public.addon set min_hari_sebelum = 2 where kode in ('romantic_dinner', 'romantic_towel');
update public.addon set kuota_harian = case kode when 'bajaj_fun_trip' then 1 when 'rooftop_bbq' then 4 when 'romantic_dinner' then 2 end
 where kode in ('bajaj_fun_trip', 'rooftop_bbq', 'romantic_dinner');

-- units of an add-on already taken for stays checking in on a date (paid / staying + live holds)
create or replace function private.addon_terpakai(p_kode text, p_tanggal date)
returns int language sql stable security definer set search_path = '' as $$
  select coalesce(sum((x->>'qty')::int), 0)::int
  from public.booking b, jsonb_array_elements(coalesce(b.addons, '[]'::jsonb)) x
  where b.checkin = p_tanggal and x->>'kode' = p_kode
    and (b.status in ('lunas', 'checked_in', 'checked_out', 'no_show')
         or (b.status = 'menunggu_bayar' and b.expires_at > now()))
$$;

-- public: remaining daily quota per add-on for a check-in date (no guest data)
create or replace function public.addon_sisa(p_tanggal date)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(a.kode, greatest(a.kuota_harian - private.addon_terpakai(a.kode, p_tanggal), 0)), '{}'::jsonb)
  from public.addon a where a.aktif and a.kuota_harian is not null
$$;
revoke all on function public.addon_sisa(date) from public;
grant execute on function public.addon_sisa(date) to anon, authenticated;

-- price_booking: refuse an add-on booked too late or beyond the day's quota (quote + booking use the same rule)
do $$
declare s text := pg_get_functiondef('private.price_booking(text,date,date,integer,jsonb,numeric,text)'::regprocedure);
  a text := 'if not found or v_q > a.maks then raise exception ''ADDON_TIDAK_VALID'' using detail = coalesce(x->>''kode'', ''''); end if;';
begin
  if (length(s) - length(replace(s, a, ''))) / length(a) <> 1 then raise exception 'price_booking anchor not found exactly once'; end if;
  execute replace(s, a, a || '
    if a.min_hari_sebelum > 0 and p_in - (now() at time zone ''Asia/Jakarta'')::date < a.min_hari_sebelum then
      raise exception ''ADDON_H2'' using detail = a.nama;
    end if;
    if a.kuota_harian is not null and private.addon_terpakai(a.kode, p_in) + v_q > a.kuota_harian then
      raise exception ''ADDON_HABIS'' using detail = a.nama;
    end if;');
end $$;

-- booking_insert: serialize bookings that take the same add-on on the same day, so the last unit goes to one guest
do $$
declare s text := pg_get_functiondef('private.booking_insert(jsonb,text,text)'::regprocedure);
  a text := '  v_quote := private.price_booking(';
begin
  if (length(s) - length(replace(s, a, ''))) / length(a) <> 1 then raise exception 'booking_insert anchor not found exactly once'; end if;
  execute replace(s, a, '  perform pg_advisory_xact_lock(hashtext(''addon:'' || (x->>''kode'') || '':'' || v_in::text))
     from jsonb_array_elements(coalesce(p->''addons'', ''[]''::jsonb)) x where coalesce((x->>''qty'')::int, 0) > 0;
' || a);
end $$;

-- public setting: add-on list carries the lead time + quota so the website can explain them
create or replace function public.booking_public_setting()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'min_malam', min_malam, 'maks_malam', maks_malam,
    'advance_notice_hari', advance_notice_hari, 'batas_jam_hari_ini', batas_jam_hari_ini,
    'jendela_bulan', jendela_bulan, 'jam_checkin', jam_checkin, 'jam_checkout', jam_checkout,
    'hold_web_menit', hold_web_menit, 'pajak_persen', pajak_persen, 'pajak_termasuk', pajak_termasuk,
    'kebijakan_pembatalan', kebijakan_pembatalan,
    'kapasitas_kamar', kapasitas_kamar, 'extra_bed_maks', extra_bed_maks,
    'addons', coalesce((select jsonb_agg(jsonb_build_object('kode', a.kode, 'nama', a.nama, 'harga', a.harga,
                          'satuan', a.satuan, 'per_malam', a.per_malam, 'maks', a.maks,
                          'kuota_harian', a.kuota_harian, 'min_hari', a.min_hari_sebelum) order by a.urutan)
                        from public.addon a where a.aktif), '[]'::jsonb),
    'kamar', coalesce((select jsonb_agg(jsonb_build_object('kode', rt.room_code, 'nama', rt.nama, 'unit', rt.jumlah_unit)
                          order by rt.urutan, rt.room_code)
                        from public.room_type rt where rt.aktif and rt.tampil_web), '[]'::jsonb))
  from public.booking_setting where id = 1
$$;

-- 5. Realtime: admin screens and the website refresh the moment another account saves ------------------------------
do $$
declare t text;
begin
  foreach t in array array['room_type', 'rooms', 'kamar', 'room_status', 'inventori', 'booking_events', 'galeri',
                           'signature_experiences', 'meeting_packages', 'addon'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
