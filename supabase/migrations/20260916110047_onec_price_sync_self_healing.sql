begin;

alter table public.price_sync_state
  add column sync_mode text not null default 'full_reconciliation'
    check (sync_mode in ('incremental', 'full_reconciliation')),
  add column trigger_kind text not null default 'scheduled'
    check (trigger_kind in ('scheduled', 'watchdog', 'manual')),
  add column source_watermark timestamptz,
  add column source_query_from timestamptz,
  add column source_inspected_through timestamptz,
  add column run_latest_source_period timestamptz,
  add column last_scheduler_seen_at timestamptz,
  add column expected_next_run_at timestamptz,
  add column last_source_success_at timestamptz,
  add column last_publication_success_at timestamptz,
  add column next_recovery_attempt_at timestamptz,
  add column recovery_attempt_count integer not null default 0 check (recovery_attempt_count >= 0),
  add column last_failure_retryable boolean not null default false,
  add column publication_generation bigint not null default 0 check (publication_generation >= 0);

update public.price_sync_state state
set source_watermark = coalesce(state.source_watermark, (
      select max(price.effective_at)
      from public.product_prices price
      where price.company_id is null and price.is_published
    )),
    source_inspected_through = coalesce(state.source_inspected_through, state.last_successful_sync_at),
    last_source_success_at = coalesce(state.last_source_success_at, state.last_successful_sync_at),
    last_publication_success_at = coalesce(state.last_publication_success_at, state.last_successful_sync_at)
where state.id = 'product_prices';

alter table private.price_sync_type_page_metrics
  add column latest_source_period timestamptz;

create table public.price_sync_domain_freshness (
  scope text primary key check (scope in (
    'PARTNER_CONTRACT_PRICE', 'FINAL_CUSTOMER_RETAIL_PRICE',
    'INTERNAL/OTHER', 'MSRP', 'RETAIL'
  )),
  publication_required boolean not null,
  last_source_success_at timestamptz,
  latest_source_period_seen timestamptz,
  last_publication_success_at timestamptz,
  latest_published_period timestamptz,
  source_row_count integer not null default 0 check (source_row_count >= 0),
  publication_generation bigint not null default 0 check (publication_generation >= 0),
  publication_run_id uuid,
  freshness_state text not null default 'STALE'
    check (freshness_state in ('FRESH', 'DEGRADED', 'STALE', 'FAILED')),
  last_error_code text,
  updated_at timestamptz not null default now()
);

alter table public.price_sync_domain_freshness enable row level security;
revoke all on table public.price_sync_domain_freshness from public, anon, authenticated;
grant select, insert, update, delete on table public.price_sync_domain_freshness to service_role;

insert into public.price_sync_domain_freshness(scope, publication_required)
values
  ('PARTNER_CONTRACT_PRICE', true),
  ('FINAL_CUSTOMER_RETAIL_PRICE', false),
  ('INTERNAL/OTHER', true),
  ('MSRP', true),
  ('RETAIL', true)
on conflict (scope) do nothing;

