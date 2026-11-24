-- Booking engine: inventory (manual allotment per room per night) + bookings with payment holds.
-- Applied to STAGING first (YOUR-STAGING-REF). Promote to prod only after staging sign-off.
--
-- Access model:
--   * anon (website + /api functions) can only call the functions below, never touch tables.
--   * Mutating functions require p_secret (sha256 stored in private.booking_config),
--     which only lives in server env (BOOKING_SECRET). Browsers never see it.
--   * authenticated (admin panel) gets full table access + booking_create_sales().

create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.booking_config (
  id int primary key default 1 check (id = 1),
  secret_hash text not null
);

-- ---------- tables ----------
create table if not exists public.inventori (
  tanggal    date not null,
  room_code  text not null check (room_code in ('sup_sv','sup_gv','dlx_sv','dlx_gv','suite_sv')),
  allotment  int  not null default 0 check (allotment >= 0),
  stop_sell  boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (tanggal, room_code)
);

create table if not exists public.booking (
  id           uuid primary key default gen_random_uuid(),
  kode         text not null unique,
  sumber       text not null check (sumber in ('web','sales')),
  room_code    text not null check (room_code in ('sup_sv','sup_gv','dlx_sv','dlx_gv','suite_sv')),
  checkin      date not null,
  checkout     date not null,
  jumlah_kamar int  not null check (jumlah_kamar between 1 and 10),
  dewasa       int  not null default 2 check (dewasa between 1 and 40),
  anak         int  not null default 0 check (anak between 0 and 40),
  nama         text not null,
  wa           text not null,
  email        text,
  catatan      text,
  total        bigint not null check (total > 0),
  rincian      jsonb  not null default '[]',
  status       text not null default 'menunggu_bayar'
               check (status in ('menunggu_bayar','lunas','kedaluwarsa','batal')),
  expires_at   timestamptz not null,
  pg_provider  text,
  pg_ref       text,
  pg_payload   jsonb,
  dibuat_oleh  text,
  catatan_admin text,
  paid_at      timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (checkout > checkin)
);
create index if not exists booking_active_idx on public.booking (room_code, checkin, checkout)
  where status in ('menunggu_bayar','lunas');

alter table public.inventori enable row level security;
alter table public.booking   enable row level security;
drop policy if exists admin_all_inventori on public.inventori;
create policy admin_all_inventori on public.inventori for all to authenticated using (true) with check (true);
drop policy if exists admin_all_booking on public.booking;
create policy admin_all_booking on public.booking for all to authenticated using (true) with check (true);

-- ---------- helpers (private, not exposed via API) ----------
create or replace function private.check_secret(p text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p is null or encode(extensions.digest(p, 'sha256'), 'hex')
       is distinct from (select secret_hash from private.booking_config where id = 1) then
    raise exception 'UNAUTHORIZED' using errcode = '28000';
  end if;
end $$;

-- nightly price for one room on one night, from the pricelist the website already shows
create or replace function private.night_price(p_room text, p_date date) returns bigint
language sql stable security definer set search_path = '' as $$
  select nullif(regexp_replace(case p_room
           when 'sup_sv' then p.sup_sv when 'sup_gv' then p.sup_gv
           when 'dlx_sv' then p.dlx_sv when 'dlx_gv' then p.dlx_gv
           when 'suite_sv' then p.suite_sv end, '[^0-9]', '', 'g'), '')::bigint
  from public.pricelist_periods p
  where p.active and p_date::text = any(p.check_in_dates)
  order by p.sort_order
  limit 1
$$;

-- rooms taken on one night: paid + unexpired holds
create or replace function private.rooms_used(p_room text, p_date date) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(b.jumlah_kamar), 0)::int
  from public.booking b
  where b.room_code = p_room and b.checkin <= p_date and b.checkout > p_date
    and (b.status = 'lunas' or (b.status = 'menunggu_bayar' and b.expires_at > now()))
$$;

-- ---------- public read functions ----------
create or replace function public.booking_availability(p_from date, p_to date)
returns table (tanggal date, room_code text, sisa int, harga bigint)
language sql stable security definer set search_path = '' as $$
  select d::date, r.code,
         greatest(case when coalesce(i.stop_sell, false) then 0 else coalesce(i.allotment, 0) end
                  - private.rooms_used(r.code, d::date), 0),
         private.night_price(r.code, d::date)
  from generate_series(p_from, least(p_to, p_from + 400) - 1, interval '1 day') d
  cross join (values ('sup_sv'),('sup_gv'),('dlx_sv'),('dlx_gv'),('suite_sv')) r(code)
  left join public.inventori i on i.tanggal = d::date and i.room_code = r.code
  order by 1, 2
$$;

create or replace function public.booking_quote(p_room text, p_checkin date, p_checkout date, p_qty int)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  d date; price bigint; nights jsonb := '[]'; per_room bigint := 0; missing jsonb := '[]';
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
  return jsonb_build_object('malam', nights, 'per_kamar', per_room,
                            'total', per_room * greatest(p_qty, 1), 'tanpa_harga', missing);
end $$;

