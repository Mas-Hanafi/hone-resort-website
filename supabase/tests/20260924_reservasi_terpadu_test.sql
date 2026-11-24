-- Self-verifying smoke test for 20260924_reservasi_terpadu.sql.
-- Run as a single script (superuser / service_role) after the migration is applied.
-- Everything happens inside one transaction and is rolled back at the end — no data is left behind.

begin;

-- ============================================================================
-- Fixtures
-- ============================================================================

insert into private.booking_config (id, secret_hash)
values (1, encode(extensions.digest('test-secret', 'sha256'), 'hex'))
on conflict (id) do update set secret_hash = excluded.secret_hash;

-- dlx_gv is deliberately not a round number (987.650) so the rule_set rounding test is meaningful.
insert into public.pricelist_periods (label, tag, min_check_in, max_check_in, sup_sv, sup_gv, dlx_sv, dlx_gv, suite_sv, check_in_dates, sort_order, active)
values (
  'Test Period', 'Test',
  '2027-01-10', '2027-01-26',
  '1.000.000', '1.000.000', '1.000.000', '987.650', '1.000.000',
  (select array_agg(to_char(d, 'YYYY-MM-DD')) from generate_series('2027-01-10'::date, '2027-01-26'::date, interval '1 day') d),
  999, true
);

insert into public.inventori (tanggal, room_code, allotment)
select d::date, 'sup_sv', 2
from generate_series('2027-01-10'::date, '2027-01-19'::date, interval '1 day') d
on conflict (tanggal, room_code) do update set allotment = excluded.allotment;

-- tight allotment on a separate date/room for the oversell test
insert into public.inventori (tanggal, room_code, allotment)
values ('2027-01-25', 'dlx_sv', 1)
on conflict (tanggal, room_code) do update set allotment = excluded.allotment;

-- fake admins: private.admins.user_id references auth.users, so the FK is bypassed just for this insert.
do $$
declare
  v_owner uuid := gen_random_uuid();
  v_sales uuid := gen_random_uuid();
  v_fo uuid := gen_random_uuid();
begin
  set local session_replication_role = replica;
  insert into private.admins (user_id, note, peran) values
    (v_owner, 'test-owner', 'owner'),
    (v_sales, 'test-sales', 'sales'),
    (v_fo, 'test-front-office', 'front_office');
  set local session_replication_role = origin;

  perform set_config('test.owner_id', v_owner::text, false);
  perform set_config('test.sales_id', v_sales::text, false);
  perform set_config('test.fo_id', v_fo::text, false);
end $$;

-- ============================================================================
-- 1. private.night_price
-- ============================================================================

do $$
declare
  v_price bigint;
  v_rule_id uuid;
begin
  -- period price, no override, no rule_set
  v_price := private.night_price('sup_sv', '2027-01-10');
  assert v_price = 1000000, format('expected period price 1000000, got %s', v_price);
  raise notice 'PASS: night_price returns period price when no override/rule_set';

  -- rule_set percent, rounded to booking_setting.pembulatan (dlx_gv base = 987650)
  insert into public.rule_set (nama, warna, persen) values ('Test Naik 10pct', 3, 10) returning id into v_rule_id;
  insert into public.inventori (tanggal, room_code, rule_set_id) values ('2027-01-13', 'dlx_gv', v_rule_id)
    on conflict (tanggal, room_code) do update set rule_set_id = excluded.rule_set_id;
  v_price := private.night_price('dlx_gv', '2027-01-13');
  assert v_price = 1086000, format('expected rounded rule_set price 1086000, got %s', v_price);
  raise notice 'PASS: night_price applies rule_set percent and rounds to pembulatan';

  -- manual harga override wins even when a rule_set is also attached to the same cell
  insert into public.inventori (tanggal, room_code, harga, rule_set_id) values ('2027-01-14', 'dlx_sv', 555000, v_rule_id)
    on conflict (tanggal, room_code) do update set harga = excluded.harga, rule_set_id = excluded.rule_set_id;
  v_price := private.night_price('dlx_sv', '2027-01-14');
  assert v_price = 555000, format('expected manual override 555000, got %s', v_price);
  raise notice 'PASS: night_price manual override wins over rule_set and period price';
end $$;

-- ============================================================================
-- 2. private.check_stay
-- ============================================================================

