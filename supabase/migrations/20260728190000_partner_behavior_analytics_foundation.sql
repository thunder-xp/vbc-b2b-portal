-- Privacy-aware, append-only partner behavior events. Commercial values,
-- credentials, personal notes, and arbitrary browser context are prohibited.
create table if not exists public.partner_behavior_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  event_name text not null,
  user_id uuid not null references public.user_profiles(id),
  company_id uuid not null references public.partner_companies(id),
  session_id uuid not null,
  product_id uuid null references public.catalog_products(id),
  category_id uuid null references public.catalog_categories(id),
  brand_id uuid null references public.catalog_brands(id),
  route text not null,
  search_query_normalized text null,
  result_count integer null,
  quantity numeric(14, 3) null,
  source_surface text null,
  metadata_safe jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint partner_behavior_event_name_check check (event_name in (
    'catalog_viewed', 'category_viewed', 'search_performed',
    'search_no_results', 'filters_applied',
    'merchandising_section_viewed', 'merchandising_product_clicked',
    'product_viewed', 'product_document_downloaded',
    'stock_state_viewed', 'arrival_date_viewed',
    'product_added_to_favorites', 'product_removed_from_favorites',
    'product_added_to_compare', 'product_removed_from_compare',
    'product_added_to_cart', 'product_removed_from_cart',
    'cart_quantity_changed', 'product_added_to_estimate',
    'estimate_created', 'proposal_generated', 'order_submitted',
    'reorder_started', 'reorder_submitted',
    'out_of_stock_product_viewed', 'unavailable_product_added',
    'arrival_interest_viewed'
  )),
  constraint partner_behavior_route_check check (
    char_length(route) between 1 and 200
    and route like '/cabinet/%'
    and position('?' in route) = 0
  ),
  constraint partner_behavior_search_check check (
    search_query_normalized is null
    or char_length(search_query_normalized) between 1 and 100
  ),
  constraint partner_behavior_result_count_check check (
    result_count is null or result_count between 0 and 1000000
  ),
  constraint partner_behavior_quantity_check check (
    quantity is null or quantity > 0
  ),
  constraint partner_behavior_source_check check (
    source_surface is null or char_length(source_surface) between 1 and 50
  ),
  constraint partner_behavior_metadata_check check (
    jsonb_typeof(metadata_safe) = 'object'
    and pg_column_size(metadata_safe) <= 2048
  )
);

create index if not exists partner_behavior_events_company_time_idx
  on public.partner_behavior_events(company_id, occurred_at desc);
create index if not exists partner_behavior_events_product_time_idx
  on public.partner_behavior_events(product_id, occurred_at desc)
  where product_id is not null;
create index if not exists partner_behavior_events_name_time_idx
  on public.partner_behavior_events(event_name, occurred_at desc);
create index if not exists partner_behavior_events_search_time_idx
  on public.partner_behavior_events(search_query_normalized, occurred_at desc)
  where search_query_normalized is not null;

alter table public.partner_behavior_events enable row level security;
revoke all on table public.partner_behavior_events from public, anon, authenticated;

create or replace function public.prevent_partner_behavior_event_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Partner behavior events are append-only.'
    using errcode = '42501';
end;
$$;

drop trigger if exists prevent_partner_behavior_event_mutation
  on public.partner_behavior_events;
create trigger prevent_partner_behavior_event_mutation
before update or delete on public.partner_behavior_events
for each row execute function public.prevent_partner_behavior_event_mutation();

