begin;

create or replace function public.list_admin_products_without_retail_history(
  p_search text default null,
  p_category_id uuid default null,
  p_reason text default null,
  p_page integer default 1,
  p_page_size integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  normalized_search text := nullif(btrim(p_search), '');
  normalized_reason text := nullif(btrim(p_reason), '');
  safe_page integer := greatest(coalesce(p_page, 1), 1);
  safe_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 50);
  result jsonb;
begin
  if not public.has_internal_permission('admin.prices.view') then
    raise exception 'Commercial price diagnostics access is not allowed.'
      using errcode = '42501';
  end if;

  if normalized_reason is not null and normalized_reason not in (
    'no_retail_register_record',
    'baseline_only_new_product',
    'current_price_without_historical_source',
    'source_record_not_currently_authoritative',
    'unknown_requires_review'
  ) then
    raise exception 'Unsupported RETAIL history absence reason.'
      using errcode = '22023';
  end if;

  with
  latest_backfill as (
    select
      (
        select finished_at
        from public.retail_price_history_backfill_runs
        where status = 'succeeded'
        order by finished_at desc nulls last, created_at desc
        limit 1
      ) as finished_at,
      coalesce((
        select unresolved_products
        from public.retail_price_history_backfill_runs
        where status = 'succeeded'
        order by finished_at desc nulls last, created_at desc
        limit 1
      ), 0) as unresolved_products
  ),
  current_retail as (
    select distinct on (price.product_id)
      price.product_id,
      price.price_amount,
      price.currency,
      coalesce(price.effective_at, price.valid_from) as effective_at
    from public.product_prices price
    join public.price_types price_type
      on price_type.id = price.price_type_id
      and price_type.external_ref = 'e181c772-93fc-11e9-94cb-000c2988d323'
      and price_type.external_code = 'UU-000020'
      and price_type.currency_code = 'MDL'
      and price_type.currency_status = 'resolved'
      and price_type.is_active
    where price.company_id is null
      and price.external_1c_price_type_id =
        'e181c772-93fc-11e9-94cb-000c2988d323'
      and price.is_active
      and price.is_published
      and price.currency = 'MDL'
      and price.currency_status = 'resolved'
    order by
      price.product_id,
      coalesce(price.effective_at, price.valid_from) desc,
      price.updated_at desc,
      price.id
  ),
  history_evidence as (
    select
      history.product_id,
      count(*) filter (where history.source = 'one_c_history') as one_c_points,
      count(*) filter (
        where history.source in ('initial_baseline', 'price_sync_snapshot')
      ) as baseline_points,
      min(history.effective_at) filter (
        where history.source in ('initial_baseline', 'price_sync_snapshot')
      ) as first_baseline_at
    from public.product_price_history history
    where history.external_price_type_code = 'UU-000020'
      and history.currency = 'MDL'
    group by history.product_id
  ),
  active_products as (
    select
      product.id,
      product.external_1c_id,
      product.sku,
      product.name,
      coalesce(product.image_source_url, product.image_url) as image_url,
      product.created_at as first_portal_published_at,
      category.id as category_id,
      category.name as category_name,
      brand.id as brand_id,
      brand.name as brand_name,
      current_retail.price_amount as current_retail_price,
      current_retail.currency as current_retail_currency,
      current_retail.effective_at as current_retail_effective_at,
      coalesce(history_evidence.one_c_points, 0) as one_c_points,
      coalesce(history_evidence.baseline_points, 0) as baseline_points,
      history_evidence.first_baseline_at,
      latest_backfill.finished_at as last_backfill_finished_at,
      coalesce(latest_backfill.unresolved_products, 0) as unresolved_products
    from public.catalog_products product
    join public.catalog_sync_state catalog_state
      on catalog_state.id = 'daily_catalog'
      and catalog_state.status = 'succeeded'
      and product.source_root_1c_id = catalog_state.root_external_1c_id
    left join public.catalog_categories category
      on category.id = product.category_id
    left join public.catalog_brands brand
      on brand.id = product.brand_id
    left join current_retail
      on current_retail.product_id = product.id
    left join history_evidence
      on history_evidence.product_id = product.id
    cross join latest_backfill
    where product.is_active
      and product.is_visible
  ),
  classified as (
    select
      active_products.*,
      case
        when one_c_points > 0 then null
        when current_retail_price is null and baseline_points = 0
          then 'no_retail_register_record'
        when current_retail_price is not null
          and baseline_points > 0
          and first_portal_published_at > last_backfill_finished_at
          then 'baseline_only_new_product'
        when current_retail_price is not null
          then 'current_price_without_historical_source'
        when baseline_points > 0
          then 'source_record_not_currently_authoritative'
        else 'unknown_requires_review'
      end as absence_reason
    from active_products
  ),
  missing as (
    select *
    from classified
    where one_c_points = 0
  ),
  filtered as (
    select *
    from missing
    where (
      normalized_search is null
      or position(lower(normalized_search) in lower(sku)) > 0
      or position(lower(normalized_search) in lower(name)) > 0
    )
      and (p_category_id is null or category_id = p_category_id)
      and (normalized_reason is null or absence_reason = normalized_reason)
  ),
  page_rows as (
    select *
    from filtered
    order by lower(name), id
    limit safe_page_size
    offset (safe_page - 1) * safe_page_size
  ),
  summary as (
    select jsonb_build_object(
      'activePartnerVisibleProducts', count(*),
      'productsWithVerifiedHistory',
        count(*) filter (where one_c_points > 0),
      'baselineOnlyProducts',
        count(*) filter (where one_c_points = 0 and baseline_points > 0),
      'productsWithoutRetailRegisterSource',
        count(*) filter (where one_c_points = 0),
      'unresolvedOutOfScopeHistoricalReferences',
        coalesce(max(unresolved_products), 0)
    ) as payload
    from classified
  ),
  categories as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', category_id,
      'name', category_name,
      'count', product_count
    ) order by category_name), '[]'::jsonb) as payload
    from (
      select category_id, coalesce(category_name, 'Без категории') as category_name,
        count(*) as product_count
      from missing
      group by category_id, category_name
    ) category_counts
  ),
  reason_counts as (
    select coalesce(jsonb_object_agg(absence_reason, product_count), '{}'::jsonb)
      as payload
    from (
      select absence_reason, count(*) as product_count
      from missing
      group by absence_reason
    ) counts
  )
  select jsonb_build_object(
    'summary', summary.payload,
    'categories', categories.payload,
    'reasonCounts', reason_counts.payload,
    'page', safe_page,
    'pageSize', safe_page_size,
    'total', (select count(*) from filtered),
    'records', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', page_rows.id,
        'imageUrl', page_rows.image_url,
        'sku', page_rows.sku,
        'name', page_rows.name,
        'categoryId', page_rows.category_id,
        'categoryName', page_rows.category_name,
        'brandName', page_rows.brand_name,
        'portalStatus', 'active_visible',
        'currentRetailPrice', page_rows.current_retail_price,
        'currentRetailCurrency', page_rows.current_retail_currency,
        'currentRetailEffectiveAt', page_rows.current_retail_effective_at,
        'baselineHistoryState', case
          when page_rows.baseline_points > 0 then 'present'
          else 'absent'
        end,
        'firstPortalPublishedAt', page_rows.first_portal_published_at,
        'external1cRef', page_rows.external_1c_id,
        'absenceReason', page_rows.absence_reason
      ) order by lower(page_rows.name), page_rows.id)
      from page_rows
    ), '[]'::jsonb)
  ) into result
  from summary cross join categories cross join reason_counts;

  return result;
end;
$$;

revoke all on function public.list_admin_products_without_retail_history(
  text, uuid, text, integer, integer
) from public, anon;
grant execute on function public.list_admin_products_without_retail_history(
  text, uuid, text, integer, integer
) to authenticated;

comment on function public.list_admin_products_without_retail_history(
  text, uuid, text, integer, integer
) is
  'Read-only bounded admin diagnostic for active visible portal products without canonical RETAIL one_c_history evidence. It never queries 1C or mutates catalog/pricing data.';

commit;