do $$
declare
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_rule_min uuid;
begin
  -- MIN_MALAM from rule_set (min_malam 2), 1-night stay requested
  insert into public.rule_set (nama, warna, min_malam) values ('Test Min2', 2, 2) returning id into v_rule_min;
  insert into public.inventori (tanggal, room_code, rule_set_id) values (v_today + 10, 'sup_sv', v_rule_min)
    on conflict (tanggal, room_code) do update set rule_set_id = excluded.rule_set_id;
  begin
    perform private.check_stay('sup_sv', v_today + 10, v_today + 11, 'web');
    raise exception 'expected MIN_MALAM';
  exception when others then
    if sqlerrm <> 'MIN_MALAM' then raise; end if;
  end;
  raise notice 'PASS: check_stay MIN_MALAM from rule_set';

  -- CHECKIN_DILARANG via cell tutup_checkin
  insert into public.inventori (tanggal, room_code, tutup_checkin) values (v_today + 20, 'sup_sv', true)
    on conflict (tanggal, room_code) do update set tutup_checkin = true;
  begin
    perform private.check_stay('sup_sv', v_today + 20, v_today + 22, 'web');
    raise exception 'expected CHECKIN_DILARANG';
  exception when others then
    if sqlerrm <> 'CHECKIN_DILARANG' then raise; end if;
  end;
  raise notice 'PASS: check_stay CHECKIN_DILARANG from cell tutup_checkin';

  -- TERLALU_DEKAT for web, but allowed (skipped) for sales
  update public.booking_setting set advance_notice_hari = 2 where id = 1;
  begin
    perform private.check_stay('sup_sv', v_today + 1, v_today + 4, 'web');
    raise exception 'expected TERLALU_DEKAT';
  exception when others then
    if sqlerrm <> 'TERLALU_DEKAT' then raise; end if;
  end;
  perform private.check_stay('sup_sv', v_today + 1, v_today + 4, 'sales'); -- must not raise
  update public.booking_setting set advance_notice_hari = 0 where id = 1;
  raise notice 'PASS: check_stay TERLALU_DEKAT applies to web only';

  -- DI_LUAR_JENDELA for web, but allowed (skipped) for sales
  begin
    perform private.check_stay('sup_sv', v_today + 400, v_today + 403, 'web');
    raise exception 'expected DI_LUAR_JENDELA';
  exception when others then
    if sqlerrm <> 'DI_LUAR_JENDELA' then raise; end if;
  end;
  perform private.check_stay('sup_sv', v_today + 400, v_today + 403, 'sales'); -- must not raise
  raise notice 'PASS: check_stay DI_LUAR_JENDELA applies to web only';
end $$;

-- ============================================================================
-- 3. booking_create holds, TERLALU_BANYAK_HOLD, STOK_HABIS
-- ============================================================================

do $$
declare
  v_wa text := '081234500011';
  v_r1 jsonb; v_r2 jsonb;
begin
  v_r1 := public.booking_create('test-secret', jsonb_build_object(
    'room_code', 'sup_sv', 'checkin', '2027-01-10', 'checkout', '2027-01-11', 'jumlah_kamar', 1,
    'nama', 'Tamu Satu', 'wa', v_wa));
  assert (v_r1->>'status') = 'menunggu_bayar', 'hold 1 should be menunggu_bayar';

  v_r2 := public.booking_create('test-secret', jsonb_build_object(
    'room_code', 'sup_sv', 'checkin', '2027-01-12', 'checkout', '2027-01-13', 'jumlah_kamar', 1,
    'nama', 'Tamu Satu', 'wa', v_wa));
  assert (v_r2->>'status') = 'menunggu_bayar', 'hold 2 should be menunggu_bayar';
  raise notice 'PASS: booking_create creates a menunggu_bayar hold';

  begin
    perform public.booking_create('test-secret', jsonb_build_object(
      'room_code', 'sup_sv', 'checkin', '2027-01-14', 'checkout', '2027-01-15', 'jumlah_kamar', 1,
      'nama', 'Tamu Satu', 'wa', v_wa));
    raise exception 'expected TERLALU_BANYAK_HOLD';
  exception when others then
    if sqlerrm <> 'TERLALU_BANYAK_HOLD' then raise; end if;
  end;
  raise notice 'PASS: booking_create TERLALU_BANYAK_HOLD after 2 active web holds for the same WA';

  -- dlx_sv has allotment 1 on 2027-01-25; asking for 2 rooms must oversell-reject
  begin
    perform public.booking_create('test-secret', jsonb_build_object(
      'room_code', 'dlx_sv', 'checkin', '2027-01-25', 'checkout', '2027-01-26', 'jumlah_kamar', 2,
      'nama', 'Tamu Dua', 'wa', '089900001111'));
    raise exception 'expected STOK_HABIS';
  exception when others then
    if sqlerrm <> 'STOK_HABIS' then raise; end if;
  end;
  raise notice 'PASS: booking_create STOK_HABIS on oversell';
