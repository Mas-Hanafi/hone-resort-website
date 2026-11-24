-- Audit 2026-09-27: an owner voucher worth more than the rooms made the total Rp0 (a free room,
-- and payment gateways refuse 0). A booking must cost something.
do $$
declare def text := pg_get_functiondef('private.booking_insert(jsonb,text,text)'::regprocedure);
begin
  if position('TOTAL_TIDAK_VALID' in def) = 0 then
    execute replace(def, $r$  v_total := (v_quote->>'total')::bigint;$r$,
      $r$  v_total := (v_quote->>'total')::bigint;
  if v_total <= 0 then raise exception 'TOTAL_TIDAK_VALID'; end if;$r$);
  end if;
end $$;
