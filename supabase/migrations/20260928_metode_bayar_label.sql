-- Receipt / report label for the DOKU channel: "Virtual Account BCA", "E-Wallet OVO", "QRIS" …
-- (service.id + acquirer.name from the DOKU Check Status / notification body), plus the bank reference.
create or replace function private.metode_bayar(p jsonb)
returns text
language sql
immutable
set search_path = ''
as $function$
  select case
    when p is null then null
    when p ? 'mock' then 'Simulasi (staging)'
    else nullif(trim(concat_ws(' ',
      case p->'service'->>'id'
        when 'VIRTUAL_ACCOUNT' then 'Virtual Account'
        when 'EMONEY' then 'E-Wallet'
        when 'QRIS' then 'QRIS'
        when 'CREDIT_CARD' then 'Kartu kredit/debit'
        when 'ONLINE_TO_OFFLINE' then 'Gerai'
        when 'PEER_TO_PEER' then 'Paylater'
        when 'DIRECT_DEBIT' then 'Direct debit'
        else initcap(replace(coalesce(p->'service'->>'id', p->'channel'->>'id', ''), '_', ' '))
      end,
      case when p->'service'->>'id' = 'QRIS' then null else p->'acquirer'->>'name' end)), '')
  end
$function$;
