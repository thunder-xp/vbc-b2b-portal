begin;

create or replace function public.list_partner_commercial_campaigns(
  p_company_id uuid,
  p_filter text default 'active',
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
  actor uuid := auth.uid();
  can_partner boolean;
  can_retail boolean;
begin
  if actor is null
    or not public.has_permission(p_company_id, 'campaigns.view')
    or p_limit not between 1 and 50
    or p_offset < 0
    or p_filter not in ('active', 'ending', 'stock', 'arrivals', 'purchased')
  then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  can_partner := public.has_permission(p_company_id, 'pricing.partner_price.view');
  can_retail := public.has_permission(p_company_id, 'pricing.retail_price.view');

  with eligible as (
    select campaign.*, count(*) over() total_count
    from public.commercial_campaigns campaign
    join public.commercial_campaign_audience_snapshots audience
      on audience.campaign_id = campaign.id
      and audience.version_number = campaign.current_version
      and audience.company_id = p_company_id
      and audience.included
    where campaign.status in ('active', 'scheduled')
      and campaign.starts_at <= now()
      and campaign.ends_at > now()
      and (
        p_filter = 'active'
        or p_filter = 'ending' and campaign.ends_at <= now() + interval '7 days'
        or p_filter = 'stock' and exists (
          select 1 from public.commercial_campaign_items item
          join public.product_stock_totals stock on stock.product_id = item.product_id and stock.is_published and stock.available_quantity > 0
          where item.campaign_id = campaign.id
        )
        or p_filter = 'arrivals' and exists (
          select 1 from public.commercial_campaign_items item
          join public.product_supplier_arrivals arrival on arrival.product_id = item.product_id and arrival.is_published and arrival.expected_arrival_date >= current_date
          where item.campaign_id = campaign.id
        )
        or p_filter = 'purchased' and exists (
          select 1 from public.commercial_campaign_items item
          join public.partner_order_history_items history_item on history_item.product_id = item.product_id
          join public.partner_order_history history on history.id = history_item.order_history_id and history.company_id = p_company_id and history.partner_visible
          where item.campaign_id = campaign.id
        )
      )
    order by campaign.priority, campaign.ends_at, campaign.id
    limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', eligible.id,
      'code', eligible.code,
      'title', eligible.partner_title,
      'description', eligible.partner_description,
      'type', eligible.campaign_type,
      'startsAt', eligible.starts_at,
      'endsAt', eligible.ends_at,
      'priority', eligible.priority,
      'imageAssetPath', eligible.image_asset_path,
      'termsSummary', eligible.terms_summary,
      'products', products.value
    ) order by eligible.priority, eligible.ends_at, eligible.id), '[]'::jsonb),
    'totalCount', coalesce(max(eligible.total_count), 0)
  ) into result
  from eligible
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'itemId', item.id,
      'productId', product.id,
      'sku', product.sku,
      'name', product.name,
      'slug', product.slug,
      'imageUrl', coalesce(product.image_source_url, product.image_url),
      'minimumQuantity', item.minimum_quantity,
      'maximumQuantityPerCompany', item.maximum_quantity_per_company,
      'partnerMessage', item.partner_message,
      'msrpPrice', case when can_retail then msrp_price.value end,
      'partnerPrice', case when can_partner then partner_price.value end,
      'specialPrice', case when can_partner and item.benefit_type = 'existing_price_profile' then special_price.value end,
      'price', case when can_partner then partner_price.value when can_retail then retail_price.value end,
      'availableQuantity', stock.available_quantity,
      'expectedArrivalDate', arrival.expected_arrival_date
    ) order by item.sort_order, item.id) value
    from public.commercial_campaign_items item
    join public.catalog_products product on product.id = item.product_id and product.is_active and product.is_visible
    left join public.product_stock_totals stock on stock.product_id = product.id and stock.is_published
    left join lateral (
      select min(source.expected_arrival_date) expected_arrival_date
      from public.product_supplier_arrivals source
      where source.product_id = product.id and source.is_published and source.expected_arrival_date >= current_date
    ) arrival on true
    left join lateral (
      select jsonb_build_object('amount', price.price_amount, 'currency', 'USD') value
      from public.product_prices price
      join public.partner_companies company on company.id = p_company_id
      where price.product_id = product.id
        and price.external_1c_price_type_id = company.external_1c_price_type_id
        and price.is_active and price.is_published and price.currency_status = 'resolved'
        and upper(coalesce(nullif(btrim(price.currency), ''), 'USD')) = 'USD'
        and price.price_amount > 0
        and price.valid_from <= now() and (price.valid_to is null or price.valid_to >= now())
        and (price.company_id is null or price.company_id = p_company_id)
      order by (price.company_id = p_company_id) desc, price.valid_from desc, price.updated_at desc, price.id
      limit 1
    ) partner_price on true
    left join lateral (
      select jsonb_build_object('amount', price.price_amount, 'currency', 'USD') value
      from public.product_prices price
      where price.product_id = product.id
        and price.external_1c_price_type_id = 'd9c92519-658b-11e8-80d3-000c29a58b59'
        and price.is_active and price.is_published and price.currency_status = 'resolved'
        and upper(coalesce(nullif(btrim(price.currency), ''), 'USD')) = 'USD'
        and price.price_amount > 0
        and price.valid_from <= now() and (price.valid_to is null or price.valid_to >= now())
        and (price.company_id is null or price.company_id = p_company_id)
      order by (price.company_id = p_company_id) desc, price.valid_from desc, price.updated_at desc, price.id
      limit 1
    ) msrp_price on true
    left join lateral (
      select jsonb_build_object('amount', price.price_amount, 'currency', 'USD') value
      from public.product_prices price
      join public.price_types profile on profile.id = price.price_type_id and profile.is_active
      where item.benefit_type = 'existing_price_profile'
        and profile.external_ref = item.governed_benefit_reference
        and price.product_id = product.id
        and price.is_active and price.is_published and price.currency_status = 'resolved'
        and upper(coalesce(nullif(btrim(price.currency), ''), nullif(btrim(profile.currency_code), ''), '')) = 'USD'
        and price.price_amount > 0
        and price.valid_from <= now() and (price.valid_to is null or price.valid_to >= now())
        and (price.company_id is null or price.company_id = p_company_id)
      order by (price.company_id = p_company_id) desc, price.valid_from desc, price.updated_at desc, price.id
      limit 1
    ) special_price on true
    left join lateral (
      select jsonb_build_object('amount', price.price_amount, 'currency', price.currency) value
      from public.product_prices price
      join public.price_types type on type.id = price.price_type_id
      where price.product_id = product.id and type.external_code = 'UU-000020'
        and price.is_active and price.is_published and price.currency_status = 'resolved'
      order by price.effective_at desc limit 1
    ) retail_price on true
    where item.campaign_id = eligible.id
  ) products on true;

  return coalesce(result, jsonb_build_object('items', '[]'::jsonb, 'totalCount', 0));
