begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

alter table public.b2b_product_demand_ranking
  add column period_days smallint not null default 30;

alter table public.b2b_product_demand_ranking
  drop constraint b2b_product_demand_ranking_pkey,
  drop constraint b2b_product_demand_ranking_window_check,
  add constraint b2b_product_demand_ranking_period_check
    check (period_days in (30, 60, 90)),
  add constraint b2b_product_demand_ranking_pkey
    primary key (period_days, product_id);

update public.b2b_product_demand_ranking
set window_start = window_end - 29;

alter table public.b2b_product_demand_ranking
  add constraint b2b_product_demand_ranking_window_check
    check (window_end - window_start = period_days - 1);

drop index public.b2b_product_demand_ranking_rank_idx;
create index b2b_product_demand_ranking_period_rank_idx
  on public.b2b_product_demand_ranking(period_days, popularity_rank, product_id);

-- Keep every currently deployed reader deterministic during the migration-to-
-- application rollout window. New readers take an explicit period; legacy v2/v8
-- contracts continue to mean the default 30-day Popular slice.
do $$
declare
  function_name text;
  definition text;
  changed text;
begin
  foreach function_name in array array[
    'catalog_partner_page_v8',
    'list_public_retail_products_current_v2',
    'with_current_public_popularity'
  ] loop
    select pg_get_functiondef(procedure.oid) into definition
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = function_name;

    if definition is null then
      raise exception 'Required legacy Popular reader % is missing.', function_name;
    end if;

    if function_name = 'catalog_partner_page_v8' then
      changed := replace(definition,
        'on ranking.product_id = (source.item ->> ''id'')::uuid',
        E'on ranking.product_id = (source.item ->> ''id'')::uuid\n     and ranking.period_days = 30');
    else
      changed := replace(definition,
        'on ranking.product_id = identity.source_product_id',
        E'on ranking.product_id = identity.source_product_id\n   and ranking.period_days = 30');
    end if;

    if changed = definition or changed not like '%ranking.period_days = 30%' then
      raise exception 'Could not pin legacy Popular reader % to 30 days.', function_name;
    end if;
    execute changed;
  end loop;
end;
$$;

alter table public.b2b_product_demand_ranking_state
  drop constraint b2b_product_demand_ranking_state_pkey,
  drop constraint b2b_product_demand_ranking_state_singleton_key_check,
  drop constraint b2b_product_demand_ranking_state_window_check;

alter table public.b2b_product_demand_ranking_state
  rename column singleton_key to period_days;

update public.b2b_product_demand_ranking_state set period_days = 30;
update public.b2b_product_demand_ranking_state
set window_start = window_end - 29;

