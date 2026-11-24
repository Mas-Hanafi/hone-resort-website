-- Keputusan owner 24 Sep 2026 (jawaban poin B):
--   jatah web default = jumlah unit; wajib lunas; non-refundable (hubungi sales);
--   pajak + service 16% DITAMBAHKAN di atas harga (kamar + add-on); add-on bisa dibayar di web;
--   same-day sampai 18.00, jendela pesan web 4 bulan (lebih dari itu lewat sales);
--   kapasitas 2 orang/kamar + maks 2 extra bed (maks 4 orang/kamar);
--   jaminan dikembalikan saat check-out; diskon link sales maks 10% sebelum pajak.
-- Semua angka di booking_setting / addon supaya bisa diubah dari admin tanpa kode.

-- ---------- booking_setting ----------
alter table public.booking_setting drop constraint if exists booking_setting_jendela_bulan_check;
alter table public.booking_setting add constraint booking_setting_jendela_bulan_check check (jendela_bulan between 1 and 12);
alter table public.booking_setting add column if not exists kapasitas_kamar int not null default 2 check (kapasitas_kamar between 1 and 10);
alter table public.booking_setting add column if not exists extra_bed_maks int not null default 2 check (extra_bed_maks between 0 and 5);
alter table public.booking_setting add column if not exists diskon_sales_maks numeric not null default 10 check (diskon_sales_maks between 0 and 100);

update public.booking_setting set
  pajak_persen = 16,
  pajak_termasuk = false,
  jendela_bulan = 4,
  batas_jam_hari_ini = '18:00',
  kebijakan_pembatalan = 'Pembayaran tidak dapat dikembalikan (non-refundable). Untuk perubahan jadwal atau pertanyaan seputar pembatalan, silakan hubungi tim sales H One Resort melalui WhatsApp +62 813-2555-3007.'
where id = 1;

-- ---------- jatah web default = unit fisik ----------
update public.room_type set jatah_default = jumlah_unit;

-- ---------- add-on (dijual di checkout web) ----------
create table if not exists public.addon (
  kode      text primary key check (kode ~ '^[a-z0-9_]+$'),
  nama      text not null,
  harga     bigint not null check (harga >= 0),
  satuan    text not null default '',
  per_malam boolean not null default false,
  maks      int not null default 10 check (maks between 1 and 50),
  aktif     boolean not null default true,
  urutan    int not null default 0
);
alter table public.addon enable row level security;
drop policy if exists public_read_addon on public.addon;
create policy public_read_addon on public.addon for select to anon, authenticated using (aktif or public.is_admin());
drop policy if exists owner_write_addon on public.addon;
create policy owner_write_addon on public.addon for all to authenticated
  using (public.has_role('owner')) with check (public.has_role('owner'));

-- prices = website requestPrices at 24 Sep 2026
insert into public.addon (kode, nama, harga, satuan, per_malam, maks, urutan) values
  ('extra_bed',          'Extra Bed',          350000, 'Malam', true,  10, 1),
  ('romantic_towel',     'Romantic Towel',     250000, 'Setup', false, 5,  2),
  ('slice_of_cake',      'Slice of Cake',      100000, 'Slice', false, 20, 3),
  ('romantic_dinner',    'Romantic Dinner',    500000, 'Couple', false, 5,  4),
  ('floating_breakfast', 'Floating Breakfast', 350000, '',      false, 10, 5),
  ('rooftop_bbq',        'Rooftop BBQ',        350000, '4Pax',  false, 5,  6),
  ('jeep_adventure',     'Jeep Adventure',     350000, '4Pax',  false, 5,  7),
  ('bajaj_fun_trip',     'Bajaj Fun Trip',     350000, '',      false, 5,  8)
on conflict (kode) do nothing;

-- ---------- booking columns ----------
alter table public.booking add column if not exists diskon bigint not null default 0;
alter table public.booking add column if not exists checked_out_at timestamptz;
alter table public.booking add column if not exists checked_out_by text;
alter table public.booking add column if not exists deposit_kembali_at timestamptz;

