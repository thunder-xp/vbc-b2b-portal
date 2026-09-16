begin;

create or replace function public.heartbeat_price_sync_scheduler()
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
    updated_at = v_now
  where freshness.scope in (
    'PARTNER_CONTRACT_PRICE', 'FINAL_CUSTOMER_RETAIL_PRICE',
    'INTERNAL/OTHER', 'MSRP', 'RETAIL'
  );

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

create or replace function public.fail_price_sync_run(
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

  update public.price_sync_domain_freshness freshness set
    freshness_state = 'FAILED',
    last_error_code = coalesce(left(p_code, 40), left(p_category, 80)),
    updated_at = v_now
  where freshness.scope in (
    'PARTNER_CONTRACT_PRICE', 'FINAL_CUSTOMER_RETAIL_PRICE',
    'INTERNAL/OTHER', 'MSRP', 'RETAIL'
  );

  update public.price_sync_run_history history set
    finished_at = v_now, status = 'failed',
    error_code = coalesce(left(p_code, 40), left(p_category, 80)),
    source_calls = state.odata_request_count,
    rows_received = state.price_rows_received,
    rows_prepared = state.price_unique_keys,
    rows_staged = state.rows_staged,
    latest_1c_period_seen = state.run_latest_source_period,
    retry_count = state.retry_count, updated_at = v_now
  from public.price_sync_state state
  where history.run_id = p_sync_id and state.id = 'product_prices';

  return true;
end;
$$;

revoke all on function public.heartbeat_price_sync_scheduler()
  from public, anon, authenticated;
grant execute on function public.heartbeat_price_sync_scheduler() to service_role;

revoke all on function public.fail_price_sync_run(uuid, text, text, integer, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.fail_price_sync_run(uuid, text, text, integer, text, text, boolean)
  to service_role;

comment on function public.heartbeat_price_sync_scheduler() is
  'Records the scheduler heartbeat, evaluates price-domain freshness, and uses an explicit bounded scope compatible with production safe-update enforcement.';

commit;
