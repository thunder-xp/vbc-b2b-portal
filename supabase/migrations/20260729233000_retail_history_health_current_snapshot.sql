begin;

update public.retail_price_history_backfill_runs
set duration_ms = greatest(
  0,
  floor(extract(epoch from (finished_at - created_at)) * 1000)
)::bigint
where status = 'succeeded'
  and finished_at is not null
  and coalesce(duration_ms, 0) = 0;

create or replace function public.get_retail_price_history_health()
returns jsonb
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select case
    when not public.has_internal_permission('admin.prices.view') then null
    else jsonb_build_object(
      'productsWithCurrentRetail', (
        select count(distinct product_id)
        from public.product_price_history
        where source in ('initial_baseline', 'price_sync_snapshot')
          and external_price_type_code = 'UU-000020'
          and currency = 'MDL'
      ),
      'productsWithHistory', (
        select count(distinct product_id) from public.product_price_history
      ),
      'productsWithBaselineOnly', (
        select count(*) from (
          select product_id from public.product_price_history
          group by product_id
          having bool_and(source = 'initial_baseline')
        ) baseline
      ),
      'lastHistoryUpdate', (
        select max(observed_at) from public.product_price_history
      ),
      'failedHistoryAppendCount', (
        select count(*) from public.price_sync_state
        where id = 'product_prices' and status = 'failed'
          and failed_stage = 'price_publication'
      ),
      'currencyDistribution', (
        select coalesce(jsonb_object_agg(currency, count), '{}'::jsonb)
        from (
          select currency, count(*) from public.product_price_history
          group by currency
        ) currencies
      ),
      'verification', (
        select to_jsonb(verification) - 'evidence_reason'
        from public.retail_price_history_verification verification
        where id = 'UU-000020'
      ),
      'latestBackfill', (
        select to_jsonb(run) - 'reason' - 'requested_by'
        from public.retail_price_history_backfill_runs run
        order by created_at desc limit 1
      ),
      'openIncidentCount', (
        select count(*) from public.retail_price_history_incidents where status = 'open'
      )
    )
  end;
$$;

revoke all on function public.get_retail_price_history_health()
  from public, anon;
grant execute on function public.get_retail_price_history_health()
  to authenticated;

commit;