alter table public.b2b_product_demand_ranking_state
  add constraint b2b_product_demand_ranking_state_period_check
    check (period_days in (30, 60, 90)),
  add constraint b2b_product_demand_ranking_state_window_check
    check (window_end - window_start = period_days - 1),
  add constraint b2b_product_demand_ranking_state_pkey primary key (period_days);

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
  default_published_products integer := 0;
  period_results jsonb := '[]'::jsonb;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('b2b-product-demand-ranking-refresh', 0)
  );

  with periods(period_days) as (
    values (30::smallint), (60::smallint), (90::smallint)
  ), governed_lines as materialized (
    select
      period.period_days,
      history.id as authoritative_order_id,
      history.company_id,
      history.one_c_document_date,
      item.product_id,
      item.quantity
    from periods period
    join public.partner_order_history history
      on history.one_c_document_date >= (
        (governed_business_date - (period.period_days - 1))::timestamp
          at time zone 'Europe/Chisinau'
      )
     and history.one_c_document_date < (
        (governed_business_date + 1)::timestamp
          at time zone 'Europe/Chisinau'
      )
    join public.partner_order_history_items item
      on item.order_history_id = history.id
    join public.catalog_products product
      on product.id = item.product_id
     and product.is_active
     and product.is_visible
    where history.partner_visible
      and history.one_c_posted
      and not history.one_c_deletion_mark
      and item.product_id is not null
      and item.quantity > 0
  ), aggregated as (
    select
      governed.period_days,
      governed.product_id,
      count(distinct governed.authoritative_order_id) as purchase_frequency,
      count(distinct governed.company_id)::integer as purchasing_company_count,
      count(distinct governed.authoritative_order_id) as authoritative_order_count,
      count(*) as authoritative_line_count,
      sum(governed.quantity) as total_purchased_quantity,
      max(governed.one_c_document_date) as last_purchased_at
    from governed_lines governed
    group by governed.period_days, governed.product_id
  ), ranked as (
    select aggregate.*,
      row_number() over (
        partition by aggregate.period_days
        order by aggregate.purchase_frequency desc,
          aggregate.purchasing_company_count desc,
          aggregate.last_purchased_at desc,
          product.sku,
          aggregate.product_id
      )::integer as popularity_rank
    from aggregated aggregate
    join public.catalog_products product on product.id = aggregate.product_id
  )
  insert into public.b2b_product_demand_ranking (
    period_days, product_id, popularity_rank, total_purchased_quantity,
    purchasing_company_count, authoritative_order_count,
    authoritative_line_count, last_purchased_at, refresh_id, refreshed_at,
    purchase_frequency, window_start, window_end
  )
  select ranked.period_days, ranked.product_id, ranked.popularity_rank,
    ranked.total_purchased_quantity, ranked.purchasing_company_count,
    ranked.authoritative_order_count, ranked.authoritative_line_count,
    ranked.last_purchased_at, target_refresh_id, refresh_started_at,
    ranked.purchase_frequency,
    governed_business_date - (ranked.period_days - 1),
    governed_business_date
  from ranked
  on conflict (period_days, product_id) do update
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
    window_end = excluded.window_end;

  delete from public.b2b_product_demand_ranking ranking
  where ranking.refresh_id <> target_refresh_id;

  update public.product_merchandising_assignments assignment
  set is_active = false,
    is_curated_visible = false,
    reason = 'Outside current automated rolling-30 frequency Top 40',
    revoked_at = refresh_started_at,
    updated_at = refresh_started_at
  where assignment.label_code = 'TOP'
    and assignment.source = 'one_c'
    and assignment.is_active
    and assignment.revoked_at is null
    and not exists (
      select 1 from public.b2b_product_demand_ranking ranking
      where ranking.period_days = 30
        and ranking.product_id = assignment.product_id
        and ranking.popularity_rank <= 40
    );

  insert into public.product_merchandising_assignments (
    product_id, label_code, starts_at, ends_at, priority, is_active,
    is_curated_visible, source, reason, created_by, updated_by,
    updated_at, revoked_at
  )
  select ranking.product_id, 'TOP', refresh_started_at, null,
    1001 - ranking.popularity_rank, true, true, 'one_c',
    'Automated rolling-30 purchase-frequency rank ' || ranking.popularity_rank,
    null, null, refresh_started_at, null
  from public.b2b_product_demand_ranking ranking
  where ranking.period_days = 30 and ranking.popularity_rank <= 40
  on conflict (product_id, label_code, source)
    where is_active and revoked_at is null
  do update set ends_at = null,
    priority = excluded.priority,
    is_curated_visible = true,
    reason = excluded.reason,
    updated_at = excluded.updated_at,
    revoked_at = null;

  select count(*)::integer into default_published_products
  from public.b2b_product_demand_ranking
  where period_days = 30 and popularity_rank <= 40;

  insert into public.b2b_product_demand_ranking_state (
    period_days, refresh_id, refreshed_at, source_history_from,
    source_history_through, source_order_count, source_line_count,
    unresolved_source_line_count, eligible_product_count, popular_set_size,
    top_40_threshold_quantity, business_date, window_start, window_end,
    top_40_threshold_frequency
  )
  select period.period_days, target_refresh_id, clock_timestamp(),
    min(history.one_c_document_date) filter (where item.product_id is not null),
    max(history.one_c_document_date) filter (where item.product_id is not null),
    count(distinct history.id), count(item.id),
    count(item.id) filter (where item.product_id is null),
    (select count(*) from public.b2b_product_demand_ranking ranking
      where ranking.period_days = period.period_days),
    (select count(*) from public.b2b_product_demand_ranking ranking
      where ranking.period_days = period.period_days and ranking.popularity_rank <= 40),
    null, governed_business_date,
    governed_business_date - (period.period_days - 1), governed_business_date,
    (select ranking.purchase_frequency
      from public.b2b_product_demand_ranking ranking
      where ranking.period_days = period.period_days
        and ranking.popularity_rank = 40)
  from (values (30::smallint), (60::smallint), (90::smallint)) period(period_days)
  left join public.partner_order_history history
    on history.partner_visible and history.one_c_posted
   and not history.one_c_deletion_mark
   and history.one_c_document_date >= (
      (governed_business_date - (period.period_days - 1))::timestamp
        at time zone 'Europe/Chisinau')
   and history.one_c_document_date < (
      (governed_business_date + 1)::timestamp
        at time zone 'Europe/Chisinau')
  left join public.partner_order_history_items item
    on item.order_history_id = history.id and item.quantity > 0
  group by period.period_days
  on conflict (period_days) do update
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

  refresh_completed_at := clock_timestamp();
  select jsonb_agg(jsonb_build_object(
    'periodDays', state.period_days,
    'windowStart', state.window_start,
    'windowEnd', state.window_end,
    'eligibleProductCount', state.eligible_product_count,
    'popularSetSize', state.popular_set_size,
    'top40ThresholdFrequency', state.top_40_threshold_frequency
  ) order by state.period_days) into period_results
  from public.b2b_product_demand_ranking_state state;

  return jsonb_build_object(
    'refreshId', target_refresh_id,
    'refreshedAt', refresh_completed_at,
    'businessDate', governed_business_date,
    'windowStart', governed_business_date - 29,
    'windowEnd', governed_business_date,
    'eligibleProductCount', (select eligible_product_count from public.b2b_product_demand_ranking_state where period_days = 30),
    'popularSetSize', default_published_products,
    'top40ThresholdFrequency', (select top_40_threshold_frequency from public.b2b_product_demand_ranking_state where period_days = 30),
    'top40ThresholdQuantity', null,
    'unresolvedSourceLineCount', (select unresolved_source_line_count from public.b2b_product_demand_ranking_state where period_days = 30),
    'sourceOrderCount', (select source_order_count from public.b2b_product_demand_ranking_state where period_days = 30),
    'sourceLineCount', (select source_line_count from public.b2b_product_demand_ranking_state where period_days = 30),
    'sourceHistoryFrom', (select source_history_from from public.b2b_product_demand_ranking_state where period_days = 30),
    'sourceHistoryThrough', (select source_history_through from public.b2b_product_demand_ranking_state where period_days = 30),
    'periods', period_results,
    'durationMs', round(extract(epoch from (refresh_completed_at - refresh_started_at)) * 1000)
  );
