-- Tracking additions (owner 28 Sep 2026): why a booking could not be sent, refused voucher codes,
-- WhatsApp chosen instead of paying online, and where guests entered the booking page from.

create or replace function public.track_event(p_secret text, p_sesi text, p_jenis text, p_kode text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.check_secret(p_secret);
  if p_jenis not in ('pricelist_dibuka', 'tanggal_dipilih', 'lanjut_pesan', 'kamar_penuh', 'upsell_klik',
                     'checkout_dibuka', 'isi_data', 'booking_dibuat', 'gagal_pesan', 'voucher_gagal', 'pilih_wa',
                     'status_dibuka', 'cek_status', 'timer_habis', 'bukti_diunduh', 'bayar_ulang')
     or coalesce(length(p_sesi), 0) not between 8 and 64 then
    return;
  end if;
  insert into public.funnel_event (sesi, jenis, kode, data)
  values (p_sesi, p_jenis, case when p_kode ~ '^HON-[0-9A-F]{10}$' then p_kode end,
          case when length(coalesce(p_data, '{}'::jsonb)::text) <= 1000 then coalesce(p_data, '{}'::jsonb) else '{}'::jsonb end);
end $function$;

create or replace function public.laporan_perilaku(p_from date, p_to date)
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
      bk.paid_at is not null as bayar,
      (bk.checkout - bk.checkin) as malam,
      (bk.checkin - (bk.created_at at time zone 'Asia/Jakarta')::date) as lead,
      (select count(*) from public.payment_attempts pa where pa.booking_id = bk.id) as klik,
      coalesce(private.metode_bayar(bk.pg_payload),
               (select private.metode_bayar(pa.raw) from public.payment_attempts pa
                 where pa.booking_id = bk.id and (pa.raw ? 'channel' or pa.raw ? 'service')
                 order by pa.created_at desc limit 1)) as metode,
      (select coalesce(sum((n->>'harga')::numeric), 0) from jsonb_array_elements(coalesce(bk.rincian, '[]'::jsonb)) n) * bk.jumlah_kamar as kamar_rp
    from public.booking bk
    where bk.created_at >= v_start and bk.created_at < v_end
  ),
  paid as (select * from b where bayar),
  fe as (select * from public.funnel_event where created_at >= v_start and created_at < v_end),
  penuh as (select distinct on (sesi, data->>'kamar', data->>'checkin') * from fe where jenis = 'kamar_penuh')
  select jsonb_build_object(

    -- demand we could not serve: guests who hit a full / short room (one per visit, room and date)
    'tak_terlayani', jsonb_build_object(
      'total', (select count(*) from penuh),
      'per_kamar', (select coalesce(jsonb_agg(jsonb_build_object('kamar', k, 'n', n) order by n desc), '[]'::jsonb)
                    from (select data->>'kamar' k, count(*) n from penuh group by 1) s),
      'per_tanggal', (select coalesce(jsonb_agg(jsonb_build_object('tanggal', t, 'n', n, 'kamar', k) order by n desc, t), '[]'::jsonb)
                      from (select data->>'checkin' t, count(*) n, mode() within group (order by data->>'kamar') k
                            from penuh where data->>'checkin' is not null group by 1 order by 2 desc, 1 limit 10) s),
      'per_tempat', (select coalesce(jsonb_object_agg(t, n), '{}'::jsonb)
                     from (select coalesce(data->>'tempat', '-') t, count(*) n from penuh group by 1) s)),

    -- pricing patterns from paid bookings
    'harga', jsonb_build_object(
      'booking_lunas', (select count(*) from paid),
      'room_night', (select coalesce(sum(malam * jumlah_kamar), 0) from paid),
      'adr', (select round(sum(kamar_rp) / nullif(sum(malam * jumlah_kamar), 0)) from paid),
      'rata_lead_hari', (select round(avg(lead)::numeric, 1) from paid),
      'rata_malam', (select round(avg(malam)::numeric, 1) from paid),
      'lead', (select jsonb_build_object(
          'h0_1', count(*) filter (where lead <= 1),
          'h2_7', count(*) filter (where lead between 2 and 7),
          'h8_30', count(*) filter (where lead between 8 and 30),
          'h31_90', count(*) filter (where lead between 31 and 90),
          'h90', count(*) filter (where lead > 90)) from paid),
      'malam', (select jsonb_build_object(
          'm1', count(*) filter (where malam = 1), 'm2', count(*) filter (where malam = 2),
          'm3', count(*) filter (where malam = 3), 'm4', count(*) filter (where malam >= 4)) from paid),
      'hari_checkin', (select coalesce(jsonb_agg(n order by d), '[]'::jsonb)
                       from (select d, (select count(*) from paid where extract(dow from checkin) = d) n from generate_series(0, 6) d) s),
      'per_kamar', (select coalesce(jsonb_agg(jsonb_build_object('kamar', room_code, 'booking', n, 'room_night', rn, 'pendapatan', rp,
                                              'adr', round(kr / nullif(rn, 0))) order by rp desc), '[]'::jsonb)
                    from (select room_code, count(*) n, sum(malam * jumlah_kamar) rn, sum(total) rp, sum(kamar_rp) kr from paid group by 1) s)),

    -- full website funnel (visits = browser tabs)
    'corong', jsonb_build_object(
      'pricelist_dibuka', (select count(distinct sesi) from fe where jenis = 'pricelist_dibuka'),
      'tanggal_dipilih', (select count(distinct sesi) from fe where jenis = 'tanggal_dipilih'),
      'lanjut_pesan', (select count(distinct sesi) from fe where jenis = 'lanjut_pesan'),
      'checkout_dibuka', (select count(distinct sesi) from fe where jenis = 'checkout_dibuka'),
      'isi_data', (select count(distinct sesi) from fe where jenis = 'isi_data'),
      'booking_dibuat', (select count(*) from b where sumber = 'web'),
      'klik_bayar', (select count(*) from b where sumber = 'web' and klik > 0),
      'lunas', (select count(*) from b where sumber = 'web' and bayar)),

    -- which payment methods guests pick, finish, or abandon (method known once a channel was chosen at DOKU)
    'metode', (select coalesce(jsonb_agg(jsonb_build_object('metode', m, 'dipilih', n, 'lunas', l, 'tidak_bayar', n - l - w,
                                         'median_menit', med) order by n desc), '[]'::jsonb)
               from (select metode m, count(*) n, count(*) filter (where bayar) l,
                            count(*) filter (where st = 'menunggu_bayar') w,
                            round((percentile_cont(0.5) within group (order by extract(epoch from (paid_at - created_at)) / 60.0))::numeric, 1) med
                     from b where metode is not null group by 1) s),
    'metode_belum_dipilih', (select count(*) from b where metode is null and klik > 0 and not bayar and st <> 'menunggu_bayar'),

    -- vouchers and discounts
    'promo', jsonb_build_object(
      'voucher', (select coalesce(jsonb_agg(jsonb_build_object('kode', voucher_kode, 'dipakai', n, 'lunas', l, 'pendapatan', rp, 'diskon', dk) order by n desc), '[]'::jsonb)
                  from (select voucher_kode, count(*) n, count(*) filter (where bayar) l,
                               coalesce(sum(total) filter (where bayar), 0) rp, coalesce(sum(diskon) filter (where bayar), 0) dk
                        from b where voucher_kode is not null group by 1) s),
      'booking_diskon', (select count(*) from paid where coalesce(diskon, 0) > 0),
      'total_diskon', (select coalesce(sum(diskon), 0) from paid),
      'pendapatan_dengan_diskon', (select coalesce(sum(total), 0) from paid where coalesce(diskon, 0) > 0)),

    -- sales team links
    'sales', (select coalesce(jsonb_agg(jsonb_build_object('oleh', o, 'link', n, 'lunas', l, 'pendapatan', rp, 'rata_diskon_persen', dp) order by rp desc), '[]'::jsonb)
              from (select coalesce(dibuat_oleh, '-') o, count(*) n, count(*) filter (where bayar) l,
                           coalesce(sum(total) filter (where bayar), 0) rp,
                           round(avg(100.0 * coalesce(diskon, 0) / nullif(total - coalesce(pajak, 0) + coalesce(diskon, 0), 0)) filter (where bayar), 1) dp
                    from b where sumber <> 'web' group by 1) s),

    -- repeat guests: same WhatsApp number with more than one paid booking (all time)
    'loyal', (with g as (
                select private.wa_key(wa) k, count(*) n, max(nama) nama, sum(total) rp, max(created_at) terakhir
                from public.booking where paid_at is not null group by 1)
              select jsonb_build_object(
                'tamu_lunas', (select count(*) from g),
                'tamu_berulang', (select count(*) from g where n > 1),
                'booking_dari_tamu_berulang', (select count(*) from paid p join g on g.k = private.wa_key(p.wa) where g.n > 1),
                'teratas', (select coalesce(jsonb_agg(jsonb_build_object('nama', nama, 'booking', n, 'total', rp, 'terakhir', terakhir) order by n desc, rp desc), '[]'::jsonb)
                            from (select * from g where n > 1 order by n desc, rp desc limit 10) t))),

    -- upsell bubble: shown when the room was full, clicked, then booked the suggested room
    'upsell', jsonb_build_object(
      'tampil', (select count(*) from penuh),
      'klik', (select count(*) from fe where jenis = 'upsell_klik'),
      'jadi_booking', (select count(distinct u.sesi) from fe u join fe bd on bd.sesi = u.sesi and bd.jenis = 'booking_dibuat'
                         and bd.created_at > u.created_at and bd.data->>'kamar' = u.data->>'ke'
                       where u.jenis = 'upsell_klik')),

    -- why a guest could not send the booking (form checks + server answers), one row per reason
    'gagal', (select coalesce(jsonb_agg(jsonb_build_object('alasan', a, 'tahap', t, 'n', n, 'tamu', s) order by n desc), '[]'::jsonb)
              from (select coalesce(data->>'alasan', '-') a, coalesce(data->>'tahap', '-') t, count(*) n, count(distinct sesi) s
                    from fe where jenis = 'gagal_pesan' group by 1, 2) x),

    -- voucher codes guests typed that were refused
    'voucher_gagal', (select coalesce(jsonb_agg(jsonb_build_object('voucher', k, 'alasan', a, 'n', n) order by n desc), '[]'::jsonb)
                      from (select upper(coalesce(data->>'voucher', '-')) k, coalesce(data->>'alasan', '-') a, count(*) n
                            from fe where jenis = 'voucher_gagal' group by 1, 2 order by 3 desc limit 20) x),

    -- WhatsApp chosen instead of paying online (visits)
    'wa', jsonb_build_object(
      'checkout', (select count(distinct sesi) from fe where jenis = 'pilih_wa' and data->>'tempat' = 'checkout'),
      'status', (select count(distinct sesi) from fe where jenis = 'pilih_wa' and data->>'tempat' = 'status'),
      'tanpa_booking', (select count(distinct w.sesi) from fe w
                        where w.jenis = 'pilih_wa' and w.data->>'tempat' = 'checkout'
                          and not exists (select 1 from fe bd where bd.sesi = w.sesi and bd.jenis = 'booking_dibuat'))),

    -- where guests entered the booking page from, and how many of those visits became (paid) bookings
    'asal', (select coalesce(jsonb_agg(jsonb_build_object('asal', a, 'buka', n, 'booking', bk, 'lunas', l) order by n desc), '[]'::jsonb)
             from (select coalesce(o.data->>'asal', 'langsung') a, count(distinct o.sesi) n,
                          count(distinct bd.kode) bk, count(distinct bd.kode) filter (where pb.bayar) l
                   from fe o
                   left join fe bd on bd.sesi = o.sesi and bd.jenis = 'booking_dibuat' and bd.kode is not null
                   left join b pb on pb.kode = bd.kode
                   where o.jenis = 'checkout_dibuka' group by 1) x)
  ) into v;
  return v;
end $function$;
revoke all on function public.laporan_perilaku(date, date) from public, anon;
grant execute on function public.laporan_perilaku(date, date) to authenticated;