create table public.price_sync_run_history (
  run_id uuid primary key,
  caller text not null check (caller in ('scheduled', 'watchdog', 'manual')),
  sync_mode text not null check (sync_mode in ('incremental', 'full_reconciliation')),
  started_at timestamptz not null,
  finished_at timestamptz,
  status text not null check (status in ('queued', 'running', 'succeeded', 'failed')),
  source_calls integer not null default 0 check (source_calls >= 0),
  rows_received integer not null default 0 check (rows_received >= 0),
  rows_prepared integer not null default 0 check (rows_prepared >= 0),
  rows_staged integer not null default 0 check (rows_staged >= 0),
  rows_published integer not null default 0 check (rows_published >= 0),
  latest_1c_period_seen timestamptz,
  latest_published_period timestamptz,
  error_code text,
  retry_count integer not null default 0 check (retry_count >= 0),
  source_query_from timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index price_sync_run_history_started_idx
  on public.price_sync_run_history(started_at desc);
alter table public.price_sync_run_history enable row level security;
revoke all on table public.price_sync_run_history from public, anon, authenticated;
grant select, insert, update, delete on table public.price_sync_run_history to service_role;

alter function public.stage_product_price_rows(uuid, jsonb, integer, jsonb)
  rename to stage_product_price_rows_freshness_base;

revoke all on function public.stage_product_price_rows_freshness_base(uuid, jsonb, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.stage_product_price_rows_freshness_base(uuid, jsonb, integer, jsonb)
  to service_role;

create function public.stage_product_price_rows(
  p_sync_id uuid,
  p_rows jsonb,
  p_page_number integer,
  p_type_metrics jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'PRICE_SYNC_PERMISSION_DENIED' using errcode = '42501';
  end if;

  v_count := public.stage_product_price_rows_freshness_base(
    p_sync_id, p_rows, p_page_number, p_type_metrics
  );

  with source_periods as (
    select lower(row.external_price_type_ref) external_price_type_ref,
      max(row.effective_at) latest_source_period
    from jsonb_to_recordset(p_rows) as row(
      external_product_ref text,
      external_price_type_ref text,
      external_characteristic_ref text,
      amount numeric,
      is_current boolean,
      effective_at timestamptz,
      currency_code text,
      currency_status text
    )
    group by lower(row.external_price_type_ref)
  )
  update private.price_sync_type_page_metrics metrics
  set latest_source_period = source.latest_source_period
  from source_periods source
  where metrics.sync_id = p_sync_id
    and metrics.page_number = p_page_number
    and metrics.external_price_type_ref = source.external_price_type_ref;

  return v_count;
end;
$$;

revoke all on function public.stage_product_price_rows(uuid, jsonb, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.stage_product_price_rows(uuid, jsonb, integer, jsonb)
  to service_role;

create function public.start_price_sync_run(
  p_mode text,
  p_trigger text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state public.price_sync_state%rowtype;
  v_sync_id uuid;
  v_stale boolean;
  v_now timestamptz := now();
  v_query_from timestamptz;
begin
  if auth.role() <> 'service_role' then
    raise exception 'PRICE_SYNC_PERMISSION_DENIED' using errcode = '42501';
  end if;
  if p_mode not in ('incremental', 'full_reconciliation')
    or p_trigger not in ('scheduled', 'watchdog', 'manual') then
    raise exception 'PRICE_SYNC_START_CONTRACT_INVALID' using errcode = '22023';
  end if;

  select * into v_state
  from public.price_sync_state
  where id = 'product_prices'
  for update;

  v_stale := v_state.status in ('queued', 'running')
    and v_state.updated_at < v_now - interval '10 minutes';
  if v_state.status in ('queued', 'running') and not v_stale then
    return jsonb_build_object('result', 'locked', 'syncId', v_state.active_sync_id);
  end if;

  if p_trigger = 'watchdog' and v_state.status = 'failed'
    and not v_state.last_failure_retryable then
    return jsonb_build_object('result', 'manual_required', 'syncId', null);
  end if;
  if p_trigger = 'watchdog' and v_state.next_recovery_attempt_at is not null
    and v_state.next_recovery_attempt_at > v_now then
    return jsonb_build_object('result', 'backoff', 'syncId', null);
  end if;
  if exists (
    select 1 from public.catalog_sync_state
    where id = 'daily_catalog' and status = 'running'
  ) then
    raise exception 'PRICE_SYNC_CATALOG_LOCK_CONFLICT' using errcode = '55P03';
  end if;

  delete from public.product_price_sync_stage
  where sync_id in (v_state.active_sync_id, v_state.last_failed_sync_id);
  delete from public.product_price_type_sync_stage
  where sync_id in (v_state.active_sync_id, v_state.last_failed_sync_id);
  delete from public.product_currency_sync_stage
  where sync_id in (v_state.active_sync_id, v_state.last_failed_sync_id);
  delete from public.retail_price_history_source_stage
  where sync_id in (v_state.active_sync_id, v_state.last_failed_sync_id);

  v_sync_id := extensions.gen_random_uuid();
  v_query_from := case when p_mode = 'incremental'
    then coalesce(v_state.source_watermark, (
      select max(price.effective_at) from public.product_prices price
      where price.company_id is null and price.is_published
    ), v_now) - interval '48 hours'
    else null end;

  update public.price_sync_state set
    status = 'queued', active_sync_id = v_sync_id, last_failed_sync_id = null,
    started_at = v_now, finished_at = null, current_stage = 'price_type_scan',
    sync_mode = p_mode, trigger_kind = p_trigger, source_query_from = v_query_from,
    run_latest_source_period = null, next_skip = 0, page_size = 500,
    pages_processed = 0, rows_scanned = 0, rows_staged = 0,
    price_rows_received = 0, price_unique_keys = 0, price_duplicate_keys = 0,
    price_rows_deduplicated = 0, latest_prices_resolved = 0,
    prices_published = 0, prices_deactivated = 0,
    delta_unchanged = 0, delta_inserted = 0, delta_updated = 0, delta_removed = 0,
    publication_batches = 0, publication_db_duration_ms = 0,
    publication_headroom_percent = 100, publication_warning = false,
    publication_profile = '{}'::jsonb, unmatched_products = 0, unknown_price_types = 0,
    scan_complete = false, error_category = null, failed_stage = null,
    database_error_code = null, safe_error = null, failed_page = null,
    last_page_stage = null, last_page_number = null, last_page_fingerprint = null,
    last_page_first_key = null, last_page_last_key = null, retry_count = 0,
    odata_request_count = 0, odata_request_duration_ms = 0,
    odata_request_durations_ms = '{}'::integer[], staging_duration_ms = 0,
    validation_duration_ms = 0, publication_duration_ms = 0,
    continuation_count = 0, lock_acquired_at = v_now,
    active_chunk_token = null, chunk_started_at = null,
    last_failure_retryable = false, updated_at = v_now
  where id = 'product_prices';

  insert into public.price_sync_run_history(
    run_id, caller, sync_mode, started_at, status, source_query_from
  ) values (v_sync_id, p_trigger, p_mode, v_now, 'queued', v_query_from);

  return jsonb_build_object(
    'result', case when v_stale then 'stale_lock_recovered' else 'acquired' end,
    'syncId', v_sync_id,
    'sourceQueryFrom', v_query_from
  );
end;
$$;

revoke all on function public.start_price_sync_run(text, text)
  from public, anon, authenticated;
grant execute on function public.start_price_sync_run(text, text) to service_role;

create function public.heartbeat_price_sync_scheduler()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state public.price_sync_state%rowtype;
  v_now timestamptz := now();
  v_required boolean;
  v_allowed boolean;
begin
  if auth.role() <> 'service_role' then
    raise exception 'PRICE_SYNC_PERMISSION_DENIED' using errcode = '42501';
  end if;

  update public.price_sync_state set
    last_scheduler_seen_at = v_now,
    expected_next_run_at = v_now + interval '2 minutes'
  where id = 'product_prices'
  returning * into v_state;

  update public.price_sync_domain_freshness freshness set
    freshness_state = case
      when freshness.last_error_code is not null then 'FAILED'
      when freshness.last_source_success_at is null then 'STALE'
      when freshness.last_source_success_at >= v_now - interval '3 hours'
        and (not freshness.publication_required
          or freshness.last_publication_success_at >= v_now - interval '3 hours') then 'FRESH'
      when freshness.last_source_success_at >= v_now - interval '6 hours'
        and (not freshness.publication_required
          or freshness.last_publication_success_at >= v_now - interval '6 hours') then 'DEGRADED'
      else 'STALE'
    end,
    updated_at = v_now;

  v_required := v_state.last_source_success_at is null
    or v_state.last_source_success_at <= v_now - interval '2 hours';
  v_allowed := v_state.status not in ('queued', 'running')
    and (v_state.status <> 'failed' or v_state.last_failure_retryable)
    and (v_state.next_recovery_attempt_at is null
      or v_state.next_recovery_attempt_at <= v_now);

  return jsonb_build_object(
    'recoveryRequired', v_required,
    'recoveryAllowed', v_allowed,
    'schedulerState', 'FRESH'
  );
end;
$$;

revoke all on function public.heartbeat_price_sync_scheduler()
  from public, anon, authenticated;
grant execute on function public.heartbeat_price_sync_scheduler() to service_role;

create function public.fail_price_sync_run(
  p_sync_id uuid,
  p_category text,
  p_stage text,
  p_page integer,
  p_code text,
  p_safe_error text,
  p_retryable boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_attempt integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'PRICE_SYNC_PERMISSION_DENIED' using errcode = '42501';
  end if;

  select recovery_attempt_count into v_attempt
  from public.price_sync_state
  where id = 'product_prices' and active_sync_id = p_sync_id
  for update;
  if not found then return false; end if;

  update public.price_sync_state set
    status = 'failed', finished_at = v_now, error_category = left(p_category, 80),
    failed_stage = left(p_stage, 80), database_error_code = left(p_code, 40),
    safe_error = left(p_safe_error, 500), failed_page = p_page,
    last_failed_sync_id = p_sync_id, active_sync_id = null,
    lock_acquired_at = null, active_chunk_token = null, chunk_started_at = null,
    last_failure_retryable = p_retryable,
    recovery_attempt_count = v_attempt + 1,
    next_recovery_attempt_at = case when p_retryable then v_now + case
      when v_attempt = 0 then interval '5 minutes'
      when v_attempt = 1 then interval '15 minutes'
      else interval '30 minutes' end else null end,
    updated_at = v_now
  where id = 'product_prices' and active_sync_id = p_sync_id;

  update public.price_sync_domain_freshness set
    freshness_state = 'FAILED', last_error_code = coalesce(left(p_code, 40), left(p_category, 80)),
    updated_at = v_now;

  update public.price_sync_run_history history set
    finished_at = v_now, status = 'failed', error_code = coalesce(left(p_code, 40), left(p_category, 80)),
    source_calls = state.odata_request_count, rows_received = state.price_rows_received,
    rows_prepared = state.price_unique_keys, rows_staged = state.rows_staged,
    latest_1c_period_seen = state.run_latest_source_period,
    retry_count = state.retry_count, updated_at = v_now
  from public.price_sync_state state
  where history.run_id = p_sync_id and state.id = 'product_prices';

  return true;
end;
$$;

revoke all on function public.fail_price_sync_run(uuid, text, text, integer, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.fail_price_sync_run(uuid, text, text, integer, text, text, boolean)
  to service_role;

create function public.publish_product_prices_self_healing(p_sync_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode text;
  v_result jsonb;
  v_now timestamptz := now();
  v_generation bigint;
begin
  if auth.role() <> 'service_role' then
    raise exception 'PRICE_SYNC_PERMISSION_DENIED' using errcode = '42501';
  end if;

  select sync_mode, publication_generation + 1
  into v_mode, v_generation
  from public.price_sync_state
  where id = 'product_prices' and active_sync_id = p_sync_id and scan_complete
  for update;
  if not found then
    raise exception 'PRICE_SYNC_NOT_READY' using errcode = '55000';
  end if;

  if v_mode = 'incremental' then
    insert into public.product_price_sync_stage as staged(
      sync_id, external_product_ref, external_price_type_ref,
      external_characteristic_ref, amount, is_current, effective_at,
      currency_code, currency_status
    )
    select p_sync_id, price.external_product_ref, price.external_1c_price_type_id,
      '00000000-0000-0000-0000-000000000000', price.price_amount,
      price.is_active, price.effective_at, price.currency, price.currency_status
    from public.product_prices price
    where price.company_id is null and price.is_published
      and price.external_product_ref is not null
      and not exists (
        select 1 from private.one_c_price_type_domain_registry registry
        where registry.external_ref = lower(price.external_1c_price_type_id)
          and registry.price_domain = 'FINAL_CUSTOMER_RETAIL_PRICE'
      )
    on conflict (sync_id, external_product_ref, external_price_type_ref, external_characteristic_ref)
    do update set
      amount = excluded.amount,
      is_current = excluded.is_current,
      effective_at = excluded.effective_at,
      currency_code = excluded.currency_code,
      currency_status = excluded.currency_status
    where excluded.effective_at > staged.effective_at;
  end if;

  v_result := public.publish_product_prices_with_retail_history(p_sync_id);

  update public.price_sync_state set
    source_watermark = greatest(source_watermark, run_latest_source_period),
    source_inspected_through = v_now,
    last_source_success_at = v_now,
    last_publication_success_at = v_now,
    publication_generation = v_generation,
    next_recovery_attempt_at = null,
    recovery_attempt_count = 0,
    last_failure_retryable = false,
    expected_next_run_at = v_now + interval '2 hours',
    updated_at = v_now
  where id = 'product_prices';

  with scopes(scope, publication_required) as (
    values
      ('PARTNER_CONTRACT_PRICE'::text, true),
      ('FINAL_CUSTOMER_RETAIL_PRICE', false),
      ('INTERNAL/OTHER', true),
      ('MSRP', true),
      ('RETAIL', true)
  ), source_base as (
    select metrics.price_domain scope,
      coalesce(sum(metrics.received_rows), 0)::integer source_row_count,
      max(metrics.latest_source_period) latest_source_period_seen
    from private.price_sync_type_page_metrics metrics
    where metrics.sync_id = p_sync_id
    group by metrics.price_domain
  ), source_special as (
    select case metrics.external_price_type_ref
        when 'd9c92519-658b-11e8-80d3-000c29a58b59' then 'MSRP'
        when 'e181c772-93fc-11e9-94cb-000c2988d323' then 'RETAIL'
      end scope,
      coalesce(sum(metrics.received_rows), 0)::integer source_row_count,
      max(metrics.latest_source_period) latest_source_period_seen
    from private.price_sync_type_page_metrics metrics
    where metrics.sync_id = p_sync_id
      and metrics.external_price_type_ref in (
        'd9c92519-658b-11e8-80d3-000c29a58b59',
        'e181c772-93fc-11e9-94cb-000c2988d323'
      )
    group by metrics.external_price_type_ref
  ), source_scope as (
    select * from source_base union all select * from source_special
  ), published_base as (
    select price_type.price_domain scope, max(price.effective_at) latest_published_period
    from public.product_prices price
    join public.price_types price_type on price_type.id = price.price_type_id
    where price.company_id is null and price.is_published
    group by price_type.price_domain
  ), published_special as (
    select case price.external_1c_price_type_id
        when 'd9c92519-658b-11e8-80d3-000c29a58b59' then 'MSRP'
        when 'e181c772-93fc-11e9-94cb-000c2988d323' then 'RETAIL'
      end scope,
      max(price.effective_at) latest_published_period
    from public.product_prices price
    where price.company_id is null and price.is_published
      and price.external_1c_price_type_id in (
        'd9c92519-658b-11e8-80d3-000c29a58b59',
        'e181c772-93fc-11e9-94cb-000c2988d323'
      )
    group by price.external_1c_price_type_id
  ), published_scope as (
    select * from published_base union all select * from published_special
  )
  insert into public.price_sync_domain_freshness(
    scope, publication_required, last_source_success_at,
    latest_source_period_seen, last_publication_success_at,
    latest_published_period, source_row_count, publication_generation,
    publication_run_id, freshness_state, last_error_code, updated_at
  )
  select scopes.scope, scopes.publication_required, v_now,
    source_scope.latest_source_period_seen,
    case when scopes.publication_required then v_now else null end,
    published_scope.latest_published_period,
    coalesce(source_scope.source_row_count, 0), v_generation,
    p_sync_id, 'FRESH', null, v_now
  from scopes
  left join source_scope on source_scope.scope = scopes.scope
  left join published_scope on published_scope.scope = scopes.scope
  on conflict (scope) do update set
    publication_required = excluded.publication_required,
    last_source_success_at = excluded.last_source_success_at,
    latest_source_period_seen = greatest(
      public.price_sync_domain_freshness.latest_source_period_seen,
      excluded.latest_source_period_seen
    ),
    last_publication_success_at = case
      when excluded.publication_required then excluded.last_publication_success_at
      else public.price_sync_domain_freshness.last_publication_success_at end,
    latest_published_period = excluded.latest_published_period,
    source_row_count = excluded.source_row_count,
    publication_generation = excluded.publication_generation,
    publication_run_id = excluded.publication_run_id,
    freshness_state = 'FRESH', last_error_code = null, updated_at = excluded.updated_at;

  update public.price_sync_run_history history set
    finished_at = state.finished_at, status = 'succeeded',
    source_calls = state.odata_request_count,
    rows_received = state.price_rows_received,
    rows_prepared = state.price_unique_keys,
    rows_staged = state.rows_staged,
    rows_published = state.prices_published,
    latest_1c_period_seen = state.run_latest_source_period,
    latest_published_period = (
      select max(freshness.latest_published_period)
      from public.price_sync_domain_freshness freshness
      where freshness.publication_run_id = p_sync_id
    ),
    retry_count = state.retry_count, updated_at = v_now
  from public.price_sync_state state
  where history.run_id = p_sync_id and state.id = 'product_prices';

  return v_result || jsonb_build_object(
    'syncMode', v_mode,
    'publicationGeneration', v_generation
  );
end;
$$;

revoke all on function public.publish_product_prices_self_healing(uuid)
  from public, anon, authenticated;
grant execute on function public.publish_product_prices_self_healing(uuid)
  to service_role;

create function public.are_price_derived_indicators_fresh()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then return false; end if;
  return not exists (
    select 1
    from (values ('PARTNER_CONTRACT_PRICE'::text), ('RETAIL'::text)) required(scope)
    left join public.price_sync_domain_freshness freshness using (scope)
    where freshness.scope is null
      or freshness.last_error_code is not null
      or freshness.last_source_success_at < now() - interval '3 hours'
      or freshness.last_publication_success_at < now() - interval '3 hours'
  );
end;
$$;

revoke all on function public.are_price_derived_indicators_fresh()
  from public, anon;
grant execute on function public.are_price_derived_indicators_fresh()
  to authenticated;

alter function public.get_admin_integration_center()
  rename to get_admin_integration_center_pre_price_freshness;
revoke all on function public.get_admin_integration_center_pre_price_freshness()
  from public, anon, authenticated, service_role;

create function public.get_admin_integration_center()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_center jsonb;
  v_domains jsonb;
begin
  v_center := public.get_admin_integration_center_pre_price_freshness();
  select coalesce(jsonb_agg(
    case when item.value->>'domain' = 'prices' then
      item.value || jsonb_build_object(
        'pricePublication', coalesce(item.value->'pricePublication', '{}'::jsonb)
          || coalesce((select jsonb_build_object(
            'syncMode', state.sync_mode,
            'triggerKind', state.trigger_kind,
            'schedulerState', case when state.last_scheduler_seen_at is not null
              and state.last_scheduler_seen_at >= now() - interval '5 minutes'
              then 'FRESH' else 'STALE' end,
            'lastSchedulerSeenAt', state.last_scheduler_seen_at,
            'expectedNextRunAt', state.expected_next_run_at,
            'lastSourceSuccessAt', state.last_source_success_at,
            'lastPublicationSuccessAt', state.last_publication_success_at,
            'sourceWatermark', state.source_watermark,
            'sourceQueryFrom', state.source_query_from,
            'sourceInspectedThrough', state.source_inspected_through,
            'retryCount', state.retry_count,
            'domains', coalesce((select jsonb_agg(jsonb_build_object(
              'scope', freshness.scope,
              'state', case
                when freshness.last_error_code is not null then 'FAILED'
                when freshness.last_source_success_at >= now() - interval '3 hours'
                  and (not freshness.publication_required
                    or freshness.last_publication_success_at >= now() - interval '3 hours') then 'FRESH'
                when freshness.last_source_success_at >= now() - interval '6 hours'
                  and (not freshness.publication_required
                    or freshness.last_publication_success_at >= now() - interval '6 hours') then 'DEGRADED'
                else 'STALE' end,
              'lastSourceSuccessAt', freshness.last_source_success_at,
              'latestSourcePeriodSeen', freshness.latest_source_period_seen,
              'lastPublicationSuccessAt', freshness.last_publication_success_at,
              'latestPublishedPeriod', freshness.latest_published_period,
              'sourceRowCount', freshness.source_row_count,
              'publicationRunId', freshness.publication_run_id
            ) order by freshness.scope)
              from public.price_sync_domain_freshness freshness), '[]'::jsonb)
          ) from public.price_sync_state state where state.id = 'product_prices'), '{}'::jsonb)
      )
    else item.value end order by item.ordinality
  ), '[]'::jsonb)
  into v_domains
  from jsonb_array_elements(v_center->'domains') with ordinality as item(value, ordinality);
  return jsonb_set(v_center, '{domains}', v_domains);
end;
$$;

revoke all on function public.get_admin_integration_center()
  from public, anon, authenticated, service_role;
grant execute on function public.get_admin_integration_center() to authenticated;

alter function public.list_admin_operational_issues(timestamptz)
  rename to list_admin_operational_issues_pre_price_freshness;
revoke all on function public.list_admin_operational_issues_pre_price_freshness(timestamptz)
  from public, anon, authenticated;

create function public.list_admin_operational_issues(p_now timestamptz default now())
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_base jsonb;
  v_price_issues jsonb := '[]'::jsonb;
  v_state public.price_sync_state%rowtype;
  v_affected text;
  v_worst text;
begin
  if not (public.has_internal_permission('admin.dashboard.view')
    or public.has_internal_permission('admin.integrations.view')) then
    raise exception 'Operational issue access is not allowed.' using errcode = '42501';
  end if;
  v_base := public.list_admin_operational_issues_pre_price_freshness(p_now);
  select * into v_state from public.price_sync_state where id = 'product_prices';

  if v_state.last_scheduler_seen_at is null
    or v_state.last_scheduler_seen_at < p_now - interval '5 minutes' then
    v_price_issues := v_price_issues || jsonb_build_array(jsonb_build_object(
      'id', 'prices:scheduler-stale', 'domain', 'prices', 'severity', 'HIGH',
      'status', 'ACTIVE', 'healthStatus', 'STALE', 'startedAt', v_state.last_scheduler_seen_at,
      'lastAttemptAt', v_state.last_scheduler_seen_at, 'lastSeenAt', p_now,
      'lastSuccessAt', v_state.last_source_success_at, 'operation', 'price_sync_scheduler',
      'stage', 'scheduler_heartbeat', 'safeErrorCode', 'PRICE_SYNC_SCHEDULER_STALE',
      'safeMessage', 'Планировщик синхронизации цен не подтвердил ожидаемый heartbeat.',
      'runId', v_state.active_sync_id, 'correlationId', v_state.active_sync_id,
      'recoverability', 'AUTOMATIC', 'automaticRetryState', 'SCHEDULED',
      'affectedScope', 'all price domains',
      'currentDataState', 'Последняя подтверждённая публикация остаётся активной.',
      'received', v_state.price_rows_received, 'staged', v_state.rows_staged,
      'published', v_state.prices_published, 'durationMs', null,
      'sourceCalls', v_state.odata_request_count, 'retryCount', v_state.retry_count,
      'technicalCode', null, 'historyHref', '/admin/integrations/jobs?domain=prices',
      'detailHref', '/admin/operations/issues/prices:scheduler-stale'
    ));
  end if;

  select string_agg(scope, ', ' order by scope),
    case when bool_or(state in ('FAILED', 'STALE')) then 'STALE' else 'DEGRADED' end
  into v_affected, v_worst
  from (
    select freshness.scope, case
      when freshness.last_error_code is not null then 'FAILED'
      when freshness.last_source_success_at >= p_now - interval '3 hours'
        and (not freshness.publication_required
          or freshness.last_publication_success_at >= p_now - interval '3 hours') then 'FRESH'
      when freshness.last_source_success_at >= p_now - interval '6 hours'
        and (not freshness.publication_required
          or freshness.last_publication_success_at >= p_now - interval '6 hours') then 'DEGRADED'
      else 'STALE' end state
    from public.price_sync_domain_freshness freshness
  ) evaluated
  where state <> 'FRESH';

  if v_affected is not null then
    v_price_issues := v_price_issues || jsonb_build_array(jsonb_build_object(
      'id', 'prices:freshness', 'domain', 'prices',
      'severity', case when v_worst = 'STALE' then 'HIGH' else 'MEDIUM' end,
      'status', 'ACTIVE', 'healthStatus', v_worst,
      'startedAt', v_state.last_source_success_at, 'lastAttemptAt', v_state.started_at,
      'lastSeenAt', p_now, 'lastSuccessAt', v_state.last_publication_success_at,
      'operation', 'price_source_freshness', 'stage', coalesce(v_state.failed_stage, 'watchdog'),
      'safeErrorCode', case when v_worst = 'STALE' then 'PRICE_SYNC_SOURCE_STALE' else 'PRICE_SYNC_SOURCE_DEGRADED' end,
      'safeMessage', 'Цены требуют подтверждения свежести из 1С.',
      'runId', coalesce(v_state.active_sync_id, v_state.last_failed_sync_id),
      'correlationId', coalesce(v_state.active_sync_id, v_state.last_failed_sync_id),
      'recoverability', case when v_state.last_failure_retryable then 'AUTOMATIC' else 'MANUAL_AVAILABLE' end,
      'automaticRetryState', case when v_state.active_sync_id is not null then 'RUNNING'
        when v_state.last_failure_retryable then 'SCHEDULED' else 'NOT_CONFIGURED' end,
      'affectedScope', v_affected,
      'currentDataState', 'Последние подтверждённые цены остаются активными; производные показатели скрыты до восстановления.',
      'received', v_state.price_rows_received, 'staged', v_state.rows_staged,
      'published', v_state.prices_published, 'durationMs', null,
      'sourceCalls', v_state.odata_request_count, 'retryCount', v_state.retry_count,
      'technicalCode', v_state.database_error_code,
      'historyHref', '/admin/integrations/jobs?domain=prices',
      'detailHref', '/admin/operations/issues/prices:freshness'
    ));
  end if;

  return coalesce(v_base, '[]'::jsonb) || v_price_issues;
end;
$$;

revoke all on function public.list_admin_operational_issues(timestamptz)
  from public, anon;
grant execute on function public.list_admin_operational_issues(timestamptz)
  to authenticated;

comment on table public.price_sync_domain_freshness is
  'Independent source/publication freshness evidence for governed price domains. No commercial price values are stored here.';
comment on function public.start_price_sync_run(text, text) is
  'Atomically acquires one resumable price-sync owner and derives the 48-hour overlap window from the last durably published source watermark.';
comment on function public.publish_product_prices_self_healing(uuid) is
  'Publishes full or overlap-window price input atomically, preserves absent rows during incremental runs, and advances freshness/watermark only after success.';

commit;
