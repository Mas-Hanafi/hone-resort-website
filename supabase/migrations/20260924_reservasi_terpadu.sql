-- Sistem Reservasi Terpadu v2.0 — builds on 20260923_booking_engine.sql + 20260923b_admin_allowlist.sql.
-- Safe to (re)apply: every DDL uses if not exists / add column if not exists / create or replace / drop ... if exists.
-- Staging only (YOUR-STAGING-REF). See docs/booking-engine-contract.md for the full spec this implements.

-- ============================================================================
-- 1. Tables — new
-- ============================================================================

create table if not exists public.room_type (
  room_code    text primary key check (room_code in ('sup_sv','sup_gv','dlx_sv','dlx_gv','suite_sv')),
  nama         text not null,
  jatah_default int not null default 0 check (jatah_default >= 0),
  urutan       int
);

insert into public.room_type (room_code, nama, jatah_default, urutan) values
  ('sup_sv',   'Superior Sea View',   0, 1),
  ('sup_gv',   'Superior Garden View',0, 2),
  ('dlx_sv',   'Deluxe Sea View',     0, 3),
  ('dlx_gv',   'Deluxe Garden View',  0, 4),
  ('suite_sv', 'Suite Sea View',      0, 5)
on conflict (room_code) do nothing;

create table if not exists public.rule_set (
  id                uuid primary key default gen_random_uuid(),
  nama              text not null unique check (char_length(nama) between 1 and 40),
  warna             smallint not null check (warna between 0 and 7),
  persen            int check (persen between -90 and 200),
  min_malam         int check (min_malam between 1 and 30),
  maks_malam        int check (maks_malam between 1 and 30),
  larangan_checkin  smallint[] not null default '{}',
  larangan_checkout smallint[] not null default '{}',
  updated_at        timestamptz not null default now(),
  updated_by        text
);

insert into public.rule_set (nama, warna, persen, min_malam, maks_malam) values
  ('Sepi',         4, -20, null, null),
  ('Promo',        5, -10, null, null),
  ('Musim padat',  0,  50, 2,    null)
on conflict (nama) do nothing;

create table if not exists public.rooms (
  id        uuid primary key default gen_random_uuid(),
  nomor     text unique,
  room_code text check (room_code in ('sup_sv','sup_gv','dlx_sv','dlx_gv','suite_sv')),
  status    text not null default 'bersih' check (status in ('bersih','kotor','perbaikan')),
  aktif     boolean not null default true
);

create table if not exists public.booking_setting (
  id                     int primary key default 1 check (id = 1),
  min_malam              int not null default 1  check (min_malam between 1 and 30),
  maks_malam             int not null default 30 check (maks_malam between 1 and 30),
  advance_notice_hari    int not null default 0  check (advance_notice_hari between 0 and 7),
  batas_jam_hari_ini     time not null default '18:00',
  jendela_bulan          int not null default 12 check (jendela_bulan in (3,6,9,12)),
  larangan_checkin       smallint[] not null default '{}',
  larangan_checkout      smallint[] not null default '{}',
  jam_checkin            time not null default '14:00',
  jam_checkout           time not null default '12:00',
  hold_web_menit         int not null default 30 check (hold_web_menit between 15 and 60),
  link_sales_jam         int not null default 24 check (link_sales_jam between 1 and 72),
  jam_no_show            time not null default '22:00',
  pembulatan             int not null default 1000 check (pembulatan in (1000,10000,50000)),
  pajak_persen           numeric not null default 10 check (pajak_persen between 0 and 100),
  pajak_termasuk         boolean not null default true,
  kebijakan_pembatalan   text,
  template_info_kedatangan text,
  updated_at             timestamptz not null default now(),
  updated_by             text
);

insert into public.booking_setting (id) values (1) on conflict (id) do nothing;

-- ---------- alter existing tables (now that room_type/rule_set/rooms exist for FKs) ----------

alter table private.admins add column if not exists peran text not null default 'owner'
  check (peran in ('owner','sales','front_office'));

alter table public.inventori alter column allotment drop not null;
alter table public.inventori alter column allotment drop default;
alter table public.inventori add column if not exists harga bigint check (harga > 0);
alter table public.inventori add column if not exists rule_set_id uuid references public.rule_set(id) on delete set null;
alter table public.inventori add column if not exists catatan text;
alter table public.inventori add column if not exists min_malam int check (min_malam between 1 and 30);
alter table public.inventori add column if not exists tutup_checkin boolean not null default false;
alter table public.inventori add column if not exists tutup_checkout boolean not null default false;
alter table public.inventori add column if not exists updated_by text;

alter table public.booking drop constraint if exists booking_status_check;
alter table public.booking add constraint booking_status_check
  check (status in ('menunggu_bayar','lunas','kedaluwarsa','batal','checked_in','no_show','checked_out'));

alter table public.booking add column if not exists pajak bigint not null default 0;
alter table public.booking add column if not exists addons jsonb not null default '[]';
alter table public.booking add column if not exists room_id uuid references public.rooms(id);
alter table public.booking add column if not exists id_verified boolean not null default false;
alter table public.booking add column if not exists deposit bigint;
alter table public.booking add column if not exists checked_in_at timestamptz;
alter table public.booking add column if not exists checked_in_by text;
alter table public.booking add column if not exists no_show_at timestamptz;
alter table public.booking add column if not exists cancelled_at timestamptz;
alter table public.booking add column if not exists alasan_batal text;
alter table public.booking add column if not exists refund_amount bigint;
alter table public.booking add column if not exists info_kedatangan_at timestamptz;
alter table public.booking add column if not exists apoa_reported_at timestamptz;
alter table public.booking add column if not exists kewarganegaraan text;

