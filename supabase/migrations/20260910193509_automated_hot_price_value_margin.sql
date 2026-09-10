begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create table private.automated_hot_product_ranking (
  period_days smallint not null check (period_days in (30, 60, 90, 365)),
  product_id uuid not null references public.catalog_products(id) on delete cascade,
  hot_rank integer not null check (hot_rank > 0),
  hot_margin_percent numeric(12, 6) not null check (hot_margin_percent > 0 and hot_margin_percent < 100),
  purchase_frequency bigint not null check (purchase_frequency > 0),
  purchasing_company_count integer not null check (purchasing_company_count > 0),
  latest_purchase timestamptz not null,
  ddp_price numeric(20, 6) not null check (ddp_price > 0),
  stop_price numeric(20, 6) not null check (stop_price > ddp_price),
  currency text not null,
  refresh_id uuid not null,
  refreshed_at timestamptz not null,
  primary key (period_days, product_id),
  unique (period_days, hot_rank)
);

create index automated_hot_product_ranking_order_idx
  on private.automated_hot_product_ranking (
    period_days, hot_margin_percent desc, purchase_frequency desc,
    purchasing_company_count desc, latest_purchase desc, product_id
  );

alter table private.automated_hot_product_ranking enable row level security;
alter table private.automated_hot_product_ranking force row level security;
revoke all on private.automated_hot_product_ranking from public, anon, authenticated, service_role;

create table private.automated_hot_product_state (
  singleton_key smallint primary key default 1 check (singleton_key = 1),
  automated_hot_activated boolean not null default false,
  ddp_price_type_ref text not null,
  stop_price_type_ref text not null,
  refreshed_at timestamptz,
  refresh_id uuid,
  diagnostics jsonb not null default '{}'::jsonb,
  check (ddp_price_type_ref <> stop_price_type_ref)
);

alter table private.automated_hot_product_state enable row level security;
alter table private.automated_hot_product_state force row level security;
revoke all on private.automated_hot_product_state from public, anon, authenticated, service_role;

insert into private.automated_hot_product_state (
  singleton_key, automated_hot_activated, ddp_price_type_ref, stop_price_type_ref
) values (
  1, false,
  'ec9609bd-919b-11e8-80e2-000c29a58b59',
  '5c72ff41-88d6-11e8-80dd-000c29a58b59'
);

