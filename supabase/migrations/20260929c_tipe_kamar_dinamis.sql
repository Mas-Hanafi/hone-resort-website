-- Owner 29 Sep 2026: room types and room counts are managed in admin "Kamar" instead of being hardcoded.
--  * room_type is the master list (no more CHECK on the 5 original codes; FKs instead).
--  * rooms (room numbers) drive jumlah_unit and jatah_default through a trigger.
--  * base price per night: old pricelist period column (the 5 original types) first, else the type's own
--    harga_weekday / harga_weekend (weekend = Fri, Sat, Sun check-in, same split as the pricelist).
--  * tampil_web = offered on the website; a hidden type is still sellable through a sales link.

-- 1. room_type columns + FKs ---------------------------------------------------------------------------
alter table public.room_type
  add column if not exists harga_weekday bigint check (harga_weekday > 0),
  add column if not exists harga_weekend bigint check (harga_weekend > 0),
  add column if not exists tampil_web boolean not null default true,
  add column if not exists aktif boolean not null default true;

alter table public.room_type drop constraint if exists room_type_room_code_check;
alter table public.room_type add constraint room_type_kode_format check (room_code ~ '^[a-z0-9_]{2,30}$');
alter table public.inventori drop constraint if exists inventori_room_code_check;
alter table public.booking   drop constraint if exists booking_room_code_check;
alter table public.rooms     drop constraint if exists rooms_room_code_check;
alter table public.inventori add constraint inventori_room_code_fkey foreign key (room_code) references public.room_type (room_code);
alter table public.booking   add constraint booking_room_code_fkey   foreign key (room_code) references public.room_type (room_code);
alter table public.rooms     add constraint rooms_room_code_fkey     foreign key (room_code) references public.room_type (room_code);

-- 2. room numbers -> units + default allotment ---------------------------------------------------------
create or replace function private.rooms_sync_unit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c text; n int;
begin
  for c in select distinct x from unnest(array[
      case when tg_op <> 'INSERT' then old.room_code end,
      case when tg_op <> 'DELETE' then new.room_code end]) x where x is not null loop
    select count(*)::int into n from public.rooms r where r.room_code = c and r.aktif;
    update public.room_type set jumlah_unit = n, jatah_default = n where room_code = c;
  end loop;
  return null;
end $$;

drop trigger if exists rooms_sync_unit on public.rooms;
create trigger rooms_sync_unit after insert or update or delete on public.rooms
  for each row execute function private.rooms_sync_unit();

update public.room_type rt set jumlah_unit = s.n, jatah_default = s.n
from (select t.room_code, count(r.id) filter (where r.aktif)::int n
        from public.room_type t left join public.rooms r on r.room_code = t.room_code group by 1) s
where s.room_code = rt.room_code;

-- a per-date allotment set before rooms were removed can never exceed the rooms that exist now
create or replace function private.effective_allotment(p_room text, p_date date)
returns integer language sql stable security definer set search_path = '' as $$
  select case when coalesce(i.stop_sell, false) or not rt.aktif then 0
              else least(coalesce(i.allotment, rt.jatah_default, 0), rt.jumlah_unit) end
  from public.room_type rt
  left join public.inventori i on i.room_code = rt.room_code and i.tanggal = p_date
  where rt.room_code = p_room
$$;

-- 3. base price ---------------------------------------------------------------------------------------
create or replace function private.base_price(p_room text, p_date date)
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select nullif(regexp_replace(to_jsonb(p) ->> p_room, '[^0-9]', '', 'g'), '')::bigint
       from public.pricelist_periods p
      -- ponytail: the old pricelist table has one text column per original type; new types never get one
      where p_room in ('sup_sv', 'sup_gv', 'dlx_sv', 'dlx_gv', 'suite_sv')
        and p.active and p_date::text = any (p.check_in_dates)
      order by p.sort_order limit 1),
    (select case when extract(isodow from p_date) >= 5 then coalesce(rt.harga_weekend, rt.harga_weekday)
                 else rt.harga_weekday end
       from public.room_type rt where rt.room_code = p_room))
$$;

create or replace function private.night_price_normal(p_room text, p_date date)
returns bigint language plpgsql stable security definer set search_path = '' as $$
declare
  v_override bigint; v_rule_id uuid; v_persen int; v_base bigint; v_pembulatan int;
begin
  select i.harga, i.rule_set_id into v_override, v_rule_id
  from public.inventori i where i.room_code = p_room and i.tanggal = p_date;
  if v_override is not null then return v_override; end if;

  v_base := private.base_price(p_room, p_date);
  if v_base is null then return null; end if;

  if v_rule_id is not null then
    select rs.persen into v_persen from public.rule_set rs where rs.id = v_rule_id;
  end if;
  if v_persen is not null then
    select coalesce(bs.pembulatan, 1000) into v_pembulatan from public.booking_setting bs where bs.id = 1;
    return (round(v_base * (1 + v_persen / 100.0) / v_pembulatan) * v_pembulatan)::bigint;
  end if;
  return v_base;
end $$;

