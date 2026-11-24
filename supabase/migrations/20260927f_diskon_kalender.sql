-- 2026-09-27 owner request: Kalender is the sales home page for price, availability, discount,
-- voucher and open/close. Rule-set leaves the UI; a DIRECT DISCOUNT per date x room takes its place:
-- every guest sees the lower price (struck-through normal price on the website). Sales stay under
-- booking_setting.diskon_sales_maks, like every other discount. Vouchers are created from the
-- Kalender selection in the admin (voucher table, see 20260927_voucher.sql).

alter table public.inventori add column if not exists diskon_persen numeric(5,2)
  check (diskon_persen is null or (diskon_persen > 0 and diskon_persen < 100));

-- the undiscounted night price (manual > rule-set > period), i.e. the old night_price
create or replace function private.night_price_normal(p_room text, p_date date)
returns bigint
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_override bigint; v_rule_id uuid; v_persen int; v_base bigint; v_pembulatan int;
begin
  select i.harga, i.rule_set_id into v_override, v_rule_id
  from public.inventori i where i.room_code = p_room and i.tanggal = p_date;
  if v_override is not null then return v_override; end if;

  select nullif(regexp_replace(case p_room
           when 'sup_sv' then p.sup_sv when 'sup_gv' then p.sup_gv
           when 'dlx_sv' then p.dlx_sv when 'dlx_gv' then p.dlx_gv
           when 'suite_sv' then p.suite_sv end, '[^0-9]', '', 'g'), '')::bigint
    into v_base
  from public.pricelist_periods p
  where p.active and p_date::text = any(p.check_in_dates)
  order by p.sort_order
  limit 1;
  if v_base is null then return null; end if;

  if v_rule_id is not null then
    select rs.persen into v_persen from public.rule_set rs where rs.id = v_rule_id;
  end if;
  if v_persen is not null then
    select coalesce(bs.pembulatan, 1000) into v_pembulatan from public.booking_setting bs where bs.id = 1;
    return (round(v_base * (1 + v_persen / 100.0) / v_pembulatan) * v_pembulatan)::bigint;
  end if;
  return v_base;
end;
$function$;

-- the price guests pay for the night: normal price minus the date's direct discount (rounded)
create or replace function private.night_price(p_room text, p_date date)
returns bigint
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare v_normal bigint := private.night_price_normal(p_room, p_date); v_diskon numeric; v_bulat int;
begin
  if v_normal is null then return null; end if;
  select i.diskon_persen into v_diskon from public.inventori i where i.room_code = p_room and i.tanggal = p_date;
  if v_diskon is null then return v_normal; end if;
  select coalesce(bs.pembulatan, 1000) into v_bulat from public.booking_setting bs where bs.id = 1;
  return greatest((round(v_normal * (1 - v_diskon / 100) / greatest(v_bulat, 1)) * greatest(v_bulat, 1))::bigint, 0);
end;
$function$;

-- website availability also sends the normal price + discount, for the struck-through price
drop function if exists public.booking_availability(date, date);
create function public.booking_availability(p_from date, p_to date)
returns table(tanggal date, room_code text, sisa integer, harga bigint, harga_normal bigint, diskon_persen numeric,
              min_malam integer, tutup_checkin boolean, tutup_checkout boolean)
language sql
stable
security definer
set search_path to ''
as $function$
  select d::date, r.code,
         greatest(private.effective_allotment(r.code, d::date) - private.rooms_used(r.code, d::date), 0),
         private.night_price(r.code, d::date),
         private.night_price_normal(r.code, d::date),
         i.diskon_persen,
         coalesce(i.min_malam, rs.min_malam, bs.min_malam, 1),
         coalesce(i.tutup_checkin, false),
         coalesce(i.tutup_checkout, false)
  from generate_series(p_from, least(p_to, p_from + 400) - 1, interval '1 day') d
  cross join (values ('sup_sv'),('sup_gv'),('dlx_sv'),('dlx_gv'),('suite_sv')) r(code)
  left join public.inventori i on i.tanggal = d::date and i.room_code = r.code
  left join public.rule_set rs on rs.id = i.rule_set_id
  left join public.booking_setting bs on bs.id = 1
  order by 1, 2
$function$;
grant execute on function public.booking_availability(date, date) to anon, authenticated, service_role;

