-- Nomor kamar fisik + jam check-in/out resmi (data owner, 24 Sep 2026).
-- K11 terjawab: check-in 15.00, check-out 12.00.

alter table public.booking_setting alter column jam_checkin set default '15:00';
update public.booking_setting set jam_checkin = '15:00', jam_checkout = '12:00' where id = 1;

-- Nomor berakhiran 4 (104, 204, 304) tidak ada (feng shui). Total 30 = room_type.jumlah_unit.
-- SSV 203-211 kecuali 204 dan 209 ("2011" di pesan owner dibaca 211).
insert into public.rooms (nomor, room_code) values
  ('203','sup_sv'),('205','sup_sv'),('206','sup_sv'),('207','sup_sv'),('208','sup_sv'),('210','sup_sv'),('211','sup_sv'),
  ('301','sup_gv'),('302','sup_gv'),('303','sup_gv'),('305','sup_gv'),
  ('306','sup_gv'),('307','sup_gv'),('308','sup_gv'),('309','sup_gv'),('310','sup_gv'),
  ('101','dlx_sv'),('102','dlx_sv'),('103','dlx_sv'),('105','dlx_sv'),('106','dlx_sv'),
  ('201','dlx_sv'),('202','dlx_sv'),('209','dlx_sv'),
  ('107','dlx_gv'),('108','dlx_gv'),('502','dlx_gv'),('503','dlx_gv'),('311','dlx_gv'),
  ('501','suite_sv')
on conflict (nomor) do update set room_code = excluded.room_code;