end $$;

-- ============================================================================
-- 4. payment_next_invoice, payment_attempt_create, payment_settle
-- ============================================================================

do $$
declare
  v_res jsonb; v_kode text; v_total bigint;
  v_inv1 text; v_inv2 text; v_attempt uuid;
  v_settle jsonb; v_settle2 jsonb;
begin
  v_res := public.booking_create('test-secret', jsonb_build_object(
    'room_code', 'sup_sv', 'checkin', '2027-01-16', 'checkout', '2027-01-17', 'jumlah_kamar', 1,
    'nama', 'Tamu Bayar', 'wa', '087700002222'));
  v_kode := v_res->>'kode';
  v_total := (v_res->>'total')::bigint;

  v_inv1 := public.payment_next_invoice('test-secret', v_kode);
  assert v_inv1 ~ '^[A-Za-z0-9]{1,30}$', format('invoice must be alphanumeric <=30 chars, got %s', v_inv1);
  assert v_inv1 like '%P01', format('first invoice should end in P01, got %s', v_inv1);

  begin
    perform public.payment_attempt_create('test-secret', v_kode, 'mock', v_inv1, null, null, null, v_total - 1, now() + interval '15 minutes');
    raise exception 'expected NOMINAL_TIDAK_COCOK';
  exception when others then
    if sqlerrm <> 'NOMINAL_TIDAK_COCOK' then raise; end if;
  end;

  v_attempt := public.payment_attempt_create('test-secret', v_kode, 'mock', v_inv1, null, null, null, v_total, now() + interval '15 minutes');
  assert v_attempt is not null, 'payment_attempt_create should return an attempt id';

  v_inv2 := public.payment_next_invoice('test-secret', v_kode);
  assert v_inv2 <> v_inv1 and v_inv2 like '%P02', format('second invoice should increment to P02, got %s', v_inv2);
  raise notice 'PASS: payment_next_invoice format + increment, payment_attempt_create rejects wrong amount';

  v_settle := public.payment_settle('test-secret', v_inv1, 'SUCCESS', v_total, '{}'::jsonb);
  assert (v_settle->>'baru_lunas')::boolean = true, 'first SUCCESS settle should report baru_lunas = true';
  assert (v_settle->'booking'->>'status') = 'lunas', 'booking should be lunas after settle';

  v_settle2 := public.payment_settle('test-secret', v_inv1, 'SUCCESS', v_total, '{}'::jsonb);
  assert (v_settle2->>'baru_lunas')::boolean = false, 'second SUCCESS settle should be idempotent (baru_lunas = false)';
  raise notice 'PASS: payment_settle SUCCESS sets lunas with baru_lunas true, then idempotent';

  begin
    perform public.payment_settle('wrong-secret', v_inv1, 'SUCCESS', v_total, '{}'::jsonb);
    raise exception 'expected UNAUTHORIZED';
  exception when others then
    if sqlerrm <> 'UNAUTHORIZED' then raise; end if;
  end;
  raise notice 'PASS: payment_settle rejects a wrong secret with UNAUTHORIZED';

  perform set_config('test.kode_pay', v_kode, false);
end $$;

-- ============================================================================
-- 5. admin_calendar_save
-- ============================================================================

do $$
declare
  v_before int; v_after int; v_res jsonb; v_days int[];
