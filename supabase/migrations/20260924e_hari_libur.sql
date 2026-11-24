-- Hari libur nasional & cuti bersama untuk kalender (admin, dan nanti kalender booking website).
-- Sumber 2027: kalender dari owner (kalenderindo.id, 24 Sep 2026). 2026: sisa tahun berjalan, SKB 3 Menteri 2026.
-- Minggu tidak disimpan di sini; dihitung di tampilan.

create table if not exists public.hari_libur (
  tanggal date primary key,
  nama    text not null,
  jenis   text not null check (jenis in ('nasional', 'cuti_bersama'))
);

alter table public.hari_libur enable row level security;
drop policy if exists public_read_hari_libur on public.hari_libur;
create policy public_read_hari_libur on public.hari_libur for select to anon, authenticated using (true);
drop policy if exists owner_write_hari_libur on public.hari_libur;
create policy owner_write_hari_libur on public.hari_libur for all to authenticated
  using (public.has_role('owner')) with check (public.has_role('owner'));

insert into public.hari_libur (tanggal, nama, jenis) values
  ('2026-12-24', 'Cuti Bersama Hari Natal', 'cuti_bersama'),
  ('2026-12-25', 'Hari Natal', 'nasional'),
  ('2027-01-01', 'Tahun Baru 2027 Masehi', 'nasional'),
  ('2027-01-05', 'Isra Mi''raj Nabi Muhammad SAW 1448 H', 'nasional'),
  ('2027-02-05', 'Cuti Bersama Tahun Baru Imlek', 'cuti_bersama'),
  ('2027-02-06', 'Tahun Baru Imlek 2578 Kongzili', 'nasional'),
  ('2027-03-08', 'Hari Suci Nyepi Tahun Baru Saka 1949', 'nasional'),
  ('2027-03-09', 'Cuti Bersama Idulfitri (1)', 'cuti_bersama'),
  ('2027-03-10', 'Hari Raya Idulfitri 1448 H (hari 1)', 'nasional'),
  ('2027-03-11', 'Hari Raya Idulfitri 1448 H (hari 2)', 'nasional'),
  ('2027-03-12', 'Cuti Bersama Idulfitri (2)', 'cuti_bersama'),
  ('2027-03-15', 'Cuti Bersama Idulfitri (3)', 'cuti_bersama'),
  ('2027-03-25', 'Cuti Bersama Wafat Isa Al-Masih', 'cuti_bersama'),
  ('2027-03-26', 'Wafat Isa Al-Masih (Jumat Agung)', 'nasional'),
  ('2027-03-28', 'Hari Paskah', 'nasional'),
  ('2027-05-01', 'Hari Buruh Internasional', 'nasional'),
  ('2027-05-06', 'Kenaikan Isa Al-Masih', 'nasional'),
  ('2027-05-17', 'Hari Raya Iduladha 1448 H', 'nasional'),
  ('2027-05-18', 'Cuti Bersama Iduladha', 'cuti_bersama'),
  ('2027-05-19', 'Cuti Bersama Hari Raya Waisak', 'cuti_bersama'),
  ('2027-05-20', 'Hari Raya Waisak 2571 BE', 'nasional'),
  ('2027-06-01', 'Hari Lahir Pancasila', 'nasional'),
  ('2027-06-06', 'Tahun Baru Islam 1449 H', 'nasional'),
  ('2027-08-15', 'Maulid Nabi Muhammad SAW', 'nasional'),
  ('2027-08-17', 'Hari Kemerdekaan RI', 'nasional'),
  ('2027-12-24', 'Cuti Bersama Hari Natal', 'cuti_bersama'),
  ('2027-12-25', 'Hari Natal', 'nasional'),
  ('2027-12-26', 'Isra Mi''raj Nabi Muhammad SAW 1449 H', 'nasional')
on conflict (tanggal) do update set nama = excluded.nama, jenis = excluded.jenis;
