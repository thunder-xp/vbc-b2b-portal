begin;

alter table public.b2b_product_demand_ranking
  add column purchase_frequency bigint null,
  add column window_start date null,
  add column window_end date null;

alter table public.b2b_product_demand_ranking
  add constraint b2b_product_demand_ranking_purchase_frequency_check
    check (purchase_frequency is null or purchase_frequency > 0),
  add constraint b2b_product_demand_ranking_window_check
    check (window_start is null or window_end is null or window_end - window_start = 364);

alter table public.b2b_product_demand_ranking_state
  add column business_date date null,
  add column window_start date null,
  add column window_end date null,
  add column top_40_threshold_frequency bigint null;

alter table public.b2b_product_demand_ranking_state
  add constraint b2b_product_demand_ranking_state_window_check
    check (window_start is null or window_end is null or window_end - window_start = 364),
  add constraint b2b_product_demand_ranking_state_threshold_frequency_check
    check (top_40_threshold_frequency is null or top_40_threshold_frequency > 0);

create or replace function public.refresh_b2b_product_demand_ranking()
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  refresh_started_at timestamptz := clock_timestamp();
  refresh_completed_at timestamptz;
  target_refresh_id uuid := gen_random_uuid();
  governed_business_date date :=
    (statement_timestamp() at time zone 'Europe/Chisinau')::date;
  governed_window_start date;
  governed_window_end date;
  governed_window_start_at timestamptz;
  governed_window_end_exclusive_at timestamptz;
  eligible_products integer := 0;
  published_products integer := 0;
  source_orders bigint := 0;
  source_lines bigint := 0;
  unresolved_lines bigint := 0;
  history_from timestamptz;
  history_through timestamptz;
  threshold_frequency bigint;