create or replace function public.record_partner_behavior_event(
  p_company_id uuid,
  p_event_name text,
  p_session_id uuid,
  p_product_id uuid default null,
  p_category_id uuid default null,
  p_brand_id uuid default null,
  p_route text default '/cabinet/catalog',
  p_search_query text default null,
  p_result_count integer default null,
  p_quantity numeric default null,
  p_source_surface text default null,
  p_metadata_safe jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  inserted_id uuid;
  normalized_query text := nullif(
    left(regexp_replace(lower(btrim(coalesce(p_search_query, ''))),
      '\s+', ' ', 'g'), 100),
    ''
  );
  normalized_route text := split_part(left(btrim(p_route), 200), '?', 1);
  metadata_text text := lower(coalesce(p_metadata_safe, '{}'::jsonb)::text);
begin
  if auth.uid() is null
    or not public.has_active_company_membership(p_company_id)
    or not public.has_permission(p_company_id, 'catalog.view')
  then
    raise exception 'Behavior event access denied.' using errcode = '42501';
  end if;

  if p_event_name not in (
      'catalog_viewed', 'category_viewed', 'search_performed',
      'search_no_results', 'filters_applied',
      'merchandising_section_viewed', 'merchandising_product_clicked',
      'product_viewed', 'product_document_downloaded',
      'stock_state_viewed', 'arrival_date_viewed',
      'product_added_to_favorites', 'product_removed_from_favorites',
      'product_added_to_compare', 'product_removed_from_compare',
      'product_added_to_cart', 'product_removed_from_cart',
      'cart_quantity_changed', 'product_added_to_estimate',
      'estimate_created', 'proposal_generated', 'order_submitted',
      'reorder_started', 'reorder_submitted',
      'out_of_stock_product_viewed', 'unavailable_product_added',
      'arrival_interest_viewed'
    )
    or p_session_id is null
    or normalized_route not like '/cabinet/%'
    or p_result_count is not null and p_result_count not between 0 and 1000000
    or p_quantity is not null and p_quantity <= 0
    or p_source_surface is not null
      and char_length(btrim(p_source_surface)) not between 1 and 50
    or jsonb_typeof(coalesce(p_metadata_safe, '{}'::jsonb)) <> 'object'
    or pg_column_size(coalesce(p_metadata_safe, '{}'::jsonb)) > 2048
    or metadata_text ~ '(price|amount|token|secret|password|email|authorization|note|comment)'
  then
    raise exception 'Invalid behavior event.' using errcode = '22023';
  end if;

  if p_product_id is not null and not exists (
    select 1 from public.catalog_products product
    where product.id = p_product_id and product.is_active and product.is_visible
  ) then
    raise exception 'Invalid behavior product.' using errcode = '22023';
  end if;
  if p_category_id is not null and not exists (
    select 1 from public.catalog_categories category
    where category.id = p_category_id and category.is_active
  ) then
    raise exception 'Invalid behavior category.' using errcode = '22023';
  end if;
  if p_brand_id is not null and not exists (
    select 1 from public.catalog_brands brand
    where brand.id = p_brand_id and brand.is_active
  ) then
    raise exception 'Invalid behavior brand.' using errcode = '22023';
  end if;

  insert into public.partner_behavior_events (
    event_name, user_id, company_id, session_id,
    product_id, category_id, brand_id, route,
    search_query_normalized, result_count, quantity,
    source_surface, metadata_safe
  ) values (
    p_event_name, auth.uid(), p_company_id, p_session_id,
    p_product_id, p_category_id, p_brand_id, normalized_route,
    normalized_query, p_result_count, p_quantity,
    nullif(btrim(p_source_surface), ''), coalesce(p_metadata_safe, '{}'::jsonb)
  )
  returning id into inserted_id;

  return inserted_id;
end;
$$;

revoke all on function public.record_partner_behavior_event(
  uuid, text, uuid, uuid, uuid, uuid, text, text, integer, numeric, text, jsonb
) from public, anon;
grant execute on function public.record_partner_behavior_event(
  uuid, text, uuid, uuid, uuid, uuid, text, text, integer, numeric, text, jsonb
) to authenticated;

create or replace function public.get_admin_behavior_analytics(
  p_days integer default 30,
  p_limit integer default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
  since_at timestamptz;
  event_count bigint;
begin
  if auth.uid() is null
    or not public.has_internal_permission('admin.analytics.view')
    or p_days not between 1 and 90
    or p_limit not between 1 and 25
  then
    raise exception 'Behavior analytics access denied.' using errcode = '42501';
  end if;

  since_at := now() - make_interval(days => p_days);
  select count(*) into event_count
  from public.partner_behavior_events
  where occurred_at >= since_at;

  with scoped as (
    select *
    from public.partner_behavior_events
    where occurred_at >= since_at
  ),
  product_metrics as (
    select event.product_id,
      count(*) filter (where event.event_name = 'product_viewed') as views,
      count(*) filter (where event.event_name = 'product_added_to_cart') as cart_adds,
      count(*) filter (where event.event_name = 'product_added_to_estimate') as estimate_adds,
      count(*) filter (where event.event_name = 'out_of_stock_product_viewed') as no_stock_views,
      count(distinct event.company_id) as company_count
    from scoped event
    where event.product_id is not null
    group by event.product_id
  ),
  product_rows as (
    select product.id, product.sku, product.name,
      metric.views, metric.cart_adds, metric.estimate_adds,
      metric.no_stock_views, metric.company_count
    from product_metrics metric
    join public.catalog_products product on product.id = metric.product_id
    order by metric.views desc, metric.cart_adds desc, product.name, product.id
    limit p_limit
  ),
  search_rows as (
    select search_query_normalized as query,
      count(*) as searches,
      count(distinct company_id) as company_count
    from scoped
    where event_name = 'search_no_results'
      and search_query_normalized is not null
    group by search_query_normalized
    order by count(*) desc, search_query_normalized
    limit p_limit
  ),
  category_rows as (
    select category.id, category.name, count(*) as views,
      count(distinct event.company_id) as company_count
    from scoped event
    join public.catalog_categories category on category.id = event.category_id
    where event.event_name = 'category_viewed'
    group by category.id, category.name
    order by count(*) desc, category.name
    limit p_limit
  ),
  merchandising_rows as (
    select source_surface as surface,
      count(*) filter (where event_name = 'merchandising_section_viewed') as views,
      count(*) filter (where event_name = 'merchandising_product_clicked') as clicks
    from scoped
    where event_name in (
      'merchandising_section_viewed', 'merchandising_product_clicked'
    )
    group by source_surface
    order by count(*) desc, source_surface
  )
  select jsonb_build_object(
    'periodDays', p_days,
    'eventCount', event_count,
    'sufficientVolume', event_count >= 20,
    'products', coalesce((select jsonb_agg(to_jsonb(product_rows))
      from product_rows), '[]'::jsonb),
    'searchGaps', coalesce((select jsonb_agg(to_jsonb(search_rows))
      from search_rows), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(to_jsonb(category_rows))
      from category_rows), '[]'::jsonb),
    'merchandising', coalesce((select jsonb_agg(to_jsonb(merchandising_rows))
      from merchandising_rows), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_admin_behavior_analytics(integer, integer)
  from public, anon;
grant execute on function public.get_admin_behavior_analytics(integer, integer)
  to authenticated;

comment on table public.partner_behavior_events is
  'Append-only, first-party business events. Default retention is 13 months; legal deletion or anonymization is performed by an audited operator process.';