create function private.refresh_automated_hot_product_ranking()
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  target_refresh_id uuid := pg_catalog.gen_random_uuid();
  target_refreshed_at timestamptz := clock_timestamp();
  ddp_type public.price_types%rowtype;
  stop_type public.price_types%rowtype;
  diagnostic jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('private.refresh_automated_hot_product_ranking'));

  select price_type.* into ddp_type
  from public.price_types price_type
  where price_type.external_ref = 'ec9609bd-919b-11e8-80e2-000c29a58b59'
    and price_type.external_code = 'UU-000005'
    and price_type.name = 'DDP'
    and price_type.is_active;

  select price_type.* into stop_type
  from public.price_types price_type
  where price_type.external_ref = '5c72ff41-88d6-11e8-80dd-000c29a58b59'
    and price_type.external_code = 'UU-000004'
    and price_type.name = 'STOP'
    and price_type.is_active;

  if exists (select 1 from public.price_types)
    and (ddp_type.id is null or stop_type.id is null)
  then
    raise exception 'AUTOMATED_HOT_PRICE_AUTHORITY_UNAVAILABLE' using errcode = '23514';
  end if;

  if ddp_type.id is not null and (
    ddp_type.currency_status <> 'resolved'
    or stop_type.currency_status <> 'resolved'
    or lower(ddp_type.currency_code) is distinct from lower(stop_type.currency_code)
  ) then
    raise exception 'AUTOMATED_HOT_PRICE_CURRENCY_INCOMPATIBLE' using errcode = '23514';
  end if;

  create temporary table automated_hot_next on commit drop as
  with current_prices as materialized (
    select product.id as product_id,
      ddp.price_amount as ddp_price,
      stop.price_amount as stop_price,
      lower(ddp.currency) as currency
    from public.catalog_products product
    join public.product_prices ddp on ddp.product_id = product.id
      and ddp.price_type_id = ddp_type.id
      and ddp.is_active and ddp.is_published and ddp.price_amount > 0
      and ddp.currency_status = 'resolved'
      and ddp.valid_from <= statement_timestamp()
      and (ddp.valid_to is null or ddp.valid_to >= statement_timestamp())
    join public.product_prices stop on stop.product_id = product.id
      and stop.price_type_id = stop_type.id
      and stop.is_active and stop.is_published and stop.price_amount > ddp.price_amount
      and stop.currency_status = 'resolved'
      and stop.valid_from <= statement_timestamp()
      and (stop.valid_to is null or stop.valid_to >= statement_timestamp())
      and lower(stop.currency) = lower(ddp.currency)
    where product.is_active and product.is_visible
  ), eligible as (
    select ranking.period_days, ranking.product_id,
      (((price.stop_price - price.ddp_price) / price.stop_price) * 100)::numeric(12, 6)
        as hot_margin_percent,
      ranking.purchase_frequency,
      ranking.purchasing_company_count,
      ranking.last_purchased_at as latest_purchase,
      price.ddp_price, price.stop_price, price.currency
    from public.b2b_product_demand_ranking ranking
    join current_prices price on price.product_id = ranking.product_id
    where ranking.period_days in (30, 60, 90, 365)
      and ranking.purchase_frequency > 0
  )
  select eligible.*,
    row_number() over (
      partition by eligible.period_days
      order by eligible.hot_margin_percent desc,
        eligible.purchase_frequency desc,
        eligible.purchasing_company_count desc,
        eligible.latest_purchase desc,
        (select product.sku from public.catalog_products product where product.id = eligible.product_id),
        eligible.product_id
    )::integer as hot_rank,
    target_refresh_id as refresh_id,
    target_refreshed_at as refreshed_at
  from eligible;

  delete from private.automated_hot_product_ranking;
  insert into private.automated_hot_product_ranking (
    period_days, product_id, hot_rank, hot_margin_percent,
    purchase_frequency, purchasing_company_count, latest_purchase,
    ddp_price, stop_price, currency, refresh_id, refreshed_at
  )
  select period_days, product_id, hot_rank, hot_margin_percent,
    purchase_frequency, purchasing_company_count, latest_purchase,
    ddp_price, stop_price, currency, refresh_id, refreshed_at
  from automated_hot_next;

  with all_prices as materialized (
    select product.id as product_id,
      ddp.id as ddp_id, ddp.price_amount as ddp_price,
      ddp.is_active as ddp_active, ddp.is_published as ddp_published,
      ddp.valid_from as ddp_from, ddp.valid_to as ddp_to,
      ddp.currency_status as ddp_status, ddp.currency as ddp_currency,
      stop.id as stop_id, stop.price_amount as stop_price,
      stop.is_active as stop_active, stop.is_published as stop_published,
      stop.valid_from as stop_from, stop.valid_to as stop_to,
      stop.currency_status as stop_status, stop.currency as stop_currency
    from public.catalog_products product
    left join lateral (select price.* from public.product_prices price
      where price.product_id=product.id and price.price_type_id=ddp_type.id
      order by price.is_active desc, price.is_published desc, price.valid_from desc, price.id limit 1) ddp on true
    left join lateral (select price.* from public.product_prices price
      where price.product_id=product.id and price.price_type_id=stop_type.id
      order by price.is_active desc, price.is_published desc, price.valid_from desc, price.id limit 1) stop on true
    where product.is_active and product.is_visible
      and exists (select 1 from public.b2b_product_demand_ranking ranking
        where ranking.product_id=product.id and ranking.period_days=365)
  )
  select jsonb_build_object(
    'totalProductsConsidered', count(*),
    'missingDdp', count(*) filter (where ddp_id is null),
    'missingStop', count(*) filter (where stop_id is null),
    'invalidDdp', count(*) filter (where ddp_id is not null and (
      not ddp_active or not ddp_published or ddp_price <= 0 or ddp_status <> 'resolved'
      or ddp_from > statement_timestamp() or (ddp_to is not null and ddp_to < statement_timestamp()))),
    'invalidStop', count(*) filter (where stop_id is not null and (
      not stop_active or not stop_published or stop_price <= 0 or stop_status <> 'resolved'
      or stop_from > statement_timestamp() or (stop_to is not null and stop_to < statement_timestamp()))),
    'stopLeDdp', count(*) filter (
      where ddp_id is not null and stop_id is not null and stop_price <= ddp_price),
    'currencyMismatch', count(*) filter (
      where ddp_id is not null and stop_id is not null
        and lower(ddp_currency) is distinct from lower(stop_currency)),
    'eligibleHot365', (select count(*) from automated_hot_next where period_days=365),
    'eligibleHot30', (select count(*) from automated_hot_next where period_days=30),
    'eligibleHot60', (select count(*) from automated_hot_next where period_days=60),
    'eligibleHot90', (select count(*) from automated_hot_next where period_days=90),
    'refreshId', target_refresh_id,
    'refreshedAt', target_refreshed_at
  ) into diagnostic from all_prices;

  update private.automated_hot_product_state
  set refreshed_at = target_refreshed_at,
    refresh_id = target_refresh_id,
    diagnostics = diagnostic
  where singleton_key = 1;

  return diagnostic;