drop function if exists public.admin_calendar(date, date);
create function public.admin_calendar(p_from date, p_to date)
returns table(tanggal date, room_code text, harga_dasar bigint, harga_efektif bigint, sumber_harga text, harga_manual bigint,
              jatah integer, jatah_default integer, terpakai integer, sisa integer, stop_sell boolean,
              rule_set_id uuid, rule_set_nama text, rule_set_warna smallint, min_malam integer,
              tutup_checkin boolean, tutup_checkout boolean, catatan text, jumlah_booking integer,
              diskon_persen numeric, harga_normal bigint)
language plpgsql
stable
security definer
set search_path to ''
as $function$
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
              or (b.status = 'menunggu_bayar' and b.expires_at > now()))) as jumlah_booking,
    i.diskon_persen,
    private.night_price_normal(r.code, d::date) as harga_normal
  from generate_series(p_from, p_to, interval '1 day') d
  cross join (values ('sup_sv'),('sup_gv'),('dlx_sv'),('dlx_gv'),('suite_sv')) r(code)
  left join public.inventori i on i.tanggal = d::date and i.room_code = r.code
  left join public.room_type rt on rt.room_code = r.code
  left join public.rule_set rs on rs.id = i.rule_set_id
  left join public.booking_setting bs on bs.id = 1
  order by 1, 2;
end;
$function$;
revoke execute on function public.admin_calendar(date, date) from public, anon;
grant execute on function public.admin_calendar(date, date) to authenticated, service_role;

create or replace function public.admin_calendar_save(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
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
  v_old jsonb; v_new jsonb;
  v_perubahan jsonb := '[]'::jsonb;
  v_cap numeric;
begin
  if not public.has_role('owner', 'sales') then raise exception 'UNAUTHORIZED' using errcode = '28000'; end if;
  if v_from is null or v_to is null or v_to < v_from then raise exception 'TANGGAL_TIDAK_VALID'; end if;
  -- direct discount: sales stay under the sales cap, like every other discount
  v_cap := case when public.has_role('owner') then 99 else (select diskon_sales_maks from public.booking_setting where id = 1) end;
  if v_set ? 'diskon_persen' and coalesce((v_set->>'diskon_persen')::numeric, 0) > v_cap then
    raise exception 'DISKON_MELEBIHI' using detail = v_cap::text;
  end if;

  select email into v_email from auth.users where id = auth.uid();

  foreach v_room in array coalesce(v_rooms, '{}') loop
    d := v_from;
    while d <= v_to loop
      if array_length(v_days, 1) is null or extract(dow from d)::int = any(v_days) then

        select to_jsonb(i) - 'updated_at' - 'updated_by' into v_old
          from public.inventori i where tanggal = d and room_code = v_room;

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
        if v_set ? 'diskon_persen' then
          update public.inventori set diskon_persen = nullif((v_set->>'diskon_persen')::numeric, 0), updated_at = now(), updated_by = v_email
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
          update public.inventori set harga = null, rule_set_id = null, min_malam = null, diskon_persen = null,
                 tutup_checkin = false, tutup_checkout = false, updated_at = now(), updated_by = v_email
            where tanggal = d and room_code = v_room;
        end if;

        select allotment into v_new_allotment from public.inventori where tanggal = d and room_code = v_room;
        v_terpakai := private.rooms_used(v_room, d);
        if v_set ? 'allotment' and v_new_allotment is not null and v_new_allotment < v_terpakai then
          raise exception 'JATAH_KURANG' using detail = d::text || ' ' || v_room;
        end if;

        -- before/after per changed column; a cell with no row yet had every value unset (null)
        select to_jsonb(i) - 'updated_at' - 'updated_by' into v_new
          from public.inventori i where tanggal = d and room_code = v_room;
        v_perubahan := v_perubahan || coalesce((
          select jsonb_agg(jsonb_build_object('tanggal', d, 'kamar', v_room, 'kolom', k,
                                              'lama', v_old->k, 'baru', v_new->k))
          from jsonb_object_keys(v_new) k
          where k not in ('tanggal', 'room_code')
            and (v_old->k) is distinct from (v_new->k)
            and not (v_old is null and v_new->k in ('null'::jsonb, 'false'::jsonb))
        ), '[]'::jsonb);

        v_n := v_n + 1;
      end if;
      d := d + 1;
    end loop;
  end loop;

  insert into public.booking_events (jenis, data, oleh)
  values ('kalender', jsonb_build_object('rooms', v_rooms, 'from', v_from, 'to', v_to, 'days', v_days,
                                         'set', v_set, 'sel_diubah', v_n, 'perubahan', v_perubahan), v_email);

  return jsonb_build_object('sel_diubah', v_n);
end;
$function$;
