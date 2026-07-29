begin;

alter table public.retail_price_history_source_stage
  add column if not exists source_ordinal bigint not null default 0;

create table if not exists public.retail_price_history_backfill_runs (
  sync_id uuid primary key,
  status text not null check (status in ('requested', 'running', 'succeeded', 'failed')),
  requested_by uuid not null references public.user_profiles(id),
  reason text not null check (char_length(reason) between 20 and 1000),
  source_rows integer not null default 0,
  mapped_products integer not null default 0,
  unresolved_products integer not null default 0,
  malformed_rows integer not null default 0,
  reduced_change_points integer not null default 0,
  inserted_change_points integer not null default 0,
  continuity_matches integer not null default 0,
  continuity_mismatches integer not null default 0,
  earliest_effective_at timestamptz,
  latest_effective_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms bigint,
  error_code text,
  safe_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists retail_history_one_active_backfill_idx
  on public.retail_price_history_backfill_runs ((true))
  where status in ('requested', 'running');

alter table public.retail_price_history_backfill_runs enable row level security;
revoke all on public.retail_price_history_backfill_runs from public, anon, authenticated;
grant select on public.retail_price_history_backfill_runs to authenticated;
grant select, insert, update on public.retail_price_history_backfill_runs to service_role;

drop policy if exists "Internal price administrators read retail history backfills"
  on public.retail_price_history_backfill_runs;
create policy "Internal price administrators read retail history backfills"
on public.retail_price_history_backfill_runs for select to authenticated
using (public.has_internal_permission('admin.prices.view'));

create table if not exists public.retail_price_history_incidents (
  id uuid primary key default gen_random_uuid(),
  sync_id uuid not null references public.retail_price_history_backfill_runs(sync_id),
  product_id uuid not null references public.catalog_products(id),
  incident_code text not null check (incident_code = 'RETAIL_HISTORY_CURRENT_MISMATCH'),
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  unique (sync_id, product_id, incident_code)
);

alter table public.retail_price_history_incidents enable row level security;
revoke all on public.retail_price_history_incidents from public, anon, authenticated;
grant select on public.retail_price_history_incidents to authenticated;
grant select, insert on public.retail_price_history_incidents to service_role;

drop policy if exists "Internal price administrators read retail history incidents"
  on public.retail_price_history_incidents;
create policy "Internal price administrators read retail history incidents"
on public.retail_price_history_incidents for select to authenticated
using (public.has_internal_permission('admin.prices.view'));

create or replace function public.verify_retail_price_history_currency(
  p_evidence_type text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  current_state public.retail_price_history_verification%rowtype;
  evidence text := nullif(btrim(p_evidence_type), '');
  reason text := nullif(btrim(p_reason), '');
begin
  if not public.has_internal_permission('admin.integrations.manage') then
    raise exception 'RETAIL_HISTORY_PERMISSION_DENIED' using errcode = '42501';
  end if;
  if evidence not in ('one_c_metadata', 'documented_business_confirmation', 'period_currency_relation')
    or reason is null or char_length(reason) < 20 or char_length(reason) > 1000 then
    raise exception 'RETAIL_HISTORY_READ_CONTRACT_MISMATCH' using errcode = '22023';
  end if;

  select * into current_state
  from public.retail_price_history_verification
  where id = 'UU-000020'
  for update;

  if current_state.id is null or current_state.current_currency <> 'MDL' then
    raise exception 'RETAIL_HISTORY_TYPE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if current_state.status = 'verified'
    and current_state.evidence_type = evidence
    and current_state.evidence_reason = reason then
    return jsonb_build_object(
      'status', current_state.status,
      'verifiedAt', current_state.verified_at,
      'idempotent', true
    );
  end if;

  update public.retail_price_history_verification
  set status = 'verified', verified_by = actor, evidence_type = evidence,
      evidence_reason = reason, verified_at = now(), updated_at = now()
  where id = 'UU-000020';

  insert into public.retail_price_history_verification_audit(
    verifier_id, previous_status, resulting_status, evidence_type, reason
  ) values (actor, current_state.status, 'verified', evidence, reason);

  return jsonb_build_object('status', 'verified', 'verifiedAt', now(), 'idempotent', false);
end;
$$;

create or replace function public.request_retail_price_history_backfill(
  p_sync_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  normalized_reason text := nullif(btrim(p_reason), '');
  verification_status text;
  sync_state public.price_sync_state%rowtype;
  existing public.retail_price_history_backfill_runs%rowtype;
begin
  if not public.has_internal_permission('admin.integrations.manage') then
    raise exception 'RETAIL_HISTORY_PERMISSION_DENIED' using errcode = '42501';
  end if;
  if normalized_reason is null or char_length(normalized_reason) < 20
    or char_length(normalized_reason) > 1000 then
    raise exception 'A detailed backfill reason is required' using errcode = '22023';
  end if;

  select status into verification_status
  from public.retail_price_history_verification
  where id = 'UU-000020';
  if verification_status <> 'verified' then
    raise exception 'RETAIL_HISTORY_CURRENCY_UNVERIFIED' using errcode = '55000';
  end if;

  select * into sync_state
  from public.price_sync_state
  where id = 'product_prices'
  for update;
  if sync_state.active_sync_id is distinct from p_sync_id
    or sync_state.status not in ('queued', 'running') then
    raise exception 'RETAIL_HISTORY_READ_CONTRACT_MISMATCH' using errcode = '55000';
  end if;

  select * into existing
  from public.retail_price_history_backfill_runs
  where sync_id = p_sync_id;
  if existing.sync_id is not null then
    return jsonb_build_object('syncId', existing.sync_id, 'status', existing.status, 'idempotent', true);
  end if;

  if exists (
    select 1 from public.retail_price_history_backfill_runs
    where status in ('requested', 'running')
  ) then
    raise exception 'RETAIL_HISTORY_BACKFILL_LOCKED' using errcode = '55P03';
  end if;

  insert into public.retail_price_history_backfill_runs(
    sync_id, status, requested_by, reason
  ) values (p_sync_id, 'requested', actor, normalized_reason);

  return jsonb_build_object('syncId', p_sync_id, 'status', 'requested', 'idempotent', false);
end;
$$;

revoke all on function public.request_retail_price_history_backfill(uuid, text)
  from public, anon;
grant execute on function public.request_retail_price_history_backfill(uuid, text)
  to authenticated;

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
  source_count integer := 0;
  mapped_count integer := 0;
  unresolved_count integer := 0;
  reduced_count integer := 0;
  match_count integer := 0;
  mismatch_count integer := 0;
  earliest timestamptz;
  latest timestamptz;
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
        order by stage.is_current desc, stage.source_ordinal desc, stage.source_fingerprint asc
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
        partition by product_id order by effective_at, source_ordinal, source_fingerprint
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
        order by stage.is_current desc, stage.source_ordinal desc, stage.source_fingerprint asc
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
        partition by product_id order by effective_at, source_ordinal, source_fingerprint
      ) as previous_amount
    from mapped
  ),
  changes as (
    select * from with_previous where previous_amount is distinct from price_amount
  ),
  latest_source as (
    select distinct on (product_id) product_id, price_amount
    from mapped order by product_id, effective_at desc, source_ordinal desc
  ),
  continuity as (
    select source.product_id,
      current.price_amount = source.price_amount as matches
    from latest_source source
    join public.product_prices current
      on current.product_id = source.product_id
      and current.company_id is null
      and current.external_1c_price_type_id = 'e181c772-93fc-11e9-94cb-000c2988d323'
      and current.currency = 'MDL'
      and current.currency_status = 'resolved'
      and current.is_active and current.is_published
  ),
  metrics as (
    select
      (select count(*) from ranked)::integer as source_count,
      (select count(distinct product_id) from mapped)::integer as mapped_count,
      (
        select count(distinct source.external_product_ref)
        from ranked source
        left join public.catalog_products product
          on product.external_1c_id = source.external_product_ref and product.is_active
        where product.id is null
      )::integer as unresolved_count,
      (select count(*) from changes)::integer as reduced_count,
      (select count(*) from continuity where matches)::integer as match_count,
      (select count(*) from continuity where not matches)::integer as mismatch_count,
      (select min(effective_at) from mapped) as earliest,
      (select max(effective_at) from mapped) as latest
  )
  select source_count, mapped_count, unresolved_count, reduced_count,
    match_count, mismatch_count, earliest, latest
  into source_count, mapped_count, unresolved_count, reduced_count,
    match_count, mismatch_count, earliest, latest
  from metrics;

  insert into public.retail_price_history_incidents(sync_id, product_id, incident_code)
  select p_sync_id, source.product_id, 'RETAIL_HISTORY_CURRENT_MISMATCH'
  from (
    select distinct on (history.product_id) history.product_id, history.price_amount
    from public.product_price_history history
    where history.sync_run_id = p_sync_id and history.source = 'one_c_history'
    order by history.product_id, history.effective_at desc
  ) source
  join public.product_prices current
    on current.product_id = source.product_id
    and current.company_id is null
    and current.external_1c_price_type_id = 'e181c772-93fc-11e9-94cb-000c2988d323'
    and current.is_active and current.is_published
  where current.price_amount <> source.price_amount
  on conflict (sync_id, product_id, incident_code) do nothing;

  update public.retail_price_history_backfill_runs
  set status = 'succeeded',
      source_rows = source_count,
      mapped_products = mapped_count,
      unresolved_products = unresolved_count,
      malformed_rows = 0,
      reduced_change_points = reduced_count,
      inserted_change_points = inserted_count,
      continuity_matches = match_count,
      continuity_mismatches = mismatch_count,
      earliest_effective_at = earliest,
      latest_effective_at = latest,
      finished_at = now(),
      duration_ms = greatest(0, floor(extract(epoch from (now() - coalesce(started_at, now()))) * 1000))::bigint,
      updated_at = now()
  where sync_id = p_sync_id;

  return jsonb_build_object(
    'status', 'succeeded',
    'syncId', p_sync_id,
    'sourceRows', source_count,
    'mappedProducts', mapped_count,
    'unresolvedProducts', unresolved_count,
    'malformedRows', 0,
    'reducedChangePoints', reduced_count,
    'insertedChangePoints', inserted_count,
    'continuityMatches', match_count,
    'continuityMismatches', mismatch_count,
    'earliestEffectiveAt', earliest,
    'latestEffectiveAt', latest,
    'idempotent', false
  );
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

create or replace function public.get_retail_price_history(
  p_product_id uuid,
  p_range text default '12m'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  start_at timestamptz;
  current_price public.product_prices%rowtype;
  verification_status text;
  points jsonb;
  point_count integer := 0;
  first_at timestamptz;
  last_at timestamptz;
  minimum numeric;
  maximum numeric;
  previous numeric;
  was_truncated boolean := false;
  has_verified_history boolean := false;
begin
  if p_range not in ('3m', '6m', '12m', 'all') then
    raise exception 'RETAIL_HISTORY_READ_CONTRACT_MISMATCH' using errcode = '22023';
  end if;
  if not public.can_select_product_commercial_data(
    p_product_id, null, 'pricing.retail_price.view'
  ) then
    raise exception 'RETAIL_HISTORY_PRODUCT_NOT_VISIBLE' using errcode = '42501';
  end if;

  start_at := case p_range
    when '3m' then now() - interval '3 months'
    when '6m' then now() - interval '6 months'
    when '12m' then now() - interval '12 months'
    else null
  end;

  select * into current_price
  from public.product_prices
  where product_id = p_product_id
    and company_id is null
    and external_1c_price_type_id = 'e181c772-93fc-11e9-94cb-000c2988d323'
    and is_active and is_published
    and currency_status = 'resolved' and currency = 'MDL'
  order by effective_at desc, updated_at desc
  limit 1;

  select status into verification_status
  from public.retail_price_history_verification
  where id = 'UU-000020';

  with raw as (
    select history.*,
      row_number() over (
        partition by history.effective_at, history.price_amount, history.currency
        order by case history.source
          when 'one_c_history' then 1
          when 'price_sync_snapshot' then 2
          when 'initial_baseline' then 3
          else 4
        end, history.observed_at desc, history.id
      ) as equivalent_rank
    from public.product_price_history history
    where history.product_id = p_product_id
      and history.external_price_type_code = 'UU-000020'
      and history.currency = 'MDL'
      and (start_at is null or history.effective_at >= start_at)
      and (history.source <> 'one_c_history' or verification_status = 'verified')
  ),
  equivalent_deduplicated as (
    select * from raw where equivalent_rank = 1
  ),
  with_previous as (
    select equivalent_deduplicated.*,
      lag(price_amount) over (
        order by effective_at, observed_at, id
      ) as previous_price
    from equivalent_deduplicated
  ),
  meaningful as (
    select * from with_previous
    where previous_price is distinct from price_amount
  ),
  latest as (
    select * from meaningful
    order by effective_at desc, observed_at desc, id desc
    limit 501
  ),
  bounded as (
    select * from latest
    order by effective_at desc, observed_at desc, id desc
    limit 500
  ),
  stats as (
    select count(*)::integer as count, min(effective_at) as first_at,
      max(effective_at) as last_at, min(price_amount) as minimum,
      max(price_amount) as maximum,
      (select count(*) from latest)::integer as candidate_count
    from bounded
  ),
  prior as (
    select price_amount from bounded
    order by effective_at desc, observed_at desc, id desc
    offset 1 limit 1
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'amount', bounded.price_amount,
      'currency', bounded.currency,
      'effectiveAt', bounded.effective_at,
      'source', bounded.source
    ) order by bounded.effective_at, bounded.observed_at, bounded.id), '[]'::jsonb),
    stats.count, stats.first_at, stats.last_at, stats.minimum, stats.maximum,
    (select price_amount from prior),
    stats.candidate_count > 500,
    coalesce(bool_or(bounded.source = 'one_c_history'), false)
  into points, point_count, first_at, last_at, minimum, maximum,
    previous, was_truncated, has_verified_history
  from stats
  left join bounded on true
  group by stats.count, stats.first_at, stats.last_at, stats.minimum,
    stats.maximum, stats.candidate_count;

  return jsonb_build_object(
    'current', case when current_price.id is null then null else jsonb_build_object(
      'amount', current_price.price_amount,
      'currency', current_price.currency,
      'effectiveAt', coalesce(current_price.effective_at, current_price.valid_from)
    ) end,
    'points', coalesce(points, '[]'::jsonb),
    'firstAt', first_at,
    'lastAt', last_at,
    'previousAmount', previous,
    'minimumAmount', minimum,
    'maximumAmount', maximum,
    'mode', case
      when current_price.id is null then 'unavailable'
      when has_verified_history then 'historical_verified'
      when point_count <= 1 then 'baseline_only'
      else 'accumulated'
    end,
    'range', p_range,
    'truncated', was_truncated
  );
end;
$$;

revoke all on function public.get_retail_price_history(uuid, text)
  from public, anon;
grant execute on function public.get_retail_price_history(uuid, text)
  to authenticated;

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
        select count(*) from public.product_prices
        where external_1c_price_type_id = 'e181c772-93fc-11e9-94cb-000c29cf9dd4'
          and is_active and is_published
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
      'lastHistoryUpdate', (select max(observed_at) from public.product_price_history),
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
