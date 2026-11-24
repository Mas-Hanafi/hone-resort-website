-- Run after 20260929c_tipe_kamar_dinamis on STAGING. Everything rolls back.
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', (select user_id from private.admins where peran = 'owner' limit 1), 'role', 'authenticated')::text, true);

do $$
declare r jsonb; n int; wd date := '2026-11-04'; we date := '2026-11-07'; -- Wed, Sat (inside the 4-month web window)
begin
  -- original 30 rooms still match the units
  select sum(jumlah_unit) into n from public.room_type; assert n = 30, 'units total ' || n;

  -- new type, hidden from the website, 2 room numbers
  r := public.room_type_simpan('{"room_code":"tes_villa","nama":"Tes Villa","harga_weekday":2000000,"harga_weekend":2600000,"tampil_web":false}');
  assert (r->>'jumlah_unit')::int = 0;
  insert into public.rooms (nomor, room_code) values ('T1', 'tes_villa'), ('T2', 'tes_villa');
  select jumlah_unit into n from public.room_type where room_code = 'tes_villa'; assert n = 2, 'units ' || n;
  select jatah_default into n from public.room_type where room_code = 'tes_villa'; assert n = 2, 'jatah ' || n;
  assert exists (select 1 from public.kamar where nama = 'Tes Villa' and not is_active), 'kamar row';

  -- price: weekday / weekend from the type
  assert private.night_price('tes_villa', wd) = 2000000, 'weekday price';
  assert private.night_price('tes_villa', we) = 2600000, 'weekend price';
  -- original types still priced from the pricelist periods
  assert private.base_price('dlx_sv', '2026-10-05') = 1370000, 'legacy price';

  -- hidden: not in public availability / setting, but in the admin calendar
  assert not exists (select 1 from public.booking_availability(wd, wd + 1) where room_code = 'tes_villa'), 'hidden avail';
  assert not (public.booking_public_setting()->'kamar') @> '[{"kode":"tes_villa"}]', 'hidden setting';
  assert exists (select 1 from public.admin_calendar(wd, wd) where room_code = 'tes_villa' and sisa = 2), 'admin cal';

  -- web booking refused while hidden; sales can book; qty above units refused
  begin
    perform private.booking_insert(jsonb_build_object('room_code','tes_villa','checkin',wd,'checkout',wd+1,'nama','Tes','wa','081234567890','email','t@x.id'), 'web', 'web');
    assert false, 'web should fail';
  exception when others then assert sqlerrm = 'KAMAR_TIDAK_VALID', sqlerrm; end;
  begin
    perform private.booking_insert(jsonb_build_object('room_code','tes_villa','checkin',wd,'checkout',wd+1,'jumlah_kamar',3,'dewasa',6,'nama','Tes','wa','081234567890'), 'sales', 'tes');
    assert false, 'qty should fail';
  exception when others then assert sqlerrm = 'JUMLAH_KAMAR_TIDAK_VALID', sqlerrm; end;
  r := private.booking_insert(jsonb_build_object('room_code','tes_villa','checkin',wd,'checkout',wd+1,'jumlah_kamar',2,'dewasa',4,'nama','Tes','wa','081234567890'), 'sales', 'tes');
  assert r->>'room_nama' = 'Tes Villa', 'room_nama';
  assert exists (select 1 from public.admin_calendar(wd, wd) where room_code = 'tes_villa' and sisa = 0), 'sold out';

  -- show on web
  perform public.room_type_simpan('{"room_code":"tes_villa","nama":"Tes Villa","harga_weekday":2000000,"harga_weekend":2600000,"tampil_web":true}');
  assert (public.booking_public_setting()->'kamar') @> '[{"kode":"tes_villa","unit":2}]', 'shown setting';
  assert exists (select 1 from public.booking_availability(we, we + 1) where room_code = 'tes_villa' and sisa = 2 and harga = 2600000), 'shown avail';
  assert exists (select 1 from public.kamar where nama = 'Tes Villa' and is_active), 'kamar shown';

  -- deactivate one room number -> units 1, per-date allotment capped
  update public.rooms set aktif = false where nomor = 'T2';
  assert private.effective_allotment('tes_villa', we) = 1, 'cap after removing a room';

  -- guards
  begin perform public.room_type_simpan('{"room_code":"Bad Code","nama":"X","harga_weekday":1}'); assert false;
  exception when others then assert sqlerrm = 'KODE_TIDAK_VALID', sqlerrm; end;
  begin perform public.room_type_simpan('{"room_code":"dup","nama":"deluxe sea view","harga_weekday":1}'); assert false;
  exception when others then assert sqlerrm = 'NAMA_SUDAH_ADA', sqlerrm; end;
  begin perform public.room_type_simpan('{"room_code":"no_price","nama":"Tanpa Harga"}'); assert false;
  exception when others then assert sqlerrm = 'HARGA_WAJIB', sqlerrm; end;
  begin insert into public.inventori (tanggal, room_code) values (wd, 'tidak_ada'); assert false;
  exception when foreign_key_violation then null; end;
  raise notice 'ALL OK';
end $$;
rollback;
