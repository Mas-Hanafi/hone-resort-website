-- Voucher (owner 28 Sep 2026): WHEN a code may be used (booking date/time window) and a per-guest limit.
-- berlaku_mulai/sampai = the stay NIGHTS a code discounts; pesan_mulai/sampai = when guests may book with it.
-- Both new limits are optional (null = no limit), so existing vouchers behave as before.
alter table public.voucher
  add column if not exists pesan_mulai timestamptz,
  add column if not exists pesan_sampai timestamptz,
  add column if not exists maks_per_tamu int;

alter table public.voucher
  add constraint voucher_pesan_urut check (pesan_mulai is null or pesan_sampai is null or pesan_sampai > pesan_mulai),
  add constraint voucher_maks_per_tamu check (maks_per_tamu is null or maks_per_tamu >= 1);

-- validates a code for a stay; raises a guest-readable error code when it can't be used
create or replace function private.voucher_check(p_kode text, p_room text, p_in date, p_out date)
returns public.voucher
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare v public.voucher;
begin
  select * into v from public.voucher where kode = upper(trim(p_kode));
  if not found or not v.aktif then raise exception 'VOUCHER_TIDAK_ADA'; end if;
  if v.pesan_mulai is not null and now() < v.pesan_mulai then
    raise exception 'VOUCHER_BELUM_MULAI' using detail = to_char(v.pesan_mulai at time zone 'Asia/Jakarta', 'DD-MM-YYYY HH24:MI');
  end if;
  if v.pesan_sampai is not null and now() >= v.pesan_sampai then raise exception 'VOUCHER_BERAKHIR'; end if;
  -- at least one night (p_in .. p_out-1) must fall inside the window
  if p_in > v.berlaku_sampai or p_out <= v.berlaku_mulai then
    raise exception 'VOUCHER_TIDAK_BERLAKU' using detail = v.berlaku_mulai::text || ' ' || v.berlaku_sampai::text;
  end if;
  if coalesce(cardinality(v.kamar), 0) > 0 and not (p_room = any(v.kamar)) then
    raise exception 'VOUCHER_KAMAR';
  end if;
  if (p_out - p_in) < v.min_malam then raise exception 'VOUCHER_MIN_MALAM' using detail = v.min_malam::text; end if;
  if v.kuota is not null and private.voucher_terpakai(v.kode) >= v.kuota then raise exception 'VOUCHER_HABIS'; end if;
  return v;
end $function$;

-- per guest = same WhatsApp number (private.wa_key). Checked when the booking row is written: booking_insert
-- already holds the voucher row lock, so two tabs of the same guest can't both slip through.
create or replace function private.voucher_per_tamu()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare v_maks int;
begin
  if new.voucher_kode is null then return new; end if;
  select maks_per_tamu into v_maks from public.voucher where kode = new.voucher_kode;
  if v_maks is null then return new; end if;
  if (select count(*) from public.booking b
      where b.voucher_kode = new.voucher_kode
        and private.wa_key(b.wa) = private.wa_key(new.wa)
        and (b.status in ('lunas', 'checked_in', 'checked_out', 'no_show')
             or (b.status = 'menunggu_bayar' and b.expires_at > now()))) >= v_maks then
    raise exception 'VOUCHER_BATAS_TAMU' using detail = v_maks::text;
  end if;
  return new;
end $function$;

drop trigger if exists voucher_per_tamu on public.booking;
create trigger voucher_per_tamu before insert on public.booking
  for each row execute function private.voucher_per_tamu();