-- ---------- pricing: kamar + add-on - diskon, lalu pajak ----------
create or replace function private.price_booking(
  p_room text, p_in date, p_out date, p_qty int, p_addons jsonb, p_diskon_persen numeric)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  d date; price bigint; v_n int := p_out - p_in;
  nights jsonb := '[]'; missing jsonb := '[]'; per_room bigint := 0;
  x jsonb; a public.addon; v_q int; v_line bigint;
  v_addons jsonb := '[]'; v_addon_total bigint := 0;
  v_kamar bigint; v_sub bigint; v_persen_diskon numeric; v_diskon bigint;
  v_persen numeric; v_termasuk boolean; v_pajak bigint; v_total bigint;
begin
  if p_out <= p_in or v_n > 30 then raise exception 'TANGGAL_TIDAK_VALID'; end if;
  d := p_in;
  while d < p_out loop
    price := private.night_price(p_room, d);
    if price is null then missing := missing || to_jsonb(d);
    else nights := nights || jsonb_build_object('tanggal', d, 'harga', price); per_room := per_room + price;
    end if;
    d := d + 1;
  end loop;
  v_kamar := per_room * greatest(p_qty, 1);

  for x in select * from jsonb_array_elements(coalesce(p_addons, '[]'::jsonb)) loop
    v_q := coalesce((x->>'qty')::int, 0);
    continue when v_q <= 0;
    select * into a from public.addon where kode = x->>'kode' and aktif;
    if not found or v_q > a.maks then raise exception 'ADDON_TIDAK_VALID' using detail = coalesce(x->>'kode', ''); end if;
    v_line := a.harga * v_q * case when a.per_malam then v_n else 1 end;
    v_addons := v_addons || jsonb_build_object('kode', a.kode, 'nama', a.nama, 'harga', a.harga, 'satuan', a.satuan,
                                               'qty', v_q, 'malam', case when a.per_malam then v_n end, 'subtotal', v_line);
    v_addon_total := v_addon_total + v_line;
  end loop;

  v_sub := v_kamar + v_addon_total;
  v_persen_diskon := least(greatest(coalesce(p_diskon_persen, 0), 0), 100);
  v_diskon := round(v_sub * v_persen_diskon / 100);

  select pajak_persen, pajak_termasuk into v_persen, v_termasuk from public.booking_setting where id = 1;
  v_persen := coalesce(v_persen, 0); v_termasuk := coalesce(v_termasuk, false);
  if v_termasuk then
    v_total := v_sub - v_diskon;
    v_pajak := round(v_total * v_persen / (100 + v_persen));
  else
    v_pajak := round((v_sub - v_diskon) * v_persen / 100);
    v_total := v_sub - v_diskon + v_pajak;
  end if;

  return jsonb_build_object(
    'malam', nights, 'tanpa_harga', missing, 'per_kamar', per_room, 'kamar_total', v_kamar,
    'addons', v_addons, 'addon_total', v_addon_total, 'subtotal', v_sub,
    'diskon_persen', v_persen_diskon, 'diskon', v_diskon,
    'pajak_persen', v_persen, 'pajak_termasuk', v_termasuk, 'pajak', v_pajak, 'total', v_total);
end $$;

-- 2 orang per kamar + extra bed; extra bed maks per kamar dari booking_setting
create or replace function private.check_capacity(p jsonb, p_qty int) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  v_set public.booking_setting%rowtype;
  v_tamu int := coalesce((p->>'dewasa')::int, 2) + coalesce((p->>'anak')::int, 0);
  v_eb int;
begin
  if coalesce((p->>'dewasa')::int, 2) < 1 or coalesce((p->>'anak')::int, 0) < 0 then raise exception 'JUMLAH_TAMU_TIDAK_VALID'; end if;
  select * into v_set from public.booking_setting where id = 1;
  select coalesce(sum((x->>'qty')::int), 0) into v_eb
    from jsonb_array_elements(coalesce(p->'addons', '[]'::jsonb)) x where x->>'kode' = 'extra_bed';
  if v_eb > v_set.extra_bed_maks * p_qty then
    raise exception 'EXTRA_BED_MAKS' using detail = (v_set.extra_bed_maks * p_qty)::text;
  end if;
  if v_tamu > v_set.kapasitas_kamar * p_qty + v_eb then
    raise exception 'KAPASITAS_LEBIH' using detail = (v_tamu - v_set.kapasitas_kamar * p_qty)::text;
  end if;
end $$;

drop function if exists public.booking_quote(text, date, date, int);
create or replace function public.booking_quote(
  p_room text, p_checkin date, p_checkout date, p_qty int, p_addons jsonb default '[]', p_diskon numeric default 0)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.price_booking(p_room, p_checkin, p_checkout, p_qty, p_addons, p_diskon)