begin
  select allotment into v_before from public.inventori where tanggal = '2027-01-10' and room_code = 'sup_sv';

  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('test.owner_id'), 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.admin_calendar_save(jsonb_build_object(
      'rooms', jsonb_build_array('sup_sv'), 'from', '2027-01-10', 'to', '2027-01-10',
      'days', '[]'::jsonb, 'set', jsonb_build_object('allotment', 0)));
    raise exception 'expected JATAH_KURANG';
  exception when others then
    if sqlerrm <> 'JATAH_KURANG' then raise; end if;
  end;
  reset role;

  select allotment into v_after from public.inventori where tanggal = '2027-01-10' and room_code = 'sup_sv';
  assert v_after = v_before, 'JATAH_KURANG must leave allotment unchanged';
  raise notice 'PASS: admin_calendar_save JATAH_KURANG when allotment would drop below terpakai, nothing written';

  -- sales role is not allowed to save the calendar
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('test.sales_id'), 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.admin_calendar_save(jsonb_build_object(
      'rooms', jsonb_build_array('sup_sv'), 'from', '2027-01-10', 'to', '2027-01-10',
      'days', '[]'::jsonb, 'set', jsonb_build_object('catatan', 'x')));
    raise exception 'expected UNAUTHORIZED';
  exception when others then
    if sqlerrm <> 'UNAUTHORIZED' then raise; end if;
  end;
  reset role;
  raise notice 'PASS: admin_calendar_save UNAUTHORIZED for sales role';

  -- valid save with a days filter: 7-day span, one weekday selected, only that date changes
  v_days := array[extract(dow from date '2027-01-10')::int];
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('test.owner_id'), 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_res := public.admin_calendar_save(jsonb_build_object(
    'rooms', jsonb_build_array('sup_sv'), 'from', '2027-01-10', 'to', '2027-01-16',
    'days', to_jsonb(v_days), 'set', jsonb_build_object('catatan', 'filtered')));
  reset role;

  assert (v_res->>'sel_diubah')::int = 1, format('days filter over a 7-day span should touch exactly 1 row, got %s', v_res->>'sel_diubah');
  perform 1 from public.inventori where tanggal = '2027-01-10' and room_code = 'sup_sv' and catatan = 'filtered';
  if not found then raise exception 'expected 2027-01-10 to have catatan = filtered'; end if;
  perform 1 from public.inventori where tanggal between '2027-01-11' and '2027-01-16' and room_code = 'sup_sv' and catatan = 'filtered';
  if found then raise exception 'days filter leaked into a non-matching weekday'; end if;
  raise notice 'PASS: admin_calendar_save days filter changes only the matching weekday';
end $$;

-- ============================================================================
-- 6. admin_checkin
-- ============================================================================

do $$
declare
  v_room_id uuid;
  v_res jsonb;
begin
  insert into public.rooms (nomor, room_code, aktif) values ('T-101', 'sup_sv', true) returning id into v_room_id;

  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('test.fo_id'), 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    perform public.admin_checkin(current_setting('test.kode_pay'), v_room_id, false, 'uang', false, null);
    raise exception 'expected ID_BELUM_DIVERIFIKASI';
  exception when others then
    if sqlerrm <> 'ID_BELUM_DIVERIFIKASI' then raise; end if;
  end;

  begin
    perform public.admin_checkin(current_setting('test.kode_pay'), v_room_id, true, null, false, null);
    raise exception 'expected JAMINAN_WAJIB';
  exception when others then
    if sqlerrm <> 'JAMINAN_WAJIB' then raise; end if;
  end;

  v_res := public.admin_checkin(current_setting('test.kode_pay'), v_room_id, true, 'uang', false, 'ok');
  reset role;

  assert (v_res->>'status') = 'checked_in', 'admin_checkin should set status to checked_in';
  assert (select deposit from public.booking where kode = current_setting('test.kode_pay')) = 100000,
    'deposit uang should take booking_setting.deposit_nominal (100000)';
  assert (select deposit_jenis from public.booking where kode = current_setting('test.kode_pay')) = 'uang', 'deposit_jenis stored';
  raise notice 'PASS: admin_checkin requires id_verified and succeeds with a matching, active room';
end $$;

-- ============================================================================
-- 7. anon has no direct access to booking / payment_attempts / pre_checkin
-- ============================================================================

set local role anon;
do $$
declare v_cnt int;
begin
  begin
    select count(*) into v_cnt from public.booking;
    assert v_cnt = 0, 'anon should not see any booking rows';
    raise notice 'PASS: anon sees 0 booking rows';
  exception when insufficient_privilege then
    raise notice 'PASS: anon blocked from booking table by privilege';
  end;

  begin
    select count(*) into v_cnt from public.payment_attempts;
    assert v_cnt = 0, 'anon should not see any payment_attempts rows';
    raise notice 'PASS: anon sees 0 payment_attempts rows';
  exception when insufficient_privilege then
    raise notice 'PASS: anon blocked from payment_attempts table by privilege';
  end;

  begin
    select count(*) into v_cnt from public.pre_checkin;
    assert v_cnt = 0, 'anon should not see any pre_checkin rows';
    raise notice 'PASS: anon sees 0 pre_checkin rows';
  exception when insufficient_privilege then
    raise notice 'PASS: anon blocked from pre_checkin table by privilege';
  end;
end $$;
reset role;

rollback;
