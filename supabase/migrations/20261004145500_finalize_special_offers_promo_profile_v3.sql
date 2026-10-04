begin;

create or replace function public.search_commercial_campaign_products_v2(
  p_search text default '', p_category_id uuid default null, p_brand_id uuid default null,
  p_in_stock_only boolean default false, p_limit integer default 25, p_offset integer default 0
) returns jsonb
language plpgsql stable security definer set search_path = '' set row_security = off as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not (public.has_internal_permission('campaigns.create') or public.has_internal_permission('campaigns.edit')) then raise exception 'Forbidden' using errcode='42501'; end if;
  if p_limit not between 1 and 50 or p_offset < 0 or char_length(coalesce(p_search,'')) > 100 then raise exception 'CAMPAIGN_SEARCH_INVALID' using errcode='22023'; end if;
  with recursive category_scope as (
    select category.id from public.catalog_categories category where category.id=p_category_id and category.is_active
    union all select child.id from public.catalog_categories child join category_scope parent on child.parent_id=parent.id where child.is_active
  ), base as materialized (
    select product.id, product.sku, model.display_value model, product.name, product.image_url,
      product.category_id, category.name category_name, product.brand_id, brand.name brand_name,
      case when stock.is_published and stock.freshness_state='authoritative' then stock.available_quantity end available_quantity,
      case when price.price_amount is null then null else jsonb_build_object('amount',price.price_amount,'currency',price.currency) end current_price,
      case when promo_price.price_amount is null then null else jsonb_build_object('amount',promo_price.price_amount,'currency','USD') end promo_price
    from public.catalog_products product
    left join public.catalog_categories category on category.id=product.category_id and category.is_active
    left join public.catalog_brands brand on brand.id=product.brand_id and brand.is_active
    left join public.product_stock_totals stock on stock.product_id=product.id
    left join lateral (
      select attribute.display_value from public.catalog_product_attributes attribute
      where attribute.product_id=product.id and attribute.is_visible and (lower(attribute.attribute_key) in ('model','model_name') or lower(attribute.label) in ('model','РјРѕРґРµР»СЊ'))
      order by attribute.is_filterable desc, attribute.id limit 1
    ) model on true
    left join lateral (
      select product_price.price_amount, product_price.currency from public.product_prices product_price
      join public.price_types price_type on price_type.id=product_price.price_type_id
      where product_price.product_id=product.id and price_type.external_code='UU-000020' and product_price.is_active and product_price.is_published and product_price.currency_status='resolved'
      order by product_price.effective_at desc, product_price.id desc limit 1
    ) price on true
    left join lateral (select pp.price_amount from public.product_prices pp join public.price_types pt on pt.id=pp.price_type_id where pp.product_id=product.id and pt.external_ref='b9f5d585-dab1-11e9-8a58-000c29cf9dd4' and pt.external_code='UU-000021' and pt.name='PROMO' and pt.is_active and upper(coalesce(nullif(btrim(pt.currency_code),''),''))='USD' and pp.is_active and pp.is_published and pp.currency_status='resolved' and upper(coalesce(nullif(btrim(pp.currency),''),''))='USD' and pp.price_amount>0 and pp.valid_from<=now() and (pp.valid_to is null or pp.valid_to>=now()) order by pp.valid_from desc,pp.updated_at desc,pp.id limit 1) promo_price on true
    where product.is_active and product.is_visible
      and (p_category_id is null or product.category_id in (select scoped.id from category_scope scoped))
      and (p_brand_id is null or product.brand_id=p_brand_id)
      and (not p_in_stock_only or stock.is_published and stock.freshness_state='authoritative' and stock.available_quantity>0)
      and (nullif(btrim(p_search),'') is null or lower(product.sku) like '%'||lower(btrim(p_search))||'%' or lower(product.name) like '%'||lower(btrim(p_search))||'%' or lower(coalesce(model.display_value,'')) like '%'||lower(btrim(p_search))||'%')
  ), page as (select * from base order by lower(name),id limit p_limit offset p_offset)
  select jsonb_build_object('totalCount',(select count(*) from base),'items',coalesce(jsonb_agg(jsonb_build_object(
    'id',page.id,'sku',page.sku,'model',page.model,'name',page.name,'imageUrl',page.image_url,
    'categoryId',page.category_id,'categoryName',page.category_name,'brandId',page.brand_id,'brandName',page.brand_name,
    'availableQuantity',page.available_quantity,'currentPrice',page.current_price,'promoPrice',page.promo_price
  ) order by lower(page.name),page.id),'[]'::jsonb)) into v_result from page;
  return coalesce(v_result,jsonb_build_object('totalCount',0,'items','[]'::jsonb));