begin
  governed_window_end := governed_business_date;
  governed_window_start := governed_business_date - 364;
  governed_window_start_at :=
    governed_window_start::timestamp at time zone 'Europe/Chisinau';
  governed_window_end_exclusive_at :=
    (governed_window_end + 1)::timestamp at time zone 'Europe/Chisinau';

  perform pg_advisory_xact_lock(
    hashtextextended('b2b-product-demand-ranking-refresh', 0)
  );

  with governed_lines as materialized (
    select
      history.id as authoritative_order_id,
      history.company_id,
      history.one_c_document_date,
      item.product_id,
      item.quantity
    from public.partner_order_history history
    join public.partner_order_history_items item
      on item.order_history_id = history.id
    join public.catalog_products product
      on product.id = item.product_id
     and product.is_active
     and product.is_visible
    where history.partner_visible
      and history.one_c_posted
      and not history.one_c_deletion_mark
      and history.one_c_document_date >= governed_window_start_at
      and history.one_c_document_date < governed_window_end_exclusive_at
      and item.product_id is not null
      and item.quantity > 0
  ), aggregated as (
    select
      governed.product_id,
      count(distinct governed.authoritative_order_id) as purchase_frequency,
      count(distinct governed.company_id)::integer
        as purchasing_company_count,
      count(distinct governed.authoritative_order_id)
        as authoritative_order_count,
      count(*) as authoritative_line_count,
      sum(governed.quantity) as total_purchased_quantity,
      max(governed.one_c_document_date) as last_purchased_at
    from governed_lines governed
    group by governed.product_id
  ), ranked as (
    select
      aggregate.*,
      row_number() over (
        order by
          aggregate.purchase_frequency desc,
          aggregate.purchasing_company_count desc,
          aggregate.last_purchased_at desc,
          product.sku,
          aggregate.product_id
      )::integer as popularity_rank
    from aggregated aggregate
    join public.catalog_products product on product.id = aggregate.product_id
  ), refreshed as (
    insert into public.b2b_product_demand_ranking (
      product_id,
      popularity_rank,
      total_purchased_quantity,
      purchasing_company_count,
      authoritative_order_count,
      authoritative_line_count,
      last_purchased_at,
      refresh_id,
      refreshed_at,
      purchase_frequency,
      window_start,
      window_end
    )
    select
      ranked.product_id,
      ranked.popularity_rank,
      ranked.total_purchased_quantity,
      ranked.purchasing_company_count,
      ranked.authoritative_order_count,
      ranked.authoritative_line_count,
      ranked.last_purchased_at,
      target_refresh_id,
      refresh_started_at,
      ranked.purchase_frequency,
      governed_window_start,
      governed_window_end
    from ranked
    on conflict (product_id) do update
    set popularity_rank = excluded.popularity_rank,
      total_purchased_quantity = excluded.total_purchased_quantity,
      purchasing_company_count = excluded.purchasing_company_count,
      authoritative_order_count = excluded.authoritative_order_count,
      authoritative_line_count = excluded.authoritative_line_count,
      last_purchased_at = excluded.last_purchased_at,
      refresh_id = excluded.refresh_id,
      refreshed_at = excluded.refreshed_at,
      purchase_frequency = excluded.purchase_frequency,
      window_start = excluded.window_start,
      window_end = excluded.window_end
    returning popularity_rank, purchase_frequency
  )
  select
    count(*)::integer,
    max(purchase_frequency) filter (where popularity_rank = 40)
  into eligible_products, threshold_frequency
  from refreshed;

  delete from public.b2b_product_demand_ranking ranking
  where ranking.refresh_id <> target_refresh_id;

  update public.product_merchandising_assignments assignment
  set is_active = false,
    is_curated_visible = false,
    reason = 'Superseded by automated rolling-365 purchase-frequency ranking',
    revoked_at = refresh_started_at,
    updated_at = refresh_started_at
  where assignment.label_code = 'TOP'
    and assignment.source = 'manual'
    and assignment.is_active
    and assignment.revoked_at is null;

  update public.product_merchandising_assignments assignment
  set is_active = false,
    is_curated_visible = false,
    reason = 'Outside current automated rolling-365 frequency Top 40',
    revoked_at = refresh_started_at,
    updated_at = refresh_started_at
  where assignment.label_code = 'TOP'
    and assignment.source = 'one_c'
    and assignment.is_active
    and assignment.revoked_at is null
    and not exists (
      select 1
      from public.b2b_product_demand_ranking ranking
      where ranking.product_id = assignment.product_id
        and ranking.popularity_rank <= 40
    );

  insert into public.product_merchandising_assignments (
    product_id,
    label_code,
    starts_at,
    ends_at,
    priority,
    is_active,
    is_curated_visible,
    source,
    reason,
    created_by,
    updated_by,
    updated_at,
    revoked_at
  )
  select
    ranking.product_id,
    'TOP',
    refresh_started_at,
    null,
    1001 - ranking.popularity_rank,
    true,
    true,
    'one_c',
    'Automated rolling-365 purchase-frequency rank '
      || ranking.popularity_rank::text,
    null,
    null,
    refresh_started_at,
    null
  from public.b2b_product_demand_ranking ranking
  where ranking.popularity_rank <= 40
  on conflict (product_id, label_code, source)
    where is_active and revoked_at is null
  do update
  set starts_at = least(
      public.product_merchandising_assignments.starts_at,
      excluded.starts_at
    ),
    ends_at = null,
    priority = excluded.priority,
    is_curated_visible = true,
    reason = excluded.reason,
    updated_by = null,
    updated_at = excluded.updated_at;

  select count(*)::integer
  into published_products
  from public.product_merchandising_assignments assignment
  where assignment.label_code = 'TOP'
    and assignment.source = 'one_c'
    and assignment.is_active
    and assignment.is_curated_visible
    and assignment.revoked_at is null;

  select
    count(distinct history.id),
    count(item.id),
    count(item.id) filter (where item.product_id is null),
    min(history.one_c_document_date) filter (
      where item.product_id is not null
    ),
    max(history.one_c_document_date) filter (
      where item.product_id is not null
    )
  into
    source_orders,
    source_lines,
    unresolved_lines,
    history_from,
    history_through
  from public.partner_order_history history
  join public.partner_order_history_items item
    on item.order_history_id = history.id
  where history.partner_visible
    and history.one_c_posted
    and not history.one_c_deletion_mark
    and history.one_c_document_date >= governed_window_start_at
    and history.one_c_document_date < governed_window_end_exclusive_at
    and item.quantity > 0;

  refresh_completed_at := clock_timestamp();

  insert into public.b2b_product_demand_ranking_state (
    singleton_key,
    refresh_id,
    refreshed_at,
    source_history_from,
    source_history_through,
    source_order_count,
    source_line_count,
    unresolved_source_line_count,
    eligible_product_count,
    popular_set_size,
    top_40_threshold_quantity,
    business_date,
    window_start,
    window_end,
    top_40_threshold_frequency
  ) values (
    1,
    target_refresh_id,
    refresh_completed_at,
    history_from,
    history_through,
    source_orders,
    source_lines,
    unresolved_lines,
    eligible_products,
    published_products,
    null,
    governed_business_date,
    governed_window_start,
    governed_window_end,
    threshold_frequency
  )
  on conflict (singleton_key) do update
  set refresh_id = excluded.refresh_id,
    refreshed_at = excluded.refreshed_at,
    source_history_from = excluded.source_history_from,
    source_history_through = excluded.source_history_through,
    source_order_count = excluded.source_order_count,
    source_line_count = excluded.source_line_count,
    unresolved_source_line_count = excluded.unresolved_source_line_count,
    eligible_product_count = excluded.eligible_product_count,
    popular_set_size = excluded.popular_set_size,
    top_40_threshold_quantity = null,
    business_date = excluded.business_date,
    window_start = excluded.window_start,
    window_end = excluded.window_end,
    top_40_threshold_frequency = excluded.top_40_threshold_frequency;

  return jsonb_build_object(
    'refreshId', target_refresh_id,
    'refreshedAt', refresh_completed_at,
    'businessDate', governed_business_date,
    'windowStart', governed_window_start,
    'windowEnd', governed_window_end,
    'eligibleProductCount', eligible_products,
    'popularSetSize', published_products,
    'top40ThresholdFrequency', threshold_frequency,
    -- Kept as null for zero-downtime compatibility with the previous app SHA.
    'top40ThresholdQuantity', null,
    'unresolvedSourceLineCount', unresolved_lines,
    'sourceOrderCount', source_orders,
    'sourceLineCount', source_lines,
    'sourceHistoryFrom', history_from,
    'sourceHistoryThrough', history_through,
    'durationMs', round(
      extract(epoch from (refresh_completed_at - refresh_started_at)) * 1000
    )
  );
