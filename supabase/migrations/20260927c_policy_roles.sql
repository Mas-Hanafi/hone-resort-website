-- Audit 2026-09-27: policies that anonymous visitors hit must not call is_admin()/has_role(),
-- which anon may not execute -> the whole query failed with 401 (website add-on prices fell
-- back to hardcoded values). Public read of active add-ons needs no function; staff policies
-- are scoped to signed-in users so anon simply sees nothing.
alter policy public_read_addon on public.addon using (aktif);
alter policy staff_insert_rule_set on public.rule_set to authenticated;
alter policy staff_update_rule_set on public.rule_set to authenticated;
alter policy staff_delete_rule_set on public.rule_set to authenticated;
alter policy admin_select_booking_events on public.booking_events to authenticated;
alter policy owner_delete_change_log on public.booking_events to authenticated;
alter policy staff_all_voucher on public.voucher to authenticated;