end;
$$;

create or replace function public.get_partner_commercial_campaign(
  p_company_id uuid,
  p_campaign_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
  can_partner boolean;
  can_retail boolean;
begin
  if auth.uid() is null or not public.has_permission(p_company_id, 'campaigns.view') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  can_partner := public.has_permission(p_company_id, 'pricing.partner_price.view');
  can_retail := public.has_permission(p_company_id, 'pricing.retail_price.view');

  select jsonb_build_object(
    'id', campaign.id,
    'code', campaign.code,
    'title', campaign.partner_title,
    'description', campaign.partner_description,
    'type', campaign.campaign_type,
    'startsAt', campaign.starts_at,
    'endsAt', campaign.ends_at,
    'priority', campaign.priority,
    'imageAssetPath', campaign.image_asset_path,
    'termsSummary', campaign.terms_summary,
    'products', products.value
  ) into result
  from public.commercial_campaigns campaign
  join public.commercial_campaign_audience_snapshots audience
    on audience.campaign_id = campaign.id
    and audience.version_number = campaign.current_version
    and audience.company_id = p_company_id
    and audience.included
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'itemId', item.id,
      'productId', product.id,
      'sku', product.sku,
      'name', product.name,
      'slug', product.slug,
      'imageUrl', coalesce(product.image_source_url, product.image_url),
      'minimumQuantity', item.minimum_quantity,
      'maximumQuantityPerCompany', item.maximum_quantity_per_company,
      'partnerMessage', item.partner_message,
      'msrpPrice', case when can_retail then msrp_price.value end,
      'partnerPrice', case when can_partner then partner_price.value end,
      'specialPrice', case when can_partner and item.benefit_type = 'existing_price_profile' then special_price.value end,
      'price', case when can_partner then partner_price.value when can_retail then retail_price.value end,
      'availableQuantity', stock.available_quantity,
      'expectedArrivalDate', arrival.expected_arrival_date
    ) order by item.sort_order, item.id) value
    from public.commercial_campaign_items item
    join public.catalog_products product on product.id = item.product_id
    left join public.product_stock_totals stock on stock.product_id = product.id and stock.is_published
    left join lateral (
      select min(source.expected_arrival_date) expected_arrival_date
      from public.product_supplier_arrivals source
      where source.product_id = product.id and source.is_published and source.expected_arrival_date >= current_date
    ) arrival on true
    left join lateral (
      select jsonb_build_object('amount', price.price_amount, 'currency', 'USD') value
      from public.product_prices price
      join public.partner_companies company on company.id = p_company_id
      where price.product_id = product.id
        and price.external_1c_price_type_id = company.external_1c_price_type_id
        and price.is_active and price.is_published and price.currency_status = 'resolved'
        and upper(coalesce(nullif(btrim(price.currency), ''), 'USD')) = 'USD'
        and price.price_amount > 0
        and price.valid_from <= now() and (price.valid_to is null or price.valid_to >= now())
        and (price.company_id is null or price.company_id = p_company_id)
      order by (price.company_id = p_company_id) desc, price.valid_from desc, price.updated_at desc, price.id
      limit 1
    ) partner_price on true
    left join lateral (
      select jsonb_build_object('amount', price.price_amount, 'currency', 'USD') value
      from public.product_prices price
      where price.product_id = product.id
        and price.external_1c_price_type_id = 'd9c92519-658b-11e8-80d3-000c29a58b59'
        and price.is_active and price.is_published and price.currency_status = 'resolved'
        and upper(coalesce(nullif(btrim(price.currency), ''), 'USD')) = 'USD'
        and price.price_amount > 0
        and price.valid_from <= now() and (price.valid_to is null or price.valid_to >= now())
        and (price.company_id is null or price.company_id = p_company_id)
      order by (price.company_id = p_company_id) desc, price.valid_from desc, price.updated_at desc, price.id
      limit 1
    ) msrp_price on true
    left join lateral (
      select jsonb_build_object('amount', price.price_amount, 'currency', 'USD') value
      from public.product_prices price
      join public.price_types profile on profile.id = price.price_type_id and profile.is_active
      where item.benefit_type = 'existing_price_profile'
        and profile.external_ref = item.governed_benefit_reference
        and price.product_id = product.id
        and price.is_active and price.is_published and price.currency_status = 'resolved'
        and upper(coalesce(nullif(btrim(price.currency), ''), nullif(btrim(profile.currency_code), ''), '')) = 'USD'
        and price.price_amount > 0
        and price.valid_from <= now() and (price.valid_to is null or price.valid_to >= now())
        and (price.company_id is null or price.company_id = p_company_id)
      order by (price.company_id = p_company_id) desc, price.valid_from desc, price.updated_at desc, price.id
      limit 1
    ) special_price on true
    left join lateral (
      select jsonb_build_object('amount', price.price_amount, 'currency', price.currency) value
      from public.product_prices price
      join public.price_types type on type.id = price.price_type_id
      where price.product_id = product.id and type.external_code = 'UU-000020'
        and price.is_active and price.is_published and price.currency_status = 'resolved'
      order by price.effective_at desc limit 1
    ) retail_price on true
    where item.campaign_id = campaign.id
  ) products on true
  where campaign.id = p_campaign_id
    and campaign.status in ('active', 'scheduled')
    and campaign.starts_at <= now()
    and campaign.ends_at > now();

  return result;
end;
$$;

revoke all on function public.list_partner_commercial_campaigns(uuid, text, integer, integer) from public, anon;
grant execute on function public.list_partner_commercial_campaigns(uuid, text, integer, integer) to authenticated;
revoke all on function public.get_partner_commercial_campaign(uuid, uuid) from public, anon;
grant execute on function public.get_partner_commercial_campaign(uuid, uuid) to authenticated;

comment on function public.list_partner_commercial_campaigns(uuid, text, integer, integer) is
  'Returns eligible partner campaigns with governed current USD MSRP, partner, and optional campaign-profile price projections.';
comment on function public.get_partner_commercial_campaign(uuid, uuid) is
  'Returns one eligible partner campaign with governed current USD MSRP, partner, and optional campaign-profile price projections.';

commit;