end $$;

create or replace function public.get_commercial_campaign_builder_options_v2(p_search text default '')
returns jsonb language plpgsql stable security definer set search_path='' set row_security=off as $$
declare v_initial jsonb;
begin
  if auth.uid() is null or not (public.has_internal_permission('campaigns.create') or public.has_internal_permission('campaigns.edit')) then raise exception 'Forbidden' using errcode='42501'; end if;
  v_initial:=public.search_commercial_campaign_products_v2(coalesce(p_search,''),null,null,false,25,0);
  return jsonb_build_object(
    'products',coalesce(v_initial->'items','[]'::jsonb),'productTotalCount',coalesce((v_initial->>'totalCount')::integer,0),
    'categories',(select coalesce(jsonb_agg(jsonb_build_object('id',category.id,'parentId',category.parent_id,'name',category.name) order by category.sort_order,lower(category.name),category.id),'[]'::jsonb) from public.catalog_categories category where category.is_active),
    'brands',(select coalesce(jsonb_agg(jsonb_build_object('id',brand.id,'name',brand.name) order by brand.sort_order,lower(brand.name),brand.id),'[]'::jsonb) from public.catalog_brands brand where brand.is_active),
    'companies',coalesce((public.search_commercial_campaign_companies_v1('',25,0))->'items','[]'::jsonb),
    'priceProfiles',(select coalesce(jsonb_agg(jsonb_build_object('reference',profile.external_ref,'code',profile.external_code,'name',profile.name,'currency','USD') order by profile.id),'[]'::jsonb) from public.price_types profile where profile.is_active and profile.external_ref='b9f5d585-dab1-11e9-8a58-000c29cf9dd4' and profile.external_code='UU-000021' and profile.name='PROMO' and upper(coalesce(nullif(btrim(profile.currency_code),''),''))='USD' and exists(select 1 from public.product_prices price where price.price_type_id=profile.id and price.is_active and price.is_published and price.currency_status='resolved' and upper(coalesce(nullif(btrim(price.currency),''),''))='USD' and price.price_amount>0 and price.valid_from<=now() and (price.valid_to is null or price.valid_to>=now()))),
    'assets',(select coalesce(jsonb_agg(jsonb_build_object('path',asset.path,'label',asset.label) order by lower(asset.label),asset.path),'[]'::jsonb) from public.commercial_campaign_assets asset where asset.is_active)
  );
end $$;

