-- Sales payment links (owner 29 Sep 2026): discount by an existing voucher code OR a manual %, never both.
-- Vouchers keep every rule they have on the website (stay nights, booking window, rooms, min nights, quota,
-- per-guest limit): booking_insert already locks the voucher row and price_booking/voucher_check apply them.

-- booking_insert: stop discarding the voucher on sales links; refuse voucher + manual % together.
-- Patched in place (the rest of the 150-line function is unchanged); fails loudly if the anchor moved.
do $$
declare
  d text := pg_get_functiondef('private.booking_insert(jsonb,text,text)'::regprocedure);
  anchor text := 'v_voucher := null;';
begin
  -- exactly one occurrence (the sales branch); anything else means the function changed underneath us
  if (length(d) - length(replace(d, anchor, ''))) / length(anchor) <> 1 then raise exception 'booking_insert anchor not found exactly once'; end if;
  execute replace(d, anchor,
    'if v_voucher is not null and coalesce((p->>''diskon_persen'')::numeric, 0) > 0 then raise exception ''DISKON_GANDA''; end if; -- voucher OR manual %');
end $$;

-- staff price preview: optional voucher, same exclusivity
drop function if exists public.booking_quote_staff(text, date, date, integer, jsonb, numeric);
create function public.booking_quote_staff(p_room text, p_checkin date, p_checkout date, p_qty integer,
                                           p_addons jsonb default '[]'::jsonb, p_diskon numeric default 0,
                                           p_voucher text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare v_voucher text := nullif(upper(trim(coalesce(p_voucher, ''))), '');
begin
  if not public.has_role('owner', 'sales') then raise exception 'UNAUTHORIZED' using errcode = '28000'; end if;
  if v_voucher is not null and coalesce(p_diskon, 0) > 0 then raise exception 'DISKON_GANDA'; end if;
  return private.price_booking(p_room, p_checkin, p_checkout, p_qty, p_addons, coalesce(p_diskon, 0), v_voucher);
end $function$;
revoke all on function public.booking_quote_staff(text, date, date, integer, jsonb, numeric, text) from public, anon;
grant execute on function public.booking_quote_staff(text, date, date, integer, jsonb, numeric, text) to authenticated;
