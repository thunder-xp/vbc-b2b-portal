begin;

create table public.partner_product_cobuy_associations (
  source_product_id uuid not null references public.catalog_products(id) on delete cascade,
  candidate_product_id uuid not null references public.catalog_products(id) on delete cascade,
  pair_order_count bigint not null,
  source_order_count bigint not null,
  candidate_order_count bigint not null,
  pair_company_count integer not null,
  total_order_count bigint not null,
  confidence numeric(12, 8) not null,
  lift numeric(16, 8) not null,
  latest_pair_at timestamptz not null,
  association_rank integer not null,
  window_start date not null,
  window_end date not null,
  refresh_id uuid not null,
  refreshed_at timestamptz not null,
  primary key (source_product_id, candidate_product_id),
  constraint partner_product_cobuy_not_self_check
    check (source_product_id <> candidate_product_id),
  constraint partner_product_cobuy_counts_check check (
    pair_order_count >= 3
    and source_order_count >= pair_order_count
    and candidate_order_count >= pair_order_count
    and pair_company_count >= 3
    and total_order_count >= source_order_count
    and total_order_count >= candidate_order_count
  ),
  constraint partner_product_cobuy_metrics_check
    check (confidence >= 0.05 and confidence <= 1 and lift > 1),
  constraint partner_product_cobuy_rank_check check (association_rank > 0),
  constraint partner_product_cobuy_window_check
    check (window_end - window_start = 364)
);

create index partner_product_cobuy_source_rank_idx
  on public.partner_product_cobuy_associations (
    source_product_id,
    association_rank,
    candidate_product_id
  );

create table public.partner_product_cobuy_state (
  singleton_key smallint primary key default 1 check (singleton_key = 1),
  refresh_id uuid not null,
  refreshed_at timestamptz not null,
  business_date date not null,
  window_start date not null,
  window_end date not null,
  total_order_count bigint not null,
  eligible_source_product_count integer not null,
  association_count integer not null,
  source_history_from timestamptz null,
  source_history_through timestamptz null,
  minimum_pair_order_count integer not null,
  minimum_pair_company_count integer not null,
  minimum_confidence numeric(12, 8) not null,
  minimum_lift numeric(16, 8) not null,
  duration_ms integer not null,
  constraint partner_product_cobuy_state_window_check
    check (window_end - window_start = 364),
  constraint partner_product_cobuy_state_counts_check check (
    total_order_count >= 0
    and eligible_source_product_count >= 0
    and association_count >= 0
    and minimum_pair_order_count >= 3
    and minimum_pair_company_count >= 3
    and minimum_confidence >= 0.05
    and minimum_lift >= 1
    and duration_ms >= 0
  )
);

alter table public.partner_product_cobuy_associations enable row level security;
alter table public.partner_product_cobuy_associations force row level security;
alter table public.partner_product_cobuy_state enable row level security;
alter table public.partner_product_cobuy_state force row level security;

revoke all on table public.partner_product_cobuy_associations
  from public, anon, authenticated;
revoke all on table public.partner_product_cobuy_state
  from public, anon, authenticated;
grant select, insert, update, delete on table public.partner_product_cobuy_associations
  to service_role;
grant select, insert, update on table public.partner_product_cobuy_state
  to service_role;

create index partner_order_history_completed_cobuy_window_idx
  on public.partner_order_history (one_c_document_date, id, company_id)
  where partner_visible
    and one_c_posted
    and not one_c_deletion_mark
    and one_c_state_code = 'completed';

create or replace function public.refresh_partner_product_cobuy_associations()
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
  eligible_orders bigint := 0;
  eligible_sources integer := 0;
  associations integer := 0;
  history_from timestamptz;
  history_through timestamptz;
