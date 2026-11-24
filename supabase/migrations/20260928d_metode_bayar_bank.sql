-- DOKU notification bodies send acquirer.id without acquirer.name ("Virtual Account" lost the bank):
-- fall back to acquirer.id, then to the channel id suffix (VIRTUAL_ACCOUNT_BANK_MANDIRI -> MANDIRI).
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
      case when p->'service'->>'id' = 'QRIS' then null
           else coalesce(p->'acquirer'->>'name', p->'acquirer'->>'id',
                  nullif(replace(regexp_replace(replace(coalesce(p->'channel'->>'id', ''), coalesce(p->'service'->>'id', '') || '_', ''), '^BANK_', ''), '_', ' '), ''))
      end)), '')
  end
$function$;
