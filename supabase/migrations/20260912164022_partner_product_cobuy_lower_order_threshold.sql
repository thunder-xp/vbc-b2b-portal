begin;

alter table public.partner_product_cobuy_associations
  drop constraint partner_product_cobuy_counts_check;

alter table public.partner_product_cobuy_state
  drop constraint partner_product_cobuy_state_counts_check;

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
  eligible_orders bigint := 0;
  eligible_sources integer := 0;
  associations integer := 0;
  history_from timestamptz;
  history_through timestamptz;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('partner-product-cobuy-refresh', 0)
  );

  with governed_order_products as materialized (
    select distinct
      history.id as authoritative_order_id,
      history.source_counterparty_1c_id as source_counterparty_1c_id,
      history.one_c_document_date,
      item.product_id
    from public.partner_order_history history
    join public.partner_order_history_items item
      on item.order_history_id = history.id
     and item.product_id is not null
     and item.quantity > 0
    where history.global_analytics_eligible
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
      count(distinct source.source_counterparty_1c_id)::integer
        as pair_company_count,
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
      and measured.confidence >= 0.10
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
    total_order_count,
    eligible_source_product_count,
    association_count,
    source_history_from,
    source_history_through,
    minimum_pair_order_count,
    minimum_pair_company_count,
    minimum_confidence,
    minimum_lift,
    duration_ms,
    history_mode
  ) values (
    1,
    target_refresh_id,
    refresh_completed_at,
    governed_business_date,
    eligible_orders,
    eligible_sources,
    associations,
    history_from,
    history_through,
    3,
    3,
    0.10,
    1,
    greatest(
      0,
      round(extract(epoch from (refresh_completed_at - refresh_started_at)) * 1000)::integer
    ),
    'all_time_authoritative_history'
  )
  on conflict (singleton_key) do update
  set refresh_id = excluded.refresh_id,
    refreshed_at = excluded.refreshed_at,
    business_date = excluded.business_date,
    total_order_count = excluded.total_order_count,
    eligible_source_product_count = excluded.eligible_source_product_count,
    association_count = excluded.association_count,
    source_history_from = excluded.source_history_from,
    source_history_through = excluded.source_history_through,
    minimum_pair_order_count = excluded.minimum_pair_order_count,
    minimum_pair_company_count = excluded.minimum_pair_company_count,
    minimum_confidence = excluded.minimum_confidence,
    minimum_lift = excluded.minimum_lift,
    duration_ms = excluded.duration_ms,
    history_mode = excluded.history_mode;

  return jsonb_build_object(
    'refreshId', target_refresh_id,
    'refreshedAt', refresh_completed_at,
    'businessDate', governed_business_date,
    'historyMode', 'all_time_authoritative_history',
    'totalOrderCount', eligible_orders,
    'eligibleSourceProductCount', eligible_sources,
    'associationCount', associations,
    'sourceHistoryFrom', history_from,
    'sourceHistoryThrough', history_through,
    'minimumPairOrderCount', 3,
    'minimumPairCompanyCount', 3,
    'minimumConfidence', 0.10,
    'minimumLift', 1,
    'durationMs', greatest(
      0,
      round(extract(epoch from (refresh_completed_at - refresh_started_at)) * 1000)::integer
    )
  );
end;
$$;

select public.refresh_partner_product_cobuy_associations();

alter table public.partner_product_cobuy_associations
  add constraint partner_product_cobuy_counts_check check (
    pair_order_count >= 3
    and source_order_count >= pair_order_count
    and candidate_order_count >= pair_order_count
    and pair_company_count >= 3
    and total_order_count >= source_order_count
    and total_order_count >= candidate_order_count
  );

alter table public.partner_product_cobuy_state
  add constraint partner_product_cobuy_state_counts_check check (
    total_order_count >= 0
    and eligible_source_product_count >= 0
    and association_count >= 0
    and minimum_pair_order_count >= 3
    and minimum_pair_company_count >= 3
    and minimum_confidence >= 0.10
    and minimum_lift >= 1
    and duration_ms >= 0
  );

alter table public.partner_product_cobuy_associations enable row level security;
alter table public.partner_product_cobuy_associations force row level security;
alter table public.partner_product_cobuy_state enable row level security;
alter table public.partner_product_cobuy_state force row level security;

revoke all on table public.partner_product_cobuy_associations
  from public, anon, authenticated;
revoke all on table public.partner_product_cobuy_state
  from public, anon, authenticated;

revoke all on function public.refresh_partner_product_cobuy_associations()
  from public, anon, authenticated;
grant execute on function public.refresh_partner_product_cobuy_associations()
  to service_role;

comment on function public.refresh_partner_product_cobuy_associations() is
  'Rebuilds one canonical all-time directional co-purchase projection from governed global B2B history using source counterparty identity and the calibrated three-order threshold.';

commit;