end;
$$;

-- Keep the immutable public snapshot reader available for non-Popular modes,
-- but remove it as the authority for current Popular membership.
alter function public.list_public_retail_products_v2(
  text, text, text, text, jsonb, text, integer, integer
) rename to list_public_retail_products_snapshot_v2;

revoke all on function public.list_public_retail_products_snapshot_v2(
  text, text, text, text, jsonb, text, integer, integer
) from public, anon, authenticated;

alter function public.list_public_retail_hot_products(
  text, integer, integer
) rename to list_public_retail_hot_products_snapshot;

revoke all on function public.list_public_retail_hot_products_snapshot(
  text, integer, integer
) from public, anon, authenticated;

create function public.with_current_public_popularity(p_items jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  result jsonb;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 48 then
    raise exception 'Public Retail popularity input is invalid.' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(
    source.item || jsonb_build_object(
      'isPopular', ranking.product_id is not null
    ) order by source.ordinal
  ), '[]'::jsonb)
  into result
  from jsonb_array_elements(p_items) with ordinality source(item, ordinal)
  left join public.public_retail_product_identities identity
    on identity.public_id = (source.item ->> 'id')::uuid
  left join public.b2b_product_demand_ranking ranking
    on ranking.product_id = identity.source_product_id
   and ranking.popularity_rank <= 40;

  return result;
