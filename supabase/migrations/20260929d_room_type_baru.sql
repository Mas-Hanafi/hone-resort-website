-- menu Kamar "Tambah tipe" sends baru=true: a new type must never overwrite an existing code.
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
  if v_old is not null and coalesce((p->>'baru')::boolean, false) then raise exception 'KODE_SUDAH_ADA'; end if; -- create never overwrites
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