end;
$$;

revoke all on function private.refresh_automated_hot_product_ranking()
  from public, anon, authenticated;
grant execute on function private.refresh_automated_hot_product_ranking()
  to service_role;

create function public.refresh_automated_hot_product_ranking()
returns jsonb
language sql
security definer
set search_path = ''
set row_security = off
as $$
  select private.refresh_automated_hot_product_ranking();
$$;

revoke all on function public.refresh_automated_hot_product_ranking()
  from public, anon, authenticated;
grant execute on function public.refresh_automated_hot_product_ranking()
  to service_role;

-- Keep HOT synchronized by every existing order-history refresh without adding
-- another scheduler or render-time aggregation.
do $migration$
declare definition text; changed text;
begin
  select pg_get_functiondef(procedure.oid) into definition
  from pg_proc procedure join pg_namespace namespace on namespace.oid=procedure.pronamespace
  where namespace.nspname='public' and procedure.proname='refresh_b2b_product_demand_ranking';
  changed := replace(definition,
    '  refresh_completed_at := clock_timestamp();',
    E'  perform private.refresh_automated_hot_product_ranking();\n\n  refresh_completed_at := clock_timestamp();');
  if changed=definition or changed not like '%private.refresh_automated_hot_product_ranking()%' then
    raise exception 'Could not attach HOT refresh to commerce refresh.';
  end if;
  execute changed;
end
$migration$;

create function public.get_published_product_merchandising_v7(
  p_company_id uuid,
  p_label_code text default null,
  p_limit_per_label integer default 5,
  p_rotation_seed text default null,
  p_popular_period_days integer default 365,
  p_new_period_days integer default 365,
  p_hot_period_days integer default 365
)
returns table(
  product_id uuid, label_code text, priority integer,
  starts_at timestamptz, ends_at timestamptz, source text,
  matching_product_count integer
)
language plpgsql stable security definer
set search_path = '' set row_security = off
as $$
begin
  if auth.uid() is null
    or not public.has_active_company_membership(p_company_id)
    or not public.has_permission(p_company_id, 'catalog.view')
  then raise exception 'Catalog merchandising access denied.' using errcode='42501'; end if;
  if (p_label_code is not null and p_label_code not in ('NEW','TOP','HOT'))
    or p_limit_per_label not between 1 and 24
    or p_popular_period_days not in (30,60,90,365)
    or p_new_period_days not in (30,60,90,365)
    or p_hot_period_days not in (30,60,90,365)
    or (p_rotation_seed is not null and char_length(p_rotation_seed)>128)
  then raise exception 'Invalid merchandising projection input.' using errcode='22023'; end if;

  return query select projection.*
  from public.get_published_product_merchandising_v6(
    p_company_id, p_label_code, p_limit_per_label, p_rotation_seed,
    p_popular_period_days, p_new_period_days
  ) projection
  where projection.label_code <> 'HOT';

  if p_label_code is null or p_label_code='HOT' then
    return query
    with candidates as (
      select ranking.*, count(*) over ()::integer total_count
      from private.automated_hot_product_ranking ranking
      join public.catalog_products product on product.id=ranking.product_id
        and product.is_active and product.is_visible
      where ranking.period_days=p_hot_period_days
        and coalesce((select state.automated_hot_activated
          from private.automated_hot_product_state state where state.singleton_key=1),false)
    ), chosen as (
      select candidate.* from candidates candidate
      order by case when p_rotation_seed is not null and candidate.hot_rank <= p_limit_per_label*3
          then 0 else 1 end,
        case when p_rotation_seed is not null and candidate.hot_rank <= p_limit_per_label*3
          then pg_catalog.md5(p_rotation_seed||':'||candidate.product_id::text) end,
        candidate.hot_rank, candidate.product_id
      limit p_limit_per_label
    )
    select chosen.product_id, 'HOT'::text,
      (1000000-chosen.hot_rank)::integer, chosen.refreshed_at,
      null::timestamptz, 'one_c'::text, chosen.total_count
    from chosen
    order by case when p_rotation_seed is not null and chosen.hot_rank <= p_limit_per_label*3
        then pg_catalog.md5(p_rotation_seed||':'||chosen.product_id::text) end,
      chosen.hot_rank, chosen.product_id;
  end if;
