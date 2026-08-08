-- Keep the estimate-creation currency read bounded and preserve governed USD/MDL conversion.

create or replace function public.list_commercial_currency_codes(
  p_company_id uuid
)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  can_view_partner_price boolean;
  can_view_retail_price boolean;
  company_price_type text;
  has_approved_partner_rate boolean;
  published text[];
begin
  if auth.uid() is null or not public.has_active_company_membership(p_company_id) then
    raise exception 'Partner price access denied.' using errcode = '42501';
  end if;

  can_view_partner_price := public.has_permission(
    p_company_id,
    'pricing.partner_price.view'
  );
  can_view_retail_price := public.has_permission(
    p_company_id,
    'pricing.retail_price.view'
  );

  if not can_view_partner_price and not can_view_retail_price then
    raise exception 'Partner price access denied.' using errcode = '42501';
  end if;

  select external_1c_price_type_id
  into company_price_type
  from public.partner_companies
  where id = p_company_id and status = 'active';

  select coalesce(array_agg(distinct upper(btrim(price.currency))), '{}'::text[])
  into published
  from public.product_prices price
  where (
      (can_view_partner_price and price.external_1c_price_type_id = company_price_type)
      or (
        can_view_retail_price
        and price.external_1c_price_type_id = 'd9c92519-658b-11e8-80d3-000c29a58b59'
      )
    )
    and price.currency_status = 'resolved'
    and price.is_active
    and price.is_published
    and price.valid_from <= now()
    and (price.valid_to is null or price.valid_to >= now())
    and (price.company_id is null or price.company_id = p_company_id)
    and nullif(btrim(price.currency), '') is not null;

  select exists (
    select 1
    from public.commercial_exchange_rates rate
    where rate.purpose = 'partner_price_usd_to_mdl'
      and rate.is_active
      and rate.is_published
      and rate.rate > 0
  )
  into has_approved_partner_rate;

  if has_approved_partner_rate and (published @> array['USD'] or published @> array['MDL']) then
    published := array(select distinct value from unnest(published || array['USD', 'MDL']) value);
  end if;

  return published;
end;
$$;

revoke all on function public.list_commercial_currency_codes(uuid)
  from public, anon;
grant execute on function public.list_commercial_currency_codes(uuid)
  to authenticated;
