begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

alter table public.b2b_product_demand_ranking
  drop constraint b2b_product_demand_ranking_period_check,
  add constraint b2b_product_demand_ranking_period_check
    check (period_days in (30, 60, 90, 365));

alter table public.b2b_product_demand_ranking_state
  drop constraint b2b_product_demand_ranking_state_period_check,
  add constraint b2b_product_demand_ranking_state_period_check
    check (period_days in (30, 60, 90, 365));

-- Keep one periodized projection and extend its atomic refresh to 365. The
-- quantity column remains diagnostic; ranking and membership use frequency.
do $$
declare definition text; changed text;
begin
  select pg_get_functiondef(procedure.oid) into definition
  from pg_proc procedure join pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public' and procedure.proname = 'refresh_b2b_product_demand_ranking';
  if definition is null then raise exception 'Required popularity refresh is missing.'; end if;
  changed := replace(definition,
    'values (30::smallint), (60::smallint), (90::smallint)',
    'values (30::smallint), (60::smallint), (90::smallint), (365::smallint)');
  changed := replace(changed,
    E'where ranking.period_days = 30\n        and ranking.product_id = assignment.product_id\n        and ranking.popularity_rank <= 40',
    E'where ranking.period_days = 365\n        and ranking.product_id = assignment.product_id');
  changed := replace(changed,
    'where ranking.period_days = 30 and ranking.popularity_rank <= 40',
    'where ranking.period_days = 365');
  changed := replace(changed,
    'Outside current automated rolling-30 frequency Top 40',
    'Outside current automated rolling-365 purchase-frequency pool');
  changed := replace(changed,
    'Automated rolling-30 purchase-frequency rank ',
    'Automated rolling-365 purchase-frequency rank ');
  changed := replace(changed,
    E'where ranking.period_days = period.period_days and ranking.popularity_rank <= 40)',
    E'where ranking.period_days = period.period_days)');
  changed := replace(changed,
    E'(select ranking.purchase_frequency\n      from public.b2b_product_demand_ranking ranking\n      where ranking.period_days = period.period_days\n        and ranking.popularity_rank = 40)',
    'null');
  changed := replace(changed,
    E',\n    ''top40ThresholdFrequency'', state.top_40_threshold_frequency',
    '');
  changed := replace(changed,
    E',\n    ''top40ThresholdFrequency'', (select top_40_threshold_frequency from public.b2b_product_demand_ranking_state where period_days = 30)',
    '');
  changed := replace(changed, 'where period_days = 30)', 'where period_days = 365)');
  changed := replace(changed,
    '''windowStart'', governed_business_date - 29',
    '''windowStart'', governed_business_date - 364');
  if changed = definition
    or changed not like '%(365::smallint)%'
    or changed like '%ranking.popularity_rank <= 40%'
    or changed like '%popularity_rank = 40%'
    or changed like '%top40ThresholdFrequency%'
    or changed not like '%ranking.period_days = 365%'
  then raise exception 'Could not derive unified all-product popularity refresh.';
  end if;
  execute changed;
end;
$$;

create function public.get_published_product_merchandising_v6(
  p_company_id uuid,
  p_label_code text default null,
  p_limit_per_label integer default 5,
  p_rotation_seed text default null,
  p_popular_period_days integer default 365,
  p_new_period_days integer default 365
)
returns table(
  product_id uuid, label_code text, priority integer,
  starts_at timestamptz, ends_at timestamptz, source text,
  matching_product_count integer
)
language plpgsql stable security definer
set search_path = '' set row_security = off
as $$
declare
  new_activated boolean := coalesce((select state.automated_new_activated
    from public.catalog_product_new_state state where state.singleton_key = 1), false);
  business_date date := (statement_timestamp() at time zone 'Europe/Chisinau')::date;
begin
  if auth.uid() is null
    or not public.has_active_company_membership(p_company_id)
    or not public.has_permission(p_company_id, 'catalog.view')
  then raise exception 'Catalog merchandising access denied.' using errcode = '42501';
  end if;
  if (p_label_code is not null and p_label_code not in ('NEW', 'TOP', 'HOT'))
    or p_limit_per_label not between 1 and 24
    or p_popular_period_days not in (30, 60, 90, 365)
    or p_new_period_days not in (30, 60, 90, 365)
    or (p_rotation_seed is not null and char_length(p_rotation_seed) > 128)
  then raise exception 'Invalid merchandising projection input.' using errcode = '22023';
  end if;

  return query
  with sources as (
    select ranking.product_id, 'TOP'::text as label_code,
      (1000000 - ranking.popularity_rank)::integer as priority,
      ranking.refreshed_at as starts_at, null::timestamptz as ends_at,
      'one_c'::text as source,
      null::timestamp without time zone as market_entry_at,
      null::timestamp without time zone as source_created_at
    from public.b2b_product_demand_ranking ranking
    join public.catalog_products product
      on product.id = ranking.product_id and product.is_active and product.is_visible
    where ranking.period_days = p_popular_period_days
      and ranking.purchase_frequency > 0
      and (p_label_code is null or p_label_code = 'TOP')
    union all
    select fact.product_id, 'NEW',
      greatest(0, 1000 - (business_date - fact.market_entry_at::date)),
      fact.market_entry_at at time zone 'Europe/Chisinau',
      ((fact.market_entry_at::date + p_new_period_days)::timestamp at time zone 'Europe/Chisinau'),
      'one_c', fact.market_entry_at, fact.source_created_at
    from public.catalog_product_new_facts fact
    join public.catalog_products product
      on product.id = fact.product_id and product.is_active and product.is_visible
    where new_activated and fact.market_entry_at is not null
      and fact.source_status <> 'market_entry_before_creation'
      and fact.market_entry_at::date between business_date - (p_new_period_days - 1) and business_date
      and (p_label_code is null or p_label_code = 'NEW')
    union all
    select assignment.product_id, assignment.label_code::text,
      assignment.priority, assignment.starts_at, assignment.ends_at,
      assignment.source::text, null::timestamp without time zone,
      null::timestamp without time zone
    from public.product_merchandising_assignments assignment
    join public.catalog_products product
      on product.id = assignment.product_id and product.is_active and product.is_visible
    where assignment.label_code = 'HOT'
      and assignment.is_active and assignment.is_curated_visible
      and assignment.revoked_at is null
      and assignment.source in ('manual', 'one_c')
      and assignment.starts_at <= now()
      and (assignment.ends_at is null or assignment.ends_at > now())
      and (p_label_code is null or assignment.label_code = p_label_code)
  ), ranked as (
    select sources.*,
      row_number() over (partition by sources.label_code order by
        case when sources.label_code in ('TOP', 'NEW') and p_rotation_seed is not null
          then pg_catalog.md5(p_rotation_seed || ':' || sources.product_id::text) end,
        case when sources.label_code = 'TOP' and p_rotation_seed is null then sources.priority end desc,
        case when sources.label_code = 'NEW' and p_rotation_seed is null then sources.market_entry_at end desc nulls last,
        case when sources.label_code = 'NEW' and p_rotation_seed is null then sources.source_created_at end desc nulls last,
        sources.priority desc, sources.product_id) as label_rank,
      count(*) over (partition by sources.label_code)::integer as total_count
    from sources
  )
  select ranked.product_id, ranked.label_code, ranked.priority,
    ranked.starts_at, ranked.ends_at, ranked.source, ranked.total_count
  from ranked where ranked.label_rank <= p_limit_per_label
  order by case ranked.label_code when 'TOP' then 1 when 'NEW' then 2 else 3 end,
    ranked.label_rank;
end;
$$;

revoke all on function public.get_published_product_merchandising_v6(
  uuid, text, integer, text, integer, integer
) from public, anon;
grant execute on function public.get_published_product_merchandising_v6(
  uuid, text, integer, text, integer, integer
) to authenticated;

-- Reuse the existing commercial catalog projection; only remove its Top-40
-- predicate and let both governed selections accept the same four periods.
do $$
declare definition text; changed text;
begin
  select pg_get_functiondef(procedure.oid) into definition
  from pg_proc procedure join pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public' and procedure.proname = 'catalog_partner_page_new_period_base';
  if definition is null then raise exception 'Required NEW-aware catalog base is missing.'; end if;
  changed := replace(definition, 'FUNCTION public.catalog_partner_page_new_period_base(',
    'FUNCTION public.catalog_partner_page_unified_period_base(');
  changed := replace(changed, 'and ranking.popularity_rank <= 40', '');
  if changed = definition or changed like '%ranking.popularity_rank <= 40%' then
    raise exception 'Could not derive all-product partner catalog base.';
  end if;
  execute changed;

  select pg_get_functiondef(procedure.oid) into definition
  from pg_proc procedure join pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public' and procedure.proname = 'catalog_partner_page_new_period_v6';
  changed := replace(definition, 'FUNCTION public.catalog_partner_page_new_period_v6(',
    'FUNCTION public.catalog_partner_page_unified_period_v6(');
  changed := replace(changed, 'public.catalog_partner_page_new_period_base(',
    'public.catalog_partner_page_unified_period_base(');
  if changed = definition then raise exception 'Could not derive unified characteristic projection.'; end if;
  execute changed;

  select pg_get_functiondef(procedure.oid) into definition
  from pg_proc procedure join pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public' and procedure.proname = 'catalog_partner_page_new_period_v7';
  changed := replace(definition, 'FUNCTION public.catalog_partner_page_new_period_v7(',
    'FUNCTION public.catalog_partner_page_unified_period_v7(');
  changed := replace(changed, 'public.catalog_partner_page_new_period_v6(',
    'public.catalog_partner_page_unified_period_v6(');
  if changed = definition then raise exception 'Could not derive unified retail projection.'; end if;
  execute changed;
end;
$$;

revoke all on function public.catalog_partner_page_unified_period_base(
  uuid, uuid, uuid[], uuid, text, text, jsonb, text, text, integer, integer, integer
), public.catalog_partner_page_unified_period_v6(
  uuid, uuid, uuid[], uuid, text, text, jsonb, text, text, integer, integer, integer
), public.catalog_partner_page_unified_period_v7(
  uuid, uuid, uuid[], uuid, text, text, jsonb, text, text, integer, integer, integer
) from public, anon, authenticated, service_role;

create function public.catalog_partner_page_v11(
  p_company_id uuid, p_category_id uuid default null,
  p_category_ids uuid[] default null, p_brand_id uuid default null,
  p_search text default null, p_availability text default 'all',
  p_filters jsonb default '{}'::jsonb,
  p_merchandising_label text default null, p_sort text default 'default',
  p_limit integer default 12, p_offset integer default 0,
  p_period_days integer default 365
)
returns jsonb language plpgsql stable security definer
set search_path = '' set row_security = off
as $$
declare payload jsonb; items jsonb;
begin
  if p_period_days not in (30, 60, 90, 365) then
    raise exception 'Invalid merchandising period.' using errcode = '22023';
  end if;
  if p_merchandising_label is null or p_merchandising_label not in ('TOP', 'NEW') then
    return public.catalog_partner_page_v10(
      p_company_id, p_category_id, p_category_ids, p_brand_id, p_search,
      p_availability, p_filters, p_merchandising_label, p_sort,
      p_limit, p_offset, 30);
  end if;
  payload := public.catalog_partner_page_unified_period_v7(
    p_company_id, p_category_id, p_category_ids, p_brand_id, p_search,
    p_availability, p_filters, p_merchandising_label, p_sort,
    p_limit, p_offset, p_period_days);
  select coalesce(jsonb_agg(
    case when coalesce(source.item -> 'merchandising_labels', '[]'::jsonb) ? p_merchandising_label
      then source.item else jsonb_set(source.item, '{merchandising_labels}',
        coalesce(source.item -> 'merchandising_labels', '[]'::jsonb) || to_jsonb(p_merchandising_label)) end
    order by source.ordinal), '[]'::jsonb)
  into items from jsonb_array_elements(coalesce(payload -> 'items', '[]'::jsonb))
    with ordinality source(item, ordinal);
  return payload || jsonb_build_object('items', items);
end;
$$;

revoke all on function public.catalog_partner_page_v11(
  uuid, uuid, uuid[], uuid, text, text, jsonb, text, text, integer, integer, integer
) from public, anon;
grant execute on function public.catalog_partner_page_v11(
  uuid, uuid, uuid[], uuid, text, text, jsonb, text, text, integer, integer, integer
) to authenticated;

do $$
declare definition text; changed text;
begin
  select pg_get_functiondef(procedure.oid) into definition
  from pg_proc procedure join pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public' and procedure.proname = 'catalog_partner_facets_v5';
  if definition is null then raise exception 'Required partner facets are missing.'; end if;
  changed := replace(definition, 'FUNCTION public.catalog_partner_facets_v5(',
    'FUNCTION public.catalog_partner_facets_v6(');
  changed := replace(changed, 'and ranking.popularity_rank <= 40', '');
  if changed = definition or changed like '%ranking.popularity_rank <= 40%' then
    raise exception 'Could not derive all-product partner facets.';
  end if;
  execute changed;
end;
$$;

revoke all on function public.catalog_partner_facets_v6(
  uuid, uuid, uuid[], uuid, text, text, jsonb, text, integer, integer
) from public, anon;
grant execute on function public.catalog_partner_facets_v6(
  uuid, uuid, uuid[], uuid, text, text, jsonb, text, integer, integer
) to authenticated;

do $$
declare definition text; changed text;
begin
  select pg_get_functiondef(procedure.oid) into definition
  from pg_proc procedure join pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public' and procedure.proname = 'get_partner_previously_purchased_products_v4';
  if definition is null then raise exception 'Required Repeat Purchase reader is missing.'; end if;
  changed := replace(definition, 'FUNCTION public.get_partner_previously_purchased_products_v4(',
    'FUNCTION public.get_partner_previously_purchased_products_v5(');
  changed := replace(changed, 'p_period_days integer DEFAULT 30', 'p_period_days integer DEFAULT 365');
  changed := replace(changed, 'p_period_days not in (30, 60, 90)',
    'p_period_days not in (30, 60, 90, 365)');
  if changed = definition or changed not like '%365%' then
    raise exception 'Could not derive hidden-365 Repeat Purchase reader.';
  end if;
  execute changed;
end;
$$;

revoke all on function public.get_partner_previously_purchased_products_v5(
  uuid, uuid[], text, integer, integer, integer
) from public, anon;
grant execute on function public.get_partner_previously_purchased_products_v5(
  uuid, uuid[], text, integer, integer, integer
) to authenticated;

create function public.list_public_retail_products_v6(
  p_locale text default 'ru', p_category_slug text default null,
  p_search text default null, p_availability text default null,
  p_facets jsonb default '{}'::jsonb, p_mode text default null,
  p_limit integer default 24, p_offset integer default 0,
  p_period_days integer default 365
)
returns jsonb language plpgsql stable security definer
set search_path = '' set row_security = off
as $$
declare result jsonb;
begin
  if p_locale not in ('ru', 'ro') or p_period_days not in (30, 60, 90, 365)
    or p_limit not between 1 and 48 or p_offset < 0 or p_offset > 10000
    or (p_mode is not null and p_mode not in ('popular', 'new', 'special', 'replenishment', 'price_asc', 'price_desc'))
    or (p_availability is not null and p_availability not in ('in_stock', 'low_stock', 'available_to_order', 'unavailable', 'unknown'))
    or (p_search is not null and char_length(btrim(p_search)) > 100)
    or jsonb_typeof(p_facets) <> 'object'
    or (select count(*) from jsonb_object_keys(p_facets)) > 8
    or exists (select 1 from jsonb_each(p_facets) selected(key, values)
      where char_length(selected.key) > 160 or jsonb_typeof(selected.values) <> 'array'
        or jsonb_array_length(selected.values) not between 1 and 10
        or exists (select 1 from jsonb_array_elements(selected.values) value
          where jsonb_typeof(value) <> 'string' or char_length(value #>> '{}') > 1000))
  then raise exception 'Public Retail selection period is invalid.' using errcode = '22023';
  end if;
  if p_mode = 'new' then
    return public.list_public_retail_products_v5(p_locale, p_category_slug, p_search,
      p_availability, p_facets, p_mode, p_limit, p_offset, p_period_days);
  end if;
  if p_mode is distinct from 'popular' or nullif(btrim(p_search), '') is not null then
    return public.list_public_retail_products_v5(p_locale, p_category_slug, p_search,
      p_availability, p_facets, p_mode, p_limit, p_offset, 30);
  end if;
  with current_products as (
    select product as product_row, ranking.popularity_rank
    from public.public_retail_products product
    join public.public_retail_publications publication
      on publication.id = product.publication_id and publication.status = 'published'
    join public.public_retail_product_identities identity on identity.public_id = product.public_id
    join public.b2b_product_demand_ranking ranking
      on ranking.product_id = identity.source_product_id
     and ranking.period_days = p_period_days and ranking.purchase_frequency > 0
    where (p_category_slug is null or exists (select 1 from jsonb_array_elements(product.category_path) path where path ->> 'slug' = p_category_slug))
      and (p_availability is null or product.availability = p_availability)
      and not exists (select 1 from jsonb_each(p_facets) selected(key, values)
        where not exists (select 1 from jsonb_array_elements(product.specifications) specification
          where specification ->> 'key' = selected.key
            and specification ->> 'value' in (select jsonb_array_elements_text(selected.values))))
  ), page as (
    select * from current_products order by popularity_rank, (product_row).sku, (product_row).public_id
    limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(public.build_public_retail_product_summary(page.product_row, p_locale)
      || jsonb_build_object('isPopular', true)
      order by page.popularity_rank, (page.product_row).sku, (page.product_row).public_id), '[]'::jsonb),
    'totalCount', (select count(*) from current_products), 'limit', p_limit, 'offset', p_offset)
  into result from page;
  return coalesce(result, jsonb_build_object('items', '[]'::jsonb, 'totalCount', 0, 'limit', p_limit, 'offset', p_offset));
end;
$$;

revoke all on function public.list_public_retail_products_v6(
  text, text, text, text, jsonb, text, integer, integer, integer
) from public;
grant execute on function public.list_public_retail_products_v6(
  text, text, text, text, jsonb, text, integer, integer, integer
) to anon, authenticated;

create function public.get_public_retail_showcase_v6(
  p_locale text default 'ru', p_rotation_seed text default null,
  p_popular_period_days integer default 365,
  p_new_period_days integer default 365
)
returns jsonb language plpgsql stable security definer
set search_path = '' set row_security = off
as $$
declare base jsonb; popular_items jsonb; popular_total integer;
  new_items jsonb; new_total integer;
begin
  if p_locale not in ('ru', 'ro')
    or p_popular_period_days not in (30, 60, 90, 365)
    or p_new_period_days not in (30, 60, 90, 365)
    or p_rotation_seed is null
    or p_rotation_seed !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then raise exception 'Public Retail showcase input is invalid.' using errcode = '22023'; end if;
  base := public.get_public_retail_showcase_v3(p_locale, p_rotation_seed);

  with candidates as (
    select product, pg_catalog.md5(p_rotation_seed || ':' || product.public_id::text) session_rank,
      count(*) over ()::integer total_count
    from public.public_retail_products product
    join public.public_retail_publications publication on publication.id = product.publication_id and publication.status = 'published'
    join public.public_retail_product_identities identity on identity.public_id = product.public_id
    join public.b2b_product_demand_ranking ranking on ranking.product_id = identity.source_product_id
      and ranking.period_days = p_popular_period_days and ranking.purchase_frequency > 0
  ), selected as (select * from candidates order by session_rank, (product).public_id limit 5)
  select coalesce(jsonb_agg(public.build_public_retail_product_summary(selected.product, p_locale)
      || jsonb_build_object('isPopular', true)
      order by selected.session_rank, (selected.product).public_id), '[]'::jsonb),
    coalesce(max(selected.total_count), 0) into popular_items, popular_total from selected;

  with candidates as (
    select product, pg_catalog.md5(p_rotation_seed || ':' || product.public_id::text) session_rank,
      count(*) over ()::integer total_count
    from public.public_retail_products product
    join public.public_retail_publications publication on publication.id = product.publication_id and publication.status = 'published'
    join public.public_retail_product_identities identity on identity.public_id = product.public_id
    join public.catalog_product_new_facts fact on fact.product_id = identity.source_product_id
      and fact.market_entry_at is not null and fact.source_status <> 'market_entry_before_creation'
      and fact.market_entry_at::date between (statement_timestamp() at time zone 'Europe/Chisinau')::date - (p_new_period_days - 1)
        and (statement_timestamp() at time zone 'Europe/Chisinau')::date
  ), selected as (select * from candidates order by session_rank, (product).public_id limit 5)
  select coalesce(jsonb_agg(public.build_public_retail_product_summary(selected.product, p_locale)
      order by selected.session_rank, (selected.product).public_id), '[]'::jsonb),
    coalesce(max(selected.total_count), 0) into new_items, new_total from selected;

  return base || jsonb_build_object('popular', popular_items, 'new', new_items,
    'totalCounts', (base -> 'totalCounts') || jsonb_build_object('popular', popular_total, 'new', new_total));
end;
$$;

revoke all on function public.get_public_retail_showcase_v6(text, text, integer, integer)
  from public;
grant execute on function public.get_public_retail_showcase_v6(text, text, integer, integer)
  to anon, authenticated;

create function public.get_or_refresh_partner_dashboard_selections_v4(
  p_user_id uuid, p_company_id uuid, p_login_generation text,
  p_repeat_period_days integer default 365,
  p_popular_period_days integer default 365,
  p_new_period_days integer default 365
)
returns jsonb language plpgsql security definer
set search_path = '' set row_security = off
as $$
declare base_result jsonb; previous_products jsonb := '[]'; popular_products jsonb := '[]'; new_products jsonb := '[]';
  editorial_products jsonb := '[]'; previous_count integer := 0; popular_count integer := 0; new_count integer := 0;
  previous_fingerprint text; business_date date := (statement_timestamp() at time zone 'Europe/Chisinau')::date;
begin
  if p_repeat_period_days not in (30,60,90,365) or p_popular_period_days not in (30,60,90,365)
    or p_new_period_days not in (30,60,90,365)
  then raise exception 'Invalid Dashboard selection period.' using errcode = '22023'; end if;
  base_result := public.get_or_refresh_partner_dashboard_selections_v2(p_user_id, p_company_id,
    pg_catalog.md5('unified:' || p_repeat_period_days || ':' || p_popular_period_days || ':' || p_new_period_days || ':' || p_login_generation));

  with evidence as materialized (
    select item.product_id, count(distinct history.id)::integer purchase_count,
      count(distinct history.id)::integer completed_count, max(history.one_c_document_date) last_purchased_at,
      round(avg(item.quantity), 0) typical_quantity
    from public.partner_order_history history join public.partner_order_history_items item on item.order_history_id = history.id
    join public.catalog_products product on product.id = item.product_id and product.is_active and product.is_visible
    where history.company_id = p_company_id and history.partner_visible and history.one_c_posted
      and not history.one_c_deletion_mark and history.one_c_state_code = 'completed' and history.origin_type <> 'internal_1c'
      and history.one_c_document_date >= (((business_date - (p_repeat_period_days - 1))::timestamp) at time zone 'Europe/Chisinau')
      and history.one_c_document_date < (((business_date + 1)::timestamp) at time zone 'Europe/Chisinau')
      and item.product_id is not null and item.quantity > 0 and nullif(btrim(product.external_1c_id), '') is not null
    group by item.product_id
  ), chosen as (select * from evidence order by pg_catalog.md5(p_login_generation || ':' || product_id::text), product_id limit 12)
  select coalesce(jsonb_agg(jsonb_build_object('id', product.id, 'sku', product.sku, 'name', product.name,
    'slug', product.slug, 'imageUrl', coalesce(product.image_source_url, product.image_url),
    'categoryId', product.category_id, 'categoryName', category.name, 'labelCodes', '[]'::jsonb,
    'purchaseCount', chosen.purchase_count, 'completedPurchaseCount', chosen.completed_count,
    'lastPurchasedAt', chosen.last_purchased_at, 'typicalQuantity', chosen.typical_quantity)
    order by pg_catalog.md5(p_login_generation || ':' || product.id::text)), '[]'::jsonb),
    (select count(*) from evidence), pg_catalog.md5(concat_ws('|', p_repeat_period_days::text,
      coalesce(max(chosen.last_purchased_at)::text, ''), (select count(*)::text from evidence)))
  into previous_products, previous_count, previous_fingerprint from chosen
  join public.catalog_products product on product.id = chosen.product_id
  left join public.catalog_categories category on category.id = product.category_id;

  with candidates as (
    select ranking.*, count(*) over ()::integer total_count from public.b2b_product_demand_ranking ranking
    join public.catalog_products product on product.id = ranking.product_id and product.is_active and product.is_visible
    where ranking.period_days = p_popular_period_days and ranking.purchase_frequency > 0
  ), chosen as (select * from candidates order by pg_catalog.md5(p_login_generation || ':' || product_id::text), product_id limit 5)
  select coalesce(jsonb_agg(jsonb_build_object('id', product.id, 'sku', product.sku, 'name', product.name,
    'slug', product.slug, 'imageUrl', coalesce(product.image_source_url, product.image_url),
    'categoryId', product.category_id, 'categoryName', category.name, 'labelCodes', '["TOP"]'::jsonb,
    'sourceCodes', '["TOP"]'::jsonb) order by pg_catalog.md5(p_login_generation || ':' || product.id::text)), '[]'::jsonb),
    coalesce(max(chosen.total_count), 0) into popular_products, popular_count from chosen
  join public.catalog_products product on product.id = chosen.product_id left join public.catalog_categories category on category.id = product.category_id;

  with candidates as (
    select fact.*, count(*) over ()::integer total_count from public.catalog_product_new_facts fact
    join public.catalog_products product on product.id = fact.product_id and product.is_active and product.is_visible
    where coalesce((select state.automated_new_activated from public.catalog_product_new_state state where state.singleton_key = 1), false)
      and fact.market_entry_at is not null and fact.source_status <> 'market_entry_before_creation'
      and fact.market_entry_at::date between business_date - (p_new_period_days - 1) and business_date
  ), chosen as (select * from candidates order by pg_catalog.md5(p_login_generation || ':' || product_id::text), product_id limit 5)
  select coalesce(jsonb_agg(jsonb_build_object('id', product.id, 'sku', product.sku, 'name', product.name,
    'slug', product.slug, 'imageUrl', coalesce(product.image_source_url, product.image_url),
    'categoryId', product.category_id, 'categoryName', category.name, 'labelCodes', '["NEW"]'::jsonb,
    'sourceCodes', '["NEW"]'::jsonb) order by pg_catalog.md5(p_login_generation || ':' || product.id::text)), '[]'::jsonb),
    coalesce(max(chosen.total_count), 0) into new_products, new_count from chosen
  join public.catalog_products product on product.id = chosen.product_id left join public.catalog_categories category on category.id = product.category_id;

  select coalesce(jsonb_agg(item), '[]'::jsonb) into editorial_products
  from jsonb_array_elements(coalesce(base_result -> 'merchandisingProducts', '[]'::jsonb)) item
  where coalesce(item -> 'sourceCodes', '[]'::jsonb) ?| array['HOT','ARRIVAL']
    or coalesce(item -> 'labelCodes', '[]'::jsonb) ? 'HOT';

  return base_result || jsonb_build_object(
    'previousProducts', previous_products, 'previousCandidateCount', previous_count,
    'previousSourceFingerprint', previous_fingerprint,
    'popularProducts', popular_products, 'popularCandidateCount', popular_count,
    'newProducts', new_products, 'newCandidateCount', new_count,
    'merchandisingProducts', editorial_products,
    'offerCandidateCount', jsonb_array_length(editorial_products));
end;
$$;

revoke all on function public.get_or_refresh_partner_dashboard_selections_v4(
  uuid, uuid, text, integer, integer, integer
) from public, anon, authenticated;
grant execute on function public.get_or_refresh_partner_dashboard_selections_v4(
  uuid, uuid, text, integer, integer, integer
) to service_role;

comment on table public.b2b_product_demand_ranking is
  'Internal shared 30/60/90/365-day B2B purchase-frequency ranking. All positive-frequency products remain eligible; quantity is diagnostic only.';
comment on function public.refresh_b2b_product_demand_ranking() is
  'AUTOMATION_FIRST: atomically rebuilds the four inclusive Europe/Chisinau popularity windows from authoritative order history.';
comment on function public.get_partner_previously_purchased_products_v5(uuid, uuid[], text, integer, integer, integer) is
  'AUTOMATION_FIRST: company-authorized Repeat Purchase reader; hidden default 365 and explicit 30/60/90 use one governed order-history contract.';

select public.refresh_b2b_product_demand_ranking();

commit;