end;
$$;

create function public.get_published_product_merchandising_v4(
  p_company_id uuid,
  p_label_code text default null,
  p_limit_per_label integer default 5,
  p_rotation_seed text default null,
  p_period_days integer default 30
)
returns table(
  product_id uuid, label_code text, priority integer,
  starts_at timestamptz, ends_at timestamptz, source text,
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
    or p_period_days not in (30, 60, 90)
    or (p_rotation_seed is not null and char_length(p_rotation_seed) > 128)
  then
    raise exception 'Invalid merchandising projection input.' using errcode = '22023';
  end if;

  return query
  with sources as (
    select ranking.product_id, 'TOP'::text as label_code,
      (1001 - ranking.popularity_rank)::integer as priority,
      ranking.refreshed_at as starts_at, null::timestamptz as ends_at,
      'one_c'::text as source
    from public.b2b_product_demand_ranking ranking
    join public.catalog_products product
      on product.id = ranking.product_id and product.is_active and product.is_visible
    where ranking.period_days = p_period_days and ranking.popularity_rank <= 40
      and (p_label_code is null or p_label_code = 'TOP')
    union all
    select assignment.product_id, assignment.label_code::text,
      assignment.priority, assignment.starts_at, assignment.ends_at,
      assignment.source::text
    from public.product_merchandising_assignments assignment
    join public.catalog_products product
      on product.id = assignment.product_id and product.is_active and product.is_visible
    where assignment.label_code in ('NEW', 'HOT')
      and assignment.is_active and assignment.is_curated_visible
      and assignment.revoked_at is null
      and assignment.source in ('manual', 'one_c')
      and assignment.starts_at <= now()
      and (assignment.ends_at is null or assignment.ends_at > now())
      and (p_label_code is null or assignment.label_code = p_label_code)
  ), ranked as (
    select sources.*,
      row_number() over (partition by sources.label_code order by
        case when sources.label_code = 'TOP' and p_rotation_seed is not null
          then pg_catalog.md5(p_rotation_seed || ':' || sources.product_id::text) end,
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

revoke all on function public.get_published_product_merchandising_v4(
  uuid, text, integer, text, integer
) from public, anon;
grant execute on function public.get_published_product_merchandising_v4(
  uuid, text, integer, text, integer
) to authenticated;

-- The full partner catalog keeps its established commerce projection. These
-- derived period-aware versions only replace TOP membership/order and add no
-- new request or per-product lookup.
do $$
declare
  definition text;
  changed text;
begin
  select pg_get_functiondef(procedure.oid) into definition
  from pg_proc procedure join pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = 'catalog_partner_page_category_set_base';
  changed := replace(definition,
    'FUNCTION public.catalog_partner_page_category_set_base(',
    'FUNCTION public.catalog_partner_page_period_base(');
  changed := replace(changed,
    'p_offset integer DEFAULT 0)',
    'p_offset integer DEFAULT 0, p_period_days integer DEFAULT 30)');
  changed := replace(changed,
    'or p_limit not between 1 and 48',
    E'or p_period_days not in (30, 60, 90)\n    or p_limit not between 1 and 48');
  changed := replace(changed,
    'or (p_merchandising_label <> ''REPLENISHMENT'' and exists (',
    E'or (p_merchandising_label = ''TOP'' and exists (\n          select 1 from public.b2b_product_demand_ranking ranking\n          where ranking.product_id = product.id\n            and ranking.period_days = p_period_days\n            and ranking.popularity_rank <= 40\n        ))\n        or (p_merchandising_label not in (''REPLENISHMENT'', ''TOP'') and exists (');
  changed := replace(changed,
    E'case when effective_sort = ''default''\n        then commercial.sort_order end,',
    E'case when p_merchandising_label = ''TOP'' and effective_sort = ''default''\n        then (select ranking.popularity_rank from public.b2b_product_demand_ranking ranking\n          where ranking.product_id = commercial.id and ranking.period_days = p_period_days) end,\n      case when effective_sort = ''default''\n        then commercial.sort_order end,');
  if changed = definition
    or changed not like '%ranking.period_days = p_period_days%'
    or changed not like '%p_merchandising_label not in (''REPLENISHMENT'', ''TOP'')%'
  then
    raise exception 'Could not derive period-aware partner catalog base.';
  end if;
  execute changed;

  select pg_get_functiondef(procedure.oid) into definition
  from pg_proc procedure join pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public' and procedure.proname = 'catalog_partner_page_v6';
  changed := replace(definition, 'FUNCTION public.catalog_partner_page_v6(',
    'FUNCTION public.catalog_partner_page_period_v6(');
  changed := replace(changed, 'p_offset integer DEFAULT 0)',
    'p_offset integer DEFAULT 0, p_period_days integer DEFAULT 30)');
  changed := replace(changed, 'public.catalog_partner_page_category_set_base(',
    'public.catalog_partner_page_period_base(');
  changed := replace(changed, E'    p_offset\n  );', E'    p_offset,\n    p_period_days\n  );');
  if changed = definition
    or changed not like '%catalog_partner_page_period_base%'
    or changed not like E'%p_offset,\n    p_period_days%'
  then
    raise exception 'Could not derive period-aware partner catalog characteristics.';
  end if;
  execute changed;

  select pg_get_functiondef(procedure.oid) into definition
  from pg_proc procedure join pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public' and procedure.proname = 'catalog_partner_page_v7';
  changed := replace(definition, 'FUNCTION public.catalog_partner_page_v7(',
    'FUNCTION public.catalog_partner_page_period_v7(');
  changed := replace(changed, 'p_offset integer DEFAULT 0)',
    'p_offset integer DEFAULT 0, p_period_days integer DEFAULT 30)');
  changed := replace(changed, 'public.catalog_partner_page_v6(',
    'public.catalog_partner_page_period_v6(');
  changed := replace(changed, E'    p_offset\n  );', E'    p_offset,\n    p_period_days\n  );');
  if changed = definition
    or changed not like '%catalog_partner_page_period_v6%'
    or changed not like E'%p_offset,\n    p_period_days%'
  then
    raise exception 'Could not derive period-aware partner catalog retail projection.';
  end if;
  execute changed;
end;
$$;

revoke all on function public.catalog_partner_page_period_base(
  uuid, uuid, uuid[], uuid, text, text, jsonb, text, text, integer, integer, integer
), public.catalog_partner_page_period_v6(
  uuid, uuid, uuid[], uuid, text, text, jsonb, text, text, integer, integer, integer
), public.catalog_partner_page_period_v7(
  uuid, uuid, uuid[], uuid, text, text, jsonb, text, text, integer, integer, integer
) from public, anon, authenticated, service_role;

create function public.catalog_partner_page_v9(
  p_company_id uuid, p_category_id uuid default null,
  p_category_ids uuid[] default null, p_brand_id uuid default null,
  p_search text default null, p_availability text default 'all',
  p_filters jsonb default '{}'::jsonb,
  p_merchandising_label text default null, p_sort text default 'default',
  p_limit integer default 12, p_offset integer default 0,
  p_period_days integer default 30
)
returns jsonb
language plpgsql stable security definer
set search_path = ''
set row_security = off
as $$
declare payload jsonb; items jsonb;
begin
  if p_period_days not in (30, 60, 90) then
    raise exception 'Invalid Popular period.' using errcode = '22023';
  end if;
  if p_merchandising_label is distinct from 'TOP' then
    return public.catalog_partner_page_v8(
      p_company_id, p_category_id, p_category_ids, p_brand_id, p_search,
      p_availability, p_filters, p_merchandising_label, p_sort,
      p_limit, p_offset
    );
  end if;
  payload := public.catalog_partner_page_period_v7(
    p_company_id, p_category_id, p_category_ids, p_brand_id, p_search,
    p_availability, p_filters, p_merchandising_label, p_sort,
    p_limit, p_offset, p_period_days
  );
  select coalesce(jsonb_agg(
    case when coalesce(source.item -> 'merchandising_labels', '[]'::jsonb) ? 'TOP'
      then source.item
      else jsonb_set(source.item, '{merchandising_labels}',
        coalesce(source.item -> 'merchandising_labels', '[]'::jsonb) || '"TOP"'::jsonb)
    end order by source.ordinal), '[]'::jsonb)
  into items
  from jsonb_array_elements(coalesce(payload -> 'items', '[]'::jsonb))
    with ordinality source(item, ordinal);
  return payload || jsonb_build_object('items', items);
end;
$$;

revoke all on function public.catalog_partner_page_v9(
  uuid, uuid, uuid[], uuid, text, text, jsonb, text, text, integer, integer, integer
) from public, anon;
grant execute on function public.catalog_partner_page_v9(
  uuid, uuid, uuid[], uuid, text, text, jsonb, text, text, integer, integer, integer
) to authenticated;

do $$
declare definition text; changed text;
begin
  select pg_get_functiondef(procedure.oid) into definition
  from pg_proc procedure join pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public' and procedure.proname = 'catalog_partner_facets_v3';
  changed := replace(definition, 'FUNCTION public.catalog_partner_facets_v3(',
    'FUNCTION public.catalog_partner_facets_v4(');
  changed := replace(changed, 'p_max_values integer DEFAULT 30)',
    'p_max_values integer DEFAULT 30, p_period_days integer DEFAULT 30)');
  changed := replace(changed, 'or p_max_values not between 1 and 50',
    E'or p_period_days not in (30, 60, 90)\n    or p_max_values not between 1 and 50');
  changed := replace(changed,
    'or (p_selection <> ''REPLENISHMENT'' and exists (',
    E'or (p_selection = ''TOP'' and exists (\n          select 1 from public.b2b_product_demand_ranking ranking\n          where ranking.product_id = p.id\n            and ranking.period_days = p_period_days\n            and ranking.popularity_rank <= 40\n        ))\n        or (p_selection not in (''REPLENISHMENT'', ''TOP'') and exists (');
  if changed = definition
    or changed not like '%ranking.period_days = p_period_days%'
    or changed not like '%p_selection not in (''REPLENISHMENT'', ''TOP'')%'
  then
    raise exception 'Could not derive period-aware partner facets.';
  end if;
  execute changed;
end;
$$;

revoke all on function public.catalog_partner_facets_v4(
  uuid, uuid, uuid[], uuid, text, text, jsonb, text, integer, integer
) from public, anon;
grant execute on function public.catalog_partner_facets_v4(
  uuid, uuid, uuid[], uuid, text, text, jsonb, text, integer, integer
) to authenticated;

-- Repeat Purchase v4 reuses the complete governed v3 projection and adds only
-- the inclusive Europe/Chisinau period predicate.
do $$
declare definition text; changed text;
begin
  select pg_get_functiondef(procedure.oid) into definition
  from pg_proc procedure join pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = 'get_partner_previously_purchased_products_v3';
  changed := replace(definition,
    'FUNCTION public.get_partner_previously_purchased_products_v3(',
    'FUNCTION public.get_partner_previously_purchased_products_v4(');
  changed := replace(changed,
    'p_search text DEFAULT NULL::text, p_limit integer DEFAULT 20',
    'p_search text DEFAULT NULL::text, p_period_days integer DEFAULT 30, p_limit integer DEFAULT 20');
  changed := replace(changed, 'if p_limit not between 1 and 24',
    E'if p_period_days not in (30, 60, 90)\n    or p_limit not between 1 and 24');
  changed := replace(changed,
    'and history.one_c_document_date <= now()',
    E'and history.one_c_document_date >= (((statement_timestamp() at time zone ''Europe/Chisinau'')::date - (p_period_days - 1))::timestamp at time zone ''Europe/Chisinau'')\n      and history.one_c_document_date < ((((statement_timestamp() at time zone ''Europe/Chisinau'')::date + 1)::timestamp) at time zone ''Europe/Chisinau'')');
  if changed = definition
    or changed not like '%p_period_days not in (30, 60, 90)%'
    or changed not like '%history.one_c_document_date >=%Europe/Chisinau%'
  then
    raise exception 'Could not derive rolling Repeat Purchase projection.';
  end if;
  execute changed;
end;
$$;

revoke all on function public.get_partner_previously_purchased_products_v4(
  uuid, uuid[], text, integer, integer, integer
) from public, anon;
grant execute on function public.get_partner_previously_purchased_products_v4(
  uuid, uuid[], text, integer, integer, integer
) to authenticated;

create function public.get_or_refresh_partner_dashboard_selections_v3(
  p_user_id uuid,
  p_company_id uuid,
  p_login_generation text,
  p_period_days integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  base_result jsonb;
  previous_products jsonb := '[]'::jsonb;
  previous_count integer := 0;
  previous_fingerprint text;
begin
  if p_period_days not in (30, 60, 90) then
    raise exception 'Invalid Dashboard purchase period.' using errcode = '22023';
  end if;
  base_result := public.get_or_refresh_partner_dashboard_selections_v2(
    p_user_id, p_company_id,
    'rolling-' || p_period_days::text || ':' || p_login_generation
  );

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
        (((statement_timestamp() at time zone 'Europe/Chisinau')::date
          - (p_period_days - 1))::timestamp) at time zone 'Europe/Chisinau')
      and history.one_c_document_date < (
        (((statement_timestamp() at time zone 'Europe/Chisinau')::date + 1)::timestamp)
          at time zone 'Europe/Chisinau')
      and item.product_id is not null and item.quantity > 0
      and nullif(btrim(product.external_1c_id), '') is not null
    group by item.product_id
  ), chosen as (
    select evidence.*
    from evidence
    order by pg_catalog.md5(p_login_generation || ':' || evidence.product_id::text),
      evidence.product_id
    limit 12
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', product.id, 'sku', product.sku, 'name', product.name,
    'slug', product.slug,
    'imageUrl', coalesce(product.image_source_url, product.image_url, (
      select image.url from public.catalog_product_images image
      where image.product_id = product.id
      order by image.is_primary desc, image.sort_order, image.id limit 1)),
    'categoryId', product.category_id, 'categoryName', category.name,
    'labelCodes', '[]'::jsonb,
    'purchaseCount', chosen.purchase_count,
    'completedPurchaseCount', chosen.completed_count,
    'lastPurchasedAt', chosen.last_purchased_at,
    'typicalQuantity', chosen.typical_quantity
  ) order by pg_catalog.md5(p_login_generation || ':' || product.id::text)), '[]'::jsonb),
    (select count(*) from evidence),
    pg_catalog.md5(concat_ws('|', p_period_days::text,
      coalesce(max(chosen.last_purchased_at)::text, ''),
      (select count(*)::text from evidence)))
  into previous_products, previous_count, previous_fingerprint
  from chosen
  join public.catalog_products product on product.id = chosen.product_id
  left join public.catalog_categories category on category.id = product.category_id;

  return base_result || jsonb_build_object(
    'previousProducts', previous_products,
    'previousCandidateCount', previous_count,
    'previousSourceFingerprint', previous_fingerprint
  );