create table if not exists public.pre_checkin (
  booking_id     uuid primary key references public.booking(id) on delete cascade,
  jam_tiba       time,
  jumlah_tamu    int,
  kendaraan      text,
  permintaan     text,
  kewarganegaraan text,
  paspor         jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.payment_attempts (
  id             uuid primary key default gen_random_uuid(),
  booking_id     uuid not null references public.booking(id),
  provider       text,
  invoice_number text unique not null,
  request_id     text,
  token_id       text,
  pay_url        text,
  amount         bigint not null,
  status         text not null default 'PENDING'
                 check (status in ('PENDING','SUCCESS','FAILED','EXPIRED','REFUNDED','TIMEOUT','REDIRECT')),
  expires_at     timestamptz,
  last_checked_at timestamptz,
  raw            jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.booking_events (
  id         bigserial primary key,
  booking_id uuid,
  jenis      text,
  data       jsonb,
  oleh       text,
  created_at timestamptz not null default now()
);

-- role helpers first: the RLS policies below call has_role()
create or replace function public.admin_role() returns text
language sql stable security definer set search_path = '' as $$
  select peran from private.admins where user_id = auth.uid()
$$;

create or replace function public.has_role(variadic roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.admins where user_id = auth.uid() and peran = any(roles))
$$;

-- ============================================================================
-- 2. RLS
-- ============================================================================

alter table public.room_type       enable row level security;
alter table public.rule_set        enable row level security;
alter table public.booking_setting enable row level security;
alter table public.rooms           enable row level security;
alter table public.pre_checkin     enable row level security;
alter table public.payment_attempts enable row level security;
alter table public.booking_events  enable row level security;

-- inventori used to be a single "admin_all" policy; split into select-for-any-admin / write-for-owner-only.
drop policy if exists admin_all_inventori on public.inventori;
drop policy if exists admin_select_inventori on public.inventori;
create policy admin_select_inventori on public.inventori for select to authenticated using (public.is_admin());
drop policy if exists owner_insert_inventori on public.inventori;
create policy owner_insert_inventori on public.inventori for insert to authenticated with check (public.has_role('owner'));
drop policy if exists owner_update_inventori on public.inventori;
create policy owner_update_inventori on public.inventori for update to authenticated using (public.has_role('owner')) with check (public.has_role('owner'));
drop policy if exists owner_delete_inventori on public.inventori;
create policy owner_delete_inventori on public.inventori for delete to authenticated using (public.has_role('owner'));

-- room_type, rule_set, booking_setting: same select-any-admin / write-owner-only shape.
drop policy if exists admin_select_room_type on public.room_type;
create policy admin_select_room_type on public.room_type for select to authenticated using (public.is_admin());
drop policy if exists owner_insert_room_type on public.room_type;
create policy owner_insert_room_type on public.room_type for insert to authenticated with check (public.has_role('owner'));
drop policy if exists owner_update_room_type on public.room_type;
create policy owner_update_room_type on public.room_type for update to authenticated using (public.has_role('owner')) with check (public.has_role('owner'));
drop policy if exists owner_delete_room_type on public.room_type;
create policy owner_delete_room_type on public.room_type for delete to authenticated using (public.has_role('owner'));

drop policy if exists admin_select_rule_set on public.rule_set;
create policy admin_select_rule_set on public.rule_set for select to authenticated using (public.is_admin());
drop policy if exists owner_insert_rule_set on public.rule_set;
create policy owner_insert_rule_set on public.rule_set for insert to authenticated with check (public.has_role('owner'));
drop policy if exists owner_update_rule_set on public.rule_set;
create policy owner_update_rule_set on public.rule_set for update to authenticated using (public.has_role('owner')) with check (public.has_role('owner'));
drop policy if exists owner_delete_rule_set on public.rule_set;
create policy owner_delete_rule_set on public.rule_set for delete to authenticated using (public.has_role('owner'));

drop policy if exists admin_select_booking_setting on public.booking_setting;
create policy admin_select_booking_setting on public.booking_setting for select to authenticated using (public.is_admin());
drop policy if exists owner_insert_booking_setting on public.booking_setting;
create policy owner_insert_booking_setting on public.booking_setting for insert to authenticated with check (public.has_role('owner'));
drop policy if exists owner_update_booking_setting on public.booking_setting;
create policy owner_update_booking_setting on public.booking_setting for update to authenticated using (public.has_role('owner')) with check (public.has_role('owner'));
drop policy if exists owner_delete_booking_setting on public.booking_setting;
create policy owner_delete_booking_setting on public.booking_setting for delete to authenticated using (public.has_role('owner'));

-- plain admin tables: any admin can read/write, no extra role gate at the RLS layer
-- (role gating for specific mutations, e.g. admin_checkin, is enforced inside the functions).
drop policy if exists admin_all_rooms on public.rooms;
create policy admin_all_rooms on public.rooms for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_all_pre_checkin on public.pre_checkin;
create policy admin_all_pre_checkin on public.pre_checkin for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_all_payment_attempts on public.payment_attempts;
create policy admin_all_payment_attempts on public.payment_attempts for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_all_booking_events on public.booking_events;
create policy admin_all_booking_events on public.booking_events for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- public.booking already has admin_all_booking (is_admin() for all) from 20260923b_admin_allowlist.sql — unchanged.

-- ============================================================================
-- 3. Helpers
-- ============================================================================

create or replace function private.effective_allotment(p_room text, p_date date) returns int
language sql stable security definer set search_path = '' as $$
  select case when coalesce(i.stop_sell, false) then 0
              else coalesce(i.allotment, rt.jatah_default, 0) end
  from public.room_type rt
  left join public.inventori i on i.room_code = rt.room_code and i.tanggal = p_date
  where rt.room_code = p_room
$$;

-- rooms taken on one night: paid/occupied statuses + unexpired web/sales holds
create or replace function private.rooms_used(p_room text, p_date date) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(b.jumlah_kamar), 0)::int
  from public.booking b
  where b.room_code = p_room and b.checkin <= p_date and b.checkout > p_date
    and (b.status in ('lunas','checked_in','no_show','checked_out')
         or (b.status = 'menunggu_bayar' and b.expires_at > now()))
$$;

-- nightly price hierarchy: manual override > rule_set % on period price > period price > null (no price)
create or replace function private.night_price(p_room text, p_date date) returns bigint
language plpgsql stable security definer set search_path = '' as $$
declare
  v_override bigint;
  v_rule_id uuid;
  v_persen int;
  v_base bigint;
  v_pembulatan int;
begin
  select i.harga, i.rule_set_id into v_override, v_rule_id
  from public.inventori i where i.room_code = p_room and i.tanggal = p_date;

  if v_override is not null then
    return v_override;
  end if;

  select nullif(regexp_replace(case p_room
           when 'sup_sv' then p.sup_sv when 'sup_gv' then p.sup_gv
           when 'dlx_sv' then p.dlx_sv when 'dlx_gv' then p.dlx_gv
           when 'suite_sv' then p.suite_sv end, '[^0-9]', '', 'g'), '')::bigint
    into v_base
  from public.pricelist_periods p
  where p.active and p_date::text = any(p.check_in_dates)
  order by p.sort_order
  limit 1;

  if v_base is null then
    return null;
  end if;

  if v_rule_id is not null then
    select rs.persen into v_persen from public.rule_set rs where rs.id = v_rule_id;
  end if;

  if v_persen is not null then
    select coalesce(bs.pembulatan, 1000) into v_pembulatan from public.booking_setting bs where bs.id = 1;
    return (round(v_base * (1 + v_persen / 100.0) / v_pembulatan) * v_pembulatan)::bigint;
  end if;

  return v_base;
end $$;

-- min/max nights for one room+checkin: cell override > rule_set > global setting
create or replace function private.stay_rules(p_room text, p_checkin date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_cell_min int;
  v_rule_id uuid;
  v_rule_min int;
  v_rule_max int;
  v_set_min int;
  v_set_max int;
begin
  select i.min_malam, i.rule_set_id into v_cell_min, v_rule_id
  from public.inventori i where i.room_code = p_room and i.tanggal = p_checkin;

  if v_rule_id is not null then
    select rs.min_malam, rs.maks_malam into v_rule_min, v_rule_max from public.rule_set rs where rs.id = v_rule_id;
  end if;

  select bs.min_malam, bs.maks_malam into v_set_min, v_set_max from public.booking_setting bs where bs.id = 1;

  return jsonb_build_object(
    'min_malam', coalesce(v_cell_min, v_rule_min, v_set_min, 1),
    'maks_malam', coalesce(v_rule_max, v_set_max, 30));
end $$;

create or replace function private.check_stay(p_room text, p_checkin date, p_checkout date, p_sumber text) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_now_time time := (now() at time zone 'Asia/Jakarta')::time;
  v_rules jsonb;
  v_min int;
  v_max int;
  v_set public.booking_setting%rowtype;
  v_dow_in int;
  v_dow_out int;
  v_cell_tutup_in boolean;
  v_cell_rule_in uuid;
  v_cell_tutup_out boolean;
  v_cell_rule_out uuid;
  v_rule_larangan_in smallint[];
  v_rule_larangan_out smallint[];
begin
  if p_checkout <= p_checkin then raise exception 'TANGGAL_TIDAK_VALID'; end if;
  if p_checkin < v_today then raise exception 'TANGGAL_LEWAT'; end if;

  v_rules := private.stay_rules(p_room, p_checkin);
  v_min := (v_rules->>'min_malam')::int;
  v_max := (v_rules->>'maks_malam')::int;
  if (p_checkout - p_checkin) < v_min then raise exception 'MIN_MALAM' using detail = v_min::text; end if;
  if (p_checkout - p_checkin) > v_max then raise exception 'MAKS_MALAM' using detail = v_max::text; end if;

  select * into v_set from public.booking_setting where id = 1;

  v_dow_in := extract(dow from p_checkin)::int;
  select i.tutup_checkin, i.rule_set_id into v_cell_tutup_in, v_cell_rule_in
    from public.inventori i where i.room_code = p_room and i.tanggal = p_checkin;
  if coalesce(v_cell_tutup_in, false) then
    raise exception 'CHECKIN_DILARANG' using detail = p_checkin::text;
  end if;
  if v_cell_rule_in is not null then
    select rs.larangan_checkin into v_rule_larangan_in from public.rule_set rs where rs.id = v_cell_rule_in;
    if v_dow_in = any(coalesce(v_rule_larangan_in, '{}')) then
      raise exception 'CHECKIN_DILARANG' using detail = p_checkin::text;
    end if;
  end if;
  if v_dow_in = any(coalesce(v_set.larangan_checkin, '{}')) then
    raise exception 'CHECKIN_DILARANG' using detail = p_checkin::text;
  end if;

  v_dow_out := extract(dow from p_checkout)::int;
  select i.tutup_checkout, i.rule_set_id into v_cell_tutup_out, v_cell_rule_out
    from public.inventori i where i.room_code = p_room and i.tanggal = p_checkout;
  if coalesce(v_cell_tutup_out, false) then
    raise exception 'CHECKOUT_DILARANG' using detail = p_checkout::text;
  end if;
  if v_cell_rule_out is not null then
    select rs.larangan_checkout into v_rule_larangan_out from public.rule_set rs where rs.id = v_cell_rule_out;
    if v_dow_out = any(coalesce(v_rule_larangan_out, '{}')) then
      raise exception 'CHECKOUT_DILARANG' using detail = p_checkout::text;
    end if;
  end if;
  if v_dow_out = any(coalesce(v_set.larangan_checkout, '{}')) then
    raise exception 'CHECKOUT_DILARANG' using detail = p_checkout::text;
  end if;

  if p_sumber = 'web' then
    if p_checkin < v_today + v_set.advance_notice_hari
       or (p_checkin = v_today and v_now_time > v_set.batas_jam_hari_ini) then
      raise exception 'TERLALU_DEKAT';
    end if;
    if p_checkin > v_today + (v_set.jendela_bulan || ' months')::interval then
      raise exception 'DI_LUAR_JENDELA';
    end if;
  end if;
end $$;

revoke execute on all functions in schema private from public, anon, authenticated;

-- ============================================================================
-- 4. Public read functions (anon)
-- ============================================================================

drop function if exists public.booking_availability(date, date);
create function public.booking_availability(p_from date, p_to date)
returns table (tanggal date, room_code text, sisa int, harga bigint, min_malam int, tutup_checkin boolean, tutup_checkout boolean)
language sql stable security definer set search_path = '' as $$
  select d::date, r.code,
         greatest(private.effective_allotment(r.code, d::date) - private.rooms_used(r.code, d::date), 0),
         private.night_price(r.code, d::date),
         coalesce(i.min_malam, rs.min_malam, bs.min_malam, 1),
         coalesce(i.tutup_checkin, false),
         coalesce(i.tutup_checkout, false)
  from generate_series(p_from, least(p_to, p_from + 400) - 1, interval '1 day') d
  cross join (values ('sup_sv'),('sup_gv'),('dlx_sv'),('dlx_gv'),('suite_sv')) r(code)
  left join public.inventori i on i.tanggal = d::date and i.room_code = r.code
  left join public.rule_set rs on rs.id = i.rule_set_id
  left join public.booking_setting bs on bs.id = 1
  order by 1, 2
$$;

create or replace function public.booking_quote(p_room text, p_checkin date, p_checkout date, p_qty int)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  d date; price bigint; nights jsonb := '[]'; per_room bigint := 0; missing jsonb := '[]';
  v_total bigint; v_persen numeric; v_termasuk boolean; v_pajak bigint;
begin
  if p_checkout <= p_checkin or p_checkout - p_checkin > 30 then
    raise exception 'TANGGAL_TIDAK_VALID';
  end if;
  d := p_checkin;
  while d < p_checkout loop
    price := private.night_price(p_room, d);
    if price is null then missing := missing || to_jsonb(d);
    else nights := nights || jsonb_build_object('tanggal', d, 'harga', price); per_room := per_room + price;
    end if;
    d := d + 1;
  end loop;
  v_total := per_room * greatest(p_qty, 1);

  select pajak_persen, pajak_termasuk into v_persen, v_termasuk from public.booking_setting where id = 1;
  v_persen := coalesce(v_persen, 0);
  v_termasuk := coalesce(v_termasuk, true);
  if v_termasuk then
    v_pajak := round(v_total * v_persen / (100 + v_persen));
  else
    v_pajak := round(v_total * v_persen / 100);
    v_total := v_total + v_pajak;
  end if;

  return jsonb_build_object('malam', nights, 'per_kamar', per_room,
                            'total', v_total, 'tanpa_harga', missing,
                            'pajak', v_pajak, 'pajak_termasuk', v_termasuk);
end $$;

create or replace function public.booking_public_setting() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'min_malam', min_malam, 'maks_malam', maks_malam,
    'advance_notice_hari', advance_notice_hari, 'batas_jam_hari_ini', batas_jam_hari_ini,
    'jendela_bulan', jendela_bulan, 'jam_checkin', jam_checkin, 'jam_checkout', jam_checkout,
    'hold_web_menit', hold_web_menit, 'pajak_persen', pajak_persen, 'pajak_termasuk', pajak_termasuk,
    'kebijakan_pembatalan', kebijakan_pembatalan)
  from public.booking_setting where id = 1
$$;

-- summary safe to show on the checkout/confirmation page (kode is a random 40-bit token)
create or replace function public.booking_get(p_kode text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'kode', b.kode, 'sumber', b.sumber, 'room_code', b.room_code,
    'checkin', b.checkin, 'checkout', b.checkout, 'jumlah_kamar', b.jumlah_kamar,
    'dewasa', b.dewasa, 'anak', b.anak, 'nama', b.nama, 'total', b.total, 'pajak', b.pajak, 'rincian', b.rincian,
    'status', case when b.status = 'menunggu_bayar' and b.expires_at <= now() then 'kedaluwarsa' else b.status end,
    'expires_at', b.expires_at, 'pg_provider', b.pg_provider,
    'jam_checkin', bs.jam_checkin, 'jam_checkout', bs.jam_checkout,
    'precheckin_diisi', exists (select 1 from public.pre_checkin pc where pc.booking_id = b.id))
  from public.booking b
  left join public.booking_setting bs on bs.id = 1
  where b.kode = p_kode
$$;

create or replace function public.precheckin_submit(p_kode text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_status text;
  v_checkin date;
begin
  select b.id, b.status, b.checkin into v_id, v_status, v_checkin
  from public.booking b where b.kode = p_kode;

  if v_id is null then raise exception 'BOOKING_TIDAK_ADA'; end if;
  if v_status <> 'lunas' or v_checkin < (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'BELUM_LUNAS';
  end if;

  insert into public.pre_checkin (booking_id, jam_tiba, jumlah_tamu, kendaraan, permintaan, kewarganegaraan, paspor, updated_at)
  values (v_id, nullif(p->>'jam_tiba','')::time, nullif(p->>'jumlah_tamu','')::int, p->>'kendaraan', p->>'permintaan',
          p->>'kewarganegaraan', p->'paspor', now())
  on conflict (booking_id) do update set
    jam_tiba = excluded.jam_tiba, jumlah_tamu = excluded.jumlah_tamu, kendaraan = excluded.kendaraan,
    permintaan = excluded.permintaan, kewarganegaraan = excluded.kewarganegaraan, paspor = excluded.paspor,
    updated_at = now();

  return jsonb_build_object('ok', true);
end $$;

-- ============================================================================
-- 5. Mutations
-- ============================================================================

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
  v_quote jsonb; v_total bigint; v_pajak bigint; v_kode text; v_booking_id uuid; d date; v_free int;
begin
  if v_room not in ('sup_sv','sup_gv','dlx_sv','dlx_gv','suite_sv') then raise exception 'KAMAR_TIDAK_VALID'; end if;
  if v_in is null or v_out is null then raise exception 'TANGGAL_TIDAK_VALID'; end if;
  if v_qty < 1 or v_qty > 10 or (v_room = 'suite_sv' and v_qty > 1) then raise exception 'JUMLAH_KAMAR_TIDAK_VALID'; end if;
  v_wa := regexp_replace(coalesce(p->>'wa',''), '[^0-9]', '', 'g');
  if coalesce(trim(p->>'nama'), '') = '' or length(v_wa) < 10 then
    raise exception 'DATA_TAMU_TIDAK_LENGKAP';
  end if;

  perform private.check_stay(v_room, v_in, v_out, p_sumber);

  select * into v_set from public.booking_setting where id = 1;
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

  -- make sure inventori rows for the stay exist before locking, so concurrent holds truly serialize
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

  v_quote := public.booking_quote(v_room, v_in, v_out, v_qty);
  if jsonb_array_length(v_quote->'tanpa_harga') > 0 then raise exception 'HARGA_BELUM_ADA'; end if;
  v_total := case when p_sumber = 'sales' and (p->>'total') is not null
                  then (p->>'total')::bigint else (v_quote->>'total')::bigint end;
  v_pajak := coalesce((v_quote->>'pajak')::bigint, 0);

  v_kode := 'HON-' || upper(encode(extensions.gen_random_bytes(5), 'hex'));
  insert into public.booking (kode, sumber, room_code, checkin, checkout, jumlah_kamar, dewasa, anak,
                              nama, wa, email, catatan, total, pajak, rincian, expires_at, dibuat_oleh)
  values (v_kode, p_sumber, v_room, v_in, v_out, v_qty,
          coalesce((p->>'dewasa')::int, 2), coalesce((p->>'anak')::int, 0),
          trim(p->>'nama'), p->>'wa', nullif(trim(coalesce(p->>'email','')), ''), p->>'catatan',
          v_total, v_pajak, v_quote->'malam', now() + make_interval(mins => v_hold), p_by)
  returning id into v_booking_id;

  insert into public.booking_events (booking_id, jenis, data, oleh)
  values (v_booking_id, 'dibuat', jsonb_build_object('sumber', p_sumber, 'total', v_total), p_by);

  return public.booking_get(v_kode);
end $$;

-- website checkout (called by /api with the server secret)
create or replace function public.booking_create(p_secret text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_secret(p_secret);
  return private.booking_insert(p, 'web', null);
end $$;

-- sales link, created from the admin panel by a logged-in staff member with owner or sales role
create or replace function public.booking_create_sales(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_role('owner','sales') then raise exception 'UNAUTHORIZED' using errcode = '28000'; end if;
  return private.booking_insert(p, 'sales', (select email from auth.users where id = auth.uid()));
end $$;

create or replace function public.booking_attach_payment(p_secret text, p_kode text, p_provider text, p_ref text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_secret(p_secret);
  update public.booking set pg_provider = p_provider, pg_ref = p_ref, updated_at = now()
   where kode = p_kode and status = 'menunggu_bayar';
end $$;

-- payment result from the gateway webhook (mock provider path). Returns the full row for notifications.
create or replace function public.booking_mark(p_secret text, p_kode text, p_status text, p_amount bigint, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare b public.booking;
begin
  perform private.check_secret(p_secret);
  select * into b from public.booking where kode = p_kode for update;
  if not found then raise exception 'BOOKING_TIDAK_ADA'; end if;

  if p_status = 'lunas' then
    if b.status = 'lunas' then return to_jsonb(b); end if;               -- webhook retries are idempotent
    if p_amount is distinct from b.total then raise exception 'NOMINAL_TIDAK_COCOK'; end if;
    update public.booking set status = 'lunas', paid_at = now(), pg_payload = p_payload, updated_at = now(),
           catatan_admin = case when b.expires_at <= now() or b.status <> 'menunggu_bayar'
                                then concat_ws(E'\n', b.catatan_admin, 'PERIKSA: dibayar setelah hold habis, cek ketersediaan kamar.')
                                else b.catatan_admin end
     where id = b.id returning * into b;
  elsif p_status in ('kedaluwarsa', 'batal') then
    update public.booking set status = p_status, pg_payload = p_payload, updated_at = now()
     where id = b.id and status = 'menunggu_bayar' returning * into b;
  else
    raise exception 'STATUS_TIDAK_VALID';
  end if;
  return to_jsonb(b);
end $$;

-- ============================================================================
-- 6. Payment functions (secret-gated, p_secret first, like booking_mark)
-- ============================================================================

create or replace function public.payment_next_invoice(p_secret text, p_kode text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_kode_suffix text; v_n int;
begin
  perform private.check_secret(p_secret);
  select right(kode, 10) into v_kode_suffix from public.booking where kode = p_kode;
  if v_kode_suffix is null then raise exception 'BOOKING_TIDAK_ADA'; end if;

  select count(*) + 1 into v_n from public.payment_attempts pa
    join public.booking b on b.id = pa.booking_id where b.kode = p_kode;

  return 'HON' || v_kode_suffix || 'P' || lpad(v_n::text, 2, '0');
end $$;

create or replace function public.payment_attempt_create(
  p_secret text, p_kode text, p_provider text, p_invoice text, p_request_id text,
  p_token text, p_url text, p_amount bigint, p_expires_at timestamptz
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_booking_id uuid; v_status text; v_expires timestamptz; v_total bigint; v_attempt_id uuid;
begin
  perform private.check_secret(p_secret);
  select id, status, expires_at, total into v_booking_id, v_status, v_expires, v_total
    from public.booking where kode = p_kode for update;
  if v_booking_id is null then raise exception 'BOOKING_TIDAK_ADA'; end if;
  if v_status = 'lunas' then raise exception 'SUDAH_LUNAS'; end if;
  if v_status <> 'menunggu_bayar' or v_expires <= now() then raise exception 'BOOKING_KEDALUWARSA'; end if;
  if p_amount is distinct from v_total then raise exception 'NOMINAL_TIDAK_COCOK'; end if;

  insert into public.payment_attempts (booking_id, provider, invoice_number, request_id, token_id, pay_url, amount, expires_at)
  values (v_booking_id, p_provider, p_invoice, p_request_id, p_token, p_url, p_amount, p_expires_at)
  returning id into v_attempt_id;

  -- backward compatibility with the mock/webhook path that reads pg_provider/pg_ref
  update public.booking set pg_provider = p_provider, pg_ref = p_invoice, updated_at = now() where id = v_booking_id;

  return v_attempt_id;
end $$;

create or replace function public.payment_settle(p_secret text, p_invoice text, p_status text, p_amount bigint, p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  pa public.payment_attempts;
  b public.booking;
  v_baru_lunas boolean := false;
begin
  perform private.check_secret(p_secret);
  select * into pa from public.payment_attempts where invoice_number = p_invoice for update;
  if not found then raise exception 'INVOICE_TIDAK_ADA'; end if;

  update public.payment_attempts set status = p_status, raw = p_payload, last_checked_at = now(), updated_at = now()
   where id = pa.id;

  select * into b from public.booking where id = pa.booking_id for update;

  if p_status = 'SUCCESS' then
    -- only pre-payment states move to lunas; checked_in/no_show/checked_out are already paid
    if b.status in ('menunggu_bayar','kedaluwarsa','batal') then
      if p_amount is distinct from b.total then raise exception 'NOMINAL_TIDAK_COCOK'; end if;
      update public.booking set status = 'lunas', paid_at = now(), pg_payload = p_payload, updated_at = now(),
             catatan_admin = case when b.expires_at <= now() or b.status <> 'menunggu_bayar'
                                  then concat_ws(E'\n', b.catatan_admin, 'PERIKSA: dibayar setelah hold habis, cek ketersediaan kamar.')
                                  else b.catatan_admin end
       where id = b.id returning * into b;
      v_baru_lunas := true;
    end if;
  elsif p_status = 'EXPIRED' then
    if b.status = 'menunggu_bayar' and b.expires_at <= now() then
      update public.booking set status = 'kedaluwarsa', updated_at = now() where id = b.id returning * into b;
    end if;
  elsif p_status = 'REFUNDED' then
    update public.booking set status = 'batal', refund_amount = p_amount, cancelled_at = now(), updated_at = now()
     where id = b.id returning * into b;
  elsif p_status in ('FAILED','PENDING','TIMEOUT','REDIRECT') then
    null; -- attempt row already updated above, booking untouched
  else
    raise exception 'STATUS_TIDAK_VALID';
  end if;

  insert into public.booking_events (booking_id, jenis, data, oleh)
  values (b.id, 'pembayaran', jsonb_build_object('invoice', p_invoice, 'status', p_status, 'baru_lunas', v_baru_lunas), null);

  return jsonb_build_object('booking', to_jsonb(b), 'baru_lunas', v_baru_lunas);
end $$;

create or replace function public.payment_pending(p_secret text, p_limit int)
returns table (invoice_number text, provider text, kode text, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_secret(p_secret);
  return query
    select pa.invoice_number, pa.provider, b.kode, pa.created_at
    from public.payment_attempts pa
    join public.booking b on b.id = pa.booking_id
    where pa.status in ('PENDING','REDIRECT','TIMEOUT')
      and pa.created_at > now() - interval '48 hours'
      and (pa.last_checked_at is null or pa.last_checked_at < now() - interval '4 minutes')
    order by pa.created_at asc
    limit greatest(coalesce(p_limit, 20), 1);
end $$;

create or replace function public.payment_attempts_of(p_secret text, p_kode text)
returns table (invoice_number text, provider text, status text, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_secret(p_secret);
  return query
    select pa.invoice_number, pa.provider, pa.status, pa.created_at
    from public.payment_attempts pa
    join public.booking b on b.id = pa.booking_id
    where b.kode = p_kode
    order by pa.created_at asc;
end $$;

-- ============================================================================
-- 7. Admin functions (authenticated + is_admin(), UNAUTHORIZED otherwise)
-- ============================================================================

create or replace function public.admin_calendar(p_from date, p_to date)
returns table (
  tanggal date, room_code text, harga_dasar bigint, harga_efektif bigint,
  sumber_harga text, harga_manual bigint, jatah int, jatah_default int,
  terpakai int, sisa int, stop_sell boolean, rule_set_id uuid, rule_set_nama text,
  rule_set_warna smallint, min_malam int, tutup_checkin boolean, tutup_checkout boolean,
  catatan text, jumlah_booking int
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'UNAUTHORIZED' using errcode = '28000'; end if;
  if p_to < p_from or p_to - p_from > 62 then raise exception 'RENTANG_TERLALU_PANJANG'; end if;

  return query
  select
    d::date as tanggal, r.code as room_code,
    (select nullif(regexp_replace(case r.code
        when 'sup_sv' then pp.sup_sv when 'sup_gv' then pp.sup_gv
        when 'dlx_sv' then pp.dlx_sv when 'dlx_gv' then pp.dlx_gv
        when 'suite_sv' then pp.suite_sv end, '[^0-9]', '', 'g'), '')::bigint
      from public.pricelist_periods pp
      where pp.active and d::text = any(pp.check_in_dates)
      order by pp.sort_order limit 1) as harga_dasar,
    private.night_price(r.code, d::date) as harga_efektif,
    case when i.harga is not null then 'manual'
         when rs.persen is not null then 'rule_set'
         when private.night_price(r.code, d::date) is not null then 'periode'
         else null end as sumber_harga,
    i.harga as harga_manual,
    coalesce(i.allotment, rt.jatah_default) as jatah,
    rt.jatah_default,
    private.rooms_used(r.code, d::date) as terpakai,
    greatest(private.effective_allotment(r.code, d::date) - private.rooms_used(r.code, d::date), 0) as sisa,
    coalesce(i.stop_sell, false) as stop_sell,
    i.rule_set_id, rs.nama as rule_set_nama, rs.warna as rule_set_warna,
    coalesce(i.min_malam, rs.min_malam, bs.min_malam, 1) as min_malam,
    coalesce(i.tutup_checkin, false), coalesce(i.tutup_checkout, false),
    i.catatan,
    (select count(*)::int from public.booking b
       where b.room_code = r.code and b.checkin <= d::date and b.checkout > d::date
         and (b.status in ('lunas','checked_in','no_show','checked_out')
              or (b.status = 'menunggu_bayar' and b.expires_at > now()))) as jumlah_booking
  from generate_series(p_from, p_to, interval '1 day') d
  cross join (values ('sup_sv'),('sup_gv'),('dlx_sv'),('dlx_gv'),('suite_sv')) r(code)
  left join public.inventori i on i.tanggal = d::date and i.room_code = r.code
  left join public.room_type rt on rt.room_code = r.code
  left join public.rule_set rs on rs.id = i.rule_set_id
  left join public.booking_setting bs on bs.id = 1
  order by 1, 2;
end $$;

-- Atomic: raises on any violation, which rolls back everything this call already wrote
-- (there is no explicit savepoint — the whole RPC call is one implicit transaction).
create or replace function public.admin_calendar_save(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
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
begin
  if not public.has_role('owner') then raise exception 'UNAUTHORIZED' using errcode = '28000'; end if;
  if v_from is null or v_to is null or v_to < v_from then raise exception 'TANGGAL_TIDAK_VALID'; end if;

  select email into v_email from auth.users where id = auth.uid();

  foreach v_room in array coalesce(v_rooms, '{}') loop
    d := v_from;
    while d <= v_to loop
      if array_length(v_days, 1) is null or extract(dow from d)::int = any(v_days) then

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

        v_n := v_n + 1;
      end if;
      d := d + 1;
    end loop;
  end loop;

  insert into public.booking_events (jenis, data, oleh)
  values ('kalender', jsonb_build_object('rooms', v_rooms, 'from', v_from, 'to', v_to, 'days', v_days, 'set', v_set, 'sel_diubah', v_n), v_email);

  return jsonb_build_object('sel_diubah', v_n);
end $$;

create or replace function public.admin_checkin(p_kode text, p_room_id uuid, p_id_verified boolean, p_deposit bigint, p_catatan text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  b public.booking;
  r public.rooms;
  v_email text;
begin
  if not public.has_role('owner','front_office') then raise exception 'UNAUTHORIZED' using errcode = '28000'; end if;
  select email into v_email from auth.users where id = auth.uid();

  select * into b from public.booking where kode = p_kode for update;
  if not found then raise exception 'BOOKING_TIDAK_ADA'; end if;
  if b.status <> 'lunas' then raise exception 'STATUS_TIDAK_VALID'; end if;
  if not coalesce(p_id_verified, false) then raise exception 'ID_BELUM_DIVERIFIKASI'; end if;

  select * into r from public.rooms where id = p_room_id;
  if not found or not r.aktif or r.room_code <> b.room_code then raise exception 'KAMAR_TIDAK_COCOK'; end if;

  update public.booking set status = 'checked_in', room_id = p_room_id, id_verified = true,
         deposit = p_deposit, catatan_admin = coalesce(p_catatan, catatan_admin),
         checked_in_at = now(), checked_in_by = v_email, updated_at = now()
   where id = b.id returning * into b;

  insert into public.booking_events (booking_id, jenis, data, oleh)
  values (b.id, 'checkin', jsonb_build_object('room_id', p_room_id), v_email);

  return public.booking_get(p_kode);
end $$;

create or replace function public.admin_no_show(p_kode text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare b public.booking; v_email text;
begin
  if not public.has_role('owner','front_office') then raise exception 'UNAUTHORIZED' using errcode = '28000'; end if;
  select email into v_email from auth.users where id = auth.uid();

  select * into b from public.booking where kode = p_kode for update;
  if not found then raise exception 'BOOKING_TIDAK_ADA'; end if;
  if b.status <> 'lunas' or b.checkin > (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'STATUS_TIDAK_VALID';
  end if;

  update public.booking set status = 'no_show', no_show_at = now(), updated_at = now() where id = b.id returning * into b;
  insert into public.booking_events (booking_id, jenis, oleh) values (b.id, 'no_show', v_email);

  return public.booking_get(p_kode);
end $$;

create or replace function public.admin_cancel(p_kode text, p_alasan text, p_refund bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare b public.booking; v_email text;
begin
  if not public.has_role('owner','sales') then raise exception 'UNAUTHORIZED' using errcode = '28000'; end if;
  if coalesce(trim(p_alasan), '') = '' then raise exception 'ALASAN_WAJIB'; end if;
  select email into v_email from auth.users where id = auth.uid();

  select * into b from public.booking where kode = p_kode for update;
  if not found then raise exception 'BOOKING_TIDAK_ADA'; end if;
  if b.status not in ('menunggu_bayar','lunas') then raise exception 'STATUS_TIDAK_VALID'; end if;

  update public.booking set status = 'batal', alasan_batal = p_alasan, refund_amount = p_refund,
         cancelled_at = now(), updated_at = now()
   where id = b.id returning * into b;
  insert into public.booking_events (booking_id, jenis, data, oleh)
    values (b.id, 'batal', jsonb_build_object('alasan', p_alasan, 'refund', p_refund), v_email);

  return public.booking_get(p_kode);
end $$;

create or replace function public.admin_mark(p_kode text, p_field text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare b public.booking; v_email text;
begin
  if not public.has_role('owner','front_office','sales') then raise exception 'UNAUTHORIZED' using errcode = '28000'; end if;
  if p_field not in ('info_kedatangan','apoa') then raise exception 'FIELD_TIDAK_VALID'; end if;
  select email into v_email from auth.users where id = auth.uid();

  if p_field = 'info_kedatangan' then
    update public.booking set info_kedatangan_at = now(), updated_at = now() where kode = p_kode returning * into b;
  else
    update public.booking set apoa_reported_at = now(), updated_at = now() where kode = p_kode returning * into b;
  end if;
  if not found then raise exception 'BOOKING_TIDAK_ADA'; end if;

  insert into public.booking_events (booking_id, jenis, data, oleh)
    values (b.id, 'tandai', jsonb_build_object('field', p_field), v_email);

  return public.booking_get(p_kode);
end $$;

-- ============================================================================
-- 8. Grants
-- ============================================================================

revoke execute on all functions in schema private from public, anon, authenticated;

revoke execute on function
  public.booking_availability(date, date), public.booking_quote(text, date, date, int),
  public.booking_get(text), public.booking_public_setting(), public.precheckin_submit(text, jsonb),
  public.payment_attempt_create(text, text, text, text, text, text, text, bigint, timestamptz),
  public.payment_next_invoice(text, text), public.payment_settle(text, text, text, bigint, jsonb),
  public.payment_pending(text, int), public.payment_attempts_of(text, text)
  from public;
grant execute on function
  public.booking_availability(date, date), public.booking_quote(text, date, date, int),
  public.booking_get(text), public.booking_public_setting(), public.precheckin_submit(text, jsonb),
  public.payment_attempt_create(text, text, text, text, text, text, text, bigint, timestamptz),
  public.payment_next_invoice(text, text), public.payment_settle(text, text, text, bigint, jsonb),
  public.payment_pending(text, int), public.payment_attempts_of(text, text)
  to anon, authenticated;

revoke execute on function
  public.admin_role(), public.has_role(text[]), public.booking_create_sales(jsonb),
  public.admin_calendar(date, date), public.admin_calendar_save(jsonb),
  public.admin_checkin(text, uuid, boolean, bigint, text), public.admin_no_show(text),
  public.admin_cancel(text, text, bigint), public.admin_mark(text, text)
  from public;
grant execute on function
  public.admin_role(), public.has_role(text[]), public.booking_create_sales(jsonb),
  public.admin_calendar(date, date), public.admin_calendar_save(jsonb),
  public.admin_checkin(text, uuid, boolean, bigint, text), public.admin_no_show(text),
  public.admin_cancel(text, text, bigint), public.admin_mark(text, text)
  to authenticated;
-- Supabase default privileges grant anon explicitly; the "from public" revoke above does not remove that.
revoke execute on function
  public.admin_role(), public.has_role(text[]), public.booking_create_sales(jsonb),
  public.admin_calendar(date, date), public.admin_calendar_save(jsonb),
  public.admin_checkin(text, uuid, boolean, bigint, text), public.admin_no_show(text),
  public.admin_cancel(text, text, bigint), public.admin_mark(text, text)
  from anon;