-- 4. calendar + availability iterate room_type -----------------------------------------------------------
create or replace function public.admin_calendar(p_from date, p_to date)
returns table(tanggal date, room_code text, harga_dasar bigint, harga_efektif bigint, sumber_harga text,
              harga_manual bigint, jatah integer, jatah_default integer, terpakai integer, sisa integer,
              stop_sell boolean, rule_set_id uuid, rule_set_nama text, rule_set_warna smallint, min_malam integer,
              tutup_checkin boolean, tutup_checkout boolean, catatan text, jumlah_booking integer,
              diskon_persen numeric, harga_normal bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'UNAUTHORIZED' using errcode = '28000'; end if;
  if p_to < p_from or p_to - p_from > 62 then raise exception 'RENTANG_TERLALU_PANJANG'; end if;

  return query
  select
    d::date, rt.room_code,
    private.base_price(rt.room_code, d::date),
    private.night_price(rt.room_code, d::date),
    case when i.harga is not null then 'manual'
         when rs.persen is not null then 'rule_set'
         when private.night_price(rt.room_code, d::date) is not null then 'periode'
         else null end,
    i.harga,
    least(coalesce(i.allotment, rt.jatah_default), rt.jumlah_unit),
    rt.jatah_default,
    private.rooms_used(rt.room_code, d::date),
    greatest(private.effective_allotment(rt.room_code, d::date) - private.rooms_used(rt.room_code, d::date), 0),
    coalesce(i.stop_sell, false),
    i.rule_set_id, rs.nama, rs.warna,
    coalesce(i.min_malam, rs.min_malam, bs.min_malam, 1),
    coalesce(i.tutup_checkin, false), coalesce(i.tutup_checkout, false),
    i.catatan,
    (select count(*)::int from public.booking b
       where b.room_code = rt.room_code and b.checkin <= d::date and b.checkout > d::date
         and (b.status in ('lunas','checked_in','no_show','checked_out')
              or (b.status = 'menunggu_bayar' and b.expires_at > now()))),
    i.diskon_persen,
    private.night_price_normal(rt.room_code, d::date)
  from generate_series(p_from, p_to, interval '1 day') d
  cross join public.room_type rt
  left join public.inventori i on i.tanggal = d::date and i.room_code = rt.room_code
  left join public.rule_set rs on rs.id = i.rule_set_id
  left join public.booking_setting bs on bs.id = 1
  where rt.aktif
  order by 1, 2;
end $$;

create or replace function public.booking_availability(p_from date, p_to date)
returns table(tanggal date, room_code text, sisa integer, harga bigint, harga_normal bigint, diskon_persen numeric,
              min_malam integer, tutup_checkin boolean, tutup_checkout boolean)
language sql stable security definer set search_path = '' as $$
  select d::date, rt.room_code,
         greatest(private.effective_allotment(rt.room_code, d::date) - private.rooms_used(rt.room_code, d::date), 0),
         private.night_price(rt.room_code, d::date),
         private.night_price_normal(rt.room_code, d::date),
         i.diskon_persen,
         coalesce(i.min_malam, rs.min_malam, bs.min_malam, 1),
         coalesce(i.tutup_checkin, false),
         coalesce(i.tutup_checkout, false)
  from generate_series(p_from, least(p_to, p_from + 400) - 1, interval '1 day') d
  cross join public.room_type rt
  left join public.inventori i on i.tanggal = d::date and i.room_code = rt.room_code
  left join public.rule_set rs on rs.id = i.rule_set_id
  left join public.booking_setting bs on bs.id = 1
  where rt.aktif and rt.tampil_web
  order by 1, 2
$$;

-- 5. booking_insert: type from the table, qty up to the type's units ---------------------------------------
do $$
declare s text := pg_get_functiondef('private.booking_insert(jsonb,text,text)'::regprocedure);
  procedure_parts text[][] := array[
    array['declare' || chr(10) || '  v_room text', 'declare' || chr(10) || '  v_rt public.room_type%rowtype;' || chr(10) || '  v_room text'],
    array['if v_room not in (''sup_sv'',''sup_gv'',''dlx_sv'',''dlx_gv'',''suite_sv'') then raise exception ''KAMAR_TIDAK_VALID''; end if;',
          'select * into v_rt from public.room_type rt where rt.room_code = v_room and rt.aktif and (p_sumber <> ''web'' or rt.tampil_web);'
          || chr(10) || '  if not found then raise exception ''KAMAR_TIDAK_VALID''; end if;'],
    array['(v_room = ''suite_sv'' and v_qty > 1)', 'v_qty > v_rt.jumlah_unit']];
  i int;
begin
  for i in 1 .. array_length(procedure_parts, 1) loop
    if (length(s) - length(replace(s, procedure_parts[i][1], ''))) / length(procedure_parts[i][1]) <> 1 then
      raise exception 'booking_insert patch anchor % not found exactly once', i;
    end if;
    s := replace(s, procedure_parts[i][1], procedure_parts[i][2]);
  end loop;
  execute s;
end $$;

-- 6. public setting lists the website's room types; booking_get carries the room name -------------------------
create or replace function public.booking_public_setting()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'min_malam', min_malam, 'maks_malam', maks_malam,
    'advance_notice_hari', advance_notice_hari, 'batas_jam_hari_ini', batas_jam_hari_ini,
    'jendela_bulan', jendela_bulan, 'jam_checkin', jam_checkin, 'jam_checkout', jam_checkout,
    'hold_web_menit', hold_web_menit, 'pajak_persen', pajak_persen, 'pajak_termasuk', pajak_termasuk,
    'kebijakan_pembatalan', kebijakan_pembatalan,
    'kapasitas_kamar', kapasitas_kamar, 'extra_bed_maks', extra_bed_maks,
    'addons', coalesce((select jsonb_agg(jsonb_build_object('kode', a.kode, 'nama', a.nama, 'harga', a.harga,
                          'satuan', a.satuan, 'per_malam', a.per_malam, 'maks', a.maks) order by a.urutan)
                        from public.addon a where a.aktif), '[]'::jsonb),
    'kamar', coalesce((select jsonb_agg(jsonb_build_object('kode', rt.room_code, 'nama', rt.nama, 'unit', rt.jumlah_unit)
                          order by rt.urutan, rt.room_code)
                        from public.room_type rt where rt.aktif and rt.tampil_web), '[]'::jsonb))
  from public.booking_setting where id = 1