end;
$$;

revoke all on function public.get_published_product_merchandising_v7(
  uuid,text,integer,text,integer,integer,integer
) from public, anon;
grant execute on function public.get_published_product_merchandising_v7(
  uuid,text,integer,text,integer,integer,integer
) to authenticated;

create function public.get_published_product_labels_v2(
  p_company_id uuid, p_product_ids uuid[]
)
returns table(product_id uuid,label_code text,priority integer,
  starts_at timestamptz,ends_at timestamptz,source text)
language plpgsql stable security definer
set search_path='' set row_security=off
as $$
begin
  if auth.uid() is null or not public.has_active_company_membership(p_company_id)
    or not public.has_permission(p_company_id,'catalog.view')
    or coalesce(array_length(p_product_ids,1),0) not between 1 and 100
  then raise exception 'Published merchandising access denied.' using errcode='42501'; end if;
  return query select label.product_id,label.label_code,label.priority,
    label.starts_at,label.ends_at,label.source
  from public.get_published_product_labels(p_company_id,p_product_ids) label
  where label.label_code <> 'HOT';
  return query
  select ranking.product_id,'HOT'::text,(1000000-ranking.hot_rank)::integer,
    ranking.refreshed_at,null::timestamptz,'one_c'::text
  from private.automated_hot_product_ranking ranking
  where ranking.period_days=365 and ranking.product_id=any(p_product_ids)
    and coalesce((select state.automated_hot_activated
      from private.automated_hot_product_state state where state.singleton_key=1),false)
  order by ranking.product_id;
end;
$$;

revoke all on function public.get_published_product_labels_v2(uuid,uuid[])
  from public,anon;
grant execute on function public.get_published_product_labels_v2(uuid,uuid[])
  to authenticated;

