-- Run after 20260930_operasional on STAGING. Everything rolls back.
do $$
declare
  owner_id uuid := (select user_id from private.admins where peran = 'owner' limit 1);
  sales_id uuid := (select user_id from private.admins where peran = 'sales' limit 1);
  d date := (now() at time zone 'Asia/Jakarta')::date + 10;
  rid uuid := (select id from public.rooms where room_code = 'dlx_sv' and aktif order by nomor limit 1);
  n0 int; n1 int; e int; ok boolean;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  -- board: occupied room takes one allotment, kosong releases it
  n0 := private.rooms_used('dlx_sv', d);
  perform public.room_status_set(rid, d, 'terisi', 2, 'walk-in tes');
  assert private.rooms_used('dlx_sv', d) = n0 + 1, 'terisi counts';
  assert private.rooms_used('dlx_sv', d + 1) = private.rooms_used('dlx_sv', d + 1), 'second night';
  assert (select count(*) from public.room_status where room_id = rid and tanggal in (d, d + 1)) = 2, '2 nights';
  perform public.room_status_set(rid, d, 'no_show');
  assert private.rooms_used('dlx_sv', d) = n0, 'no_show releases';
  perform public.room_status_set(rid, d, 'kosong', 2);
  assert not exists (select 1 from public.room_status where room_id = rid), 'kosong clears';
  assert (select count(*) from public.booking_events where jenis = 'papan_kamar' and created_at > now() - interval '1 minute') = 3, 'board logged';

  -- add-on lead time + daily quota
  begin perform public.booking_quote('dlx_sv', (now() at time zone 'Asia/Jakarta')::date + 1, (now() at time zone 'Asia/Jakarta')::date + 2, 1, '[{"kode":"romantic_dinner","qty":1}]'); assert false, 'h2';
  exception when others then assert sqlerrm = 'ADDON_H2', sqlerrm; end;
  perform public.booking_quote('dlx_sv', d, d + 1, 1, '[{"kode":"romantic_dinner","qty":2}]'); -- 2 of 2 ok
  begin perform public.booking_quote('dlx_sv', d, d + 1, 1, '[{"kode":"bajaj_fun_trip","qty":2}]'); assert false, 'quota';
  exception when others then assert sqlerrm = 'ADDON_HABIS', sqlerrm; end;
  assert (public.addon_sisa(d) ->> 'rooftop_bbq')::int = 4, 'sisa bbq';

  -- audit trail on content
  update public.kamar set deskripsi_singkat = deskripsi_singkat || ' ' where nama = 'Deluxe Sea View';
  assert exists (select 1 from public.booking_events where jenis = 'perubahan' and data->>'tabel' = 'kamar' and created_at > now() - interval '1 minute'), 'audit';

  -- sales: no website-content writes
  perform set_config('request.jwt.claims', json_build_object('sub', sales_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.galeri set urutan = urutan where true;
  get diagnostics e = row_count;
  assert e = 0, 'sales updated galeri rows: ' || e;
  reset role;
  raise notice 'ALL OK';
end $$;
