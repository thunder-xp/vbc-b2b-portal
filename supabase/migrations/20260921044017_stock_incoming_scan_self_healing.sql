begin;

alter table public.stock_sync_state
  add column trigger_kind text not null default 'scheduled'
    check (trigger_kind in ('scheduled', 'watchdog', 'manual')),
  add column source_request_count integer not null default 0 check (source_request_count >= 0),
  add column successful_source_calls integer not null default 0 check (successful_source_calls >= 0),
  add column source_normalized_rows integer not null default 0 check (source_normalized_rows >= 0),
  add column stock_source_staged_rows integer not null default 0 check (stock_source_staged_rows >= 0),
  add column incoming_source_staged_rows integer not null default 0 check (incoming_source_staged_rows >= 0),
  add column arrivals_source_staged_rows integer not null default 0 check (arrivals_source_staged_rows >= 0),
  add column retry_count integer not null default 0 check (retry_count >= 0),
  add column recovery_attempt_count integer not null default 0 check (recovery_attempt_count >= 0),
  add column last_failure_retryable boolean not null default false,
  add column next_recovery_attempt_at timestamptz,
  add column last_successful_source_phase text,
  add column technical_error_code text,
  add column failed_request_kind text,
  add column failed_resource_name text,
  add column failed_http_status integer,
  add column last_scheduler_seen_at timestamptz,
  add column expected_next_run_at timestamptz,
  add column physical_stock_last_source_success_at timestamptz,
  add column physical_stock_last_publication_at timestamptz,
  add column arrivals_last_source_success_at timestamptz,
  add column arrivals_last_publication_at timestamptz;

update public.stock_sync_state
set physical_stock_last_source_success_at = coalesce(physical_stock_last_source_success_at, last_successful_sync_at),
    physical_stock_last_publication_at = coalesce(physical_stock_last_publication_at, last_successful_sync_at),
    arrivals_last_source_success_at = coalesce(arrivals_last_source_success_at, last_successful_sync_at),
    arrivals_last_publication_at = coalesce(arrivals_last_publication_at, last_successful_sync_at)
where id = 'exact_stock';

