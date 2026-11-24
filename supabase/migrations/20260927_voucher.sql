-- 2026-09-27 owner request: vouchers / custom referral codes that the owner or sales set up
-- for a chosen stay period (e.g. push low-season dates), instead of a global discount.
--
-- * public.voucher: code, percent or fixed-rupiah value, stay-night window, optional room filter,
--   min nights, optional usage quota. Owner + sales manage them (RLS); guests never read the table.
-- * The discount only applies to room nights inside the window (not add-ons).
-- * Sales-made vouchers stay under the sales cap (booking_setting.diskon_sales_maks): stored as
--   maks_persen when the voucher is written, and enforced again when a booking is priced.
-- * Quota counts paid bookings plus live holds; booking_insert locks the voucher row so two guests
--   can't both take the last use.
-- * Every voucher change is logged to booking_events (Riwayat), owner may delete those entries.

create table if not exists public.voucher (
  id uuid primary key default gen_random_uuid(),
  kode text not null unique check (kode ~ '^[A-Z0-9-]{3,30}$'),
  jenis text not null check (jenis in ('persen', 'nominal')),
  nilai numeric not null check (nilai > 0),
  berlaku_mulai date not null,
  berlaku_sampai date not null,
  kamar text[],
  min_malam int not null default 1 check (min_malam >= 1),
  kuota int check (kuota is null or kuota >= 1),
  maks_persen numeric not null default 100,
  aktif boolean not null default true,
  catatan text,
  dibuat_oleh text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (berlaku_sampai >= berlaku_mulai),
  check (jenis <> 'persen' or nilai <= 100)
);
alter table public.voucher enable row level security;
drop policy if exists staff_all_voucher on public.voucher;
create policy staff_all_voucher on public.voucher for all
  using (public.has_role('owner', 'sales')) with check (public.has_role('owner', 'sales'));

alter table public.booking add column if not exists voucher_kode text;
create index if not exists booking_voucher_kode_idx on public.booking (voucher_kode) where voucher_kode is not null;

-- normalise the code, stamp the author, and pin the cap of whoever set the value
create or replace function private.voucher_guard()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare v_cap numeric;
begin
  new.kode := upper(trim(new.kode));
  new.updated_at := now();
  if auth.uid() is null then return new; end if; -- SQL editor / migrations
  if tg_op = 'UPDATE' then new.dibuat_oleh := old.dibuat_oleh;
  else new.dibuat_oleh := (select email from auth.users where id = auth.uid());
  end if;
  if tg_op = 'UPDATE' and (new.jenis, new.nilai) is not distinct from (old.jenis, old.nilai) then
    new.maks_persen := old.maks_persen; -- toggling / renaming keeps the original author's cap
    return new;
  end if;
  v_cap := case when public.has_role('owner') then 100
                else (select diskon_sales_maks from public.booking_setting where id = 1) end;
  new.maks_persen := v_cap;
  if new.jenis = 'persen' and new.nilai > v_cap then
    raise exception 'DISKON_MELEBIHI' using detail = v_cap::text;
  end if;
  return new;
end $function$;

drop trigger if exists voucher_guard on public.voucher;
create trigger voucher_guard before insert or update on public.voucher
  for each row execute function private.voucher_guard();

create or replace function private.log_voucher()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  insert into public.booking_events (jenis, data, oleh)
  values ('voucher',
          jsonb_build_object('aksi', lower(tg_op),
                             'lama', case when tg_op <> 'INSERT' then to_jsonb(old) - 'updated_at' - 'created_at' end,
                             'baru', case when tg_op <> 'DELETE' then to_jsonb(new) - 'updated_at' - 'created_at' end),
          (select email from auth.users where id = auth.uid()));
  return null;
end $function$;

drop trigger if exists voucher_log on public.voucher;
create trigger voucher_log after insert or update or delete on public.voucher
  for each row execute function private.log_voucher();

alter policy owner_delete_change_log on public.booking_events
  using (public.has_role('owner') and jenis in ('kalender', 'rule_set', 'voucher'));

-- how many times a voucher is taken: paid/stayed bookings + holds that haven't expired
create or replace function private.voucher_terpakai(p_kode text)
returns int
language sql
stable
security definer
set search_path to ''
as $function$
  select count(*)::int from public.booking b
  where b.voucher_kode = p_kode
    and (b.status in ('lunas', 'checked_in', 'checked_out', 'no_show')
         or (b.status = 'menunggu_bayar' and b.expires_at > now()))
