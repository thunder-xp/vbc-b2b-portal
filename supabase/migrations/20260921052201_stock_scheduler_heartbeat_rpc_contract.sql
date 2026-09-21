create or replace function public.heartbeat_stock_sync_scheduler()
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
  where id = 'exact_stock'
  returning * into v_state;

  update public.stock_sync_domain_freshness freshness set
    freshness_state = case
      when freshness.last_error_code is not null then 'FAILED'
      when freshness.last_source_success_at >= v_now - interval '26 hours'
        and freshness.last_publication_success_at >= v_now - interval '26 hours' then 'FRESH'
      when freshness.last_source_success_at >= v_now - interval '30 hours'
        and freshness.last_publication_success_at >= v_now - interval '30 hours' then 'DEGRADED'
      else 'STALE' end,
    updated_at = v_now
  where freshness.domain in ('physical_stock', 'supplier_arrivals');

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

create function public.heartbeat_stock_sync_scheduler_v2(p_worker text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Stock synchronization is server-only.' using errcode = '42501';
  end if;
  if p_worker <> 'stock_sync_resume' then
    raise exception 'STOCK_SCHEDULER_WORKER_INVALID' using errcode = '22023';
  end if;
  return public.heartbeat_stock_sync_scheduler();
end;
$$;

revoke all on function public.heartbeat_stock_sync_scheduler_v2(text)
  from public, anon, authenticated;
grant execute on function public.heartbeat_stock_sync_scheduler_v2(text)
  to service_role;