-- summary safe to show on the checkout/confirmation page (kode is a random 40-bit token)
create or replace function public.booking_get(p_kode text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'kode', b.kode, 'sumber', b.sumber, 'room_code', b.room_code,
    'checkin', b.checkin, 'checkout', b.checkout, 'jumlah_kamar', b.jumlah_kamar,
    'dewasa', b.dewasa, 'anak', b.anak, 'nama', b.nama, 'total', b.total, 'rincian', b.rincian,
    'status', case when b.status = 'menunggu_bayar' and b.expires_at <= now() then 'kedaluwarsa' else b.status end,
    'expires_at', b.expires_at, 'pg_provider', b.pg_provider)
  from public.booking b where b.kode = p_kode
$$;

-- ---------- mutations ----------
create or replace function private.booking_insert(p jsonb, p_sumber text, p_by text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_room text := p->>'room_code';
  v_in date := (p->>'checkin')::date;
  v_out date := (p->>'checkout')::date;
  v_qty int := coalesce((p->>'jumlah_kamar')::int, 1);
  v_hold int := least(greatest(coalesce((p->>'hold_minutes')::int, 30), 5), 4320);
  v_quote jsonb; v_total bigint; v_kode text; d date; v_free int;
begin
  if v_room not in ('sup_sv','sup_gv','dlx_sv','dlx_gv','suite_sv') then raise exception 'KAMAR_TIDAK_VALID'; end if;
  if v_in is null or v_out is null or v_out <= v_in or v_out - v_in > 30 then raise exception 'TANGGAL_TIDAK_VALID'; end if;
  if v_in < (now() at time zone 'Asia/Jakarta')::date then raise exception 'TANGGAL_LEWAT'; end if;
  if v_qty < 1 or v_qty > 10 or (v_room = 'suite_sv' and v_qty > 1) then raise exception 'JUMLAH_KAMAR_TIDAK_VALID'; end if;
  if coalesce(trim(p->>'nama'), '') = '' or length(regexp_replace(coalesce(p->>'wa',''), '[^0-9]', '', 'g')) < 10 then
    raise exception 'DATA_TAMU_TIDAK_LENGKAP';
  end if;

  -- serialize concurrent holds on the same room+nights
  perform 1 from public.inventori i
   where i.room_code = v_room and i.tanggal >= v_in and i.tanggal < v_out
   for update;

  d := v_in;
  while d < v_out loop
    select case when coalesce(i.stop_sell, false) then 0 else coalesce(i.allotment, 0) end
      into v_free from public.inventori i where i.room_code = v_room and i.tanggal = d;
    if coalesce(v_free, 0) - private.rooms_used(v_room, d) < v_qty then
      raise exception 'STOK_HABIS' using detail = d::text;
    end if;
    d := d + 1;
  end loop;

  v_quote := public.booking_quote(v_room, v_in, v_out, v_qty);
  if jsonb_array_length(v_quote->'tanpa_harga') > 0 then raise exception 'HARGA_BELUM_ADA'; end if;
  v_total := case when p_sumber = 'sales' and (p->>'total') is not null
                  then (p->>'total')::bigint else (v_quote->>'total')::bigint end;

  v_kode := 'HON-' || upper(encode(extensions.gen_random_bytes(5), 'hex'));
  insert into public.booking (kode, sumber, room_code, checkin, checkout, jumlah_kamar, dewasa, anak,
                              nama, wa, email, catatan, total, rincian, expires_at, dibuat_oleh)
  values (v_kode, p_sumber, v_room, v_in, v_out, v_qty,
          coalesce((p->>'dewasa')::int, 2), coalesce((p->>'anak')::int, 0),
          trim(p->>'nama'), p->>'wa', nullif(trim(coalesce(p->>'email','')), ''), p->>'catatan',
          v_total, v_quote->'malam', now() + make_interval(mins => v_hold), p_by);

  return public.booking_get(v_kode);
end $$;

-- website checkout (called by /api with the server secret)
create or replace function public.booking_create(p_secret text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_secret(p_secret);
  return private.booking_insert(p, 'web', null);
end $$;

-- sales link, created from the admin panel by a logged-in staff member
create or replace function public.booking_create_sales(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED' using errcode = '28000'; end if;
  return private.booking_insert(p, 'sales', (select email from auth.users where id = auth.uid()));
end $$;

create or replace function public.booking_attach_payment(p_secret text, p_kode text, p_provider text, p_ref text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_secret(p_secret);
  update public.booking set pg_provider = p_provider, pg_ref = p_ref, updated_at = now()
   where kode = p_kode and status = 'menunggu_bayar';
end $$;

-- payment result from the gateway webhook. Returns the full row for notifications (server only).
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

-- ---------- grants ----------
revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function public.booking_availability(date, date), public.booking_quote(text, date, date, int),
  public.booking_get(text), public.booking_create(text, jsonb), public.booking_create_sales(jsonb),
  public.booking_attach_payment(text, text, text, text), public.booking_mark(text, text, text, bigint, jsonb)
  from public;
grant execute on function public.booking_availability(date, date), public.booking_quote(text, date, date, int),
  public.booking_get(text), public.booking_create(text, jsonb),
  public.booking_attach_payment(text, text, text, text), public.booking_mark(text, text, text, bigint, jsonb)
  to anon, authenticated;
grant execute on function public.booking_create_sales(jsonb) to authenticated;
-- Supabase default privileges grant anon explicitly; "from public" above does not remove that.
revoke execute on function public.booking_create_sales(jsonb) from anon;

-- After applying: store sha256(BOOKING_SECRET) once, never the secret itself.
--   insert into private.booking_config (id, secret_hash) values (1, '<sha256 hex>')
--   on conflict (id) do update set secret_hash = excluded.secret_hash;
