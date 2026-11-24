-- Jumlah unit fisik per tipe kamar (data owner, 24 Sep 2026): total 30 kamar.
-- Jatah web (allotment / jatah_default) tidak boleh melebihi unit fisik.

alter table public.room_type add column if not exists jumlah_unit int not null default 0 check (jumlah_unit >= 0);

update public.room_type set jumlah_unit = v.n
from (values ('dlx_sv', 8), ('dlx_gv', 5), ('sup_sv', 7), ('sup_gv', 9), ('suite_sv', 1)) as v(code, n)
where room_code = v.code;

-- Existing rows above the physical count (staging test fill) are clamped down.
update public.inventori i set allotment = rt.jumlah_unit
from public.room_type rt
where rt.room_code = i.room_code and i.allotment > rt.jumlah_unit;

alter table public.room_type drop constraint if exists room_type_jatah_le_unit;
alter table public.room_type add constraint room_type_jatah_le_unit check (jatah_default <= jumlah_unit);

-- Covers every write path to inventori (admin_calendar_save, old Inventori module, SQL).
create or replace function private.inventori_cap_unit() returns trigger
language plpgsql set search_path = '' as $$
declare v_unit int;
begin
  if new.allotment is null then return new; end if;
  select jumlah_unit into v_unit from public.room_type where room_code = new.room_code;
  if v_unit is not null and new.allotment > v_unit then
    raise exception 'JATAH_MELEBIHI_UNIT' using detail = new.tanggal::text || ' ' || new.room_code || ' ' || v_unit::text;
  end if;
  return new;
end $$;

drop trigger if exists inventori_cap_unit on public.inventori;
create trigger inventori_cap_unit before insert or update of allotment, room_code on public.inventori
  for each row execute function private.inventori_cap_unit();