end;
$$;

revoke all on function public.get_or_refresh_partner_dashboard_selections_v3(
  uuid, uuid, text, integer
) from public, anon, authenticated;
grant execute on function public.get_or_refresh_partner_dashboard_selections_v3(
  uuid, uuid, text, integer
) to service_role;

create function public.list_public_retail_products_v4(
  p_locale text default 'ru', p_category_slug text default null,
  p_search text default null, p_availability text default null,
  p_facets jsonb default '{}'::jsonb, p_mode text default null,
  p_limit integer default 24, p_offset integer default 0,
  p_period_days integer default 30
)
returns jsonb
language plpgsql stable security definer
set search_path = '' set row_security = off
as $$
declare result jsonb;
begin
  if p_locale not in ('ru', 'ro')
    or p_period_days not in (30, 60, 90)
    or p_limit not between 1 and 48
    or p_offset < 0 or p_offset > 10000
    or (p_mode is not null and p_mode not in (
      'popular', 'new', 'special', 'replenishment', 'price_asc', 'price_desc'))
    or (p_availability is not null and p_availability not in (
      'in_stock', 'low_stock', 'available_to_order', 'unavailable', 'unknown'))
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
    raise exception 'Public Retail Popular period is invalid.' using errcode = '22023';
  end if;
  if p_mode is distinct from 'popular' or nullif(btrim(p_search), '') is not null then
    return public.list_public_retail_products_v3(
      p_locale, p_category_slug, p_search, p_availability, p_facets,
      p_mode, p_limit, p_offset
    );
  end if;
  with current_products as (
    select product as product_row, ranking.popularity_rank
    from public.public_retail_products product
    join public.public_retail_publications publication
      on publication.id = product.publication_id and publication.status = 'published'
    join public.public_retail_product_identities identity
      on identity.public_id = product.public_id
    join public.b2b_product_demand_ranking ranking
      on ranking.product_id = identity.source_product_id
     and ranking.period_days = p_period_days
     and ranking.popularity_rank <= 40
    where (p_category_slug is null or exists (
      select 1 from jsonb_array_elements(product.category_path) path
      where path ->> 'slug' = p_category_slug))
      and (p_availability is null or product.availability = p_availability)
      and not exists (
        select 1 from jsonb_each(p_facets) selected(key, values)
        where not exists (
          select 1 from jsonb_array_elements(product.specifications) specification
          where specification ->> 'key' = selected.key
            and specification ->> 'value' in (
              select jsonb_array_elements_text(selected.values))))
  ), page as (
    select * from current_products
    order by popularity_rank, (product_row).sku, (product_row).public_id
    limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(
      public.build_public_retail_product_summary(page.product_row, p_locale)
        || jsonb_build_object('isPopular', true)
      order by page.popularity_rank, (page.product_row).sku,
        (page.product_row).public_id), '[]'::jsonb),
    'totalCount', (select count(*) from current_products),
    'limit', p_limit, 'offset', p_offset)
  into result from page;
  return coalesce(result, jsonb_build_object(
    'items', '[]'::jsonb, 'totalCount', 0,
    'limit', p_limit, 'offset', p_offset));
