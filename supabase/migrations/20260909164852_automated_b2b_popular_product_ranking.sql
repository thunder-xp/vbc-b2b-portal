begin;

-- Popular is derived from governed B2B order history. The detailed aggregate
-- stays internal; storefronts continue to consume only the existing TOP
-- assignment projection and therefore expose no company-level demand data.
create table public.b2b_product_demand_ranking (
  product_id uuid primary key
    references public.catalog_products(id) on delete cascade,
  popularity_rank integer not null check (popularity_rank > 0),
  total_purchased_quantity numeric not null
    check (total_purchased_quantity > 0),
  purchasing_company_count integer not null
    check (purchasing_company_count > 0),
  authoritative_order_count bigint not null
    check (authoritative_order_count > 0),
  authoritative_line_count bigint not null
    check (authoritative_line_count > 0),
  last_purchased_at timestamptz not null,
  refresh_id uuid not null,
  refreshed_at timestamptz not null
);

create index b2b_product_demand_ranking_rank_idx
  on public.b2b_product_demand_ranking(popularity_rank, product_id);

create table public.b2b_product_demand_ranking_state (
  singleton_key smallint primary key default 1
    check (singleton_key = 1),
  refresh_id uuid not null,
  refreshed_at timestamptz not null,
  source_history_from timestamptz null,
  source_history_through timestamptz null,
  source_order_count bigint not null check (source_order_count >= 0),
  source_line_count bigint not null check (source_line_count >= 0),
  unresolved_source_line_count bigint not null
    check (unresolved_source_line_count >= 0),
  eligible_product_count integer not null
    check (eligible_product_count >= 0),
  popular_set_size integer not null check (popular_set_size >= 0),
  top_40_threshold_quantity numeric null
    check (top_40_threshold_quantity is null or top_40_threshold_quantity > 0)
);

alter table public.b2b_product_demand_ranking enable row level security;
alter table public.b2b_product_demand_ranking_state enable row level security;

revoke all on table public.b2b_product_demand_ranking,
  public.b2b_product_demand_ranking_state
from public, anon, authenticated, service_role;

-- Existing catalog reads publish one_c assignments. Automated TOP records use
-- that existing system-source identity while the dedicated ranking projection
-- records the exact B2B-demand semantics and aggregate evidence.
alter table public.product_merchandising_assignments
  alter column created_by drop not null,
  alter column updated_by drop not null;

alter table public.product_merchandising_assignments
  add constraint product_merchandising_assignment_actor_check
  check (
    source = 'one_c'
    or (created_by is not null and updated_by is not null)
  );

create or replace function public.prevent_manual_popular_management()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.label_code = 'TOP'
    and new.source = 'manual'
    and auth.uid() is not null then
    raise exception 'MERCHANDISING_POPULAR_SYSTEM_MANAGED'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger prevent_manual_popular_management
before insert or update on public.product_merchandising_assignments
for each row execute function public.prevent_manual_popular_management();

revoke all on function public.prevent_manual_popular_management()
from public, anon, authenticated, service_role;

-- This covering index keeps the asynchronous all-history aggregation bounded
-- without adding work to Catalog or Dashboard requests.
create index partner_order_history_items_popularity_idx
  on public.partner_order_history_items(product_id, order_history_id)
  include (quantity)
  where product_id is not null and quantity > 0;

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
  eligible_products integer := 0;
  published_products integer := 0;
  source_orders bigint := 0;
  source_lines bigint := 0;
  unresolved_lines bigint := 0;
  history_from timestamptz;
  history_through timestamptz;
  threshold_quantity numeric;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('b2b-product-demand-ranking-refresh', 0)
  );

  with governed_lines as materialized (
    select
      history.id as order_id,
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
      and item.product_id is not null
      and item.quantity > 0
  ), aggregated as (
    select
      governed.product_id,
      sum(governed.quantity) as total_purchased_quantity,
      count(distinct governed.company_id)::integer
        as purchasing_company_count,
      count(distinct governed.order_id) as authoritative_order_count,
      count(*) as authoritative_line_count,
      max(governed.one_c_document_date) as last_purchased_at
    from governed_lines governed
    group by governed.product_id
  ), ranked as (
    select
      aggregate.*,
      row_number() over (
        order by
          aggregate.total_purchased_quantity desc,
          aggregate.purchasing_company_count desc,
          aggregate.authoritative_order_count desc,
          aggregate.authoritative_line_count desc,
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
      refreshed_at
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
      refresh_started_at
    from ranked
    on conflict (product_id) do update
    set popularity_rank = excluded.popularity_rank,
      total_purchased_quantity = excluded.total_purchased_quantity,
      purchasing_company_count = excluded.purchasing_company_count,
      authoritative_order_count = excluded.authoritative_order_count,
      authoritative_line_count = excluded.authoritative_line_count,
      last_purchased_at = excluded.last_purchased_at,
      refresh_id = excluded.refresh_id,
      refreshed_at = excluded.refreshed_at
    returning popularity_rank, total_purchased_quantity
  )
  select
    count(*)::integer,
    max(total_purchased_quantity) filter (where popularity_rank = 40)
  into eligible_products, threshold_quantity
  from refreshed;

  delete from public.b2b_product_demand_ranking ranking
  where ranking.refresh_id <> target_refresh_id;

  -- Retain historical manual rows but remove them from current truth.
  update public.product_merchandising_assignments assignment
  set is_active = false,
    is_curated_visible = false,
    reason = 'Superseded by automated B2B demand ranking',
    revoked_at = refresh_started_at,
    updated_at = refresh_started_at
  where assignment.label_code = 'TOP'
    and assignment.source = 'manual'
    and assignment.is_active
    and assignment.revoked_at is null;

  -- The default Popular presentation set is exactly the available Top 40 (or
  -- every eligible product when fewer than 40 exist). Rankings beyond 40 stay
  -- in the internal projection for future expansion.
  update public.product_merchandising_assignments assignment
  set is_active = false,
    is_curated_visible = false,
    reason = 'Outside current automated B2B demand Top 40',
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
    'Automated B2B demand rank ' || ranking.popularity_rank::text,
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

  -- Public Retail intentionally shares the merchandising badge projection.
  -- Reuse its existing set-based hydration boundary so B2C receives the same
  -- badge only, never the private B2B aggregate or purchasing-company detail.
  perform public.hydrate_public_retail_product_presentation(publication.id)
  from public.public_retail_publications publication
  where publication.status = 'published';

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
    top_40_threshold_quantity
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
    threshold_quantity
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
    top_40_threshold_quantity = excluded.top_40_threshold_quantity;

  return jsonb_build_object(
    'refreshId', target_refresh_id,
    'refreshedAt', refresh_completed_at,
    'eligibleProductCount', eligible_products,
    'popularSetSize', published_products,
    'top40ThresholdQuantity', threshold_quantity,
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

revoke all on function public.refresh_b2b_product_demand_ranking()
from public, anon, authenticated;
grant execute on function public.refresh_b2b_product_demand_ranking()
to service_role;

comment on table public.b2b_product_demand_ranking is
  'Internal all-time global B2B purchased-quantity ranking. Contains aggregates only and is not partner-readable.';
comment on table public.b2b_product_demand_ranking_state is
  'Internal refresh diagnostics for the automated B2B Popular projection.';
comment on function public.refresh_b2b_product_demand_ranking() is
  'Atomically rebuilds the global B2B demand ranking and current TOP 40 assignments from governed order history.';

commit;
