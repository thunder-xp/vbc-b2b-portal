-- Repair the compact catalog card contract without changing query count or
-- reintroducing application-side commercial reads.
create or replace function public.catalog_partner_page_v2(
  p_company_id uuid,
  p_category_id uuid default null,
  p_brand_id uuid default null,
  p_search text default null,
  p_availability text default 'all',
  p_filters jsonb default '{}'::jsonb,
  p_sort text default 'default',
  p_limit integer default 12,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  base_result jsonb;
  enriched_items jsonb;
  partner_price_type_ref text;
  can_view_prices boolean;
  can_view_stock boolean;
begin
  select pc.external_1c_price_type_id
  into partner_price_type_ref
  from public.partner_companies pc
  where pc.id = p_company_id and pc.status = 'active';

  can_view_prices := public.has_permission(p_company_id, 'prices.view');
  can_view_stock := public.has_permission(p_company_id, 'stock.view');

  if p_availability <> 'all' and not can_view_stock then
    raise exception 'Stock filter access denied.' using errcode = '42501';
  end if;

  base_result := public.catalog_partner_page(
    p_company_id, p_category_id, p_brand_id, p_search, p_availability,
    p_filters, p_sort, p_limit, p_offset
  );

  with rates as (
    select
      max(rate) filter (where purpose = 'partner_price_usd_to_mdl') as partner_rate,
      max(rate) filter (where purpose = 'retail_price_usd_to_mdl') as retail_rate,
      max(published_at) filter (where purpose = 'partner_price_usd_to_mdl') as partner_rate_published_at,
      max(published_at) filter (where purpose = 'retail_price_usd_to_mdl') as retail_rate_published_at
    from public.commercial_exchange_rates
    where can_view_prices and is_active and is_published
      and purpose in ('partner_price_usd_to_mdl', 'retail_price_usd_to_mdl')
  ), page_items as (
    select
      page.item || jsonb_build_object(
        'image_url', coalesce(product.image_source_url, product.image_url)
      ) as item,
      page.item ->> 'id' as product_id,
      page.ordinal
    from jsonb_array_elements(base_result -> 'items')
      with ordinality page(item, ordinal)
    join public.catalog_products product
      on product.id = (page.item ->> 'id')::uuid
  )
  select coalesce(jsonb_agg(
    page_items.item || jsonb_build_object(
      'partner_price_amount', partner_price.price_amount,
      'partner_price_currency', partner_price.currency,
      'partner_price_currency_status', partner_price.currency_status,
      'partner_price_updated_at', partner_price.updated_at,
      'msrp_price_amount', msrp_price.price_amount,
      'msrp_price_currency', case
        when msrp_price.price_amount is null then null
        else coalesce(nullif(btrim(msrp_price.currency), ''), 'USD')
      end,
      'msrp_price_currency_status', msrp_price.currency_status,
      'msrp_price_updated_at', msrp_price.updated_at,
      'physical_quantity', stock.physical_quantity,
      'reserved_quantity', stock.reserved_quantity,
      'available_quantity', stock.available_quantity,
      'incoming_quantity', stock.incoming_quantity,
      'has_variant_stock', stock.has_variant_stock,
      'stock_synced_at', stock.synced_at,
      'expected_arrival_date', arrival.expected_arrival_date,
      'expected_quantity', arrival.expected_quantity,
      'arrival_published_at', arrival.published_at,
      'partner_rate', rates.partner_rate,
      'retail_rate', rates.retail_rate,
      'partner_rate_published_at', rates.partner_rate_published_at,
      'retail_rate_published_at', rates.retail_rate_published_at,
      'can_view_stock', can_view_stock
    ) order by page_items.ordinal
  ), '[]'::jsonb)
  into enriched_items
  from page_items
  cross join rates
  left join lateral (
    select pp.price_amount, pp.currency, pp.currency_status, pp.updated_at
    from public.product_prices pp
    where can_view_prices and partner_price_type_ref is not null
      and pp.product_id = page_items.product_id::uuid
      and pp.external_1c_price_type_id = partner_price_type_ref
      and pp.is_active and pp.is_published
      and pp.valid_from <= now() and (pp.valid_to is null or pp.valid_to >= now())
      and (pp.company_id is null or pp.company_id = p_company_id)
    order by (pp.company_id = p_company_id) desc, pp.valid_from desc, pp.id
    limit 1
  ) partner_price on true
  left join lateral (
    select pp.price_amount, pp.currency, pp.currency_status, pp.updated_at
    from public.product_prices pp
    where can_view_prices and pp.product_id = page_items.product_id::uuid
      and pp.external_1c_price_type_id = 'd9c92519-658b-11e8-80d3-000c29a58b59'
      and pp.is_active and pp.is_published
      and pp.valid_from <= now() and (pp.valid_to is null or pp.valid_to >= now())
      and (pp.company_id is null or pp.company_id = p_company_id)
    order by (pp.company_id = p_company_id) desc, pp.valid_from desc, pp.id
    limit 1
  ) msrp_price on true
  left join public.product_stock_totals stock
    on can_view_stock and stock.product_id = page_items.product_id::uuid and stock.is_published
  left join lateral (
    select
      psa.expected_arrival_date,
      sum(psa.expected_quantity) as expected_quantity,
      max(psa.published_at) as published_at
    from public.product_supplier_arrivals psa
    where can_view_stock and psa.product_id = page_items.product_id::uuid
      and psa.external_characteristic_ref = '00000000-0000-0000-0000-000000000000'
      and psa.is_published and psa.expected_quantity > 0
      and psa.expected_arrival_date >= current_date
    group by psa.expected_arrival_date
    order by psa.expected_arrival_date
    limit 1
  ) arrival on true;

  return base_result || jsonb_build_object('items', enriched_items);
end;
$$;

comment on function public.catalog_partner_page_v2(uuid, uuid, uuid, text, text, jsonb, text, integer, integer) is
  'Returns one bounded company-authorized catalog page with enriched card image, partner price, MSRP, stock, arrival, and commercial rates.';