create table public.stock_sync_run_history (
  run_id uuid primary key,
  caller text not null check (caller in ('scheduled', 'watchdog', 'manual')),
  snapshot_time timestamptz not null,
  started_at timestamptz not null,
  finished_at timestamptz,
  status text not null check (status in ('queued', 'running', 'succeeded', 'failed')),
  source_calls integer not null default 0 check (source_calls >= 0),
  successful_source_calls integer not null default 0 check (successful_source_calls >= 0),
  source_normalized_rows integer not null default 0 check (source_normalized_rows >= 0),
  stock_source_staged_rows integer not null default 0 check (stock_source_staged_rows >= 0),
  incoming_source_staged_rows integer not null default 0 check (incoming_source_staged_rows >= 0),
  arrivals_source_staged_rows integer not null default 0 check (arrivals_source_staged_rows >= 0),
  retry_count integer not null default 0 check (retry_count >= 0),
  recovery_attempt_count integer not null default 0 check (recovery_attempt_count >= 0),
  last_successful_source_phase text,
  physical_rows integer not null default 0 check (physical_rows >= 0),
  reserved_rows integer not null default 0 check (reserved_rows >= 0),
  incoming_rows integer not null default 0 check (incoming_rows >= 0),
  supplier_balance_rows integer not null default 0 check (supplier_balance_rows >= 0),
  stock_staged_rows integer not null default 0 check (stock_staged_rows >= 0),
  arrivals_staged_rows integer not null default 0 check (arrivals_staged_rows >= 0),
  rows_published integer not null default 0 check (rows_published >= 0),
  arrivals_published integer not null default 0 check (arrivals_published >= 0),
  technical_error_code text,
  failed_stage text,
  failed_request_kind text,
  failed_resource_name text,
  failed_http_status integer,
  publication_db_ms integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index stock_sync_run_history_started_idx
  on public.stock_sync_run_history(started_at desc);
alter table public.stock_sync_run_history enable row level security;
revoke all on table public.stock_sync_run_history from public, anon, authenticated;
grant select, insert, update, delete on table public.stock_sync_run_history to service_role;

create table public.stock_sync_source_operations (
  id bigint generated always as identity primary key,
  sync_id uuid not null references public.stock_sync_run_history(run_id) on delete cascade,
  request_sequence integer not null check (request_sequence > 0),
  stage text not null,
  request_kind text not null,
  resource_name text not null,
  purpose text not null,
  outcome text not null check (outcome in ('succeeded', 'retryable_failure', 'permanent_failure')),
  http_status integer,
  rows_received integer not null default 0 check (rows_received >= 0),
  duration_ms integer not null default 0 check (duration_ms >= 0),
  retry_index integer not null default 0 check (retry_index >= 0),
  error_code text,
  retryable boolean not null default false,
  created_at timestamptz not null default now(),
  unique (sync_id, request_sequence)
);

create index stock_sync_source_operations_sync_idx
  on public.stock_sync_source_operations(sync_id, request_sequence);
alter table public.stock_sync_source_operations enable row level security;
revoke all on table public.stock_sync_source_operations from public, anon, authenticated;
grant select, insert, update, delete on table public.stock_sync_source_operations to service_role;

create table public.stock_sync_domain_freshness (
  domain text primary key check (domain in ('physical_stock', 'supplier_arrivals')),
  last_source_success_at timestamptz,
  last_publication_success_at timestamptz,
  last_run_id uuid,
  freshness_state text not null default 'STALE' check (freshness_state in ('FRESH', 'DEGRADED', 'STALE', 'FAILED')),
  last_error_code text,
  updated_at timestamptz not null default now()
);

alter table public.stock_sync_domain_freshness enable row level security;
revoke all on table public.stock_sync_domain_freshness from public, anon, authenticated;
grant select, insert, update, delete on table public.stock_sync_domain_freshness to service_role;

insert into public.stock_sync_domain_freshness(
  domain, last_source_success_at, last_publication_success_at, freshness_state
)
select domain, state.last_successful_sync_at, state.last_successful_sync_at,
  case when state.last_successful_sync_at >= now() - interval '26 hours' then 'FRESH' else 'STALE' end
from public.stock_sync_state state
cross join (values ('physical_stock'::text), ('supplier_arrivals'::text)) value(domain)
where state.id = 'exact_stock';

create function public.start_exact_stock_sync(p_trigger text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state public.stock_sync_state%rowtype;
  v_result jsonb;
  v_sync_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Stock synchronization is server-only.' using errcode = '42501';
  end if;
  if p_trigger not in ('scheduled', 'watchdog', 'manual') then
    raise exception 'STOCK_SYNC_TRIGGER_INVALID' using errcode = '22023';
  end if;

  select * into v_state from public.stock_sync_state
  where id = 'exact_stock' for update;

  if v_state.status = 'failed' and v_state.last_failure_retryable
    and v_state.recovery_attempt_count < 4 then
    return jsonb_build_object('result', 'recovery_pending', 'sync_id', v_state.last_failed_sync_id);
  end if;

  v_result := public.start_exact_stock_sync();
  v_sync_id := nullif(v_result->>'sync_id', '')::uuid;
  if v_result->>'result' in ('acquired', 'stale_lock_recovered') and v_sync_id is not null then
    update public.stock_sync_state set
      trigger_kind = p_trigger,
      source_request_count = 0,
      successful_source_calls = 0,
      source_normalized_rows = 0,
      stock_source_staged_rows = 0,
      incoming_source_staged_rows = 0,
      arrivals_source_staged_rows = 0,
      retry_count = 0,
      recovery_attempt_count = 0,
      last_failure_retryable = false,
      next_recovery_attempt_at = null,
      last_successful_source_phase = null,
      technical_error_code = null,
      failed_request_kind = null,
      failed_resource_name = null,
      failed_http_status = null,
      updated_at = now()
    where id = 'exact_stock' and active_sync_id = v_sync_id;

    insert into public.stock_sync_run_history(
      run_id, caller, snapshot_time, started_at, status
    )
    select v_sync_id, p_trigger, snapshot_time, started_at, 'queued'
    from public.stock_sync_state where id = 'exact_stock';
  end if;
  return v_result;
end;
$$;

revoke all on function public.start_exact_stock_sync(text) from public, anon, authenticated;
grant execute on function public.start_exact_stock_sync(text) to service_role;

create function public.record_stock_sync_source_operation(
  p_sync_id uuid,
  p_stage text,
  p_request_kind text,
  p_resource_name text,
  p_purpose text,
  p_outcome text,
  p_http_status integer,
  p_rows_received integer,
  p_duration_ms integer,
  p_retry_index integer,
  p_error_code text,
  p_retryable boolean
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sequence integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Stock synchronization is server-only.' using errcode = '42501';
  end if;
  if p_outcome not in ('succeeded', 'retryable_failure', 'permanent_failure')
    or p_rows_received < 0 or p_duration_ms < 0 or p_retry_index < 0 then
    raise exception 'STOCK_SOURCE_OPERATION_INVALID' using errcode = '22023';
  end if;

  update public.stock_sync_state set
    source_request_count = source_request_count + 1,
    successful_source_calls = successful_source_calls + case when p_outcome = 'succeeded' then 1 else 0 end,
    retry_count = retry_count + case when p_retry_index > 0 then 1 else 0 end,
    updated_at = now()
  where id = 'exact_stock' and active_sync_id = p_sync_id
  returning source_request_count into v_sequence;
  if not found then
    raise exception 'STOCK_SYNC_RUN_NOT_ACTIVE' using errcode = '55000';
  end if;

  insert into public.stock_sync_source_operations(
    sync_id, request_sequence, stage, request_kind, resource_name, purpose,
    outcome, http_status, rows_received, duration_ms, retry_index,
    error_code, retryable
  ) values (
    p_sync_id, v_sequence, left(p_stage, 80), left(p_request_kind, 120),
    left(p_resource_name, 300), left(p_purpose, 120), p_outcome,
    p_http_status, p_rows_received, p_duration_ms, p_retry_index,
    left(p_error_code, 120), p_retryable
  );

  update public.stock_sync_run_history history set
    status = 'running', source_calls = v_sequence,
    successful_source_calls = state.successful_source_calls,
    source_normalized_rows = state.source_normalized_rows,
    stock_source_staged_rows = state.stock_source_staged_rows,
    incoming_source_staged_rows = state.incoming_source_staged_rows,
    arrivals_source_staged_rows = state.arrivals_source_staged_rows,
    retry_count = state.retry_count, updated_at = now()
  from public.stock_sync_state state
  where history.run_id = p_sync_id and state.id = 'exact_stock';
  return v_sequence;
end;
$$;

revoke all on function public.record_stock_sync_source_operation(uuid, text, text, text, text, text, integer, integer, integer, integer, text, boolean)
  from public, anon, authenticated;
grant execute on function public.record_stock_sync_source_operation(uuid, text, text, text, text, text, integer, integer, integer, integer, text, boolean)
  to service_role;

create function public.fail_stock_sync_run(
  p_sync_id uuid,
  p_stage text,
  p_page integer,
  p_category text,
  p_code text,
  p_safe_error text,
  p_retryable boolean,
  p_request_kind text,
  p_resource_name text,
  p_http_status integer,
  p_application_ms integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state public.stock_sync_state%rowtype;
  v_now timestamptz := now();
  v_retryable boolean;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Stock synchronization is server-only.' using errcode = '42501';
  end if;
  select * into v_state from public.stock_sync_state
  where id = 'exact_stock' and active_sync_id = p_sync_id for update;
  if not found then return false; end if;

  v_retryable := p_retryable and v_state.recovery_attempt_count < 3;
  update public.stock_sync_state set
    status = 'failed', last_failed_sync_id = p_sync_id, active_sync_id = null,
    failed_stage = left(p_stage, 80), failed_page = p_page,
    error_category = left(p_category, 80), database_error_code = left(p_code, 80),
    technical_error_code = left(p_code, 120), safe_error = left(p_safe_error, 500),
    failed_request_kind = left(p_request_kind, 120),
    failed_resource_name = left(p_resource_name, 300), failed_http_status = p_http_status,
    publication_application_ms = p_application_ms,
    last_failure_retryable = v_retryable,
    recovery_attempt_count = recovery_attempt_count + 1,
    next_recovery_attempt_at = case when v_retryable then v_now + case
      when recovery_attempt_count = 0 then interval '1 minute'
      when recovery_attempt_count = 1 then interval '5 minutes'
      else interval '15 minutes' end else null end,
    active_chunk_token = null, chunk_started_at = null,
    finished_at = v_now, updated_at = v_now
  where id = 'exact_stock' and active_sync_id = p_sync_id;

  update public.stock_sync_run_history history set
    finished_at = v_now, status = 'failed',
    source_calls = state.source_request_count,
    successful_source_calls = state.successful_source_calls,
    source_normalized_rows = state.source_normalized_rows,
    stock_source_staged_rows = state.stock_source_staged_rows,
    incoming_source_staged_rows = state.incoming_source_staged_rows,
    arrivals_source_staged_rows = state.arrivals_source_staged_rows,
    retry_count = state.retry_count,
    recovery_attempt_count = state.recovery_attempt_count,
    last_successful_source_phase = state.last_successful_source_phase,
    physical_rows = state.physical_rows, reserved_rows = state.reserved_rows,
    incoming_rows = state.incoming_rows,
    supplier_balance_rows = state.supplier_balance_rows,
    stock_staged_rows = state.stock_staged_rows,
    arrivals_staged_rows = state.arrivals_staged_rows,
    rows_published = state.rows_published,
    arrivals_published = state.supplier_arrivals_published,
    technical_error_code = state.technical_error_code,
    failed_stage = state.failed_stage,
    failed_request_kind = state.failed_request_kind,
    failed_resource_name = state.failed_resource_name,
    failed_http_status = state.failed_http_status,
    publication_db_ms = state.publication_db_ms,
    updated_at = v_now
  from public.stock_sync_state state
  where history.run_id = p_sync_id and state.id = 'exact_stock';

  update public.stock_sync_domain_freshness set
    freshness_state = 'FAILED', last_error_code = left(p_code, 120), updated_at = v_now
  where domain = case when p_stage in ('supplier_arrival_balance', 'supplier_order_documents')
    then 'supplier_arrivals' else 'physical_stock' end;
  return true;
end;
$$;

revoke all on function public.fail_stock_sync_run(uuid, text, integer, text, text, text, boolean, text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.fail_stock_sync_run(uuid, text, integer, text, text, text, boolean, text, text, integer, integer)
  to service_role;

create function public.resume_failed_stock_sync()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state public.stock_sync_state%rowtype;
  v_now timestamptz := now();
begin
  if auth.role() <> 'service_role' then
    raise exception 'Stock synchronization is server-only.' using errcode = '42501';
  end if;
  select * into v_state from public.stock_sync_state
  where id = 'exact_stock' for update;
  if v_state.status <> 'failed' or not v_state.last_failure_retryable then
    return jsonb_build_object('result', 'manual_required', 'sync_id', null);
  end if;
  if v_state.next_recovery_attempt_at is not null and v_state.next_recovery_attempt_at > v_now then
    return jsonb_build_object('result', 'backoff', 'sync_id', null);
  end if;
  if v_state.last_failed_sync_id is null then
    return jsonb_build_object('result', 'missing_run', 'sync_id', null);
  end if;

  update public.stock_sync_state set
    status = 'queued', active_sync_id = last_failed_sync_id,
    current_stage = failed_stage, finished_at = null,
    trigger_kind = 'watchdog', active_chunk_token = null,
    chunk_started_at = null, next_recovery_attempt_at = null,
    updated_at = v_now
  where id = 'exact_stock';
  update public.stock_sync_run_history set
    status = 'queued', finished_at = null,
    recovery_attempt_count = v_state.recovery_attempt_count,
    updated_at = v_now
  where run_id = v_state.last_failed_sync_id;
  return jsonb_build_object('result', 'resumed', 'sync_id', v_state.last_failed_sync_id);
end;
$$;

revoke all on function public.resume_failed_stock_sync() from public, anon, authenticated;
grant execute on function public.resume_failed_stock_sync() to service_role;

create function public.heartbeat_stock_sync_scheduler()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state public.stock_sync_state%rowtype;
  v_now timestamptz := now();
  v_required boolean;
  v_allowed boolean;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Stock synchronization is server-only.' using errcode = '42501';
  end if;
  update public.stock_sync_state set
    last_scheduler_seen_at = v_now,
    expected_next_run_at = coalesce(last_successful_sync_at, v_now - interval '26 hours') + interval '25 hours'
  where id = 'exact_stock' returning * into v_state;

  update public.stock_sync_domain_freshness freshness set
    freshness_state = case
      when freshness.last_error_code is not null then 'FAILED'
      when freshness.last_source_success_at >= v_now - interval '26 hours'
        and freshness.last_publication_success_at >= v_now - interval '26 hours' then 'FRESH'
      when freshness.last_source_success_at >= v_now - interval '30 hours'
        and freshness.last_publication_success_at >= v_now - interval '30 hours' then 'DEGRADED'
      else 'STALE' end,
    updated_at = v_now;

  v_required := (v_state.status = 'failed' and v_state.last_failure_retryable)
    or v_state.last_successful_sync_at is null
    or v_state.last_successful_sync_at <= v_now - interval '25 hours';
  v_allowed := v_state.status not in ('queued', 'running')
    and (v_state.status <> 'failed' or v_state.last_failure_retryable)
    and (v_state.next_recovery_attempt_at is null or v_state.next_recovery_attempt_at <= v_now);
  return jsonb_build_object(
    'recoveryRequired', v_required,
    'recoveryAllowed', v_allowed,
    'schedulerState', 'FRESH'
  );
end;
$$;

revoke all on function public.heartbeat_stock_sync_scheduler() from public, anon, authenticated;
grant execute on function public.heartbeat_stock_sync_scheduler() to service_role;

alter function public.publish_exact_stock_snapshot(uuid)
  rename to publish_exact_stock_snapshot_source_recovery_base;

create function public.publish_exact_stock_snapshot(p_sync_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_result jsonb;
  v_now timestamptz := now();
begin
  v_result := public.publish_exact_stock_snapshot_source_recovery_base(p_sync_id);
  update public.stock_sync_state set
    physical_stock_last_source_success_at = v_now,
    physical_stock_last_publication_at = v_now,
    arrivals_last_source_success_at = v_now,
    arrivals_last_publication_at = v_now,
    last_failure_retryable = false,
    next_recovery_attempt_at = null,
    technical_error_code = null,
    failed_request_kind = null,
    failed_resource_name = null,
    failed_http_status = null,
    updated_at = v_now
  where id = 'exact_stock' and last_completed_sync_id = p_sync_id;

  update public.stock_sync_domain_freshness set
    last_source_success_at = v_now,
    last_publication_success_at = v_now,
    last_run_id = p_sync_id,
    freshness_state = 'FRESH', last_error_code = null, updated_at = v_now
  where domain in ('physical_stock', 'supplier_arrivals');

  update public.stock_sync_run_history history set
    finished_at = v_now, status = 'succeeded',
    source_calls = state.source_request_count,
    successful_source_calls = state.successful_source_calls,
    source_normalized_rows = state.source_normalized_rows,
    stock_source_staged_rows = state.stock_source_staged_rows,
    incoming_source_staged_rows = state.incoming_source_staged_rows,
    arrivals_source_staged_rows = state.arrivals_source_staged_rows,
    retry_count = state.retry_count,
    recovery_attempt_count = state.recovery_attempt_count,
    last_successful_source_phase = state.last_successful_source_phase,
    physical_rows = state.physical_rows, reserved_rows = state.reserved_rows,
    incoming_rows = state.incoming_rows,
    supplier_balance_rows = state.supplier_balance_rows,
    stock_staged_rows = state.stock_staged_rows,
    arrivals_staged_rows = state.arrivals_staged_rows,
    rows_published = state.rows_published,
    arrivals_published = state.supplier_arrivals_published,
    publication_db_ms = state.publication_db_ms,
    technical_error_code = null, failed_stage = null,
    failed_request_kind = null, failed_resource_name = null,
    failed_http_status = null, updated_at = v_now
  from public.stock_sync_state state
  where history.run_id = p_sync_id and state.id = 'exact_stock';
  return v_result;
end;
$$;

revoke all on function public.publish_exact_stock_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.publish_exact_stock_snapshot(uuid) to service_role;

alter function public.get_admin_integration_center()
  rename to get_admin_integration_center_pre_stock_self_healing;
revoke all on function public.get_admin_integration_center_pre_stock_self_healing()
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
  v_center := public.get_admin_integration_center_pre_stock_self_healing();
  select coalesce(jsonb_agg(
    case when item.value->>'domain' = 'stock' then
      item.value || jsonb_build_object(
        'stockPublication', coalesce(item.value->'stockPublication', '{}'::jsonb)
          || coalesce((select jsonb_build_object(
            'sourceCalls', state.source_request_count,
            'successfulSourceCalls', state.successful_source_calls,
            'sourceNormalizedRows', state.source_normalized_rows,
            'stockSourceStagedRows', state.stock_source_staged_rows,
            'incomingSourceStagedRows', state.incoming_source_staged_rows,
            'arrivalsSourceStagedRows', state.arrivals_source_staged_rows,
            'retryCount', state.retry_count,
            'recoveryAttemptCount', state.recovery_attempt_count,
            'lastSuccessfulSourcePhase', state.last_successful_source_phase,
            'technicalErrorCode', state.technical_error_code,
            'failedRequestKind', state.failed_request_kind,
            'failedResourceName', state.failed_resource_name,
            'failedHttpStatus', state.failed_http_status,
            'failureRetryable', state.last_failure_retryable,
            'nextRecoveryAttemptAt', state.next_recovery_attempt_at,
            'schedulerState', case when state.last_scheduler_seen_at >= now() - interval '5 minutes' then 'FRESH' else 'STALE' end,
            'lastSchedulerSeenAt', state.last_scheduler_seen_at,
            'expectedNextRunAt', state.expected_next_run_at,
            'recoveryState', case
              when state.status = 'failed' and state.last_failure_retryable then 'AUTOMATIC_RETRY_SCHEDULED'
              when state.status = 'failed' then 'MANUAL_INTERVENTION_REQUIRED'
              when state.status in ('queued', 'running') and state.recovery_attempt_count > 0 then 'AUTOMATIC_RECOVERY_RUNNING'
              else 'LAST_GOOD_PUBLICATION_ACTIVE' end,
            'freshness', coalesce((select jsonb_agg(jsonb_build_object(
              'domain', freshness.domain,
              'state', freshness.freshness_state,
              'lastSourceSuccessAt', freshness.last_source_success_at,
              'lastPublicationSuccessAt', freshness.last_publication_success_at,
              'lastRunId', freshness.last_run_id,
              'lastErrorCode', freshness.last_error_code
            ) order by freshness.domain) from public.stock_sync_domain_freshness freshness), '[]'::jsonb)
          ) from public.stock_sync_state state where state.id = 'exact_stock'), '{}'::jsonb)
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

comment on table public.stock_sync_source_operations is
  'Durable safe metadata for every 1C stock/arrival source attempt, including retries and failures.';
comment on function public.resume_failed_stock_sync() is
  'Resumes a retryable failed stock run from its persisted source checkpoint without deleting staging.';
comment on function public.heartbeat_stock_sync_scheduler() is
  'Records the minute watchdog heartbeat and authorizes bounded recovery only when stock freshness requires it.';

commit;