end;
$$;

revoke all on function public.with_current_public_popularity(jsonb)
from public, anon, authenticated, service_role;

create function public.list_public_retail_products_v2(
  p_locale text default 'ru',
  p_category_slug text default null,
  p_search text default null,
  p_availability text default null,
  p_facets jsonb default '{}'::jsonb,
  p_mode text default null,
  p_limit integer default 24,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  result jsonb;
  snapshot_result jsonb;
begin
  if p_locale not in ('ru', 'ro')
    or p_limit not between 1 and 48
    or p_offset < 0
    or p_offset > 10000
    or (p_mode is not null and p_mode not in (
      'popular', 'new', 'special', 'replenishment', 'price_asc', 'price_desc'
    ))
    or (p_availability is not null and p_availability not in (
      'in_stock', 'low_stock', 'available_to_order',
      'unavailable', 'unknown'
    ))
    or (p_search is not null and char_length(btrim(p_search)) > 100)
    or jsonb_typeof(p_facets) <> 'object'
    or (select count(*) from jsonb_object_keys(p_facets)) > 8
    or exists (
      select 1
      from jsonb_each(p_facets) selected(key, values)
      where char_length(selected.key) > 160
        or jsonb_typeof(selected.values) <> 'array'
        or jsonb_array_length(selected.values) not between 1 and 10
        or exists (
          select 1
          from jsonb_array_elements(selected.values) value
          where jsonb_typeof(value) <> 'string'
            or char_length(value #>> '{}') > 1000
        )
    )
  then
    raise exception 'Public Retail list input is invalid.' using errcode = '22023';
  end if;

  if p_mode is distinct from 'popular'
    or nullif(btrim(p_search), '') is not null
  then
    snapshot_result := public.list_public_retail_products_snapshot_v2(
      p_locale,
      p_category_slug,
      p_search,
      p_availability,
      p_facets,
      p_mode,
      p_limit,
      p_offset
    );
    return snapshot_result || jsonb_build_object(
      'items', public.with_current_public_popularity(
        coalesce(snapshot_result -> 'items', '[]'::jsonb)
      )
    );
  end if;

  with current_products as (
    select
      product as product_row,
      ranking.popularity_rank
    from public.public_retail_products product
    join public.public_retail_publications publication
      on publication.id = product.publication_id
     and publication.status = 'published'
    join public.public_retail_product_identities identity
      on identity.public_id = product.public_id
    join public.b2b_product_demand_ranking ranking
      on ranking.product_id = identity.source_product_id
     and ranking.popularity_rank <= 40
    where (p_category_slug is null or exists (
        select 1
        from jsonb_array_elements(product.category_path) path
        where path ->> 'slug' = p_category_slug
      ))
      and (p_availability is null or product.availability = p_availability)
      and not exists (
        select 1
        from jsonb_each(p_facets) selected(key, values)
        where not exists (
          select 1
          from jsonb_array_elements(product.specifications) specification
          where specification ->> 'key' = selected.key
            and specification ->> 'value' in (
              select jsonb_array_elements_text(selected.values)
            )
        )
      )
  ), page as (
    select current.product_row, current.popularity_rank
    from current_products current
    order by
      current.popularity_rank,
      (current.product_row).sku,
      (current.product_row).public_id
    limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(
      public.build_public_retail_product_summary(
        page.product_row,
        p_locale
      ) || jsonb_build_object('isPopular', true) order by
        page.popularity_rank,
        (page.product_row).sku,
        (page.product_row).public_id
    ), '[]'::jsonb),
    'totalCount', (select count(*) from current_products),
    'limit', p_limit,
    'offset', p_offset
  )
  into result
  from page;

  return coalesce(result, jsonb_build_object(
    'items', '[]'::jsonb,
    'totalCount', 0,
    'limit', p_limit,
    'offset', p_offset
  ));
end;
$$;

revoke all on function public.list_public_retail_products_v2(
  text, text, text, text, jsonb, text, integer, integer
) from public, anon, authenticated;
grant execute on function public.list_public_retail_products_v2(
  text, text, text, text, jsonb, text, integer, integer
) to anon, authenticated;

create function public.list_public_retail_hot_products(
  p_locale text default 'ru',
  p_limit integer default 24,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  snapshot_result jsonb;
begin
  snapshot_result := public.list_public_retail_hot_products_snapshot(
    p_locale,
    p_limit,
    p_offset
  );
  return snapshot_result || jsonb_build_object(
    'items', public.with_current_public_popularity(
      coalesce(snapshot_result -> 'items', '[]'::jsonb)
    )
  );
end;
$$;

revoke all on function public.list_public_retail_hot_products(
  text, integer, integer
) from public, anon, authenticated;
grant execute on function public.list_public_retail_hot_products(
  text, integer, integer
) to anon, authenticated;

create or replace function public.get_public_retail_showcase_v2(
  p_locale text default 'ru'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  popular jsonb;
  new_products jsonb;
  hot jsonb;
  replenishment jsonb;
begin
  if p_locale not in ('ru', 'ro') then
    raise exception 'Public Retail showcase input is invalid.' using errcode = '22023';
  end if;

  popular := public.list_public_retail_products_v2(
    p_locale, null, null, null, '{}'::jsonb, 'popular', 5, 0
  );
  new_products := public.list_public_retail_products_v2(
    p_locale, null, null, null, '{}'::jsonb, 'new', 5, 0
  );
  hot := public.list_public_retail_hot_products(p_locale, 5, 0);
  replenishment := public.list_public_retail_products_v2(
    p_locale, null, null, null, '{}'::jsonb, 'replenishment', 5, 0
  );

  return jsonb_build_object(
    'popular', popular -> 'items',
    'new', new_products -> 'items',
    'hot', hot -> 'items',
    'replenishment', replenishment -> 'items',
    'totalCounts', jsonb_build_object(
      'popular', coalesce((popular ->> 'totalCount')::integer, 0),
      'new', coalesce((new_products ->> 'totalCount')::integer, 0),
      'hot', coalesce((hot ->> 'totalCount')::integer, 0),
      'replenishment', coalesce((replenishment ->> 'totalCount')::integer, 0)
    )
  );
end;
$$;

create function public.get_public_retail_showcase_v3(
  p_locale text default 'ru',
  p_rotation_seed text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  popular_pool jsonb;
  popular_items jsonb;
  new_products jsonb;
  hot jsonb;
  replenishment jsonb;
begin
  if p_locale not in ('ru', 'ro')
    or p_rotation_seed is null
    or p_rotation_seed !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then
    raise exception 'Public Retail showcase input is invalid.' using errcode = '22023';
  end if;

  popular_pool := public.list_public_retail_products_v2(
    p_locale, null, null, null, '{}'::jsonb, 'popular', 40, 0
  );

  select coalesce(jsonb_agg(candidate.item order by candidate.session_rank), '[]'::jsonb)
  into popular_items
  from (
    select pool.item,
      pg_catalog.md5(p_rotation_seed || ':' || (pool.item ->> 'id')) as session_rank
    from jsonb_array_elements(popular_pool -> 'items') pool(item)
    order by session_rank, pool.item ->> 'id'
    limit 5
  ) candidate;

  new_products := public.list_public_retail_products_v2(
    p_locale, null, null, null, '{}'::jsonb, 'new', 5, 0
  );
  hot := public.list_public_retail_hot_products(p_locale, 5, 0);
  replenishment := public.list_public_retail_products_v2(
    p_locale, null, null, null, '{}'::jsonb, 'replenishment', 5, 0
  );

  return jsonb_build_object(
    'popular', popular_items,
    'new', new_products -> 'items',
    'hot', hot -> 'items',
    'replenishment', replenishment -> 'items',
    'totalCounts', jsonb_build_object(
      'popular', coalesce((popular_pool ->> 'totalCount')::integer, 0),
      'new', coalesce((new_products ->> 'totalCount')::integer, 0),
      'hot', coalesce((hot ->> 'totalCount')::integer, 0),
      'replenishment', coalesce((replenishment ->> 'totalCount')::integer, 0)
    )
  );
end;
$$;

revoke all on function public.get_public_retail_showcase_v2(text),
  public.get_public_retail_showcase_v3(text, text)
from public, anon, authenticated;
grant execute on function public.get_public_retail_showcase_v2(text),
  public.get_public_retail_showcase_v3(text, text)
to anon, authenticated;

create function public.get_published_product_merchandising_v3(
  p_company_id uuid,
  p_label_code text default null,
  p_limit_per_label integer default 5,
  p_rotation_seed text default null
)
returns table(
  product_id uuid,
  label_code text,
  priority integer,
  starts_at timestamptz,
  ends_at timestamptz,
  source text,
  matching_product_count integer
)
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
begin
  if auth.uid() is null
    or not public.has_active_company_membership(p_company_id)
    or not public.has_permission(p_company_id, 'catalog.view')
  then
    raise exception 'Catalog merchandising access denied.' using errcode = '42501';
  end if;
  if (p_label_code is not null and p_label_code not in ('NEW', 'TOP', 'HOT'))
    or p_limit_per_label not between 1 and 24
    or (p_rotation_seed is not null and char_length(p_rotation_seed) > 128)
  then
    raise exception 'Invalid merchandising projection input.' using errcode = '22023';
  end if;

  return query
  with eligible as (
    select assignment.product_id,
      assignment.label_code,
      assignment.priority,
      assignment.starts_at,
      assignment.ends_at,
      assignment.source,
      row_number() over (
        partition by assignment.label_code
        order by
          case
            when assignment.label_code = 'TOP' and p_rotation_seed is not null
            then pg_catalog.md5(p_rotation_seed || ':' || assignment.product_id::text)
          end,
          assignment.priority desc,
          assignment.updated_at desc,
          product.sort_order,
          lower(product.name),
          product.id
      ) as label_rank,
      count(*) over (partition by assignment.label_code)::integer as total_count
    from public.product_merchandising_assignments assignment
    join public.catalog_products product
      on product.id = assignment.product_id
     and product.is_active
     and product.is_visible
    where assignment.label_code in ('NEW', 'TOP', 'HOT')
      and assignment.is_active
      and assignment.is_curated_visible
      and assignment.revoked_at is null
      and assignment.source in ('manual', 'one_c')
      and assignment.starts_at <= now()
      and (assignment.ends_at is null or assignment.ends_at > now())
      and (p_label_code is null or assignment.label_code = p_label_code)
  )
  select eligible.product_id,
    eligible.label_code,
    eligible.priority,
    eligible.starts_at,
    eligible.ends_at,
    eligible.source,
    eligible.total_count
  from eligible
  where eligible.label_rank <= p_limit_per_label
  order by
    case eligible.label_code when 'TOP' then 1 when 'NEW' then 2 else 3 end,
    eligible.label_rank;
end;
$$;

revoke all on function public.get_published_product_merchandising_v3(
  uuid, text, integer, text
) from public, anon;
grant execute on function public.get_published_product_merchandising_v3(
  uuid, text, integer, text
) to authenticated;

create function public.catalog_partner_page_v8(
  p_company_id uuid,
  p_category_id uuid default null,
  p_category_ids uuid[] default null,
  p_brand_id uuid default null,
  p_search text default null,
  p_availability text default 'all',
  p_filters jsonb default '{}'::jsonb,
  p_merchandising_label text default null,
  p_sort text default 'default',
  p_limit integer default 12,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  base_result jsonb;
  ranked_items jsonb;
begin
  if p_merchandising_label is distinct from 'TOP' or p_sort <> 'default' then
    return public.catalog_partner_page_v7(
      p_company_id, p_category_id, p_category_ids, p_brand_id, p_search,
      p_availability, p_filters, p_merchandising_label, p_sort,
      p_limit, p_offset
    );
  end if;

  base_result := public.catalog_partner_page_v7(
    p_company_id, p_category_id, p_category_ids, p_brand_id, p_search,
    p_availability, p_filters, p_merchandising_label, p_sort, 48, 0
  );

  with candidates as (
    select source.item,
      ranking.popularity_rank
    from jsonb_array_elements(coalesce(base_result -> 'items', '[]'::jsonb))
      source(item)
    join public.b2b_product_demand_ranking ranking
      on ranking.product_id = (source.item ->> 'id')::uuid
  ), ordered as (
    select candidate.item,
      row_number() over (
        order by candidate.popularity_rank,
          candidate.item ->> 'sku', candidate.item ->> 'id'
      ) as ordinal
    from candidates candidate
  )
  select coalesce(jsonb_agg(ordered.item order by ordered.ordinal), '[]'::jsonb)
  into ranked_items
  from ordered
  where ordered.ordinal > p_offset
    and ordered.ordinal <= p_offset + p_limit;

  return base_result || jsonb_build_object('items', ranked_items);
end;
$$;

revoke all on function public.catalog_partner_page_v8(
  uuid, uuid, uuid[], uuid, text, text, jsonb, text, text, integer, integer
) from public, anon;
grant execute on function public.catalog_partner_page_v8(
  uuid, uuid, uuid[], uuid, text, text, jsonb, text, text, integer, integer
) to authenticated;

comment on table public.b2b_product_demand_ranking is
  'Internal global rolling-365 B2B purchase-frequency ranking. Quantity is diagnostic only and never controls rank.';
comment on table public.b2b_product_demand_ranking_state is
  'Internal refresh diagnostics and governed Europe/Chisinau date window for automated Popular.';
comment on function public.refresh_b2b_product_demand_ranking() is
  'Atomically rebuilds rolling-365 COUNT(DISTINCT order) ranking and the shared current TOP 40 membership.';
comment on function public.list_public_retail_products_snapshot_v2(
  text, text, text, text, jsonb, text, integer, integer
) is 'Historical immutable-snapshot reader retained for non-Popular B2C modes; not current Popular authority.';
comment on function public.list_public_retail_products_v2(
  text, text, text, text, jsonb, text, integer, integer
) is 'Returns safe public product DTOs; Popular membership/order comes from the private rolling-365 Top 40 projection.';
comment on function public.with_current_public_popularity(jsonb) is
  'Internal set-based adapter that adds only isPopular to bounded safe public product DTOs.';
comment on function public.get_public_retail_showcase_v3(text, text) is
  'Returns the existing bounded B2C showcase with a session-stable Popular subset from the shared Top 40.';
comment on function public.get_published_product_merchandising_v3(
  uuid, text, integer, text
) is 'Returns authorized bounded B2B merchandising sections with optional session-stable TOP rotation.';
comment on function public.catalog_partner_page_v8(
  uuid, uuid, uuid[], uuid, text, text, jsonb, text, text, integer, integer
) is 'Returns partner catalog pages; default full Popular listings follow deterministic frequency rank.';

-- Recalculate inside the forward migration so the new projection becomes
-- authoritative atomically with its readers.
select public.refresh_b2b_product_demand_ranking();

alter table public.b2b_product_demand_ranking
  alter column purchase_frequency set not null,
  alter column window_start set not null,
  alter column window_end set not null;

alter table public.b2b_product_demand_ranking_state
  alter column business_date set not null,
  alter column window_start set not null,
  alter column window_end set not null;

commit;