$function$;

-- validates a code for a stay; raises a guest-readable error code when it can't be used
create or replace function private.voucher_check(p_kode text, p_room text, p_in date, p_out date)
returns public.voucher
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare v public.voucher;
begin
  select * into v from public.voucher where kode = upper(trim(p_kode));
  if not found or not v.aktif then raise exception 'VOUCHER_TIDAK_ADA'; end if;
  -- at least one night (p_in .. p_out-1) must fall inside the window
  if p_in > v.berlaku_sampai or p_out <= v.berlaku_mulai then
    raise exception 'VOUCHER_TIDAK_BERLAKU' using detail = v.berlaku_mulai::text || ' ' || v.berlaku_sampai::text;
  end if;
  if coalesce(cardinality(v.kamar), 0) > 0 and not (p_room = any(v.kamar)) then
    raise exception 'VOUCHER_KAMAR';
  end if;
  if (p_out - p_in) < v.min_malam then raise exception 'VOUCHER_MIN_MALAM' using detail = v.min_malam::text; end if;
  if v.kuota is not null and private.voucher_terpakai(v.kode) >= v.kuota then raise exception 'VOUCHER_HABIS'; end if;
  return v;
end $function$;

-- price_booking gains an optional voucher; the old 6-argument calls keep working through the default
drop function if exists public.booking_quote(text, date, date, integer, jsonb, numeric);
drop function if exists private.price_booking(text, date, date, integer, jsonb, numeric);

create function private.price_booking(p_room text, p_in date, p_out date, p_qty integer, p_addons jsonb,
                                      p_diskon_persen numeric, p_voucher text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  d date; price bigint; v_n int := p_out - p_in;
  nights jsonb := '[]'; missing jsonb := '[]'; per_room bigint := 0;
  x jsonb; a public.addon; v_q int; v_line bigint;
  v_addons jsonb := '[]'; v_addon_total bigint := 0;
  v_kamar bigint; v_sub bigint; v_persen_diskon numeric; v_diskon bigint;
  v_persen numeric; v_termasuk boolean; v_pajak bigint; v_total bigint;
  v public.voucher; v_elig bigint := 0; v_vdiskon bigint := 0; v_vinfo jsonb := null;
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

  if nullif(trim(coalesce(p_voucher, '')), '') is not null then
    v := private.voucher_check(p_voucher, p_room, p_in, p_out);
    select coalesce(sum((n->>'harga')::bigint), 0) into v_elig
      from jsonb_array_elements(nights) n
     where (n->>'tanggal')::date between v.berlaku_mulai and v.berlaku_sampai;
    v_elig := v_elig * greatest(p_qty, 1);
    v_vdiskon := case when v.jenis = 'persen' then round(v_elig * v.nilai / 100) else least(v.nilai, v_elig)::bigint end;
    v_vdiskon := least(v_vdiskon, round(v_elig * v.maks_persen / 100));
    v_vinfo := jsonb_build_object('kode', v.kode, 'jenis', v.jenis, 'nilai', v.nilai, 'diskon', v_vdiskon,
                                  'berlaku_mulai', v.berlaku_mulai, 'berlaku_sampai', v.berlaku_sampai);
  end if;
  v_diskon := least(v_diskon + v_vdiskon, v_sub);

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
    'diskon_persen', v_persen_diskon, 'diskon', v_diskon, 'voucher', v_vinfo,
    'pajak_persen', v_persen, 'pajak_termasuk', v_termasuk, 'pajak', v_pajak, 'total', v_total);
end $function$;

-- public quote: the old p_diskon argument is gone (anyone could ask for a 100% quote); vouchers instead
create function public.booking_quote(p_room text, p_checkin date, p_checkout date, p_qty integer,
                                     p_addons jsonb default '[]'::jsonb, p_voucher text default null)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select private.price_booking(p_room, p_checkin, p_checkout, p_qty, p_addons, 0, p_voucher)
$function$;