$$;

create or replace function private.booking_insert(p jsonb, p_sumber text, p_by text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_room text := p->>'room_code';
  v_in date := (p->>'checkin')::date;
  v_out date := (p->>'checkout')::date;
  v_qty int := coalesce((p->>'jumlah_kamar')::int, 1);
  v_wa text;
  v_set public.booking_setting%rowtype;
  v_hold int;
  v_active_holds int;
  v_diskon_persen numeric := 0;
  v_maks_diskon numeric;
  v_quote jsonb; v_total bigint; v_kode text; v_booking_id uuid; d date; v_free int;
begin
  if v_room not in ('sup_sv','sup_gv','dlx_sv','dlx_gv','suite_sv') then raise exception 'KAMAR_TIDAK_VALID'; end if;
  if v_in is null or v_out is null then raise exception 'TANGGAL_TIDAK_VALID'; end if;
  if v_qty < 1 or v_qty > 10 or (v_room = 'suite_sv' and v_qty > 1) then raise exception 'JUMLAH_KAMAR_TIDAK_VALID'; end if;
  v_wa := regexp_replace(coalesce(p->>'wa',''), '[^0-9]', '', 'g');
  if coalesce(trim(p->>'nama'), '') = '' or length(v_wa) < 10 then
    raise exception 'DATA_TAMU_TIDAK_LENGKAP';
  end if;

  perform private.check_stay(v_room, v_in, v_out, p_sumber);
  perform private.check_capacity(p, v_qty);

  select * into v_set from public.booking_setting where id = 1;

  -- discount only through a staff link; sales capped by booking_setting.diskon_sales_maks, owner up to 100%
  if p_sumber = 'sales' then
    v_diskon_persen := coalesce((p->>'diskon_persen')::numeric, 0);
    v_maks_diskon := case when public.has_role('owner') then 100 else v_set.diskon_sales_maks end;
    if v_diskon_persen < 0 or v_diskon_persen > v_maks_diskon then
      raise exception 'DISKON_MELEBIHI' using detail = v_maks_diskon::text;
    end if;
  end if;

  v_hold := (p->>'hold_minutes')::int;
  if v_hold is null then
    v_hold := case when p_sumber = 'web' then coalesce(v_set.hold_web_menit, 30)
                   else coalesce(v_set.link_sales_jam, 24) * 60 end;
  end if;
  v_hold := least(greatest(v_hold, 5), 4320);

  if p_sumber = 'web' then
    select count(*) into v_active_holds from public.booking b
     where regexp_replace(b.wa, '[^0-9]', '', 'g') = v_wa
       and b.status = 'menunggu_bayar' and b.expires_at > now();
    if v_active_holds >= 2 then
      raise exception 'TERLALU_BANYAK_HOLD';
    end if;
  end if;

  insert into public.inventori (tanggal, room_code)
  select gs, v_room from generate_series(v_in, v_out - 1, interval '1 day') gs
  on conflict (tanggal, room_code) do nothing;

  perform 1 from public.inventori i
   where i.room_code = v_room and i.tanggal >= v_in and i.tanggal < v_out
   for update;

  d := v_in;
  while d < v_out loop
    v_free := private.effective_allotment(v_room, d);
    if v_free - private.rooms_used(v_room, d) < v_qty then
      raise exception 'STOK_HABIS' using detail = d::text;
    end if;
    d := d + 1;
  end loop;

  v_quote := private.price_booking(v_room, v_in, v_out, v_qty, p->'addons', v_diskon_persen);
  if jsonb_array_length(v_quote->'tanpa_harga') > 0 then raise exception 'HARGA_BELUM_ADA'; end if;
  v_total := (v_quote->>'total')::bigint;

  v_kode := 'HON-' || upper(encode(extensions.gen_random_bytes(5), 'hex'));
  insert into public.booking (kode, sumber, room_code, checkin, checkout, jumlah_kamar, dewasa, anak,
                              nama, wa, email, catatan, total, pajak, diskon, addons, rincian, expires_at, dibuat_oleh)
  values (v_kode, p_sumber, v_room, v_in, v_out, v_qty,
          coalesce((p->>'dewasa')::int, 2), coalesce((p->>'anak')::int, 0),
          trim(p->>'nama'), p->>'wa', nullif(trim(coalesce(p->>'email','')), ''), p->>'catatan',
          v_total, (v_quote->>'pajak')::bigint, (v_quote->>'diskon')::bigint, v_quote->'addons', v_quote->'malam',
          now() + make_interval(mins => v_hold), p_by)
  returning id into v_booking_id;

  insert into public.booking_events (booking_id, jenis, data, oleh)
  values (v_booking_id, 'dibuat', jsonb_build_object('sumber', p_sumber, 'total', v_total,
          'diskon_persen', v_diskon_persen, 'addons', v_quote->'addons'), p_by);

  return public.booking_get(v_kode);
end $$;

create or replace function public.booking_get(p_kode text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'kode', b.kode, 'sumber', b.sumber, 'room_code', b.room_code,
    'checkin', b.checkin, 'checkout', b.checkout, 'jumlah_kamar', b.jumlah_kamar,
    'dewasa', b.dewasa, 'anak', b.anak, 'nama', b.nama, 'total', b.total, 'pajak', b.pajak, 'rincian', b.rincian,
    'addons', b.addons, 'diskon', b.diskon, 'pajak_persen', bs.pajak_persen, 'pajak_termasuk', bs.pajak_termasuk,
    'status', case when b.status = 'menunggu_bayar' and b.expires_at <= now() then 'kedaluwarsa' else b.status end,
    'expires_at', b.expires_at, 'pg_provider', b.pg_provider,
    'jam_checkin', bs.jam_checkin, 'jam_checkout', bs.jam_checkout,
    'precheckin_diisi', exists (select 1 from public.pre_checkin pc where pc.booking_id = b.id))
  from public.booking b
  left join public.booking_setting bs on bs.id = 1
  where b.kode = p_kode
$$;

create or replace function public.booking_public_setting() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'min_malam', min_malam, 'maks_malam', maks_malam,
    'advance_notice_hari', advance_notice_hari, 'batas_jam_hari_ini', batas_jam_hari_ini,
    'jendela_bulan', jendela_bulan, 'jam_checkin', jam_checkin, 'jam_checkout', jam_checkout,
    'hold_web_menit', hold_web_menit, 'pajak_persen', pajak_persen, 'pajak_termasuk', pajak_termasuk,
    'kebijakan_pembatalan', kebijakan_pembatalan,
    'kapasitas_kamar', kapasitas_kamar, 'extra_bed_maks', extra_bed_maks,
    'addons', coalesce((select jsonb_agg(jsonb_build_object('kode', a.kode, 'nama', a.nama, 'harga', a.harga,
                          'satuan', a.satuan, 'per_malam', a.per_malam, 'maks', a.maks) order by a.urutan)
                        from public.addon a where a.aktif), '[]'::jsonb))
  from public.booking_setting where id = 1
