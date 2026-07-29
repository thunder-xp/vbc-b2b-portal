begin;

create or replace function public.publish_retail_price_history_backfill(
  p_sync_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_run public.retail_price_history_backfill_runs%rowtype;
  verification_status text;
  inserted_count integer := 0;
  result jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'RETAIL_HISTORY_PERMISSION_DENIED' using errcode = '42501';
  end if;

  select * into target_run
  from public.retail_price_history_backfill_runs
  where sync_id = p_sync_id
  for update;

  if target_run.sync_id is null then
    return jsonb_build_object('status', 'skipped', 'syncId', p_sync_id);
  end if;
  if target_run.status = 'succeeded' then
    return jsonb_build_object(
      'status', 'succeeded',
      'syncId', p_sync_id,
      'insertedChangePoints', target_run.inserted_change_points,
      'idempotent', true
    );
  end if;

  select status into verification_status
  from public.retail_price_history_verification
  where id = 'UU-000020';
  if verification_status <> 'verified' then
    raise exception 'RETAIL_HISTORY_CURRENCY_UNVERIFIED' using errcode = '55000';
  end if;

  update public.retail_price_history_backfill_runs
  set status = 'running', started_at = coalesce(started_at, now()), updated_at = now()
  where sync_id = p_sync_id;

  with ranked as (
    select stage.*,
      row_number() over (
        partition by stage.external_product_ref, stage.effective_at
        order by stage.is_current desc, stage.source_ordinal desc,
          stage.source_fingerprint asc
      ) as same_period_rank
    from public.retail_price_history_source_stage stage
    where stage.sync_id = p_sync_id
      and stage.external_price_type_ref = 'e181c772-93fc-11e9-94cb-000c2988d323'
      and stage.external_characteristic_ref = '00000000-0000-0000-0000-000000000000'
      and stage.is_current
      and stage.price_amount >= 0
  ),
  mapped as (
    select ranked.*, product.id as product_id, price_type.id as price_type_id
    from ranked
    join public.catalog_products product
      on product.external_1c_id = ranked.external_product_ref
      and product.is_active
    join public.price_types price_type
      on price_type.external_ref = ranked.external_price_type_ref
      and price_type.external_code = 'UU-000020'
      and price_type.currency_code = 'MDL'
      and price_type.currency_status = 'resolved'
      and price_type.is_active
    where ranked.same_period_rank = 1
  ),
  with_previous as (
    select mapped.*,
      lag(price_amount) over (
        partition by product_id
        order by effective_at, source_ordinal, source_fingerprint
      ) as previous_amount
    from mapped
  ),
  changes as (
    select * from with_previous
    where previous_amount is distinct from price_amount
  )
  insert into public.product_price_history(
    product_id, price_type_id, external_price_type_code,
    external_product_ref, external_characteristic_ref,
    price_amount, currency, effective_at, observed_at,
    source, source_fingerprint, sync_run_id
  )
  select
    product_id, price_type_id, 'UU-000020',
    external_product_ref, external_characteristic_ref,
    price_amount, 'MDL', effective_at, now(),
    'one_c_history',
    md5(concat_ws('|', 'one_c_history', product_id::text, price_type_id::text,
      effective_at::text, price_amount::text, 'MDL')),
    p_sync_id
  from changes
  on conflict (source_fingerprint) do nothing;
  get diagnostics inserted_count = row_count;

  with ranked as (
    select stage.*,
      row_number() over (
        partition by stage.external_product_ref, stage.effective_at
        order by stage.is_current desc, stage.source_ordinal desc,
          stage.source_fingerprint asc
      ) as same_period_rank
    from public.retail_price_history_source_stage stage
    where stage.sync_id = p_sync_id
      and stage.external_price_type_ref = 'e181c772-93fc-11e9-94cb-000c2988d323'
      and stage.external_characteristic_ref = '00000000-0000-0000-0000-000000000000'
      and stage.is_current
      and stage.price_amount >= 0
  ),
  mapped as (
    select ranked.*, product.id as product_id
    from ranked
    join public.catalog_products product
      on product.external_1c_id = ranked.external_product_ref
      and product.is_active
    where ranked.same_period_rank = 1
  ),
  with_previous as (
    select mapped.*,
      lag(price_amount) over (
        partition by product_id
        order by effective_at, source_ordinal, source_fingerprint
      ) as previous_amount
    from mapped
  ),
  changes as (
    select * from with_previous
    where previous_amount is distinct from price_amount
  ),
  latest_source as (
    select distinct on (product_id) product_id, price_amount
    from mapped
    order by product_id, effective_at desc, source_ordinal desc
  ),
  continuity as (
    select source.product_id,
      current.price_amount = source.price_amount as matches
    from latest_source source
    join public.product_prices current
      on current.product_id = source.product_id
      and current.company_id is null
      and current.external_1c_price_type_id = 'e181c772-93fc-11e9-94cb-000c29cf9dd4'
      and current.currency = 'MDL'
      and current.currency_status = 'resolved'
      and current.is_active and current.is_published
  ),
  metrics as (
    select
      (select count(*) from ranked)::integer as metric_source_rows,
      (select count(distinct product_id) from mapped)::integer as metric_mapped_products,
      (
        select count(distinct source.external_product_ref)
        from ranked source
        left join public.catalog_products product
          on product.external_1c_id = source.external_product_ref and product.is_active
        where product.id is null
      )::integer as metric_unresolved_products,
      (select count(*) from changes)::integer as metric_change_points,
      (select count(*) from continuity where matches)::integer as metric_matches,
      (select count(*) from continuity where not matches)::integer as metric_mismatches,
      (select min(effective_at) from mapped) as metric_earliest,
      (select max(effective_at) from mapped) as metric_latest
  )
  update public.retail_price_history_backfill_runs run
  set source_rows = metrics.metric_source_rows,
      mapped_products = metrics.metric_mapped_products,
      unresolved_products = metrics.metric_unresolved_products,
      malformed_rows = 0,
      reduced_change_points = metrics.metric_change_points,
      inserted_change_points = inserted_count,
      continuity_matches = metrics.metric_matches,
      continuity_mismatches = metrics.metric_mismatches,
      earliest_effective_at = metrics.metric_earliest,
      latest_effective_at = metrics.metric_latest,
      updated_at = now()
  from metrics
  where run.sync_id = p_sync_id;

  with ranked as (
    select stage.*,
      row_number() over (
        partition by stage.external_product_ref, stage.effective_at
        order by stage.is_current desc, stage.source_ordinal desc,
          stage.source_fingerprint asc
      ) as same_period_rank
    from public.retail_price_history_source_stage stage
    where stage.sync_id = p_sync_id
      and stage.external_price_type_ref = 'e181c772-93fc-11e9-94cb-000c2988d323'
      and stage.external_characteristic_ref = '00000000-0000-0000-0000-000000000000'
      and stage.is_current
      and stage.price_amount >= 0
  ),
  mapped as (
    select ranked.*, product.id as product_id
    from ranked
    join public.catalog_products product
      on product.external_1c_id = ranked.external_product_ref
      and product.is_active
    where ranked.same_period_rank = 1
  ),
  latest_source as (
    select distinct on (product_id) product_id, price_amount
    from mapped
    order by product_id, effective_at desc, source_ordinal desc
  )
  insert into public.retail_price_history_incidents(sync_id, product_id, incident_code)
  select p_sync_id, source.product_id, 'RETAIL_HISTORY_CURRENT_MISMATCH'
  from latest_source source
  join public.product_prices current
    on current.product_id = source.product_id
    and current.company_id is null
    and current.external_1c_price_type_id = 'e181c772-93fc-11e9-94cb-000c29cf9dd4'
    and current.is_active and current.is_published
  where current.price_amount <> source.price_amount
  on conflict (sync_id, product_id, incident_code) do nothing;

  update public.retail_price_history_backfill_runs
  set status = 'succeeded',
      finished_at = now(),
      duration_ms = greatest(
        0,
        floor(extract(epoch from (now() - coalesce(started_at, now()))) * 1000)
      )::bigint,
      error_code = null,
      safe_error = null,
      updated_at = now()
  where sync_id = p_sync_id
  returning jsonb_build_object(
    'status', status,
    'syncId', sync_id,
    'sourceRows', source_rows,
    'mappedProducts', mapped_products,
    'unresolvedProducts', unresolved_products,
    'malformedRows', malformed_rows,
    'reducedChangePoints', reduced_change_points,
    'insertedChangePoints', inserted_change_points,
    'continuityMatches', continuity_matches,
    'continuityMismatches', continuity_mismatches,
    'earliestEffectiveAt', earliest_effective_at,
    'latestEffectiveAt', latest_effective_at,
    'durationMs', duration_ms,
    'idempotent', false
  ) into result;

  return result;
exception
  when others then
    update public.retail_price_history_backfill_runs
    set status = 'failed', finished_at = now(), error_code = sqlstate,
        safe_error = case
          when sqlerrm like 'RETAIL_HISTORY_%' then sqlerrm
          else 'RETAIL_HISTORY_PUBLICATION_FAILED'
        end,
        updated_at = now()
    where sync_id = p_sync_id;
    raise;
end;
$$;

revoke all on function public.publish_retail_price_history_backfill(uuid)
  from public, anon, authenticated;
grant execute on function public.publish_retail_price_history_backfill(uuid)
  to service_role;

commit;
