-- Payment page + behaviour report (owner request 27 Sep 2026):
--  * 15-minute payment window per booking code (web hold 15 min; each gateway attempt at most 15 min)
--  * status page shows the payment deadline, lets the guest re-check, and shows a receipt from the DOKU data
--  * guest behaviour events (funnel_event) + laporan_pembayaran() report, pushed to the admin by Realtime

update public.booking_setting set hold_web_menit = 15 where id = 1;

-- human label for the gateway channel stored in booking.pg_payload (DOKU notification / Check Status body)
create or replace function private.metode_bayar(p jsonb)
returns text
language sql
immutable
set search_path = ''
as $function$
  select case
    when p is null then null
    when p ? 'mock' then 'Simulasi (staging)'
    else nullif(replace(initcap(replace(coalesce(
      p->'channel'->>'id', p->'service'->>'id', p->'payment'->>'payment_method_types', ''), '_', ' ')), 'Va', 'VA'), '')
  end
$function$;

-- booking_get + bayar_sampai (deadline of the gateway page the guest has open) + bukti (receipt data once paid)
create or replace function public.booking_get(p_kode text)
returns jsonb
language sql
stable security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'kode', b.kode, 'sumber', b.sumber, 'room_code', b.room_code,
    'checkin', b.checkin, 'checkout', b.checkout, 'jumlah_kamar', b.jumlah_kamar,
    'dewasa', b.dewasa, 'anak', b.anak, 'nama', b.nama, 'total', b.total, 'pajak', b.pajak, 'rincian', b.rincian,
    'addons', b.addons, 'diskon', b.diskon, 'voucher_kode', b.voucher_kode,
    'pajak_persen', bs.pajak_persen, 'pajak_termasuk', bs.pajak_termasuk,
    'status', case when b.status = 'menunggu_bayar' and b.expires_at <= now() then 'kedaluwarsa' else b.status end,
    'expires_at', b.expires_at, 'pg_provider', b.pg_provider,
    'created_at', b.created_at,
    'bayar_sampai', (select least(pa.expires_at, b.expires_at) from public.payment_attempts pa
                      where pa.booking_id = b.id and pa.status in ('PENDING', 'REDIRECT', 'TIMEOUT') and pa.expires_at > now()
                      order by pa.created_at desc limit 1),
    'bukti', case when b.paid_at is not null then jsonb_build_object(
      'invoice', b.pg_ref,
      'dibayar_pada', b.paid_at,
      'metode', private.metode_bayar(b.pg_payload),
      'penyedia', b.pg_provider,
      'email_ada', b.email is not null) end,
    'jam_checkin', bs.jam_checkin, 'jam_checkout', bs.jam_checkout,
    'precheckin_diisi', exists (select 1 from public.pre_checkin pc where pc.booking_id = b.id))
  from public.booking b
  left join public.booking_setting bs on bs.id = 1
  where b.kode = p_kode
$function$;

-- server-only: guest contact for the gateway (DOKU emails its receipt to customer.email) and the
-- still-open gateway page, so "Lanjutkan pembayaran" reopens it instead of issuing a new invoice
create or replace function public.booking_pay_context(p_secret text, p_kode text)
returns jsonb
language plpgsql
stable security definer
set search_path = ''
as $function$
declare v jsonb;
begin
  perform private.check_secret(p_secret);
  select jsonb_build_object('email', b.email, 'wa', b.wa,
    'pay_url', (select pa.pay_url from public.payment_attempts pa
                 where pa.booking_id = b.id and pa.status in ('PENDING', 'REDIRECT')
                   and pa.expires_at > now() + interval '1 minute' and pa.pay_url is not null
                 order by pa.created_at desc limit 1))
    into v
    from public.booking b where b.kode = p_kode;
  return v;
end $function$;
-- the API calls with the publishable key; BOOKING_SECRET (check_secret) is the gate, like payment_attempts_of
revoke all on function public.booking_pay_context(text, text) from public, authenticated;
grant execute on function public.booking_pay_context(text, text) to anon, service_role;