begin
  governed_window_end := governed_business_date;
  governed_window_start := governed_business_date - 364;
  governed_window_start_at :=
    governed_window_start::timestamp at time zone 'Europe/Chisinau';
  governed_window_end_exclusive_at :=
    (governed_window_end + 1)::timestamp at time zone 'Europe/Chisinau';

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('partner-product-cobuy-refresh', 0)
  );

  with governed_order_products as materialized (
    select distinct
      history.id as authoritative_order_id,
      history.company_id,
      history.one_c_document_date,
      item.product_id
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
      and history.one_c_state_code = 'completed'
      and history.one_c_document_date >= governed_window_start_at
      and history.one_c_document_date < governed_window_end_exclusive_at
      and item.product_id is not null
      and item.quantity > 0
  ), order_totals as (
    select
      count(distinct governed.authoritative_order_id) as total_order_count,
      min(governed.one_c_document_date) as source_history_from,
      max(governed.one_c_document_date) as source_history_through
    from governed_order_products governed
  ), product_totals as materialized (
    select
      governed.product_id,
      count(distinct governed.authoritative_order_id) as product_order_count
    from governed_order_products governed
    group by governed.product_id
  ), pair_totals as materialized (
    select
      source.product_id as source_product_id,
      candidate.product_id as candidate_product_id,
      count(distinct source.authoritative_order_id) as pair_order_count,
      count(distinct source.company_id)::integer as pair_company_count,
      max(source.one_c_document_date) as latest_pair_at
    from governed_order_products source
    join governed_order_products candidate
      on candidate.authoritative_order_id = source.authoritative_order_id
     and candidate.product_id <> source.product_id
    group by source.product_id, candidate.product_id
  ), measured as (
    select
      pair.source_product_id,
      pair.candidate_product_id,
      pair.pair_order_count,
      source_total.product_order_count as source_order_count,
      candidate_total.product_order_count as candidate_order_count,
      pair.pair_company_count,
      order_total.total_order_count,
      pair.pair_order_count::numeric
        / source_total.product_order_count::numeric as confidence,
      (
        pair.pair_order_count::numeric
          / source_total.product_order_count::numeric
      ) / (
        candidate_total.product_order_count::numeric
          / order_total.total_order_count::numeric
      ) as lift,
      pair.latest_pair_at
    from pair_totals pair
    join product_totals source_total
      on source_total.product_id = pair.source_product_id
    join product_totals candidate_total
      on candidate_total.product_id = pair.candidate_product_id
    cross join order_totals order_total
    where order_total.total_order_count > 0
  ), qualifying as (
    select measured.*
    from measured
    where measured.pair_order_count >= 3
      and measured.pair_company_count >= 3
      and measured.confidence >= 0.05
      and measured.lift > 1
  ), ranked as (
    select
      qualifying.*,
      row_number() over (
        partition by qualifying.source_product_id
        order by
          qualifying.pair_company_count desc,
          qualifying.confidence desc,
          qualifying.lift desc,
          qualifying.pair_order_count desc,
          qualifying.latest_pair_at desc,
          candidate.sku,
          qualifying.candidate_product_id
      )::integer as association_rank
    from qualifying
    join public.catalog_products candidate
      on candidate.id = qualifying.candidate_product_id
  ), refreshed as (
    insert into public.partner_product_cobuy_associations (
      source_product_id,
      candidate_product_id,
      pair_order_count,
      source_order_count,
      candidate_order_count,
      pair_company_count,
      total_order_count,
      confidence,
      lift,
      latest_pair_at,
      association_rank,
      window_start,
      window_end,
      refresh_id,
      refreshed_at
    )
    select
      ranked.source_product_id,
      ranked.candidate_product_id,
      ranked.pair_order_count,
      ranked.source_order_count,
      ranked.candidate_order_count,
      ranked.pair_company_count,
      ranked.total_order_count,
      ranked.confidence,
      ranked.lift,
      ranked.latest_pair_at,
      ranked.association_rank,
      governed_window_start,
      governed_window_end,
      target_refresh_id,
      refresh_started_at
    from ranked
    on conflict (source_product_id, candidate_product_id) do update
    set pair_order_count = excluded.pair_order_count,
      source_order_count = excluded.source_order_count,
      candidate_order_count = excluded.candidate_order_count,
      pair_company_count = excluded.pair_company_count,
      total_order_count = excluded.total_order_count,
      confidence = excluded.confidence,
      lift = excluded.lift,
      latest_pair_at = excluded.latest_pair_at,
      association_rank = excluded.association_rank,
      window_start = excluded.window_start,
      window_end = excluded.window_end,
      refresh_id = excluded.refresh_id,
      refreshed_at = excluded.refreshed_at
    returning source_product_id
  )
  select
    order_total.total_order_count,
    count(distinct refreshed.source_product_id)::integer,
    count(refreshed.source_product_id)::integer,
    order_total.source_history_from,
    order_total.source_history_through
  into
    eligible_orders,
    eligible_sources,
    associations,
    history_from,
    history_through
  from order_totals order_total
  left join refreshed on true
  group by
    order_total.total_order_count,
    order_total.source_history_from,
    order_total.source_history_through;

  delete from public.partner_product_cobuy_associations association
  where association.refresh_id <> target_refresh_id;

  refresh_completed_at := clock_timestamp();

  insert into public.partner_product_cobuy_state (
    singleton_key,
    refresh_id,
    refreshed_at,
    business_date,
    window_start,
    window_end,
    total_order_count,
    eligible_source_product_count,
    association_count,
    source_history_from,
    source_history_through,
    minimum_pair_order_count,
    minimum_pair_company_count,
    minimum_confidence,
    minimum_lift,
    duration_ms
  ) values (
    1,
    target_refresh_id,
    refresh_completed_at,
    governed_business_date,
    governed_window_start,
    governed_window_end,
    eligible_orders,
    eligible_sources,
    associations,
    history_from,
    history_through,
    3,
    3,
    0.05,
    1,
    greatest(
      0,
      round(extract(epoch from (refresh_completed_at - refresh_started_at)) * 1000)::integer
    )
  )
  on conflict (singleton_key) do update
  set refresh_id = excluded.refresh_id,
    refreshed_at = excluded.refreshed_at,
    business_date = excluded.business_date,
    window_start = excluded.window_start,
    window_end = excluded.window_end,
    total_order_count = excluded.total_order_count,
    eligible_source_product_count = excluded.eligible_source_product_count,
    association_count = excluded.association_count,
    source_history_from = excluded.source_history_from,
    source_history_through = excluded.source_history_through,
    minimum_pair_order_count = excluded.minimum_pair_order_count,
    minimum_pair_company_count = excluded.minimum_pair_company_count,
    minimum_confidence = excluded.minimum_confidence,
    minimum_lift = excluded.minimum_lift,
    duration_ms = excluded.duration_ms;

  return jsonb_build_object(
    'refreshId', target_refresh_id,
    'refreshedAt', refresh_completed_at,
    'businessDate', governed_business_date,
    'windowStart', governed_window_start,
    'windowEnd', governed_window_end,
    'totalOrderCount', eligible_orders,
    'eligibleSourceProductCount', eligible_sources,
    'associationCount', associations,
    'sourceHistoryFrom', history_from,
    'sourceHistoryThrough', history_through,
    'minimumPairOrderCount', 3,
    'minimumPairCompanyCount', 3,
    'minimumConfidence', 0.05,
    'minimumLift', 1,
    'durationMs', greatest(
      0,
      round(extract(epoch from (refresh_completed_at - refresh_started_at)) * 1000)::integer
    )
  );