-- Derive the current commercial/facet engines, changing only HOT membership
-- and default ordering. Private margin values never enter the returned JSON.
do $migration$
declare definition text; changed text;
begin
  select pg_get_functiondef(procedure.oid) into definition
  from pg_proc procedure join pg_namespace namespace on namespace.oid=procedure.pronamespace
  where namespace.nspname='public' and procedure.proname='catalog_partner_page_unified_period_base';
  changed := replace(definition, 'FUNCTION public.catalog_partner_page_unified_period_base(',
    'FUNCTION public.catalog_partner_page_automated_hot_base(');
  changed := replace(changed,
    $$or (p_merchandising_label not in ('REPLENISHMENT', 'TOP', 'NEW') and exists ($$,
    $$or (p_merchandising_label = 'HOT'
        and coalesce((select state.automated_hot_activated
          from private.automated_hot_product_state state where state.singleton_key = 1), false)
        and exists (
          select 1 from private.automated_hot_product_ranking hot
          where hot.product_id = product.id and hot.period_days = p_period_days
        ))
        or (p_merchandising_label not in ('REPLENISHMENT', 'TOP', 'NEW', 'HOT') and exists ($$);
  changed := replace(changed,
    $$      case when effective_sort = 'default'
        then commercial.sort_order end,$$,
    $$      case when p_merchandising_label = 'HOT' and effective_sort = 'default'
        then (select hot.hot_rank from private.automated_hot_product_ranking hot
          where hot.product_id = commercial.id and hot.period_days = p_period_days) end,
      case when effective_sort = 'default'
        then commercial.sort_order end,$$);
  if changed=definition or changed not like '%private.automated_hot_product_ranking%' then
    raise exception 'Could not derive automated HOT catalog engine.';
  end if;
  execute changed;

  select pg_get_functiondef(procedure.oid) into definition
  from pg_proc procedure join pg_namespace namespace on namespace.oid=procedure.pronamespace
  where namespace.nspname='public' and procedure.proname='catalog_partner_facets_v6';
  changed := replace(definition, 'FUNCTION public.catalog_partner_facets_v6(',
    'FUNCTION public.catalog_partner_facets_v7(');
  changed := replace(changed,
    $$or (p_selection not in ('REPLENISHMENT', 'TOP')
          and (p_selection <> 'NEW' or not coalesce((select state.automated_new_activated from public.catalog_product_new_state state where state.singleton_key = 1), false))
          and exists ($$,
    $$or (p_selection = 'HOT'
        and coalesce((select state.automated_hot_activated
          from private.automated_hot_product_state state where state.singleton_key = 1), false)
        and exists (
          select 1 from private.automated_hot_product_ranking hot
          where hot.product_id = p.id and hot.period_days = p_period_days
        ))
        or (p_selection not in ('REPLENISHMENT', 'TOP', 'HOT')
          and (p_selection <> 'NEW' or not coalesce((select state.automated_new_activated from public.catalog_product_new_state state where state.singleton_key = 1), false))
          and exists ($$);
  if changed=definition or changed not like '%private.automated_hot_product_ranking%' then
    raise exception 'Could not derive automated HOT catalog facets.';
  end if;
  execute changed;
end
$migration$;

revoke all on function public.catalog_partner_page_automated_hot_base(
  uuid,uuid,uuid[],uuid,text,text,jsonb,text,text,integer,integer,integer
) from public,anon,authenticated,service_role;
revoke all on function public.catalog_partner_facets_v7(
  uuid,uuid,uuid[],uuid,text,text,jsonb,text,integer,integer
) from public,anon;
grant execute on function public.catalog_partner_facets_v7(
  uuid,uuid,uuid[],uuid,text,text,jsonb,text,integer,integer
) to authenticated;

create function public.catalog_partner_page_v12(
  p_company_id uuid, p_category_id uuid default null,
  p_category_ids uuid[] default null, p_brand_id uuid default null,
  p_search text default null, p_availability text default 'all',
  p_filters jsonb default '{}'::jsonb,
  p_merchandising_label text default null, p_sort text default 'default',
  p_limit integer default 12, p_offset integer default 0,
  p_period_days integer default 365
)
returns jsonb language plpgsql stable security definer
set search_path='' set row_security=off
as $$
declare payload jsonb; items jsonb;
begin
  if p_period_days not in (30,60,90,365) then
    raise exception 'Invalid merchandising period.' using errcode='22023'; end if;
  if p_merchandising_label is distinct from 'HOT' then
    return public.catalog_partner_page_v11(p_company_id,p_category_id,p_category_ids,
      p_brand_id,p_search,p_availability,p_filters,p_merchandising_label,p_sort,
      p_limit,p_offset,p_period_days);
  end if;
  payload := public.catalog_partner_page_automated_hot_base(p_company_id,p_category_id,
    p_category_ids,p_brand_id,p_search,p_availability,p_filters,p_merchandising_label,
    p_sort,p_limit,p_offset,p_period_days);
  select coalesce(jsonb_agg(
    case when coalesce(source.item->'merchandising_labels','[]'::jsonb) ? 'HOT'
      then source.item else jsonb_set(source.item,'{merchandising_labels}',
        coalesce(source.item->'merchandising_labels','[]'::jsonb)||'"HOT"'::jsonb) end
    order by source.ordinal),'[]'::jsonb)
  into items from jsonb_array_elements(coalesce(payload->'items','[]'::jsonb))
    with ordinality source(item,ordinal);
  return payload||jsonb_build_object('items',items);
end;
$$;

revoke all on function public.catalog_partner_page_v12(
  uuid,uuid,uuid[],uuid,text,text,jsonb,text,text,integer,integer,integer
) from public,anon;
grant execute on function public.catalog_partner_page_v12(
  uuid,uuid,uuid[],uuid,text,text,jsonb,text,text,integer,integer,integer
) to authenticated;

create function public.list_public_retail_hot_products_v3(
  p_locale text default 'ru', p_category_slug text default null,
  p_search text default null, p_availability text default null,
  p_facets jsonb default '{}'::jsonb, p_limit integer default 24,
  p_offset integer default 0, p_period_days integer default 365
)
returns jsonb language plpgsql stable security definer
set search_path='' set row_security=off
as $$
declare result jsonb;
begin
  if p_locale not in ('ru','ro') or p_limit not between 1 and 48
    or p_offset<0 or p_offset>10000 or p_period_days not in (30,60,90,365)
    or (p_availability is not null and p_availability not in ('in_stock','low_stock','available_to_order','unavailable','unknown'))
    or (p_search is not null and char_length(btrim(p_search))>100)
    or jsonb_typeof(p_facets)<>'object'
    or (select count(*) from jsonb_object_keys(p_facets))>8
    or exists (select 1 from jsonb_each(p_facets) selected(key,values)
      where char_length(selected.key)>160 or jsonb_typeof(selected.values)<>'array'
        or jsonb_array_length(selected.values) not between 1 and 10
        or exists (select 1 from jsonb_array_elements(selected.values) value
          where jsonb_typeof(value)<>'string' or char_length(value #>> '{}')>1000))
  then raise exception 'Public Retail HOT input is invalid.' using errcode='22023'; end if;
  with current_products as (
    select product as product_row, ranking.hot_rank
    from public.public_retail_products product
    join public.public_retail_publications publication
      on publication.id=product.publication_id and publication.status='published'
    join public.public_retail_product_identities identity on identity.public_id=product.public_id
    join private.automated_hot_product_ranking ranking
      on ranking.product_id=identity.source_product_id and ranking.period_days=p_period_days
    where coalesce((select state.automated_hot_activated
      from private.automated_hot_product_state state where state.singleton_key=1),false)
      and (p_category_slug is null or exists (select 1 from jsonb_array_elements(product.category_path) path where path->>'slug'=p_category_slug))
      and (p_availability is null or product.availability=p_availability)
      and (nullif(btrim(p_search),'') is null
        or lower(product.sku)=lower(btrim(p_search))
        or lower(product.sku) like lower(btrim(p_search))||'%'
        or product.name_ru ilike '%'||btrim(p_search)||'%'
        or product.name_ro ilike '%'||btrim(p_search)||'%'
        or product.brand->>'nameRu' ilike '%'||btrim(p_search)||'%'
        or product.brand->>'nameRo' ilike '%'||btrim(p_search)||'%')
      and not exists (select 1 from jsonb_each(p_facets) selected(key,values)
        where not exists (select 1 from jsonb_array_elements(product.specifications) specification
          where specification->>'key'=selected.key
            and specification->>'value' in (select jsonb_array_elements_text(selected.values))))
  ), page as (
    select * from current_products order by hot_rank,(product_row).sku,(product_row).public_id
    limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'items',coalesce(jsonb_agg(public.build_public_retail_product_summary(page.product_row,p_locale)
      ||jsonb_build_object('isHot',true)
      order by page.hot_rank,(page.product_row).sku,(page.product_row).public_id),'[]'::jsonb),
    'totalCount',(select count(*) from current_products),'limit',p_limit,'offset',p_offset)
  into result from page;
  return coalesce(result,jsonb_build_object('items','[]'::jsonb,'totalCount',0,'limit',p_limit,'offset',p_offset));
end;
$$;

revoke all on function public.list_public_retail_hot_products_v3(text,text,text,text,jsonb,integer,integer,integer)
  from public;
grant execute on function public.list_public_retail_hot_products_v3(text,text,text,text,jsonb,integer,integer,integer)
  to anon,authenticated;

create function public.get_public_retail_showcase_v7(
  p_locale text default 'ru', p_rotation_seed text default null,
  p_popular_period_days integer default 365,
  p_new_period_days integer default 365,
  p_hot_period_days integer default 365
)
returns jsonb language plpgsql stable security definer
set search_path='' set row_security=off
as $$
declare base jsonb; hot_items jsonb; hot_total integer;
begin
  if p_hot_period_days not in (30,60,90,365) then
    raise exception 'Public Retail HOT period is invalid.' using errcode='22023'; end if;
  base := public.get_public_retail_showcase_v6(p_locale,p_rotation_seed,
    p_popular_period_days,p_new_period_days);
  with candidates as (
    select product,ranking.hot_rank,count(*) over()::integer total_count
    from public.public_retail_products product
    join public.public_retail_publications publication
      on publication.id=product.publication_id and publication.status='published'
    join public.public_retail_product_identities identity on identity.public_id=product.public_id
    join private.automated_hot_product_ranking ranking
      on ranking.product_id=identity.source_product_id and ranking.period_days=p_hot_period_days
    where coalesce((select state.automated_hot_activated
      from private.automated_hot_product_state state where state.singleton_key=1),false)
  ), band as (
    select * from candidates order by hot_rank limit 15
  ), chosen as (
    select * from band order by pg_catalog.md5(p_rotation_seed||':'||(product).public_id::text),(product).public_id limit 5
  )
  select coalesce(jsonb_agg(public.build_public_retail_product_summary(chosen.product,p_locale)
      ||jsonb_build_object('isHot',true)
      order by pg_catalog.md5(p_rotation_seed||':'||(chosen.product).public_id::text),(chosen.product).public_id),'[]'::jsonb),
    coalesce(max(chosen.total_count),0)
  into hot_items,hot_total from chosen;
  return base||jsonb_build_object('hot',hot_items,'totalCounts',
    (base->'totalCounts')||jsonb_build_object('hot',hot_total));
end;
$$;

revoke all on function public.get_public_retail_showcase_v7(text,text,integer,integer,integer)
  from public;
grant execute on function public.get_public_retail_showcase_v7(text,text,integer,integer,integer)
  to anon,authenticated;

create function public.get_or_refresh_partner_dashboard_selections_v6(
  p_user_id uuid,p_company_id uuid,p_login_generation text,
  p_repeat_period_days integer default 365,
  p_popular_period_days integer default 365,
  p_new_period_days integer default 365,
  p_hot_period_days integer default 365
)
returns jsonb language plpgsql security definer
set search_path='' set row_security=off
as $$
declare base jsonb; hot_products jsonb; hot_count integer;
begin
  if p_hot_period_days not in (30,60,90,365) then
    raise exception 'Invalid Dashboard HOT period.' using errcode='22023'; end if;
  base := public.get_or_refresh_partner_dashboard_selections_v5(p_user_id,p_company_id,
    p_login_generation,p_repeat_period_days,p_popular_period_days,p_new_period_days);
  with candidates as (
    select ranking.*,count(*) over()::integer total_count
    from private.automated_hot_product_ranking ranking
    join public.catalog_products product on product.id=ranking.product_id
      and product.is_active and product.is_visible
    where ranking.period_days=p_hot_period_days
      and coalesce((select state.automated_hot_activated
        from private.automated_hot_product_state state where state.singleton_key=1),false)
  ), band as (
    select * from candidates order by hot_rank limit 15
  ), chosen as (
    select * from band order by pg_catalog.md5(p_login_generation||':'||product_id::text),product_id limit 5
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',product.id,'sku',product.sku,'name',product.name,'slug',product.slug,
    'imageUrl',coalesce(product.image_source_url,product.image_url,(
      select image.url from public.catalog_product_images image where image.product_id=product.id
      order by image.is_primary desc,image.sort_order,image.id limit 1)),
    'categoryId',product.category_id,'categoryName',category.name,
    'labelCodes','["HOT"]'::jsonb,'sourceCodes','["HOT"]'::jsonb
  ) order by pg_catalog.md5(p_login_generation||':'||product.id::text),product.id),'[]'::jsonb),
    coalesce(max(chosen.total_count),0)
  into hot_products,hot_count
  from chosen join public.catalog_products product on product.id=chosen.product_id
  left join public.catalog_categories category on category.id=product.category_id;
  return base||jsonb_build_object('hotProducts',hot_products,'hotCandidateCount',hot_count);
end;
$$;

revoke all on function public.get_or_refresh_partner_dashboard_selections_v6(
  uuid,uuid,text,integer,integer,integer,integer
) from public,anon,authenticated;
grant execute on function public.get_or_refresh_partner_dashboard_selections_v6(
  uuid,uuid,text,integer,integer,integer,integer
) to service_role;

select private.refresh_automated_hot_product_ranking();

comment on table private.automated_hot_product_ranking is
  'Private current DDP-to-STOP reserve ranking for all commercially active products in rolling 30/60/90/365 windows. Never expose price or margin columns to browser roles.';
comment on function private.refresh_automated_hot_product_ranking() is
  'AUTOMATION_FIRST: atomically rebuilds HOT from current authoritative DDP/STOP and the governed purchase-frequency projection.';
comment on function public.refresh_automated_hot_product_ranking() is
  'Service-role orchestration boundary for the private automated HOT projection.';

commit;