-- ---------- guest behaviour events ----------
create table if not exists public.funnel_event (
  id bigserial primary key,
  sesi text not null,
  jenis text not null,
  kode text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists funnel_event_created_idx on public.funnel_event (created_at);
create index if not exists funnel_event_kode_idx on public.funnel_event (kode) where kode is not null;
alter table public.funnel_event enable row level security;
drop policy if exists admin_select_funnel_event on public.funnel_event;
create policy admin_select_funnel_event on public.funnel_event for select to authenticated using (public.is_admin());

-- called by /api/booking/track (secret); unknown event names are dropped, payload capped
create or replace function public.track_event(p_secret text, p_sesi text, p_jenis text, p_kode text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.check_secret(p_secret);
  if p_jenis not in ('checkout_dibuka', 'isi_data', 'status_dibuka', 'cek_status', 'timer_habis', 'bukti_diunduh', 'bayar_ulang')
     or coalesce(length(p_sesi), 0) not between 8 and 64 then
    return;
  end if;
  insert into public.funnel_event (sesi, jenis, kode, data)
  values (p_sesi, p_jenis, case when p_kode ~ '^HON-[0-9A-F]{10}$' then p_kode end,
          case when length(coalesce(p_data, '{}'::jsonb)::text) <= 1000 then coalesce(p_data, '{}'::jsonb) else '{}'::jsonb end);
end $function$;
revoke all on function public.track_event(text, text, text, text, jsonb) from public, authenticated;
grant execute on function public.track_event(text, text, text, text, jsonb) to anon, service_role;

-- ---------- report ----------
create or replace function public.laporan_pembayaran(p_from date, p_to date)
returns jsonb
language plpgsql
stable security definer
set search_path = ''
as $function$
declare
  v_start timestamptz := (p_from::timestamp at time zone 'Asia/Jakarta');
  v_end timestamptz := ((p_to + 1)::timestamp at time zone 'Asia/Jakarta');
  v jsonb;
begin
  if not public.is_admin() then raise exception 'UNAUTHORIZED' using errcode = '28000'; end if;

  with b as (
    select bk.*,
      case when bk.status = 'menunggu_bayar' and bk.expires_at <= now() then 'kedaluwarsa' else bk.status end as st,
      (select min(pa.created_at) from public.payment_attempts pa where pa.booking_id = bk.id) as klik_pertama,
      (select count(*) from public.payment_attempts pa where pa.booking_id = bk.id) as jml_klik
    from public.booking bk
    where bk.created_at >= v_start and bk.created_at < v_end
  ),
  paid as (
    select *, extract(epoch from (paid_at - created_at)) / 60.0 as menit_bayar,
           extract(epoch from (paid_at - coalesce(klik_pertama, created_at))) / 60.0 as menit_dari_klik
    from b where paid_at is not null
  ),
  fe as (
    select * from public.funnel_event where created_at >= v_start and created_at < v_end
  )
  select jsonb_build_object(
    'ringkas', jsonb_build_object(
      'dibuat', (select count(*) from b),
      'dibuat_web', (select count(*) from b where sumber = 'web'),
      'dibuat_sales', (select count(*) from b where sumber <> 'web'),
      'lunas', (select count(*) from b where paid_at is not null),
      'menunggu', (select count(*) from b where st = 'menunggu_bayar'),
      'kedaluwarsa', (select count(*) from b where st = 'kedaluwarsa'),
      'batal', (select count(*) from b where st = 'batal'),
      'tidak_klik_bayar', (select count(*) from b where jml_klik = 0 and paid_at is null and st <> 'menunggu_bayar'),
      'klik_tidak_bayar', (select count(*) from b where jml_klik > 0 and paid_at is null and st <> 'menunggu_bayar'),
      'bayar_ulang', (select count(*) from b where jml_klik > 1),
      'pendapatan', (select coalesce(sum(total), 0) from b where paid_at is not null),
      'rata_menit_bayar', (select round(avg(menit_bayar)::numeric, 1) from paid),
      'median_menit_bayar', (select round((percentile_cont(0.5) within group (order by menit_bayar))::numeric, 1) from paid),
      'tercepat_menit', (select round(min(menit_bayar)::numeric, 1) from paid),
      'terlama_menit', (select round(max(menit_bayar)::numeric, 1) from paid),
      'median_menit_dari_klik', (select round((percentile_cont(0.5) within group (order by menit_dari_klik))::numeric, 1) from paid)),
    'sebaran_waktu', (select jsonb_build_object(
        'kurang_5', count(*) filter (where menit_bayar < 5),
        '5_10', count(*) filter (where menit_bayar >= 5 and menit_bayar < 10),
        '10_15', count(*) filter (where menit_bayar >= 10 and menit_bayar < 15),
        'lebih_15', count(*) filter (where menit_bayar >= 15)) from paid),
    'metode', (select coalesce(jsonb_object_agg(m, n), '{}'::jsonb) from (
        select coalesce(private.metode_bayar(pg_payload), 'Tidak diketahui') m, count(*) n from paid group by 1) s),
    'funnel', jsonb_build_object(
      'checkout_dibuka', (select count(distinct sesi) from fe where jenis = 'checkout_dibuka'),
      'isi_data', (select count(distinct sesi) from fe where jenis = 'isi_data'),
      'booking_dibuat', (select count(*) from b where sumber = 'web'),
      'klik_bayar', (select count(*) from b where sumber = 'web' and jml_klik > 0),
      'lunas', (select count(*) from b where sumber = 'web' and paid_at is not null)),
    'perilaku', jsonb_build_object(
      'buka_halaman_status', (select count(*) from fe where jenis = 'status_dibuka'),
      'cek_status', (select count(*) from fe where jenis = 'cek_status'),
      'timer_habis', (select count(*) from fe where jenis = 'timer_habis'),
      'bukti_diunduh', (select count(*) from fe where jenis = 'bukti_diunduh'),
      'bayar_ulang', (select count(*) from fe where jenis = 'bayar_ulang')),
    'harian', (select coalesce(jsonb_agg(jsonb_build_object('tanggal', d, 'dibuat', dibuat, 'lunas', lunas) order by d), '[]'::jsonb) from (
        select (created_at at time zone 'Asia/Jakarta')::date d, count(*) dibuat, count(*) filter (where paid_at is not null) lunas
        from b group by 1) s),
    'terbaru', (select coalesce(jsonb_agg(x order by x->>'dibuat_pada' desc), '[]'::jsonb) from (
        select jsonb_build_object('kode', kode, 'nama', nama, 'sumber', sumber, 'status', st, 'total', total,
          'dibuat_pada', created_at, 'klik', jml_klik, 'dibayar_pada', paid_at,
          'menit_bayar', case when paid_at is not null then round((extract(epoch from (paid_at - created_at)) / 60.0)::numeric, 1) end,
          'metode', private.metode_bayar(pg_payload)) x
        from b order by created_at desc limit 30) s)
  ) into v;
  return v;
end $function$;
revoke all on function public.laporan_pembayaran(date, date) from public, anon;
grant execute on function public.laporan_pembayaran(date, date) to authenticated;

-- admin Laporan listens for these (Realtime obeys the admin-only SELECT policies)
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'booking') then
    alter publication supabase_realtime add table public.booking;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'payment_attempts') then
    alter publication supabase_realtime add table public.payment_attempts;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'funnel_event') then
    alter publication supabase_realtime add table public.funnel_event;
  end if;
end $$;