end;
$$;

create or replace function public.get_partner_product_cobuy_candidates(
  p_source_product_id uuid,
  p_limit integer default 5
)
returns table(candidate_product_id uuid)
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
begin
  if auth.uid() is null
    or not exists (
      select 1
      from public.company_memberships membership
      where membership.user_id = auth.uid()
        and membership.status = 'active'
        and public.has_permission(membership.company_id, 'catalog.view')
    ) then
    raise exception 'Product co-buy access denied.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.catalog_products source
    where source.id = p_source_product_id
      and source.is_active
      and source.is_visible
  ) then
    return;
  end if;

  return query
  select association.candidate_product_id
  from public.partner_product_cobuy_associations association
  join public.catalog_products candidate
    on candidate.id = association.candidate_product_id
   and candidate.is_active
   and candidate.is_visible
  where association.source_product_id = p_source_product_id
    and association.candidate_product_id <> p_source_product_id
  order by association.association_rank, association.candidate_product_id
  limit least(greatest(coalesce(p_limit, 5), 1), 5);
end;
$$;

revoke all on function public.refresh_partner_product_cobuy_associations()
  from public, anon, authenticated;
grant execute on function public.refresh_partner_product_cobuy_associations()
  to service_role;

revoke all on function public.get_partner_product_cobuy_candidates(uuid, integer)
  from public, anon, service_role;
grant execute on function public.get_partner_product_cobuy_candidates(uuid, integer)
  to authenticated;

comment on table public.partner_product_cobuy_associations is
  'Private rolling-365 anonymous B2B order-level co-purchase projection. Metrics are server-only and never partner-visible.';
comment on table public.partner_product_cobuy_state is
  'Singleton refresh evidence and calibrated thresholds for the private co-purchase projection.';
comment on function public.refresh_partner_product_cobuy_associations() is
  'Rebuilds the full qualifying directional co-purchase set from completed, posted, visible, non-deleted authoritative 1C order history.';
comment on function public.get_partner_product_cobuy_candidates(uuid, integer) is
  'Returns at most five current visible candidate product IDs to an authenticated partner with catalog.view; association metrics remain private.';

select public.refresh_partner_product_cobuy_associations();

commit;
