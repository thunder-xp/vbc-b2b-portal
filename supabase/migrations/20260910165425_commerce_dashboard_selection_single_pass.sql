begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create function public.get_or_refresh_partner_dashboard_selections_v5(
  p_user_id uuid,
  p_company_id uuid,
  p_login_generation text,
  p_repeat_period_days integer default 365,
  p_popular_period_days integer default 365,
  p_new_period_days integer default 365
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  company_price_type_ref text;
  previous_products jsonb := '[]'::jsonb;
  popular_products jsonb := '[]'::jsonb;
  new_products jsonb := '[]'::jsonb;
  editorial_products jsonb := '[]'::jsonb;
  previous_count integer := 0;
  popular_count integer := 0;
  new_count integer := 0;
  editorial_count integer := 0;
  previous_fingerprint text := '';
  editorial_fingerprint text := '';
  business_date date := (statement_timestamp() at time zone 'Europe/Chisinau')::date;
begin
  if p_user_id is null or p_company_id is null
    or nullif(btrim(p_login_generation), '') is null
    or length(p_login_generation) > 100
    or p_repeat_period_days not in (30, 60, 90, 365)
    or p_popular_period_days not in (30, 60, 90, 365)
    or p_new_period_days not in (30, 60, 90, 365)
    or not exists (
      select 1
      from public.company_memberships membership
      join public.partner_companies company on company.id = membership.company_id
      join public.user_profiles profile on profile.id = membership.user_id
      where membership.user_id = p_user_id
        and membership.company_id = p_company_id
        and membership.status = 'active'
        and company.status = 'active'
        and profile.status = 'active'
    )
  then
    raise exception 'Dashboard selection access denied.' using errcode = '42501';
  end if;

  select company.external_1c_price_type_id
  into company_price_type_ref
  from public.partner_companies company
  where company.id = p_company_id and company.status = 'active';

  with evidence as materialized (
    select item.product_id,
      count(distinct history.id)::integer as purchase_count,
      count(distinct history.id)::integer as completed_count,
      max(history.one_c_document_date) as last_purchased_at,
      round(avg(item.quantity), 0) as typical_quantity
    from public.partner_order_history history
    join public.partner_order_history_items item on item.order_history_id = history.id
    join public.catalog_products product
      on product.id = item.product_id and product.is_active and product.is_visible
    where history.company_id = p_company_id
      and history.partner_visible and history.one_c_posted
      and not history.one_c_deletion_mark
      and history.one_c_state_code = 'completed'
      and history.origin_type <> 'internal_1c'
      and history.one_c_document_date >= (
        ((business_date - (p_repeat_period_days - 1))::timestamp) at time zone 'Europe/Chisinau')
      and history.one_c_document_date < (
        ((business_date + 1)::timestamp) at time zone 'Europe/Chisinau')
      and item.product_id is not null and item.quantity > 0
      and nullif(btrim(product.external_1c_id), '') is not null
    group by item.product_id
  ), chosen as (
    select * from evidence
    order by pg_catalog.md5(p_login_generation || ':' || product_id::text), product_id
    limit 12
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', product.id, 'sku', product.sku, 'name', product.name,
      'slug', product.slug, 'imageUrl', coalesce(product.image_source_url, product.image_url),
      'categoryId', product.category_id, 'categoryName', category.name,
      'labelCodes', '[]'::jsonb,
      'purchaseCount', chosen.purchase_count,
      'completedPurchaseCount', chosen.completed_count,
      'lastPurchasedAt', chosen.last_purchased_at,
      'typicalQuantity', chosen.typical_quantity
    ) order by pg_catalog.md5(p_login_generation || ':' || product.id::text)), '[]'::jsonb),
    (select count(*) from evidence),
    pg_catalog.md5(concat_ws('|', p_repeat_period_days::text,
      coalesce(max(chosen.last_purchased_at)::text, ''),
      (select count(*)::text from evidence)))
  into previous_products, previous_count, previous_fingerprint
  from chosen
  join public.catalog_products product on product.id = chosen.product_id
  left join public.catalog_categories category on category.id = product.category_id;

  with candidates as (
    select ranking.*, count(*) over ()::integer as total_count
    from public.b2b_product_demand_ranking ranking
    join public.catalog_products product
      on product.id = ranking.product_id and product.is_active and product.is_visible
    where ranking.period_days = p_popular_period_days and ranking.purchase_frequency > 0
  ), chosen as (
    select * from candidates
    order by pg_catalog.md5(p_login_generation || ':' || product_id::text), product_id
    limit 5
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', product.id, 'sku', product.sku, 'name', product.name,
      'slug', product.slug, 'imageUrl', coalesce(product.image_source_url, product.image_url),
      'categoryId', product.category_id, 'categoryName', category.name,
      'labelCodes', '["TOP"]'::jsonb, 'sourceCodes', '["TOP"]'::jsonb
    ) order by pg_catalog.md5(p_login_generation || ':' || product.id::text)), '[]'::jsonb),
    coalesce(max(chosen.total_count), 0)
  into popular_products, popular_count
  from chosen
  join public.catalog_products product on product.id = chosen.product_id
  left join public.catalog_categories category on category.id = product.category_id;

  with candidates as (
    select fact.*, count(*) over ()::integer as total_count
    from public.catalog_product_new_facts fact
    join public.catalog_products product
      on product.id = fact.product_id and product.is_active and product.is_visible
    where coalesce((select state.automated_new_activated
      from public.catalog_product_new_state state where state.singleton_key = 1), false)
      and fact.market_entry_at is not null
      and fact.source_status <> 'market_entry_before_creation'
      and fact.market_entry_at::date between business_date - (p_new_period_days - 1) and business_date
  ), chosen as (
    select * from candidates
    order by pg_catalog.md5(p_login_generation || ':' || product_id::text), product_id
    limit 5
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', product.id, 'sku', product.sku, 'name', product.name,
      'slug', product.slug, 'imageUrl', coalesce(product.image_source_url, product.image_url),
      'categoryId', product.category_id, 'categoryName', category.name,
      'labelCodes', '["NEW"]'::jsonb, 'sourceCodes', '["NEW"]'::jsonb
    ) order by pg_catalog.md5(p_login_generation || ':' || product.id::text)), '[]'::jsonb),
    coalesce(max(chosen.total_count), 0)
  into new_products, new_count
  from chosen
  join public.catalog_products product on product.id = chosen.product_id
  left join public.catalog_categories category on category.id = product.category_id;

  with editorial_sources as (
    select assignment.product_id, 'HOT'::text as source_code,
      max(assignment.priority)::integer as priority
    from public.product_merchandising_assignments assignment
    where assignment.label_code = 'HOT'
      and assignment.is_active and assignment.is_curated_visible
      and assignment.revoked_at is null
      and assignment.source in ('manual', 'one_c')
      and assignment.starts_at <= now()
      and (assignment.ends_at is null or assignment.ends_at > now())
    group by assignment.product_id
    union all
    select arrival.product_id, 'ARRIVAL'::text, 0
    from public.product_supplier_arrivals arrival
    where arrival.is_published and arrival.expected_quantity > 0
      and arrival.expected_arrival_date >= current_date
    group by arrival.product_id
  ), eligible as materialized (
    select source.product_id,
      array_agg(distinct source.source_code order by source.source_code) as source_codes,
      array_agg(distinct source.source_code order by source.source_code)
        filter (where source.source_code = 'HOT') as label_codes,
      max(source.priority)::integer as priority
    from editorial_sources source
    join public.catalog_products product
      on product.id = source.product_id and product.is_active and product.is_visible
    where nullif(btrim(product.external_1c_id), '') is not null
      and exists (
        select 1 from public.product_prices price
        where price.product_id = source.product_id
          and price.external_1c_price_type_id = company_price_type_ref
          and (price.company_id is null or price.company_id = p_company_id)
          and price.is_active and price.is_published and price.price_amount > 0
          and price.valid_from <= now()
          and (price.valid_to is null or price.valid_to >= now())
      )
      and (
        exists (select 1 from public.product_stock_totals stock
          where stock.product_id = source.product_id
            and stock.is_published and stock.available_quantity > 0)
        or exists (select 1 from public.product_supplier_arrivals arrival
          where arrival.product_id = source.product_id
            and arrival.is_published and arrival.expected_quantity > 0
            and arrival.expected_arrival_date >= current_date)
      )
    group by source.product_id
  ), candidates as (
    select eligible.*, count(*) over ()::integer as total_count
    from eligible
  ), chosen as (
    select * from candidates
    order by priority desc,
      pg_catalog.md5(p_login_generation || ':' || product_id::text), product_id
    limit 5
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', product.id, 'sku', product.sku, 'name', product.name,
      'slug', product.slug,
      'imageUrl', coalesce(product.image_source_url, product.image_url, (
        select image.url from public.catalog_product_images image
        where image.product_id = product.id
        order by image.is_primary desc, image.sort_order, image.id limit 1)),
      'categoryId', product.category_id, 'categoryName', category.name,
      'labelCodes', to_jsonb(coalesce(chosen.label_codes, '{}'::text[])),
      'sourceCodes', to_jsonb(chosen.source_codes)
    ) order by chosen.priority desc,
      pg_catalog.md5(p_login_generation || ':' || product.id::text), product.id), '[]'::jsonb),
    coalesce(max(chosen.total_count), 0)
  into editorial_products, editorial_count
  from chosen
  join public.catalog_products product on product.id = chosen.product_id
  left join public.catalog_categories category on category.id = product.category_id;

  select pg_catalog.md5(concat_ws('|',
    count(*)::text,
    coalesce(max(source.changed_at)::text, ''),
    coalesce(max(source.business_date)::text, '')
  ))
  into editorial_fingerprint
  from (
    select assignment.updated_at as changed_at, null::date as business_date
    from public.product_merchandising_assignments assignment
    where assignment.label_code = 'HOT'
      and assignment.is_active and assignment.is_curated_visible and assignment.revoked_at is null
    union all
    select arrival.published_at, arrival.expected_arrival_date
    from public.product_supplier_arrivals arrival
    where arrival.is_published and arrival.expected_quantity > 0
      and arrival.expected_arrival_date >= current_date
  ) source;

  return jsonb_build_object(
    'snapshotHit', false,
    'previousSourceFingerprint', coalesce(previous_fingerprint, ''),
    'offerSourceFingerprint', coalesce(editorial_fingerprint, ''),
    'previousProducts', previous_products,
    'popularProducts', popular_products,
    'newProducts', new_products,
    'merchandisingProducts', editorial_products,
    'previousCandidateCount', previous_count,
    'popularCandidateCount', popular_count,
    'newCandidateCount', new_count,
    'offerCandidateCount', editorial_count,
    'rotationBucket', 0
  );
end;
$$;

revoke all on function public.get_or_refresh_partner_dashboard_selections_v5(
  uuid, uuid, text, integer, integer, integer
) from public, anon, authenticated;
grant execute on function public.get_or_refresh_partner_dashboard_selections_v5(
  uuid, uuid, text, integer, integer, integer
) to service_role;

comment on function public.get_or_refresh_partner_dashboard_selections_v5(
  uuid, uuid, text, integer, integer, integer
) is 'Single-pass company-validated Dashboard projection: bounded Repeat/Popular/NEW previews plus HOT/ARRIVAL editorial products; no legacy selection fanout.';

commit;
