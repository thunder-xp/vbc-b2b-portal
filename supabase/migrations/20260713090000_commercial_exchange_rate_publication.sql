alter table public.commercial_exchange_rates
  add column if not exists source_ref text,
  add column if not exists base_currency_ref text,
  add column if not exists source_document_type text,
  add column if not exists source_document_date timestamptz,
  add column if not exists source_mdl_per_usd_rate numeric(18, 8),
  add column if not exists markup_percent numeric(8, 4);

create or replace function public.publish_commercial_exchange_rate(
  p_source_code text,
  p_source_ref text,
  p_base_currency_ref text,
  p_source_document_type text,
  p_source_document_date timestamptz,
  p_source_mdl_per_usd_rate numeric,
  p_markup_percent numeric,
  p_bcru_mdl_per_usd_rate numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  published public.commercial_exchange_rates%rowtype;
begin
  if p_source_code <> '113'
    or p_source_ref <> 'd5303dea-f2f5-11ec-4f83-7239d3b7bd5c'
    or p_base_currency_ref <> '00b49bb3-63d6-11e8-80d2-000c29a58b59'
    or p_source_document_type not in ('Document_ЗаказПоставщику', 'Document_СчетНаОплатуПоставщика', 'Document_ПриходнаяНакладная', 'Document_РасходыПриИмпорте')
    or p_source_mdl_per_usd_rate <= 0
    or p_bcru_mdl_per_usd_rate <= 0
  then
    raise exception 'Invalid commercial exchange-rate publication payload.' using errcode = '22023';
  end if;

  insert into public.commercial_exchange_rates (
    source_code, source_ref, base_currency, base_currency_ref, quote_currency,
    rate_direction, rate, effective_date, source_updated_at, source_document_type,
    source_document_date, source_mdl_per_usd_rate, markup_percent, published_at, is_published
  ) values (
    p_source_code, p_source_ref, 'USD', p_base_currency_ref, 'MDL',
    'quote_per_base', p_bcru_mdl_per_usd_rate, p_source_document_date::date,
    p_source_document_date, p_source_document_type, p_source_document_date,
    p_source_mdl_per_usd_rate, p_markup_percent, now(), true
  )
  on conflict (source_code, base_currency, quote_currency, effective_date)
  do update set
    source_ref = excluded.source_ref,
    base_currency_ref = excluded.base_currency_ref,
    rate = excluded.rate,
    source_updated_at = excluded.source_updated_at,
    source_document_type = excluded.source_document_type,
    source_document_date = excluded.source_document_date,
    source_mdl_per_usd_rate = excluded.source_mdl_per_usd_rate,
    markup_percent = excluded.markup_percent,
    published_at = excluded.published_at,
    is_published = true
  returning * into published;

  update public.commercial_exchange_rates
  set is_published = false
  where source_code = p_source_code
    and base_currency = 'USD'
    and quote_currency = 'MDL'
    and id <> published.id
    and is_published = true;

  return to_jsonb(published);
end;
$$;

revoke all on function public.publish_commercial_exchange_rate(text, text, text, text, timestamptz, numeric, numeric, numeric) from public, anon, authenticated;
grant execute on function public.publish_commercial_exchange_rate(text, text, text, text, timestamptz, numeric, numeric, numeric) to service_role;