create or replace function public.get_admin_commercial_campaign_v2(p_campaign_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' set row_security=off as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.has_internal_permission('campaigns.view') then raise exception 'Forbidden' using errcode='42501'; end if;
  select jsonb_build_object(
    'campaign',to_jsonb(campaign),
    'items',(select coalesce(jsonb_agg(to_jsonb(item)||jsonb_build_object(
      'sku',product.sku,'productName',product.name,'model',model.display_value,'imageUrl',product.image_url,
      'categoryId',product.category_id,'categoryName',category.name,'brandId',product.brand_id,'brandName',brand.name,
      'availableQuantity',case when stock.is_published and stock.freshness_state='authoritative' then stock.available_quantity end,
      'currentPrice',case when price.price_amount is null then null else jsonb_build_object('amount',price.price_amount,'currency',price.currency) end,
      'promoPrice',case when promo_price.price_amount is null then null else jsonb_build_object('amount',promo_price.price_amount,'currency','USD') end
    ) order by item.sort_order,item.id),'[]'::jsonb)
      from public.commercial_campaign_items item join public.catalog_products product on product.id=item.product_id
      left join public.catalog_categories category on category.id=product.category_id
      left join public.catalog_brands brand on brand.id=product.brand_id
      left join public.product_stock_totals stock on stock.product_id=product.id
      left join lateral(select attribute.display_value from public.catalog_product_attributes attribute where attribute.product_id=product.id and attribute.is_visible and lower(attribute.attribute_key) in ('model','model_name') order by attribute.is_filterable desc,attribute.id limit 1) model on true
      left join lateral(select product_price.price_amount,product_price.currency from public.product_prices product_price join public.price_types price_type on price_type.id=product_price.price_type_id where product_price.product_id=product.id and price_type.external_code='UU-000020' and product_price.is_active and product_price.is_published and product_price.currency_status='resolved' order by product_price.effective_at desc,product_price.id desc limit 1) price on true
      left join lateral(select pp.price_amount from public.product_prices pp join public.price_types pt on pt.id=pp.price_type_id where pp.product_id=product.id and pt.external_ref='b9f5d585-dab1-11e9-8a58-000c29cf9dd4' and pt.external_code='UU-000021' and pt.name='PROMO' and pt.is_active and upper(coalesce(nullif(btrim(pt.currency_code),''),''))='USD' and pp.is_active and pp.is_published and pp.currency_status='resolved' and upper(coalesce(nullif(btrim(pp.currency),''),''))='USD' and pp.price_amount>0 and pp.valid_from<=now() and (pp.valid_to is null or pp.valid_to>=now()) order by pp.valid_from desc,pp.updated_at desc,pp.id limit 1) promo_price on true
      where item.campaign_id=campaign.id),
    'rules',(select coalesce(jsonb_agg(to_jsonb(rule)||jsonb_build_object('companyName',company.display_name) order by rule.id),'[]'::jsonb) from public.commercial_campaign_audience_rules rule left join public.partner_companies company on rule.rule_type='explicit_company' and company.id=(rule.criterion->>'companyId')::uuid where rule.campaign_id=campaign.id),
    'audience',(select coalesce(jsonb_agg(to_jsonb(audience) order by audience.company_id),'[]'::jsonb) from public.commercial_campaign_audience_snapshots audience where audience.campaign_id=campaign.id and audience.version_number=campaign.current_version),
    'analytics',jsonb_build_object(
      'impressions',(select count(*) from public.commercial_campaign_engagement_events where campaign_id=campaign.id and event_type='impression'),
      'opens',(select count(*) from public.commercial_campaign_engagement_events where campaign_id=campaign.id and event_type='detail_opened'),
      'carts',(select count(*) from public.commercial_campaign_engagement_events where campaign_id=campaign.id and event_type='added_to_cart'),
      'orders',(select count(distinct order_id) from public.commercial_campaign_order_attributions where campaign_id=campaign.id),
      'attributedQuantity',(select coalesce(sum(quantity),0) from public.commercial_campaign_order_attributions where campaign_id=campaign.id)
    )
  ) into v_result from public.commercial_campaigns campaign where campaign.id=p_campaign_id;
  return v_result;
end $$;

alter function public.apply_commercial_campaign_draft_v2(uuid,integer,uuid,jsonb,uuid) rename to apply_commercial_campaign_draft_pre_promo_v3;
revoke all on function public.apply_commercial_campaign_draft_pre_promo_v3(uuid,integer,uuid,jsonb,uuid) from public,anon,authenticated;
create function public.apply_commercial_campaign_draft_v2(p_campaign_id uuid,p_expected_revision integer,p_request_id uuid,p_input jsonb,p_actor uuid) returns jsonb language plpgsql security definer set search_path='' set row_security=off as $$
declare v_item jsonb;v_sku text;
begin
 if coalesce(jsonb_typeof(p_input->'items'),'')='array' then for v_item in select value from jsonb_array_elements(p_input->'items') loop
  if v_item->>'benefitType'='informational_only' and nullif(btrim(coalesce(v_item->>'governedBenefitReference','')),'') is not null then raise exception 'CAMPAIGN_PROFILE_INVALID' using errcode='22023';end if;
  if v_item->>'benefitType'='existing_price_profile' then
   if v_item->>'governedBenefitReference'<>'b9f5d585-dab1-11e9-8a58-000c29cf9dd4' then raise exception 'CAMPAIGN_PROMO_PROFILE_REQUIRED' using errcode='22023';end if;
   select product.sku into v_sku from public.catalog_products product where product.id=(v_item->>'productId')::uuid;
   if not exists(select 1 from public.price_types profile join public.product_prices price on price.price_type_id=profile.id and price.product_id=(v_item->>'productId')::uuid where profile.is_active and profile.external_ref='b9f5d585-dab1-11e9-8a58-000c29cf9dd4' and profile.external_code='UU-000021' and profile.name='PROMO' and upper(coalesce(nullif(btrim(profile.currency_code),''),''))='USD' and price.is_active and price.is_published and price.currency_status='resolved' and upper(coalesce(nullif(btrim(price.currency),''),''))='USD' and price.price_amount>0 and price.valid_from<=now() and (price.valid_to is null or price.valid_to>=now())) then raise exception 'CAMPAIGN_PROMO_PRICE_MISSING:%',coalesce(v_sku,v_item->>'productId') using errcode='23514';end if;
  end if;
 end loop;end if;
 return public.apply_commercial_campaign_draft_pre_promo_v3(p_campaign_id,p_expected_revision,p_request_id,p_input,p_actor);
end $$;
revoke all on function public.apply_commercial_campaign_draft_v2(uuid,integer,uuid,jsonb,uuid) from public,anon,authenticated;
alter function public.publish_commercial_campaign(uuid,uuid) rename to publish_commercial_campaign_pre_promo_v3;
revoke all on function public.publish_commercial_campaign_pre_promo_v3(uuid,uuid) from public,anon,authenticated;
create function public.publish_commercial_campaign(p_campaign_id uuid,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' set row_security=off as $$
declare v_sku text;
begin
 if auth.uid() is null or not public.has_internal_permission('campaigns.publish') then raise exception 'Forbidden' using errcode='42501';end if;
 if exists(select 1 from public.commercial_campaign_items item where item.campaign_id=p_campaign_id and item.benefit_type='existing_price_profile' and item.governed_benefit_reference<>'b9f5d585-dab1-11e9-8a58-000c29cf9dd4') then raise exception 'CAMPAIGN_PROMO_PROFILE_REQUIRED' using errcode='23514';end if;
 select product.sku into v_sku from public.commercial_campaign_items item join public.catalog_products product on product.id=item.product_id where item.campaign_id=p_campaign_id and item.benefit_type='existing_price_profile' and not exists(select 1 from public.price_types profile join public.product_prices price on price.price_type_id=profile.id and price.product_id=item.product_id where profile.is_active and profile.external_ref='b9f5d585-dab1-11e9-8a58-000c29cf9dd4' and profile.external_code='UU-000021' and profile.name='PROMO' and upper(coalesce(nullif(btrim(profile.currency_code),''),''))='USD' and price.is_active and price.is_published and price.currency_status='resolved' and upper(coalesce(nullif(btrim(price.currency),''),''))='USD' and price.price_amount>0 and price.valid_from<=now() and (price.valid_to is null or price.valid_to>=now())) order by item.sort_order,item.id limit 1;
 if v_sku is not null then raise exception 'CAMPAIGN_PROMO_PRICE_MISSING:%',v_sku using errcode='23514';end if;
 return public.publish_commercial_campaign_pre_promo_v3(p_campaign_id,p_request_id);
end $$;
revoke all on function public.publish_commercial_campaign(uuid,uuid) from public,anon;
grant execute on function public.publish_commercial_campaign(uuid,uuid) to authenticated;

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
        and item.governed_benefit_reference = 'b9f5d585-dab1-11e9-8a58-000c29cf9dd4'
        and profile.external_ref = 'b9f5d585-dab1-11e9-8a58-000c29cf9dd4'
        and profile.external_code = 'UU-000021'
        and profile.name = 'PROMO'
        and upper(coalesce(nullif(btrim(profile.currency_code), ''), '')) = 'USD'
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
        and item.governed_benefit_reference = 'b9f5d585-dab1-11e9-8a58-000c29cf9dd4'
        and profile.external_ref = 'b9f5d585-dab1-11e9-8a58-000c29cf9dd4'
        and profile.external_code = 'UU-000021'
        and profile.name = 'PROMO'
        and upper(coalesce(nullif(btrim(profile.currency_code), ''), '')) = 'USD'
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

revoke all on function public.list_partner_commercial_campaigns(uuid,text,integer,integer) from public,anon;
grant execute on function public.list_partner_commercial_campaigns(uuid,text,integer,integer) to authenticated;
revoke all on function public.get_partner_commercial_campaign(uuid,uuid) from public,anon;
grant execute on function public.get_partner_commercial_campaign(uuid,uuid) to authenticated;
comment on function public.apply_commercial_campaign_draft_v2(uuid,integer,uuid,jsonb,uuid) is 'Enforces PROMO as the sole Special Offers price profile and requires a current published USD PROMO price before draft mutation.';
comment on function public.publish_commercial_campaign(uuid,uuid) is 'Fails closed unless every governed Special Offer item uses exact active USD PROMO with a current published price.';
commit;