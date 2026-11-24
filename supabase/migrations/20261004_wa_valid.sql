-- WhatsApp number must look like a real mobile number (owner report 4 Oct 2026: a web booking with
-- wa "1234587643567" reached DOKU as the customer phone and e-wallet payment (OVO) failed).
-- Indonesia: 08… / 628… / +628…, 10-15 digits in total. Abroad: + country code, 8-15 digits.
-- Used by private.booking_insert, so it covers web checkout and sales payment links.

create or replace function private.wa_valid(p_wa text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(
    regexp_replace(p_wa, '[\s().-]', '', 'g') ~ '^(\+?62|0)8[0-9]{8,12}$'
    or (regexp_replace(p_wa, '[\s().-]', '', 'g') ~ '^\+[1-9][0-9]{7,14}$'
        and regexp_replace(p_wa, '[\s().-]', '', 'g') !~ '^\+62'),
    false)
$$;

do $$
declare
  v_def text := pg_get_functiondef('private.booking_insert(jsonb,text,text)'::regprocedure);
  v_anchor text := '  if coalesce(trim(p->>''nama''), '''') = '''' or length(v_wa) < 10 then';
begin
  if v_def like '%WA_TIDAK_VALID%' then return; end if; -- already patched
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception 'booking_insert anchor not found exactly once';
  end if;
  execute replace(v_def, v_anchor,
    '  if coalesce(trim(p->>''nama''), '''') <> '''' and not private.wa_valid(p->>''wa'') then' || chr(10) ||
    '    raise exception ''WA_TIDAK_VALID'';' || chr(10) ||
    '  end if;' || chr(10) || v_anchor);
end $$;