$$;

-- ---------- check-out: jaminan (deposit / KTP) wajib kembali ----------
create or replace function public.admin_checkout(p_kode text, p_jaminan_kembali boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare b public.booking; v_email text;
begin
  if not public.has_role('owner','front_office') then raise exception 'UNAUTHORIZED' using errcode = '28000'; end if;
  select email into v_email from auth.users where id = auth.uid();

  select * into b from public.booking where kode = p_kode for update;
  if not found then raise exception 'BOOKING_TIDAK_ADA'; end if;
  if b.status <> 'checked_in' then raise exception 'STATUS_TIDAK_VALID'; end if;
  if b.deposit_jenis is not null and not coalesce(p_jaminan_kembali, false) then
    raise exception 'JAMINAN_BELUM_KEMBALI' using detail = b.deposit_jenis;
  end if;

  update public.booking set status = 'checked_out', checked_out_at = now(), checked_out_by = v_email,
         deposit_kembali_at = case when b.deposit_jenis is not null then now() end, updated_at = now()
   where id = b.id returning * into b;
  insert into public.booking_events (booking_id, jenis, data, oleh)
    values (b.id, 'checkout', jsonb_build_object('jaminan', b.deposit_jenis, 'deposit', b.deposit), v_email);

  return public.booking_get(p_kode);
end $$;

-- ---------- grants ----------
revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function public.booking_quote(text, date, date, int, jsonb, numeric) from public;
grant execute on function public.booking_quote(text, date, date, int, jsonb, numeric) to anon, authenticated;
revoke execute on function public.admin_checkout(text, boolean) from public, anon;
grant execute on function public.admin_checkout(text, boolean) to authenticated;