create or replace function private.booking_insert(p jsonb, p_sumber text, p_by text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
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
  v_voucher text := nullif(upper(trim(coalesce(p->>'voucher', ''))), '');
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

  if p_sumber = 'sales' then
    v_voucher := null; -- sales links carry their own capped discount
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

  -- lock the voucher so the quota check and this booking are one step
  if v_voucher is not null then
    perform 1 from public.voucher where kode = v_voucher for update;
  end if;

  v_quote := private.price_booking(v_room, v_in, v_out, v_qty, p->'addons', v_diskon_persen, v_voucher);
  if jsonb_array_length(v_quote->'tanpa_harga') > 0 then raise exception 'HARGA_BELUM_ADA'; end if;
  v_total := (v_quote->>'total')::bigint;

  v_kode := 'HON-' || upper(encode(extensions.gen_random_bytes(5), 'hex'));
  insert into public.booking (kode, sumber, room_code, checkin, checkout, jumlah_kamar, dewasa, anak,
                              nama, wa, email, catatan, total, pajak, diskon, addons, rincian, expires_at, dibuat_oleh,
                              voucher_kode)
  values (v_kode, p_sumber, v_room, v_in, v_out, v_qty,
          coalesce((p->>'dewasa')::int, 2), coalesce((p->>'anak')::int, 0),
          trim(p->>'nama'), p->>'wa', nullif(trim(coalesce(p->>'email','')), ''), p->>'catatan',
          v_total, (v_quote->>'pajak')::bigint, (v_quote->>'diskon')::bigint, v_quote->'addons', v_quote->'malam',
          now() + make_interval(mins => v_hold), p_by,
          v_quote->'voucher'->>'kode')
  returning id into v_booking_id;

  insert into public.booking_events (booking_id, jenis, data, oleh)
  values (v_booking_id, 'dibuat', jsonb_build_object('sumber', p_sumber, 'total', v_total,
          'diskon_persen', v_diskon_persen, 'voucher', v_quote->'voucher', 'addons', v_quote->'addons'), p_by);

  return public.booking_get(v_kode);
end $function$;

create or replace function public.booking_get(p_kode text)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select jsonb_build_object(
    'kode', b.kode, 'sumber', b.sumber, 'room_code', b.room_code,
    'checkin', b.checkin, 'checkout', b.checkout, 'jumlah_kamar', b.jumlah_kamar,
    'dewasa', b.dewasa, 'anak', b.anak, 'nama', b.nama, 'total', b.total, 'pajak', b.pajak, 'rincian', b.rincian,
    'addons', b.addons, 'diskon', b.diskon, 'voucher_kode', b.voucher_kode,
    'pajak_persen', bs.pajak_persen, 'pajak_termasuk', bs.pajak_termasuk,
    'status', case when b.status = 'menunggu_bayar' and b.expires_at <= now() then 'kedaluwarsa' else b.status end,
    'expires_at', b.expires_at, 'pg_provider', b.pg_provider,
    'jam_checkin', bs.jam_checkin, 'jam_checkout', bs.jam_checkout,
    'precheckin_diisi', exists (select 1 from public.pre_checkin pc where pc.booking_id = b.id))
  from public.booking b
  left join public.booking_setting bs on bs.id = 1
  where b.kode = p_kode
$function$;

-- admin list with live usage counts
create or replace function public.voucher_list()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if not public.has_role('owner', 'sales') then raise exception 'UNAUTHORIZED' using errcode = '28000'; end if;
  return coalesce((select jsonb_agg(to_jsonb(v) || jsonb_build_object('terpakai', private.voucher_terpakai(v.kode))
                                    order by v.created_at desc)
                   from public.voucher v), '[]'::jsonb);
end $function$;

-- staff preview for sales payment links (manual discount), no longer on the public quote
create or replace function public.booking_quote_staff(p_room text, p_checkin date, p_checkout date, p_qty integer,
                                                      p_addons jsonb default '[]'::jsonb, p_diskon numeric default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if not public.has_role('owner', 'sales') then raise exception 'UNAUTHORIZED' using errcode = '28000'; end if;
  return private.price_booking(p_room, p_checkin, p_checkout, p_qty, p_addons, p_diskon, null);
end $function$;
revoke execute on function public.booking_quote_staff(text, date, date, integer, jsonb, numeric) from anon;

-- staff-only RPCs: not callable by anonymous visitors at all (they also check the role inside)
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like 'admin\_%' or p.proname in ('booking_quote_staff', 'voucher_list', 'booking_create_sales'))
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