end;
$$;

revoke all on function public.list_public_retail_products_v4(
  text, text, text, text, jsonb, text, integer, integer, integer
) from public, anon, authenticated;
grant execute on function public.list_public_retail_products_v4(
  text, text, text, text, jsonb, text, integer, integer, integer
) to anon, authenticated;

create function public.get_public_retail_showcase_v4(
  p_locale text default 'ru',
  p_rotation_seed text default null,
  p_period_days integer default 30
)
returns jsonb
language plpgsql stable security definer
set search_path = '' set row_security = off
as $$
declare popular_pool jsonb; popular_items jsonb; base jsonb;
begin
  if p_locale not in ('ru', 'ro')
    or p_period_days not in (30, 60, 90)
    or p_rotation_seed is null
    or p_rotation_seed !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then raise exception 'Public Retail showcase input is invalid.' using errcode = '22023';
  end if;
  popular_pool := public.list_public_retail_products_v4(
    p_locale, null, null, null, '{}'::jsonb, 'popular', 40, 0, p_period_days);
  select coalesce(jsonb_agg(candidate.item order by candidate.session_rank), '[]'::jsonb)
  into popular_items from (
    select pool.item,
      pg_catalog.md5(p_rotation_seed || ':' || (pool.item ->> 'id')) as session_rank
    from jsonb_array_elements(popular_pool -> 'items') pool(item)
    order by session_rank, pool.item ->> 'id' limit 5
  ) candidate;
  base := public.get_public_retail_showcase_v3(p_locale, p_rotation_seed);
  return base || jsonb_build_object(
    'popular', popular_items,
    'totalCounts', (base -> 'totalCounts') || jsonb_build_object(
      'popular', coalesce((popular_pool ->> 'totalCount')::integer, 0)));
end;
$$;

revoke all on function public.get_public_retail_showcase_v4(text, text, integer)
  from public, anon, authenticated;
grant execute on function public.get_public_retail_showcase_v4(text, text, integer)
  to anon, authenticated;

comment on table public.b2b_product_demand_ranking is
  'Internal shared 30/60/90-day B2B purchase-frequency ranking. Quantity is diagnostic only and never controls rank.';
comment on function public.refresh_b2b_product_demand_ranking() is
  'Atomically rebuilds all three inclusive Europe/Chisinau rolling rankings in one existing refresh operation; TOP assignments remain the 30-day compatibility signal.';
comment on function public.get_partner_previously_purchased_products_v4(
  uuid, uuid[], text, integer, integer, integer
) is 'Returns one company-authorized distinct-product Repeat Purchase page for a governed 30/60/90-day inclusive window with current commerce data.';

select public.refresh_b2b_product_demand_ranking();

commit;