$$;

do $$
declare s text := pg_get_functiondef('public.booking_get(text)'::regprocedure);
  a text := '''room_code'', b.room_code,';
begin
  if (length(s) - length(replace(s, a, ''))) / length(a) <> 1 then raise exception 'booking_get anchor not found exactly once'; end if;
  execute replace(s, a, a || ' ''room_nama'', (select rt.nama from public.room_type rt where rt.room_code = b.room_code),');
end $$;

-- 7. admin: create / edit a room type (and its website content row, keyed by name as before) ------------------
create or replace function public.room_type_simpan(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_code text := lower(trim(coalesce(p->>'room_code', '')));
  v_nama text := trim(coalesce(p->>'nama', ''));
  v_wd bigint := nullif(p->>'harga_weekday', '')::bigint;
  v_we bigint := nullif(p->>'harga_weekend', '')::bigint;
  v_web boolean := coalesce((p->>'tampil_web')::boolean, false);
  v_aktif boolean := coalesce((p->>'aktif')::boolean, true);
  v_old text;
  v_slug text;
begin
  if not public.has_role('owner', 'sales') then raise exception 'UNAUTHORIZED' using errcode = '28000'; end if;
  if v_nama = '' then raise exception 'NAMA_WAJIB'; end if;
  if v_code !~ '^[a-z0-9_]{2,30}$' then raise exception 'KODE_TIDAK_VALID'; end if;
  if v_wd is not null and v_wd <= 0 or v_we is not null and v_we <= 0 then raise exception 'HARGA_TIDAK_VALID'; end if;
  if exists (select 1 from public.room_type where lower(nama) = lower(v_nama) and room_code <> v_code) then
    raise exception 'NAMA_SUDAH_ADA';
  end if;

  select nama into v_old from public.room_type where room_code = v_code;
  if v_old is null and v_wd is null then raise exception 'HARGA_WAJIB'; end if; -- a new type must be priceable

  insert into public.room_type (room_code, nama, urutan, harga_weekday, harga_weekend, tampil_web, aktif)
  values (v_code, v_nama, coalesce((select max(urutan) + 1 from public.room_type), 1), v_wd, v_we, v_web, v_aktif)
  on conflict (room_code) do update
    set nama = excluded.nama, harga_weekday = excluded.harga_weekday, harga_weekend = excluded.harga_weekend,
        tampil_web = excluded.tampil_web, aktif = excluded.aktif;

  -- website Rooms page content: same name, same visibility, "from" price follows the base price
  if v_old is not null and v_old <> v_nama then update public.kamar set nama = v_nama where nama = v_old; end if;
  if exists (select 1 from public.kamar where nama = v_nama) then
    update public.kamar set is_active = v_web and v_aktif,
           harga_weekday = coalesce(v_wd, harga_weekday), harga_weekend = coalesce(v_we, harga_weekend), updated_at = now()
     where nama = v_nama;
  else
    v_slug := trim(both '-' from lower(regexp_replace(v_nama, '[^a-zA-Z0-9]+', '-', 'g')));
    if exists (select 1 from public.kamar where slug = v_slug) then v_slug := v_slug || '-' || v_code; end if;
    insert into public.kamar (nama, slug, harga_weekday, harga_weekend, is_active, urutan)
    values (v_nama, v_slug, v_wd, v_we, v_web and v_aktif, coalesce((select max(urutan) + 1 from public.kamar), 1));
  end if;

  return (select to_jsonb(rt) from public.room_type rt where rt.room_code = v_code);
end $$;

revoke all on function public.room_type_simpan(jsonb) from public, anon;
grant execute on function public.room_type_simpan(jsonb) to authenticated;
revoke all on function private.base_price(text, date) from public, anon, authenticated;
revoke all on function private.rooms_sync_unit() from public, anon, authenticated;
