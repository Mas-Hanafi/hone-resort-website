-- Audit 2026-09-27: every staff role could UPDATE/DELETE booking rows straight through the API
-- (e.g. set status 'lunas' without payment, change the total) with no trace in Riwayat; the admin
-- "Batalkan" button did exactly that. Bookings, payment attempts and pre-check-in data are now
-- read-only for staff; every change goes through the SECURITY DEFINER functions
-- (booking_create_sales, admin_cancel, admin_checkin/checkout/no_show/mark, payment_settle),
-- which check the role and write booking_events. Physical room list: owner + sales may edit.
drop policy if exists admin_all_booking on public.booking;
create policy admin_select_booking on public.booking for select to authenticated using (public.is_admin());

drop policy if exists admin_all_payment_attempts on public.payment_attempts;
create policy admin_select_payment_attempts on public.payment_attempts for select to authenticated using (public.is_admin());

drop policy if exists admin_all_pre_checkin on public.pre_checkin;
create policy admin_select_pre_checkin on public.pre_checkin for select to authenticated using (public.is_admin());

drop policy if exists admin_all_rooms on public.rooms;
create policy admin_select_rooms on public.rooms for select to authenticated using (public.is_admin());
create policy staff_write_rooms on public.rooms for all to authenticated
  using (public.has_role('owner', 'sales')) with check (public.has_role('owner', 'sales'));
