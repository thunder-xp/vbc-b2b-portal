begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public.get_partner_previously_purchased_products_v2(
  p_company_id uuid,
  p_category_id uuid default null,
  p_search text default null,
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
  actor uuid := auth.uid();
  can_view_partner_price boolean;
  can_view_retail_price boolean;
  can_view_stock boolean;
  partner_price_type_ref text;
  normalized_search text := nullif(btrim(p_search), '');
  result jsonb;
begin
  if actor is null
    or not public.has_active_company_membership(p_company_id)
    or not public.has_permission(p_company_id, 'orders.view')
    or not public.has_permission(p_company_id, 'catalog.view')
  then
    raise exception 'Previously purchased products access denied.' using errcode = '42501';
  end if;

  if p_limit not between 1 and 24
    or p_offset not between 0 and 5000
    or length(coalesce(normalized_search, '')) > 100
  then
    raise exception 'Invalid previously purchased products page.' using errcode = '22023';
  end if;

  select company.external_1c_price_type_id
  into partner_price_type_ref
  from public.partner_companies company
  where company.id = p_company_id and company.status = 'active';

  if not found then
    raise exception 'Previously purchased products access denied.' using errcode = '42501';
  end if;

  can_view_partner_price := public.has_permission(p_company_id, 'pricing.partner_price.view');
  can_view_retail_price := public.has_permission(p_company_id, 'pricing.retail_price.view');
  can_view_stock := public.has_permission(p_company_id, 'stock.view');

  with completed_order_products as materialized (
    select
      history.id as order_id,
      item.product_id,
      history.one_c_document_date as purchased_at,
      sum(item.quantity)::numeric as quantity
    from public.partner_order_history history
    join public.partner_order_history_items item
      on item.order_history_id = history.id
     and item.product_id is not null
     and item.quantity > 0
    where history.company_id = p_company_id
      and history.partner_visible
      and history.one_c_posted
      and not history.one_c_deletion_mark
      and history.one_c_state_code = 'completed'
      and history.origin_type <> 'internal_1c'
      and history.one_c_document_date <= now()
    group by history.id, item.product_id, history.one_c_document_date
  ), purchase_evidence as materialized (
    select
      purchase.product_id,
      count(*)::integer as purchase_count,
      sum(purchase.quantity)::numeric as total_quantity,
      max(purchase.purchased_at) as last_purchased_at,
      (array_agg(purchase.quantity order by purchase.purchased_at desc, purchase.order_id desc))[1]::numeric as last_quantity
    from completed_order_products purchase
    group by purchase.product_id
  ), historical_products as materialized (
    select
      product.id,
      product.sku,
      product.name,
      product.slug,
      coalesce(product.image_source_url, product.image_url, (
        select image.url
        from public.catalog_product_images image
        where image.product_id = product.id
        order by image.is_primary desc, image.sort_order, image.id
        limit 1
      )) as image_url,
      brand.id as brand_id,
      brand.name as brand_name,
      brand.slug as brand_slug,
      category.id as category_id,
      category.parent_id as category_parent_id,
      category.name as category_name,
      category.slug as category_slug,
      evidence.purchase_count,
      evidence.total_quantity,
      evidence.last_purchased_at,
      evidence.last_quantity,
      exists (
        select 1
        from public.partner_commercial_opportunities opportunity
        where opportunity.company_id = p_company_id
          and opportunity.recipient_user_id = actor
          and opportunity.product_id = product.id
          and opportunity.opportunity_type = 'repeat_purchase_available'
          and opportunity.status = 'active'
          and opportunity.expires_at > now()
          and not exists (
            select 1
            from public.partner_commercial_opportunity_dismissals dismissal
            where dismissal.recipient_user_id = actor
              and dismissal.commercial_state_fingerprint = opportunity.commercial_state_fingerprint
          )
      ) as repeat_purchase_due
    from purchase_evidence evidence
    join public.catalog_products product
      on product.id = evidence.product_id
     and product.is_active
     and product.is_visible
     and nullif(btrim(product.external_1c_id), '') is not null
    left join public.catalog_brands brand on brand.id = product.brand_id and brand.is_active
    left join public.catalog_categories category on category.id = product.category_id and category.is_active
    where normalized_search is null
      or position(lower(normalized_search) in lower(concat_ws(' ', product.sku, product.name))) > 0
  ), category_facets as (
    select product.category_id as id, max(product.category_name) as name,
      max(product.category_slug) as slug, count(*)::integer as product_count
    from historical_products product
    where product.category_id is not null and product.category_name is not null and product.category_slug is not null
    group by product.category_id
  ), filtered_products as materialized (
    select product.*
    from historical_products product
    where p_category_id is null or product.category_id = p_category_id
  ), commercial as (
    select
      product.*,
      partner_price.price_amount as partner_price_amount,
      partner_price.currency as partner_price_currency,
      partner_price.currency_status as partner_price_currency_status,
      partner_price.updated_at as partner_price_updated_at,
      retail_price.price_amount as retail_price_amount,
      case when retail_price.price_amount is null then null else 'MDL' end as retail_price_currency,
      retail_price.currency_status as retail_price_currency_status,
      retail_price.updated_at as retail_price_updated_at,
      msrp_price.price_amount as msrp_price_amount,
      case when msrp_price.price_amount is null then null else 'USD' end as msrp_price_currency,
      msrp_price.currency_status as msrp_price_currency_status,
      msrp_price.updated_at as msrp_price_updated_at,
      stock.physical_quantity,
      stock.reserved_quantity,
      stock.available_quantity,
      stock.incoming_quantity,
      stock.has_variant_stock,
      stock.synced_at as stock_synced_at,
      arrival.expected_arrival_date,
      arrival.expected_quantity,
      arrival.published_at as arrival_published_at,
      rates.partner_rate,
      rates.retail_rate,
      rates.partner_rate_published_at,
      rates.retail_rate_published_at,
      coalesce(labels.label_codes, '{}'::text[]) as label_codes
    from filtered_products product
    cross join lateral (
      select
        max(rate) filter (where purpose = 'partner_price_usd_to_mdl') as partner_rate,
        max(rate) filter (where purpose = 'retail_price_usd_to_mdl') as retail_rate,
        max(published_at) filter (where purpose = 'partner_price_usd_to_mdl') as partner_rate_published_at,
        max(published_at) filter (where purpose = 'retail_price_usd_to_mdl') as retail_rate_published_at
      from public.commercial_exchange_rates
      where (can_view_partner_price or can_view_retail_price) and is_active and is_published
        and purpose in ('partner_price_usd_to_mdl', 'retail_price_usd_to_mdl')
    ) rates
    left join lateral (
      select price.price_amount, price.currency, price.currency_status, price.updated_at
      from public.product_prices price
      where can_view_partner_price and partner_price_type_ref is not null
        and price.product_id = product.id
        and price.external_1c_price_type_id = partner_price_type_ref
        and (price.company_id is null or price.company_id = p_company_id)
        and price.is_active and price.is_published and price.price_amount > 0
        and price.valid_from <= now() and (price.valid_to is null or price.valid_to >= now())
      order by (price.company_id = p_company_id) desc, price.valid_from desc, price.updated_at desc, price.id
      limit 1
    ) partner_price on true
    left join lateral (
      select price.price_amount, price.currency_status, price.updated_at
      from public.product_prices price
      where can_view_retail_price and price.product_id = product.id and price.company_id is null
        and price.external_1c_price_type_id = 'e181c772-93fc-11e9-94cb-000c2988d323'
        and price.is_active and price.is_published and price.currency_status = 'resolved'
        and upper(btrim(price.currency)) in ('MDL', '498') and price.price_amount > 0
        and price.valid_from <= now() and (price.valid_to is null or price.valid_to >= now())
      order by price.valid_from desc, price.updated_at desc, price.id
      limit 1
    ) retail_price on true
    left join lateral (
      select price.price_amount, price.currency_status, price.updated_at
      from public.product_prices price
      where can_view_retail_price and price.product_id = product.id and price.company_id is null
        and price.external_1c_price_type_id = 'd9c92519-658b-11e8-80d3-000c29a58b59'
        and price.is_active and price.is_published and price.currency_status = 'resolved'
        and upper(btrim(price.currency)) in ('USD', '840') and price.price_amount > 0
        and price.valid_from <= now() and (price.valid_to is null or price.valid_to >= now())
      order by price.valid_from desc, price.updated_at desc, price.id
      limit 1
    ) msrp_price on true
    left join public.product_stock_totals stock
      on can_view_stock and stock.product_id = product.id and stock.is_published
    left join lateral (
      select supplier.expected_arrival_date, sum(supplier.expected_quantity)::numeric as expected_quantity,
        max(supplier.published_at) as published_at
      from public.product_supplier_arrivals supplier
      where can_view_stock and supplier.product_id = product.id
        and supplier.external_characteristic_ref = '00000000-0000-0000-0000-000000000000'
        and supplier.is_published and supplier.expected_quantity > 0
        and supplier.expected_arrival_date >= current_date
      group by supplier.expected_arrival_date
      order by supplier.expected_arrival_date
      limit 1
    ) arrival on true
    left join lateral (
      select array_agg(distinct assignment.label_code::text order by assignment.label_code::text) as label_codes
      from public.product_merchandising_assignments assignment
      where assignment.product_id = product.id and assignment.is_active
        and assignment.is_curated_visible and assignment.revoked_at is null
        and assignment.starts_at <= now() and (assignment.ends_at is null or assignment.ends_at > now())
        and assignment.label_code in ('HOT', 'NEW', 'TOP')
    ) labels on true
  ), page as (
    select item.* from commercial item
    order by item.repeat_purchase_due desc,
      case when item.partner_price_amount > 0 and item.available_quantity > 0 then 0
        when item.partner_price_amount > 0 then 1 else 2 end,
      item.last_purchased_at desc, item.purchase_count desc, item.id
    limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'id', item.id, 'sku', item.sku, 'name', item.name, 'slug', item.slug,
      'image_url', item.image_url,
      'brand_id', item.brand_id, 'brand_name', item.brand_name, 'brand_slug', item.brand_slug,
      'category_id', item.category_id, 'category_parent_id', item.category_parent_id,
      'category_name', item.category_name, 'category_slug', item.category_slug,
      'partner_price_amount', item.partner_price_amount, 'partner_price_currency', item.partner_price_currency,
      'partner_price_currency_status', item.partner_price_currency_status, 'partner_price_updated_at', item.partner_price_updated_at,
      'retail_price_amount', item.retail_price_amount, 'retail_price_currency', item.retail_price_currency,
      'retail_price_currency_status', item.retail_price_currency_status, 'retail_price_updated_at', item.retail_price_updated_at,
      'msrp_price_amount', item.msrp_price_amount, 'msrp_price_currency', item.msrp_price_currency,
      'msrp_price_currency_status', item.msrp_price_currency_status, 'msrp_price_updated_at', item.msrp_price_updated_at,
      'physical_quantity', item.physical_quantity, 'reserved_quantity', item.reserved_quantity,
      'available_quantity', item.available_quantity, 'incoming_quantity', item.incoming_quantity,
      'has_variant_stock', item.has_variant_stock, 'stock_synced_at', item.stock_synced_at,
      'expected_arrival_date', item.expected_arrival_date, 'expected_quantity', item.expected_quantity,
      'arrival_published_at', item.arrival_published_at,
      'partner_rate', item.partner_rate, 'retail_rate', item.retail_rate,
      'partner_rate_published_at', item.partner_rate_published_at, 'retail_rate_published_at', item.retail_rate_published_at,
      'can_view_stock', can_view_stock, 'merchandising_labels', to_jsonb(item.label_codes),
      'key_characteristics', '[]'::jsonb,
      'purchase_count', item.purchase_count, 'total_quantity', item.total_quantity,
      'last_purchased_at', item.last_purchased_at, 'last_quantity', item.last_quantity,
      'repeat_purchase_due', item.repeat_purchase_due
    ) order by item.repeat_purchase_due desc,
      case when item.partner_price_amount > 0 and item.available_quantity > 0 then 0
        when item.partner_price_amount > 0 then 1 else 2 end,
      item.last_purchased_at desc, item.purchase_count desc, item.id) from page item), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(jsonb_build_object(
      'id', category.id, 'name', category.name, 'slug', category.slug,
      'productCount', category.product_count
    ) order by category.name, category.id) from category_facets category), '[]'::jsonb),
    'totalCount', (select count(*) from commercial)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_partner_previously_purchased_products_v2(uuid, uuid, text, integer, integer)
  from public, anon;
grant execute on function public.get_partner_previously_purchased_products_v2(uuid, uuid, text, integer, integer)
  to authenticated;

comment on function public.get_partner_previously_purchased_products_v2(uuid, uuid, text, integer, integer) is
  'Returns one bounded company-authorized page of distinct completed-history products with category facets and current governed partner, RETAIL, MSRP, stock, arrival, and rate projections.';

create or replace function public.get_or_refresh_partner_dashboard_selections_v2(
  p_user_id uuid,
  p_company_id uuid,
  p_login_generation text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  base_result jsonb;
  company_price_type_ref text;
  rotation integer;
  offer_ids uuid[] := '{}';
  offer_count integer := 0;
  previous_count integer := 0;
  offer_products jsonb := '[]'::jsonb;
  arrival_fingerprint text;
begin
  if p_user_id is null or p_company_id is null
    or nullif(btrim(p_login_generation), '') is null
    or length(p_login_generation) > 100
    or not exists (
      select 1
      from public.company_memberships membership
      join public.partner_companies company on company.id = membership.company_id
      join public.user_profiles profile on profile.id = membership.user_id
      where membership.user_id = p_user_id and membership.company_id = p_company_id
        and membership.status = 'active' and company.status = 'active' and profile.status = 'active'
    )
  then
    raise exception 'Dashboard selection access denied.' using errcode = '42501';
  end if;

  select company.external_1c_price_type_id into company_price_type_ref
  from public.partner_companies company
  where company.id = p_company_id and company.status = 'active';

  base_result := public.get_or_refresh_partner_dashboard_selections(
    p_user_id,
    p_company_id,
    'commerce-history-v2:' || p_login_generation
  );
  rotation := coalesce((base_result ->> 'rotationBucket')::integer, 0);

  select count(distinct item.product_id)::integer
  into previous_count
  from public.partner_order_history history
  join public.partner_order_history_items item on item.order_history_id = history.id
  join public.catalog_products product on product.id = item.product_id and product.is_active and product.is_visible
  where history.company_id = p_company_id and history.partner_visible and history.one_c_posted
    and not history.one_c_deletion_mark and history.one_c_state_code = 'completed'
    and history.origin_type <> 'internal_1c' and history.one_c_document_date <= now()
    and item.product_id is not null and item.quantity > 0
    and nullif(btrim(product.external_1c_id), '') is not null;

  with merchandising_sources as (
    select assignment.product_id, assignment.label_code::text as source_code,
      max(assignment.priority)::integer as priority
    from public.product_merchandising_assignments assignment
    where assignment.is_active and assignment.is_curated_visible and assignment.revoked_at is null
      and assignment.source in ('manual', 'one_c')
      and assignment.starts_at <= now() and (assignment.ends_at is null or assignment.ends_at > now())
      and assignment.label_code in ('HOT', 'NEW', 'TOP')
    group by assignment.product_id, assignment.label_code
  ), arrival_sources as (
    select arrival.product_id, 'ARRIVAL'::text as source_code, 0::integer as priority
    from public.product_supplier_arrivals arrival
    where arrival.is_published and arrival.expected_quantity > 0
      and arrival.expected_arrival_date >= current_date
    group by arrival.product_id
  ), candidate_sources as (
    select * from merchandising_sources
    union all
    select * from arrival_sources
  ), eligible as materialized (
    select source.product_id,
      coalesce(array_agg(distinct source.source_code order by source.source_code), '{}'::text[]) as source_codes,
      coalesce(array_agg(distinct source.source_code order by source.source_code)
        filter (where source.source_code in ('HOT', 'NEW', 'TOP')), '{}'::text[]) as label_codes,
      max(source.priority) as priority,
      md5(source.product_id::text || ':' || rotation::text) as rotation_rank
    from candidate_sources source
    join public.catalog_products product on product.id = source.product_id and product.is_active and product.is_visible
    where nullif(btrim(product.external_1c_id), '') is not null
      and exists (
        select 1 from public.product_prices price
        where price.product_id = source.product_id
          and price.external_1c_price_type_id = company_price_type_ref
          and (price.company_id is null or price.company_id = p_company_id)
          and price.is_active and price.is_published and price.price_amount > 0
          and price.valid_from <= now() and (price.valid_to is null or price.valid_to >= now())
      )
      and (
        exists (select 1 from public.product_stock_totals stock
          where stock.product_id = source.product_id and stock.is_published and stock.available_quantity > 0)
        or exists (select 1 from public.product_supplier_arrivals arrival
          where arrival.product_id = source.product_id and arrival.is_published and arrival.expected_quantity > 0
            and arrival.expected_arrival_date >= current_date)
      )
    group by source.product_id
  ), source_ranked as (
    select candidate.product_id, source.code,
      row_number() over (partition by source.code order by candidate.priority desc, candidate.rotation_rank, candidate.product_id) as source_rank
    from eligible candidate
    cross join lateral unnest(candidate.source_codes) source(code)
  ), required_products as (
    select ranked.product_id,
      min(case ranked.code when 'HOT' then 1 when 'NEW' then 2 when 'TOP' then 3 else 4 end) as rank
    from source_ranked ranked where ranked.source_rank = 1
    group by ranked.product_id
  ), remaining as (
    select candidate.product_id,
      10 + row_number() over (order by candidate.priority desc, candidate.rotation_rank, candidate.product_id) as rank
    from eligible candidate
    where not exists (select 1 from required_products required where required.product_id = candidate.product_id)
  ), combined as (
    select * from required_products union all select * from remaining
  )
  select
    coalesce(array_agg(chosen.product_id order by chosen.rank), '{}'),
    (select count(*) from eligible)
  into offer_ids, offer_count
  from (select * from combined order by rank limit 12) chosen;

  select md5(concat_ws('|',
    coalesce(max(arrival.published_at)::text, ''),
    count(distinct arrival.product_id)::text,
    coalesce(max(arrival.expected_arrival_date)::text, '')
  )) into arrival_fingerprint
  from public.product_supplier_arrivals arrival
  where arrival.is_published and arrival.expected_quantity > 0 and arrival.expected_arrival_date >= current_date;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', product.id, 'sku', product.sku, 'name', product.name, 'slug', product.slug,
    'imageUrl', coalesce(product.image_source_url, product.image_url, (
      select image.url from public.catalog_product_images image where image.product_id = product.id
      order by image.is_primary desc, image.sort_order, image.id limit 1
    )),
    'categoryId', product.category_id, 'categoryName', category.name,
    'labelCodes', coalesce((select jsonb_agg(label order by label) from (
      select distinct assignment.label_code::text as label
      from public.product_merchandising_assignments assignment
      where assignment.product_id = product.id and assignment.is_active and assignment.is_curated_visible
        and assignment.revoked_at is null and assignment.starts_at <= now()
        and (assignment.ends_at is null or assignment.ends_at > now())
        and assignment.label_code in ('HOT', 'NEW', 'TOP')
    ) labels), '[]'::jsonb),
    'sourceCodes', to_jsonb(array_remove(array[
      case when exists (select 1 from public.product_merchandising_assignments assignment
        where assignment.product_id = product.id and assignment.is_active and assignment.is_curated_visible
          and assignment.revoked_at is null and assignment.starts_at <= now()
          and (assignment.ends_at is null or assignment.ends_at > now()) and assignment.label_code = 'HOT') then 'HOT' end,
      case when exists (select 1 from public.product_merchandising_assignments assignment
        where assignment.product_id = product.id and assignment.is_active and assignment.is_curated_visible
          and assignment.revoked_at is null and assignment.starts_at <= now()
          and (assignment.ends_at is null or assignment.ends_at > now()) and assignment.label_code = 'NEW') then 'NEW' end,
      case when exists (select 1 from public.product_merchandising_assignments assignment
        where assignment.product_id = product.id and assignment.is_active and assignment.is_curated_visible
          and assignment.revoked_at is null and assignment.starts_at <= now()
          and (assignment.ends_at is null or assignment.ends_at > now()) and assignment.label_code = 'TOP') then 'TOP' end,
      case when exists (select 1 from public.product_supplier_arrivals arrival
        where arrival.product_id = product.id and arrival.is_published and arrival.expected_quantity > 0
          and arrival.expected_arrival_date >= current_date) then 'ARRIVAL' end
    ], null))
  ) order by selected.ordinality), '[]'::jsonb)
  into offer_products
  from unnest(offer_ids) with ordinality selected(product_id, ordinality)
  join public.catalog_products product on product.id = selected.product_id
  left join public.catalog_categories category on category.id = product.category_id;

  return base_result || jsonb_build_object(
    'previousCandidateCount', previous_count,
    'offerCandidateCount', offer_count,
    'offerSourceFingerprint', md5(coalesce(base_result ->> 'offerSourceFingerprint', '') || ':' || coalesce(arrival_fingerprint, '')),
    'merchandisingProducts', offer_products
  );
end;
$$;

revoke all on function public.get_or_refresh_partner_dashboard_selections_v2(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.get_or_refresh_partner_dashboard_selections_v2(uuid, uuid, text)
  to service_role;

comment on function public.get_or_refresh_partner_dashboard_selections_v2(uuid, uuid, text) is
  'Returns one company-validated, login-stable Dashboard product projection with exact eligible counts and governed merchandising/arrival source mixing; commercial values remain in live batch projections.';

commit;
